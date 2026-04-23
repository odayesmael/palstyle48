import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  LayoutDashboard, ShoppingBag, Users, DollarSign, Package,
  RefreshCw, TrendingUp, TrendingDown, Mail, Megaphone,
  AlertTriangle, CheckCircle, BarChart3, ChevronRight
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import optimizedAPI from '../services/optimizedAPI'
import StatCard from '../components/shared/StatCard'
import { pageCache } from '../utils/pageCache'

const PC = 'dashboard'

export default function Dashboard() {
  const [loading, setLoading] = useState(!pageCache.has(PC))
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState(null)
  const [data, setData] = useState(() => pageCache.get(PC) ?? null)
  const navigate = useNavigate()

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
    } finally { setLoading(false) }
  }, [])

  const handleSync = async () => {
    try {
      setSyncing(true); setError(null)
      await optimizedAPI.post('/customers/sync')
      await loadDashboard()
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Sync failed')
    } finally { setSyncing(false) }
  }

  useEffect(() => { loadDashboard() }, [loadDashboard])

  const s = data?.stats

  const stats = useMemo(() => s ? [
    {
      label: 'Revenue This Month',
      value: `${(s.revenue?.thisMonth || 0).toLocaleString()} TRY`,
      icon: DollarSign, color: 'text-green-500', bgColor: 'bg-green-500/10',
      trend: s.revenue?.growth != null ? {
        positive: s.revenue.growth >= 0,
        label: `${s.revenue.growth >= 0 ? '+' : ''}${s.revenue.growth}% vs last month`,
        icon: s.revenue.growth >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />,
      } : null,
    },
    {
      label: 'Orders', value: (s.orders?.thisWeek || 0).toLocaleString(),
      icon: ShoppingBag, color: 'text-blue-500', bgColor: 'bg-blue-500/10',
      subtext: `${s.orders?.pending || 0} pending · ${s.orders?.processing || 0} processing`,
    },
    {
      label: 'Customers', value: (s.customers?.total || 0).toLocaleString(),
      icon: Users, color: 'text-purple-500', bgColor: 'bg-purple-500/10',
      subtext: `${s.customers?.newThisMonth || 0} new · ${s.customers?.vipCount || 0} VIP`,
    },
    {
      label: 'Products', value: (s.inventory?.totalProducts || 0).toLocaleString(),
      icon: Package, color: 'text-orange-500', bgColor: 'bg-orange-500/10',
      subtext: s.inventory?.lowStock ? `${s.inventory.lowStock} low stock` : null,
    },
  ] : [], [s])

  const statusLabel = { pending: 'Pending', processing: 'Processing', shipped: 'Shipped', delivered: 'Delivered', cancelled: 'Cancelled', refunded: 'Refunded' }
  const statusColor = { pending: 'text-yellow-500', processing: 'text-blue-500', shipped: 'text-purple-500', delivered: 'text-green-500', cancelled: 'text-red-500', refunded: 'text-gray-500' }

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center">
            <LayoutDashboard size={20} className="text-accent" />
          </div>
          <div>
            <h1 className="section-title">Dashboard</h1>
            <p className="section-subtitle">Command center overview</p>
          </div>
        </div>
        <button onClick={handleSync} disabled={syncing || loading} className="btn-ghost flex items-center gap-2 text-sm">
          <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Syncing...' : 'Sync'}
        </button>
      </div>

      {error && <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm">{error}</div>}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {loading
          ? [...Array(4)].map((_, i) => <div key={i} className="card p-4 skeleton h-28" />)
          : stats.map(stat => <StatCard key={stat.label} {...stat} loading={loading} />)
        }
      </div>

      {/* Secondary Stats */}
      {!loading && s && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <SecondaryCard icon={Mail} iconColor="text-sky-500" iconBg="bg-sky-500/10" label="Inbox" value={s.inbox?.unread || 0} sub={`${s.inbox?.open || 0} open`} onClick={() => navigate('/inbox')} />
          <SecondaryCard icon={Megaphone} iconColor="text-pink-500" iconBg="bg-pink-500/10" label="Ads" value={`${s.ads?.totalRoas || 0}x ROAS`} sub={`${s.ads?.activeCampaigns || 0} active`} onClick={() => navigate('/ads')} />
          <SecondaryCard icon={(s.inventory?.outOfStock || 0) > 0 ? AlertTriangle : CheckCircle} iconColor={(s.inventory?.outOfStock || 0) > 0 ? 'text-red-500' : 'text-emerald-500'} iconBg={(s.inventory?.outOfStock || 0) > 0 ? 'bg-red-500/10' : 'bg-emerald-500/10'} label="Inventory" value={`${s.inventory?.totalVariants || 0} SKUs`} sub={`${s.inventory?.outOfStock || 0} OOS · ${s.inventory?.lowStock || 0} low`} onClick={() => navigate('/inventory')} />
          <SecondaryCard icon={BarChart3} iconColor="text-amber-500" iconBg="bg-amber-500/10" label="Tasks" value={`${s.tasks?.open || 0} open`} sub={`${s.tasks?.urgent || 0} urgent`} onClick={() => navigate('/tasks')} />
        </div>
      )}

      {/* Revenue Chart */}
      {!loading && data?.revenueChart?.length > 0 && (
        <div className="card p-5 mb-6">
          <h2 className="text-lg font-bold text-text mb-4">Revenue — Last 30 Days</h2>
          <div className="h-48 flex items-end gap-1">
            {(() => {
              const max = Math.max(...data.revenueChart.map(d => d.amount), 1)
              return data.revenueChart.map(d => (
                <div key={d.date} className="flex-1 group relative" style={{ minWidth: 0 }}>
                  <div className="w-full rounded-t bg-accent/70 hover:bg-accent transition-colors" style={{ height: `${Math.max((d.amount / max) * 100, 2)}%` }} />
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                    <div className="bg-surface border border-border rounded-lg px-2 py-1 text-xs whitespace-nowrap shadow-lg">
                      <p className="font-bold text-text">{d.amount.toLocaleString()} TRY</p>
                      <p className="text-text-muted">{d.date}</p>
                    </div>
                  </div>
                </div>
              ))
            })()}
          </div>
          <div className="flex justify-between mt-2 text-xs text-text-muted">
            <span>{data.revenueChart[0]?.date}</span>
            <span>{data.revenueChart[data.revenueChart.length - 1]?.date}</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Orders */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-text">Recent Orders</h2>
            <button onClick={() => navigate('/finance')} className="text-xs text-accent hover:underline">View all</button>
          </div>
          {loading ? <div className="skeleton h-48 w-full rounded-xl" /> : !data?.recentOrders?.length ? (
            <div className="text-center py-10">
              <ShoppingBag size={32} className="text-text-muted mx-auto mb-3 opacity-40" />
              <p className="text-sm text-text-muted">No orders yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {data.recentOrders.map(o => (
                <div key={o.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-surface transition-colors border border-transparent hover:border-border">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-accent/10 flex items-center justify-center text-accent font-bold text-xs shrink-0">
                      {o.platform?.[0]?.toUpperCase() || '?'}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-text">{o.customer?.name || 'Unknown'}</p>
                      <p className="text-xs text-text-muted">{new Date(o.createdAt).toLocaleDateString('en-US')}</p>
                    </div>
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold text-green-500">{o.total?.toFixed(2)} {o.currency}</p>
                    <p className={`text-xs ${statusColor[o.status] || 'text-text-muted'}`}>{statusLabel[o.status] || o.status}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Products */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-text">Recent Products</h2>
            <button onClick={() => navigate('/inventory')} className="text-xs text-accent hover:underline">View all</button>
          </div>
          {loading ? <div className="skeleton h-48 w-full rounded-xl" /> : !data?.recentProducts?.length ? (
            <div className="text-center py-10">
              <Package size={32} className="text-text-muted mx-auto mb-3 opacity-40" />
              <p className="text-sm text-text-muted">No products yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {data.recentProducts.map(p => (
                <div key={p.id} className="group rounded-xl overflow-hidden border border-border bg-surface p-3 flex flex-col gap-2 hover:border-accent/50 transition-colors">
                  <div className="aspect-square rounded-lg bg-background overflow-hidden">
                    {p.images?.[0] ? (
                      <img src={p.images[0]} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-text-muted"><Package size={24} /></div>
                    )}
                  </div>
                  <p className="text-sm font-medium text-text truncate">{p.name}</p>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-accent font-bold">{p.price} TRY</p>
                    <p className={`text-xs ${p.stock === 0 ? 'text-red-500' : 'text-text-muted'}`}>{p.stock === 0 ? 'OOS' : `${p.stock} pcs`}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Channel Breakdown */}
        {!loading && data?.channelBreakdown?.length > 0 && (
          <div className="card p-5">
            <h2 className="text-lg font-bold text-text mb-4">Sales by Channel</h2>
            <div className="space-y-3">
              {data.channelBreakdown.map(ch => (
                <div key={ch.channel}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-text capitalize">{ch.channel}</span>
                    <span className="text-xs text-text-muted">{ch.revenue.toLocaleString()} TRY ({ch.percentage}%)</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-surface overflow-hidden">
                    <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${ch.percentage}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function SecondaryCard({ icon: Icon, iconColor, iconBg, label, value, sub, onClick }) {
  return (
    <button onClick={onClick} className="card p-4 hover:border-accent/40 transition-all group text-left">
      <div className="flex items-center gap-3 mb-2">
        <div className={`w-8 h-8 rounded-lg ${iconBg} flex items-center justify-center`}>
          <Icon size={16} className={iconColor} />
        </div>
        <span className="text-sm text-text-muted">{label}</span>
        <ChevronRight size={14} className="ml-auto text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <p className="text-xl font-bold text-text">{value}</p>
      <p className="text-xs text-text-muted">{sub}</p>
    </button>
  )
}
