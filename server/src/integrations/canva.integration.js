// ─── Canva Integration ────────────────────────────────────────────────────────
// Auth: Canva Connect API — OAuth 2.0 (PKCE flow)
// API: https://api.canva.com/rest/v1
// Docs: https://www.canva.com/developers/docs/connect/

const BaseIntegration = require('./base.integration')
const { tokenManager } = require('./token-manager')

const BASE_URL   = 'https://api.canva.com/rest/v1'
const TOKEN_URL  = 'https://api.canva.com/rest/v1/oauth/token'
const AUTH_URL   = 'https://www.canva.com/api/oauth/authorize'

class CanvaIntegration extends BaseIntegration {
  constructor() {
    super('canva')
    this.accessToken  = null
    this.refreshTokenVal = null
  }

  get _headers() {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
    }
  }

  // ─── Base interface ───────────────────────────────────────────────────────

  async connect(credentials = {}) {
    let { accessToken, refreshToken } = credentials

    if (!accessToken) {
      const saved = await tokenManager.getTokens('canva')
      accessToken  = saved?.accessToken
      refreshToken = refreshToken || saved?.refreshToken
    }
    if (!accessToken && !refreshToken) {
      throw new Error('Canva: accessToken or refreshToken required (complete OAuth flow first)')
    }

    this.accessToken     = accessToken
    this.refreshTokenVal = refreshToken

    if (!accessToken && refreshToken) {
      await this._doRefresh()
    }

    await this.testConnection()
    await tokenManager.saveTokens('canva', {
      accessToken:  this.accessToken,
      refreshToken: this.refreshTokenVal,
      expiresAt:    new Date(Date.now() + 3600 * 1000),
    })
    this._markConnected()
    return { connected: true }
  }

  async disconnect() {
    await tokenManager.clearTokens('canva')
    this.accessToken = this.refreshTokenVal = null
    this._markDisconnected()
  }

  async testConnection() {
    const data = await this._get('/users/me')
    return { valid: true, userId: data.user?.id, displayName: data.user?.display_name }
  }

  async refreshToken() {
    await this._doRefresh()
    return { refreshed: true }
  }

  async _doRefresh() {
    const res = await fetch(TOKEN_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'refresh_token',
        refresh_token: this.refreshTokenVal,
        client_id:     process.env.CANVA_CLIENT_ID,
        client_secret: process.env.CANVA_CLIENT_SECRET,
      }),
    })
    if (!res.ok) throw new Error(`Canva token refresh failed: ${res.status}`)
    const data = await res.json()
    this.accessToken     = data.access_token
    this.refreshTokenVal = data.refresh_token || this.refreshTokenVal
    await tokenManager.saveTokens('canva', {
      accessToken:  this.accessToken,
      refreshToken: this.refreshTokenVal,
      expiresAt:    new Date(Date.now() + data.expires_in * 1000),
    })
  }

  async getCustomers(_options = {}) { return { data: [], total: 0 } }
  async getOrders(_options = {})    { return { data: [], total: 0 } }
  async getProducts(_options = {})  { return { data: [], total: 0 } }

  async syncAll() {
    const results = {}
    try { results.designs = await this.getDesigns() } catch (e) { results.designs = { error: e.message } }
    this._markSynced()
    return results
  }

  // ─── OAuth helper ──────────────────────────────────────────────────────────

  /**
   * Generate the authorization URL for the OAuth PKCE flow.
   * Call this when initiating the connect from the frontend.
   */
  getAuthUrl({ redirectUri, scopes = ['design:content:read', 'design:meta:read', 'asset:read'], state = '' } = {}) {
    const params = new URLSearchParams({
      client_id:     process.env.CANVA_CLIENT_ID,
      redirect_uri:  redirectUri,
      response_type: 'code',
      scope:         scopes.join(' '),
      state,
    })
    return `${AUTH_URL}?${params}`
  }

  /**
   * Exchange authorization code for tokens.
   */
  async exchangeCode({ code, redirectUri, codeVerifier } = {}) {
    const res = await fetch(TOKEN_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'authorization_code',
        code,
        redirect_uri:  redirectUri,
        client_id:     process.env.CANVA_CLIENT_ID,
        client_secret: process.env.CANVA_CLIENT_SECRET,
        ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
      }),
    })
    if (!res.ok) throw new Error(`Canva code exchange failed: ${res.status}`)
    const data = await res.json()
    this.accessToken     = data.access_token
    this.refreshTokenVal = data.refresh_token
    return data
  }

  // ─── Canva-specific ───────────────────────────────────────────────────────

  /** List all designs accessible by the user */
  async getDesigns({ limit = 50, continuation, ownershipType = 'owned' } = {}) {
    const params = { limit, ownership_type: ownershipType }
    if (continuation) params.continuation = continuation
    const data = await this._get('/designs', params)
    return {
      designs:      data.items || [],
      continuation: data.continuation,
    }
  }

  /** Get a single design by ID */
  async getDesign(designId) {
    return this._get(`/designs/${designId}`)
  }

  /**
   * Create a design from a template
   * @param {string} templateId - Canva template ID
   * @param {object} data       - Template field values
   */
  async createDesign({ title, width, height, templateId } = {}) {
    const body = { title }
    if (width && height) body.design_type = { name: 'custom', width, height }
    if (templateId)      body.template_id  = templateId
    return this._post('/designs', body)
  }

  /**
   * Export a design in a given format
   * @param {string} designId
   * @param {'pdf'|'png'|'jpg'|'gif'|'mp4'} format
   */
  async exportDesign(designId, format = 'png') {
    // Step 1: Create export
    const exportRes = await this._post(`/designs/${designId}/exports`, {
      format: {
        type: format.toUpperCase(),
        ...(format === 'pdf' ? { export_quality: 'regular' } : {}),
      },
    })
    const exportId = exportRes.job?.id
    if (!exportId) throw new Error('Canva: export job creation failed')

    // Step 2: Poll until completed (simplified — max 10 attempts)
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 2000))
      const status = await this._get(`/exports/${exportId}`)
      if (status.job?.status === 'success') {
        return { url: status.job?.urls?.[0], exportId }
      }
      if (status.job?.status === 'failed') throw new Error('Canva: export failed')
    }
    throw new Error('Canva: export timed out')
  }

  /** List all assets (uploaded images, videos) */
  async getAssets({ limit = 50, continuation } = {}) {
    const params = { limit }
    if (continuation) params.continuation = continuation
    const data = await this._get('/assets', params)
    return { assets: data.items || [], continuation: data.continuation }
  }

  /** Upload an asset */
  async uploadAsset({ name, mimeType, data } = {}) {
    // data: Buffer or base64 string
    const res = await fetch(`${BASE_URL}/assets/upload`, {
      method:  'POST',
      headers: {
        Authorization:    `Bearer ${this.accessToken}`,
        'Content-Type':   mimeType,
        'Asset-Upload-Metadata': JSON.stringify({ name_base64: Buffer.from(name).toString('base64') }),
      },
      body: Buffer.isBuffer(data) ? data : Buffer.from(data, 'base64'),
    })
    if (!res.ok) throw new Error(`Canva: asset upload failed ${res.status}`)
    return res.json()
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
}

module.exports = CanvaIntegration
