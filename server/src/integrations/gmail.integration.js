// ─── Gmail Integration ────────────────────────────────────────────────────────
// Auth: Google OAuth 2.0
// Scopes: gmail.readonly, gmail.send, gmail.modify
// Uses Gmail REST API v1 (no SDK — raw fetch)

const BaseIntegration = require('./base.integration')
const { tokenManager } = require('./token-manager')

const BASE_URL    = 'https://gmail.googleapis.com/gmail/v1/users'
const TOKEN_URL   = 'https://oauth2.googleapis.com/token'

class GmailIntegration extends BaseIntegration {
  constructor() {
    super('gmail')
    this.accessToken  = null
    this.refreshTokenVal = null
    this.userId       = 'me'
  }

  // ─── Base interface ───────────────────────────────────────────────────────

  async connect(credentials = {}) {
    let { accessToken, refreshToken } = credentials

    if (!accessToken) {
      const saved = await tokenManager.getTokens('gmail')
      accessToken  = saved?.accessToken
      refreshToken = refreshToken || saved?.refreshToken
    }
    if (!accessToken && !refreshToken) {
      throw new Error('Gmail: accessToken or refreshToken required')
    }

    this.refreshTokenVal = refreshToken
    this.accessToken     = accessToken

    if (!accessToken && refreshToken) {
      await this._doRefresh()
    }

    await this.testConnection()
    await tokenManager.saveTokens('gmail', {
      accessToken:  this.accessToken,
      refreshToken: this.refreshTokenVal,
      expiresAt:    new Date(Date.now() + 3600 * 1000),  // 1-hour expiry
    })
    this._markConnected()
    return { connected: true }
  }

  async disconnect() {
    await tokenManager.clearTokens('gmail')
    this.accessToken = this.refreshTokenVal = null
    this._markDisconnected()
  }

  async testConnection() {
    const profile = await this._get(`/${this.userId}/profile`)
    return { valid: true, email: profile.emailAddress, totalMessages: profile.messagesTotal }
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
        client_id:     process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        refresh_token: this.refreshTokenVal,
        grant_type:    'refresh_token',
      }),
    })
    if (!res.ok) throw new Error(`Gmail token refresh failed: ${res.status}`)
    const data  = await res.json()
    this.accessToken = data.access_token
    await tokenManager.saveTokens('gmail', {
      accessToken:  this.accessToken,
      refreshToken: this.refreshTokenVal,
      expiresAt:    new Date(Date.now() + data.expires_in * 1000),
    })
  }

  // ─── Base data methods ────────────────────────────────────────────────────

  async getCustomers(_options = {}) {
    // Extract unique senders from recent emails as "customers"
    const msgs = await this.getMessages({ maxResults: 100 })
    const senders = new Map()
    for (const msg of msgs) {
      const from = msg.payload?.headers?.find(h => h.name === 'From')?.value
      if (from && !senders.has(from)) senders.set(from, { email: from })
    }
    return { data: Array.from(senders.values()), total: senders.size }
  }

  async getOrders(_options = {}) {
    return { data: [], total: 0 }
  }

  async getProducts(_options = {}) {
    return { data: [], total: 0 }
  }

  async syncAll() {
    const results = {}
    try { results.messages = await this.getMessages({ maxResults: 50 }) } catch (e) { results.messages = { error: e.message } }
    try { results.labels   = await this.getLabels()                      } catch (e) { results.labels   = { error: e.message } }
    this._markSynced()
    return results
  }

  // ─── Gmail-specific ───────────────────────────────────────────────────────

  /**
   * List messages matching a query
   * @param {string} query         - Gmail search query (e.g. "is:unread from:@example.com")
   * @param {number} maxResults    - Max number of messages (default 20)
   * @param {boolean} withPayload  - If true, fetch full message body
   */
  async getMessages({ query = 'in:inbox', maxResults = 20, withPayload = false } = {}) {
    const list = await this._get(`/${this.userId}/messages`, { q: query, maxResults })
    if (!list.messages?.length) return []

    if (!withPayload) return list.messages

    // Batch fetch full messages
    const full = await Promise.allSettled(
      list.messages.slice(0, maxResults).map(m => this.getMessage(m.id))
    )
    return full.filter(r => r.status === 'fulfilled').map(r => r.value)
  }

  /** Get a single message with full payload */
  async getMessage(messageId) {
    return this._get(`/${this.userId}/messages/${messageId}`, { format: 'full' })
  }

  /** Send an email */
  async sendMessage({ to, subject, body, html = false, replyToId } = {}) {
    const headers = [
      `To: ${to}`,
      `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
      'MIME-Version: 1.0',
      `Content-Type: ${html ? 'text/html' : 'text/plain'}; charset="UTF-8"`,
    ]
    if (replyToId) {
      const orig = await this.getMessage(replyToId)
      const threadId = orig.threadId
      const msgId    = orig.payload?.headers?.find(h => h.name === 'Message-ID')?.value
      if (msgId) headers.push(`In-Reply-To: ${msgId}`, `References: ${msgId}`)
      const raw = Buffer.from(headers.join('\r\n') + '\r\n\r\n' + body).toString('base64url')
      return this._post(`/${this.userId}/messages/send`, { raw, threadId })
    }
    const raw = Buffer.from(headers.join('\r\n') + '\r\n\r\n' + body).toString('base64url')
    return this._post(`/${this.userId}/messages/send`, { raw })
  }

  /** Reply to an existing message */
  async replyToMessage(messageId, { body, html = false } = {}) {
    return this.sendMessage({ body, html, replyToId: messageId, to: '' })
  }

  /** Get all labels in the mailbox */
  async getLabels() {
    const data = await this._get(`/${this.userId}/labels`)
    return data.labels || []
  }

  /** Apply label to a message */
  async addLabel(messageId, labelId) {
    return this._post(`/${this.userId}/messages/${messageId}/modify`, {
      addLabelIds: [labelId],
    })
  }

  /** Mark message as read */
  async markRead(messageId) {
    return this._post(`/${this.userId}/messages/${messageId}/modify`, {
      removeLabelIds: ['UNREAD'],
    })
  }

  /** Get thread */
  async getThread(threadId) {
    return this._get(`/${this.userId}/threads/${threadId}`, { format: 'full' })
  }

  // ─── HTTP helpers ─────────────────────────────────────────────────────────

  async _get(path, params = {}) {
    const url = new URL(`${BASE_URL}${path}`)
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined) url.searchParams.set(k, v)
    })
    return this._fetch(url.toString(), {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    })
  }

  async _post(path, body = {}) {
    return this._fetch(`${BASE_URL}${path}`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${this.accessToken}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    })
  }
}

module.exports = GmailIntegration
