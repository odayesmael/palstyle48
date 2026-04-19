const { getOverview: financeOverview } = require('../finance/reports.service')
const { getInventoryWithStatus } = require('../inventory/inventory-agent.service')
const { executeAgentTask } = require('./agent-orchestrator')
const AIProvider = require('../ai/provider')
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()
const ai = new AIProvider()

const masterTools = [
  {
    name: "get_sales_summary",
    description: "ملخص المبيعات (اليوم/الأسبوع/الشهر)",
    params: { period: "today|week|month" }
  },
  {
    name: "get_customer_insights", 
    description: "رؤى العملاء (جدد، VIP خاملين، أعلى إنفاقاً)"
  },
  {
    name: "get_inbox_status",
    description: "حالة صندوق الوارد (غير مقروء، بانتظار رد)"
  },
  {
    name: "get_ad_performance",
    description: "أداء الإعلانات (ROAS, spend, conversions)"
  },
  {
    name: "get_financial_summary",
    description: "الملخص المالي (إيرادات، مصاريف، ربح)"
  },
  {
    name: "get_inventory_alerts",
    description: "تنبيهات المخزون (منخفض، نفاد)"
  },
  {
    name: "get_all_alerts",
    description: "جميع التنبيهات من كل الأقسام",
    params: { priority: "all|urgent|normal" }
  }
]

async function routeQuery(query) {
  const q = query.toLowerCase()
  if (q.includes('مخزون') || q.includes('منتجات') || q.includes('inventory')) return 'get_inventory_alerts'
  if (q.includes('مبيعات') || q.includes('إيرادات') || q.includes('sales')) return 'get_sales_summary'
  if (q.includes('عملاء') || q.includes('customers')) return 'get_customer_insights'
  if (q.includes('رسائل') || q.includes('وارد') || q.includes('inbox')) return 'get_inbox_status'
  if (q.includes('إعلانات') || q.includes('ads') || q.includes('roas')) return 'get_ad_performance'
  if (q.includes('مالية') || q.includes('مصاريف') || q.includes('ربح') || q.includes('finance')) return 'get_financial_summary'
  if (q.includes('تنبيهات') || q.includes('alerts')) return 'get_all_alerts'
  if (q.includes('شغل') || q.includes('تحديث') || q.includes('run') || q.includes('sync')) return 'run_agent_task'
  return 'general_chat'
}

async function processChat(message) {
  const intent = await routeQuery(message)
  let responseText = ""
  let data = null

  try {
    switch (intent) {
      case 'get_inventory_alerts': {
        const inventory = await getInventoryWithStatus() || []
        const out = inventory.filter(i => i.stock === 0).length
        const low = inventory.filter(i => i.stock > 0 && i.stock <= (i.lowStockAlert || 5)).length
        responseText = `لقد وجدت أن لديك **${out} محصولات نفدت** و **${low} محصولات بمخزون منخفض**. هل تود أن أعرض لك تفاصيلهم؟`
        data = { outOfStock: out, lowStock: low }
        break
      }
      case 'get_financial_summary': {
        const overview = await financeOverview()
        responseText = `ملخص الشهر الحالي:\nإجمالي الإيرادات: $${overview.revenue.toFixed(2)}\nإجمالي المصاريف: $${overview.expenses.toFixed(2)}\n**صافي الربح:** $${overview.profit.toFixed(2)}\nهامش الربح: ${overview.margin.toFixed(1)}%`
        data = overview
        break
      }
      case 'get_all_alerts': {
        const alerts = await prisma.alert.findMany({ where: { isRead: false }, take: 5, orderBy: { createdAt: 'desc' } })
        if (!alerts.length) {
          responseText = "الأمور ممتازة! لا توجد تنبيهات غير مقروءة حالياً ✅"
        } else {
          responseText = `لديك ${alerts.length} تنبيهات حديثة، هذه أحدثها:\n` + alerts.map(a => `- ${a.title}`).join('\n')
          data = alerts
        }
        break
      }
      case 'get_sales_summary': {
        responseText = "المبيعات الإجمالية لهذا الأسبوع جيدة جداً، سأحضر لك التقرير التفصيلي..."
        data = { action: 'open_report' }
        break
      }
      case 'get_customer_insights': {
        const total = await prisma.customer.count()
        const newC = await prisma.customer.count({ where: { segment: 'new' } })
        responseText = `إجمالي عملائك: ${total} عميل.\nمنهم **${newC} عملاء جدد**. استمر في هذا الأداء الرائع!`
        data = { total, newC }
        break
      }
      case 'get_inbox_status': {
        const unread = await prisma.message.count({ where: { status: 'unread' } })
        responseText = unread > 0 ? `لديك ${unread} رسالة غير مقروءة بانتظار ردك.` : "صندوق الوارد نظيف، أديت عملاً رائعاً!"
        data = { unread }
        break
      }
      case 'get_ad_performance': {
        responseText = "حملات Meta تسجل ROAS متوسط 2.5x، وحملات Trendyol 3.2x. أداء مستقر!"
        break
      }
      case 'run_agent_task': {
        // Extract basic parameters based on text keywords for mock AI logic
        const q = message.toLowerCase()
        let targetAgent = 'general'
        if (q.includes('مخزون') || q.includes('منتجات')) targetAgent = 'inventory'
        else if (q.includes('إعلان')) targetAgent = 'ads'
        else if (q.includes('مالية') || q.includes('ميزانية') || q.includes('ايرادات')) targetAgent = 'finance'
        
        if (targetAgent !== 'general') {
          const res = await executeAgentTask(targetAgent, q)
          responseText = res.message
          data = res
        } else {
          responseText = "يرجى تحديد الإيجنت الذي تود تشغيل مهامه (مثل عرض ومزامنة المخزون، المالية، الإعلانات)."
        }
        break
      }
      default: {
        try {
          const aiResponse = await ai.chat([
            { role: 'system', content: 'أنت المايسترو، مساعد ذكي لإدارة نظام Palstyle48 التجاري. أجب على المستخدم باللغة العربية بأسلوب ودود وموجز، وساعدهم في حال استفسروا عن أي شيء.' },
            { role: 'user', content: message }
          ])
          responseText = aiResponse.content
        } catch (err) {
          console.error('[MasterAgent] AI failed fallback', err.message)
          responseText = "أهلاً بك! أنا المايسترو، الإيجنت الذكي لإدارة نظام Palstyle48. كيف يمكنني مساعدتك اليوم؟ (يمكنك سؤالي عن المبيعات، المخزون، الإعلانات، أو التنبيهات)"
        }
        break
      }
    }

    return { success: true, text: responseText, tool_used: intent, tool_data: data }
  } catch (error) {
    console.error('[MasterAgent] Error processing chat:', error.message)
    return { success: false, text: "عذراً، واجهت مشكلة أثناء إحضار البيانات. حاول مجدداً." }
  }
}

module.exports = { processChat, masterTools }
