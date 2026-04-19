/**
 * Analytics Service - Content performance data from Meta Graph API
 */

const prisma = require('../../lib/prisma')
const { decrypt } = require('../../integrations/token-manager')

async function getIGAccessToken() {
  const record = await prisma.platform.findUnique({ where: { name: 'meta' } })
  if (!record || !record.isConnected) return null
  const meta = record.metadata || {}
  const pages = meta.pages || []
  const pageWithIG = pages.find(p => p.instagramId) || pages[0]
  return {
    token: pageWithIG?.accessToken ? decrypt(pageWithIG.accessToken) : decrypt(record.accessToken),
    igUserId: pageWithIG?.instagramId
  }
}

/**
 * Fetch recent media with engagement metrics
 */
async function getTopPosts(limit = 10) {
  try {
    const config = await getIGAccessToken()
    if (!config?.igUserId) return []

    const fields = 'id,caption,media_type,timestamp,like_count,comments_count,reach,impressions,saved'
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${config.igUserId}/media?fields=${fields}&limit=${limit}&access_token=${config.token}`
    )
    const data = await res.json()

    if (!data.data) return []

    return data.data
      .map(post => ({
        id: post.id,
        caption: post.caption?.slice(0, 100),
        type: post.media_type?.toLowerCase(),
        date: post.timestamp,
        likes: post.like_count || 0,
        comments: post.comments_count || 0,
        reach: post.reach || 0,
        impressions: post.impressions || 0,
        saves: post.saved || 0,
        engagement: (post.like_count || 0) + (post.comments_count || 0) + (post.saved || 0)
      }))
      .sort((a, b) => b.engagement - a.engagement)
      .slice(0, 5)
  } catch (err) {
    console.error('[Analytics] getTopPosts error:', err.message)
    return []
  }
}

/**
 * Get IG account insights summary
 */
async function getAccountInsights() {
  try {
    const config = await getIGAccessToken()
    if (!config?.igUserId) return null

    const period = 'day'
    const since = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60 // 30 days
    const metrics = 'impressions,reach,profile_views,follower_count'

    const res = await fetch(
      `https://graph.facebook.com/v21.0/${config.igUserId}/insights?metric=${metrics}&period=${period}&since=${since}&access_token=${config.token}`
    )
    const data = await res.json()
    return data.data || null
  } catch (err) {
    console.error('[Analytics] insights error:', err.message)
    return null
  }
}

/**
 * Calculate best posting times based on recent post engagement
 */
async function getBestPostingTimes() {
  try {
    const config = await getIGAccessToken()
    if (!config?.igUserId) {
      // Return defaults if not connected
      return [
        { hour: 9, label: '9:00 ص', reason: 'أعلى تفاعل صباحاً' },
        { hour: 19, label: '7:00 م', reason: 'ذروة المساء' },
        { hour: 21, label: '9:00 م', reason: 'وقت الراحة' }
      ]
    }

    const fields = 'timestamp,like_count,comments_count'
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${config.igUserId}/media?fields=${fields}&limit=50&access_token=${config.token}`
    )
    const data = await res.json()
    if (!data.data?.length) return []

    // Group by hour and compute average engagement
    const hourMap = {}
    for (const post of data.data) {
      const hour = new Date(post.timestamp).getHours()
      const eng = (post.like_count || 0) + (post.comments_count || 0)
      if (!hourMap[hour]) hourMap[hour] = { total: 0, count: 0 }
      hourMap[hour].total += eng
      hourMap[hour].count++
    }

    const sorted = Object.entries(hourMap)
      .map(([hour, val]) => ({ hour: Number(hour), avg: val.total / val.count }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 3)

    const labels = h => {
      const suffix = h < 12 ? 'ص' : 'م'
      const display = h % 12 === 0 ? 12 : h % 12
      return `${display}:00 ${suffix}`
    }

    return sorted.map(t => ({
      hour: t.hour,
      label: labels(t.hour),
      avgEngagement: Math.round(t.avg),
      reason: `متوسط ${Math.round(t.avg)} تفاعل`
    }))
  } catch (err) {
    console.error('[Analytics] bestTimes error:', err.message)
    return []
  }
}

/**
 * Get aggregate stats from DB content table
 */
async function getContentStats() {
  const [total, published, scheduled, draft] = await Promise.all([
    prisma.content.count(),
    prisma.content.count({ where: { status: 'published' } }),
    prisma.content.count({ where: { status: 'scheduled' } }),
    prisma.content.count({ where: { status: 'draft' } })
  ])

  // Published this week
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7)
  const publishedThisWeek = await prisma.content.count({
    where: { status: 'published', publishedAt: { gte: weekAgo } }
  })

  return { total, published, scheduled, draft, publishedThisWeek }
}

module.exports = { getTopPosts, getAccountInsights, getBestPostingTimes, getContentStats }
