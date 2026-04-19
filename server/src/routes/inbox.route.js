/**
 * Inbox Routes — Unified Message Management
 */

const express = require('express')
const router = express.Router()
const prisma = require('../lib/prisma')
const { verifyToken } = require('../middleware/auth.middleware')
const { sendReply } = require('../services/messaging/sender.service')
const { memCache } = require('../lib/memCache')

const TTL = 30_000 // 30s

// GET /api/inbox/stats — unread counts per platform
router.get('/stats', verifyToken, async (_req, res) => {
  try {
    const stats = await memCache.wrap('inbox:stats', TTL, async () => {
      const [totalUnread, byPlatform, byIntent] = await Promise.all([
        prisma.message.count({ where: { status: 'unread', direction: 'inbound' } }),
        prisma.message.groupBy({
          by: ['platform'],
          where: { status: 'unread', direction: 'inbound' },
          _count: true,
        }),
        prisma.message.groupBy({
          by: ['intent'],
          where: { direction: 'inbound' },
          _count: true,
        }),
      ])
      return {
        totalUnread,
        byPlatform: byPlatform.reduce((acc, p) => { acc[p.platform] = p._count; return acc }, {}),
        byIntent:   byIntent.reduce((acc, p) => { acc[p.intent || 'unclassified'] = p._count; return acc }, {}),
      }
    })
    res.json({ success: true, stats })
  } catch (err) {
    console.error('[Inbox Stats Error]', err)
    res.status(500).json({ success: false, message: 'فشل في جلب الإحصائيات' })
  }
})

// GET /api/inbox — fetch messages with filters
router.get('/', verifyToken, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 30,
      platform = 'all',
      status = 'all',
      intent = 'all',
      direction = 'inbound',
    } = req.query

    const cacheKey = `inbox:list:${page}:${limit}:${platform}:${status}:${intent}:${direction}`
    const result = await memCache.wrap(cacheKey, TTL, async () => {
      const where = { direction }
      if (platform !== 'all') where.platform = platform
      if (status   !== 'all') where.status   = status
      if (intent   !== 'all') where.intent   = intent

      const skip = (Number(page) - 1) * Number(limit)
      const [messages, total] = await Promise.all([
        prisma.message.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: Number(limit),
          include: { customer: { select: { id: true, name: true, segment: true, source: true } } },
        }),
        prisma.message.count({ where }),
      ])
      return {
        data: messages,
        pagination: { total, page: Number(page), pages: Math.ceil(total / Number(limit)) },
      }
    })

    res.json({ success: true, ...result })
  } catch (err) {
    console.error('[Inbox Fetch Error]', err)
    res.status(500).json({ success: false, message: 'فشل في جلب الرسائل' })
  }
})

// GET /api/inbox/:id — get single message
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const message = await prisma.message.findUnique({
      where: { id: req.params.id },
      include: { customer: true },
    })
    if (!message) return res.status(404).json({ success: false, message: 'الرسالة غير موجودة' })

    // Mark as read + invalidate stats cache
    if (message.status === 'unread') {
      await prisma.message.update({ where: { id: message.id }, data: { status: 'read' } })
      memCache.del('inbox:stats')
      memCache.invalidate(`inbox:list:`)
    }

    res.json({ success: true, data: message })
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل في جلب الرسالة' })
  }
})

// POST /api/inbox/:id/reply — send manual reply
router.post('/:id/reply', verifyToken, async (req, res) => {
  try {
    const { response } = req.body
    if (!response) return res.status(400).json({ success: false, message: 'نص الرد مطلوب' })

    const message = await prisma.message.findUnique({ where: { id: req.params.id } })
    if (!message) return res.status(404).json({ success: false, message: 'الرسالة غير موجودة' })

    const result = await sendReply({
      messageId:    message.id,
      response,
      platform:     message.platform,
      threadId:     message.threadId,
      senderHandle: message.senderHandle,
      senderId:     message.senderHandle,
    })

    await prisma.message.update({
      where: { id: message.id },
      data:  { status: 'replied', repliedAt: new Date(), agentResponse: response },
    })

    memCache.invalidate('inbox:') // fresh state after reply
    res.json({ success: true, sent: result.success, message: 'تم إرسال الرد' })
  } catch (err) {
    console.error('[Inbox Reply Error]', err)
    res.status(500).json({ success: false, message: 'فشل في إرسال الرد' })
  }
})

// POST /api/inbox/:id/approve — approve AI-suggested reply
router.post('/:id/approve', verifyToken, async (req, res) => {
  try {
    const message = await prisma.message.findUnique({ where: { id: req.params.id } })
    if (!message) return res.status(404).json({ success: false, message: 'الرسالة غير موجودة' })
    if (!message.agentResponse) return res.status(400).json({ success: false, message: 'لا يوجد رد مقترح للموافقة' })

    await sendReply({
      messageId:    message.id,
      response:     message.agentResponse,
      platform:     message.platform,
      threadId:     message.threadId,
      senderHandle: message.senderHandle,
      senderId:     message.senderHandle,
    })

    await prisma.message.update({
      where: { id: message.id },
      data:  { status: 'replied', repliedAt: new Date(), agentApproved: true },
    })

    memCache.invalidate('inbox:')
    res.json({ success: true, message: 'تمت الموافقة وإرسال الرد بنجاح' })
  } catch (err) {
    console.error('[Inbox Approve Error]', err)
    res.status(500).json({ success: false, message: 'فشل في الموافقة على الرد' })
  }
})

// PUT /api/inbox/:id/status — update message status
router.put('/:id/status', verifyToken, async (req, res) => {
  try {
    const { status } = req.body
    const allowed = ['read', 'unread', 'replied', 'archived']
    if (!allowed.includes(status)) return res.status(400).json({ success: false, message: 'حالة غير صالحة' })

    await prisma.message.update({ where: { id: req.params.id }, data: { status } })
    memCache.invalidate('inbox:')
    res.json({ success: true, message: 'تم تحديث حالة الرسالة' })
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل في تحديث الحالة' })
  }
})

module.exports = router
