// ─── BaseAgent — Foundation for all AI Agents ────────────────────────────────
// Provides: automatic logging, execution timing, error handling, alert creation.
// Extend this class to create specialized agents (Ads, Inbox, Inventory, Finance).

const prisma = require('../lib/prisma')
const AIProvider = require('../services/ai/provider')

class BaseAgent {
  constructor(agentName) {
    this.name = agentName
    this.ai = new AIProvider()
    this._config = null
  }

  /**
   * Get (or cache) the agent config from DB
   */
  async getConfig() {
    if (this._config) return this._config
    this._config = await prisma.agentConfig.findUnique({ where: { name: this.name } })
    if (!this._config) {
      // Auto-create agent config if missing
      this._config = await prisma.agentConfig.create({
        data: {
          name: this.name,
          displayName: this.name.charAt(0).toUpperCase() + this.name.slice(1) + ' Agent',
          description: `AI agent for ${this.name} operations`,
          isActive: true,
          automationLevel: 'suggest',
          settings: {},
        },
      })
    }
    return this._config
  }

  /**
   * Check if agent is active
   */
  async isActive() {
    const config = await this.getConfig()
    return config.isActive
  }

  /**
   * Execute a task with automatic logging, timing, and error handling.
   * @param {string} action — name of the action
   * @param {Function} fn — async function to execute
   * @returns {*} result of fn()
   */
  async execute(action, fn) {
    const config = await this.getConfig()
    if (!config.isActive) {
      console.log(`[${this.name}Agent] Skipped "${action}" — agent is disabled`)
      return null
    }

    const startMs = Date.now()
    let logEntry

    try {
      logEntry = await prisma.agentLog.create({
        data: {
          agentId: config.id,
          action,
          status: 'running',
          details: `Started ${action}`,
        },
      })

      const result = await fn()
      const duration = Date.now() - startMs

      await prisma.agentLog.update({
        where: { id: logEntry.id },
        data: {
          status: 'success',
          duration,
          result: typeof result === 'object' ? result : { value: result },
          details: `Completed ${action} in ${duration}ms`,
        },
      })

      console.log(`[${this.name}Agent] ✅ ${action} completed in ${duration}ms`)
      return result
    } catch (err) {
      const duration = Date.now() - startMs
      console.error(`[${this.name}Agent] ❌ ${action} failed:`, err.message)

      if (logEntry) {
        await prisma.agentLog.update({
          where: { id: logEntry.id },
          data: {
            status: 'error',
            duration,
            details: `Failed: ${err.message}`,
          },
        }).catch(() => {})
      }

      throw err
    }
  }

  /**
   * Create an alert/recommendation
   */
  async createAlert({ type = 'info', title, message, data = {} }) {
    const config = await this.getConfig()
    return prisma.alert.create({
      data: {
        type,
        title,
        message,
        severity: type === 'error' ? 'high' : type === 'warning' ? 'medium' : 'low',
        agentName: this.name,
        data,
        isRead: false,
      },
    })
  }

  /**
   * Ask the AI a question with context
   */
  async askAI(prompt, options = {}) {
    return this.ai.generateText(prompt, {
      systemPrompt: options.systemPrompt || `You are an expert ${this.name} analyst for an e-commerce fashion brand called Palstyle48. Provide concise, actionable insights.`,
      ...options,
    })
  }

  /**
   * Ask AI to return structured JSON
   */
  async askAIJson(prompt, schema, options = {}) {
    return this.ai.generateJSON(prompt, schema, {
      systemPrompt: options.systemPrompt || `You are an expert ${this.name} analyst. Return valid JSON only.`,
      ...options,
    })
  }
}

module.exports = BaseAgent
