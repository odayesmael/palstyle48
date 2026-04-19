// ─── Prisma Client Singleton ──────────────────────────────────────────────────
// Always import Prisma from this file to avoid creating multiple connections
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient({
  // Logging 'query' in dev adds overhead to every DB call — use only when debugging
  log: ['error'],
})

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect()
})

module.exports = prisma
