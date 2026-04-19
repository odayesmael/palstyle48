/**
 * Trendyol Integration Service
 * Handles: Orders, Products, Returns via Seller API
 */

const TRENDYOL_BASE_URL = 'https://api.trendyol.com/sapigw'

class TrendyolService {
  constructor({ sellerId, apiKey, apiSecret }) {
    this.sellerId = sellerId
    const encoded = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')
    this.authHeader = `Basic ${encoded}`
  }

  get headers() {
    return {
      Authorization: this.authHeader,
      'Content-Type': 'application/json',
      'User-Agent': `${this.sellerId} - palstyle48`,
    }
  }

  async getOrders(params = {}) {
    // TODO: implement
    throw new Error('Not implemented yet')
  }

  async getProducts(params = {}) {
    // TODO: implement
    throw new Error('Not implemented yet')
  }

  async updateStock(items) {
    // TODO: implement
    throw new Error('Not implemented yet')
  }

  async updatePrice(items) {
    // TODO: implement
    throw new Error('Not implemented yet')
  }
}

module.exports = TrendyolService
