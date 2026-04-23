// ─── Agents Route — Full Agent Management ────────────────────────────────────
const express = require('express')
const router  = express.Router()
const prisma  = require('../lib/prisma')
const { verifyToken } = require('../middleware/auth.middleware')
const { ok, fail }    = require('../utils/apiResponse')
const { memCache }    = require('../lib/memCache')

router.use(verifyToken)

// ── GET /api/agents — all agents with status ──────────────────────────────────
router.get('/', async (_req, res) => {
  try {
    const agents = await memCache.wrap('agents:list', 30_000, async () => {
      const configs = await prisma.agentConfig.findMany({
        orderBy: { name: 'asc' },
        include: {
          logs: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              id: true, action: true, status: true,
              createdAt: true, duration: true,
            },
          },
        },
      })

      return configs.map(agent => ({
        id: agent.id,
        name: agent.name,
        displayName: agent.displayName,
        description: agent.description,
        isActive: agent.isActive,
        automationLevel: agent.automationLevel,
        settings: agent.settings,
        lastRun: agent.logs[0] || null,
        updatedAt: agent.updatedAt,
      }))
    })

    res.json(ok(agents))
  } catch (err) {
    res.status(500).json(fail(err.message))
  }
})

// ── GET /api/agents/status — compact status for all agents ────────────────────
router.get('/status', async (_req, res) => {
  try {
    const configs = await prisma.agentConfig.findMany({
      select: { name: true, isActive: true, automationLevel: true },
    })

    // Get last log for each agent
    const lastLogs = await prisma.agentLog.findMany({
      orderBy: { createdAt: 'desc' },
      distinct: ['agentId'],
      select: {
        agentId: true, status: true, createdAt: true, duration: true,
        agent: { select: { name: true } },
      },
    })

    const logByAgent = {}
    for (const log of lastLogs) {
      logByAgent[log.agent.name] = {
        status: log.status,
        lastRun: log.createdAt,
        duration: log.duration,
      }
    }

    const status = configs.map(c => ({
      name: c.name,
      isActive: c.isActive,
      automationLevel: c.automationLevel,
      ...(logByAgent[c.name] || { status: 'never_run', lastRun: null }),
    }))

    res.json(ok(status))
  } catch (err) {
    res.status(500).json(fail(err.message))
  }
})

// ── PUT /api/agents/:name — update agent config ──────────────────────────────
router.put('/:name', async (req, res) => {
  try {
    const { isActive, automationLevel, settings } = req.body
    const data = {}
    if (isActive !== undefined)        data.isActive = isActive
    if (automationLevel !== undefined) data.automationLevel = automationLevel
    if (settings !== undefined)        data.settings = settings

    const agent = await prisma.agentConfig.update({
      where: { name: req.params.name },
      data,
    })
    memCache.invalidate('agents:')
    res.json(ok(agent))
  } catch (err) {
    res.status(500).json(fail(err.message))
  }
})

// ── POST /api/agents/:name/trigger — manually trigger an agent ───────────────
router.post('/:name/trigger', async (req, res) => {
  try {
    const { name } = req.params
    const config = await prisma.agentConfig.findUnique({ where: { name } })
    if (!config) return res.status(404).json(fail(`Agent '${name}' not found`))
    if (!config.isActive) return res.status(400).json(fail(`Agent '${name}' is disabled`))

    // Create a log entry for the manual trigger
    const log = await prisma.agentLog.create({
      data: {
        agentId: config.id,
        action: 'manual_trigger',
        status: 'success',
        details: `Manual trigger by user`,
        result: { triggered: true, timestamp: new Date().toISOString() },
        duration: 0,
      },
    })

    // Actually trigger the agent based on name
    let result = { triggered: true }
    try {
      switch (name) {
        case 'ads': {
          const { monitorROAS, analyzeDailyPerformance } = require('../services/ads/ads-agent.service')
          const [roas, daily] = await Promise.allSettled([monitorROAS(), analyzeDailyPerformance()])
          result = { roas: roas.value, daily: daily.value }
          break
        }
        case 'inventory': {
          const { suggestReorders } = require('../services/inventory/inventory-agent.service')
          const { checkStockAlerts } = require('../services/inventory/stock-alerts.service')
          const [reorders, alerts] = await Promise.allSettled([suggestReorders(), checkStockAlerts()])
          result = { reorders: reorders.value, alerts: alerts.value }
          break
        }
        case 'finance': {
          const { checkBudgetOverrun, getRecommendations } = require('../services/finance/finance-agent.service')
          const [budget, recs] = await Promise.allSettled([checkBudgetOverrun(), getRecommendations()])
          result = { budget: budget.value, recommendations: recs.value }
          break
        }
        case 'master': {
          result = { message: 'Master agent awaits queries via /api/master/chat' }
          break
        }
        default:
          result = { message: `Agent '${name}' triggered successfully` }
      }
    } catch (agentErr) {
      console.error(`[Agents] trigger ${name} error:`, agentErr.message)
      await prisma.agentLog.update({
        where: { id: log.id },
        data: { status: 'error', details: agentErr.message },
      })
    }

    memCache.invalidate('agents:')
    res.json(ok({ agent: name, ...result }))
  } catch (err) {
    console.error('[Agents] trigger error:', err)
    res.status(500).json(fail(err.message))
  }
})

// ── GET /api/agents/:name/logs — logs for a specific agent ───────────────────
router.get('/:name/logs', async (req, res) => {
  try {
    const { name } = req.params
    const { page = 1, limit = 20 } = req.query

    const config = await prisma.agentConfig.findUnique({ where: { name } })
    if (!config) return res.status(404).json(fail(`Agent '${name}' not found`))

    const skip = (Number(page) - 1) * Number(limit)
    const [logs, total] = await Promise.all([
      prisma.agentLog.findMany({
        where: { agentId: config.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: Number(limit),
      }),
      prisma.agentLog.count({ where: { agentId: config.id } }),
    ])

    res.json({
      success: true,
      data: logs,
      meta: { total, page: Number(page), pages: Math.ceil(total / Number(limit)) },
    })
  } catch (err) {
    res.status(500).json(fail(err.message))
  }
})

// ── GET /api/agents/recommendations — all pending recommendations ────────────
router.get('/recommendations', async (_req, res) => {
  try {
    const alerts = await prisma.alert.findMany({
      where: { isRead: false },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    res.json(ok(alerts))
  } catch (err) {
    res.status(500).json(fail(err.message))
  }
})

// ── POST /api/agents/recommendations/:id/apply — apply a recommendation ──────
router.post('/recommendations/:id/apply', async (req, res) => {
  try {
    const alert = await prisma.alert.update({
      where: { id: req.params.id },
      data: { isRead: true },
    })
    // Log the application
    if (alert.agentName) {
      const config = await prisma.agentConfig.findUnique({ where: { name: alert.agentName } })
      if (config) {
        await prisma.agentLog.create({
          data: {
            agentId: config.id,
            action: 'recommendation_applied',
            status: 'success',
            details: alert.title,
            result: alert.data,
          },
        })
      }
    }
    memCache.invalidate('agents:')
    res.json(ok({ applied: true, alert }))
  } catch (err) {
    res.status(500).json(fail(err.message))
  }
})

// ── POST /api/agents/recommendations/:id/dismiss — dismiss a recommendation ──
router.post('/recommendations/:id/dismiss', async (req, res) => {
  try {
    await prisma.alert.update({
      where: { id: req.params.id },
      data: { isRead: true },
    })
    memCache.invalidate('agents:')
    res.json(ok({ dismissed: true }))
  } catch (err) {
    res.status(500).json(fail(err.message))
  }
})

module.exports = router
