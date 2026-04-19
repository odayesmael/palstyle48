// ─── Health Route — DB Connection Check ──────────────────────────────────────
const express = require('express')
const router = express.Router()
const prisma = require('../lib/prisma')

/**
 * GET /api/health
 * اختبار اتصال قاعدة البيانات وإحصائيات بسيطة
 */
router.get('/', async (_req, res) => {
  try {
    // Ping the database
    await prisma.$queryRaw`SELECT 1`

    const [users, platforms, customers, agents] = await Promise.all([
      prisma.user.count(),
      prisma.platform.count(),
      prisma.customer.count(),
      prisma.agentConfig.count(),
    ])

    return res.json({
      status: 'ok',
      database: 'connected',
      project: 'palstyle48 Command Center',
      counts: { users, platforms, customers, agents },
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[Health] DB connection failed:', error.message)
    return res.status(500).json({
      status: 'error',
      database: 'disconnected',
      error: error.message,
      timestamp: new Date().toISOString(),
    })
  }
})

module.exports = router
