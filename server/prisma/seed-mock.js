const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding Mock Data for CRM...')

  const mockCustomers = [
    {
      name: 'سارة محمد',
      email: 'sara.m@gmail.com',
      phone: '0591234567',
      source: 'shopify',
      segment: 'vip',
      totalOrders: 15,
      totalSpent: 4250.50,
      averageOrder: 283.3,
      lastOrderAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
      tags: ['loyal', 'high-spender'],
      rfmScore: 555
    },
    {
      name: 'أحمد خليل',
      email: 'ahmad.k@outlook.com',
      phone: '0599988776',
      source: 'instagram',
      segment: 'active',
      totalOrders: 4,
      totalSpent: 850.00,
      averageOrder: 212.5,
      lastOrderAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000), // 15 days ago
      tags: ['summer-campaign'],
      rfmScore: 433
    },
    {
      name: 'ياسمين عبدلله',
      email: null,
      phone: '0591112233',
      source: 'whatsapp',
      segment: 'idle',
      totalOrders: 2,
      totalSpent: 300.00,
      averageOrder: 150.0,
      lastOrderAt: new Date(Date.now() - 65 * 24 * 60 * 60 * 1000), // 65 days ago
      tags: [],
      rfmScore: 222
    },
    {
      name: 'خالد ناصر',
      email: 'khaledn@demo.com',
      phone: null,
      source: 'trendyol',
      segment: 'new',
      totalOrders: 1,
      totalSpent: 120.00,
      averageOrder: 120.0,
      lastOrderAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
      tags: ['first-time'],
      rfmScore: 511
    },
    {
      name: 'داليا عمر',
      email: 'dalia.o@gmail.com',
      phone: '0594445555',
      source: 'shopify',
      segment: 'lost',
      totalOrders: 6,
      totalSpent: 1100.00,
      averageOrder: 183.3,
      lastOrderAt: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000), // 120 days ago
      tags: ['churn-risk'],
      rfmScore: 144
    }
  ]

  for (const c of mockCustomers) {
    await prisma.customer.upsert({
      where: { email_source: { email: c.email || '', source: c.source } },
      update: c,
      create: c
    }).catch(async (e) => {
        // Fallback for null emails using unique phone logic or just try creating
        if (!c.email) {
            await prisma.customer.create({ data: c }).catch(()=>null)
        }
    })
  }

  console.log('✅ Mock customers injected successfully!')

  // Create a few mock orders to populate stats
  const c1 = await prisma.customer.findFirst({ where: { email: 'sara.m@gmail.com' } })
  if (c1) {
    await prisma.order.upsert({
      where: { platform_platformOrderId: { platform: 'shopify', platformOrderId: 'MOCK-1001' } },
      update: {},
      create: {
        customerId: c1.id,
        platform: 'shopify',
        platformOrderId: 'MOCK-1001',
        status: 'delivered',
        subtotal: 150,
        total: 150,
        items: [{ productId: '1', name: 'Premium Leather Bag', quantity: 1, price: 150 }]
      }
    })
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
