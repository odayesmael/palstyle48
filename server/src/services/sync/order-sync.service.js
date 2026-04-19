/**
 * Order Sync Service
 * Fetches orders, maps them to customers, and saves to database.
 */

const { registry } = require('../../integrations/registry')
const { processCustomer, recalculateCustomerTotals } = require('./dedup.service')
const prisma = require('../../lib/prisma')

/**
 * Format Shopify Order for Prisma
 */
function parseShopifyOrder(remoteOrder) {
  return {
    platformOrderId: String(remoteOrder.id),
    status: remoteOrder.financial_status === 'refunded' ? 'refunded' : 
           (remoteOrder.fulfillment_status === 'fulfilled' ? 'delivered' : 'processing'),
    subtotal: parseFloat(remoteOrder.subtotal_price || 0),
    shipping: remoteOrder.shipping_lines?.reduce((sum, line) => sum + parseFloat(line.price || 0), 0) || 0,
    discount: parseFloat(remoteOrder.total_discounts || 0),
    total: parseFloat(remoteOrder.total_price || 0),
    currency: remoteOrder.currency || 'USD',
    items: remoteOrder.line_items?.map(item => ({
      productId: item.product_id,
      name: item.title,
      variant: item.variant_title,
      quantity: item.quantity,
      price: parseFloat(item.price)
    })) || [],
    shippingAddress: remoteOrder.shipping_address || null,
    notes: remoteOrder.note || null,
    createdAt: new Date(remoteOrder.created_at)
  }
}

/**
 * Parses Trendyol order (Example structure)
 */
function parseTrendyolOrder(tOrder) {
  return {
    platformOrderId: String(tOrder.orderNumber),
    status: tOrder.status === 'Delivered' ? 'delivered' : 'processing',
    subtotal: parseFloat(tOrder.totalPrice || 0),
    shipping: 0,
    discount: 0, 
    total: parseFloat(tOrder.totalPrice || 0),
    currency: tOrder.currencyCode || 'TRY',
    items: tOrder.lines?.map(item => ({
      productId: item.productId,
      name: item.productName,
      variant: item.variantName,
      quantity: item.quantity,
      price: parseFloat(item.price)
    })) || [],
    shippingAddress: tOrder.shipmentAddress || null,
    notes: null,
    createdAt: new Date(tOrder.orderDate)
  }
}

/**
 * Sync Shopify Orders
 */
async function syncShopifyOrders() {
  try {
    const shopify = registry.getIntegration('shopify')
    if (!shopify || !shopify._connected) return { success: false, reason: 'Shopify not connected' }

    console.log('[OrderSync] Fetching Shopify orders...')
    const { data: ordersList } = await shopify.getOrders({ limit: 250 })

    const customersToUpdate = new Set()
    let synced = 0

    for (const order of ordersList) {
      if (!order.customer) continue // Skip orders without customers

      // 1. Ensure Customer exists and get local ID
      const customerRecord = await processCustomer({
        name: `${order.customer.first_name || ''} ${order.customer.last_name || ''}`.trim(),
        email: order.customer.email,
        phone: order.customer.phone || order.shipping_address?.phone,
        source: 'shopify',
        platformId: String(order.customer.id)
      })

      if (!customerRecord) continue

      customersToUpdate.add(customerRecord.id)

      // 2. Check if Order exists
      const existingOrder = await prisma.order.findUnique({
        where: {
          platform_platformOrderId: {
            platform: 'shopify',
            platformOrderId: String(order.id)
          }
        }
      })

      const parsedOrder = parseShopifyOrder(order)

      if (existingOrder) {
        // Update
        await prisma.order.update({
          where: { id: existingOrder.id },
          data: { ...parsedOrder, customerId: customerRecord.id }
        })
      } else {
        // Create
        await prisma.order.create({
          data: {
            ...parsedOrder,
            platform: 'shopify',
            customerId: customerRecord.id
          }
        })
      }
      synced++
    }

    // 3. Recalculate RFM for affected customers
    for (const customerId of customersToUpdate) {
      await recalculateCustomerTotals(customerId)
    }

    return { success: true, count: synced }
  } catch (err) {
    console.error('[OrderSync] Shopify error:', err.message)
    return { success: false, error: err.message }
  }
}

/**
 * Sync Trendyol Orders
 */
async function syncTrendyolOrders() {
  try {
    const trendyol = registry.getIntegration('trendyol')
    if (!trendyol || !trendyol._connected) return { success: false, reason: 'Trendyol not connected' }

    console.log('[OrderSync] Fetching Trendyol orders...')
    const { data: ordersList } = await trendyol.getOrders({ size: 100 })

    const customersToUpdate = new Set()
    let synced = 0

    for (const order of ordersList) {
      // Trendyol embeds customer in shipping address or order root
      const email = order.customerEmail
      const firstName = order.customerFirstName || ''
      const lastName = order.customerLastName || ''
      const phone = order.shipmentAddress?.phone

      if (!email && !phone && !firstName) continue

      const customerRecord = await processCustomer({
        name: `${firstName} ${lastName}`.trim(),
        email: email,
        phone: phone,
        source: 'trendyol',
        platformId: String(order.customerId || '') 
      })

      if (!customerRecord) continue

      customersToUpdate.add(customerRecord.id)

      const existingOrder = await prisma.order.findUnique({
        where: {
          platform_platformOrderId: {
            platform: 'trendyol',
            platformOrderId: String(order.orderNumber)
          }
        }
      })

      const parsedOrder = parseTrendyolOrder(order)

      if (existingOrder) {
        await prisma.order.update({
          where: { id: existingOrder.id },
          data: { ...parsedOrder, customerId: customerRecord.id }
        })
      } else {
        await prisma.order.create({
          data: {
            ...parsedOrder,
            platform: 'trendyol',
            customerId: customerRecord.id
          }
        })
      }
      synced++
    }

    for (const customerId of customersToUpdate) {
      await recalculateCustomerTotals(customerId)
    }

    return { success: true, count: synced }
  } catch (err) {
    console.error('[OrderSync] Trendyol error:', err.message)
    return { success: false, error: err.message }
  }
}

async function syncAllOrders() {
  const results = {
    shopify: await syncShopifyOrders(),
    trendyol: await syncTrendyolOrders()
  }
  return results
}

module.exports = {
  syncShopifyOrders,
  syncTrendyolOrders,
  syncAllOrders
}
