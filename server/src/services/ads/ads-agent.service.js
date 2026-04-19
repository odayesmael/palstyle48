// ─── Ads Agent Service ────────────────────────────────────────────────────────
// AI-powered monitoring, analysis, and recommendations for ad campaigns
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

// ─── 1. Hourly ROAS Monitor → alert if ROAS < 2x ─────────────────────────────
async function monitorROAS() {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  yesterday.setHours(0, 0, 0, 0)

  const campaigns = await prisma.adCampaign.findMany({
    where: { status: 'active' },
    include: {
      insights: {
        where: { date: { gte: yesterday } },
        orderBy: { date: 'desc' },
        take: 7,
      },
    },
  })

  const alerts = []

  for (const camp of campaigns) {
    if (!camp.insights.length) continue
    const spend   = camp.insights.reduce((s, i) => s + i.spend, 0)
    const revenue = camp.insights.reduce((s, i) => s + i.revenue, 0)
    if (spend === 0) continue

    const roas = revenue / spend

    if (roas < 2) {
      // Only alert if not already alerted in last 6h
      const existing = await prisma.alert.findFirst({
        where: {
          agentName: 'ads',
          data: { path: ['campaignId'], equals: camp.id },
          createdAt: { gte: new Date(Date.now() - 6 * 60 * 60 * 1000) },
        },
      })
      if (!existing) {
        const alert = await prisma.alert.create({
          data: {
            agentName: 'ads',
            type:      roas < 1 ? 'error' : 'warning',
            title:     `ROAS منخفض — ${camp.name}`,
            message:   `حملة "${camp.name}" على منصة ${camp.platform} لديها ROAS = ${roas.toFixed(2)}x (أقل من 2x). الإنفاق: $${spend.toFixed(2)}، العائد: $${revenue.toFixed(2)}`,
            data:      { campaignId: camp.id, roas, spend, revenue, platform: camp.platform },
            actionUrl: `/ads/campaigns/${camp.id}`,
          },
        })
        alerts.push(alert)
      }
    }
  }

  if (alerts.length) {
    console.log(`[AdsAgent] ROAS Monitor: created ${alerts.length} alerts`)
  }

  await logAgentAction('monitorROAS', `فحص ${campaigns.length} حملة نشطة، ${alerts.length} تنبيه`, { alerts: alerts.length }, 'success')
  return { checked: campaigns.length, alerts: alerts.length }
}

// ─── 2. Daily: Best & Worst Campaign ─────────────────────────────────────────
async function analyzeDailyPerformance() {
  const last7 = new Date()
  last7.setDate(last7.getDate() - 7)

  const campaigns = await prisma.adCampaign.findMany({
    include: {
      insights: {
        where: { date: { gte: last7 } },
      },
    },
  })

  const ranked = campaigns
    .map(camp => {
      const spend   = camp.insights.reduce((s, i) => s + i.spend, 0)
      const revenue = camp.insights.reduce((s, i) => s + i.revenue, 0)
      const conversions = camp.insights.reduce((s, i) => s + i.conversions, 0)
      const roas    = spend > 0 ? revenue / spend : 0
      return { id: camp.id, name: camp.name, platform: camp.platform, spend, revenue, roas, conversions }
    })
    .filter(c => c.spend > 0)
    .sort((a, b) => b.roas - a.roas)

  if (!ranked.length) return { best: null, worst: null }

  const best  = ranked[0]
  const worst = ranked[ranked.length - 1]

  await prisma.alert.create({
    data: {
      agentName: 'ads',
      type:      'info',
      title:     '📊 تقرير الأداء اليومي',
      message:   `أفضل حملة: "${best.name}" (ROAS: ${best.roas.toFixed(2)}x) | أسوأ حملة: "${worst.name}" (ROAS: ${worst.roas.toFixed(2)}x)`,
      data:      { best, worst, totalCampaigns: ranked.length },
    },
  })

  await logAgentAction('analyzeDailyPerformance', 'تحليل أداء الحملات اليومي', { best: best.name, worst: worst.name }, 'success')
  return { best, worst, ranked }
}

// ─── 3. Weekly: Budget Reallocation Suggestions ───────────────────────────────
async function suggestBudgetReallocation() {
  const last30 = new Date()
  last30.setDate(last30.getDate() - 30)

  const campaigns = await prisma.adCampaign.findMany({
    where: { status: 'active' },
    include: {
      insights: { where: { date: { gte: last30 } } },
    },
  })

  if (campaigns.length < 2) return { suggestions: [] }

  const metrics = campaigns.map(camp => {
    const spend   = camp.insights.reduce((s, i) => s + i.spend, 0)
    const revenue = camp.insights.reduce((s, i) => s + i.revenue, 0)
    const roas    = spend > 0 ? revenue / spend : 0
    return { id: camp.id, name: camp.name, platform: camp.platform, budget: camp.budget, spend, revenue, roas }
  }).sort((a, b) => b.roas - a.roas)

  const totalBudget  = metrics.reduce((s, c) => s + c.budget, 0)
  const suggestions  = []

  const topPerformers    = metrics.slice(0, Math.ceil(metrics.length / 2))
  const underPerformers  = metrics.slice(Math.ceil(metrics.length / 2))

  for (const under of underPerformers) {
    if (under.roas < 2 && under.budget > 0) {
      const reduce = Math.round(under.budget * 0.3 * 100) / 100
      suggestions.push({
        type:       'reduce',
        campaignId: under.id,
        campaign:   under.name,
        platform:   under.platform,
        current:    under.budget,
        suggested:  Math.round((under.budget - reduce) * 100) / 100,
        reason:     `ROAS منخفض (${under.roas.toFixed(2)}x) — تقليل الميزانية بنسبة 30%`,
        priority:   'high',
      })
    }
  }

  for (const top of topPerformers) {
    if (top.roas > 3) {
      const increase = Math.round(top.budget * 0.2 * 100) / 100
      suggestions.push({
        type:       'increase',
        campaignId: top.id,
        campaign:   top.name,
        platform:   top.platform,
        current:    top.budget,
        suggested:  Math.round((top.budget + increase) * 100) / 100,
        reason:     `ROAS ممتاز (${top.roas.toFixed(2)}x) — زيادة الميزانية بنسبة 20%`,
        priority:   'medium',
      })
    }
  }

  if (suggestions.length > 0) {
    await prisma.alert.create({
      data: {
        agentName: 'ads',
        type:      'info',
        title:     '💡 اقتراحات إعادة توزيع الميزانية',
        message:   `الإيجنت يقترح ${suggestions.length} تعديل على الميزانيات لتحسين ROAS الإجمالي`,
        data:      { suggestions },
      },
    })
  }

  await logAgentAction('suggestBudgetReallocation', `${suggestions.length} اقتراح ميزانية`, { suggestions: suggestions.length }, 'success')
  return { suggestions }
}

// ─── 4. Lookalike Audience from VIP customers ─────────────────────────────────
async function suggestLookalikeAudiences() {
  const vipCount = await prisma.customer.count({ where: { segment: 'vip' } })

  const suggestions = []

  if (vipCount >= 100) {
    suggestions.push({
      type:        'lookalike',
      source:      'vip_customers',
      size:        vipCount,
      platform:    'meta',
      title:       `Lookalike Audience من ${vipCount} عميل VIP`,
      description: `صدّر قائمة عملاء VIP إلى Meta Ads وأنشئ Lookalike Audience بنسبة 1-3% للوصول لعملاء مشابهين`,
      steps: [
        'اذهب إلى Meta Ads Manager → Audiences',
        'اختر "Create Audience" → "Custom Audience" → "Customer List"',
        'حمّل ملف عملاء VIP (الإيميل + الهاتف)',
        'بعد المعالجة، أنشئ Lookalike بنسبة 1% في نفس البلد',
      ],
      priority: 'high',
    })
  }

  const topSpenders = await prisma.customer.findMany({
    where:   { totalSpent: { gte: 500 } },
    orderBy: { totalSpent: 'desc' },
    take:    5,
    select:  { name: true, totalSpent: true, totalOrders: true },
  })

  if (topSpenders.length > 0) {
    suggestions.push({
      type:        'retargeting',
      platform:    'meta',
      title:       'Retargeting — العملاء غير النشطين',
      description: 'استهدف العملاء الذين اشتروا قبل 60+ يوم بإعلان خاص',
      priority:    'medium',
      topSpenders,
    })
  }

  return { suggestions, vipCount }
}

// ─── 5. A/B Test Tracking ────────────────────────────────────────────────────
async function trackABTests() {
  // Group campaigns with similar names (assume A/B naming: "Campaign Name A" vs "Campaign Name B")
  const campaigns = await prisma.adCampaign.findMany({
    where:   { status: { in: ['active', 'paused'] } },
    include: {
      insights: { orderBy: { date: 'desc' }, take: 7 },
    },
  })

  const tests = []
  const grouped = {}

  for (const camp of campaigns) {
    const baseName = camp.name.replace(/\s*[A-B]$/i, '').trim()
    if (!grouped[baseName]) grouped[baseName] = []
    grouped[baseName].push(camp)
  }

  for (const [baseName, variants] of Object.entries(grouped)) {
    if (variants.length < 2) continue
    const analysis = variants.map(v => {
      const spend   = v.insights.reduce((s, i) => s + i.spend, 0)
      const revenue = v.insights.reduce((s, i) => s + i.revenue, 0)
      const clicks  = v.insights.reduce((s, i) => s + i.clicks, 0)
      const conversions = v.insights.reduce((s, i) => s + i.conversions, 0)
      const roas    = spend > 0 ? revenue / spend : 0
      return { id: v.id, name: v.name, spend, revenue, roas, clicks, conversions }
    })
    const winner = analysis.reduce((best, v) => v.roas > best.roas ? v : best, analysis[0])
    tests.push({ baseName, variants: analysis, winner: winner.name })
  }

  return { tests }
}

// ─── Recommendations aggregator ───────────────────────────────────────────────
async function getRecommendations() {
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000)

  // 1. Collect recent alerts
  const alerts = await prisma.alert.findMany({
    where:   { agentName: 'ads', isRead: false },
    orderBy: { createdAt: 'desc' },
    take:    20,
  })

  // 2. Budget suggestions (fresh)
  const { suggestions: budgetSuggestions } = await suggestBudgetReallocation()

  // 3. Lookalike
  const { suggestions: audienceSuggestions } = await suggestLookalikeAudiences()

  // 4. A/B tests
  const { tests: abTests } = await trackABTests()

  // 5. Platform ROI comparison
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const platformBreakdown = await getPlatformROI(monthStart)

  return {
    alerts,
    budgetSuggestions,
    audienceSuggestions,
    abTests,
    platformBreakdown,
  }
}

// ─── Platform ROI comparison ──────────────────────────────────────────────────
async function getPlatformROI(since) {
  const result = await prisma.$queryRaw`
    SELECT
      ac.platform,
      COALESCE(SUM(ai.spend), 0)       AS spend,
      COALESCE(SUM(ai.revenue), 0)     AS revenue,
      COALESCE(SUM(ai.conversions), 0) AS conversions
    FROM "AdCampaign" ac
    LEFT JOIN "AdInsight" ai ON ai."campaignId" = ac.id AND ai.date >= ${since}
    GROUP BY ac.platform
  `
  return result.map(r => {
    const spend    = parseFloat(r.spend) || 0
    const revenue  = parseFloat(r.revenue) || 0
    const roas     = spend > 0 ? revenue / spend : 0
    return { platform: r.platform, spend, revenue, roas: Math.round(roas * 100) / 100, conversions: parseInt(r.conversions) || 0 }
  })
}

// ─── Internal logger ──────────────────────────────────────────────────────────
async function logAgentAction(action, details, result, status) {
  try {
    const agentConfig = await prisma.agentConfig.findUnique({ where: { name: 'ads' } })
    if (agentConfig) {
      await prisma.agentLog.create({
        data: { agentId: agentConfig.id, action, details, result, status },
      })
    }
  } catch {}
}

module.exports = {
  monitorROAS,
  analyzeDailyPerformance,
  suggestBudgetReallocation,
  suggestLookalikeAudiences,
  trackABTests,
  getRecommendations,
}
