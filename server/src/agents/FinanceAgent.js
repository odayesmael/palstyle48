// ─── FinanceAgent — AI-powered financial analysis ────────────────────────────
const BaseAgent = require('./BaseAgent')
const prisma    = require('../lib/prisma')

class FinanceAgent extends BaseAgent {
  constructor() { super('finance') }

  /**
   * Check for budget overruns in ad spending
   */
  async checkBudgetOverrun() {
    return this.execute('budget_overrun_check', async () => {
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

      const totalSpend = await prisma.adInsight.aggregate({
        _sum: { spend: true },
        where: { date: { gte: monthStart } },
      })

      const totalExpenses = await prisma.expense.aggregate({
        _sum: { amount: true },
        where: { date: { gte: monthStart } },
      })

      const spend    = totalSpend._sum.spend || 0
      const expenses = totalExpenses._sum.amount || 0
      const totalCost = spend + expenses

      // Get monthly budget from settings
      const setting = await prisma.systemSetting.findUnique({ where: { key: 'monthly_budget' } })
      const budget = setting?.value?.amount || 0

      if (budget > 0 && totalCost > budget * 0.9) {
        const pct = Math.round((totalCost / budget) * 100)
        await this.createAlert({
          type: totalCost > budget ? 'error' : 'warning',
          title: `Budget at ${pct}% (${totalCost.toFixed(0)} / ${budget.toFixed(0)})`,
          message: `Ad spend: ${spend.toFixed(2)}, Other expenses: ${expenses.toFixed(2)}`,
          data: { spend, expenses, totalCost, budget, percentage: pct },
        })
      }

      return { spend, expenses, totalCost, budget }
    })
  }

  /**
   * Generate P&L summary for the current month
   */
  async generatePLSummary() {
    return this.execute('pl_summary', async () => {
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

      const [revenue, expenses, adSpend] = await Promise.all([
        prisma.revenue.aggregate({
          _sum: { amount: true },
          where: { date: { gte: monthStart } },
        }),
        prisma.expense.aggregate({
          _sum: { amount: true },
          where: { date: { gte: monthStart } },
        }),
        prisma.adInsight.aggregate({
          _sum: { spend: true },
          where: { date: { gte: monthStart } },
        }),
      ])

      const totalRevenue  = revenue._sum.amount || 0
      const totalExpenses = expenses._sum.amount || 0
      const totalAdSpend  = adSpend._sum.spend || 0
      const netProfit     = totalRevenue - totalExpenses - totalAdSpend
      const margin        = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0

      const pl = {
        period: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
        revenue: Math.round(totalRevenue * 100) / 100,
        expenses: Math.round(totalExpenses * 100) / 100,
        adSpend: Math.round(totalAdSpend * 100) / 100,
        netProfit: Math.round(netProfit * 100) / 100,
        margin: Math.round(margin * 10) / 10,
      }

      // Get AI analysis
      const analysis = await this.askAI(
        `Analyze this monthly P&L for Palstyle48 fashion brand and provide 2-3 key insights:\n${JSON.stringify(pl, null, 2)}`,
        { temperature: 0.5 }
      )

      return { ...pl, analysis }
    })
  }

  /**
   * Get all current recommendations
   */
  async getRecommendations() {
    return this.execute('get_recommendations', async () => {
      const alerts = await prisma.alert.findMany({
        where: { agentName: 'finance', isRead: false },
        orderBy: { createdAt: 'desc' },
        take: 10,
      })
      return alerts
    })
  }
}

module.exports = new FinanceAgent()
