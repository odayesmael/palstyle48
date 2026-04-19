/**
 * Groq Service — Fast LLM inference
 */

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'
const DEFAULT_MODEL = 'llama-3.3-70b-versatile'

class GroqService {
  constructor(apiKey) {
    if (!apiKey) {
      console.warn('[GroqService] No API key provided — requests will fail')
    }
    this.apiKey = apiKey
  }

  async _fetchWithRetry(body, retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(GROQ_API_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body)
        })

        if (!response.ok) {
          if (response.status === 429) {
            // Rate limit hit: wait and retry
            const resetTime = parseInt(response.headers.get('x-ratelimit-reset')) || 2
            await new Promise(r => setTimeout(r, (resetTime * 1000) + 100))
            continue
          }
          const text = await response.text()
          throw new Error(`HTTP ${response.status}: ${text}`)
        }

        const data = await response.json()
        return data
      } catch (err) {
        if (i === retries - 1) throw err
        // Exponential backoff for network errors
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)))
      }
    }
  }

  async chat(messages, options = {}) {
    const body = {
      model: options.model || DEFAULT_MODEL,
      messages: messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 1024,
      stream: false,
    }

    if (options.jsonMode || options.schema) {
      body.response_format = { type: "json_object" }
    }

    const data = await this._fetchWithRetry(body)
    return data.choices[0].message
  }
}

module.exports = GroqService
