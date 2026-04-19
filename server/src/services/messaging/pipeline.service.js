/**
 * Message Processing Pipeline
 * Handles the full lifecycle of an incoming message:
 * 1. Save to DB
 * 2. Link to Customer
 * 3. AI Classify Intent
 * 4. AI Analyze Sentiment
 * 5. AI Generate Response
 * 6. Auto-reply decision based on Automation Level
 */

const prisma = require('../../lib/prisma')
const aiProvider = require('../ai/provider')
const { sendReply } = require('./sender.service')

// Load knowledge base context
const storeInfo = require('../ai/knowledge/store-info.json')
const faq = require('../ai/knowledge/faq.json')
const shipping = require('../ai/knowledge/shipping-policy.json')
const returns = require('../ai/knowledge/return-policy.json')
const products = require('../ai/knowledge/products-summary.json')
const inboxPrompt = require('../ai/prompts/inbox.prompt')

/**
 * Build knowledge base context string for AI
 */
function buildKnowledgeContext() {
  return `
=== معلومات المتجر ===
${JSON.stringify(storeInfo, null, 2)}

=== سياسة الشحن ===
${JSON.stringify(shipping, null, 2)}

=== سياسة الإرجاع ===
${JSON.stringify(returns, null, 2)}

=== منتجات وعروض ===
${JSON.stringify(products, null, 2)}

=== أسئلة متكررة ===
${faq.faqs.map(f => `س: ${f.q}\nج: ${f.a}`).join('\n\n')}
`.trim()
}

/**
 * Find or create customer from incoming message metadata
 */
async function resolveCustomer({ platform, senderId, senderName, senderHandle, phone, email }) {
  let customer = null

  // 1. Try to find by email
  if (email) {
    customer = await prisma.customer.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } })
  }

  // 2. Try by phone
  if (!customer && phone) {
    const normPhone = phone.replace(/\D/g, '').slice(-10)
    customer = await prisma.customer.findFirst({ where: { phone: { contains: normPhone } } })
  }

  // 3. Try by platformIds metadata (e.g. instagram senderId)
  if (!customer && senderId) {
    customer = await prisma.customer.findFirst({
      where: {
        platformIds: {
          path: [platform],
          equals: senderId
        }
      }
    })
  }

  // 4. Create new customer if not found
  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        name: senderName || senderHandle || `${platform} User`,
        email: email || null,
        phone: phone || null,
        source: platform,
        segment: 'new',
        platformIds: senderId ? { [platform]: senderId } : null
      }
    })
  }

  return customer
}

/**
 * Main pipeline function — receives parsed message object
 */
async function processIncomingMessage({
  platform,
  platformMsgId,
  senderName,
  senderHandle,
  senderId,
  content,
  mediaUrls = [],
  threadId = null,
  phone = null,
  email = null
}) {
  try {
    // ── Step 1: Save message to DB ──────────────────────────────────────────
    const message = await prisma.message.create({
      data: {
        platform,
        platformMsgId: platformMsgId || null,
        direction: 'inbound',
        senderName: senderName || null,
        senderHandle: senderHandle || null,
        content: content || '',
        mediaUrls: mediaUrls || [],
        status: 'unread',
        threadId: threadId || null
      }
    })

    // ── Step 2: Link to Customer ─────────────────────────────────────────────
    let customer = null
    try {
      customer = await resolveCustomer({ platform, senderId, senderName, senderHandle, phone, email })
      await prisma.message.update({
        where: { id: message.id },
        data: { customerId: customer.id }
      })
    } catch (err) {
      console.error('[Pipeline] Customer resolution failed:', err.message)
    }

    // ── Step 3: AI Classification ────────────────────────────────────────────
    let intent = 'general'
    let sentiment = 'neutral'
    let agentResponse = null

    try {
      // Classify Intent
      const intentResult = await aiProvider.classifyIntent(content)
      if (['inquiry', 'complaint', 'purchase', 'support', 'general'].includes(intentResult.toLowerCase().trim())) {
        intent = intentResult.toLowerCase().trim()
      }

      // Analyze Sentiment
      const sentimentResult = await aiProvider.analyzeData(
        `حلّل المشاعر في هذه الرسالة وأجب بكلمة واحدة: "positive" أو "neutral" أو "negative"\nالرسالة: "${content}"`
      )
      const sentimentClean = sentimentResult?.toLowerCase().trim()
      if (['positive', 'neutral', 'negative'].includes(sentimentClean)) {
        sentiment = sentimentClean
      }

      // ── Step 4: Build context for reply ─────────────────────────────────
      const knowledgeContext = buildKnowledgeContext()
      const customerContext = customer ? `
=== بيانات العميل ===
الاسم: ${customer.name}
المصدر: ${customer.source}
التصنيف: ${customer.segment}
عدد الطلبات: ${customer.totalOrders}
إجمالي الإنفاق: $${customer.totalSpent}
` : ''

      // ── Step 5: Generate Reply ────────────────────────────────────────────
      const messages = [
        {
          role: 'user',
          content: `${knowledgeContext}\n\n${customerContext}\n\nرسالة العميل: "${content}"\n\nاكتب رد مناسب وقصير (3-4 جمل بالعربية العامية المهنية):`
        }
      ]

      agentResponse = await aiProvider.chat(messages, {
        systemPrompt: inboxPrompt.systemPrompt
      })
    } catch (err) {
      console.error('[Pipeline] AI processing failed:', err.message)
    }

    // ── Step 6: Save AI results & decide automation ──────────────────────────
    // Get automation level from AgentConfig
    let automationLevel = 'semi' // default
    try {
      const agentConfig = await prisma.agentConfig.findUnique({ where: { name: 'inbox' } })
      if (agentConfig?.automationLevel) automationLevel = agentConfig.automationLevel
    } catch {}

    // Update message with AI results
    await prisma.message.update({
      where: { id: message.id },
      data: { intent, sentiment, agentResponse: agentResponse || null }
    })

    // Auto reply decision
    const safeIntents = ['inquiry', 'general']
    const shouldAutoReply = (
      automationLevel === 'full' &&
      safeIntents.includes(intent) &&
      sentiment !== 'negative' &&
      agentResponse
    )

    if (shouldAutoReply) {
      await sendReply({ messageId: message.id, response: agentResponse, platform, threadId, senderHandle, senderId, phone })
      await prisma.message.update({
        where: { id: message.id },
        data: { status: 'replied', repliedAt: new Date(), agentApproved: true }
      })
    } else if (agentResponse && automationLevel !== 'manual') {
      // Semi: Save suggestion + create alert
      await prisma.alert.create({
        data: {
          agentName: 'inbox',
          type: 'info',
          title: `رد مقترح — ${platform}`,
          message: `رسالة جديدة من "${senderName || senderHandle || 'عميل'}" على ${platform}. تصنيف: ${intent}. الإيجنت اقترح رداً في انتظار موافقتك.`,
          data: { messageId: message.id, intent, sentiment }
        }
      })
    } else {
      // Manual: Notify only
      await prisma.alert.create({
        data: {
          agentName: 'inbox',
          type: intent === 'complaint' ? 'warning' : 'info',
          title: `رسالة جديدة — ${platform}`,
          message: `رسالة ${intent === 'complaint' ? 'شكوى ⚠️' : 'جديدة'} من "${senderName || 'عميل'}" على ${platform} تحتاج رداً يدوياً.`,
          data: { messageId: message.id }
        }
      })
    }

    return { success: true, messageId: message.id, intent, sentiment }
  } catch (err) {
    console.error('[Pipeline] Fatal error:', err.message)
    return { success: false, error: err.message }
  }
}

module.exports = { processIncomingMessage }
