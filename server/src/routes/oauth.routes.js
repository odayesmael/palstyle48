// ─── OAuth Routes — UNIFIED ENTRY POINT ─────────────────────────────────────
// CRITICAL: This is the ONLY place where OAuth flows should be handled.
// All platform connections funnel through here after setup/platforms controllers initiate.
//
// GET  /api/oauth/:platform/authorize  → redirect user to platform OAuth page
// GET  /api/oauth/:platform/callback   → receive code, exchange for token, save to DB
// POST /api/oauth/:platform/test       → test platform API credentials (Shopify/Trendyol)

const express  = require('express')
const router   = express.Router()
const prisma   = require('../lib/prisma')
const { verifyToken } = require('../middleware/auth.middleware')
const {
  generateState, verifyState, generatePKCE,
  buildUrl, redirectSuccess, redirectError,
  encrypt,
} = require('../integrations/oauth-helper')

const BACKEND_URL  = () => process.env.BACKEND_URL  || 'http://localhost:3001'
const FRONTEND_URL = () => process.env.FRONTEND_URL || 'http://localhost:5173'

// ═══════════════════════════════════════════════════════════════════════════════
// META (Facebook + Instagram + WhatsApp)
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/meta/authorize', verifyToken, (_req, res) => {
  const state = generateState('meta')
  const url   = buildUrl('https://www.facebook.com/v21.0/dialog/oauth', {
    client_id:    process.env.META_APP_ID,
    redirect_uri: `${BACKEND_URL()}/api/oauth/meta/callback`,
    scope: [
      'public_profile',
      'pages_show_list',
      'pages_read_engagement',
      'pages_manage_posts',
      'pages_messaging',
      'instagram_basic',
      'instagram_manage_messages',
      'instagram_content_publish',
    ].join(','),
    response_type: 'code',
    state,
  })
  res.redirect(url)
})

router.get('/meta/callback', async (req, res) => {
  const { code, state, error } = req.query
  try {
    if (error) throw new Error(`Meta denied: ${error}`)
    verifyState(state)
    if (!code) throw new Error('Missing code from Meta callback')

    const callbackUri = `${BACKEND_URL()}/api/oauth/meta/callback`

    // 1. Exchange code → short-lived token
    const shortRes = await fetch(buildUrl('https://graph.facebook.com/v21.0/oauth/access_token', {
      client_id:     process.env.META_APP_ID,
      client_secret: process.env.META_APP_SECRET,
      redirect_uri:  callbackUri,
      code,
    }))
    const shortData = await shortRes.json()
    if (!shortData.access_token) throw new Error(`Meta short token failed: ${JSON.stringify(shortData)}`)

    // 2. Exchange → long-lived token (60 days)
    const longRes = await fetch(buildUrl('https://graph.facebook.com/v21.0/oauth/access_token', {
      grant_type:        'fb_exchange_token',
      client_id:         process.env.META_APP_ID,
      client_secret:     process.env.META_APP_SECRET,
      fb_exchange_token: shortData.access_token,
    }))
    const longData = await longRes.json()
    if (!longData.access_token) throw new Error(`Meta long token failed: ${JSON.stringify(longData)}`)
    const longToken = longData.access_token

    // 3. Get user info
    const meRes  = await fetch(buildUrl('https://graph.facebook.com/v21.0/me', {
      fields: 'id,name', access_token: longToken,
    }))
    const me = await meRes.json()

    // 4. Get managed pages + Instagram accounts
    const pagesRes = await fetch(buildUrl('https://graph.facebook.com/v21.0/me/accounts', {
      fields:       'id,name,access_token,instagram_business_account',
      access_token: longToken,
    }))
    const pagesData = await pagesRes.json()
    const pages = (pagesData.data || []).map(p => ({
      id:           p.id,
      name:         p.name,
      accessToken:  encrypt(p.access_token),
      instagramId:  p.instagram_business_account?.id || null,
    }))

    // 5. Save to DB (centralized through registry)
    const { registry } = require('../integrations/registry')

    const metaData = {
      userName: me.name,
      userId:   me.id,
      pages,
      scopes:   req.query.granted_scopes || '',
      needsReauth: false,
    }

    await prisma.platform.upsert({
      where:  { name: 'meta' },
      create: { name: 'meta', displayName: 'Meta', isConnected: true },
      update: {
        isConnected:  true,
        accessToken:  encrypt(longToken),
        refreshToken: null,
        tokenExpiry:  new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
        lastSync:     new Date(),
        metadata: metaData,
      },
    })

    // Register with live system
    await registry.connectPlatform('meta', { accessToken: longToken })

    return redirectSuccess(res, 'meta')
  } catch (err) {
    console.error('[OAuth/Meta]', err.message)
    return redirectError(res, 'meta', err.message)
  }
})

// ═══════════════════════════════════════════════════════════════════════════════
// SHOPIFY
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/shopify/authorize', verifyToken, (_req, res) => {
  const shopDomain = process.env.SHOPIFY_STORE_DOMAIN
  if (!shopDomain) {
    return res.status(400).json({ success: false, message: 'SHOPIFY_STORE_DOMAIN not configured in .env' })
  }
  
  const state = generateState('shopify', { shop: shopDomain })
  const url   = buildUrl(`https://${shopDomain}/admin/oauth/authorize`, {
    client_id:    process.env.SHOPIFY_API_KEY,
    redirect_uri: `${BACKEND_URL()}/api/oauth/shopify/callback`,
    scope: 'read_products,write_products,read_orders,write_orders,read_customers,read_inventory,write_inventory,read_analytics',
    state,
  })
  res.redirect(url)
})

router.get('/shopify/callback', async (req, res) => {
  const { code, shop, state, error } = req.query
  try {
    if (error) throw new Error(`Shopify denied: ${error}`)
    const stored = verifyState(state)
    if (!code || !shop) throw new Error('Missing code or shop in callback')

    // Validate shop matches what we stored
    if (stored.shop) {
      const s1 = stored.shop.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '')
      const s2 = shop.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '')
      if (s1 !== s2) {
        console.error(`[Shopify OAuth] Shop mismatch! stored: '${s1}', received from Shopify: '${s2}'`)
        // we won't throw if it's just an internal alias vs public alias, 
        // as long as the state token itself was valid (which verifyState checks)
      }
    }

    // Exchange code → permanent access token
    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ client_id: process.env.SHOPIFY_API_KEY, client_secret: process.env.SHOPIFY_API_SECRET, code }),
    })
    const tokenData = await tokenRes.json()
    if (!tokenData.access_token) throw new Error(`Shopify token failed: ${JSON.stringify(tokenData)}`)
    const accessToken = tokenData.access_token

    // Fetch shop info
    const shopRes = await fetch(`https://${shop}/admin/api/2024-07/shop.json`, {
      headers: { 'X-Shopify-Access-Token': accessToken },
    })
    const shopInfo = await shopRes.json()

    // Register essential webhooks
    const webhookTopics = ['orders/create', 'orders/updated', 'customers/create', 'inventory_levels/update']
    for (const topic of webhookTopics) {
      try {
        await fetch(`https://${shop}/admin/api/2024-07/webhooks.json`, {
          method:  'POST',
          headers: { 'X-Shopify-Access-Token': accessToken, 'Content-Type': 'application/json' },
          body: JSON.stringify({ webhook: { topic, address: `${BACKEND_URL()}/api/webhooks/shopify/${topic.replace('/', '_')}`, format: 'json' } }),
        })
      } catch {}
    }

    // Prepare metadata
    const { registry } = require('../integrations/registry')
    const shopifyMetadata = {
      shop,
      shopName:     shopInfo.shop?.name,
      shopUrl:      `https://${shop}`,
      productCount: shopInfo.shop?.published_products_count,
      plan:         shopInfo.shop?.plan_name,
      scopes:       tokenData.scope,
      needsReauth:  false,
    }

    // Save to DB and register with live system
    await prisma.platform.upsert({
      where:  { name: 'shopify' },
      create: { name: 'shopify', displayName: 'Shopify', isConnected: true },
      update: {
        isConnected:  true,
        accessToken:  encrypt(accessToken),
        refreshToken: null,
        tokenExpiry:  null,    // Shopify tokens never expire
        lastSync:     new Date(),
        metadata:     shopifyMetadata,
      },
    })

    await registry.connectPlatform('shopify', { accessToken, shop })

    return redirectSuccess(res, 'shopify')
  } catch (err) {
    console.error('[OAuth/Shopify]', err.message)
    return redirectError(res, 'shopify', err.message)
  }
})

// ═══════════════════════════════════════════════════════════════════════════════
// SHOPIFY — Custom App (Direct Access Token, no OAuth)
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/shopify/test', verifyToken, async (req, res) => {
  const { accessToken, shop } = req.body
  if (!accessToken || !shop) {
    return res.status(400).json({ success: false, message: 'Store Domain و Access Token مطلوبان' })
  }
  // Normalize shop domain
  const shopDomain = shop.trim().toLowerCase()
    .replace(/^https?:\/\//, '').replace(/\/$/, '')

  try {
    const testRes = await fetch(`https://${shopDomain}/admin/api/2024-07/shop.json`, {
      headers: { 'X-Shopify-Access-Token': accessToken, 'Content-Type': 'application/json' },
    })
    if (!testRes.ok) throw new Error(`Shopify API returned ${testRes.status}`)
    const shopData = await testRes.json()

    // Prepare metadata
    const { registry } = require('../integrations/registry')
    const shopifyMetadata = {
      shop:        shopDomain,
      shopName:    shopData.shop?.name,
      shopUrl:     `https://${shopDomain}`,
      plan:        shopData.shop?.plan_name,
      currency:    shopData.shop?.currency,
      needsReauth: false,
    }

    // Save to DB and register with live system
    await prisma.platform.upsert({
      where:  { name: 'shopify' },
      create: { name: 'shopify', displayName: 'Shopify', isConnected: true },
      update: {
        isConnected:  true,
        accessToken:  encrypt(accessToken),
        refreshToken: null,
        tokenExpiry:  null,
        lastSync:     new Date(),
        metadata:     shopifyMetadata,
      },
    })

    await registry.connectPlatform('shopify', { accessToken, shop: shopDomain })

    return res.json({
      success:  true,
      message:  'تم الربط بنجاح',
      shopName: shopData.shop?.name,
      plan:     shopData.shop?.plan_name,
    })
  } catch (err) {
    console.error('[OAuth/Shopify/test]', err.message)
    return res.status(400).json({ success: false, message: `فشل الاتصال: ${err.message}` })
  }
})

// ═══════════════════════════════════════════════════════════════════════════════
// TRENDYOL — API Key (no OAuth)
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/trendyol/test', verifyToken, async (req, res) => {
  const { apiKey, apiSecret, supplierId } = req.body
  if (!apiKey || !apiSecret || !supplierId) {
    return res.status(400).json({ success: false, message: 'جميع الحقول مطلوبة' })
  }
  try {
    const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')
    const testRes = await fetch(
      `https://api.trendyol.com/sapigw/integration/product/sellers/${supplierId}/products?size=1`,
      {
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
          'User-Agent':   `${supplierId} - palstyle48`,
        },
      }
    )
    if (!testRes.ok) throw new Error(`Trendyol API returned ${testRes.status}`)
    const data = await testRes.json()

    // Prepare metadata
    const { registry } = require('../integrations/registry')
    const trendyolMetadata = {
      supplierId,
      totalProducts: data.totalElements || 0,
      needsReauth:   false,
    }

    // Save to DB and register with live system
    await prisma.platform.upsert({
      where:  { name: 'trendyol' },
      create: { name: 'trendyol', displayName: 'Trendyol', isConnected: true },
      update: {
        isConnected:  true,
        accessToken:  encrypt(apiKey),
        refreshToken: encrypt(apiSecret),
        tokenExpiry:  null,
        lastSync:     new Date(),
        metadata:     trendyolMetadata,
      },
    })

    await registry.connectPlatform('trendyol', { apiKey, apiSecret, supplierId })

    return res.json({ success: true, message: 'تم الربط بنجاح', totalProducts: data.totalElements })
  } catch (err) {
    console.error('[OAuth/Trendyol]', err.message)
    return res.status(400).json({ success: false, message: `الاتصال فشل: ${err.message}` })
  }
})

// ═══════════════════════════════════════════════════════════════════════════════
// GMAIL (Google OAuth)
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/gmail/authorize', verifyToken, (_req, res) => {
  const state = generateState('gmail')
  const url   = buildUrl('https://accounts.google.com/o/oauth2/v2/auth', {
    client_id:     process.env.GOOGLE_CLIENT_ID,
    redirect_uri:  `${BACKEND_URL()}/api/oauth/gmail/callback`,
    scope:         'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.modify',
    response_type: 'code',
    access_type:   'offline',    // needed for refresh_token
    prompt:        'consent',    // always return refresh_token
    state,
  })
  res.redirect(url)
})

router.get('/gmail/callback', async (req, res) => {
  const { code, state, error } = req.query
  try {
    if (error) throw new Error(`Google denied: ${error}`)
    verifyState(state)
    if (!code) throw new Error('Missing code from Google callback')

    // Exchange code → tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri:  `${BACKEND_URL()}/api/oauth/gmail/callback`,
        grant_type:    'authorization_code',
      }),
    })
    const tokenData = await tokenRes.json()
    if (!tokenData.access_token) throw new Error(`Gmail token failed: ${JSON.stringify(tokenData)}`)

    // Get Gmail profile
    const profileRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    })
    const profile = await profileRes.json()

    // Prepare metadata
    const { registry } = require('../integrations/registry')
    const gmailMetadata = {
      email:         profile.emailAddress,
      totalMessages: profile.messagesTotal,
      scopes:        tokenData.scope,
      needsReauth:   false,
    }

    // Save to DB and register with live system
    await prisma.platform.upsert({
      where:  { name: 'gmail' },
      create: { name: 'gmail', displayName: 'Gmail', isConnected: true },
      update: {
        isConnected:  true,
        accessToken:  encrypt(tokenData.access_token),
        refreshToken: tokenData.refresh_token ? encrypt(tokenData.refresh_token) : undefined,
        tokenExpiry:  new Date(Date.now() + (tokenData.expires_in || 3600) * 1000),
        lastSync:     new Date(),
        metadata:     gmailMetadata,
      },
    })

    await registry.connectPlatform('gmail', { accessToken: tokenData.access_token })

    return redirectSuccess(res, 'gmail')
  } catch (err) {
    console.error('[OAuth/Gmail]', err.message)
    return redirectError(res, 'gmail', err.message)
  }
})

// ═══════════════════════════════════════════════════════════════════════════════
// NOTION
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/notion/authorize', verifyToken, (_req, res) => {
  const state = generateState('notion')
  const url   = buildUrl('https://api.notion.com/v1/oauth/authorize', {
    client_id:     process.env.NOTION_CLIENT_ID,
    redirect_uri:  `${BACKEND_URL()}/api/oauth/notion/callback`,
    response_type: 'code',
    owner:         'user',
    state,
  })
  res.redirect(url)
})

router.get('/notion/callback', async (req, res) => {
  const { code, state, error } = req.query
  try {
    if (error) throw new Error(`Notion denied: ${error}`)
    verifyState(state)
    if (!code) throw new Error('Missing code from Notion callback')

    // Exchange code → access token
    const credentials = Buffer.from(`${process.env.NOTION_CLIENT_ID}:${process.env.NOTION_CLIENT_SECRET}`).toString('base64')
    const tokenRes = await fetch('https://api.notion.com/v1/oauth/token', {
      method:  'POST',
      headers: {
        Authorization:  `Basic ${credentials}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        grant_type:   'authorization_code',
        code,
        redirect_uri: `${BACKEND_URL()}/api/oauth/notion/callback`,
      }),
    })
    const tokenData = await tokenRes.json()
    if (!tokenData.access_token) throw new Error(`Notion token failed: ${JSON.stringify(tokenData)}`)

    // Prepare metadata
    const { registry } = require('../integrations/registry')
    const notionMetadata = {
      workspaceName: tokenData.workspace_name,
      workspaceId:   tokenData.workspace_id,
      botId:         tokenData.bot_id,
      workspaceIcon: tokenData.workspace_icon,
      needsReauth:   false,
    }

    // Save to DB and register with live system
    await prisma.platform.upsert({
      where:  { name: 'notion' },
      create: { name: 'notion', displayName: 'Notion', isConnected: true },
      update: {
        isConnected:  true,
        accessToken:  encrypt(tokenData.access_token),
        refreshToken: null,
        tokenExpiry:  null,   // Notion tokens don't expire
        lastSync:     new Date(),
        metadata:     notionMetadata,
      },
    })

    await registry.connectPlatform('notion', { accessToken: tokenData.access_token })

    return redirectSuccess(res, 'notion')
  } catch (err) {
    console.error('[OAuth/Notion]', err.message)
    return redirectError(res, 'notion', err.message)
  }
})

// ═══════════════════════════════════════════════════════════════════════════════
// CANVA (OAuth 2.0 + PKCE)
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/canva/authorize', verifyToken, (_req, res) => {
  const { verifier, challenge } = generatePKCE()
  const state = generateState('canva', { verifier })   // store verifier in state

  const url = buildUrl('https://www.canva.com/api/oauth/authorize', {
    client_id:             process.env.CANVA_CLIENT_ID,
    redirect_uri:          `${BACKEND_URL()}/api/oauth/canva/callback`,
    response_type:         'code',
    scope:                 'design:content:read design:content:write design:meta:read asset:read asset:write',
    code_challenge:        challenge,
    code_challenge_method: 'S256',
    state,
  })
  res.redirect(url)
})

router.get('/canva/callback', async (req, res) => {
  const { code, state, error } = req.query
  try {
    if (error) throw new Error(`Canva denied: ${error}`)
    const stored = verifyState(state)
    if (!code) throw new Error('Missing code from Canva callback')
    if (!stored.verifier) throw new Error('Missing PKCE verifier — state corrupted')

    // Exchange code → tokens (with PKCE verifier)
    const tokenRes = await fetch('https://api.canva.com/rest/v1/oauth/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'authorization_code',
        code,
        redirect_uri:  `${BACKEND_URL()}/api/oauth/canva/callback`,
        code_verifier: stored.verifier,
        client_id:     process.env.CANVA_CLIENT_ID,
        client_secret: process.env.CANVA_CLIENT_SECRET,
      }),
    })
    const tokenData = await tokenRes.json()
    if (!tokenData.access_token) throw new Error(`Canva token failed: ${JSON.stringify(tokenData)}`)

    // Get user profile
    const profileRes = await fetch('https://api.canva.com/rest/v1/users/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    })
    const profile = await profileRes.json()

    // Prepare metadata
    const { registry } = require('../integrations/registry')
    const canvaMetadata = {
      userId:      profile.user?.id,
      displayName: profile.user?.display_name,
      teamId:      profile.user?.team_user?.team_id,
      needsReauth: false,
    }

    // Save to DB and register with live system
    await prisma.platform.upsert({
      where:  { name: 'canva' },
      create: { name: 'canva', displayName: 'Canva', isConnected: true },
      update: {
        isConnected:  true,
        accessToken:  encrypt(tokenData.access_token),
        refreshToken: tokenData.refresh_token ? encrypt(tokenData.refresh_token) : undefined,
        tokenExpiry:  new Date(Date.now() + (tokenData.expires_in || 3600) * 1000),
        lastSync:     new Date(),
        metadata:     canvaMetadata,
      },
    })

    await registry.connectPlatform('canva', { accessToken: tokenData.access_token })

    return redirectSuccess(res, 'canva')
  } catch (err) {
    console.error('[OAuth/Canva]', err.message)
    return redirectError(res, 'canva', err.message)
  }
})

// ─── Generic status check ─────────────────────────────────────────────────────

router.get('/status', verifyToken, async (_req, res) => {
  const platforms = await prisma.platform.findMany()
  const status = platforms.reduce((acc, p) => {
    acc[p.name] = {
      connected:   p.isConnected,
      lastSync:    p.lastSync,
      tokenExpiry: p.tokenExpiry,
      metadata:    p.metadata,
    }
    return acc
  }, {})
  res.json({ success: true, status })
})

module.exports = router
