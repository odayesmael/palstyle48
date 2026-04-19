// ─── Ads Routes ───────────────────────────────────────────────────────────────
const express  = require('express')
const router   = express.Router()
const { verifyToken } = require('../middleware/auth.middleware')
const analytics = require('../services/ads/ads-analytics.service')
const agent     = require('../services/ads/ads-agent.service')
const { syncMetaCampaigns, syncMetaInsights, syncTrendyolAds } = require('../services/ads/ads-sync.service')
const prisma    = require('../lib/prisma')           // ✅ shared singleton — no leak
const { memCache } = require('../lib/memCache')

router.use(verifyToken)

const TTL = 30_000 // 30s

// ─── GET /api/ads/overview ────────────────────────────────────────────────────
router.get('/overview', async (req, res) => {
  try {
    const data = await memCache.wrap('ads:overview', TTL, () => analytics.getOverview())
    res.json({ success: true, data })
  } catch (err) {
    console.error('[AdsRoute] overview error:', err)
    res.status(500).json({ success: false, message: err.message })
  }
})

// ─── GET /api/ads/campaigns ───────────────────────────────────────────────────
router.get('/campaigns', async (req, res) => {
  try {
    const { platform, status } = req.query
    const cacheKey = `ads:campaigns:${platform || 'all'}:${status || 'all'}`
    const data = await memCache.wrap(cacheKey, TTL, () => analytics.getCampaigns({ platform, status }))
    res.json({ success: true, data, total: data.length })
  } catch (err) {
    console.error('[AdsRoute] campaigns error:', err)
    res.status(500).json({ success: false, message: err.message })
  }
})

// ─── GET /api/ads/campaigns/:id ───────────────────────────────────────────────
router.get('/campaigns/:id', async (req, res) => {
  try {
    const data = await memCache.wrap(`ads:campaign:${req.params.id}`, TTL, () => analytics.getCampaignById(req.params.id))
    if (!data) return res.status(404).json({ success: false, message: 'Campaign not found' })
    res.json({ success: true, data })
  } catch (err) {
    console.error('[AdsRoute] campaign detail error:', err)
    res.status(500).json({ success: false, message: err.message })
  }
})

// ─── GET /api/ads/campaigns/:id/insights ─────────────────────────────────────
router.get('/campaigns/:id/insights', async (req, res) => {
  try {
    const data = await memCache.wrap(`ads:insights:${req.params.id}`, TTL, () => analytics.getCampaignInsights(req.params.id))
    res.json({ success: true, data })
  } catch (err) {
    console.error('[AdsRoute] insights error:', err)
    res.status(500).json({ success: false, message: err.message })
  }
})

// ─── GET /api/ads/recommendations ────────────────────────────────────────────
router.get('/recommendations', async (req, res) => {
  try {
    const data = await memCache.wrap('ads:recommendations', TTL * 10, () => agent.getRecommendations()) // 5min — AI recs change slowly
    res.json({ success: true, data })
  } catch (err) {
    console.error('[AdsRoute] recommendations error:', err)
    res.status(500).json({ success: false, message: err.message })
  }
})

// ─── GET /api/ads/alerts ──────────────────────────────────────────────────────
router.get('/alerts', async (req, res) => {
  try {
    const data = await memCache.wrap('ads:alerts', TTL, () =>
      prisma.alert.findMany({
        where:   { agentName: 'ads' },
        orderBy: { createdAt: 'desc' },
        take:    50,
        select:  { id: true, title: true, message: true, severity: true, isRead: true, createdAt: true },
      })
    )
    res.json({ success: true, data })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ─── PATCH /api/ads/alerts/:id/read ──────────────────────────────────────────
router.patch('/alerts/:id/read', async (req, res) => {
  try {
    await prisma.alert.update({ where: { id: req.params.id }, data: { isRead: true } })
    memCache.del('ads:alerts')
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ─── POST /api/ads/sync ───────────────────────────────────────────────────────
router.post('/sync', async (req, res) => {
  try {
    const { platform } = req.body
    const tasks = []

    if (!platform || platform === 'meta') {
      tasks.push(syncMetaCampaigns().then(r => ({ metaCampaigns: r })))
      tasks.push(syncMetaInsights().then(r => ({ metaInsights: r })))
    }
    if (!platform || platform === 'trendyol') {
      tasks.push(syncTrendyolAds().then(r => ({ trendyol: r })))
    }

    const settled = await Promise.allSettled(tasks)
    const results = Object.assign({}, ...settled.filter(s => s.status === 'fulfilled').map(s => s.value))

    memCache.invalidate('ads:') // clear all ads caches after sync
    res.json({ success: true, results })
  } catch (err) {
    console.error('[AdsRoute] sync error:', err)
    res.status(500).json({ success: false, message: err.message })
  }
})

// ─── POST /api/ads/run-agent ──────────────────────────────────────────────────
router.post('/run-agent', async (req, res) => {
  try {
    const [roas, daily, budget] = await Promise.allSettled([
      agent.monitorROAS(),
      agent.analyzeDailyPerformance(),
      agent.suggestBudgetReallocation(),
    ])
    memCache.invalidate('ads:recommendations') // fresh recs after agent run
    res.json({
      success: true,
      results: {
        roas:   roas.value,
        daily:  daily.value,
        budget: budget.value,
      },
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

module.exports = router
