/**
 * API Cache Strategy
 * In-memory caching with TTL to reduce server requests
 * Critical for dashboard performance optimization
 */

class APICache {
  constructor(ttl = 300000) { // 5 minutes default
    this.cache = new Map()
    this.timers = new Map()
    this.ttl = ttl
  }

  set(key, data, customTTL = null) {
    if (this.timers.has(key)) clearTimeout(this.timers.get(key))

    this.cache.set(key, data)

    const timer = setTimeout(() => {
      this.cache.delete(key)
      this.timers.delete(key)
    }, customTTL || this.ttl)

    this.timers.set(key, timer)
  }

  get(key) {
    return this.cache.get(key)
  }

  has(key) {
    return this.cache.has(key)
  }

  clear() {
    this.cache.forEach((_, key) => {
      if (this.timers.has(key)) clearTimeout(this.timers.get(key))
    })
    this.cache.clear()
    this.timers.clear()
  }

  invalidate(pattern) {
    Array.from(this.cache.keys()).forEach(key => {
      if (key.includes(pattern)) {
        if (this.timers.has(key)) clearTimeout(this.timers.get(key))
        this.cache.delete(key)
        this.timers.delete(key)
      }
    })
  }
}

export const apiCache = new APICache(300000) // 5 minutes

/**
 * useAPI Hook
 * Smart hook that caches API responses and prevents duplicate requests
 * Reduces server load and improves perceived performance
 */
export function useAPI(url, options = {}) {
  const [data, setData] = React.useState(null)
  const [loading, setLoading] = React.useState(!apiCache.has(url))
  const [error, setError] = React.useState(null)

  const cacheKey = `${url}${JSON.stringify(options)}`

  React.useEffect(() => {
    const fetchData = async () => {
      // Check cache first
      if (apiCache.has(cacheKey)) {
        setData(apiCache.get(cacheKey))
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        const response = await fetch(url, options)
        const result = await response.json()
        
        if (result.success) {
          apiCache.set(cacheKey, result.data)
          setData(result.data)
        } else {
          setError(result.message || 'Loading error')
        }
      } catch (err) {
        setError(err.message || 'Failed to load data')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [cacheKey, url, options])

  return { data, loading, error }
}

export default apiCache
