// ─── Dashboard Route — Enhanced ──────────────────────────────────────────────
const express = require('express')
const router  = express.Router()
const prisma  = require('../lib/prisma')
const { verifyToken } = require('../middleware/auth.middleware')
const { memCache } = require('../lib/memCache')
const { ok, fail } = require('../utils/apiResponse')

router.use(verifyToken)

// ── Helper: build comprehensive dashboard data ──────────────────────────────
async function buildDashboard() {
  const now          = new Date()
  const todayStart   = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const weekStart    = new Date(todayStart)
  weekStart.setDate(weekStart.getDate() - weekStart.getDay())
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfLast  = new Date(now.getFullYear(), now.getMonth() - 1, 1)

  const [
    // Revenue
    revenueToday, revenueWeek, revenueMonth, revenueLast,
    // Orders
    ordersToday, ordersWeek, ordersPending, ordersProcessing,
    // Customers
    totalCustomers, newCustomers, vipCustomers,
    // Products
    totalProducts,
    // Inbox
    unreadMessages, openMessages,
    // Ads
    adInsightsMonth, activeCampaigns,
    // Inventory
    totalVariants, lowStockVariants, outOfStockVariants,
    // Recent data
    recentOrders, recentProducts,
    // Tasks
    openTasks, urgentTasks,
  ] = await Promise.all([
    // Revenue
    prisma.order.aggregate({ _sum: { total: true }, where: { createdAt: { gte: todayStart }, status: { notIn: ['cancelled', 'refunded'] } } }),
    prisma.order.aggregate({ _sum: { total: true }, where: { createdAt: { gte: weekStart }, status: { notIn: ['cancelled', 'refunded'] } } }),
    prisma.order.aggregate({ _sum: { total: true }, where: { createdAt: { gte: startOfMonth }, status: { notIn: ['cancelled', 'refunded'] } } }),
    prisma.order.aggregate({ _sum: { total: true }, where: { createdAt: { gte: startOfLast, lt: startOfMonth }, status: { notIn: ['cancelled', 'refunded'] } } }),
    // Orders
    prisma.order.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.order.count({ where: { createdAt: { gte: weekStart } } }),
    prisma.order.count({ where: { status: 'pending' } }),
    prisma.order.count({ where: { status: 'processing' } }),
    // Customers
    prisma.customer.count(),
    prisma.customer.count({ where: { createdAt: { gte: startOfMonth } } }),
    prisma.customer.count({ where: { segment: 'vip' } }),
    // Products
    prisma.product.count({ where: { isActive: true } }),
    // Inbox
    prisma.message.count({ where: { status: 'unread', direction: 'inbound' } }),
    prisma.message.count({ where: { status: { in: ['unread', 'read'] }, direction: 'inbound' } }),
    // Ads
    prisma.adInsight.aggregate({
      _sum: { spend: true, revenue: true, conversions: true },
      where: { date: { gte: startOfMonth } },
    }),
    prisma.adCampaign.count({ where: { status: 'active' } }),
    // Inventory
    prisma.productVariant.count(),
    prisma.productVariant.count({ where: { stock: { gt: 0, lte: 5 } } }),
    prisma.productVariant.count({ where: { stock: 0 } }),
    // Recent
    prisma.order.findMany({
      take: 5, orderBy: { createdAt: 'desc' },
      include: { customer: { select: { name: true, email: true } } },
    }),
    prisma.product.findMany({
      take: 4, orderBy: { createdAt: 'desc' },
      include: { variants: { take: 1, select: { price: true, stock: true } } },
    }),
    // Tasks
    prisma.task.count({ where: { status: { in: ['todo', 'in_progress'] } } }),
    prisma.task.count({ where: { priority: 'urgent', status: { in: ['todo', 'in_progress'] } } }),
  ])

  const thisMonthRevenue = revenueMonth._sum.total || 0
  const lastMonthRevenue = revenueLast._sum.total || 0
  const revenueGrowth = lastMonthRevenue === 0
    ? (thisMonthRevenue > 0 ? 100 : 0)
    : Math.round(((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100)

  const adSpend   = adInsightsMonth._sum.spend || 0
  const adRevenue = adInsightsMonth._sum.revenue || 0
  const totalRoas = adSpend > 0 ? Math.round((adRevenue / adSpend) * 100) / 100 : 0

  // Revenue chart — last 30 days
  const revenueChart = await buildRevenueChart(30)

  // Channel breakdown
  const channelBreakdown = await buildChannelBreakdown(startOfMonth)

  return {
    stats: {
      revenue: {
        today: revenueToday._sum.total || 0,
        thisWeek: revenueWeek._sum.total || 0,
        thisMonth: parseFloat(thisMonthRevenue.toFixed(2)),
        lastMonth: parseFloat(lastMonthRevenue.toFixed(2)),
        growth: revenueGrowth,
      },
      orders: {
        today: ordersToday,
        thisWeek: ordersWeek,
        pending: ordersPending,
        processing: ordersProcessing,
      },
      customers: {
        total: totalCustomers,
        newThisMonth: newCustomers,
        vipCount: vipCustomers,
      },
      ads: {
        totalSpend: parseFloat(adSpend.toFixed(2)),
        totalRoas,
        activeCampaigns,
        totalConversions: adInsightsMonth._sum.conversions || 0,
      },
      inbox: {
        unread: unreadMessages,
        open: openMessages,
      },
      inventory: {
        totalProducts,
        totalVariants,
        lowStock: lowStockVariants,
        outOfStock: outOfStockVariants,
      },
      tasks: {
        open: openTasks,
        urgent: urgentTasks,
      },
    },
    revenueChart,
    channelBreakdown,
    recentOrders: recentOrders.map(o => ({
      id: o.id, platform: o.platform, status: o.status,
      total: o.total, currency: o.currency, createdAt: o.createdAt,
      customer: o.customer, items: o.items,
    })),
    recentProducts: recentProducts.map(p => ({
      id: p.id, name: p.name, category: p.category, images: p.images,
      price: p.variants[0]?.price ?? 0, stock: p.variants[0]?.stock ?? 0,
    })),
  }
}

// ── Revenue chart helper ─────────────────────────────────────────────────────
async function buildRevenueChart(days) {
  const since = new Date()
  since.setDate(since.getDate() - days)

  const orders = await prisma.order.findMany({
    where: {
      createdAt: { gte: since },
      status: { notIn: ['cancelled', 'refunded'] },
    },
    select: { total: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })

  // Group by date
  const byDate = {}
  for (let i = 0; i < days; i++) {
    const d = new Date()
    d.setDate(d.getDate() - (days - 1 - i))
    const key = d.toISOString().slice(0, 10)
    byDate[key] = 0
  }

  for (const order of orders) {
    const key = order.createdAt.toISOString().slice(0, 10)
    if (byDate[key] !== undefined) {
      byDate[key] += order.total
    }
  }

  return Object.entries(byDate).map(([date, amount]) => ({
    date,
    amount: parseFloat(amount.toFixed(2)),
  }))
}

// ── Channel breakdown helper ─────────────────────────────────────────────────
async function buildChannelBreakdown(since) {
  const result = await prisma.order.groupBy({
    by: ['platform'],
    where: {
      createdAt: { gte: since },
      status: { notIn: ['cancelled', 'refunded'] },
    },
    _sum: { total: true },
    _count: true,
  })

  const total = result.reduce((s, r) => s + (r._sum.total || 0), 0)

  return result.map(r => ({
    channel: r.platform,
    revenue: parseFloat((r._sum.total || 0).toFixed(2)),
    orders: r._count,
    percentage: total > 0 ? Math.round(((r._sum.total || 0) / total) * 100) : 0,
  }))
}

// GET /api/dashboard
router.get('/', async (_req, res) => {
  res.set('Cache-Control', 'private, max-age=30, stale-while-revalidate=60')
  try {
    const cached = memCache.get('dashboard')
    if (cached) return res.json(cached)

    const data = await buildDashboard()
    const result = ok(data)
    memCache.set('dashboard', result, 30_000)
    res.json(result)
  } catch (err) {
    console.error('[Dashboard] error:', err)
    res.status(500).json(fail(err.message))
  }
})

// Called after manual sync — invalidate
router.delete('/cache', (_req, res) => {
  memCache.del('dashboard')
  res.json({ success: true })
})

module.exports = router
