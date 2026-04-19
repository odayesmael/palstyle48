// ─── Inventory Sync Service ───────────────────────────────────────────────────
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

// ── Shopify: fetch inventory levels ──────────────────────────────────────────
async function fetchShopifyInventory() {
  const { registry } = require('../../integrations/registry')
  try {
    const shopify = registry.getIntegration('shopify')
    if (!shopify || !shopify._connected) return []

    const { data: products = [] } = await shopify.getProducts({ limit: 100 })
    const allVariants = []
    
    for (const p of products) {
      if (!p.variants) continue
      for (const v of p.variants) {
        allVariants.push({
          platformId: String(v.id),
          sku:        v.sku || null,
          title:      v.title,
          productTitle: p.title,
          inventory:  parseInt(v.inventory_quantity || 0),
          price:      parseFloat(v.price || 0),
        })
      }
    }
    return allVariants
  } catch (err) {
    console.error('[InventorySync] Shopify fetch error:', err.message)
    return []
  }
}

// ── Trendyol: fetch stock info ────────────────────────────────────────────────
async function fetchTrendyolInventory() {
  const { registry } = require('../../integrations/registry')
  try {
    const trendyol = registry.getIntegration('trendyol')
    if (!trendyol || !trendyol._connected) return []

    const { data: products = [] } = await trendyol.getProducts({ size: 100 })
    const variants = []
    for (const p of products) {
      // Handle both real Trendyol structure and my mocked one
      const stockItems = p.stockItems || [{ quantity: p.quantity, barcode: p.barcode }]
      for (const v of stockItems) {
        variants.push({
          platformId: String(v.barcode || p.id),
          sku:        v.stockCode || p.barcode || p.id,
          productTitle: p.title,
          title:      p.attributes?.[0]?.value || '', 
          inventory:  parseInt(v.quantity || 0),
          price:      parseFloat(p.salePrice || 0),
        })
      }
    }
    return variants
  } catch (err) {
    console.error('[InventorySync] Trendyol fetch error:', err.message)
    return []
  }
}

// ── Two-way sync: update DB, detect mismatches ────────────────────────────────
async function syncInventory() {
  const [shopifyItems, trendyolItems] = await Promise.all([
    fetchShopifyInventory(),
    fetchTrendyolInventory(),
  ])

  const shopifyMap = {}
  shopifyItems.forEach(i => { if (i.sku) shopifyMap[i.sku] = i })

  const trendyolMap = {}
  trendyolItems.forEach(i => { if (i.sku) trendyolMap[i.sku] = i })

  let synced = 0, mismatches = 0

  // Update ProductVariant records from Shopify
  for (const item of shopifyItems) {
    try {
      const variant = await prisma.productVariant.findFirst({ where: { sku: item.sku } })
      if (!variant) continue

      const trendyolItem = item.sku ? trendyolMap[item.sku] : null
      // Take the lower stock (safer approach for two-way sync)
      const stock = trendyolItem
        ? Math.min(item.inventory, trendyolItem.inventory)
        : item.inventory

      if (variant.stock !== stock) {
        await prisma.productVariant.update({
          where: { id: variant.id },
          data:  { stock },
        })
        mismatches++
      }
      synced++
    } catch {}
  }

  // Update from Trendyol items that aren't in Shopify
  for (const item of trendyolItems) {
    try {
      if (!item.sku || shopifyMap[item.sku]) continue
      const variant = await prisma.productVariant.findFirst({ where: { sku: item.sku } })
      if (!variant) continue
      if (variant.stock !== item.inventory) {
        await prisma.productVariant.update({
          where: { id: variant.id },
          data:  { stock: item.inventory },
        })
        synced++
      }
    } catch {}
  }

  console.log(`[InventorySync] Synced ${synced} variants, ${mismatches} mismatches resolved`)
  return { synced, mismatches, shopifyCount: shopifyItems.length, trendyolCount: trendyolItems.length }
}

// ── Update Shopify stock (called after Trendyol sale webhook) ─────────────────
async function updateShopifyStock(sku, newQty) {
  const platform = await prisma.platform.findUnique({ where: { name: 'shopify' } })
  if (!platform?.isConnected || !platform.accessToken) return false

  const meta       = platform.metadata || {}
  const shopDomain = meta.shopDomain || meta.shop
  if (!shopDomain) return false

  // Find variant by SKU
  const searchRes = await fetch(
    `https://${shopDomain}/admin/api/2024-01/variants.json?sku=${encodeURIComponent(sku)}`,
    { headers: { 'X-Shopify-Access-Token': platform.accessToken } }
  )
  if (!searchRes.ok) return false
  const { variants = [] } = await searchRes.json()
  const variant = variants[0]
  if (!variant?.inventory_item_id) return false

  // Get location id
  const locRes = await fetch(
    `https://${shopDomain}/admin/api/2024-01/locations.json`,
    { headers: { 'X-Shopify-Access-Token': platform.accessToken } }
  )
  const { locations = [] } = await locRes.json()
  const locationId = locations[0]?.id
  if (!locationId) return false

  const setRes = await fetch(
    `https://${shopDomain}/admin/api/2024-01/inventory_levels/set.json`,
    {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': platform.accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        location_id:       locationId,
        inventory_item_id: variant.inventory_item_id,
        available:         newQty,
      }),
    }
  )
  return setRes.ok
}

module.exports = { syncInventory, fetchShopifyInventory, fetchTrendyolInventory, updateShopifyStock }
