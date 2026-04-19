// ─── Agent Orchestrator ────────────────────────────────────────────────────────
// This orchestrator is responsible for triggering specific tasks on sub-agents 
// when requested by the Master Agent.

const { syncMetaCampaigns } = require('../ads/ads-sync.service')
const { syncInventory } = require('../inventory/inventory-sync.service')
const { suggestReorders } = require('../inventory/inventory-agent.service')
const { checkStockAlerts } = require('../inventory/stock-alerts.service')
const { checkBudgetOverrun } = require('../finance/finance-agent.service')
const { syncAllRevenue } = require('../finance/revenue-sync.service')

async function executeAgentTask(agent, taskStr) {
  const task = taskStr.toLowerCase()
  try {
    switch (agent) {
      case 'ads':
        if (task.includes('sync') || task.includes('مزامنة')) {
          await syncMetaCampaigns()
          return { success: true, message: 'تم تشغيل مزامنة الإعلانات.' }
        }
        break
      case 'inventory':
         if (task.includes('sync') || task.includes('مزامنة')) {
           await syncInventory()
           return { success: true, message: 'تم تشغيل مزامنة المخزون (Shopify ↔ Trendyol).' }
         }
         if (task.includes('alert') || task.includes('تنبيه')) {
           await checkStockAlerts()
           return { success: true, message: 'تم تحديث تنبيهات المخزون.' }
         }
         if (task.includes('reorder') || task.includes('طلب')) {
           const suggestions = await suggestReorders()
           return { success: true, message: `اكتمل التحليل. تم اقتراح ${suggestions.length} منتجات لإعادة الطلب.` }
         }
        break
      case 'finance':
        if (task.includes('budget') || task.includes('ميزانية')) {
          await checkBudgetOverrun()
          return { success: true, message: 'تم مراجعة الميزانية بنجاح.' }
        }
        if (task.includes('sync') || task.includes('مزامنة')) {
          await syncAllRevenue()
          return { success: true, message: 'تمت مزامنة الإيرادات بنجاح.' }
        }
        break
      // You can expand CRM, Content, Inbox logic here.
      default:
        return { success: false, message: `الإيجنت '${agent}' غير متعرف على المهمة المطلوبة.` }
    }
    return { success: true, message: `تم تشغيل الإجراء العام للإيجنت ${agent}.` }
  } catch (err) {
    console.error(`[Orchestrator] Error executing ${task} on ${agent}:`, err.message)
    return { success: false, message: `فشل تشغيل المهمة: ${err.message}` }
  }
}

module.exports = { executeAgentTask }
