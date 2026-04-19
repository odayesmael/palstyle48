// ─── Revenue Sync Service ─────────────────────────────────────────────────────
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

// ── Shopify: sync completed orders as revenue ─────────────────────────────────
async function syncShopifyRevenue() {
  const platform = await prisma.platform.findUnique({ where: { name: 'shopify' } })
  if (!platform?.isConnected || !platform.accessToken) {
    console.log('[RevenueSync] Shopify not connected, skipping')
    return { synced: 0 }
  }

  const meta      = platform.metadata || {}
  const shopDomain = meta.shopDomain || meta.shop

  if (!shopDomain) {
    console.warn('[RevenueSync] Shopify domain not configured')
    return { synced: 0 }
  }

  // Pull orders from last 2 days to catch any delayed
  const since = new Date()
  since.setDate(since.getDate() - 2)

  try {
    const url = `https://${shopDomain}/admin/api/2024-01/orders.json?status=any&financial_status=paid&limit=250&created_at_min=${since.toISOString()}`
    const res = await fetch(url, {
      headers: { 'X-Shopify-Access-Token': platform.accessToken },
    })
    if (!res.ok) throw new Error(`Shopify orders API: ${res.status}`)

    const { orders = [] } = await res.json()
    let synced = 0

    for (const order of orders) {
      const date     = new Date(order.created_at)
      date.setHours(0, 0, 0, 0)
      const amount   = parseFloat(order.subtotal_price || 0)
      const shipping = parseFloat(order.total_shipping_price_set?.shop_money?.amount || 0)
      const discount = parseFloat(order.total_discounts || 0)
      const net      = amount - discount

      if (net <= 0) continue

      await prisma.revenue.upsert({
        where:  { id: `shopify-${order.id}` },
        update: { amount: net, updatedAt: new Date() },
        create: {
          id:       `shopify-${order.id}`,
          platform: 'shopify',
          orderId:  String(order.id),
          amount:   net,
          currency: order.currency || 'USD',
          date,
          category: 'product_sales',
        },
      }).catch(() => {
        // upsert with generated id if custom id fails
        return prisma.revenue.create({
          data: {
            platform: 'shopify',
            orderId:  String(order.id),
            amount:   net,
            currency: order.currency || 'USD',
            date,
            category: 'product_sales',
          },
        }).catch(() => {})
      })
      synced++
    }

    await prisma.platform.update({ where: { name: 'shopify' }, data: { lastSync: new Date() } })
    console.log(`[RevenueSync] Shopify: ${synced} orders synced`)
    return { synced }
  } catch (err) {
    console.error('[RevenueSync] Shopify error:', err.message)
    return { synced: 0, error: err.message }
  }
}

// ── Trendyol: sync settled payments as revenue ────────────────────────────────
async function syncTrendyolRevenue() {
  try {
    const { registry } = require('../../integrations/registry')
    const trendyol = registry.getIntegration('trendyol')
    if (!trendyol || !trendyol._connected) {
      console.log('[RevenueSync] Trendyol not connected, skipping')
      return { synced: 0 }
    }

    const since = new Date()
    since.setDate(since.getDate() - 2)

    console.log('[RevenueSync] Fetching Trendyol delivered orders...')
    const { data: orders = [] } = await trendyol.getOrders({ 
      status: 'Delivered', 
      startDate: since.getTime(), 
      endDate: Date.now() 
    })
    
    let synced = 0

    for (const order of orders) {
      const date = new Date(order.orderDate || order.createdDate)
      date.setHours(0, 0, 0, 0)
      const amount = parseFloat(order.totalPrice || order.grossAmount || 0)
      if (amount <= 0) continue

      await prisma.revenue.create({
        data: {
          platform: 'trendyol',
          orderId:  String(order.orderNumber || order.id),
          amount,
          currency: order.currencyCode || 'TRY',
          date,
          category: 'product_sales',
        },
      }).catch(() => {}) // ignore duplicate
      synced++
    }

    console.log(`[RevenueSync] Trendyol: ${synced} orders synced`)
    return { synced }
  } catch (err) {
    console.error('[RevenueSync] Trendyol error:', err.message)
    return { synced: 0, error: err.message }
  }
}

// ── Sync ad spend from Meta into Expenses ─────────────────────────────────────
async function syncAdSpendAsExpense() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  const insights = await prisma.adInsight.findMany({
    where: { date: yesterday },
  })

  const totalSpend = insights.reduce((s, i) => s + i.spend, 0)
  if (totalSpend <= 0) return { amount: 0 }

  // Check if we already recorded this
  const existing = await prisma.expense.findFirst({
    where: {
      category:  'ads',
      platform:  'meta',
      date:      yesterday,
    },
  })

  if (!existing) {
    await prisma.expense.create({
      data: {
        category:    'ads',
        platform:    'meta',
        amount:      Math.round(totalSpend * 100) / 100,
        currency:    'USD',
        description: `Meta Ads spend — ${yesterday.toISOString().split('T')[0]}`,
        date:        yesterday,
        isRecurring: false,
      },
    })
    console.log(`[RevenueSync] Recorded Meta ad spend: $${totalSpend.toFixed(2)}`)
  }

  return { amount: totalSpend }
}

// ── Apply recurring expenses for today (if matching recurringDay) ──────────────
async function applyRecurringExpenses() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dayOfMonth = today.getDate()

  const recurring = await prisma.expense.findMany({
    where: { isRecurring: true, recurringDay: dayOfMonth },
  })

  let applied = 0
  for (const exp of recurring) {
    const alreadyToday = await prisma.expense.findFirst({
      where: {
        category:  exp.category,
        platform:  exp.platform,
        date:      today,
        isRecurring: false,
        description: { contains: '[auto]' },
      },
    })
    if (!alreadyToday) {
      await prisma.expense.create({
        data: {
          category:    exp.category,
          platform:    exp.platform,
          amount:      exp.amount,
          currency:    exp.currency,
          description: `[auto] ${exp.description || exp.category}`,
          date:        today,
          isRecurring: false,
        },
      })
      applied++
    }
  }

  if (applied) console.log(`[RevenueSync] Applied ${applied} recurring expenses`)
  return { applied }
}

// ── Full daily sync ───────────────────────────────────────────────────────────
async function syncAllRevenue() {
  const [shopify, trendyol, adSpend, recurring] = await Promise.allSettled([
    syncShopifyRevenue(),
    syncTrendyolRevenue(),
    syncAdSpendAsExpense(),
    applyRecurringExpenses(),
  ])
  return {
    shopify:   shopify.value,
    trendyol:  trendyol.value,
    adSpend:   adSpend.value,
    recurring: recurring.value,
  }
}

module.exports = { syncShopifyRevenue, syncTrendyolRevenue, syncAdSpendAsExpense, applyRecurringExpenses, syncAllRevenue }
