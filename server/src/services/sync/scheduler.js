/**
 * Synchronization Scheduler
 * Handles cron jobs for automatic background synchronization.
 */

const cron = require('node-cron')
const { syncAllCustomers } = require('./customer-sync.service')
const { syncAllOrders } = require('./order-sync.service')
const { recalculateAllRFM } = require('./dedup.service')
const { getPendingScheduled, markPublished } = require('../content/content.service')
const { publishContent } = require('../content/publisher.service')
const { syncMetaCampaigns, syncMetaInsights, syncTrendyolAds } = require('../ads/ads-sync.service')
const { monitorROAS, analyzeDailyPerformance, suggestBudgetReallocation } = require('../ads/ads-agent.service')
const { syncAllRevenue } = require('../finance/revenue-sync.service')
const { checkBudgetOverrun, generateMonthlyReport } = require('../finance/finance-agent.service')
const { syncInventory } = require('../inventory/inventory-sync.service')
const { checkStockAlerts } = require('../inventory/stock-alerts.service')
const { suggestReorders } = require('../inventory/inventory-agent.service')
const { generateMorningReport, generateEveningReport, generateWeeklyReport } = require('../agents/report-generator')

class SyncScheduler {
  constructor() {
    this.jobs = []
  }

  /**
   * Start scheduling
   */
  start() {
    console.log('[Scheduler] Initializing sync schedules...')

    // 1. Full Sync: Customers & Orders every 6 hours
    // "0 0,6,12,18 * * *"
    const fullSyncJob = cron.schedule('0 0,6,12,18 * * *', async () => {
      console.log('⏰ [Cron] Running scheduled full sync (every 6h)...')
      try {
        await syncAllCustomers()
        await syncAllOrders()
      } catch (err) {
        console.error('[Cron Error] Full Sync failed:', err)
      }
    })
    this.jobs.push(fullSyncJob)

    // 2. Hourly check for new orders
    // "0 * * * *"
    const hourlyOrderSyncJob = cron.schedule('0 * * * *', async () => {
      console.log('⏰ [Cron] Running hourly order sync check...')
      try {
        await syncAllOrders()
      } catch (err) {
        console.error('[Cron Error] Hourly Sync failed:', err)
      }
    })
    this.jobs.push(hourlyOrderSyncJob)

    // 3. Daily RFM recalculation at 3 AM
    // "0 3 * * *"
    const dailyRfmJob = cron.schedule('0 3 * * *', async () => {
      console.log('⏰ [Cron] Running daily RFM calculation (3 AM)...')
      try {
        await recalculateAllRFM()
      } catch (err) {
        console.error('[Cron Error] Daily RFM failed:', err)
      }
    })
    this.jobs.push(dailyRfmJob)

    // 4. Every minute: check and publish scheduled content
    const contentPublishJob = cron.schedule('* * * * *', async () => {
      try {
        const pending = await getPendingScheduled()
        for (const item of pending) {
          try {
            const platformPostId = await publishContent(item)
            await markPublished(item.id, platformPostId)
            console.log(`[Cron] ✅ Published scheduled content: ${item.id} on ${item.platform}`)
          } catch (err) {
            console.error(`[Cron] ❌ Failed to publish ${item.id}:`, err.message)
          }
        }
      } catch (err) {
        console.error('[Cron Error] Content Publisher failed:', err.message)
      }
    })
    this.jobs.push(contentPublishJob)

    // 5. Hourly: sync Meta Ads insights + ROAS monitor
    const adsInsightJob = cron.schedule('30 * * * *', async () => {
      console.log('⏰ [Cron] Syncing Meta Ads insights...')
      try {
        await syncMetaInsights()
        await monitorROAS()
      } catch (err) {
        console.error('[Cron Error] Ads Insights sync failed:', err.message)
      }
    })
    this.jobs.push(adsInsightJob)

    // 6. Daily at 6 AM: sync campaign lists + Trendyol ads + daily analysis
    const adsDailyJob = cron.schedule('0 6 * * *', async () => {
      console.log('⏰ [Cron] Daily Ads sync (campaigns + Trendyol)...')
      try {
        await syncMetaCampaigns()
        await syncTrendyolAds()
        await analyzeDailyPerformance()
      } catch (err) {
        console.error('[Cron Error] Daily Ads sync failed:', err.message)
      }
    })
    this.jobs.push(adsDailyJob)

    // 7. Weekly Sunday at 8 AM: budget reallocation suggestions
    const adsWeeklyJob = cron.schedule('0 8 * * 0', async () => {
      console.log('⏰ [Cron] Weekly Ads budget suggestions...')
      try {
        await suggestBudgetReallocation()
      } catch (err) {
        console.error('[Cron Error] Weekly Ads budget failed:', err.message)
      }
    })
    this.jobs.push(adsWeeklyJob)

    // 8. Hourly: inventory two-way sync + stock alerts
    const inventoryHourlyJob = cron.schedule('15 * * * *', async () => {
      console.log('⏰ [Cron] Inventory sync + stock alerts...')
      try {
        await syncInventory()
        await checkStockAlerts()
      } catch (err) {
        console.error('[Cron Error] Inventory sync failed:', err.message)
      }
    })
    this.jobs.push(inventoryHourlyJob)

    // 9. Daily at 7 AM: revenue sync + finance budget check
    const financeDailyJob = cron.schedule('0 7 * * *', async () => {
      console.log('⏰ [Cron] Daily finance sync...')
      try {
        await syncAllRevenue()
        await checkBudgetOverrun()
        await suggestReorders()
      } catch (err) {
        console.error('[Cron Error] Finance daily sync failed:', err.message)
      }
    })
    this.jobs.push(financeDailyJob)

    // 10. Monthly on 1st at 9 AM: generate P&L report
    const financeMonthlyJob = cron.schedule('0 9 1 * *', async () => {
      console.log('⏰ [Cron] Monthly P&L report...')
      try {
        await generateMonthlyReport()
      } catch (err) {
        console.error('[Cron Error] Monthly P&L failed:', err.message)
      }
    })
    this.jobs.push(financeMonthlyJob)

    // 11. Master Reports
    const morningJob = cron.schedule('0 8 * * *', async () => {
      console.log('⏰ [Cron] Morning Report...')
      await generateMorningReport().catch(e => console.error(e))
    })
    this.jobs.push(morningJob)

    const eveningJob = cron.schedule('0 20 * * *', async () => {
      console.log('⏰ [Cron] Evening Report...')
      await generateEveningReport().catch(e => console.error(e))
    })
    this.jobs.push(eveningJob)

    const weeklyJob = cron.schedule('0 10 * * 0', async () => {
      console.log('⏰ [Cron] Weekly Report...')
      await generateWeeklyReport().catch(e => console.error(e))
    })
    this.jobs.push(weeklyJob)

    console.log('[Scheduler] Jobs started successfully.')

  }

  /**
   * Stop all scheduled jobs (Useful for graceful shutdown/testing)
   */
  stop() {
    console.log('[Scheduler] Stopping all sync jobs...')
    this.jobs.forEach(job => job.stop())
    this.jobs = []
  }
}

// Export singleton instance
const scheduler = new SyncScheduler()
module.exports = scheduler
