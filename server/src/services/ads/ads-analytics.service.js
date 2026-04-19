// ─── Ads Analytics Service ────────────────────────────────────────────────────
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

// ─── Overview (total spend, ROAS, conversions, CPA) ─────────────────────────
async function getOverview() {
  const now         = new Date()
  const monthStart  = new Date(now.getFullYear(), now.getMonth(), 1)
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const prevMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0)

  // Current month insights
  const currentInsights = await prisma.adInsight.aggregate({
    where: { date: { gte: monthStart } },
    _sum:  { spend: true, revenue: true, conversions: true, impressions: true, clicks: true },
  })

  // Previous month
  const prevInsights = await prisma.adInsight.aggregate({
    where: { date: { gte: prevMonthStart, lte: prevMonthEnd } },
    _sum:  { spend: true, revenue: true },
  })

  const spend       = currentInsights._sum.spend || 0
  const revenue     = currentInsights._sum.revenue || 0
  const conversions = currentInsights._sum.conversions || 0
  const impressions = currentInsights._sum.impressions || 0
  const clicks      = currentInsights._sum.clicks || 0
  const roas        = spend > 0 ? revenue / spend : 0
  const cpa         = conversions > 0 ? spend / conversions : 0
  const ctr         = impressions > 0 ? (clicks / impressions) * 100 : 0

  const prevSpend   = prevInsights._sum.spend || 0
  const spendTrend  = prevSpend > 0 ? ((spend - prevSpend) / prevSpend) * 100 : 0

  // Platform breakdown
  const platformBreakdown = await getPlatformBreakdown(monthStart)

  return {
    spend,
    roas: Math.round(roas * 100) / 100,
    conversions,
    cpa:  Math.round(cpa * 100) / 100,
    ctr:  Math.round(ctr * 100) / 100,
    impressions,
    clicks,
    spendTrend: Math.round(spendTrend * 10) / 10,
    platformBreakdown,
  }
}

// ─── Platform breakdown (Meta vs Trendyol) ───────────────────────────────────
async function getPlatformBreakdown(since) {
  const result = await prisma.$queryRaw`
    SELECT
      ac.platform,
      COALESCE(SUM(ai.spend), 0)       AS spend,
      COALESCE(SUM(ai.revenue), 0)     AS revenue,
      COALESCE(SUM(ai.conversions), 0) AS conversions,
      COALESCE(SUM(ai.clicks), 0)      AS clicks,
      COALESCE(SUM(ai.impressions), 0) AS impressions
    FROM "AdCampaign" ac
    LEFT JOIN "AdInsight" ai ON ai."campaignId" = ac.id
      AND ai.date >= ${since}
    GROUP BY ac.platform
  `

  return result.map(r => {
    const spend    = parseFloat(r.spend) || 0
    const revenue  = parseFloat(r.revenue) || 0
    const roas     = spend > 0 ? revenue / spend : 0
    const conversions = parseInt(r.conversions) || 0
    const cpa      = conversions > 0 ? spend / conversions : 0
    return {
      platform:    r.platform,
      spend:       Math.round(spend * 100) / 100,
      revenue:     Math.round(revenue * 100) / 100,
      roas:        Math.round(roas * 100) / 100,
      conversions,
      clicks:      parseInt(r.clicks) || 0,
      impressions: parseInt(r.impressions) || 0,
      cpa:         Math.round(cpa * 100) / 100,
    }
  })
}

// ─── All Campaigns with aggregated insights ───────────────────────────────────
async function getCampaigns(filters = {}) {
  const where = {}
  if (filters.platform) where.platform = filters.platform
  if (filters.status)   where.status   = filters.status

  const campaigns = await prisma.adCampaign.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    include: {
      insights: {
        orderBy: { date: 'desc' },
        take: 30,
      },
    },
  })

  return campaigns.map(camp => {
    const spend       = camp.insights.reduce((s, i) => s + i.spend, 0)
    const revenue     = camp.insights.reduce((s, i) => s + i.revenue, 0)
    const conversions = camp.insights.reduce((s, i) => s + i.conversions, 0)
    const roas        = spend > 0 ? revenue / spend : 0
    const cpa         = conversions > 0 ? spend / conversions : 0
    return {
      id:           camp.id,
      platform:     camp.platform,
      platformCampId: camp.platformCampId,
      name:         camp.name,
      status:       camp.status,
      objective:    camp.objective,
      budget:       camp.budget,
      budgetType:   camp.budgetType,
      currency:     camp.currency,
      startDate:    camp.startDate,
      endDate:      camp.endDate,
      spend:        Math.round(spend * 100) / 100,
      revenue:      Math.round(revenue * 100) / 100,
      roas:         Math.round(roas * 100) / 100,
      conversions,
      cpa:          Math.round(cpa * 100) / 100,
      updatedAt:    camp.updatedAt,
    }
  })
}

// ─── Single campaign details ──────────────────────────────────────────────────
async function getCampaignById(id) {
  const camp = await prisma.adCampaign.findUnique({
    where: { id },
    include: {
      insights: {
        orderBy: { date: 'asc' },
        take: 30,
      },
    },
  })
  if (!camp) return null

  const spend       = camp.insights.reduce((s, i) => s + i.spend, 0)
  const revenue     = camp.insights.reduce((s, i) => s + i.revenue, 0)
  const conversions = camp.insights.reduce((s, i) => s + i.conversions, 0)
  const clicks      = camp.insights.reduce((s, i) => s + i.clicks, 0)
  const impressions = camp.insights.reduce((s, i) => s + i.impressions, 0)
  const roas        = spend > 0 ? revenue / spend : 0
  const cpa         = conversions > 0 ? spend / conversions : 0
  const ctr         = impressions > 0 ? (clicks / impressions) * 100 : 0

  return {
    ...camp,
    aggregated: {
      spend:       Math.round(spend * 100) / 100,
      revenue:     Math.round(revenue * 100) / 100,
      roas:        Math.round(roas * 100) / 100,
      conversions,
      cpa:         Math.round(cpa * 100) / 100,
      clicks,
      impressions,
      ctr:         Math.round(ctr * 100) / 100,
    },
    dailyInsights: camp.insights.map(i => ({
      date:        i.date,
      spend:       i.spend,
      revenue:     i.revenue,
      roas:        i.roas || 0,
      conversions: i.conversions,
      clicks:      i.clicks,
      impressions: i.impressions,
      ctr:         i.ctr || 0,
      cpa:         i.cpa || 0,
    })),
  }
}

// ─── Campaign insights (30 days) ─────────────────────────────────────────────
async function getCampaignInsights(campaignId) {
  const insights = await prisma.adInsight.findMany({
    where: { campaignId },
    orderBy: { date: 'asc' },
    take: 30,
  })
  return insights
}

module.exports = { getOverview, getCampaigns, getCampaignById, getCampaignInsights, getPlatformBreakdown }
