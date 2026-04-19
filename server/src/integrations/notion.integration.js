// ─── Notion Integration ───────────────────────────────────────────────────────
// Auth: Internal Integration Token (Bearer)
// API: Notion API v1 — https://developers.notion.com

const BaseIntegration = require('./base.integration')
const { tokenManager } = require('./token-manager')

const BASE_URL       = 'https://api.notion.com/v1'
const NOTION_VERSION = '2022-06-28'

class NotionIntegration extends BaseIntegration {
  constructor() {
    super('notion')
    this.token = null
  }

  get _headers() {
    return {
      Authorization:    `Bearer ${this.token}`,
      'Content-Type':   'application/json',
      'Notion-Version': NOTION_VERSION,
    }
  }

  // ─── Base interface ───────────────────────────────────────────────────────

  async connect(credentials = {}) {
    let { token } = credentials
    if (!token) {
      const saved = await tokenManager.getTokens('notion')
      token = saved?.accessToken
    }
    if (!token) throw new Error('Notion: integration token required')

    this.token = token
    await this.testConnection()
    await tokenManager.saveTokens('notion', { accessToken: token })
    this._markConnected()
    return { connected: true }
  }

  async disconnect() {
    await tokenManager.clearTokens('notion')
    this.token = null
    this._markDisconnected()
  }

  async testConnection() {
    const data = await this._get('/users/me')
    return { valid: true, botId: data.id, name: data.name, type: data.type }
  }

  async refreshToken() {
    // Internal integration tokens don't expire
    return { refreshed: false, reason: 'Notion internal tokens do not expire' }
  }

  async getCustomers(_options = {}) {
    return { data: [], total: 0 }
  }

  async getOrders(_options = {}) {
    return { data: [], total: 0 }
  }

  async getProducts(_options = {}) {
    return { data: [], total: 0 }
  }

  async syncAll() {
    const results = {}
    try { results.databases = await this.getDatabases() } catch (e) { results.databases = { error: e.message } }
    this._markSynced()
    return results
  }

  // ─── Notion-specific ──────────────────────────────────────────────────────

  /** Search for all databases the integration has access to */
  async getDatabases({ query = '' } = {}) {
    const data = await this._post('/search', {
      filter: { value: 'database', property: 'object' },
      query,
      sort: { direction: 'descending', timestamp: 'last_edited_time' },
    })
    return (data.results || []).map(db => ({
      id:    db.id,
      title: db.title?.[0]?.plain_text || 'Untitled',
      url:   db.url,
    }))
  }

  /** Search for pages */
  async getPages({ query = '' } = {}) {
    const data = await this._post('/search', {
      filter: { value: 'page', property: 'object' },
      query,
    })
    return data.results || []
  }

  /** Query a database with optional filter/sorts */
  async queryDatabase(databaseId, { filter, sorts, pageSize = 100, startCursor } = {}) {
    const body = { page_size: pageSize }
    if (filter)      body.filter      = filter
    if (sorts)       body.sorts       = sorts
    if (startCursor) body.start_cursor = startCursor
    const data = await this._post(`/databases/${databaseId}/query`, body)
    return {
      results:    data.results || [],
      hasMore:    data.has_more,
      nextCursor: data.next_cursor,
    }
  }

  /** Create a new page in a database */
  async createPage(databaseId, { properties, children = [], icon, cover } = {}) {
    const body = {
      parent:     { database_id: databaseId },
      properties: properties || {},
      children,
    }
    if (icon)  body.icon  = icon
    if (cover) body.cover = cover
    return this._post('/pages', body)
  }

  /** Update a page's properties */
  async updatePage(pageId, { properties, archived } = {}) {
    const body = {}
    if (properties !== undefined) body.properties = properties
    if (archived   !== undefined) body.archived   = archived
    return this._patch(`/pages/${pageId}`, body)
  }

  /** Retrieve a page */
  async getPage(pageId) {
    return this._get(`/pages/${pageId}`)
  }

  /** Get page content (blocks) */
  async getPageBlocks(blockId, { pageSize = 100 } = {}) {
    return this._get(`/blocks/${blockId}/children`, { page_size: pageSize })
  }

  /** Append blocks to a page */
  async appendBlocks(blockId, children = []) {
    return this._patch(`/blocks/${blockId}/children`, { children })
  }

  /** Get a database schema */
  async getDatabase(databaseId) {
    return this._get(`/databases/${databaseId}`)
  }

  // ─── HTTP helpers ─────────────────────────────────────────────────────────

  async _get(path, params = {}) {
    const url = new URL(`${BASE_URL}${path}`)
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined) url.searchParams.set(k, v)
    })
    return this._fetch(url.toString(), { headers: this._headers })
  }

  async _post(path, body = {}) {
    return this._fetch(`${BASE_URL}${path}`, {
      method:  'POST',
      headers: this._headers,
      body:    JSON.stringify(body),
    })
  }

  async _patch(path, body = {}) {
    return this._fetch(`${BASE_URL}${path}`, {
      method:  'PATCH',
      headers: this._headers,
      body:    JSON.stringify(body),
    })
  }
}

module.exports = NotionIntegration
