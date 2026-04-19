// ─── Finance Routes ───────────────────────────────────────────────────────────
const express  = require('express')
const router   = express.Router()
const { verifyToken } = require('../middleware/auth.middleware')
const reports  = require('../services/finance/reports.service')
const expSvc   = require('../services/finance/expense.service')
const agent    = require('../services/finance/finance-agent.service')
const { syncAllRevenue } = require('../services/finance/revenue-sync.service')
const { memCache } = require('../lib/memCache')

router.use(verifyToken)

const TTL = 30_000 // 30s — data feels live but DB hit only once per 30s

// ── Overview ──────────────────────────────────────────────────────────────────
router.get('/overview', async (req, res) => {
  try {
    const data = await memCache.wrap('finance:overview', TTL, () => reports.getOverview())
    res.json({ success: true, data })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// ── Monthly P&L ───────────────────────────────────────────────────────────────
router.get('/pnl', async (req, res) => {
  try {
    const now   = new Date()
    const year  = parseInt(req.query.year  || now.getFullYear())
    const month = parseInt(req.query.month || now.getMonth())
    const data  = await memCache.wrap(`finance:pnl:${year}:${month}`, TTL, () => reports.getMonthlyPnL(year, month))
    res.json({ success: true, data })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// ── Last 6 months ─────────────────────────────────────────────────────────────
router.get('/pnl/history', async (req, res) => {
  try {
    const data = await memCache.wrap('finance:pnl:history', TTL, () => reports.getLast6MonthsPnL())
    res.json({ success: true, data })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// ── Platform P&L ─────────────────────────────────────────────────────────────
router.get('/pnl/platforms', async (req, res) => {
  try {
    const data = await memCache.wrap('finance:pnl:platforms', TTL, () => reports.getPlatformPnL())
    res.json({ success: true, data })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// ── Expense breakdown ─────────────────────────────────────────────────────────
router.get('/expenses/breakdown', async (req, res) => {
  try {
    const now   = new Date()
    const year  = parseInt(req.query.year  || now.getFullYear())
    const month = parseInt(req.query.month || now.getMonth())
    const data  = await memCache.wrap(`finance:breakdown:${year}:${month}`, TTL, () => reports.getExpenseBreakdown(year, month))
    res.json({ success: true, data })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// ── Daily cash flow ───────────────────────────────────────────────────────────
router.get('/cashflow', async (req, res) => {
  try {
    const days = parseInt(req.query.days || 30)
    const data = await memCache.wrap(`finance:cashflow:${days}`, TTL, () => reports.getDailyCashFlow(days))
    res.json({ success: true, data })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// ── Agent recommendations ─────────────────────────────────────────────────────
router.get('/recommendations', async (req, res) => {
  try {
    const data = await memCache.wrap('finance:recs', TTL * 10, () => agent.getRecommendations()) // recs = 5min
    res.json({ success: true, data })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// ── Expenses CRUD (no cache — always fresh) ───────────────────────────────────
router.get('/expenses', async (req, res) => {
  try {
    const data = await expSvc.getExpenses(req.query)
    res.json({ success: true, data, total: data.length })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

router.post('/expenses', async (req, res) => {
  try {
    const data = await expSvc.createExpense(req.body)
    memCache.invalidate('finance:') // invalidate all finance caches
    res.status(201).json({ success: true, data })
  } catch (err) { res.status(400).json({ success: false, message: err.message }) }
})

router.put('/expenses/:id', async (req, res) => {
  try {
    const data = await expSvc.updateExpense(req.params.id, req.body)
    memCache.invalidate('finance:')
    res.json({ success: true, data })
  } catch (err) { res.status(400).json({ success: false, message: err.message }) }
})

router.delete('/expenses/:id', async (req, res) => {
  try {
    await expSvc.deleteExpense(req.params.id)
    memCache.invalidate('finance:')
    res.json({ success: true })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

// ── Manual revenue sync ───────────────────────────────────────────────────────
router.post('/sync', async (req, res) => {
  try {
    const results = await syncAllRevenue()
    memCache.invalidate('finance:')
    memCache.del('dashboard')
    res.json({ success: true, results })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
})

module.exports = router
