// ─── Inventory Routes ─────────────────────────────────────────────────────────
const express  = require('express')
const router   = express.Router()
const { verifyToken } = require('../middleware/auth.middleware')
const { syncInventory }    = require('../services/inventory/inventory-sync.service')
const { checkStockAlerts, getStockSummary } = require('../services/inventory/stock-alerts.service')
const invAgent = require('../services/inventory/inventory-agent.service')
const prisma   = require('../lib/prisma')           // ✅ shared singleton — no leak
const { memCache } = require('../lib/memCache')

router.use(verifyToken)

const TTL = 30_000 // 30s

// ── GET /api/inventory/summary ────────────────────────────────────────────────
router.get('/summary', async (req, res) => {
  try {
    const data = await memCache.wrap('inventory:summary', TTL, () => getStockSummary())
    res.json({ success: true, data })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ── GET /api/inventory/products ───────────────────────────────────────────────
router.get('/products', async (req, res) => {
  try {
    const { status, platform, search } = req.query

    // Base inventory cached — filters applied in-memory (fast)
    let inventory = await memCache.wrap('inventory:products:all', TTL, () => invAgent.getInventoryWithStatus())

    if (status === 'out')    inventory = inventory.filter(v => v.stockStatus === 'out')
    if (status === 'low')    inventory = inventory.filter(v => v.stockStatus === 'low')
    if (status === 'medium') inventory = inventory.filter(v => v.stockStatus === 'medium')
    if (status === 'good')   inventory = inventory.filter(v => v.stockStatus === 'good')

    if (platform) {
      inventory = inventory.filter(v =>
        v.platforms && Object.keys(v.platforms).includes(platform)
      )
    }

    if (search) {
      const q = search.toLowerCase()
      inventory = inventory.filter(v =>
        v.productName?.toLowerCase().includes(q) ||
        v.sku?.toLowerCase().includes(q)
      )
    }

    res.json({ success: true, data: inventory, total: inventory.length })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ── PATCH /api/inventory/products/:variantId/stock ────────────────────────────
router.patch('/products/:variantId/stock', async (req, res) => {
  try {
    const { stock } = req.body
    if (stock === undefined || stock < 0) {
      return res.status(400).json({ success: false, message: 'Invalid stock value' })
    }
    const updated = await prisma.productVariant.update({
      where: { id: req.params.variantId },
      data:  { stock: parseInt(stock) },
    })
    memCache.invalidate('inventory:') // fresh data after stock change
    res.json({ success: true, data: updated })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ── GET /api/inventory/alerts ─────────────────────────────────────────────────
router.get('/alerts', async (req, res) => {
  try {
    const data = await memCache.wrap('inventory:alerts', TTL, () =>
      prisma.alert.findMany({
        where:   { agentName: 'inventory' },
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

// ── PATCH /api/inventory/alerts/:id/read ─────────────────────────────────────
router.patch('/alerts/:id/read', async (req, res) => {
  try {
    await prisma.alert.update({ where: { id: req.params.id }, data: { isRead: true } })
    memCache.del('inventory:alerts') // only alerts cache needs refresh
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ── GET /api/inventory/recommendations ───────────────────────────────────────
router.get('/recommendations', async (req, res) => {
  try {
    const data = await memCache.wrap('inventory:recommendations', TTL * 10, () => invAgent.getRecommendations()) // 5min — AI recs change slowly
    res.json({ success: true, data })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ── POST /api/inventory/sync ──────────────────────────────────────────────────
router.post('/sync', async (req, res) => {
  try {
    const [syncResult, alertResult] = await Promise.all([
      syncInventory(),
      checkStockAlerts(),
    ])
    memCache.invalidate('inventory:') // clear all inventory caches after sync
    res.json({ success: true, results: { sync: syncResult, alerts: alertResult } })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

module.exports = router
