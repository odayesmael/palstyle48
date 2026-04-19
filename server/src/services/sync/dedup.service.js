/**
 * Dedup & RFM Service
 * Handles deduplication logic and RFM segmentation scoring
 */
const prisma = require('../../lib/prisma')

// Helper: Normalize phone numbers (remove spaces, symbols, keep last 10 digits)
function normalizePhone(phone) {
  if (!phone) return null
  const cleaned = phone.replace(/\D/g, '')
  return cleaned.length > 10 ? cleaned.slice(-10) : cleaned
}

/**
 * Calculate RFM Scores and Tag
 * @param {Date} lastOrderAt 
 * @param {Number} totalOrders 
 * @param {Number} totalSpent 
 */
function calculateRFM(lastOrderAt, totalOrders = 0, totalSpent = 0) {
  let r = 1, f = 1, m = 1

  // Recency (R)
  if (lastOrderAt) {
    const daysSince = Math.floor((Date.now() - new Date(lastOrderAt).getTime()) / (1000 * 60 * 60 * 24))
    if (daysSince <= 7) r = 5
    else if (daysSince <= 30) r = 4
    else if (daysSince <= 60) r = 3
    else if (daysSince <= 90) r = 2
    else r = 1
  }

  // Frequency (F)
  if (totalOrders >= 20) f = 5
  else if (totalOrders >= 10) f = 4
  else if (totalOrders >= 5) f = 3
  else if (totalOrders >= 2) f = 2
  else if (totalOrders === 1) f = 1
  else f = 0 // No orders yet

  // Monetary (M)
  if (totalSpent >= 1000) m = 5
  else if (totalSpent >= 500) m = 4
  else if (totalSpent >= 200) m = 3
  else if (totalSpent >= 50) m = 2
  else m = 1

  // Determine Segment
  let segment = 'new'
  const isNew = r >= 4 && f === 1 // less than 30 days and only 1 order

  if (!lastOrderAt || f === 0) {
    segment = 'new' // Just synced, no orders 
  } else if (r >= 4 && f >= 4 && m >= 4) {
    segment = 'vip'
  } else if (r >= 3 && (f >= 2 || m >= 2)) {
    segment = 'active'
  } else if (r === 2 && f >= 2) {
    segment = 'idle'
  } else if (r === 1) {
    segment = 'lost'
  } else if (isNew) {
    segment = 'new'
  } else {
    segment = 'active' // fallback
  }

  const scoreInt = parseInt(`${r}${f}${m}`)

  return { r, f, m, segment, rfmScore: scoreInt }
} // End RFM

/**
 * Upsert Customer with Deduplication
 */
async function processCustomer(customerData) {
  const { email, phone, name, source, platformId, tags, notes, metadata } = customerData
  
  if (!email && !phone && !name && !platformId) return null // Cannot process empty customer

  const normPhone = normalizePhone(phone)
  let existingCustomer = null

  // 1. Try to find by Email exact match
  if (email) {
    existingCustomer = await prisma.customer.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } }
    })
  }

  // 2. Try to find by normalized phone
  if (!existingCustomer && normPhone) {
    // We fetch all to check normalized phone manually or use Prisma raw. Prisma doesn't have a normalized query fallback natively.
    // For large DBs, storing a normalizedPhone column is better. For now, doing JS filtering or partial match.
    existingCustomer = await prisma.customer.findFirst({
      where: { phone: { contains: normPhone } } 
    })
  }

  // 3. Very Fuzzy matching for Name is skipped for automatic merge (creates Manual Merge notes)
  // Instead, create new if not found, but add note if name matches another.
  if (!existingCustomer && name) {
    const potentialMatch = await prisma.customer.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } }
    })
    
    if (potentialMatch) {
      // Possible duplicate
      customerData.notes = `${customerData.notes || ''} [System Note: Possible duplicate of customer ID ${potentialMatch.id} based on name match]`.trim()
    }
  }

  if (existingCustomer) {
    // MERGE logic
    let platformIdsObj = existingCustomer.platformIds || {}
    if (typeof platformIdsObj !== 'object') platformIdsObj = {}
    if (platformId) platformIdsObj[source] = platformId

    const newTags = Array.from(new Set([...(existingCustomer.tags || []), ...(tags || [])]))
    
    return prisma.customer.update({
      where: { id: existingCustomer.id },
      data: {
        name: existingCustomer.name, // Keep older name usually, or overwrite if empty
        phone: existingCustomer.phone || phone,
        platformIds: platformIdsObj,
        tags: newTags,
        notes: [existingCustomer.notes, customerData.notes].filter(Boolean).join('\n')
      }
    })
  } else {
    // CREATE new logic
    return prisma.customer.create({
      data: {
        name: name || 'Unknown Customer',
        email: email || null,
        phone: phone || null,
        source: source,
        platformIds: platformId ? { [source]: platformId } : null,
        tags: tags || [],
        notes: notes || null,
        metadata: metadata || null,
      }
    })
  }
}

/**
 * Re-evaluates RFM for a customer (used after orders sync or by cron)
 */
async function recalculateCustomerTotals(customerId) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: { orders: true }
  })
  
  if (!customer) return

  const totalOrders = customer.orders.length
  const totalSpent = customer.orders.reduce((sum, order) => sum + (order.total || 0), 0)
  const averageOrder = totalOrders > 0 ? (totalSpent / totalOrders) : 0
  
  // Find last order
  let lastOrderAt = null
  if (totalOrders > 0) {
    const sorted = [...customer.orders].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt))
    lastOrderAt = sorted[0].createdAt
  }

  const rfm = calculateRFM(lastOrderAt, totalOrders, totalSpent)

  await prisma.customer.update({
    where: { id: customerId },
    data: {
      totalOrders,
      totalSpent,
      averageOrder,
      lastOrderAt,
      segment: rfm.segment,
      rfmScore: rfm.rfmScore
    }
  })
}

/**
 * Cron task: update RFM for ALL customers
 */
async function recalculateAllRFM() {
  const customers = await prisma.customer.findMany({ select: { id: true } })
  for (const c of customers) {
    await recalculateCustomerTotals(c.id)
  }
}

module.exports = {
  processCustomer,
  recalculateCustomerTotals,
  recalculateAllRFM,
  calculateRFM,
  normalizePhone
}
