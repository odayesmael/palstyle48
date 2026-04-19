/**
 * AI Provider Interface
 * Unified interface for switching between Groq and Ollama with Fallback Chain
 */

const GroqService = require('./groq.service')
const OllamaService = require('./ollama.service')

class AIProvider {
  constructor(options = {}) {
    this.groq = new GroqService(options.apiKey || process.env.GROQ_API_KEY)
    this.ollama = new OllamaService(options.ollamaUrl || process.env.OLLAMA_BASE_URL)
  }

  /**
   * Helper internally to execute the fallback chain
   */
  async _executeWithFallback(actionName, payload, options) {
    let lastError = null;

    // 1. Try Groq (Primary)
    try {
      console.log(`[AIProvider] Attempting ${actionName} via Groq...`)
      return await this.groq.chat(payload, options)
    } catch (err) {
      console.warn(`[AIProvider] Groq failed for ${actionName}:`, err.message)
      lastError = err;
    }

    // 2. Try Ollama (Secondary)
    try {
      console.log(`[AIProvider] Attempting ${actionName} via Ollama fallback...`)
      const isAvailable = await this.ollama.isAvailable()
      if (!isAvailable) {
        throw new Error('Ollama is not available locally.')
      }
      return await this.ollama.chat(payload, options)
    } catch (err) {
      console.warn(`[AIProvider] Ollama failed for ${actionName}:`, err.message)
      lastError = err;
    }

    // 3. Complete Failure - Send Alert 
    // TODO: integrate with an alert system to notify Admin.
    const finalError = new Error(`[AIProvider] All providers failed for ${actionName}. Last Error: ${lastError.message}`)
    console.error(finalError.message)
    throw finalError
  }

  // ─── Unified Interface Methods ──────────────────────────────────────────

  /**
   * 1. Chat: Basic conversation
   */
  async chat(messages, options = {}) {
    if (options.systemPrompt) {
      messages = [{ role: 'system', content: options.systemPrompt }, ...messages]
    }
    return this._executeWithFallback('chat', messages, options)
  }

  /**
   * 2. Generate Text: single prompt text generation
   */
  async generateText(prompt, options = {}) {
    const messages = []
    if (options.systemPrompt) messages.push({ role: 'system', content: options.systemPrompt })
    messages.push({ role: 'user', content: prompt })
    
    const response = await this._executeWithFallback('generateText', messages, options)
    return response.content
  }

  /**
   * 3. Analyze Data: provide data and instruction
   */
  async analyzeData(data, instruction, options = {}) {
    const prompt = `${instruction}\n\nData:\n${JSON.stringify(data, null, 2)}`
    return this.generateText(prompt, options)
  }

  /**
   * 4. Classify Intent: determine intent from message
   */
  async classifyIntent(message, options = {}) {
    const instruction = "You are an intent classification assistant. Respond only with the classified intent as a single word or short phrase."
    return this.generateText(`${instruction}\n\nMessage: "${message}"\n\nIntent:`, options)
  }

  /**
   * 5. Generate JSON: ensure response is JSON parsed
   */
  async generateJSON(prompt, schema, options = {}) {
    let schemaInstruction = "Please return the output in valid JSON format."
    if (schema) {
      schemaInstruction += ` Ensure it matches this schema structure:\n${JSON.stringify(schema, null, 2)}`
    }

    const messages = [
      { role: 'system', content: `${options.systemPrompt || 'You are a helpful AI.'}\n${schemaInstruction}` },
      { role: 'user', content: prompt }
    ]

    const response = await this._executeWithFallback('generateJSON', messages, { ...options, jsonMode: true })
    
    try {
      // In case the model wraps the JSON in markdown code blocks
      let rawText = response.content.trim()
      if (rawText.startsWith('```json')) rawText = rawText.replace(/^```json/, '')
      if (rawText.startsWith('```')) rawText = rawText.replace(/^```/, '')
      if (rawText.endsWith('```')) rawText = rawText.replace(/```$/, '')
      
      return JSON.parse(rawText.trim())
    } catch (e) {
      throw new Error(`Failed to parse AI response as JSON: ${e.message}\nResponse: ${response.content}`)
    }
  }
}

module.exports = AIProvider
