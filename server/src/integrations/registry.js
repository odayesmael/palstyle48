// ─── Integration Registry — Singleton ─────────────────────────────────────────
// The single source of truth for all platform integrations.
// Any part of the system that needs to talk to a platform goes through here.
//
// Usage:
//   const { registry } = require('./integrations/registry')
//   const shopify = registry.getIntegration('shopify')
//   await shopify.getOrders()

const MetaIntegration     = require('./meta.integration')
const ShopifyIntegration  = require('./shopify.integration')
const TrendyolIntegration = require('./trendyol.integration')
const GmailIntegration    = require('./gmail.integration')
const NotionIntegration   = require('./notion.integration')
const CanvaIntegration    = require('./canva.integration')
const { tokenManager }    = require('./token-manager')
const prisma              = require('../lib/prisma')

class IntegrationRegistry {
  constructor() {
    this._integrations = new Map()
    this._initialized  = false
    this._autoRefreshTimer = null
  }

  // ─── Supported platforms ──────────────────────────────────────────────────

  static get SUPPORTED() {
    return ['meta', 'shopify', 'trendyol', 'gmail', 'notion', 'canva']
  }

  // ─── Initialization ───────────────────────────────────────────────────────

  /**
   * Initialize all integrations from stored credentials.
   * Call this once during server startup.
   */
  async init() {
    if (this._initialized) return

    // Create integration instances
    this._integrations.set('meta',     new MetaIntegration())
    this._integrations.set('shopify',  new ShopifyIntegration())
    this._integrations.set('trendyol', new TrendyolIntegration())
    this._integrations.set('gmail',    new GmailIntegration())
    this._integrations.set('notion',   new NotionIntegration())
    this._integrations.set('canva',    new CanvaIntegration())

    // Try to re-connect platforms that were previously connected
    const connected = await prisma.platform.findMany({ where: { isConnected: true } })
    const results   = []

    for (const platform of connected) {
      try {
        const integration = this._integrations.get(platform.name)
        if (!integration) continue
        await integration.connect({})  // loads from token-manager
        results.push({ platform: platform.name, status: 'connected' })
        console.log(`[Registry] ✅ Auto-connected: ${platform.name}`)
      } catch (err) {
        results.push({ platform: platform.name, status: 'failed', error: err.message })
        console.warn(`[Registry] ⚠️  Could not auto-connect ${platform.name}: ${err.message}`)
      }
    }

    // Start hourly token auto-refresh
    this._startAutoRefresh()

    this._initialized = true
    console.log(`[Registry] 🚀 Initialized — ${results.filter(r => r.status === 'connected').length}/${connected.length} platforms connected`)
    return results
  }

  // ─── Core API ─────────────────────────────────────────────────────────────

  /**
   * Get an integration instance by platform name.
   * @param {string} platformName
   * @returns {BaseIntegration}
   */
  getIntegration(platformName) {
    const integration = this._integrations.get(platformName)
    if (!integration) {
      throw new Error(`[Registry] Unknown platform: "${platformName}". Supported: ${IntegrationRegistry.SUPPORTED.join(', ')}`)
    }
    return integration
  }

  /**
   * Returns all currently connected integrations.
   * @returns {Array<{ name, integration }>}
   */
  getAllConnected() {
    return Array.from(this._integrations.entries())
      .filter(([, integration]) => integration._connected)
      .map(([name, integration]) => ({ name, integration }))
  }

  /**
   * Returns all integrations (connected + disconnected) with their status.
   */
  getAllStatus() {
    return Array.from(this._integrations.entries()).map(([name, integration]) => ({
      name,
      ...integration.getStatus(),
    }))
  }

  /**
   * Connect a platform with provided credentials.
   * @param {string} platformName
   * @param {object} credentials
   */
  async connectPlatform(platformName, credentials = {}) {
    const integration = this.getIntegration(platformName)
    const result = await integration.connect(credentials)
    console.log(`[Registry] 🔗 Connected: ${platformName}`)
    return result
  }

  /**
   * Disconnect a platform.
   * @param {string} platformName
   */
  async disconnectPlatform(platformName) {
    const integration = this.getIntegration(platformName)
    await integration.disconnect()
    console.log(`[Registry] ⚡ Disconnected: ${platformName}`)
  }

  /**
   * Sync all connected platforms.
   * @returns {object} Results keyed by platform name
   */
  async syncAllPlatforms() {
    const connected = this.getAllConnected()
    const results   = {}

    await Promise.allSettled(
      connected.map(async ({ name, integration }) => {
        try {
          results[name] = { status: 'syncing' }
          results[name] = { status: 'done', data: await integration.syncAll() }
        } catch (err) {
          results[name] = { status: 'error', error: err.message }
        }
      })
    )

    await prisma.setupState.updateMany({
      where: { id: 'singleton' },
      data:  { lastSync: new Date() },
    })

    console.log(`[Registry] 🔄 Sync complete — ${Object.keys(results).length} platforms`)
    return results
  }

  /**
   * Sync a single platform.
   * @param {string} platformName
   */
  async syncPlatform(platformName) {
    const integration = this.getIntegration(platformName)
    if (!integration._connected) throw new Error(`${platformName} is not connected`)
    const result = await integration.syncAll()
    await prisma.platform.updateMany({ where: { name: platformName }, data: { lastSync: new Date() } })
    return result
  }

  /**
   * Refresh token for a single platform.
   * @param {string} platformName
   */
  async refreshPlatformToken(platformName) {
    const integration = this.getIntegration(platformName)
    return integration.refreshToken()
  }

  // ─── Unified data access ──────────────────────────────────────────────────

  /**
   * Get customers across all connected platforms.
   */
  async getAllCustomers(options = {}) {
    const results = {}
    for (const { name, integration } of this.getAllConnected()) {
      try { results[name] = await integration.getCustomers(options) } catch { results[name] = [] }
    }
    return results
  }

  /**
   * Get orders across all connected platforms.
   */
  async getAllOrders(options = {}) {
    const results = {}
    for (const { name, integration } of this.getAllConnected()) {
      try { results[name] = await integration.getOrders(options) } catch { results[name] = [] }
    }
    return results
  }

  // ─── Auto-refresh ─────────────────────────────────────────────────────────

  _startAutoRefresh() {
    if (this._autoRefreshTimer) return
    // Check every hour for expiring tokens
    this._autoRefreshTimer = setInterval(async () => {
      console.log('[Registry] ⏰ Auto-refresh check running...')
      await tokenManager.autoRefreshAll(this)
    }, 60 * 60 * 1000)
    // Don't block process exit
    if (this._autoRefreshTimer.unref) this._autoRefreshTimer.unref()
  }

  destroy() {
    if (this._autoRefreshTimer) {
      clearInterval(this._autoRefreshTimer)
      this._autoRefreshTimer = null
    }
  }
}

// ─── Export singleton ─────────────────────────────────────────────────────────
const registry = new IntegrationRegistry()
module.exports = { registry, IntegrationRegistry }
