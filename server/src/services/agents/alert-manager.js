// Use the shared Prisma singleton — never instantiate PrismaClient directly
const prisma = require('../../lib/prisma')

// Server-side cache: avoid hitting DB on every header poll
let _cache = null
let _cacheAt = 0
const CACHE_TTL = 60_000 // 60 seconds

async function getPrioritizedAlerts() {
  // Return cached result if fresh
  if (_cache && Date.now() - _cacheAt < CACHE_TTL) return _cache

  const unread = await prisma.alert.findMany({
    where: { isRead: false },
    orderBy: { createdAt: 'desc' },
    // Only fetch the fields we actually use — smaller payload
    select: { id: true, type: true, title: true, message: true, createdAt: true },
  })

  const urgent  = unread.filter(a => a.type === 'error' || a.title.includes('عاجل') || a.title.includes('نفاد'))
  const warning = unread.filter(a => a.type === 'warning' && !urgent.includes(a))
  const info    = unread.filter(a => a.type === 'info' || a.type === 'success')

  _cache = { total: unread.length, urgent, warning, info, alerts: [...urgent, ...warning, ...info] }
  _cacheAt = Date.now()

  return _cache
}

async function markAllRead() {
  await prisma.alert.updateMany({ where: { isRead: false }, data: { isRead: true } })
  _cache = null // invalidate cache
  return { success: true }
}

module.exports = { getPrioritizedAlerts, markAllRead }
