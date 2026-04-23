import api from './api'
import { requestDeduplicator, apiCache } from '../utils/performance'

/**
 * Enhanced API Service
 * Includes automatic deduplication and caching
 * Use this instead of direct api.get/post calls
 */

export const optimizedAPI = {
  /**
   * GET with automatic deduplication and optional caching
   * @param {string} url - API endpoint
   * @param {Object} options - Request options
   * @param {boolean} cache - Enable caching (default: true)
   * @param {number} cacheTTL - Cache TTL in ms (default: 300000 = 5min)
   */
  get: async (url, options = {}, cache = true, cacheTTL = 300000) => {
    const cacheKey = `${url}${JSON.stringify(options)}`

    // Check cache first
    if (cache && apiCache.has(cacheKey)) {
      return apiCache.get(cacheKey)
    }

    // Deduplicate concurrent requests
    return requestDeduplicator.deduplicate(cacheKey, async () => {
      try {
        const response = await api.get(url, options)
        
        // Cache successful responses
        if (cache && response.data?.success) {
          apiCache.set(cacheKey, response.data, cacheTTL)
        }
        
        return response.data
      } catch (error) {
        console.error(`API GET Error [${url}]:`, error)
        throw error
      }
    })
  },

  /**
   * POST request with proper error handling
   */
  post: async (url, data = {}, options = {}) => {
    try {
      const response = await api.post(url, data, options)
      return response.data
    } catch (error) {
      console.error(`API POST Error [${url}]:`, error)
      throw error
    }
  },

  /**
   * PUT request with proper error handling
   */
  put: async (url, data = {}, options = {}) => {
    try {
      const response = await api.put(url, data, options)
      return response.data
    } catch (error) {
      console.error(`API PUT Error [${url}]:`, error)
      throw error
    }
  },

  /**
   * PATCH request with proper error handling
   */
  patch: async (url, data = {}, options = {}) => {
    try {
      const response = await api.patch(url, data, options)
      return response.data
    } catch (error) {
      console.error(`API PATCH Error [${url}]:`, error)
      throw error
    }
  },

  /**
   * DELETE request with proper error handling
   */
  delete: async (url, options = {}) => {
    try {
      const response = await api.delete(url, options)
      return response.data
    } catch (error) {
      console.error(`API DELETE Error [${url}]:`, error)
      throw error
    }
  },

  /**
   * Batch multiple GET requests
   * Combines them for efficiency
   */
  batch: async (requests) => {
    try {
      const promises = requests.map(({ url, options, cache, cacheTTL }) =>
        optimizedAPI.get(url, options, cache, cacheTTL)
      )
      return await Promise.all(promises)
    } catch (error) {
      console.error('Batch API Error:', error)
      throw error
    }
  },

  /**
   * Batch with fallback for partial failures
   */
  batchSafe: async (requests) => {
    try {
      const promises = requests.map(({ url, options, cache, cacheTTL }) =>
        optimizedAPI.get(url, options, cache, cacheTTL).catch(err => ({
          error: true,
          message: err.message,
          url
        }))
      )
      return await Promise.all(promises)
    } catch (error) {
      console.error('Batch Safe API Error:', error)
      throw error
    }
  },

  /**
   * Clear all caches
   */
  clearCache: () => {
    apiCache.clear()
    requestDeduplicator.clear()
  },

  /**
   * Invalidate cache for specific pattern
   */
  invalidateCache: (pattern) => {
    apiCache.invalidate(pattern)
  }
}

export default optimizedAPI
