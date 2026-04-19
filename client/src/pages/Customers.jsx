import { useState, useEffect, useMemo, useCallback } from 'react'
import { pageCache } from '../utils/pageCache'
const PC = 'customers'
import { useNavigate } from 'react-router-dom'
import { 
  Users, Search, Filter, Download, Mail, Phone, ShoppingBag, 
  MapPin, Star, AlertTriangle, Activity, TrendingUp, RefreshCcw, UserPlus, ChevronLeft, ChevronRight, MessageSquare 
} from 'lucide-react'
import optimizedAPI from '../services/optimizedAPI'
import { useDebounce } from '../hooks/useDebounce'
import { requestDeduplicator } from '../utils/performance'
import SearchInput from '../components/shared/SearchInput'
import TableRow from '../components/shared/TableRow'
import StatCard from '../components/shared/StatCard'
import { formatDistanceToNow } from 'date-fns'
import { enUS } from 'date-fns/locale'

export default function Customers() {
  const navigate = useNavigate()
  const _c = pageCache.get(PC) || {}
  const [loading, setLoading] = useState(!pageCache.has(PC))
  const [syncing, setSyncing] = useState(false)
  const [stats, setStats] = useState(_c.stats ?? null)
  const [customers, setCustomers] = useState(_c.customers ?? [])
  const [pagination, setPagination] = useState(_c.pagination ?? { page: 1, pages: 1, total: 0 })
  
  // Filters
  const [search, setSearch] = useState('')
  const [source, setSource] = useState('all')
  const [segment, setSegment] = useState('all')
  const [sortBy, setSortBy] = useState('newest')

  // Debounce search input
  const debouncedSearch = useDebounce(search, 300)

  const fetchData = useCallback(async () => {
    try {
      if (!pageCache.has(PC)) setLoading(true)
      return requestDeduplicator.deduplicate(`customers-${pagination.page}-${debouncedSearch}-${source}-${segment}-${sortBy}`, async () => {
        const [statsRes, custRes] = await Promise.all([
          optimizedAPI.get('/customers/stats', {}, true, 300000),
          optimizedAPI.get('/customers', {
            params: { page: pagination.page, limit: 20, search: debouncedSearch, source, segment, sortBy }
          }, true, 300000)
        ])

        if (statsRes?.success) { setStats(statsRes.stats); pageCache.set(PC, { ...pageCache.get(PC), stats: statsRes.stats }) }
        if (custRes?.success) {
          setCustomers(custRes.data)
          setPagination(custRes.pagination)
          pageCache.set(PC, { ...pageCache.get(PC), customers: custRes.data, pagination: custRes.pagination })
        }
      })
    } catch (err) {
      console.error('Failed to fetch CRM data:', err)
    } finally {
      setLoading(false)
    }
  }, [pagination.page, debouncedSearch, source, segment, sortBy])

  // Reload when filters change
  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleSync = async () => {
    try {
      setSyncing(true)
      await optimizedAPI.post('/customers/sync')
      await fetchData()
    } catch (err) {
      console.error('Sync failed', err)
    } finally {
      setSyncing(false)
    }
  }

  const getSourceIcon = (src) => {
    switch (src) {
      case 'shopify': return <ShoppingBag size={14} className="text-green-500" />
      case 'trendyol': return <ShoppingBag size={14} className="text-orange-500" />
      case 'meta':
      case 'instagram': return <MessageSquare size={14} className="text-pink-500" />
      case 'whatsapp': return <Phone size={14} className="text-emerald-500" />
      case 'gmail': return <Mail size={14} className="text-red-500" />
      default: return <Users size={14} className="text-gray-500" />
    }
  }

  const getSegmentBadge = (seg) => {
    const styles = {
      vip: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
      active: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
      idle: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
      lost: 'bg-red-500/10 text-red-500 border-red-500/20',
      new: 'bg-blue-500/10 text-blue-500 border-blue-500/20'
    }
    const labels = { vip: 'VIP', active: 'Active', idle: 'Idle', lost: 'Lost', new: 'New' }
    return (
      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${styles[seg] || styles.new}`}>
        {labels[seg] || 'New'}
      </span>
    )
  }

  // Memoize table columns
  const tableColumns = useMemo(() => [
    { key: 'name', label: 'Customer' },
    { key: 'source', label: 'Source' },
    { key: 'segment', label: 'Segment' },
    { key: 'totalOrders', label: 'Orders' },
    { key: 'totalSpent', label: 'Spent' },
    { key: 'lastOrderAt', label: 'Last Order' }
  ], [])

  return (
    <div className="page-container flex gap-6">
      
      {/* Main Content Area */}
      <div className="flex-1 space-y-6 min-w-0">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-info/10 border border-info/20 flex items-center justify-center">
              <Users size={20} className="text-info" />
            </div>
            <div>
              <h1 className="section-title">Customer Management (CRM)</h1>
              <p className="section-subtitle">Unified customer management and segmentation</p>
            </div>
          </div>
          <button 
            onClick={handleSync} 
            disabled={syncing}
            className="btn-primary flex items-center gap-2"
          >
            <RefreshCcw size={16} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing...' : 'Pull New Customers'}
          </button>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard label="Total Customers" value={stats?.total || 0} loading={loading} />
          <StatCard label="New Customers" value={stats?.newThisMonth || 0} loading={loading} />
          <StatCard label="Retention Rate" value={`${stats?.retentionRate || 0}%`} loading={loading} />
          <StatCard label="ACV" value={`$${stats?.acv || 0}`} loading={loading} />
        </div>

        {/* Filters */}
        <div className="card p-4 flex flex-wrap gap-3 items-center">
          <SearchInput 
            value={search}
            onChange={setSearch}
            placeholder="Search by name, email, phone..."
            className="flex-1 min-w-[200px]"
          />
          
          <select value={source} onChange={(e) => setSource(e.target.value)} className="bg-background border border-border rounded-lg py-2 px-3 text-sm focus:outline-none focus:border-accent">
            <option value="all">All Sources</option>
            <option value="shopify">Shopify</option>
            <option value="trendyol">Trendyol</option>
            <option value="instagram">Instagram</option>
            <option value="whatsapp">WhatsApp</option>
          </select>

          <select value={segment} onChange={(e) => setSegment(e.target.value)} className="bg-background border border-border rounded-lg py-2 px-3 text-sm focus:outline-none focus:border-accent">
            <option value="all">All Segments</option>
            <option value="vip">VIP</option>
            <option value="active">Active</option>
            <option value="idle">Idle</option>
            <option value="lost">Lost</option>
            <option value="new">New</option>
          </select>

          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="bg-background border border-border rounded-lg py-2 px-3 text-sm focus:outline-none focus:border-accent">
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="highest_spent">Highest Spend</option>
            <option value="most_orders">Most Orders</option>
          </select>

          <button className="btn-secondary whitespace-nowrap flex items-center gap-2 text-sm ml-auto">
            <Download size={14} /> Export CSV
          </button>
        </div>

        {/* Table */}
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface/50 border-b border-border">
                <tr className="text-text-muted">
                  <th className="py-3 px-4 font-medium">Customer</th>
                  <th className="py-3 px-4 font-medium">Source</th>
                  <th className="py-3 px-4 font-medium">Segment</th>
                  <th className="py-3 px-4 font-medium">Orders</th>
                  <th className="py-3 px-4 font-medium">Spent</th>
                  <th className="py-3 px-4 font-medium">Last Order</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <tr><td colSpan="6" className="py-8 text-center text-text-muted">Loading...</td></tr>
                ) : customers.length === 0 ? (
                  <tr><td colSpan="6" className="py-8 text-center text-text-muted">No customers match your search</td></tr>
                ) : (
                  customers.map(customer => (
                    <tr 
                      key={customer.id} 
                      onClick={() => navigate(`/customers/${customer.id}`)}
                      className="hover:bg-surface/50 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center font-bold text-accent text-xs">
                            {customer.name?.slice(0,2)?.toUpperCase() || 'CU'}
                          </div>
                          <div>
                            <p className="font-bold text-text">{customer.name}</p>
                            <p className="text-[11px] text-text-muted">{customer.email || customer.phone || 'No contact'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 text-text-muted capitalize">
                          {getSourceIcon(customer.source)} {customer.source}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {getSegmentBadge(customer.segment)}
                      </td>
                      <td className="py-3 px-4 font-medium">
                        {customer.totalOrders}
                      </td>
                      <td className="py-3 px-4 text-emerald-500 font-bold">
                        ${customer.totalSpent?.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-text-muted text-xs">
                        {customer.lastOrderAt ? formatDistanceToNow(new Date(customer.lastOrderAt), { addSuffix: true, locale: enUS }) : 'No orders yet'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          
          {/* Pagination */}
          {!loading && pagination.pages > 1 && (
            <div className="p-4 border-t border-border flex items-center justify-between text-sm text-text-muted">
              <span>Page {pagination.page} of {pagination.pages} ({pagination.total} customers)</span>
              <div className="flex items-center gap-2">
                <button 
                  disabled={pagination.page === 1}
                  onClick={() => setPagination(p => ({ ...p, page: Math.max(1, p.page - 1) }))}
                  className="w-8 h-8 rounded bg-surface border border-border flex items-center justify-center disabled:opacity-50 hover:bg-background"
                >
                  <ChevronRight size={16} />
                </button>
                <button 
                  disabled={pagination.page === pagination.pages}
                  onClick={() => setPagination(p => ({ ...p, page: Math.min(pagination.pages, p.page + 1) }))}
                  className="w-8 h-8 rounded bg-surface border border-border flex items-center justify-center disabled:opacity-50 hover:bg-background"
                >
                  <ChevronLeft size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Sidebar - CRM Agent Panel */}
      <div className="w-[300px] shrink-0 space-y-4">
        <div className="card p-4 bg-gradient-to-br from-indigo-500/10 to-transparent border-indigo-500/20">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-500">
              <Star size={16} />
            </div>
            <h3 className="font-bold text-text">Maestro (AI) Recommendations</h3>
          </div>
          
          <div className="space-y-3">
            <div className="bg-surface/80 p-3 rounded-lg border border-border text-sm">
              <div className="flex gap-2 text-orange-400 mb-1">
                <AlertTriangle size={16} /> <span className="font-bold">Low Engagement Warning</span>
              </div>
              <p className="text-text-muted text-xs leading-relaxed">
                12 VIP customers haven't made any purchases in the last 30 days. Consider sending a personalized promotion to re-engage them.
              </p>
              <button className="mt-2 text-indigo-400 text-xs font-bold hover:underline">Prepare a message for them →</button>
            </div>

            <div className="bg-surface/80 p-3 rounded-lg border border-border text-sm">
              <div className="flex gap-2 text-emerald-400 mb-1">
                <TrendingUp size={16} /> <span className="font-bold">Growth Opportunity — Instagram</span>
              </div>
              <p className="text-text-muted text-xs leading-relaxed">
                Instagram customer engagement increased by 23% this month, with a very high average order value. Recommend increasing budget for Reels ads.
              </p>
            </div>

            <div className="bg-surface/80 p-3 rounded-lg border border-border text-sm">
              <div className="flex gap-2 text-yellow-400 mb-1">
                <Star size={16} /> <span className="font-bold">Retargeting Campaign</span>
              </div>
              <p className="text-text-muted text-xs leading-relaxed">
                You have a segment of 145 customers who spent more than $200. You can export their contacts for a custom "Lookalike Audience" campaign.
              </p>
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}
