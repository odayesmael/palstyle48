// ─── CRM Customers Routes ─────────────────────────────────────────────────────
const express = require('express')
const router  = express.Router()
const prisma  = require('../lib/prisma')
const { verifyToken } = require('../middleware/auth.middleware')
const { syncAllCustomers } = require('../services/sync/customer-sync.service')
const { syncAllOrders }    = require('../services/sync/order-sync.service')
const { memCache }         = require('../lib/memCache')

const TTL = 30_000 // 30s

// ── 1. Customer Stats ─────────────────────────────────────────────────────────
router.get('/stats', verifyToken, async (_req, res) => {
  try {
    const cached = memCache.get('customers:stats')
    if (cached) return res.json(cached)

    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)
    const startOfLast = new Date(startOfMonth.getFullYear(), startOfMonth.getMonth() - 1, 1)

    // Run ALL counts in parallel — was sequential before (6 round-trips → 1)
    const [
      totalCustomers,
      newThisMonth,
      newLastMonth,
      customersWithOrders,
      repeatCustomers,
      allCustomersValue,
    ] = await Promise.all([
      prisma.customer.count(),
      prisma.customer.count({ where: { createdAt: { gte: startOfMonth } } }),
      prisma.customer.count({ where: { createdAt: { gte: startOfLast, lt: startOfMonth } } }),
      prisma.customer.count({ where: { totalOrders: { gt: 0 } } }),
      prisma.customer.count({ where: { totalOrders: { gt: 1 } } }),
      prisma.customer.aggregate({ _sum: { totalSpent: true } }),
    ])

    const growthRate    = newLastMonth === 0 ? 100 : Math.round(((newThisMonth - newLastMonth) / newLastMonth) * 100)
    const retentionRate = customersWithOrders === 0 ? 0 : Math.round((repeatCustomers / customersWithOrders) * 100)
    const acv           = customersWithOrders === 0 ? 0 : (allCustomersValue._sum.totalSpent || 0) / customersWithOrders

    const result = {
      success: true,
      stats: { total: totalCustomers, growthRate, newThisMonth, retentionRate, acv: parseFloat(acv.toFixed(2)) },
    }
    memCache.set('customers:stats', result, TTL)
    res.json(result)
  } catch (err) {
    console.error('[CRM Stats Error]', err)
    res.status(500).json({ success: false, message: 'فشل في جلب الإحصائيات' })
  }
})

// ── 2. Sync ───────────────────────────────────────────────────────────────────
router.post('/sync', verifyToken, async (_req, res) => {
  try {
    await Promise.all([syncAllCustomers(), syncAllOrders()])
    memCache.invalidate('customers:')
    res.json({ success: true, message: 'تم سحب البيانات بنجاح' })
  } catch (err) {
    console.error('[CRM Sync Error]', err)
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء المزامنة' })
  }
})

// ── 3. Customers List (paginated + filters) ───────────────────────────────────
router.get('/', verifyToken, async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '', source = 'all', segment = 'all', sortBy = 'newest' } = req.query
    const cacheKey = `customers:list:${page}:${limit}:${search}:${source}:${segment}:${sortBy}`

    const cached = memCache.get(cacheKey)
    if (cached) return res.json(cached)

    const skip  = (Number(page) - 1) * Number(limit)
    const where = {}
    if (source  !== 'all') where.source  = source
    if (segment !== 'all') where.segment = segment
    if (search) {
      where.OR = [
        { name:  { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
      ]
    }

    const orderBy = {
      newest:        { createdAt: 'desc' },
      oldest:        { createdAt: 'asc' },
      highest_spent: { totalSpent: 'desc' },
      most_orders:   { totalOrders: 'desc' },
    }[sortBy] || { createdAt: 'desc' }

    // Run query + count in parallel
    const [customers, total] = await Promise.all([
      prisma.customer.findMany({ where, orderBy, skip, take: Number(limit) }),
      prisma.customer.count({ where }),
    ])

    const result = {
      success: true,
      data: customers,
      pagination: { total, page: Number(page), pages: Math.ceil(total / Number(limit)) },
    }
    memCache.set(cacheKey, result, TTL)
    res.json(result)
  } catch (err) {
    console.error('[CRM Fetch Error]', err)
    res.status(500).json({ success: false, message: 'فشل في جلب العملاء' })
  }
})

// ── 4. Customer Detail ────────────────────────────────────────────────────────
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const cacheKey = `customers:detail:${req.params.id}`
    const cached = memCache.get(cacheKey)
    if (cached) return res.json(cached)

    const customer = await prisma.customer.findUnique({
      where: { id: req.params.id },
      include: {
        orders:   { orderBy: { createdAt: 'desc' } },
        messages: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    })

    if (!customer) return res.status(404).json({ success: false, message: 'العميل غير موجود' })

    const timeline = [
      ...customer.orders.map(o => ({
        id: `order_${o.id}`, type: 'order', date: o.createdAt,
        title: `طلب جديد من ${o.platform}`,
        description: `قيمة الطلب: $${o.total}`, platform: o.platform,
      })),
      ...customer.messages.map(m => ({
        id: `msg_${m.id}`, type: 'message', date: m.createdAt,
        title: m.direction === 'inbound' ? 'رسالة واردة' : 'رسالة مرسلة',
        description: m.content, platform: m.platform,
      })),
    ].sort((a, b) => new Date(b.date) - new Date(a.date))

    const result = { success: true, data: { ...customer, timeline } }
    memCache.set(cacheKey, result, TTL)
    res.json(result)
  } catch (err) {
    console.error('[CRM Fetch Single Error]', err)
    res.status(500).json({ success: false, message: 'فشل في جلب العميل' })
  }
})

module.exports = router
