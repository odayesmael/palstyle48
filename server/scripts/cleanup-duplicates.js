const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function cleanupDuplicates() {
  console.log('🔍 Fetching all customers to find duplicates...')
  // 1. Fetch all customers ordered by creation (oldest first)
  const customers = await prisma.customer.findMany({
    orderBy: { createdAt: 'asc' },
  })

  console.log(`Found ${customers.length} total customers.`)

  // 2. Group them
  // We'll use platformId + source as the strongest group, 
  // and fallback to name + source if no platformId.
  const groups = {}

  for (const cust of customers) {
    let groupKey = null

    if (cust.platformIds && cust.platformIds[cust.source]) {
      groupKey = `PLATFORM_${cust.source}_${cust.platformIds[cust.source]}`
    } else {
      groupKey = `NAME_${cust.source}_${cust.name.toLowerCase().trim()}`
    }

    if (!groups[groupKey]) {
      groups[groupKey] = []
    }
    groups[groupKey].push(cust)
  }

  // 3. Process each group
  let totalDeleted = 0
  let totalMergedOrders = 0
  let totalMergedMessages = 0

  for (const [key, groupList] of Object.entries(groups)) {
    if (groupList.length <= 1) continue // No duplicates

    console.log(`\n⚠️ Found ${groupList.length} duplicates for [${key}]`)

    // The first one is the oldest, we keep it as the "Master"
    const master = groupList[0]
    const duplicates = groupList.slice(1)
    const duplicateIds = duplicates.map(d => d.id)

    console.log(`   👉 Master ID to keep: ${master.id} (${master.name})`)
    console.log(`   👉 IDs to merge & delete: ${duplicateIds.join(', ')}`)

    // 4. Update related records to point to Master
    try {
      // Move Orders
      const orderRes = await prisma.order.updateMany({
        where: { customerId: { in: duplicateIds } },
        data: { customerId: master.id }
      })
      if (orderRes.count > 0) {
        console.log(`   ✅ Merged ${orderRes.count} orders to Master.`)
        totalMergedOrders += orderRes.count
      }

      // Move Messages
      const msgRes = await prisma.message.updateMany({
        where: { customerId: { in: duplicateIds } },
        data: { customerId: master.id }
      })
      if (msgRes.count > 0) {
        console.log(`   ✅ Merged ${msgRes.count} messages to Master.`)
        totalMergedMessages += msgRes.count
      }

      // 5. Safely Delete Duplicates
      const delRes = await prisma.customer.deleteMany({
        where: { id: { in: duplicateIds } }
      })
      console.log(`   🗑️ Deleted ${delRes.count} duplicate records.`)
      totalDeleted += delRes.count

    } catch (err) {
      console.error(`   ❌ Failed to process group ${key}:`, err.message)
    }
  }

  console.log('\n=======================================')
  console.log('🎉 Cleanup Completed!')
  console.log(`Total duplicated removed: ${totalDeleted}`)
  console.log(`Orders re-assigned:    ${totalMergedOrders}`)
  console.log(`Messages re-assigned:  ${totalMergedMessages}`)
  console.log('=======================================\n')
}

cleanupDuplicates()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect())
