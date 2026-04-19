// ─── Token Refresher — Cron Job ───────────────────────────────────────────────
// Runs on a schedule and refreshes platform tokens before they expire.
// Called once during server startup via init().

const cron   = require('node-cron')
const prisma  = require('../lib/prisma')
const { decrypt, encrypt } = require('./token-manager')

// ─── Per-platform refresh functions ──────────────────────────────────────────

async function refreshMetaToken(platform) {
  const token = decrypt(platform.accessToken)
  if (!token) return

  const url = `https://graph.facebook.com/v21.0/oauth/access_token?` +
    `grant_type=fb_exchange_token` +
    `&client_id=${process.env.META_APP_ID}` +
    `&client_secret=${process.env.META_APP_SECRET}` +
    `&fb_exchange_token=${token}`

  const res  = await fetch(url)
  const data = await res.json()
  if (!data.access_token) throw new Error(`Meta refresh failed: ${JSON.stringify(data)}`)

  await prisma.platform.update({
    where: { name: 'meta' },
    data: {
      accessToken:  encrypt(data.access_token),
      tokenExpiry:  new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
    },
  })
  console.log('[Refresher] ✅ Meta token refreshed')
}

async function refreshGmailToken(platform) {
  const refreshToken = decrypt(platform.refreshToken)
  if (!refreshToken) throw new Error('Gmail: no refresh token stored')

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type:    'refresh_token',
    }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(`Gmail refresh failed: ${JSON.stringify(data)}`)

  await prisma.platform.update({
    where: { name: 'gmail' },
    data: {
      accessToken:  encrypt(data.access_token),
      tokenExpiry:  new Date(Date.now() + (data.expires_in || 3600) * 1000),
    },
  })
  console.log('[Refresher] ✅ Gmail token refreshed')
}

async function refreshCanvaToken(platform) {
  const refreshToken = decrypt(platform.refreshToken)
  if (!refreshToken) throw new Error('Canva: no refresh token stored')

  const res = await fetch('https://api.canva.com/rest/v1/oauth/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: refreshToken,
      client_id:     process.env.CANVA_CLIENT_ID,
      client_secret: process.env.CANVA_CLIENT_SECRET,
    }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(`Canva refresh failed: ${JSON.stringify(data)}`)

  await prisma.platform.update({
    where: { name: 'canva' },
    data: {
      accessToken:  encrypt(data.access_token),
      refreshToken: data.refresh_token ? encrypt(data.refresh_token) : platform.refreshToken,
      tokenExpiry:  new Date(Date.now() + (data.expires_in || 3600) * 1000),
    },
  })
  console.log('[Refresher] ✅ Canva token refreshed')
}

// ─── Main check function ──────────────────────────────────────────────────────

async function checkAndRefreshTokens() {
  console.log('[Refresher] ⏰ Token refresh check running...')
  const platforms = await prisma.platform.findMany({
    where: { isConnected: true, tokenExpiry: { not: null } },
  })

  for (const platform of platforms) {
    if (!platform.tokenExpiry) continue
    const msUntilExpiry = new Date(platform.tokenExpiry).getTime() - Date.now()
    const hoursLeft     = msUntilExpiry / (1000 * 60 * 60)

    try {
      switch (platform.name) {
        case 'meta':
          // Refresh if < 7 days (168 hours) remaining
          if (hoursLeft < 168) await refreshMetaToken(platform)
          break

        case 'gmail':
          // Refresh if < 10 minutes remaining (Gmail access token lasts 1 hour)
          if (hoursLeft < 0.17) await refreshGmailToken(platform)
          break

        case 'canva':
          // Refresh if < 1 hour remaining
          if (hoursLeft < 1) await refreshCanvaToken(platform)
          break
      }
    } catch (err) {
      console.error(`[Refresher] ❌ Failed to refresh ${platform.name}:`, err.message)
      // Mark as needing re-auth in metadata
      try {
        const meta = platform.metadata || {}
        await prisma.platform.update({
          where: { name: platform.name },
          data: { metadata: { ...meta, refreshError: err.message, needsReauth: true } },
        })
      } catch {}
    }
  }
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

let _cronJob = null

function init() {
  if (_cronJob) return
  // Run every hour at :05
  _cronJob = cron.schedule('5 * * * *', checkAndRefreshTokens, { scheduled: true })
  console.log('[Refresher] 🕐 Token auto-refresh scheduled (every hour)')

  // Also run once on startup after a short delay
  setTimeout(checkAndRefreshTokens, 5000)
}

function stop() {
  if (_cronJob) { _cronJob.stop(); _cronJob = null }
}

module.exports = { init, stop, checkAndRefreshTokens }
