const express = require('express')
const router = express.Router()
const { verifyToken } = require('../middleware/auth.middleware')
const { processChat } = require('../services/agents/master-agent.service')
const { getPrioritizedAlerts, markAllRead } = require('../services/agents/alert-manager.js')
const { memCache } = require('../lib/memCache')

router.use(verifyToken)

// ── Chat with Maestro ──────────────────────────────────────────────────────────
router.post('/chat', async (req, res) => {
  try {
    const { message } = req.body
    if (!message) return res.status(400).json({ success: false, message: 'Message is required' })

    // Simulate thinking delay for UX
    await new Promise(r => setTimeout(r, 600))

    const response = await processChat(message)
    res.json({ success: true, data: response })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ── Get grouped alerts ─────────────────────────────────────────────────────────
router.get('/alerts', async (req, res) => {
  res.set('Cache-Control', 'private, max-age=30, stale-while-revalidate=60')
  try {
    const data = await memCache.wrap('master:alerts', 30_000, () => getPrioritizedAlerts())
    res.json({ success: true, data })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// ── Mark alerts read ───────────────────────────────────────────────────────────
router.post('/alerts/read', async (req, res) => {
  try {
    await markAllRead()
    memCache.del('master:alerts') // fresh state after marking read
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

module.exports = router
