// ─── OpenAI Service ───────────────────────────────────────────────────────────
// GPT-4o integration — primary AI provider for all agent tasks.
// Falls through to Groq → Ollama if OpenAI is unavailable.

class OpenAIService {
  constructor(apiKey) {
    this.apiKey = apiKey || process.env.OPENAI_API_KEY
    this.model = process.env.OPENAI_MODEL || 'gpt-4o'
    this.baseUrl = 'https://api.openai.com/v1'
  }

  /**
   * Check if OpenAI is available (has API key configured)
   */
  isAvailable() {
    return Boolean(this.apiKey)
  }

  /**
   * Chat completion
   * @param {Array<{role: string, content: string}>} messages
   * @param {object} options
   * @returns {Promise<{role: string, content: string}>}
   */
  async chat(messages, options = {}) {
    if (!this.apiKey) throw new Error('OpenAI API key not configured')

    const body = {
      model: options.model || this.model,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens || 2000,
    }

    if (options.jsonMode) {
      body.response_format = { type: 'json_object' }
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`OpenAI API error ${response.status}: ${errorData.error?.message || response.statusText}`)
    }

    const data = await response.json()
    const choice = data.choices?.[0]
    if (!choice) throw new Error('OpenAI returned empty response')

    return {
      role: choice.message.role,
      content: choice.message.content,
      usage: data.usage,
    }
  }
}

module.exports = OpenAIService
