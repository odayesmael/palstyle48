/**
 * Ollama Service — Local LLM inference
 */

const DEFAULT_MODEL = 'qwen2.5:14b'

class OllamaService {
  constructor(baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434') {
    this.baseUrl = baseUrl
  }

  async chat(messages, options = {}) {
    const body = {
      model: options.model || DEFAULT_MODEL,
      messages: messages,
      stream: false,
      options: {
        temperature: options.temperature ?? 0.7,
        num_predict: options.maxTokens ?? 1024,
      }
    }

    if (options.jsonMode || options.schema) {
      body.format = "json"
    }

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Ollama Error HTTP ${response.status}: ${text}`)
    }

    const data = await response.json()
    return data.message
  }

  async isAvailable() {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`)
      return res.ok
    } catch {
      return false
    }
  }
}

module.exports = OllamaService
