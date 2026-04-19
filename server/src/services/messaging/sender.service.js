/**
 * Reply Sender Service
 * Sends replies back to customers via their platform APIs
 * Supports: Instagram, Facebook, WhatsApp (Cloud API), WhatsApp (Twilio), Gmail
 */

const prisma = require('../../lib/prisma')
const { decrypt } = require('../../integrations/token-manager')
const twilio = require('twilio')

/**
 * Get decrypted platform tokens
 */
async function getPlatformTokens(platform) {
  const record = await prisma.platform.findUnique({ where: { name: platform } })
  if (!record || !record.isConnected) throw new Error(`${platform} is not connected`)

  return {
    accessToken: decrypt(record.accessToken),
    metadata: record.metadata || {}
  }
}

/**
 * Send reply to Instagram DM
 */
async function sendInstagramReply({ accessToken, recipientId, text }) {
  // Use first Instagram Business Account from metadata pages
  const url = `https://graph.facebook.com/v21.0/me/messages`
  const body = {
    recipient: { id: recipientId },
    message: { text }
  }

  const res = await fetch(`${url}?access_token=${accessToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(`Instagram send failed: ${JSON.stringify(err)}`)
  }
  return await res.json()
}

/**
 * Send reply to Facebook Messenger
 */
async function sendFacebookReply({ accessToken, recipientId, text }) {
  const url = `https://graph.facebook.com/v21.0/me/messages?access_token=${accessToken}`
  const body = {
    recipient: { id: recipientId },
    message: { text }
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(`Facebook send failed: ${JSON.stringify(err)}`)
  }
  return await res.json()
}

/**
 * Send reply via WhatsApp Cloud API
 */
async function sendWhatsAppReply({ accessToken, phoneNumberId, to, text }) {
  const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`
  const body = {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: text }
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify(body)
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(`WhatsApp send failed: ${JSON.stringify(err)}`)
  }
  return await res.json()
}



/**
 * Send reply via Gmail API (basic text reply)
 */
async function sendGmailReply({ accessToken, threadId, to, subject, body }) {
  const emailContent = [
    `From: me`,
    `To: ${to}`,
    `Subject: Re: ${subject}`,
    `In-Reply-To: ${threadId}`,
    `References: ${threadId}`,
    `Content-Type: text/plain; charset=utf-8`,
    ``,
    body
  ].join('\n')

  const encodedEmail = Buffer.from(emailContent).toString('base64').replace(/\+/g, '-').replace(/\//g, '_')

  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ raw: encodedEmail, threadId })
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(`Gmail send failed: ${JSON.stringify(err)}`)
  }
  return await res.json()
}

/**
 * Main unified send function
 * @param {Object} params
 */
async function sendReply({ messageId, response, platform, threadId, senderHandle, senderId, phone }) {
  try {
    // Get Platform tokens from DB
    const { accessToken, metadata } = await getPlatformTokens(platform === 'instagram' ? 'meta' : platform)

    switch (platform) {
      case 'instagram': {
        const recipientId = senderId || senderHandle
        if (!recipientId) throw new Error('Missing Instagram recipient ID')
        await sendInstagramReply({ accessToken, recipientId, text: response })
        break
      }

      case 'facebook': {
        const recipientId = senderId || senderHandle
        if (!recipientId) throw new Error('Missing Facebook recipient ID')
        await sendFacebookReply({ accessToken, recipientId, text: response })
        break
      }

      case 'whatsapp': {
        const to = phone || senderHandle
        if (!to) throw new Error('Missing WhatsApp recipient phone')

        // WhatsApp Cloud API (Meta)
        const phoneNumberId = metadata?.phoneNumberId || process.env.WA_PHONE_NUMBER_ID
        await sendWhatsAppReply({ accessToken, phoneNumberId, to, text: response })
        break
      }

      case 'gmail': {
        await sendGmailReply({
          accessToken,
          threadId: threadId || '',
          to: senderHandle || '',
          subject: 'رد من متجر palstyle48',
          body: response
        })
        break
      }

      default:
        throw new Error(`Unsupported platform: ${platform}`)
    }

    // Save outbound message to DB
    await prisma.message.create({
      data: {
        platform,
        direction: 'outbound',
        content: response,
        status: 'replied',
        threadId: threadId || null
      }
    })

    return { success: true }
  } catch (err) {
    console.error(`[Sender] Failed to send reply on ${platform}:`, err.message)
    return { success: false, error: err.message }
  }
}

module.exports = { sendReply }
