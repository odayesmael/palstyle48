// ─── Agents Controller ────────────────────────────────────────────────────────
const prisma = require('../lib/prisma')

const AGENT_META = {
  master:    { displayName: 'المايسترو',       icon: '🎯', description: 'الإيجنت الرئيسي — يتحكم بالكل ويتواصل مع المدير', isMaster: true },
  crm:       { displayName: 'إيجنت العملاء',  icon: '👥', description: 'تتبع وتحليل وتصنيف العملاء تلقائياً' },
  inbox:     { displayName: 'إيجنت الرسائل', icon: '💬', description: 'الرد على رسائل العملاء وتصنيفها' },
  content:   { displayName: 'إيجنت المحتوى', icon: '✍️', description: 'إنشاء ونشر وتحليل المحتوى' },
  ads:       { displayName: 'إيجنت الإعلانات', icon: '📢', description: 'مراقبة وتحسين الحملات الإعلانية' },
  finance:   { displayName: 'إيجنت المالية',  icon: '💰', description: 'تتبع الإيرادات والمصاريف والتقارير المالية' },
  inventory: { displayName: 'إيجنت المخزون', icon: '📦', description: 'مراقبة ومزامنة المخزون بين المنصات' },
}

const MOCK_LOGS = [
  'فحص 23 رسالة واردة',
  'تحديث بيانات 5 عملاء',
  'إرسال تقرير يومي',
  'مزامنة مخزون Shopify',
  'تحليل أداء الإعلانات',
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
