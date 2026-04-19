// ─── Meta Integration ─────────────────────────────────────────────────────────
// Covers: Facebook Pages, Instagram Business, WhatsApp Business API
// Auth: Long-Lived User Access Token (OAuth 2.0)

const BaseIntegration = require('./base.integration')
const { tokenManager } = require('./token-manager')

const API_VERSION = 'v21.0'
const BASE_URL    = `https://graph.facebook.com/${API_VERSION}`
// Rate limit: 200 calls per hour per token (Meta Graph API standard tier)
const RATE_MAX    = 200
const RATE_WINDOW = 60 * 60 * 1000  // 1 hour

class MetaIntegration extends BaseIntegration {
  constructor() {
    super('meta')
    this.accessToken = null
    this.pageTokens  = {}   // { pageId: pageToken }
  }

  // ─── Base interface ───────────────────────────────────────────────────────

  async connect(credentials = {}) {
    const { accessToken } = credentials

    if (!accessToken) {
      // Try to load from DB
      const saved = await tokenManager.getTokens('meta')
      if (!saved?.accessToken) throw new Error('Meta: accessToken required')
      this.accessToken = saved.accessToken
    } else {
      this.accessToken = accessToken
    }

    // Validate token
    await this.testConnection()

    // Exchange for long-lived token if needed (60-day expiry)
    await tokenManager.saveTokens('meta', {
      accessToken: this.accessToken,
      expiresAt:   new Date(Date.now() + 50 * 24 * 60 * 60 * 1000), // 50 days
    })
    this._markConnected()
    return { connected: true }
  }

  async disconnect() {
    await tokenManager.clearTokens('meta')
    this.accessToken = null
    this.pageTokens  = {}
    this._markDisconnected()
  }

  async testConnection() {
    const data = await this._get('/me', { fields: 'id,name' })
    return { valid: true, userId: data.id, name: data.name }
  }

  async refreshToken() {
    if (!this.accessToken) throw new Error('Meta: no token to refresh')
    const appId     = process.env.META_APP_ID
    const appSecret = process.env.META_APP_SECRET
    const data = await this._get('/oauth/access_token', {
      grant_type:        'fb_exchange_token',
      client_id:         appId,
      client_secret:     appSecret,
      fb_exchange_token: this.accessToken,
    })
    this.accessToken = data.access_token
    await tokenManager.saveTokens('meta', {
      accessToken: this.accessToken,
      expiresAt:   new Date(Date.now() + 50 * 24 * 60 * 60 * 1000),
    })
    return { refreshed: true }
  }

  async getCustomers(_options = {}) {
    // Meta doesn't have a "customers" concept — return empty
    return { data: [], total: 0 }
  }

  async getOrders(_options = {}) {
    // Meta Commerce (Shops) — not in scope yet
    return { data: [], total: 0 }
  }

  async getProducts(_options = {}) {
    // Meta Catalog products
    return { data: [], total: 0 }
  }

  async syncAll() {
    const results = {}
    try { results.pages    = await this.getPages()           } catch (e) { results.pages    = { error: e.message } }
    try { results.messages = await this.getMessages('all')   } catch (e) { results.messages = { error: e.message } }
    this._markSynced()
    return results
  }

  // ─── Meta-specific API ────────────────────────────────────────────────────

  /** Get all pages managed by this token */
  async getPages() {
    const data = await this._get('/me/accounts', { fields: 'id,name,access_token,category,followers_count' })
    // Cache page tokens
    data.data?.forEach(p => { this.pageTokens[p.id] = p.access_token })
    return data.data || []
  }

  /** Get page insights */
  async getInsights(pageId, metrics = ['page_impressions','page_engaged_users'], period = 'day') {
    this._checkRateLimit(RATE_MAX, RATE_WINDOW)
    const token = this.pageTokens[pageId] || this.accessToken
    return this._get(`/${pageId}/insights`, {
      metric: metrics.join(','),
      period,
      access_token: token,
    })
  }

  /** Get followers for a page */
  async getPageFollowers(pageId) {
    this._checkRateLimit(RATE_MAX, RATE_WINDOW)
    const token = this.pageTokens[pageId] || this.accessToken
    return this._get(`/${pageId}`, { fields: 'followers_count,fan_count', access_token: token })
  }

  /** Publish a post to a Facebook Page */
  async publishPost(pageId, { message, link, mediaUrl } = {}) {
    this._checkRateLimit(RATE_MAX, RATE_WINDOW)
    const token = this.pageTokens[pageId] || this.accessToken
    return this._post(`/${pageId}/feed`, { message, link, access_token: token })
  }

  /** Publish an Instagram story */
  async publishStory(igUserId, { imageUrl, videoUrl } = {}) {
    this._checkRateLimit(RATE_MAX, RATE_WINDOW)
    // Step 1: Create media container
    const containerRes = await this._post(`/${igUserId}/media`, {
      image_url:    imageUrl,
      video_url:    videoUrl,
      media_type:   videoUrl ? 'REELS' : 'IMAGE',
      is_carousel_item: false,
    })
    // Step 2: Publish
    return this._post(`/${igUserId}/media_publish`, { creation_id: containerRes.id })
  }

  /** Publish an Instagram Reel */
  async publishReel(igUserId, { videoUrl, caption = '', shareToFeed = true } = {}) {
    this._checkRateLimit(RATE_MAX, RATE_WINDOW)
    const container = await this._post(`/${igUserId}/media`, {
      media_type: 'REELS',
      video_url:  videoUrl,
      caption,
      share_to_feed: shareToFeed,
    })
    // Poll until STATUS === FINISHED (simplified — in prod use polling loop)
    await new Promise(r => setTimeout(r, 8000))
    return this._post(`/${igUserId}/media_publish`, { creation_id: container.id })
  }

  /**
   * Get conversations/messages
   * @param {'ig'|'fb'|'wa'|'all'} platform
   */
  async getMessages(platform = 'all') {
    this._checkRateLimit(RATE_MAX, RATE_WINDOW)
    const pages = await this.getPages()
    const all   = []

    for (const page of pages.slice(0, 5)) {
      try {
        const convs = await this._get(`/${page.id}/conversations`, {
          fields:       'id,participants,updated_time,message_count',
          platform:     platform === 'all' ? undefined : platform,
          access_token: page.access_token,
        })
        all.push(...(convs.data || []))
      } catch {}
    }
    return all
  }

  /** Send a message via Messenger / Instagram DM */
  async sendMessage(platform = 'fb', recipientId, { text, templateId } = {}) {
    this._checkRateLimit(RATE_MAX, RATE_WINDOW)
    const endpoint = platform === 'wa'
      ? `/${process.env.WA_PHONE_NUMBER_ID}/messages`
      : '/me/messages'

    const body = platform === 'wa'
      ? { messaging_product: 'whatsapp', to: recipientId, type: 'text', text: { body: text } }
      : { recipient: { id: recipientId }, message: { text } }

    return this._post(endpoint, body)
  }

  /** Create an ad campaign */
  async createAdCampaign(adAccountId, { name, objective = 'OUTCOME_TRAFFIC', status = 'PAUSED', dailyBudget } = {}) {
    this._checkRateLimit(RATE_MAX, RATE_WINDOW)
    return this._post(`/act_${adAccountId}/campaigns`, { name, objective, status, daily_budget: dailyBudget })
  }

  /** Get campaign insights */
  async getAdInsights(campaignId, { datePreset = 'last_7d', fields } = {}) {
    this._checkRateLimit(RATE_MAX, RATE_WINDOW)
    const f = fields || 'impressions,clicks,spend,cpc,ctr,reach,frequency,actions'
    return this._get(`/${campaignId}/insights`, { fields: f, date_preset: datePreset })
  }

  // ─── HTTP helpers ─────────────────────────────────────────────────────────

  async _get(path, params = {}) {
    const url = new URL(`${BASE_URL}${path}`)
    url.searchParams.set('access_token', params.access_token || this.accessToken)
    Object.entries(params).forEach(([k, v]) => {
      if (k !== 'access_token' && v !== undefined) url.searchParams.set(k, v)
    })
    return this._fetch(url.toString())
  }

  async _post(path, body = {}) {
    const url = `${BASE_URL}${path}`
    return this._fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ access_token: this.accessToken, ...body }),
    })
  }
}

module.exports = MetaIntegration
