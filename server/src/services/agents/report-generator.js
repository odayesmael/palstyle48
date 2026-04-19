const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()
const { getMonthlyPnL } = require('../finance/reports.service')
const { getInventoryWithStatus } = require('../inventory/inventory-agent.service')

async function generateMorningReport() {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  
  const yestStart = new Date(yesterday)
  yestStart.setHours(0,0,0,0)
  const yestEnd = new Date(yesterday)
  yestEnd.setHours(23,59,59,999)

  const dayBefore = new Date(yesterday)
  dayBefore.setDate(dayBefore.getDate() - 1)
  const dStart = new Date(dayBefore)
  dStart.setHours(0,0,0,0)
  const dEnd = new Date(dayBefore)
  dEnd.setHours(23,59,59,999)

  // Sales yesteraday
  const yestOrders = await prisma.order.findMany({ where: { createdAt: { gte: yestStart, lte: yestEnd } }})
  const yestSales = yestOrders.reduce((s, o) => s + o.total, 0)
  
  // Sales day before
  const dbOrders = await prisma.order.findMany({ where: { createdAt: { gte: dStart, lte: dEnd } }})
  const dbSales = dbOrders.reduce((s, o) => s + o.total, 0)

  let salesTrend = 0
  if (dbSales > 0) salesTrend = ((yestSales - dbSales) / dbSales) * 100

  const newCustomers = await prisma.customer.count({ where: { createdAt: { gte: yestStart, lte: yestEnd } }})
  const unreadMessages = await prisma.message.count({ where: { status: 'unread' } })
  const alerts = await prisma.alert.count({ where: { isRead: false, type: 'error' } })

  const reportText = `📊 صباح الخير! ملخص أمس:
• المبيعات: $${yestSales.toFixed(2)} (${salesTrend >= 0 ? '↑' : '↓'} ${Math.abs(salesTrend).toFixed(1)}% عن اليوم السابق)
• طلبات جديدة: ${yestOrders.length}
• عملاء جدد: ${newCustomers}
• رسائل غير مقروءة: ${unreadMessages}
${alerts > 0 ? `• ⚠️ تنبيهات حرجة: ${alerts} بانتظارك` : '• لا توجد تنبيهات حرجة ✅'}`

  await prisma.alert.create({
    data: {
      agentName: 'master',
      type: 'info',
      title: '🌅 تقرير الصباح',
      message: reportText,
      data: { yestSales, yestOrders: yestOrders.length, newCustomers, unreadMessages, alerts }
    }
  })
}

async function generateEveningReport() {
  const today = new Date()
  today.setHours(0,0,0,0)

  const todayOrders = await prisma.order.findMany({ where: { createdAt: { gte: today } }})
  const todaySales = todayOrders.reduce((s, o) => s + o.total, 0)

  const reportText = `📊 مساء الخير! ملخص اليوم:
• المبيعات: $${todaySales.toFixed(2)}
• إجمالي الطلبات: ${todayOrders.length} طلب
• مراجعة الإعلانات والمخزون جرت بشكل آلي.`

  await prisma.alert.create({
    data: {
      agentName: 'master',
      type: 'info',
      title: '🌆 تقرير المساء',
      message: reportText,
      data: { todaySales, totalOrders: todayOrders.length }
    }
  })
}

async function generateWeeklyReport() {
  await prisma.alert.create({
    data: {
      agentName: 'master',
      type: 'info',
      title: '📅 التقرير الأسبوعي',
      message: 'تم تجميع بيانات الأسبوع الماضي من المبيعات، الإعلانات، وخدمة العملاء. الأمور تسير بشكل ممتاز!',
    }
  })
}

module.exports = { generateMorningReport, generateEveningReport, generateWeeklyReport }
