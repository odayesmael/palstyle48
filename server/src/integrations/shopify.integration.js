// ─── Shopify Integration ──────────────────────────────────────────────────────
// Auth: Admin API Token (Custom App)
// API: Admin REST 2024-07
// Rate limit: Leaky bucket — 2 calls/second (40 calls/20s bucket)

const BaseIntegration = require('./base.integration')
const { tokenManager } = require('./token-manager')

const API_VERSION  = '2024-07'
// Shopify leaky bucket: bucket size 80, leak rate 2/sec → safe at 2/sec
const RATE_MAX     = 2
const RATE_WINDOW  = 1000  // 1 second

class ShopifyIntegration extends BaseIntegration {
  constructor() {
    super('shopify')
    this.accessToken = null
    this.shop        = null
    this._bucket     = { calls: 0, ts: Date.now() }
  }

  get _baseUrl() {
    return `https://${this.shop}/admin/api/${API_VERSION}`
  }

  get _headers() {
    return {
      'X-Shopify-Access-Token': this.accessToken,
      'Content-Type': 'application/json',
    }
  }

  // ─── Base interface ───────────────────────────────────────────────────────

  async connect(credentials = {}) {
    const { accessToken, shop } = credentials
    let token = accessToken, store = shop

    if (!token || !store) {
      const saved = await tokenManager.getTokens('shopify')
      token = token || saved?.accessToken
      store = store || saved?.metadata?.shop
    }
    if (!token || !store) throw new Error('Shopify: accessToken and shop are required')

    this.accessToken = token
    this.shop        = store

    await this.testConnection()
    await tokenManager.saveTokens('shopify', { accessToken: token, metadata: { shop: store } })
    this._markConnected()
    return { connected: true, shop: store }
  }

  async disconnect() {
    await tokenManager.clearTokens('shopify')
    this.accessToken = null
    this.shop        = null
    this._markDisconnected()
  }

  async testConnection() {
    const data = await this._get('/shop.json')
    return { valid: true, shopName: data.shop?.name, plan: data.shop?.plan_name }
  }

  async refreshToken() {
    // Shopify custom app tokens don't expire — no refresh needed
    return { refreshed: false, reason: 'Shopify custom app tokens do not expire' }
  }

  // ─── BaseIntegration data methods ─────────────────────────────────────────

  async getCustomers({ limit = 50, sinceId, pageInfo } = {}) {
    const params = { limit }
    if (sinceId)  params.since_id   = sinceId
    if (pageInfo) params.page_info   = pageInfo
    const data = await this._get('/customers.json', params)
    return { data: data.customers || [], total: data.customers?.length || 0 }
  }

  async getOrders({ limit = 50, status = 'any', sinceId, financialStatus, fulfillmentStatus } = {}) {
    const params = { limit, status }
    if (sinceId)            params.since_id             = sinceId
    if (financialStatus)    params.financial_status      = financialStatus
    if (fulfillmentStatus)  params.fulfillment_status    = fulfillmentStatus
    const data = await this._get('/orders.json', params)
    return { data: data.orders || [], total: data.orders?.length || 0 }
  }

  async getProducts({ limit = 50, sinceId, collectionId, status = 'active' } = {}) {
    const params = { limit, status }
    if (sinceId)      params.since_id      = sinceId
    if (collectionId) params.collection_id = collectionId
    const data = await this._get('/products.json', params)
    return { data: data.products || [], total: data.products?.length || 0 }
  }

  async syncAll() {
    const results = {}
    try { results.orders    = await this.getOrders({ limit: 100 })    } catch (e) { results.orders    = { error: e.message } }
    try { results.products  = await this.getProducts({ limit: 100 })  } catch (e) { results.products  = { error: e.message } }
    try { results.customers = await this.getCustomers({ limit: 100 }) } catch (e) { results.customers = { error: e.message } }
    this._markSynced()
    return results
  }

  // ─── Shopify-specific ─────────────────────────────────────────────────────

  /** Get inventory levels at a specific location */
  async getInventoryLevels({ locationId, limit = 250 } = {}) {
    const params = { limit }
    if (locationId) params.location_ids = locationId
    const data = await this._get('/inventory_levels.json', params)
    return data.inventory_levels || []
  }

  /** Update inventory quantity for a variant */
  async updateInventory({ inventoryItemId, locationId, quantity } = {}) {
    return this._post('/inventory_levels/set.json', {
      inventory_item_id: inventoryItemId,
      location_id:       locationId,
      available:         quantity,
    })
  }

  /** Get all store locations */
  async getLocations() {
    const data = await this._get('/locations.json')
    return data.locations || []
  }

  /** Get a single order by ID */
  async getOrder(orderId) {
    const data = await this._get(`/orders/${orderId}.json`)
    return data.order
  }

  /** Update an order (e.g., add tags) */
  async updateOrder(orderId, updates = {}) {
    return this._put(`/orders/${orderId}.json`, { order: updates })
  }

  /** Create a webhook subscription */
  async createWebhook({ topic, address, format = 'json' } = {}) {
    return this._post('/webhooks.json', { webhook: { topic, address, format } })
  }

  /** List existing webhooks */
  async getWebhooks() {
    const data = await this._get('/webhooks.json')
    return data.webhooks || []
  }

  // ─── HTTP helpers with leaky-bucket rate limiting ─────────────────────────

  async _waitForBucket() {
    const now = Date.now()
    if (now - this._bucket.ts >= RATE_WINDOW) {
      this._bucket = { calls: 0, ts: now }
    }
    if (this._bucket.calls >= RATE_MAX) {
      const wait = RATE_WINDOW - (now - this._bucket.ts)
      await new Promise(r => setTimeout(r, wait + 50))
      this._bucket = { calls: 0, ts: Date.now() }
    }
    this._bucket.calls++
  }

  async _get(path, params = {}) {
    await this._waitForBucket()
    const url = new URL(`${this._baseUrl}${path}`)
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined) url.searchParams.set(k, v)
    })
    return this._fetch(url.toString(), { headers: this._headers })
  }

  async _post(path, body = {}) {
    await this._waitForBucket()
    return this._fetch(`${this._baseUrl}${path}`, {
      method:  'POST',
      headers: this._headers,
      body:    JSON.stringify(body),
    })
  }

  async _put(path, body = {}) {
    await this._waitForBucket()
    return this._fetch(`${this._baseUrl}${path}`, {
      method:  'PUT',
      headers: this._headers,
      body:    JSON.stringify(body),
    })
  }
}

module.exports = ShopifyIntegration
