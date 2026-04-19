// ─── Inventory Agent Service ──────────────────────────────────────────────────
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

// ── Reorder suggestions based on sales velocity ───────────────────────────────
async function suggestReorders() {
  const last30 = new Date()
  last30.setDate(last30.getDate() - 30)

  const variants = await prisma.productVariant.findMany({
    include: { product: true },
    where:   { stock: { gt: 0 } },
  })

  const suggestions = []

  for (const v of variants) {
    // Calculate sold units from orders in last 30 days
    const orders = await prisma.order.findMany({
      where: { createdAt: { gte: last30 } },
      select: { items: true },
    })

    let unitsSold = 0
    for (const order of orders) {
      const items = Array.isArray(order.items) ? order.items : []
      for (const item of items) {
        if (
          item.sku === v.sku ||
          item.variantId === v.id ||
          (v.product && item.productName === v.product.name)
        ) {
          unitsSold += parseInt(item.quantity || 1)
        }
      }
    }

    const velocity = unitsSold / 30 // units per day
    if (velocity <= 0) continue

    const daysLeft = v.stock / velocity

    if (daysLeft < 14) {
      const reorderQty = Math.ceil(velocity * 30) // 30-day supply
      const name = `${v.product?.name || 'منتج'} ${v.size || ''} ${v.color || ''}`.trim()

      suggestions.push({
        variantId:  v.id,
        productName: name,
        sku:        v.sku,
        currentStock: v.stock,
        velocity:   Math.round(velocity * 10) / 10,
        daysLeft:   Math.round(daysLeft),
        reorderQty,
        priority:   daysLeft < 7 ? 'urgent' : 'high',
      })
    }
  }

  suggestions.sort((a, b) => a.daysLeft - b.daysLeft)

  // Create alerts for urgent ones
  for (const s of suggestions.filter(s => s.priority === 'urgent')) {
    const existing = await prisma.alert.findFirst({
      where: {
        agentName: 'inventory',
        title: { contains: s.productName },
        createdAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) },
      },
    })
    if (!existing) {
      await prisma.alert.create({
        data: {
          agentName: 'inventory',
          type:  'warning',
          title: `🔄 إعادة طلب مستعجلة — ${s.productName}`,
          message: `تبقّى ${s.daysLeft} يوم من المخزون. اطلب ${s.reorderQty} وحدة فوراً`,
          data: s,
        },
      })
    }
  }

  await logAction('suggestReorders', `${suggestions.length} اقتراح إعادة طلب`, { count: suggestions.length }, 'success')
  return suggestions
}

// ── Get all inventory with alerts ─────────────────────────────────────────────
async function getInventoryWithStatus() {
  const variants = await prisma.productVariant.findMany({
    include: { product: true },
    orderBy: { stock: 'asc' },
  })

  return variants.map(v => {
    const stockStatus =
      v.stock === 0                    ? 'out'    :
      v.stock <= (v.lowStockAlert || 5) ? 'low'    :
      v.stock <= 20                    ? 'medium' :
      'good'

    const platforms = {
      ...(v.product?.platforms || {}),
      ...(v.platformIds || {})
    }

    return {
      id:            v.id,
      productName:   v.product?.name || 'منتج غير معروف',
      productId:     v.productId,
      sku:           v.sku,
      size:          v.size,
      color:         v.color,
      price:         v.price,
      stock:         v.stock,
      lowStockAlert: v.lowStockAlert,
      stockStatus,
      platforms,
      category:      v.product?.category,
    }
  })
}

// ── Full agent run ────────────────────────────────────────────────────────────
async function getRecommendations() {
  const [reorders] = await Promise.allSettled([suggestReorders()])
  const alerts = await prisma.alert.findMany({
    where:   { agentName: 'inventory', isRead: false },
    orderBy: { createdAt: 'desc' },
    take:    30,
  })

  return {
    alerts,
    reorders: reorders.value || [],
  }
}

async function logAction(action, details, result, status) {
  try {
    const agent = await prisma.agentConfig.findUnique({ where: { name: 'inventory' } })
    if (agent) {
      await prisma.agentLog.create({ data: { agentId: agent.id, action, details, result, status } })
    }
  } catch {}
}

module.exports = { suggestReorders, getInventoryWithStatus, getRecommendations }
