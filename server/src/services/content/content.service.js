/**
 * Content Service - CRUD operations for content management
 */

const prisma = require('../../lib/prisma')

/**
 * Fetch content list with filters
 */
async function listContent({ platform, status, type, month, year } = {}) {
  const where = {}
  if (platform && platform !== 'all') where.platform = platform
  if (status && status !== 'all') where.status = status
  if (type && type !== 'all') where.type = type

  // Filter by month/year for calendar view
  if (month !== undefined && year !== undefined) {
    const start = new Date(year, month, 1)
    const end = new Date(year, month + 1, 0, 23, 59, 59)
    where.OR = [
      { scheduledAt: { gte: start, lte: end } },
      { publishedAt: { gte: start, lte: end } },
      { createdAt: { gte: start, lte: end } }
    ]
  }

  return prisma.content.findMany({
    where,
    orderBy: [
      { scheduledAt: 'asc' },
      { createdAt: 'desc' }
    ]
  })
}

/**
 * Create new content item
 */
async function createContent(data) {
  return prisma.content.create({
    data: {
      platform: data.platform,
      type: data.type || 'post',
      caption: data.caption || null,
      hashtags: data.hashtags || [],
      mediaUrls: data.mediaUrls || [],
      canvaDesignId: data.canvaDesignId || null,
      scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
      status: data.scheduledAt ? 'scheduled' : 'draft',
      notes: data.notes || null
    }
  })
}

/**
 * Update content item
 */
async function updateContent(id, data) {
  const updateData = {}
  if (data.caption !== undefined) updateData.caption = data.caption
  if (data.hashtags !== undefined) updateData.hashtags = data.hashtags
  if (data.mediaUrls !== undefined) updateData.mediaUrls = data.mediaUrls
  if (data.notes !== undefined) updateData.notes = data.notes
  if (data.scheduledAt !== undefined) {
    updateData.scheduledAt = data.scheduledAt ? new Date(data.scheduledAt) : null
    updateData.status = data.scheduledAt ? 'scheduled' : 'draft'
  }
  if (data.status !== undefined) updateData.status = data.status

  return prisma.content.update({ where: { id }, data: updateData })
}

/**
 * Delete content item
 */
async function deleteContent(id) {
  return prisma.content.delete({ where: { id } })
}

/**
 * Get single content item
 */
async function getContent(id) {
  return prisma.content.findUnique({ where: { id } })
}

/**
 * Mark content as published
 */
async function markPublished(id, platformPostId) {
  return prisma.content.update({
    where: { id },
    data: {
      status: 'published',
      publishedAt: new Date(),
      platformPostId: platformPostId || null
    }
  })
}

/**
 * Get all pending scheduled content (scheduledAt <= now, status = scheduled)
 */
async function getPendingScheduled() {
  return prisma.content.findMany({
    where: {
      status: 'scheduled',
      scheduledAt: { lte: new Date() }
    }
  })
}

module.exports = { listContent, createContent, updateContent, deleteContent, getContent, markPublished, getPendingScheduled }
