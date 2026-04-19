const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  try {
    const allCustomersValue = await prisma.customer.aggregate({ _sum: { totalSpent: true } })
    console.log("Stats aggregate worked:", allCustomersValue)
    
    const customers = await prisma.customer.findMany({ take: 1 })
    console.log("Customers fetch worked:", customers.length)
  } catch (e) {
    console.error("Prisma error:", e)
  }
}
main().finally(() => prisma.$disconnect())
