/**
 * Shopify Integration Service
 * Handles: Orders, Products, Customers via Admin REST API
 */

class ShopifyService {
  constructor({ shop, accessToken }) {
    this.shop = shop
    this.accessToken = accessToken
    this.baseUrl = `https://${shop}/admin/api/2024-07`
  }

  get headers() {
    return {
      'X-Shopify-Access-Token': this.accessToken,
      'Content-Type': 'application/json',
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

  async getCustomers(params = {}) {
    // TODO: implement
    throw new Error('Not implemented yet')
  }

  async updateInventory(inventoryItemId, locationId, quantity) {
    // TODO: implement
    throw new Error('Not implemented yet')
  }
}

module.exports = ShopifyService
