// ─── Stock Alerts Service ─────────────────────────────────────────────────────
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

// ── Scan all variants and create stock alerts ─────────────────────────────────
async function checkStockAlerts() {
  const variants = await prisma.productVariant.findMany({
    include: { product: true },
  })

  const alerts  = []
  const outOfStock = []
  const lowStock   = []

  for (const v of variants) {
    const threshold = v.lowStockAlert || 5
    const name = `${v.product?.name || 'منتج'} ${v.size ? `(${v.size})` : ''} ${v.color ? `- ${v.color}` : ''}`.trim()

    if (v.stock === 0) {
      outOfStock.push({ id: v.id, name, sku: v.sku })

      const existing = await prisma.alert.findFirst({
        where: {
          agentName: 'inventory',
          data: { path: ['variantId'], equals: v.id },
          type: 'error',
          createdAt: { gte: new Date(Date.now() - 6 * 3600 * 1000) },
        },
      })
      if (!existing) {
        const a = await prisma.alert.create({
          data: {
            agentName: 'inventory',
            type:  'error',
            title: `🚫 نفاد المخزون — ${name}`,
            message: `المنتج "${name}"${v.sku ? ` (SKU: ${v.sku})` : ''} نفد تماماً من المخزون`,
            data: { variantId: v.id, sku: v.sku, stock: 0 },
          },
        })
        alerts.push(a)
      }
    } else if (v.stock <= threshold) {
      lowStock.push({ id: v.id, name, sku: v.sku, stock: v.stock, threshold })

      const existing = await prisma.alert.findFirst({
        where: {
          agentName: 'inventory',
          data: { path: ['variantId'], equals: v.id },
          type: 'warning',
          createdAt: { gte: new Date(Date.now() - 12 * 3600 * 1000) },
        },
      })
      if (!existing) {
        const a = await prisma.alert.create({
          data: {
            agentName: 'inventory',
            type:  'warning',
            title: `⚠️ مخزون منخفض — ${name}`,
            message: `تبقّت ${v.stock} وحدات من "${name}". حد التنبيه: ${threshold} وحدات`,
            data: { variantId: v.id, sku: v.sku, stock: v.stock, threshold },
          },
        })
        alerts.push(a)
      }
    }
  }

  console.log(`[StockAlerts] ${outOfStock.length} نفاد, ${lowStock.length} منخفض, ${alerts.length} تنبيهات جديدة`)
  return { outOfStock, lowStock, alertsCreated: alerts.length }
}

// ── Get stock summary ─────────────────────────────────────────────────────────
async function getStockSummary() {
  const total     = await prisma.productVariant.count()
  const oos       = await prisma.productVariant.count({ where: { stock: 0 } })
  const low       = await prisma.productVariant.count({ where: { stock: { gt: 0, lte: 5 } } })
  const inStock   = total - oos - low

  return { total, outOfStock: oos, lowStock: low, inStock }
}

module.exports = { checkStockAlerts, getStockSummary }
