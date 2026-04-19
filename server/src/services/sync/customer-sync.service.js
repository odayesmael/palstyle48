/**
 * Customer Sync Service
 * Fetches customers from API integrations and routes them through Deduplication layer
 */

const { registry } = require('../../integrations/registry')
const { processCustomer } = require('./dedup.service')
const prisma = require('../../lib/prisma')

/**
 * Sync Shopify Customers
 */
async function syncShopifyCustomers() {
  try {
    const shopify = registry.getIntegration('shopify')
    if (!shopify || !shopify._connected) return { success: false, reason: 'Shopify not connected' }

    console.log('[CustomerSync] Fetching Shopify customers...')
    const { data: customersList } = await shopify.getCustomers({ limit: 250 }) // we can also implement pages

    let synced = 0
    for (const remoteCust of customersList) {
      await processCustomer({
        name: `${remoteCust.first_name || ''} ${remoteCust.last_name || ''}`.trim(),
        email: remoteCust.email,
        phone: remoteCust.phone || remoteCust.default_address?.phone,
        source: 'shopify',
        platformId: String(remoteCust.id),
        tags: remoteCust.tags ? remoteCust.tags.split(',').map(t=>t.trim()) : [],
        notes: remoteCust.note,
        metadata: {
          verified_email: remoteCust.verified_email,
          city: remoteCust.default_address?.city,
          country: remoteCust.default_address?.country
        }
      })
      synced++
    }

    return { success: true, count: synced }
  } catch (err) {
    console.error('[CustomerSync] Shopify error:', err.message)
    return { success: false, error: err.message }
  }
}

/**
 * Trendyol customers are usually extracted directly from Orders since Trendyol 
 * API doesn't have a standalone customer endpoint. This will be triggered 
 * inside order-sync.service.js. 
 */

/**
 * Run a full CRM synchronization
 */
async function syncAllCustomers() {
  const results = {
    shopify: await syncShopifyCustomers()
    // Instagram/FB extraction will go here later
  }
  return results
}

module.exports = {
  syncShopifyCustomers,
  syncAllCustomers
}
