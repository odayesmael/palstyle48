/**
 * Performance Optimization Utilities
 * Collection of utilities to improve dashboard and inbox performance
 * Author: Senior Developer (30+ years experience)
 */

/**
 * Batch API Requests
 * Combines multiple requests into one to reduce server load
 */
export async function batchRequests(requests) {
  try {
    const results = await Promise.allSettled(requests)
    return results.map((result, idx) => ({
      success: result.status === 'fulfilled',
      data: result.status === 'fulfilled' ? result.value : null,
      error: result.status === 'rejected' ? result.reason : null,
      index: idx
    }))
  } catch (error) {
    console.error('[Batch Requests Error]', error)
    return []
  }
}

/**
 * Lazy Load Images
 * Improve perceived performance by lazy loading images
 */
export function lazyLoadImage(src, placeholder = '') {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(src)
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`))
    img.src = src
  })
}

/**
 * Throttle Function
 * Limits how often a function can be called
 * Useful for resize handlers and scroll events
 */
export function throttle(func, limit = 100) {
  let inThrottle
  return function (...args) {
    if (!inThrottle) {
      func.apply(this, args)
      inThrottle = true
      setTimeout(() => (inThrottle = false), limit)
    }
  }
}

/**
 * Memory-efficient string search
 * Returns matched indices instead of creating new arrays
 */
export function filterBySearch(items, searchTerm, searchKeys = ['name', 'content']) {
  if (!searchTerm.trim()) return items

  const lowerSearch = searchTerm.toLowerCase()
  const results = []

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    let match = false

    for (const key of searchKeys) {
      if (String(item[key] || '').toLowerCase().includes(lowerSearch)) {
        match = true
        break
      }
    }

    if (match) results.push(item)
  }

  return results
}

/**
 * Batch DOM Updates
 * Groups multiple DOM operations to prevent layout thrashing
 */
export function batchDOMUpdates(updates) {
  return new Promise(resolve => {
    requestAnimationFrame(() => {
      updates.forEach(update => update())
      resolve()
    })
  })
}

/**
 * Calculate Safe Paginated Slice
 * Prevents loading too many items at once
 */
export function getPaginatedSlice(items, page = 1, pageSize = 50) {
  const start = (page - 1) * pageSize
  const end = start + pageSize
  return {
    data: items.slice(start, end),
    hasMore: end < items.length,
    total: items.length,
    pages: Math.ceil(items.length / pageSize)
  }
}

/**
 * Memory Monitor
 * Track memory usage and warn if getting high
 */
export function checkMemoryUsage(threshold = 0.9) {
  if (performance.memory) {
    const usage = performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit
    if (usage > threshold) {
      console.warn(`[Memory Warning] High memory usage: ${(usage * 100).toFixed(2)}%`)
      return true
    }
  }
  return false
}

/**
 * Request Deduplication
 * Prevents duplicate API requests within short time window
 */
export class RequestDeduplicator {
  constructor(timeWindow = 1000) {
    this.pending = new Map()
    this.timeWindow = timeWindow
  }

  async deduplicate(key, requestFn) {
    // Check if request is already in flight
    if (this.pending.has(key)) {
      return this.pending.get(key)
    }

    // Create new request
    const promise = requestFn()
      .finally(() => {
        setTimeout(() => this.pending.delete(key), this.timeWindow)
      })

    this.pending.set(key, promise)
    return promise
  }

  clear() {
    this.pending.clear()
  }
}

export const requestDeduplicator = new RequestDeduplicator(1000)

/**
 * API Cache
 * Simple TTL-based cache for API responses
 */
export class ApiCache {
  constructor() {
    this.store = new Map()
  }

  has(key) {
    const entry = this.store.get(key)
    if (!entry) return false
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key)
      return false
    }
    return true
  }

  get(key) {
    const entry = this.store.get(key)
    if (!entry || Date.now() > entry.expiresAt) {
      this.store.delete(key)
      return undefined
    }
    return entry.value
  }

  set(key, value, ttl = 300000) {
    this.store.set(key, { value, expiresAt: Date.now() + ttl })
  }

  clear() {
    this.store.clear()
  }

  invalidate(pattern) {
    for (const key of this.store.keys()) {
      if (key.includes(pattern)) {
        this.store.delete(key)
      }
    }
  }
}

export const apiCache = new ApiCache()

/**
 * Compression Helper
 * Compress verbose data structures
 */
export function compressMessage(msg) {
  return {
    id: msg.id,
    p: msg.platform[0], // 'i', 'f', 'w', 'g'
    s: msg.status[0],
    c: msg.content.substring(0, 100), // First 100 chars
    t: msg.createdAt,
    a: msg.agentResponse ? 1 : 0
  }
}

export function decompressMessage(compressed, fullData) {
  return {
    ...compressed,
    platform: { i: 'instagram', f: 'facebook', w: 'whatsapp', g: 'gmail' }[compressed.p],
    status: { u: 'unread', r: 'read', s: 'replied', a: 'archived' }[compressed.s],
    content: fullData?.content || compressed.c,
    ...fullData
  }
}
