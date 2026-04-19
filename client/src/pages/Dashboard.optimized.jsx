/**
 * Dashboard Optimized Version
 * بدون تعديلات كبيرة - مجرد تحسينات صغيرة آمنة
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { LayoutDashboard, ShoppingBag, Users, DollarSign, Package, RefreshCw, TrendingUp, TrendingDown } from 'lucide-react'
import api from '../services/api'
import { requestDeduplicator, checkMemoryUsage } from '../utils/performance'

export default function Dashboard() {
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)

  // ✅ استخدام Deduplicator لمنع requests المكررة
  const loadDashboard = useCallback(async () => {
    return requestDeduplicator.deduplicate('dashboard-load', async () => {
      try {
        setLoading(true)
        setError(null)
        const { data: res } = await api.get('/dashboard')
        if (res.success) setData(res.data)
      } catch (err) {
        console.error('[Dashboard] load error:', err)
        setError('تعذر تحميل بيانات لوحة التحكم')
      } finally {
        setLoading(false)
      }
    })
  }, [])

  // ✅ استخدام Deduplicator للـ sync
  const handleSync = useCallback(async () => {
    try {
      setSyncing(true)
      setError(null)
      await requestDeduplicator.deduplicate('dashboard-sync', async () => {
        await api.post('/platforms/shopify/sync')
      })
      await loadDashboard()
    } catch (err) {
      setError('فشل مزامنة البيانات')
    } finally {
      setSyncing(false)
    }
  }, [loadDashboard])

  useEffect(() => {
    loadDashboard()
    // ✅ Monitor memory usage
    if (checkMemoryUsage(0.85)) {
      console.warn('Dashboard: High memory usage detected')
    }
  }, [loadDashboard])

  // ✅ useMemo للـ stats configuration
  const stats = useMemo(() => {
    if (!data) return []
    return [
      {
        label: 'إيرادات هذا الشهر',
        value: `${data.stats.thisMonthRevenue.toLocaleString()} USD`,
        icon: DollarSign,
        color: 'text-green-500',
        bg: 'bg-green-500/10',
        growth: data.stats.revenueGrowth,
      },
      {
        label: 'إجمالي الطلبات',
        value: data.stats.totalOrders.toLocaleString(),
        icon: ShoppingBag,
        color: 'text-blue-500',
        bg: 'bg-blue-500/10',
      },
      {
        label: 'إجمالي العملاء',
        value: data.stats.totalCustomers.toLocaleString(),
        icon: Users,
        color: 'text-purple-500',
        bg: 'bg-purple-500/10',
        sub: `${data.stats.newCustomers} جديد هذا الشهر`,
      },
      {
        label: 'المنتجات',
        value: data.stats.totalProducts.toLocaleString(),
        icon: Package,
        color: 'text-orange-500',
        bg: 'bg-orange-500/10',
      },
    ]
  }, [data])

  const statusLabel = useMemo(() => ({
    pending: 'معلق',
    processing: 'قيد التنفيذ',
    shipped: 'تم الشحن',
    delivered: 'تم التسليم',
    cancelled: 'ملغي',
    refunded: 'مُسترد',
  }), [])

  const statusColor = useMemo(() => ({
    pending: 'text-yellow-500',
    processing: 'text-blue-500',
    shipped: 'text-purple-500',
    delivered: 'text-green-500',
    cancelled: 'text-red-500',
    refunded: 'text-gray-500',
  }), [])

  return (
    <div className="page-container">
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center">
            <LayoutDashboard size={20} className="text-accent" />
          </div>
          <div>
            <h1 className="section-title">لوحة التحكم</h1>
            <p className="section-subtitle">نظرة عامة على أداء المتجر</p>
          </div>
        </div>

        {/* Sync button */}
        <button
          onClick={handleSync}
          disabled={syncing || loading}
          className="btn-ghost flex items-center gap-2 text-sm"
        >
          <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'جاري المزامنة...' : 'مزامنة'}
        </button>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
          {error}
        </div>
      )}

      {/* ── Stats Grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {loading
          ? [...Array(4)].map((_, i) => <div key={i} className="card p-4 skeleton h-28" />)
          : stats.map(stat => (
            <div key={stat.label} className="card p-4 flex items-start justify-between group">
              <div className="flex-1">
                <p className="text-sm text-text-muted mb-2">{stat.label}</p>
                <h3 className="text-2xl font-bold text-text group-hover:text-accent transition-colors">
                  {stat.value}
                </h3>
                {stat.growth !== undefined && (
                  <p className={`text-xs mt-1 flex items-center gap-1 ${stat.growth >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {stat.growth >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    {Math.abs(stat.growth)}% عن الشهر الماضي
                  </p>
                )}
                {stat.sub && <p className="text-xs text-text-muted mt-1">{stat.sub}</p>}
              </div>
              <div className={`w-10 h-10 rounded-lg ${stat.bg} flex items-center justify-center ${stat.color} shadow-sm border border-border`}>
                <stat.icon size={20} />
              </div>
            </div>
          ))}
      </div>

      {/* ── Recent Orders ── */}
      {data?.recentOrders && (
        <div className="card p-6">
          <h2 className="text-lg font-bold text-text mb-4">الطلبات الأخيرة</h2>
          <div className="space-y-3">
            {data.recentOrders.map(order => (
              <div key={order.id} className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10 hover:border-white/20 transition-all">
                <div className="flex-1">
                  <p className="text-sm font-bold text-text">{order.customerName}</p>
                  <p className="text-xs text-text-muted mt-0.5">{order.items} منتج</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-text">${order.total.toFixed(2)}</p>
                  <span className={`text-xs font-bold ${statusColor[order.status] || ''}`}>
                    {statusLabel[order.status] || order.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
