// ─── Finance Reports Service ──────────────────────────────────────────────────
const prisma = require('../../lib/prisma')

// ── Monthly P&L ───────────────────────────────────────────────────────────────
async function getMonthlyPnL(year, month) {
  const start = new Date(year, month, 1)
  const end   = new Date(year, month + 1, 0, 23, 59, 59)

  const [revAgg, expAgg] = await Promise.all([
    prisma.revenue.aggregate({
      where: { date: { gte: start, lte: end } },
      _sum:  { amount: true },
    }),
    prisma.expense.aggregate({
      where: { date: { gte: start, lte: end } },
      _sum:  { amount: true },
    }),
  ])

  const revenue  = revAgg._sum.amount || 0
  const expenses = expAgg._sum.amount || 0
  const profit   = revenue - expenses
  const margin   = revenue > 0 ? (profit / revenue) * 100 : 0

  return {
    year, month,
    revenue:  Math.round(revenue * 100) / 100,
    expenses: Math.round(expenses * 100) / 100,
    profit:   Math.round(profit * 100) / 100,
    margin:   Math.round(margin * 10) / 10,
  }
}

// ── Last 6 months P&L ─────────────────────────────────────────────────────────
async function getLast6MonthsPnL() {
  const now = new Date()

  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
    return { year: d.getFullYear(), month: d.getMonth(), label: d.toLocaleDateString('ar-SA', { month: 'short', year: '2-digit' }) }
  })

  const results = await Promise.all(
    months.map(async ({ year, month, label }) => {
      const pnl = await getMonthlyPnL(year, month)
      return { ...pnl, label }
    })
  )
  return results
}

// ── P&L by Platform ───────────────────────────────────────────────────────────
async function getPlatformPnL() {
  const now        = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const revByPlatform = await prisma.$queryRaw`
    SELECT platform, COALESCE(SUM(amount), 0) AS total
    FROM "Revenue"
    WHERE date >= ${monthStart}
    GROUP BY platform
  `

  const expByPlatform = await prisma.$queryRaw`
    SELECT platform, COALESCE(SUM(amount), 0) AS total
    FROM "Expense"
    WHERE date >= ${monthStart} AND platform IS NOT NULL
    GROUP BY platform
  `

  const revMap = {}
  revByPlatform.forEach(r => { revMap[r.platform] = parseFloat(r.total) || 0 })

  const expMap = {}
  expByPlatform.forEach(r => { expMap[r.platform] = parseFloat(r.total) || 0 })

  const platforms = [...new Set([...Object.keys(revMap), ...Object.keys(expMap)])]

  return platforms.map(p => {
    const rev = revMap[p] || 0
    const exp = expMap[p] || 0
    const profit = rev - exp
    const roi    = exp > 0 ? ((profit / exp) * 100) : 0
    return {
      platform: p,
      revenue:  Math.round(rev * 100) / 100,
      expenses: Math.round(exp * 100) / 100,
      profit:   Math.round(profit * 100) / 100,
      roi:      Math.round(roi * 10) / 10,
    }
  })
}

// ── Expense breakdown by category ─────────────────────────────────────────────
async function getExpenseBreakdown(year, month) {
  const start = new Date(year, month, 1)
  const end   = new Date(year, month + 1, 0, 23, 59, 59)

  const result = await prisma.$queryRaw`
    SELECT category, COALESCE(SUM(amount), 0) AS total
    FROM "Expense"
    WHERE date >= ${start} AND date <= ${end}
    GROUP BY category
    ORDER BY total DESC
  `

  const breakdown = result.map(r => ({
    category: r.category,
    amount:   Math.round(parseFloat(r.total) * 100) / 100,
  }))

  const total = breakdown.reduce((s, r) => s + r.amount, 0)
  return breakdown.map(r => ({
    ...r,
    pct: total > 0 ? Math.round((r.amount / total) * 100) : 0,
  }))
}

// ── Daily cash flow (last 30 days) ────────────────────────────────────────────
async function getDailyCashFlow(days = 30) {
  const since = new Date()
  since.setDate(since.getDate() - days)
  since.setHours(0, 0, 0, 0)

  const [revenues, expenses] = await Promise.all([
    prisma.$queryRaw`
      SELECT date, COALESCE(SUM(amount), 0) AS total
      FROM "Revenue"
      WHERE date >= ${since}
      GROUP BY date
      ORDER BY date ASC
    `,
    prisma.$queryRaw`
      SELECT date, COALESCE(SUM(amount), 0) AS total
      FROM "Expense"
      WHERE date >= ${since}
      GROUP BY date
      ORDER BY date ASC
    `,
  ])

  const revMap = {}
  revenues.forEach(r => { revMap[r.date.toISOString().split('T')[0]] = parseFloat(r.total) })
  const expMap = {}
  expenses.forEach(r => { expMap[r.date.toISOString().split('T')[0]] = parseFloat(r.total) })

  const allDates = new Set([...Object.keys(revMap), ...Object.keys(expMap)])
  return [...allDates].sort().map(date => ({
    date,
    revenue:  revMap[date] || 0,
    expenses: expMap[date] || 0,
    net:      (revMap[date] || 0) - (expMap[date] || 0),
  }))
}

// ── Overview ──────────────────────────────────────────────────────────────────
async function getOverview() {
  const now   = new Date()
  const year  = now.getFullYear()
  const month = now.getMonth()

  const [current, previous] = await Promise.all([
    getMonthlyPnL(year, month),
    getMonthlyPnL(year, month - 1 < 0 ? 11 : month - 1),
  ])

  const revTrend = previous.revenue > 0
    ? ((current.revenue - previous.revenue) / previous.revenue) * 100 : 0
  const expTrend = previous.expenses > 0
    ? ((current.expenses - previous.expenses) / previous.expenses) * 100 : 0

  // Total all-time revenue as a quick ROI proxy
  const totalRevAgg = await prisma.revenue.aggregate({ _sum: { amount: true } })
  const totalExpAgg = await prisma.expense.aggregate({ _sum: { amount: true } })
  const totalRev = totalRevAgg._sum.amount || 0
  const totalExp = totalExpAgg._sum.amount || 0
  const roi = totalExp > 0 ? ((totalRev - totalExp) / totalExp) * 100 : 0

  return {
    ...current,
    revTrend:  Math.round(revTrend * 10) / 10,
    expTrend:  Math.round(expTrend * 10) / 10,
    roi:       Math.round(roi * 10) / 10,
    previous,
  }
}

module.exports = { getMonthlyPnL, getLast6MonthsPnL, getPlatformPnL, getExpenseBreakdown, getDailyCashFlow, getOverview }
