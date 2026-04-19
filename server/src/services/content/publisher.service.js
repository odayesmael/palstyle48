/**
 * Publisher Service - Publishes content to Meta platforms via Graph API
 */

const prisma = require('../../lib/prisma')
const { decrypt } = require('../../integrations/token-manager')

/**
 * Get Meta access token and IG user ID from DB
 */
async function getMetaConfig() {
  const record = await prisma.platform.findUnique({ where: { name: 'meta' } })
  if (!record || !record.isConnected) throw new Error('Meta غير مربوطة')

  const accessToken = decrypt(record.accessToken)
  const meta = record.metadata || {}

  // Pick first page's Instagram account
  const pages = meta.pages || []
  const pageWithIG = pages.find(p => p.instagramId) || pages[0]

  return {
    accessToken: pageWithIG?.accessToken ? decrypt(pageWithIG.accessToken) : accessToken,
    igUserId: pageWithIG?.instagramId,
    pageId: pageWithIG?.id,
    pageAccessToken: pageWithIG?.accessToken ? decrypt(pageWithIG.accessToken) : accessToken
  }
}

/**
 * Upload media container to Instagram
 */
async function uploadIGMedia({ accessToken, igUserId, imageUrl, videoUrl, caption, mediaType }) {
  const params = new URLSearchParams()
  params.append('access_token', accessToken)
  params.append('caption', caption || '')

  if (mediaType === 'REELS') {
    params.append('media_type', 'REELS')
    params.append('video_url', videoUrl)
    params.append('share_to_feed', 'true')
  } else if (mediaType === 'STORIES') {
    params.append('media_type', 'STORIES')
    if (imageUrl) params.append('image_url', imageUrl)
    if (videoUrl) params.append('video_url', videoUrl)
  } else {
    // Default IMAGE post
    params.append('image_url', imageUrl)
  }

  const res = await fetch(`https://graph.facebook.com/v21.0/${igUserId}/media`, {
    method: 'POST',
    body: params
  })
  const data = await res.json()
  if (!data.id) throw new Error(`IG media upload failed: ${JSON.stringify(data)}`)
  return data.id // creation_id
}

/**
 * Publish Instagram container
 */
async function publishIGMedia({ accessToken, igUserId, creationId }) {
  const res = await fetch(`https://graph.facebook.com/v21.0/${igUserId}/media_publish`, {
    method: 'POST',
    body: new URLSearchParams({ creation_id: creationId, access_token: accessToken })
  })
  const data = await res.json()
  if (!data.id) throw new Error(`IG publish failed: ${JSON.stringify(data)}`)
  return data.id
}

/**
 * Upload carousel items and create container
 */
async function publishIGCarousel({ accessToken, igUserId, imageUrls, caption }) {
  // Step 1: Upload each item
  const itemIds = []
  for (const url of imageUrls) {
    const params = new URLSearchParams({ image_url: url, is_carousel_item: 'true', access_token: accessToken })
    const res = await fetch(`https://graph.facebook.com/v21.0/${igUserId}/media`, { method: 'POST', body: params })
    const data = await res.json()
    if (!data.id) throw new Error(`Carousel item upload failed: ${JSON.stringify(data)}`)
    itemIds.push(data.id)
  }

  // Step 2: Create carousel container
  const containerParams = new URLSearchParams({
    media_type: 'CAROUSEL',
    children: itemIds.join(','),
    caption: caption || '',
    access_token: accessToken
  })
  const containerRes = await fetch(`https://graph.facebook.com/v21.0/${igUserId}/media`, { method: 'POST', body: containerParams })
  const containerData = await containerRes.json()
  if (!containerData.id) throw new Error(`Carousel container failed: ${JSON.stringify(containerData)}`)

  // Step 3: Publish
  return publishIGMedia({ accessToken, igUserId, creationId: containerData.id })
}

/**
 * Publish to Facebook Page feed
 */
async function publishFBPost({ pageAccessToken, pageId, message, link }) {
  const body = new URLSearchParams({
    message: message || '',
    access_token: pageAccessToken
  })
  if (link) body.append('link', link)

  const res = await fetch(`https://graph.facebook.com/v21.0/${pageId}/feed`, {
    method: 'POST',
    body
  })
  const data = await res.json()
  if (!data.id) throw new Error(`FB post failed: ${JSON.stringify(data)}`)
  return data.id
}

/**
 * Main publish dispatcher
 */
async function publishContent(contentItem) {
  const { platform, type, caption, hashtags = [], mediaUrls = [] } = contentItem
  const fullCaption = `${caption || ''}\n\n${hashtags.map(h => `#${h.replace(/^#/, '')}`).join(' ')}`.trim()

  const config = await getMetaConfig()

  let platformPostId = null

  if (platform === 'instagram') {
    const firstMedia = mediaUrls[0]
    if (!firstMedia) throw new Error('لا توجد صور/فيديو للنشر')

    if (type === 'carousel' && mediaUrls.length > 1) {
      platformPostId = await publishIGCarousel({
        accessToken: config.accessToken,
        igUserId: config.igUserId,
        imageUrls: mediaUrls,
        caption: fullCaption
      })
    } else {
      const mediaType = type === 'reel' ? 'REELS' : type === 'story' ? 'STORIES' : 'IMAGE'
      const isVideo = firstMedia.includes('.mp4') || firstMedia.includes('.mov')

      const creationId = await uploadIGMedia({
        accessToken: config.accessToken,
        igUserId: config.igUserId,
        imageUrl: isVideo ? undefined : firstMedia,
        videoUrl: isVideo ? firstMedia : undefined,
        caption: fullCaption,
        mediaType
      })

      // For video, need to wait for processing
      if (isVideo) await new Promise(r => setTimeout(r, 10000))

      platformPostId = await publishIGMedia({
        accessToken: config.accessToken,
        igUserId: config.igUserId,
        creationId
      })
    }
  } else if (platform === 'facebook') {
    platformPostId = await publishFBPost({
      pageAccessToken: config.pageAccessToken,
      pageId: config.pageId,
      message: fullCaption
    })
  }

  return platformPostId
}

module.exports = { publishContent }
