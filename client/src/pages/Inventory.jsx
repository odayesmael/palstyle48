import { useState, useEffect, useCallback, useMemo } from 'react'
import { pageCache } from '../utils/pageCache'
const PC = 'inventory'
import {
  Package, AlertTriangle, RefreshCw, Zap, Loader,
  Search, CheckCircle, ArrowUpRight, X, RotateCcw
} from 'lucide-react'
import optimizedAPI from '../services/optimizedAPI'
import { useDebounce } from '../hooks/useDebounce'
import { requestDeduplicator } from '../utils/performance'
import SearchInput from '../components/shared/SearchInput'

// ── Stock status config ───────────────────────────────────────────────────────
const STOCK_STATUS = {
  out:    { label: 'Out of Stock', cls: 'text-red-400     bg-red-500/10     border-red-500/20',     dot: 'bg-red-500'     },
  low:    { label: 'Low',          cls: 'text-yellow-400  bg-yellow-500/10  border-yellow-500/20',   dot: 'bg-yellow-500'  },
  medium: { label: 'Medium',       cls: 'text-blue-400    bg-blue-500/10    border-blue-500/20',     dot: 'bg-blue-500'    },
  good:   { label: 'Good',         cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',  dot: 'bg-emerald-500' },
}

const STOCK_TEXT = (v) =>
  v === 0  ? 'text-red-400' :
  v <= 5   ? 'text-yellow-400' :
  v <= 20  ? 'text-blue-400' :
  'text-emerald-400'

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, value, sub, iconColor, loading, highlight }) {
  return (
    <div className={`card p-5 flex flex-col gap-3 hover:border-accent/30 transition-all ${highlight ? 'border-red-500/30' : ''}`}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-white/5 border border-white/10 ${iconColor}`}>
        <Icon size={20} />
      </div>
      {loading ? (
        <><div className="skeleton h-7 w-20" /><div className="skeleton h-3 w-16" /></>
      ) : (
        <><p className="text-2xl font-bold text-text">{value}</p><p className="text-xs text-text-muted">{sub}</p></>
      )}
    </div>
  )
}

// ── Status Badge ──────────────────────────────────────────────────────────────
function StockBadge({ status }) {
  const c = STOCK_STATUS[status] || STOCK_STATUS.good
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border ${c.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  )
}

// ── Stock edit inline ─────────────────────────────────────────────────────────
function StockEditor({ variant, onSave }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue]     = useState(variant.stock)
  const [saving, setSaving]   = useState(false)

  const save = async () => {
    setSaving(true)
    await onSave(variant.id, parseInt(value))
    setSaving(false)
    setEditing(false)
  }

  if (!editing) {
    return (
      <button
        onClick={() => { setValue(variant.stock); setEditing(true) }}
        className={`font-bold text-sm hover:opacity-80 transition-opacity ${STOCK_TEXT(variant.stock)}`}
      >
        {variant.stock}
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="number" min={0} value={value}
        onChange={e => setValue(e.target.value)}
        className="w-16 bg-background border border-accent rounded px-2 py-0.5 text-sm text-text focus:outline-none"
        autoFocus
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
      />
      <button onClick={save} disabled={saving} className="text-emerald-400 hover:text-emerald-300">
        {saving ? <Loader size={12} className="animate-spin" /> : <CheckCircle size={14} />}
      </button>
      <button onClick={() => setEditing(false)} className="text-text-muted hover:text-red-400">
        <X size={12} />
      </button>
    </div>
  )
}

// ── Main Inventory Page ───────────────────────────────────────────────────────
export default function Inventory() {
  const _c = pageCache.get(PC) || {}
  const [summary,   setSummary]   = useState(_c.summary  ?? null)
  const [products,  setProducts]  = useState(_c.products ?? [])
  const [recs,      setRecs]      = useState(_c.recs     ?? null)
  const [loading,   setLoading]   = useState(!pageCache.has(PC))
  const [recsLoad,  setRecsLoad]  = useState(!pageCache.has(PC))
  const [syncing,   setSyncing]   = useState(false)
  const [filter,    setFilter]    = useState('all')  // all | out | low | medium | good
  const [platform,  setPlatform]  = useState('all')
  const [search,    setSearch]    = useState('')

  // Debounce search
  const debouncedSearch = useDebounce(search, 300)

  const fetchData = useCallback(async () => {
    if (!pageCache.has(PC)) setLoading(true)
    try {
      return requestDeduplicator.deduplicate(`inventory-${filter}-${platform}-${debouncedSearch}`, async () => {
        const params = {}
        if (filter   !== 'all') params.status   = filter
        if (platform !== 'all') params.platform = platform
        if (debouncedSearch)    params.search   = debouncedSearch

        const [sumRes, prodRes] = await Promise.allSettled([
          optimizedAPI.get('/inventory/summary', {}, true, 300000),
          optimizedAPI.get('/inventory/products', { params }, true, 300000),
        ])
        const next = { ...pageCache.get(PC) }
        if (sumRes.status  === 'fulfilled' && sumRes.value?.success)  { setSummary(sumRes.value.data);        next.summary  = sumRes.value.data }
        if (prodRes.status === 'fulfilled' && prodRes.value?.success) { setProducts(prodRes.value.data||[]);  next.products = prodRes.value.data||[] }
        pageCache.set(PC, next)
      })
    } catch {}
    finally { setLoading(false) }
  }, [filter, platform, debouncedSearch])

  const fetchRecs = useCallback(async () => {
    setRecsLoad(true)
    try {
      const data = await optimizedAPI.get('/inventory/recommendations', {}, true, 300000)
      if (data?.success) setRecs(data.data)
    } catch {}
    finally { setRecsLoad(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { fetchRecs() }, [fetchRecs])

  const handleSync = async () => {
    setSyncing(true)
    try { 
      await optimizedAPI.post('/inventory/sync')
      await fetchData()
      await fetchRecs()
    } catch {}
    finally { setSyncing(false) }
  }

  const updateStock = async (variantId, newStock) => {
    await optimizedAPI.patch(`/inventory/products/${variantId}/stock`, { stock: newStock })
    await fetchData()
  }

  const sm = summary || {}

  const PRIORITY_COLORS = { urgent: 'text-red-400 border-red-500/20 bg-red-500/5', high: 'text-yellow-400 border-yellow-500/20 bg-yellow-500/5' }

  return (
    <div className="page-container flex gap-5">
      {/* ── Main ── */}
      <div className="flex-1 min-w-0 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <Package size={20} className="text-blue-400" />
            </div>
            <div>
              <h1 className="section-title">Inventory</h1>
              <p className="section-subtitle">Shopify ↔ Trendyol sync — Stock management</p>
            </div>
          </div>
          <button onClick={handleSync} disabled={syncing}
            className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg border border-border text-text-muted hover:border-accent hover:text-accent transition-colors">
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>

        {/* ── 4 Stat Cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Package}       value={sm.total      || 0} sub="Total Products"    iconColor="text-blue-400"    loading={loading} />
          <StatCard icon={AlertTriangle} value={sm.lowStock   || 0} sub="Low Stock"          iconColor="text-yellow-400"  loading={loading} highlight={(sm.lowStock || 0) > 0} />
          <StatCard icon={X}             value={sm.outOfStock || 0} sub="Out of Stock"        iconColor="text-red-400"     loading={loading} highlight={(sm.outOfStock || 0) > 0} />
          <StatCard icon={RotateCcw}     value="Synced"              sub="Shopify ↔ Trendyol" iconColor="text-emerald-400" loading={loading} />
        </div>

        {/* ── Filters ── */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Status filter */}
          <div className="flex rounded-lg overflow-hidden border border-border text-xs">
            {[
              { v: 'all',    l: 'All' },
              { v: 'out',    l: 'Out' },
              { v: 'low',    l: 'Low' },
              { v: 'medium', l: 'Medium' },
              { v: 'good',   l: 'Good' },
            ].map(({v, l}) => (
              <button key={v} onClick={() => setFilter(v)}
                className={`px-3 py-1.5 transition-colors ${filter === v ? 'bg-accent text-white' : 'bg-background text-text-muted hover:bg-surface'}`}>
                {l}
              </button>
            ))}
          </div>

          {/* Platform filter */}
          <div className="flex rounded-lg overflow-hidden border border-border text-xs">
            {[{v:'all',l:'All Platforms'},{v:'shopify',l:'Shopify'},{v:'trendyol',l:'Trendyol'}].map(({v,l}) => (
              <button key={v} onClick={() => setPlatform(v)}
                className={`px-3 py-1.5 transition-colors ${platform === v ? 'bg-accent text-white' : 'bg-background text-text-muted hover:bg-surface'}`}>
                {l}
              </button>
            ))}
          </div>

          {/* Search */}
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search by name or SKU..."
            className="flex-1 max-w-xs"
          />
        </div>

        {/* ── Products Table ── */}
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-surface/50 border-b border-border text-text-muted">
                <tr>
                  {['Product','SKU','Size','Color','Qty','Status','Platforms','Price'].map(h => (
                    <th key={h} className="py-3 px-4 font-medium text-xs whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? Array(6).fill(0).map((_,i) => (
                  <tr key={i}>{Array(8).fill(0).map((_,j) => <td key={j} className="py-3 px-4"><div className="skeleton h-4 w-16" /></td>)}</tr>
                )) : products.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-16 text-center">
                      <Package size={32} className="text-text-muted mx-auto mb-3 opacity-30" />
                      <p className="text-text-muted text-sm">No products</p>
                      <p className="text-text-muted text-xs mt-1">Add products or click "Sync Now" to fetch data</p>
                    </td>
                  </tr>
                ) : products.map(v => {
                  const platforms = Object.keys(v.platforms || {})
                  return (
                    <tr key={v.id} className="hover:bg-surface/40 transition-colors">
                      <td className="py-3 px-4">
                        <p className="font-medium text-text max-w-[160px] truncate">{v.productName}</p>
                        {v.category && <p className="text-[10px] text-text-muted">{v.category}</p>}
                      </td>
                      <td className="py-3 px-4 text-text-muted text-xs font-mono">{v.sku || '—'}</td>
                      <td className="py-3 px-4 text-text-muted text-xs">{v.size || '—'}</td>
                      <td className="py-3 px-4">
                        {v.color ? (
                          <span className="flex items-center gap-1.5 text-xs text-text-muted">
                            <span className="w-3 h-3 rounded-full border border-border" style={{ background: v.color }} />
                            {v.color}
                          </span>
                        ) : <span className="text-text-muted text-xs">—</span>}
                      </td>
                      <td className="py-3 px-4">
                        <StockEditor variant={v} onSave={updateStock} />
                      </td>
                      <td className="py-3 px-4"><StockBadge status={v.stockStatus} /></td>
                      <td className="py-3 px-4">
                        <div className="flex gap-1">
                          {platforms.length === 0 ? <span className="text-xs text-text-muted">—</span> :
                            platforms.map(p => (
                              <span key={p} className="text-[10px] px-1.5 py-0.5 rounded border border-border text-text-muted capitalize">
                                {p}
                              </span>
                            ))
                          }
                        </div>
                      </td>
                      <td className="py-3 px-4 text-text-muted text-xs">{v.price ? `$${v.price.toFixed(2)}` : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {!loading && products.length > 0 && (
            <div className="px-5 py-2.5 border-t border-border bg-surface/30 text-xs text-text-muted flex items-center justify-between">
              <span>{products.length} products</span>
              <span>
                Out of stock: <strong className="text-red-400">{products.filter(v => v.stockStatus === 'out').length}</strong>
                {' | '} Low: <strong className="text-yellow-400">{products.filter(v => v.stockStatus === 'low').length}</strong>
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Inventory Agent Panel ── */}
      <div className="w-[270px] shrink-0 space-y-4">
        {/* Agent header */}
        <div className="card p-4 bg-gradient-to-br from-blue-500/10 to-transparent border-blue-500/20">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
              <Zap size={15} className="text-blue-400" />
            </div>
            <div>
              <h3 className="font-bold text-text text-sm">Inventory Agent</h3>
              <p className="text-[10px] text-text-muted">Hourly monitoring</p>
            </div>
          </div>
          {recsLoad && <div className="flex items-center gap-2 mt-2 text-xs text-text-muted"><Loader size={12} className="animate-spin" /> Analyzing...</div>}
        </div>

        {/* Alerts */}
        {(recs?.alerts || []).length > 0 && (
          <div className="card p-4">
            <p className="text-xs font-bold text-text-muted uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <AlertTriangle size={12} className="text-yellow-400" /> Stock Alerts
            </p>
            <div className="space-y-2">
              {(recs.alerts || []).slice(0, 5).map(a => (
                <div key={a.id} className={`p-2.5 rounded-lg border text-xs ${
                  a.type === 'error' ? 'border-red-500/20 bg-red-500/5 text-red-300' :
                  'border-yellow-500/20 bg-yellow-500/5 text-yellow-300'
                }`}>
                  <p className="font-bold mb-0.5 truncate">{a.title}</p>
                  <p className="opacity-80 line-clamp-2">{a.message}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Reorder suggestions */}
        {(recs?.reorders || []).length > 0 && (
          <div className="card p-4">
            <p className="text-xs font-bold text-text-muted uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <ArrowUpRight size={12} className="text-accent" /> Reorder Suggestions
            </p>
            <div className="space-y-2">
              {(recs.reorders || []).slice(0, 5).map((r, i) => (
                <div key={i} className={`p-2.5 rounded-lg border text-xs ${PRIORITY_COLORS[r.priority] || 'border-border bg-surface/40 text-text-muted'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold truncate max-w-[130px]">{r.productName}</span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${r.priority === 'urgent' ? 'border-red-500/30 text-red-400' : 'border-yellow-500/30 text-yellow-400'}`}>
                      {r.priority === 'urgent' ? 'Urgent' : 'High'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-center mt-1.5">
                    {[
                      { l: 'Left',  v: r.currentStock },
                      { l: 'Days',  v: r.daysLeft     },
                      { l: 'Order', v: r.reorderQty   },
                    ].map(m => (
                      <div key={m.l} className="bg-black/20 rounded p-1">
                        <p className="font-bold">{m.v}</p>
                        <p className="text-[9px] opacity-70">{m.l}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty */}
        {!recsLoad && !recs?.alerts?.length && !recs?.reorders?.length && (
          <div className="card p-6 text-center">
            <CheckCircle size={22} className="text-emerald-400 mx-auto mb-2" />
            <p className="text-xs text-text-muted">Stock is in good shape</p>
            <p className="text-[10px] text-text-muted mt-1">No alerts or recommendations</p>
          </div>
        )}
      </div>
    </div>
  )
}
