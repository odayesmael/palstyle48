// ─── Dashboard Route ──────────────────────────────────────────────────────────
const express = require('express')
const router  = express.Router()
const prisma  = require('../lib/prisma')
const { verifyToken } = require('../middleware/auth.middleware')
const { memCache } = require('../lib/memCache')

router.use(verifyToken)

// ── Helper: build dashboard data from DB ─────────────────────────────────────
async function buildDashboard() {
  const now          = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfLast  = new Date(now.getFullYear(), now.getMonth() - 1, 1)

  const [
    totalOrders, totalCustomers, totalProducts,
    revenueAgg, revenueLastMonth, newCustomers,
    recentOrders, recentProducts,
  ] = await Promise.all([
    prisma.order.count(),
    prisma.customer.count(),
    prisma.product.count(),
    prisma.order.aggregate({
      _sum: { total: true },
      where: { createdAt: { gte: startOfMonth }, status: { notIn: ['cancelled', 'refunded'] } },
    }),
    prisma.order.aggregate({
      _sum: { total: true },
      where: { createdAt: { gte: startOfLast, lt: startOfMonth }, status: { notIn: ['cancelled', 'refunded'] } },
    }),
    prisma.customer.count({ where: { createdAt: { gte: startOfMonth } } }),
    prisma.order.findMany({
      take: 5, orderBy: { createdAt: 'desc' },
      include: { customer: { select: { name: true, email: true } } },
    }),
    prisma.product.findMany({
      take: 4, orderBy: { createdAt: 'desc' },
      include: { variants: { take: 1, select: { price: true, stock: true } } },
    }),
  ])

  const thisMonthRevenue = revenueAgg._sum.total       || 0
  const lastMonthRevenue = revenueLastMonth._sum.total || 0
  const revenueGrowth    = lastMonthRevenue === 0
    ? 100
    : Math.round(((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100)

  return {
    success: true,
    data: {
      stats: {
        totalOrders, totalCustomers, totalProducts,
        thisMonthRevenue: parseFloat(thisMonthRevenue.toFixed(2)),
        revenueGrowth, newCustomers,
      },
      recentOrders: recentOrders.map(o => ({
        id: o.id, platform: o.platform, status: o.status,
        total: o.total, currency: o.currency, createdAt: o.createdAt,
        customer: o.customer, items: o.items,
      })),
      recentProducts: recentProducts.map(p => ({
        id: p.id, name: p.name, category: p.category, images: p.images,
        price: p.variants[0]?.price ?? 0, stock: p.variants[0]?.stock ?? 0,
      })),
    },
  }
}

// GET /api/dashboard
router.get('/', async (_req, res) => {
  res.set('Cache-Control', 'private, max-age=30, stale-while-revalidate=60')
  try {
    // ── Serve from RAM if fresh (avoids ~300ms Sydney round-trip) ────────────
    const cached = memCache.get('dashboard')
    if (cached) return res.json(cached)

    // ── Cache miss → hit DB, store result, respond ────────────────────────────
    const result = await buildDashboard()
    memCache.set('dashboard', result, 30_000) // 30 second TTL
    res.json(result)

  } catch (err) {
    console.error('[Dashboard] error:', err)
    res.status(500).json({ success: false, message: err.message })
  }
})

// Called after manual sync — invalidate so next request gets fresh data
router.delete('/cache', (_req, res) => {
  memCache.del('dashboard')
  res.json({ success: true })
})

module.exports = router
