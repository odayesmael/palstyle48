/**
 * Server-side in-memory cache
 * ───────────────────────────
 * DB is in Sydney AU — every query = ~300ms round-trip from Middle East.
 * This cache holds results in RAM: cache hit = <1ms instead of 300ms+.
 *
 * Usage:
 *   const { memCache } = require('../lib/memCache')
 *
 *   // In a route handler:
 *   const cached = memCache.get('dashboard')
 *   if (cached) return res.json(cached)
 *   // ...query DB...
 *   memCache.set('dashboard', result, 60_000) // 60s TTL
 *   res.json(result)
 */

class MemCache {
  constructor() {
    this._store = new Map()
  }

  get(key) {
    const entry = this._store.get(key)
    if (!entry) return null
    if (Date.now() > entry.expiresAt) {
      this._store.delete(key)
      return null
    }
    return entry.value
  }

  set(key, value, ttlMs = 60_000) {
    this._store.set(key, { value, expiresAt: Date.now() + ttlMs })
  }

  del(key) {
    this._store.delete(key)
  }

  // Invalidate all keys that contain a pattern
  invalidate(pattern) {
    for (const key of this._store.keys()) {
      if (key.includes(pattern)) this._store.delete(key)
    }
  }

  // Wrap an async function with cache
  async wrap(key, ttlMs, fn) {
    const hit = this.get(key)
    if (hit !== null) return hit
    const result = await fn()
    this.set(key, result, ttlMs)
    return result
  }
}

const memCache = new MemCache()
module.exports = { memCache }
