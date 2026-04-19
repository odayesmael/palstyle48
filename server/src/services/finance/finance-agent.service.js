// ─── Finance Agent Service ────────────────────────────────────────────────────
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()
const { getMonthlyPnL, getLast6MonthsPnL, getPlatformPnL, getExpenseBreakdown } = require('./reports.service')

// ── 1. Budget overrun alert (compare to last month) ──────────────────────────
async function checkBudgetOverrun() {
  const now   = new Date()
  const curr  = await getMonthlyPnL(now.getFullYear(), now.getMonth())
  const prev  = await getMonthlyPnL(now.getFullYear(), now.getMonth() - 1 < 0 ? 11 : now.getMonth() - 1)

  const alerts = []

  if (prev.expenses > 0) {
    const change = ((curr.expenses - prev.expenses) / prev.expenses) * 100
    if (change > 20) {
      const existing = await prisma.alert.findFirst({
        where: { agentName: 'finance', title: { contains: 'تجاوز ميزانية' }, createdAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) } },
      })
      if (!existing) {
        const a = await prisma.alert.create({
          data: {
            agentName: 'finance',
            type: 'warning',
            title: '⚠️ تجاوز ميزانية المصاريف',
            message: `مصاريف هذا الشهر ارتفعت ${change.toFixed(1)}% مقارنة بالشهر الماضي ($${curr.expenses.toFixed(0)} مقابل $${prev.expenses.toFixed(0)})`,
            data: { currentExpenses: curr.expenses, prevExpenses: prev.expenses, change },
          },
        })
        alerts.push(a)
      }
    }
  }

  if (curr.profit < 0) {
    const existing = await prisma.alert.findFirst({
      where: { agentName: 'finance', title: { contains: 'خسارة' }, createdAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) } },
    })
    if (!existing) {
      const a = await prisma.alert.create({
        data: {
          agentName: 'finance',
          type: 'error',
          title: '🔴 الشهر في خسارة',
          message: `صافي الربح هذا الشهر: -$${Math.abs(curr.profit).toFixed(0)}. الإيرادات ($${curr.revenue.toFixed(0)}) أقل من المصاريف ($${curr.expenses.toFixed(0)})`,
          data: curr,
        },
      })
      alerts.push(a)
    }
  }

  await logAction('checkBudgetOverrun', `${alerts.length} تنبيهات ميزانية`, { alerts: alerts.length }, 'success')
  return { alerts: alerts.length }
}

// ── 2. Monthly report (auto-generated on 1st of month) ───────────────────────
async function generateMonthlyReport() {
  const now  = new Date()
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const pnl  = await getMonthlyPnL(prev.getFullYear(), prev.getMonth())
  const platforms = await getPlatformPnL()

  const monthName = prev.toLocaleDateString('ar-SA', { month: 'long', year: 'numeric' })
  const status    = pnl.profit >= 0 ? '✅ ربح' : '❌ خسارة'

  await prisma.alert.create({
    data: {
      agentName: 'finance',
      type: pnl.profit >= 0 ? 'success' : 'error',
      title: `📊 تقرير ${monthName} — ${status}`,
      message: `إيرادات: $${pnl.revenue.toFixed(0)} | مصاريف: $${pnl.expenses.toFixed(0)} | صافي: ${pnl.profit >= 0 ? '+' : ''}$${pnl.profit.toFixed(0)} | هامش: ${pnl.margin.toFixed(1)}%`,
      data: { pnl, platforms },
    },
  })

  await logAction('generateMonthlyReport', `تقرير ${monthName}`, pnl, 'success')
  return pnl
}

// ── 3. Expense reduction suggestions ─────────────────────────────────────────
async function suggestCostReductions() {
  const now   = new Date()
  const breakdown = await getExpenseBreakdown(now.getFullYear(), now.getMonth())
  const suggestions = []

  for (const item of breakdown) {
    if (item.category === 'ads' && item.pct > 40) {
      suggestions.push({
        category: 'ads',
        title: 'مصاريف الإعلانات مرتفعة',
        detail: `الإعلانات تمثل ${item.pct}% من المصاريف ($${item.amount.toFixed(0)}). راجع حملات ذات ROAS منخفض`,
        priority: 'high',
      })
    }
    if (item.category === 'shipping' && item.pct > 25) {
      suggestions.push({
        category: 'shipping',
        title: 'مصاريف الشحن مرتفعة',
        detail: `الشحن ${item.pct}% من المصاريف. فكّر في التفاوض مع شركة شحن أو رفع الحد الأدنى للشحن المجاني`,
        priority: 'medium',
      })
    }
  }

  await logAction('suggestCostReductions', `${suggestions.length} اقتراح`, { suggestions: suggestions.length }, 'success')
  return { suggestions, breakdown }
}

// ── 4. Best sales channel by ROI ─────────────────────────────────────────────
async function analyzePlatformROI() {
  const platforms = await getPlatformPnL()
  const sorted = [...platforms].sort((a, b) => b.roi - a.roi)
  const best   = sorted[0]
  const worst  = sorted[sorted.length - 1]

  if (best && worst && sorted.length > 1) {
    await prisma.alert.create({
      data: {
        agentName: 'finance',
        type: 'info',
        title: '📈 تحليل ROI حسب المنصة',
        message: `أفضل منصة ROI: ${best.platform} (${best.roi.toFixed(0)}%) | أضعف: ${worst.platform} (${worst.roi.toFixed(0)}%)`,
        data: { platforms: sorted },
      },
    }).catch(() => {})
  }

  return { platforms: sorted }
}

// ── Aggregated recommendations ────────────────────────────────────────────────
async function getRecommendations() {
  const [budget, costs, roi] = await Promise.allSettled([
    checkBudgetOverrun(),
    suggestCostReductions(),
    analyzePlatformROI(),
  ])

  const alerts = await prisma.alert.findMany({
    where: { agentName: 'finance', isRead: false },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })

  return {
    alerts,
    budgetCheck:   budget.value,
    costSuggestions: costs.value?.suggestions || [],
    expenseBreakdown: costs.value?.breakdown  || [],
    platformROI:   roi.value?.platforms       || [],
  }
}

async function logAction(action, details, result, status) {
  try {
    const agent = await prisma.agentConfig.findUnique({ where: { name: 'finance' } })
    if (agent) {
      await prisma.agentLog.create({ data: { agentId: agent.id, action, details, result, status } })
    }
  } catch {}
}

module.exports = { checkBudgetOverrun, generateMonthlyReport, suggestCostReductions, analyzePlatformROI, getRecommendations }
