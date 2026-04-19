const { registry } = require('../../integrations/registry')
const prisma = require('../../lib/prisma')

// ─── Shopify Product Parser ──────────────────────────────────────────────────
function parseShopifyProduct(sp) {
  return {
    name:         sp.title,
    description:  sp.body_html || '',
    category:     sp.product_type || null,
    brand:        sp.vendor || null,
    images:       sp.images?.map(img => img.src) || [],
    platforms:    { shopify: { id: String(sp.id), handle: sp.handle } },
    isActive:     sp.status === 'active',
  }
}

// ─── Shopify Variant Parser ──────────────────────────────────────────────────
function parseShopifyVariants(sp, dbProductId) {
  return (sp.variants || []).map(v => ({
    productId:      dbProductId,
    sku:            v.sku || `shopify-${v.id}`,
    size:           v.option1 || null,
    color:          v.option2 || null,
    price:          parseFloat(v.price || 0),
    compareAtPrice: v.compare_at_price ? parseFloat(v.compare_at_price) : null,
    stock:          parseInt(v.inventory_quantity || 0),
    currency:       'USD', // Shopify doesn't send variant currency in this API
  }))
}

// ─── Sync Shopify Products ───────────────────────────────────────────────────
async function syncShopifyProducts() {
  try {
    const shopify = registry.getIntegration('shopify')
    if (!shopify || !shopify._connected) return { success: false, reason: 'Shopify not connected' }

    console.log('[ProductSync] Fetching Shopify products...')
    const { data: productsList } = await shopify.getProducts({ limit: 200 })
    
    let created = 0, updated = 0

    for (const remoteProduct of productsList) {
      // 1. Try to find existing product by Shopify ID in the JSON field 'platforms'
      // Since filtering JSON is complex in SQLite, we fetch by sku from the first variant, 
      // or we just query and filter in memory if the dataset is small. 
      // Wait, let's look up if we have a variant with the SKU first.
      
      const firstSku = remoteProduct.variants?.[0]?.sku || `shopify-${remoteProduct.variants?.[0]?.id}`
      
      let existingProduct = null
      const existingVariant = await prisma.productVariant.findFirst({
        where: { sku: firstSku },
        include: { product: true }
      })

      if (existingVariant && existingVariant.product) {
        existingProduct = existingVariant.product
      }

      const parsedData = parseShopifyProduct(remoteProduct)

      if (existingProduct) {
        // Update product
        await prisma.product.update({
          where: { id: existingProduct.id },
          data: {
            name: parsedData.name,
            description: parsedData.description,
            images: parsedData.images,
            platforms: { ...existingProduct.platforms, shopify: parsedData.platforms.shopify },
          }
        })

        // Upsert variants
        const variantsData = parseShopifyVariants(remoteProduct, existingProduct.id)
        for (const v of variantsData) {
          const exVar = await prisma.productVariant.findFirst({ where: { sku: v.sku } })
          if (exVar) {
            await prisma.productVariant.update({
              where: { id: exVar.id },
              data: { price: v.price, stock: v.stock }
            })
          } else {
            await prisma.productVariant.create({ data: v })
          }
        }
        updated++
      } else {
        // Create new product
        const newProd = await prisma.product.create({
          data: parsedData
        })
        const variantsData = parseShopifyVariants(remoteProduct, newProd.id)
        await prisma.productVariant.createMany({
          data: variantsData,
          skipDuplicates: true
        })
        created++
      }
    }

    return { success: true, created, updated }
  } catch (err) {
    console.error('[ProductSync] Shopify error:', err.message)
    return { success: false, error: err.message }
  }
}

async function syncTrendyolProducts() {
  try {
    const trendyol = registry.getIntegration('trendyol')
    if (!trendyol || !trendyol._connected) return { success: false, reason: 'Trendyol not connected' }

    console.log('[ProductSync] Fetching Trendyol products...')
    const { data: productsList } = await trendyol.getProducts({ size: 200 })
    
    let created = 0, updated = 0

    for (const remoteProduct of productsList) {
      const firstSku = remoteProduct.barcode || remoteProduct.id
      
      let existingProduct = null
      const existingVariant = await prisma.productVariant.findFirst({
        where: { sku: firstSku },
        include: { product: true }
      })

      if (existingVariant && existingVariant.product) {
        existingProduct = existingVariant.product
      }

      if (existingProduct) {
        await prisma.product.update({
          where: { id: existingProduct.id },
          data: {
            name: remoteProduct.title,
            platforms: { ...existingProduct.platforms, trendyol: { id: String(remoteProduct.id) } },
          }
        })
        // update stock
        await prisma.productVariant.update({
          where: { id: existingVariant.id },
          data: {
             price: parseFloat(remoteProduct.salePrice || 0),
             stock: parseInt(remoteProduct.quantity || remoteProduct.stockItems?.[0]?.quantity || 0)
          }
        })
        updated++
      } else {
        const newProd = await prisma.product.create({
          data: {
            name: remoteProduct.title,
            description: remoteProduct.description || '',
            category: remoteProduct.categoryName || null,
            brand: remoteProduct.brand || null,
            images: remoteProduct.images?.map(i => i.url) || [],
            platforms: { trendyol: { id: String(remoteProduct.id) } },
            isActive: remoteProduct.approved !== false
          }
        })
        await prisma.productVariant.create({
          data: {
            productId: newProd.id,
            sku: firstSku,
            price: parseFloat(remoteProduct.salePrice || 0),
            compareAtPrice: remoteProduct.listPrice ? parseFloat(remoteProduct.listPrice) : null,
            stock: parseInt(remoteProduct.quantity || remoteProduct.stockItems?.[0]?.quantity || 0),
            currency: 'TRY'
          }
        })
        created++
      }
    }
    return { success: true, created, updated }
  } catch (err) {
    console.error('[ProductSync] Trendyol error:', err.message)
    return { success: false, error: err.message }
  }
}

async function syncAllProducts() {
  const results = {
    shopify: await syncShopifyProducts(),
    trendyol: await syncTrendyolProducts()
  }
  return results
}

module.exports = {
  syncShopifyProducts,
  syncTrendyolProducts,
  syncAllProducts
}
