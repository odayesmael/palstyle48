// ─── Base Integration — Abstract Class ───────────────────────────────────────
// All platform integrations MUST extend this class and implement all methods.

class BaseIntegration {
  /**
   * @param {string} platformName - The platform identifier (e.g. 'meta', 'shopify')
   * @param {object} config       - Platform credentials and settings
   */
  constructor(platformName, config = {}) {
    if (new.target === BaseIntegration) {
      throw new Error('BaseIntegration is abstract and cannot be instantiated directly.')
    }
    this.platformName = platformName
    this.config = config
    this._connected = false
    this._lastError = null
    this._lastSync = null
    this._rateLimitState = { calls: 0, windowStart: Date.now() }
  }

  // ─── Abstract methods (must be implemented) ──────────────────────────────

  /** Connect to the platform using provided credentials */
  async connect(_credentials) {
    throw new Error(`${this.platformName}.connect() not implemented`)
  }

  /** Disconnect from the platform */
  async disconnect() {
    throw new Error(`${this.platformName}.disconnect() not implemented`)
  }

  /** Test if the connection is still valid */
  async testConnection() {
    throw new Error(`${this.platformName}.testConnection() not implemented`)
  }

  /** Refresh the access token */
  async refreshToken() {
    throw new Error(`${this.platformName}.refreshToken() not implemented`)
  }

  /** Fetch customers from the platform */
  async getCustomers(_options = {}) {
    throw new Error(`${this.platformName}.getCustomers() not implemented`)
  }

  /** Fetch orders from the platform */
  async getOrders(_options = {}) {
    throw new Error(`${this.platformName}.getOrders() not implemented`)
  }

  /** Fetch products from the platform */
  async getProducts(_options = {}) {
    throw new Error(`${this.platformName}.getProducts() not implemented`)
  }

  /** Sync all available data from the platform */
  async syncAll() {
    throw new Error(`${this.platformName}.syncAll() not implemented`)
  }

  // ─── Concrete helpers (available to all subclasses) ──────────────────────

  /** Returns current integration status */
  getStatus() {
    return {
      platform:    this.platformName,
      connected:   this._connected,
      lastSync:    this._lastSync,
      lastError:   this._lastError ? this._lastError.message : null,
      rateLimit:   this._rateLimitState,
    }
  }

  /**
   * Rate limiter helper — subclasses call this before each API request.
   * @param {number} maxCalls     - Allowed calls per window
   * @param {number} windowMs     - Window size in milliseconds
   */
  _checkRateLimit(maxCalls, windowMs) {
    const now = Date.now()
    if (now - this._rateLimitState.windowStart > windowMs) {
      this._rateLimitState = { calls: 0, windowStart: now }
    }
    if (this._rateLimitState.calls >= maxCalls) {
      const wait = windowMs - (now - this._rateLimitState.windowStart)
      throw new Error(`Rate limit exceeded for ${this.platformName}. Retry in ${Math.ceil(wait / 1000)}s.`)
    }
    this._rateLimitState.calls++
  }

  /** Standardised fetch wrapper used by subclasses */
  async _fetch(url, options = {}) {
    const res = await fetch(url, options)
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      const err = new Error(`[${this.platformName}] HTTP ${res.status}: ${body.slice(0, 200)}`)
      err.status = res.status
      this._lastError = err
      throw err
    }
    return res.json()
  }

  /** Mark as connected */
  _markConnected() {
    this._connected = true
    this._lastError = null
  }

  /** Mark as disconnected */
  _markDisconnected() {
    this._connected = false
  }

  /** Update last sync timestamp */
  _markSynced() {
    this._lastSync = new Date().toISOString()
  }
}

module.exports = BaseIntegration
