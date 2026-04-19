/**
 * Canva Integration Service
 * Handles: Design creation via Canva Connect API
 */

class CanvaService {
  constructor({ clientId, clientSecret, accessToken }) {
    this.clientId = clientId
    this.clientSecret = clientSecret
    this.accessToken = accessToken
    this.baseUrl = 'https://api.canva.com/rest/v1'
  }

  async createDesign(templateId, data) {
    // TODO: implement
    throw new Error('Not implemented yet')
  }

  async exportDesign(designId, format = 'png') {
    // TODO: implement
    throw new Error('Not implemented yet')
  }
}

module.exports = CanvaService
