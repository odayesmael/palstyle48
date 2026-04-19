// ─── Platforms Controller (v2 — uses Integration Registry) ───────────────────
const { registry } = require('../integrations/registry')
const prisma = require('../lib/prisma')
const { syncAllCustomers } = require('../services/sync/customer-sync.service')
const { syncAllOrders }    = require('../services/sync/order-sync.service')
const { syncAllProducts }  = require('../services/sync/product-sync.service')
const { syncInventory }    = require('../services/inventory/inventory-sync.service')
const { syncAllRevenue }   = require('../services/finance/revenue-sync.service')

const PLATFORM_DEFAULTS = [
  { name: 'meta',     displayName: 'Meta',     color: '#1877F2', description: 'Instagram + Facebook + WhatsApp' },
  { name: 'shopify',  displayName: 'Shopify',  color: '#96BF48', description: 'متجر Shopify' },
  { name: 'trendyol', displayName: 'Trendyol', color: '#F27A1A', description: 'سوق Trendyol' },
  { name: 'gmail',    displayName: 'Gmail',    color: '#EA4335', description: 'البريد الإلكتروني' },
  { name: 'notion',   displayName: 'Notion',   color: '#ffffff', description: 'قواعد المعرفة' },
  { name: 'canva',    displayName: 'Canva',    color: '#00C4CC', description: 'تصميم المحتوى' },
]

/**
 * GET /api/platforms
 * Returns all platforms with live status from the registry.
 */
async function getPlatforms(_req, res) {
  try {
    const dbPlatforms = await prisma.platform.findMany()
    const dbMap = Object.fromEntries(dbPlatforms.map(p => [p.name, p]))

    let registryStatus = {}
    try {
      registry.getAllStatus().forEach(s => { registryStatus[s.name] = s })
    } catch {}

    const result = PLATFORM_DEFAULTS.map(def => {
      const db  = dbMap[def.name] || {}
      const reg = registryStatus[def.name] || {}
      return {
        ...def,
        isConnected: reg.connected ?? db.isConnected ?? false,
        lastSync:    db.lastSync   || reg.lastSync   || null,
        lastError:   reg.lastError || null,
        tokenExpiry: db.tokenExpiry || null,
        syncStatus:  db.syncStatus || 'idle',
      }
    })

    return res.json({ success: true, platforms: result })
  } catch (err) {
    console.error('[Platforms/getPlatforms]', err)
    return res.status(500).json({ success: false, message: 'خطأ في الخادم' })
  }
}

/**
 * POST /api/platforms/:name/connect
 */
async function connectPlatform(req, res) {
  try {
    const { name } = req.params
    const credentials = req.body

    const result = await registry.connectPlatform(name, credentials)
    return res.json({ success: true, ...result })
  } catch (err) {
    console.error(`[Platforms/connectPlatform] ${req.params.name}:`, err.message)
    return res.status(400).json({ success: false, message: err.message })
  }
}

/**
 * POST /api/platforms/:name/disconnect
 */
async function disconnectPlatform(req, res) {
  try {
    const { name } = req.params
    await registry.disconnectPlatform(name)
    return res.json({ success: true, message: `تم فصل ${name}` })
  } catch (err) {
    console.error(`[Platforms/disconnectPlatform] ${req.params.name}:`, err.message)
    return res.status(400).json({ success: false, message: err.message })
  }
}

/**
 * POST /api/platforms/:name/sync
 * Syncs the platform AND saves all data (customers, orders, inventory, revenue) to DB.
 */
async function syncPlatform(req, res) {
  try {
    const { name } = req.params
    const result = { platform: name }

    // 1. Fetch raw data from integration (marks lastSync)
    try {
      result.raw = await registry.syncPlatform(name)
    } catch (e) {
      result.rawError = e.message
    }

    if (name === 'shopify' || name === 'trendyol') {
      const [customers, products, orders, inventory, revenue] = await Promise.allSettled([
        syncAllCustomers(),
        syncAllProducts(),
        syncAllOrders(),
        syncInventory(),
        syncAllRevenue(),
      ])
      result.customers  = customers.status  === 'fulfilled' ? customers.value  : { error: customers.reason?.message }
      result.products   = products.status   === 'fulfilled' ? products.value   : { error: products.reason?.message }
      result.orders     = orders.status     === 'fulfilled' ? orders.value     : { error: orders.reason?.message }
      result.inventory  = inventory.status  === 'fulfilled' ? inventory.value  : { error: inventory.reason?.message }
      result.revenue    = revenue.status    === 'fulfilled' ? revenue.value    : { error: revenue.reason?.message }
    }

    return res.json({ success: true, message: 'تمت المزامنة الكاملة', data: result, syncedAt: new Date().toISOString() })
  } catch (err) {
    console.error(`[Platforms/syncPlatform] ${req.params.name}:`, err.message)
    return res.status(400).json({ success: false, message: err.message })
  }
}

/**
 * POST /api/platforms/:name/refresh-token
 */
async function refreshToken(req, res) {
  try {
    const { name } = req.params
    const result = await registry.refreshPlatformToken(name)
    return res.json({ success: true, ...result })
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message })
  }
}

/**
 * POST /api/platforms/sync-all
 */
async function syncAll(_req, res) {
  try {
    const results = await registry.syncAllPlatforms()
    return res.json({ success: true, results })
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message })
  }
}

module.exports = { getPlatforms, connectPlatform, disconnectPlatform, syncPlatform, refreshToken, syncAll }
