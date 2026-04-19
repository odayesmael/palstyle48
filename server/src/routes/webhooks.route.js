/**
 * Webhook Routes
 * Receives and verifies incoming webhooks from Meta (IG, FB, WA), Twilio (WA), and Gmail
 */

const express = require('express')
const router = express.Router()
const { processIncomingMessage } = require('../services/messaging/pipeline.service')

const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN || 'palstyle48_webhook_secret'

// ─── Shared Meta Verification Handler ────────────────────────────────────────
function verifyWebhook(req, res) {
  const mode = req.query['hub.mode']
  const token = req.query['hub.verify_token']
  const challenge = req.query['hub.challenge']

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[Webhook] Verified successfully')
    return res.status(200).send(challenge)
  }
  return res.status(403).send('Forbidden')
}

// ═══════════════════════════════════════════════════════════════════════════════
// INSTAGRAM WEBHOOKS
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/instagram', verifyWebhook)

router.post('/instagram', async (req, res) => {
  res.status(200).send('EVENT_RECEIVED') // acknowledge immediately

  try {
    const body = req.body
    if (body.object !== 'instagram') return

    for (const entry of body.entry || []) {
      for (const event of entry.messaging || []) {
        if (!event.message || event.message.is_echo) continue

        await processIncomingMessage({
          platform: 'instagram',
          platformMsgId: event.message.mid,
          senderId: event.sender.id,
          senderHandle: event.sender.id,
          senderName: null, // Would need a separate /user lookup
          content: event.message.text || '[media]',
          mediaUrls: event.message.attachments?.map(a => a.payload?.url).filter(Boolean) || [],
          threadId: event.sender.id
        })
      }
    }
  } catch (err) {
    console.error('[Webhook/Instagram]', err.message)
  }
})

// ═══════════════════════════════════════════════════════════════════════════════
// FACEBOOK MESSENGER WEBHOOKS
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/facebook', verifyWebhook)

router.post('/facebook', async (req, res) => {
  res.status(200).send('EVENT_RECEIVED')

  try {
    const body = req.body
    if (body.object !== 'page') return

    for (const entry of body.entry || []) {
      for (const event of entry.messaging || []) {
        if (!event.message || event.message.is_echo) continue

        await processIncomingMessage({
          platform: 'facebook',
          platformMsgId: event.message.mid,
          senderId: event.sender.id,
          senderHandle: event.sender.id,
          senderName: null,
          content: event.message.text || '[media]',
          mediaUrls: event.message.attachments?.map(a => a.payload?.url).filter(Boolean) || [],
          threadId: event.sender.id
        })
      }
    }
  } catch (err) {
    console.error('[Webhook/Facebook]', err.message)
  }
})

// ═══════════════════════════════════════════════════════════════════════════════
// WHATSAPP CLOUD API WEBHOOKS
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/whatsapp', verifyWebhook)

router.post('/whatsapp', async (req, res) => {
  // للتشخيص والديباج: طباعة الويب هوك المستلم من ميتا
  try {
    const fs = require('fs');
    fs.appendFileSync('whatsapp_debug.log', JSON.stringify({
      time: new Date(),
      headers: req.headers,
      body: req.body
    }, null, 2) + '\n\n');
  } catch(e) {}

  res.status(200).send('EVENT_RECEIVED')

  try {
    const body = req.body
    if (body.object !== 'whatsapp_business_account') return

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== 'messages') continue

        const value = change.value
        const messages = value?.messages || []

        for (const msg of messages) {
          const from = msg.from // phone number
          const contact = value?.contacts?.find(c => c.wa_id === from)
          const senderName = contact?.profile?.name || null

          let content = '[unsupported message type]'
          const mediaUrls = []

          if (msg.type === 'text') {
            content = msg.text?.body || ''
          } else if (msg.type === 'image') {
            content = '[صورة]'
            if (msg.image?.id) mediaUrls.push(`whatsapp_media:${msg.image.id}`)
          } else if (msg.type === 'document') {
            content = `[ملف: ${msg.document?.filename || 'document'}]`
          } else if (msg.type === 'location') {
            content = `[موقع: ${msg.location?.latitude}, ${msg.location?.longitude}]`
          }

          console.log(`[Webhook/WhatsApp] 📲 From=${from}  Msg="${content.slice(0, 60)}"`)

          await processIncomingMessage({
            platform: 'whatsapp',
            platformMsgId: msg.id,
            senderId: from,
            senderHandle: from,
            senderName,
            phone: from,
            content,
            mediaUrls,
            threadId: from // WhatsApp threads = phone number
          })
        }
      }
    }
  } catch (err) {
    console.error('[Webhook/WhatsApp]', err.message)
  }
})

// ═══════════════════════════════════════════════════════════════════════════════
// GMAIL WEBHOOKS (Google Pub/Sub Push)
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/gmail', async (req, res) => {
  res.status(200).send('OK') // Acknowledge immediately

  try {
    const { message: pubsubMessage } = req.body
    if (!pubsubMessage?.data) return

    // Pub/Sub message is base64 encoded
    const decoded = JSON.parse(Buffer.from(pubsubMessage.data, 'base64').toString())
    const { emailAddress, historyId } = decoded

    console.log(`[Webhook/Gmail] Notification from ${emailAddress} historyId: ${historyId}`)
    // Actual email fetching is done by the Gmail poller in scheduler
    // This just acknowledges we received the notification
  } catch (err) {
    console.error('[Webhook/Gmail]', err.message)
  }
})

// ═══════════════════════════════════════════════════════════════════════════════
// SHOPIFY WEBHOOKS
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/shopify/orders_create', async (req, res) => {
  res.status(200).send('OK')
  // Order sync handled by order-sync.service on next cron or immediately via processOrder
  console.log('[Webhook/Shopify] New order received')
})

router.post('/shopify/customers_create', async (req, res) => {
  res.status(200).send('OK')
  console.log('[Webhook/Shopify] New customer received')
})

module.exports = router
