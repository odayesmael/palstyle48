// ─── InboxAgent — AI-powered message handling ────────────────────────────────
const BaseAgent = require('./BaseAgent')
const prisma    = require('../lib/prisma')

class InboxAgent extends BaseAgent {
  constructor() { super('inbox') }

  /**
   * Classify the intent of an inbound message
   */
  async classifyMessage(messageId) {
    return this.execute('classify_message', async () => {
      const msg = await prisma.message.findUnique({
        where: { id: messageId },
        include: { customer: { select: { name: true, segment: true } } },
      })
      if (!msg) throw new Error(`Message ${messageId} not found`)

      const intent = await this.askAI(
        `Classify this customer message into one of these intents: order_inquiry, complaint, return_request, product_question, greeting, thank_you, other.\n\nMessage: "${msg.body}"\nCustomer: ${msg.customer?.name || 'Unknown'} (${msg.customer?.segment || 'regular'})\n\nRespond with just the intent label.`,
        { temperature: 0.3 }
      )

      const classification = intent.trim().toLowerCase().replace(/[^a-z_]/g, '')

      await prisma.message.update({
        where: { id: messageId },
        data: { intent: classification },
      })

      return { messageId, intent: classification }
    })
  }

  /**
   * Generate a suggested reply for a message
   */
  async suggestReply(messageId) {
    return this.execute('suggest_reply', async () => {
      const msg = await prisma.message.findUnique({
        where: { id: messageId },
        include: {
          customer: { select: { name: true, segment: true, totalSpent: true } },
        },
      })
      if (!msg) throw new Error(`Message ${messageId} not found`)

      const reply = await this.askAI(
        `Generate a professional, friendly reply for this customer message from Palstyle48 fashion brand.\n\nCustomer: ${msg.customer?.name || 'Customer'} (${msg.customer?.segment || 'regular'}, total spent: $${msg.customer?.totalSpent || 0})\nMessage: "${msg.body}"\nIntent: ${msg.intent || 'unknown'}\n\nKeep it concise (2-3 sentences max). Be helpful and on-brand.`,
        { temperature: 0.7 }
      )

      await prisma.message.update({
        where: { id: messageId },
        data: { suggestedReply: reply.trim() },
      })

      return { messageId, suggestedReply: reply.trim() }
    })
  }

  /**
   * Process all unclassified inbound messages
   */
  async processUnclassified() {
    return this.execute('process_unclassified', async () => {
      const messages = await prisma.message.findMany({
        where: {
          direction: 'inbound',
          intent: null,
          status: { in: ['unread', 'read'] },
        },
        take: 20,
        orderBy: { createdAt: 'desc' },
      })

      let classified = 0
      for (const msg of messages) {
        try {
          await this.classifyMessage(msg.id)
          classified++
        } catch (err) {
          console.error(`[InboxAgent] Failed to classify ${msg.id}:`, err.message)
        }
      }

      return { processed: messages.length, classified }
    })
  }
}

module.exports = new InboxAgent()
