import { useState, useEffect, useCallback, useMemo } from 'react'
import { LayoutDashboard, ShoppingBag, Users, DollarSign, Package, RefreshCw, TrendingUp, TrendingDown } from 'lucide-react'
import optimizedAPI from '../services/optimizedAPI'
import StatCard from '../components/shared/StatCard'
import { pageCache } from '../utils/pageCache'

const PC = 'dashboard'

export default function Dashboard() {
  const [loading, setLoading]   = useState(!pageCache.has(PC))
  const [syncing, setSyncing]   = useState(false)
  const [error,   setError]     = useState(null)
  const [data,    setData]      = useState(() => pageCache.get(PC) ?? null)

  const loadDashboard = useCallback(async () => {
    try {
      if (!pageCache.has(PC)) setLoading(true)
      setError(null)
      const result = await optimizedAPI.get('/dashboard', {}, true, 60000)
      if (result?.success) {
        setData(result.data)
        pageCache.set(PC, result.data)
      }
    } catch (err) {
      console.error('[Dashboard] load error:', err)
      setError('Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }, [])

  // ── Manual sync → then reload ────────────────────────────────────────────────
  const handleSync = async () => {
    try {
      setSyncing(true)
      setError(null)
      const res = await optimizedAPI.post('/platforms/shopify/sync')
      // If platform not connected, the server returns success:false — handle gracefully
      if (res && !res.success) {
        setError(res.message || 'Please connect Shopify first from the Settings page')
      }
      await loadDashboard()
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || ''
      if (msg.toLowerCase().includes('not connected') || msg.includes('غير مربوط')) {
        setError('Shopify is not connected — go to Settings to enable the connection')
      } else {
        setError('Data sync failed — check server connection')
      }
    } finally {
      setSyncing(false)
    }
  }

  useEffect(() => { loadDashboard() }, [loadDashboard])

  // ── Stats config (memoized) ─────────────────────────────────────────────────────────────
  const stats = useMemo(() => data ? [
    {
      label:   'Revenue This Month',
      value:   `${data.stats.thisMonthRevenue.toLocaleString()} USD`,
      icon:    DollarSign,
      color:   'text-green-500',
      bgColor: 'bg-green-500/10',
      trend:   data.stats.revenueGrowth != null ? {
        positive: data.stats.revenueGrowth >= 0,
        label:    `${data.stats.revenueGrowth >= 0 ? '+' : ''}${data.stats.revenueGrowth}% vs last month`,
        icon:     data.stats.revenueGrowth >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />,
      } : null,
    },
    {
      label:   'Total Orders',
      value:   data.stats.totalOrders.toLocaleString(),
      icon:    ShoppingBag,
      color:   'text-blue-500',
      bgColor: 'bg-blue-500/10',
    },
    {
      label:   'Total Customers',
      value:   data.stats.totalCustomers.toLocaleString(),
      icon:    Users,
      color:   'text-purple-500',
      bgColor: 'bg-purple-500/10',
      subtext: `${data.stats.newCustomers} new this month`,
    },
    {
      label:   'Products',
      value:   data.stats.totalProducts.toLocaleString(),
      icon:    Package,
      color:   'text-orange-500',
      bgColor: 'bg-orange-500/10',
    },
  ] : [], [data])

  const statusLabel = {
    pending:    'Pending',
    processing: 'Processing',
    shipped:    'Shipped',
    delivered:  'Delivered',
    cancelled:  'Cancelled',
    refunded:   'Refunded',
  }

  const statusColor = {
    pending:    'text-yellow-500',
    processing: 'text-blue-500',
    shipped:    'text-purple-500',
    delivered:  'text-green-500',
    cancelled:  'text-red-500',
    refunded:   'text-gray-500',
  }

  return (
    <div className="page-container">

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center">
            <LayoutDashboard size={20} className="text-accent" />
          </div>
          <div>
            <h1 className="section-title">Dashboard</h1>
            <p className="section-subtitle">Store performance overview</p>
          </div>
        </div>

        {/* Sync button */}
        <button
          onClick={handleSync}
          disabled={syncing || loading}
          className="btn-ghost flex items-center gap-2 text-sm"
        >
          <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Syncing...' : 'Sync'}
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
            <StatCard
              key={stat.label}
              label={stat.label}
              value={stat.value}
              icon={stat.icon}
              color={stat.color}
              bgColor={stat.bgColor}
              trend={stat.trend}
              subtext={stat.subtext}
              loading={loading}
            />
          ))
        }
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── Recent Orders ── */}
        <div className="card p-5">
          <h2 className="text-lg font-bold text-text mb-4">Recent Orders</h2>
          {loading ? (
            <div className="skeleton h-48 w-full rounded-xl" />
          ) : !data || data.recentOrders.length === 0 ? (
            <div className="text-center py-10">
              <ShoppingBag size={32} className="text-text-muted mx-auto mb-3 opacity-40" />
              <p className="text-sm text-text-muted">No orders yet</p>
              <button onClick={handleSync} className="mt-3 text-xs text-accent hover:underline">
                Sync data
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {data.recentOrders.map(order => (
                <div key={order.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-surface transition-colors border border-transparent hover:border-border">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-accent/10 flex items-center justify-center text-accent font-bold text-xs shrink-0">
                      {order.platform === 'shopify' ? 'S' : 'T'}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-text">
                        {order.customer?.name || 'Unknown customer'}
                      </p>
                      <p className="text-xs text-text-muted">
                        {new Date(order.createdAt).toLocaleDateString('en-US')}
                      </p>
                    </div>
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold text-green-500">
                      {order.total.toFixed(2)} {order.currency}
                    </p>
                    <p className={`text-xs ${statusColor[order.status] || 'text-text-muted'}`}>
                      {statusLabel[order.status] || order.status}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Recent Products ── */}
        <div className="card p-5">
          <h2 className="text-lg font-bold text-text mb-4">Recent Products</h2>
          {loading ? (
            <div className="skeleton h-48 w-full rounded-xl" />
          ) : !data || data.recentProducts.length === 0 ? (
            <div className="text-center py-10">
              <Package size={32} className="text-text-muted mx-auto mb-3 opacity-40" />
              <p className="text-sm text-text-muted">No products yet</p>
              <button onClick={handleSync} className="mt-3 text-xs text-accent hover:underline">
                Sync data
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {data.recentProducts.map(product => (
                <div key={product.id} className="group relative rounded-xl overflow-hidden border border-border bg-surface p-3 flex flex-col gap-2 hover:border-accent/50 transition-colors">
                  <div className="aspect-square rounded-lg bg-background overflow-hidden">
                    {product.images?.[0] ? (
                      <img
                        src={product.images[0]}
                        alt={product.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-text-muted">
                        <Package size={24} />
                      </div>
                    )}
                  </div>
                  <p className="text-sm font-medium text-text truncate">{product.name}</p>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-accent font-bold">{product.price} USD</p>
                    <p className={`text-xs ${product.stock === 0 ? 'text-red-500' : 'text-text-muted'}`}>
                      {product.stock === 0 ? 'Out of stock' : `${product.stock} pcs`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
