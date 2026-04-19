/**
 * Content Routes — Full content management API
 */

const express = require('express')
const router = express.Router()
const { verifyToken } = require('../middleware/auth.middleware')
const contentSvc   = require('../services/content/content.service')
const publisherSvc = require('../services/content/publisher.service')
const analyticsSvc = require('../services/content/analytics.service')
const agentSvc     = require('../services/content/content-agent.service')
const { memCache } = require('../lib/memCache')

const TTL = 30_000 // 30s

// ── Read ─────────────────────────────────────────────────────────────────────

// GET /api/content — list with filters
router.get('/', verifyToken, async (req, res) => {
  try {
    const { platform, status, type, month, year } = req.query
    const cacheKey = `content:list:${platform || ''}:${status || ''}:${type || ''}:${month || ''}:${year || ''}`
    const data = await memCache.wrap(cacheKey, TTL, () =>
      contentSvc.listContent({
        platform,
        status,
        type,
        month: month !== undefined ? Number(month) : undefined,
        year:  year  !== undefined ? Number(year)  : undefined,
      })
    )
    res.json({ success: true, data })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// GET /api/content/analytics — stats + top posts
router.get('/analytics', verifyToken, async (req, res) => {
  try {
    const [stats, topPosts, insights] = await Promise.all([
      memCache.wrap('content:analytics:stats',    TTL,      () => analyticsSvc.getContentStats()),
      memCache.wrap('content:analytics:top',      TTL,      () => analyticsSvc.getTopPosts(5)),
      memCache.wrap('content:analytics:insights', TTL * 2,  () => analyticsSvc.getAccountInsights()), // insights change slowly
    ])
    res.json({ success: true, stats, topPosts, insights })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// GET /api/content/best-times — best posting hours
router.get('/best-times', verifyToken, async (req, res) => {
  try {
    const data = await memCache.wrap('content:best-times', TTL * 20, () => analyticsSvc.getBestPostingTimes()) // 10min — rarely changes
    res.json({ success: true, data })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ── AI ───────────────────────────────────────────────────────────────────────

// POST /api/content/generate-caption
router.post('/generate-caption', verifyToken, async (req, res) => {
  try {
    const { productName, productDesc, platform = 'instagram', tone = 'عصرية' } = req.body
    if (!productName) return res.status(400).json({ success: false, message: 'اسم المنتج مطلوب' })

    const result = await agentSvc.generateCaption({ productName, productDesc, platform, tone })
    res.json({ success: true, data: result })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// POST /api/content/suggest-ideas
router.post('/suggest-ideas', verifyToken, async (req, res) => {
  try {
    const topPosts = await memCache.wrap('content:analytics:top', TTL, () => analyticsSvc.getTopPosts(10))
    const ideas = await agentSvc.suggestWeeklyIdeas({ topPosts })
    res.json({ success: true, data: ideas })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ── CRUD ─────────────────────────────────────────────────────────────────────

// POST /api/content — create
router.post('/', verifyToken, async (req, res) => {
  try {
    const item = await contentSvc.createContent(req.body)
    memCache.invalidate('content:')
    res.status(201).json({ success: true, data: item })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// PUT /api/content/:id — update
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const item = await contentSvc.updateContent(req.params.id, req.body)
    memCache.invalidate('content:')
    res.json({ success: true, data: item })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// DELETE /api/content/:id
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    await contentSvc.deleteContent(req.params.id)
    memCache.invalidate('content:')
    res.json({ success: true, message: 'تم حذف المحتوى' })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// POST /api/content/:id/publish — publish immediately
router.post('/:id/publish', verifyToken, async (req, res) => {
  try {
    const item = await contentSvc.getContent(req.params.id)
    if (!item) return res.status(404).json({ success: false, message: 'المحتوى غير موجود' })

    const platformPostId = await publisherSvc.publishContent(item)
    await contentSvc.markPublished(item.id, platformPostId)

    memCache.invalidate('content:')
    res.json({ success: true, message: 'تم النشر بنجاح', platformPostId })
  } catch (err) {
    console.error('[Content Route] publish error:', err.message)
    res.status(500).json({ success: false, message: `فشل النشر: ${err.message}` })
  }
})

// POST /api/content/:id/schedule — set scheduled time
router.post('/:id/schedule', verifyToken, async (req, res) => {
  try {
    const { scheduledAt } = req.body
    if (!scheduledAt) return res.status(400).json({ success: false, message: 'وقت الجدولة مطلوب' })

    const item = await contentSvc.updateContent(req.params.id, { scheduledAt, status: 'scheduled' })
    memCache.invalidate('content:')
    res.json({ success: true, data: item, message: 'تمت جدولة المحتوى' })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

module.exports = router
