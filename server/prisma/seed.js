// ─── Seed: Create default admin account ──────────────────────────────────────
const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

const ADMIN_EMAIL = 'admin@palstyle48.com'
const ADMIN_PASSWORD = 'Admin@2026!'
const ADMIN_NAME = 'Admin'

async function main() {
  console.log('🌱 Seeding database...')

  // Check if admin already exists
  const existing = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } })
  if (existing) {
    console.log('✅ Admin account already exists, skipping.')
    return
  }

  const hashed = await bcrypt.hash(ADMIN_PASSWORD, 12)

  const admin = await prisma.user.create({
    data: {
      email: ADMIN_EMAIL,
      password: hashed,
      name: ADMIN_NAME,
      role: 'admin',
      permissions: {
        dashboard: true,
        customers: true,
        inbox: true,
        content: true,
        ads: true,
        finance: true,
        inventory: true,
        agents: true,
        settings: true,
        users: true,
        tasks: true,
      },
    },
  })

  console.log(`✅ Admin account created:`)
  console.log(`   Email:    ${ADMIN_EMAIL}`)
  console.log(`   Password: ${ADMIN_PASSWORD}`)
  console.log(`   ID:       ${admin.id}`)
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
