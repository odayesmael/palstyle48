// ─── AdsAgent — AI-powered ad campaign optimization ──────────────────────────
const BaseAgent = require('./BaseAgent')
const prisma    = require('../lib/prisma')

class AdsAgent extends BaseAgent {
  constructor() { super('ads') }

  /**
   * Monitor ROAS and flag underperforming campaigns
   */
  async monitorROAS() {
    return this.execute('roas_monitor', async () => {
      const activeCampaigns = await prisma.adCampaign.findMany({
        where: { status: 'active' },
        include: { insights: { orderBy: { date: 'desc' }, take: 7 } },
      })

      const underperforming = []

      for (const camp of activeCampaigns) {
        const spend   = camp.insights.reduce((s, i) => s + i.spend, 0)
        const revenue = camp.insights.reduce((s, i) => s + i.revenue, 0)
        const roas    = spend > 0 ? revenue / spend : 0

        if (spend > 10 && roas < 1.0) {
          underperforming.push({
            id: camp.id,
            name: camp.name,
            platform: camp.platform,
            spend: Math.round(spend * 100) / 100,
            revenue: Math.round(revenue * 100) / 100,
            roas: Math.round(roas * 100) / 100,
          })
        }
      }

      if (underperforming.length > 0) {
        // Use AI to analyze and recommend
        const analysis = await this.askAI(
          `Analyze these underperforming ad campaigns and provide brief recommendations for each:\n${JSON.stringify(underperforming, null, 2)}`
        )

        await this.createAlert({
          type: 'warning',
          title: `${underperforming.length} campaign(s) underperforming (ROAS < 1.0)`,
          message: analysis,
          data: { campaigns: underperforming },
        })
      }

      return { checked: activeCampaigns.length, underperforming: underperforming.length }
    })
  }

  /**
   * Analyze daily performance across all campaigns
   */
  async analyzeDailyPerformance() {
    return this.execute('daily_analysis', async () => {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      yesterday.setHours(0, 0, 0, 0)
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const insights = await prisma.adInsight.findMany({
        where: { date: { gte: yesterday, lt: today } },
        include: { campaign: { select: { name: true, platform: true } } },
      })

      if (insights.length === 0) return { message: 'No data for yesterday' }

      const totalSpend   = insights.reduce((s, i) => s + i.spend, 0)
      const totalRevenue = insights.reduce((s, i) => s + i.revenue, 0)
      const totalConv    = insights.reduce((s, i) => s + i.conversions, 0)

      return {
        date: yesterday.toISOString().slice(0, 10),
        totalSpend: Math.round(totalSpend * 100) / 100,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        roas: totalSpend > 0 ? Math.round((totalRevenue / totalSpend) * 100) / 100 : 0,
        conversions: totalConv,
        campaignsAnalyzed: insights.length,
      }
    })
  }

  /**
   * Suggest budget reallocation based on performance
   */
  async suggestBudgetReallocation() {
    return this.execute('budget_reallocation', async () => {
      const campaigns = await prisma.adCampaign.findMany({
        where: { status: 'active' },
        include: { insights: { orderBy: { date: 'desc' }, take: 14 } },
      })

      if (campaigns.length < 2) return { message: 'Not enough campaigns to compare' }

      const campData = campaigns.map(c => {
        const spend   = c.insights.reduce((s, i) => s + i.spend, 0)
        const revenue = c.insights.reduce((s, i) => s + i.revenue, 0)
        return {
          name: c.name, platform: c.platform, budget: c.budget,
          spend: Math.round(spend * 100) / 100,
          roas: spend > 0 ? Math.round((revenue / spend) * 100) / 100 : 0,
        }
      })

      const suggestion = await this.askAI(
        `Given these campaign performances over 14 days, suggest specific budget reallocation to maximize ROAS. Be concise.\n${JSON.stringify(campData, null, 2)}`
      )

      await this.createAlert({
        type: 'info',
        title: 'Budget Reallocation Suggestion',
        message: suggestion,
        data: { campaigns: campData },
      })

      return { suggestion, campaigns: campData.length }
    })
  }
}

module.exports = new AdsAgent()
