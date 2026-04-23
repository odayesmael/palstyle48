// ─── InventoryAgent — AI-powered stock management ────────────────────────────
const BaseAgent = require('./BaseAgent')
const prisma    = require('../lib/prisma')

class InventoryAgent extends BaseAgent {
  constructor() { super('inventory') }

  /**
   * Analyze stock levels and create alerts for low/out-of-stock items
   */
  async analyzeStockLevels() {
    return this.execute('stock_analysis', async () => {
      const criticalItems = await prisma.productVariant.findMany({
        where: { stock: { lte: 5 } },
        include: { product: { select: { name: true, category: true } } },
        orderBy: { stock: 'asc' },
        take: 50,
      })

      const outOfStock = criticalItems.filter(v => v.stock === 0)
      const lowStock   = criticalItems.filter(v => v.stock > 0)

      if (outOfStock.length > 0) {
        await this.createAlert({
          type: 'error',
          title: `${outOfStock.length} product variant(s) out of stock`,
          message: outOfStock.map(v => `• ${v.product.name} (${v.sku}) — 0 units`).join('\n'),
          data: { variants: outOfStock.map(v => ({ sku: v.sku, name: v.product.name })) },
        })
      }

      if (lowStock.length > 0) {
        await this.createAlert({
          type: 'warning',
          title: `${lowStock.length} product variant(s) running low`,
          message: lowStock.map(v => `• ${v.product.name} (${v.sku}) — ${v.stock} units remaining`).join('\n'),
          data: { variants: lowStock.map(v => ({ sku: v.sku, name: v.product.name, stock: v.stock })) },
        })
      }

      return { outOfStock: outOfStock.length, lowStock: lowStock.length, total: criticalItems.length }
    })
  }

  /**
   * Suggest reorder quantities based on sales velocity
   */
  async suggestReorders() {
    return this.execute('reorder_suggestions', async () => {
      // Get items that are low but still have some stock
      const lowItems = await prisma.productVariant.findMany({
        where: { stock: { gt: 0, lte: 10 } },
        include: { product: { select: { name: true, category: true } } },
        take: 20,
      })

      if (lowItems.length === 0) return { message: 'No items need reordering' }

      // Get order volume for these items in last 30 days
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

      const itemData = lowItems.map(v => ({
        sku: v.sku, name: v.product.name,
        currentStock: v.stock, price: v.price,
      }))

      const suggestion = await this.askAI(
        `Based on these low-stock items, suggest reorder quantities. Consider a 30-day safety stock.\n${JSON.stringify(itemData, null, 2)}\n\nProvide a brief list with recommended quantities.`,
        { temperature: 0.5 }
      )

      await this.createAlert({
        type: 'info',
        title: 'Reorder Suggestions',
        message: suggestion,
        data: { items: itemData },
      })

      return { itemsAnalyzed: lowItems.length, suggestion }
    })
  }
}

module.exports = new InventoryAgent()
