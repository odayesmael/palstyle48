// ─── Agents Controller ────────────────────────────────────────────────────────
const prisma = require('../lib/prisma')

const AGENT_META = {
  master:    { displayName: 'Maestro',       icon: '🎯', description: 'Main Agent — Controls everything and communicates with Admin', isMaster: true },
  crm:       { displayName: 'Customer Agent',icon: '👥', description: 'Automatically track, analyze, and segment customers' },
  inbox:     { displayName: 'Messaging Agent',icon:'💬', description: 'Reply to and categorize customer messages' },
  content:   { displayName: 'Content Agent', icon: '✍️', description: 'Create, publish, and analyze content' },
  ads:       { displayName: 'Ads Agent',     icon: '📢', description: 'Monitor and optimize ad campaigns' },
  finance:   { displayName: 'Finance Agent', icon: '💰', description: 'Track revenue, expenses, and financial reports' },
  inventory: { displayName: 'Inventory Agent',icon:'📦', description: 'Monitor and sync inventory across platforms' },
}

const MOCK_LOGS = [
  'Scanned 23 incoming messages',
  'Updated data for 5 customers',
  'Sent daily report',
  'Synced Shopify inventory',
  'Analyzed ad performance',
]

/**
 * GET /api/agents
 */
async function getAgents(_req, res) {
  try {
    const dbAgents = await prisma.agentConfig.findMany()
    const map = Object.fromEntries(dbAgents.map(a => [a.name, a]))

    const result = Object.entries(AGENT_META).map(([name, meta]) => ({
      agentName: name,
      ...meta,
      isActive: map[name]?.isActive ?? true,
      automationLevel: map[name]?.automationLevel ?? 'semi',
      settings: map[name]?.settings ?? null,
      recentLogs: MOCK_LOGS.slice(0, 5).map((msg, i) => ({
        id: i,
        message: msg,
        timestamp: new Date(Date.now() - i * 1800000).toISOString(),
      })),
    }))

    return res.json({ success: true, agents: result })
  } catch (err) {
    console.error('[Agents/getAgents]', err)
    return res.status(500).json({ success: false, message: 'خطأ في الخادم' })
  }
}

/**
 * PUT /api/agents/:name
 */
async function updateAgent(req, res) {
  try {
    const { name } = req.params
    const { isActive, automationLevel, settings } = req.body

    const meta = AGENT_META[name] || { displayName: name, description: '' }
    
    // Master agent cannot be deactivated
    if (name === 'master' && isActive === false) {
      return res.status(403).json({ success: false, message: 'لا يمكن إيقاف المايسترو' })
    }

    const updated = await prisma.agentConfig.upsert({
      where: { name: name },
      update: { isActive, automationLevel, settings },
      create: { 
        name: name, 
        displayName: meta.displayName,
        description: meta.description,
        isActive, 
        automationLevel, 
        settings 
      },
    })

    return res.json({ success: true, agent: updated })
  } catch (err) {
    console.error('[Agents/updateAgent]', err)
    return res.status(500).json({ success: false, message: 'خطأ في الخادم' })
  }
}

module.exports = { getAgents, updateAgent }
