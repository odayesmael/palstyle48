// ─── Ads Sync Service ─────────────────────────────────────────────────────────
// Syncs campaigns & insights from Meta Ads + Trendyol Ads into the DB
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()
const { decrypt } = require('../../integrations/token-manager')

// ── Meta Graph API helpers ────────────────────────────────────────────────────
async function metaGet(path, token, params = {}) {
  const url = new URL(`https://graph.facebook.com/v19.0${path}`)
  url.searchParams.set('access_token', token)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString())
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`Meta API error ${res.status}: ${err?.error?.message || res.statusText}`)
  }
  return res.json()
}

// ── Trendyol Ads API helpers ──────────────────────────────────────────────────
async function trendyolGet(path, platform) {
  const supplierId = platform.supplierId
  const apiKey     = platform.apiKey
  const apiSecret  = platform.apiSecret
  if (!supplierId || !apiKey || !apiSecret) throw new Error('Trendyol credentials missing')

  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')
  const baseUrl = 'https://api.trendyol.com/sapigw'
  const res = await fetch(`${baseUrl}${path}`, {
    headers: {
      Authorization: `Basic ${auth}`,
      'User-Agent': `${supplierId} - SelfIntegration`,
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`Trendyol API error ${res.status}: ${err?.errors?.[0]?.message || res.statusText}`)
  }
  return res.json()
}

// ─── META: Sync campaign list (daily) ────────────────────────────────────────
async function syncMetaCampaigns() {
  const platform = await prisma.platform.findUnique({ where: { name: 'meta' } })
  if (!platform?.isConnected || !platform.accessToken) {
    console.log('[AdsSync] Meta not connected, skipping campaign sync')
    return { synced: 0 }
  }

  const metadata = platform.metadata || {}
  const adAccountId = metadata.adAccountId
  if (!adAccountId) {
    console.warn('[AdsSync] Meta ad account ID not configured')
    return { synced: 0 }
  }

  try {
    const data = await metaGet(
      `/act_${adAccountId}/campaigns`,
      decrypt(platform.accessToken),
      {
        fields: 'name,status,objective,budget_remaining,daily_budget,lifetime_budget,start_time,stop_time',
        limit: 100,
      }
    )

    const campaigns = data.data || []
    let synced = 0

    for (const camp of campaigns) {
      const budget = camp.daily_budget
        ? parseFloat(camp.daily_budget) / 100
        : camp.lifetime_budget
        ? parseFloat(camp.lifetime_budget) / 100
        : 0

      const budgetType = camp.daily_budget ? 'daily' : 'lifetime'

      await prisma.adCampaign.upsert({
        where: { platform_platformCampId: { platform: 'meta', platformCampId: camp.id } },
        update: {
          name:      camp.name,
          status:    normalizeMetaStatus(camp.status),
          objective: camp.objective || null,
          budget,
          budgetType,
          endDate:   camp.stop_time ? new Date(camp.stop_time) : null,
          updatedAt: new Date(),
        },
        create: {
          platform:      'meta',
          platformCampId: camp.id,
          name:          camp.name,
          status:        normalizeMetaStatus(camp.status),
          objective:     camp.objective || null,
          budget,
          budgetType,
          currency:      'USD',
          startDate:     camp.start_time ? new Date(camp.start_time) : new Date(),
          endDate:       camp.stop_time ? new Date(camp.stop_time) : null,
        },
      })
      synced++
    }

    await prisma.platform.update({
      where: { name: 'meta' },
      data: { lastSync: new Date(), syncStatus: 'idle' },
    })

    console.log(`[AdsSync] Meta: synced ${synced} campaigns`)
    return { synced }
  } catch (err) {
    console.error('[AdsSync] Meta campaign sync failed:', err.message)
    await prisma.platform.update({ where: { name: 'meta' }, data: { syncStatus: 'error' } }).catch(() => {})
    return { synced: 0, error: err.message }
  }
}

// ─── META: Sync insights (hourly) ────────────────────────────────────────────
async function syncMetaInsights() {
  const platform = await prisma.platform.findUnique({ where: { name: 'meta' } })
  if (!platform?.isConnected || !platform.accessToken) return { synced: 0 }

  const campaigns = await prisma.adCampaign.findMany({
    where: { platform: 'meta', status: { in: ['active', 'paused'] } },
    take: 50,
  })

  let synced = 0
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const since = new Date(today)
  since.setDate(since.getDate() - 30)

  for (const camp of campaigns) {
    try {
      const data = await metaGet(
        `/${camp.platformCampId}/insights`,
        decrypt(platform.accessToken),
        {
          fields: 'impressions,clicks,spend,actions,cost_per_action_type,date_start',
          time_range: JSON.stringify({
            since: formatDate(since),
            until: formatDate(today),
          }),
          time_increment: 1,
          limit: 31,
        }
      )

      const rows = data.data || []
      for (const row of rows) {
        const date = new Date(row.date_start)
        const impressions = parseInt(row.impressions || 0)
        const clicks      = parseInt(row.clicks || 0)
        const spend       = parseFloat(row.spend || 0)
        const conversions = extractConversions(row.actions)
        const revenue     = extractRevenue(row.actions)
        const ctr         = impressions > 0 ? (clicks / impressions) * 100 : 0
        const cpc         = clicks > 0 ? spend / clicks : 0
        const cpa         = conversions > 0 ? spend / conversions : 0
        const roas        = spend > 0 ? revenue / spend : 0

        await prisma.adInsight.upsert({
          where: { campaignId_date: { campaignId: camp.id, date } },
          update: { impressions, clicks, spend, conversions, revenue, ctr, cpc, cpa, roas },
          create: { campaignId: camp.id, date, impressions, clicks, spend, conversions, revenue, ctr, cpc, cpa, roas },
        })
        synced++
      }
    } catch (err) {
      console.error(`[AdsSync] Insights error for ${camp.name}:`, err.message)
    }
  }

  console.log(`[AdsSync] Meta: synced ${synced} daily insight rows`)
  return { synced }
}

// ─── TRENDYOL: Sync promoted products ────────────────────────────────────────
async function syncTrendyolAds() {
  const platform = await prisma.platform.findUnique({ where: { name: 'trendyol' } })
  if (!platform?.isConnected || !platform.apiKey) {
    console.log('[AdsSync] Trendyol not connected, skipping')
    return { synced: 0 }
  }

  try {
    const supplierId = platform.supplierId
    const data = await trendyolGet(
      `/suppliers/${supplierId}/promoted-products`,
      platform
    ).catch(() => ({ promotedProducts: [] }))

    const products = data.promotedProducts || data.content || []
    let synced = 0

    for (const prod of products) {
      const campId = String(prod.productId || prod.id || Math.random())
      const spend   = parseFloat(prod.totalCost || prod.spend || 0)
      const revenue = parseFloat(prod.totalRevenue || prod.revenue || 0)
      const clicks  = parseInt(prod.clicks || prod.clickCount || 0)
      const impressions = parseInt(prod.impressions || prod.viewCount || 0)

      const camp = await prisma.adCampaign.upsert({
        where: { platform_platformCampId: { platform: 'trendyol', platformCampId: campId } },
        update: {
          name:   prod.productName || prod.name || `Product ${campId}`,
          status: prod.isActive ? 'active' : 'paused',
          updatedAt: new Date(),
        },
        create: {
          platform:       'trendyol',
          platformCampId: campId,
          name:           prod.productName || prod.name || `Product ${campId}`,
          status:         prod.isActive ? 'active' : 'paused',
          objective:      'conversions',
          budget:         parseFloat(prod.dailyBudget || 0),
          budgetType:     'daily',
          currency:       'TRY',
          startDate:      new Date(),
        },
      })

      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const conversions = parseInt(prod.orders || prod.conversions || 0)
      const roas = spend > 0 ? revenue / spend : 0

      await prisma.adInsight.upsert({
        where: { campaignId_date: { campaignId: camp.id, date: today } },
        update: { impressions, clicks, spend, conversions, revenue, roas },
        create: { campaignId: camp.id, date: today, impressions, clicks, spend, conversions, revenue, roas },
      })
      synced++
    }

    await prisma.platform.update({
      where: { name: 'trendyol' },
      data: { lastSync: new Date(), syncStatus: 'idle' },
    })

    console.log(`[AdsSync] Trendyol: synced ${synced} promoted products`)
    return { synced }
  } catch (err) {
    console.error('[AdsSync] Trendyol sync failed:', err.message)
    return { synced: 0, error: err.message }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function normalizeMetaStatus(s) {
  if (!s) return 'paused'
  const m = { ACTIVE: 'active', PAUSED: 'paused', DELETED: 'ended', ARCHIVED: 'ended' }
  return m[s.toUpperCase()] || 'paused'
}

function extractConversions(actions = []) {
  if (!Array.isArray(actions)) return 0
  const types = ['purchase', 'omni_purchase', 'offsite_conversion.fb_pixel_purchase']
  const found = actions.find(a => types.includes(a.action_type))
  return found ? parseInt(found.value || 0) : 0
}

function extractRevenue(actions = []) {
  if (!Array.isArray(actions)) return 0
  const types = ['purchase', 'omni_purchase', 'offsite_conversion.fb_pixel_purchase']
  const found = actions.find(a => types.includes(a.action_type))
  return found ? parseFloat(found.value || 0) * 50 : 0 // approximate if no revenue data
}

function formatDate(d) {
  return d.toISOString().split('T')[0]
}

module.exports = { syncMetaCampaigns, syncMetaInsights, syncTrendyolAds }
