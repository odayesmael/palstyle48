/**
 * Message Campaigns Routes
 * Broadcast messages to customer segments
 */

const express = require('express')
const router = express.Router()
const prisma = require('../lib/prisma')
const { verifyToken } = require('../middleware/auth.middleware')
const { sendReply } = require('../services/messaging/sender.service')
const { memCache } = require('../lib/memCache')

const TTL = 30_000 // 30s

// POST /api/campaigns — Create new campaign
router.post('/', verifyToken, async (req, res) => {
  try {
    const { name, platform, targetSegment, content, mediaUrl, templateId, scheduledAt } = req.body
    if (!name || !platform || !targetSegment || !content) {
      return res.status(400).json({ success: false, message: 'الحقول المطلوبة ناقصة' })
    }

    const campaign = await prisma.messageCampaign.create({
      data: { name, platform, targetSegment, content, mediaUrl, templateId, scheduledAt: scheduledAt ? new Date(scheduledAt) : null },
    })

    memCache.invalidate('campaigns:')
    res.status(201).json({ success: true, data: campaign })
  } catch (err) {
    console.error('[Campaigns Create]', err)
    res.status(500).json({ success: false, message: 'فشل في إنشاء الحملة' })
  }
})

// GET /api/campaigns — List campaigns
router.get('/', verifyToken, async (req, res) => {
  try {
    const data = await memCache.wrap('campaigns:list', TTL, () =>
      prisma.messageCampaign.findMany({ orderBy: { createdAt: 'desc' } })
    )
    res.json({ success: true, data })
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل في جلب الحملات' })
  }
})

// GET /api/campaigns/:id/stats — Campaign stats
router.get('/:id/stats', verifyToken, async (req, res) => {
  try {
    const campaign = await memCache.wrap(`campaigns:detail:${req.params.id}`, TTL, () =>
      prisma.messageCampaign.findUnique({ where: { id: req.params.id } })
    )
    if (!campaign) return res.status(404).json({ success: false, message: 'الحملة غير موجودة' })

    res.json({
      success: true,
      stats: {
        targeted:     campaign.totalTargeted,
        sent:         campaign.totalSent,
        delivered:    campaign.totalDelivered,
        read:         campaign.totalRead,
        clicked:      campaign.totalClicked,
        deliveryRate: campaign.totalSent > 0 ? ((campaign.totalDelivered / campaign.totalSent) * 100).toFixed(1) : 0,
        readRate:     campaign.totalDelivered > 0 ? ((campaign.totalRead / campaign.totalDelivered) * 100).toFixed(1) : 0,
      },
    })
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل في جلب إحصائيات الحملة' })
  }
})

// POST /api/campaigns/:id/send — Execute campaign
router.post('/:id/send', verifyToken, async (req, res) => {
  try {
    const campaign = await prisma.messageCampaign.findUnique({ where: { id: req.params.id } })
    if (!campaign) return res.status(404).json({ success: false, message: 'الحملة غير موجودة' })
    if (campaign.status === 'sent' || campaign.status === 'sending') {
      return res.status(400).json({ success: false, message: 'الحملة مرسلة أو قيد الإرسال بالفعل' })
    }

    // Get customers matching target segment
    const where = campaign.targetSegment === 'all' ? {} : { segment: campaign.targetSegment }
    const customers = await prisma.customer.findMany({
      where: { ...where, phone: { not: null } },
      select: { id: true, name: true, phone: true, email: true },
    })

    await prisma.messageCampaign.update({
      where: { id: campaign.id },
      data:  { status: 'sending', totalTargeted: customers.length, sentAt: new Date() },
    })

    memCache.invalidate('campaigns:')

    // Respond immediately — don't block on the send loop
    res.json({ success: true, message: `بدأ الإرسال لـ ${customers.length} عميل`, targeted: customers.length })

    // Send with rate limiting (100ms between each = 10/sec max)
    let sent = 0
    for (const customer of customers) {
      try {
        await sendReply({
          response:     campaign.content,
          platform:     campaign.platform,
          senderHandle: customer.phone || customer.email,
          phone:        customer.phone,
        })
        sent++
        await new Promise(r => setTimeout(r, 100))
      } catch (err) {
        console.error(`[Campaign] Failed to send to ${customer.name}:`, err.message)
      }
    }

    await prisma.messageCampaign.update({
      where: { id: campaign.id },
      data:  { status: 'sent', totalSent: sent },
    })

    memCache.invalidate('campaigns:') // refresh after send completes
  } catch (err) {
    console.error('[Campaigns Send]', err)
    await prisma.messageCampaign.update({ where: { id: req.params.id }, data: { status: 'failed' } }).catch(() => {})
  }
})

module.exports = router
