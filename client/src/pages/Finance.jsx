import { useState, useEffect, useCallback, useMemo } from 'react'
import { pageCache } from '../utils/pageCache'

const PC = 'finance'
import {
  DollarSign, TrendingUp, TrendingDown, CreditCard, BarChart2,
  Plus, X, Loader, RefreshCw, Zap, AlertTriangle, ChevronDown,
  ArrowUpRight, ArrowDownRight, CheckCircle, Wallet
} from 'lucide-react'
import optimizedAPI from '../services/optimizedAPI'

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt  = (n, d = 0) => typeof n === 'number' ? n.toFixed(d) : '0'
const fmtK = (n) => {
  n = parseFloat(n) || 0
  if (n >= 1_000_000) return `${(n/1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n/1_000).toFixed(1)}K`
  return n.toFixed(0)
}

const CATEGORY_LABELS = {
  ads: 'Ads', shipping: 'Shipping', inventory: 'Inventory',
  salary: 'Salaries', subscription: 'Subscriptions', rent: 'Rent', other: 'Other'
}
const CATEGORY_COLORS = {
  ads: '#f87171', shipping: '#60a5fa', inventory: '#34d399',
  salary: '#c9a55a', subscription: '#a78bfa', rent: '#fb923c', other: '#8b8fa4'
}

// ── SVG Bar Chart (6-month history) ──────────────────────────────────────────
function BarHistory({ data }) {
  if (!data.length) return null
  const maxV = Math.max(...data.flatMap(d => [d.revenue, d.expenses]), 1)
  const W = 100, H = 80, barW = 6, gap = 2
  const total = data.length
  const groupW = barW * 2 + gap
  const spacing = (W - total * groupW) / (total + 1)

  return (
    <div className="w-full" style={{ height: 120 }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full" style={{ height: 100 }}>
        {[0.25, 0.5, 0.75].map(f => (
          <line key={f} x1="0" y1={H * f} x2={W} y2={H * f} stroke="#2a2d3a" strokeWidth="0.5" />
        ))}
        {data.map((d, i) => {
          const x     = spacing + i * (groupW + spacing)
          const revH  = (d.revenue  / maxV) * (H - 5)
          const expH  = (d.expenses / maxV) * (H - 5)
          return (
            <g key={d.label}>
              <rect x={x}          y={H - revH} width={barW} height={revH} fill="#34d399" rx="1" opacity="0.85" />
              <rect x={x + barW + gap} y={H - expH} width={barW} height={expH} fill="#f87171" rx="1" opacity="0.85" />
            </g>
          )
        })}
      </svg>
      <div className="flex items-center justify-between mt-1">
        {data.map(d => (
          <span key={d.label} className="text-[9px] text-text-muted text-center" style={{ width: `${100 / data.length}%` }}>
            {d.label}
          </span>
        ))}
      </div>
      <div className="flex items-center justify-center gap-4 mt-1">
        {[{ l: 'Revenue', c: '#34d399' }, { l: 'Expenses', c: '#f87171' }].map(m => (
          <div key={m.l} className="flex items-center gap-1.5 text-[10px] text-text-muted">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: m.c }} />
            {m.l}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Donut chart for expense breakdown ────────────────────────────────────────
function DonutChart({ data }) {
  if (!data.length) return null
  const total = data.reduce((s, d) => s + d.amount, 0)
  if (!total) return null

  const R = 40, cx = 50, cy = 50, stroke = 14
  let offset = 0
  const circ = 2 * Math.PI * R

  const slices = data.map(d => {
    const pct   = d.amount / total
    const len   = pct * circ
    const slice = { ...d, pct: Math.round(pct * 100), dashArray: `${len} ${circ - len}`, dashOffset: -offset }
    offset += len
    return slice
  })

  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 100 100" className="w-28 h-28 shrink-0">
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="#2a2d3a" strokeWidth={stroke} />
        {slices.map(s => (
          <circle key={s.category} cx={cx} cy={cy} r={R} fill="none"
            stroke={CATEGORY_COLORS[s.category] || '#8b8fa4'}
            strokeWidth={stroke}
            strokeDasharray={s.dashArray}
            strokeDashoffset={s.dashOffset}
            style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
          />
        ))}
        <text x={cx} y={cy - 4} textAnchor="middle" fill="#e8e8ec" fontSize="9" fontWeight="bold">
          ${fmtK(total)}
        </text>
        <text x={cx} y={cy + 7} textAnchor="middle" fill="#8b8fa4" fontSize="5">Expenses</text>
      </svg>
      <div className="flex-1 space-y-1.5">
        {slices.map(s => (
          <div key={s.category} className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: CATEGORY_COLORS[s.category] || '#8b8fa4' }} />
            <span className="text-xs text-text-muted flex-1">{CATEGORY_LABELS[s.category] || s.category}</span>
            <span className="text-xs font-bold text-text">${fmt(s.amount)}</span>
            <span className="text-[10px] text-text-muted w-7">{s.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Add Expense Modal ─────────────────────────────────────────────────────────
function AddExpenseModal({ onClose, onSave }) {
  const [form, setForm] = useState({
    category: 'ads', platform: '', amount: '', currency: 'USD',
    description: '', date: new Date().toISOString().split('T')[0],
    isRecurring: false, recurringDay: ''
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const handleSave = async () => {
    if (!form.amount || !form.category) return setError('Amount and category are required')
    setSaving(true)
    try {
      await onSave(form)
      onClose()
    } catch (err) {
      setError(err.response?.data?.message || 'An error occurred')
    }
    setSaving(false)
  }

  const field = (label, children) => (
    <div>
      <label className="text-xs text-text-muted mb-1.5 block">{label}</label>
      {children}
    </div>
  )

  const inp = (props) => (
    <input {...props} className="w-full bg-background border border-border rounded-lg py-2 px-3 text-sm text-text focus:outline-none focus:border-accent" />
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-surface border border-border rounded-2xl w-full max-w-md p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-text flex items-center gap-2">
            <Plus size={18} className="text-accent" /> Add Expense
          </h3>
          <button onClick={onClose}><X size={20} className="text-text-muted" /></button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {field('Category *',
              <select value={form.category} onChange={e => setForm(f => ({...f, category: e.target.value}))}
                className="w-full bg-background border border-border rounded-lg py-2 px-3 text-sm text-text focus:outline-none focus:border-accent">
                {Object.entries(CATEGORY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            )}
            {field('Platform',
              inp({ value: form.platform, onChange: e => setForm(f => ({...f, platform: e.target.value})), placeholder: 'shopify / meta ...' })
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {field('Amount *',
              inp({ type: 'number', min: 0, value: form.amount, onChange: e => setForm(f => ({...f, amount: e.target.value})), placeholder: '0.00' })
            )}
            {field('Currency',
              <select value={form.currency} onChange={e => setForm(f => ({...f, currency: e.target.value}))}
                className="w-full bg-background border border-border rounded-lg py-2 px-3 text-sm text-text focus:outline-none focus:border-accent">
                {['USD','TRY','SAR','EUR'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
          </div>

          {field('Description',
            inp({ value: form.description, onChange: e => setForm(f => ({...f, description: e.target.value})), placeholder: 'Optional description...' })
          )}

          {field('Date *',
            inp({ type: 'date', value: form.date, onChange: e => setForm(f => ({...f, date: e.target.value})) })
          )}

          <label className="flex items-center gap-3 cursor-pointer select-none">
            <div
              onClick={() => setForm(f => ({...f, isRecurring: !f.isRecurring}))}
              className={`w-10 h-5 rounded-full transition-colors relative ${form.isRecurring ? 'bg-accent' : 'bg-border'}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${form.isRecurring ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
            <span className="text-sm text-text">Monthly recurring expense</span>
          </label>

          {form.isRecurring && field('Day of month',
            inp({ type: 'number', min: 1, max: 31, value: form.recurringDay, onChange: e => setForm(f => ({...f, recurringDay: e.target.value})), placeholder: '1-31' })
          )}

          {error && <p className="text-xs text-red-400 flex items-center gap-1"><AlertTriangle size={12} /> {error}</p>}
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
            {saving ? <Loader size={14} className="animate-spin" /> : <CheckCircle size={14} />} Save
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Trend Badge ───────────────────────────────────────────────────────────────
function TrendBadge({ value, inversed = false }) {
  if (!value && value !== 0) return null
  const positive = inversed ? value < 0 : value > 0
  const Icon = value > 0 ? ArrowUpRight : ArrowDownRight
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold px-1.5 py-0.5 rounded-full ${positive ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10'}`}>
      <Icon size={11} /> {Math.abs(value).toFixed(1)}%
    </span>
  )
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, value, sub, trend, inversed, iconColor, loading }) {
  return (
    <div className="card p-5 flex flex-col gap-3 hover:border-accent/30 transition-all">
      <div className="flex items-center justify-between">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-white/5 border border-white/10 ${iconColor}`}>
          <Icon size={20} />
        </div>
        {trend !== undefined && !loading && <TrendBadge value={trend} inversed={inversed} />}
      </div>
      {loading ? (
        <><div className="skeleton h-7 w-28" /><div className="skeleton h-3 w-20" /></>
      ) : (
        <><p className="text-2xl font-bold text-text">{value}</p><p className="text-xs text-text-muted">{sub}</p></>
      )}
    </div>
  )
}

// ── Main Finance Page ─────────────────────────────────────────────────────────
export default function Finance() {
  // ── SWR: init from module-level cache → no skeleton on revisit ──────────────
  const cached = pageCache.get(PC) || {}
  const [overview,   setOverview]   = useState(cached.overview   ?? null)
  const [history,    setHistory]    = useState(cached.history    ?? [])
  const [breakdown,  setBreakdown]  = useState(cached.breakdown  ?? [])
  const [expenses,   setExpenses]   = useState(cached.expenses   ?? [])
  const [recs,       setRecs]       = useState(cached.recs       ?? null)
  const [platforms,  setPlatforms]  = useState(cached.platforms  ?? [])
  const [loading,    setLoading]    = useState(!pageCache.has(PC))   // false if cached
  const [recsLoad,   setRecsLoad]   = useState(!pageCache.has(PC))
  const [syncing,    setSyncing]    = useState(false)
  const [showAdd,    setShowAdd]    = useState(false)

  const fetch = useCallback(async () => {
    // Only show skeleton on very first load — silent refresh on revisit
    if (!pageCache.has(PC)) setLoading(true)
    try {
      const now   = new Date()
      const year  = now.getFullYear()
      const month = now.getMonth()

      const [ov, hist, bk, exp, plat] = await Promise.allSettled([
        optimizedAPI.get('/finance/overview', {}, true, 300000),
        optimizedAPI.get('/finance/pnl/history', {}, true, 300000),
        optimizedAPI.get('/finance/expenses/breakdown', { params: { year, month } }, true, 300000),
        optimizedAPI.get('/finance/expenses', { params: { limit: 10 } }, true, 300000),
        optimizedAPI.get('/finance/pnl/platforms', {}, true, 300000),
      ])

      const next = { ...pageCache.get(PC) }
      if (ov.status   === 'fulfilled' && ov.value?.success)   { setOverview(ov.value.data);     next.overview   = ov.value.data }
      if (hist.status === 'fulfilled' && hist.value?.success) { setHistory(hist.value.data||[]); next.history    = hist.value.data||[] }
      if (bk.status   === 'fulfilled' && bk.value?.success)   { setBreakdown(bk.value.data||[]); next.breakdown  = bk.value.data||[] }
      if (exp.status  === 'fulfilled' && exp.value?.success)  { setExpenses(exp.value.data||[]);  next.expenses   = exp.value.data||[] }
      if (plat.status === 'fulfilled' && plat.value?.success) { setPlatforms(plat.value.data||[]); next.platforms = plat.value.data||[] }
      pageCache.set(PC, next)
    } catch {}
    setLoading(false)
  }, [])

  const fetchRecs = useCallback(async () => {
    if (!pageCache.has(PC)) setRecsLoad(true)
    try {
      const data = await optimizedAPI.get('/finance/recommendations', {}, true, 300000)
      if (data?.success) {
        setRecs(data.data)
        pageCache.set(PC, { ...pageCache.get(PC), recs: data.data })
      }
    } catch {}
    setRecsLoad(false)
  }, [])

  useEffect(() => { Promise.all([fetch(), fetchRecs()]) }, [fetch, fetchRecs])

  const handleSync = async () => {
    setSyncing(true)
    try { await optimizedAPI.post('/finance/sync'); await fetch(); await fetchRecs() } catch {}
    setSyncing(false)
  }

  const addExpense = async (data) => {
    await optimizedAPI.post('/finance/expenses', data)
    await fetch()
  }

  const deleteExpense = async (id) => {
    if (!confirm('Delete this expense?')) return
    await optimizedAPI.delete(`/finance/expenses/${id}`)
    await fetch()
  }

  const ov = overview || {}

  return (
    <div className="page-container flex gap-5">
      {/* ── Main ── */}
      <div className="flex-1 min-w-0 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <DollarSign size={20} className="text-emerald-400" />
            </div>
            <div>
              <h1 className="section-title">Finance</h1>
              <p className="section-subtitle">Revenue, expenses, and net profit</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleSync} disabled={syncing}
              className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg border border-border text-text-muted hover:border-accent hover:text-accent transition-colors">
              <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Syncing...' : 'Sync'}
            </button>
            <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-2">
              <Plus size={16} /> New Expense
            </button>
          </div>
        </div>

        {/* ── 4 Stat Cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={TrendingUp}  value={`$${fmtK(ov.revenue)}`}  sub="Revenue this month"  trend={ov.revTrend}  iconColor="text-emerald-400" loading={loading} />
          <StatCard icon={CreditCard}  value={`$${fmtK(ov.expenses)}`} sub="Expenses this month"  trend={ov.expTrend}  inversed iconColor="text-red-400"    loading={loading} />
          <StatCard icon={Wallet}      value={`${ov.profit >= 0 ? '+' : ''}$${fmtK(ov.profit)}`}
            sub={`Margin ${fmt(ov.margin, 1)}%`}
            iconColor={ov.profit >= 0 ? 'text-accent' : 'text-red-400'} loading={loading} />
          <StatCard icon={BarChart2}   value={`${fmt(ov.roi, 1)}%`}    sub="Total ROI"           iconColor="text-purple-400" loading={loading} />
        </div>

        {/* ── 6-month bar chart + expense donut ── */}
        <div className="grid grid-cols-2 gap-4">
          <div className="card p-5">
            <h3 className="font-bold text-text mb-4 flex items-center gap-2">
              <BarChart2 size={16} className="text-accent" /> Revenue vs Expenses (6 months)
            </h3>
            {loading ? <div className="skeleton h-28 w-full" /> : <BarHistory data={history} />}
          </div>

          <div className="card p-5">
            <h3 className="font-bold text-text mb-4 flex items-center gap-2">
              <CreditCard size={16} className="text-red-400" /> Expense Breakdown (this month)
            </h3>
            {loading ? <div className="skeleton h-28 w-full" /> :
              breakdown.length > 0 ? <DonutChart data={breakdown} /> :
              <p className="text-sm text-text-muted text-center py-4">No expenses recorded</p>
            }
          </div>
        </div>

        {/* ── Recent Expenses Table ── */}
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <h2 className="font-bold text-text text-sm">Recent Expenses</h2>
            <button onClick={() => setShowAdd(true)} className="text-xs text-accent hover:text-accent/80 flex items-center gap-1">
              <Plus size={12} /> Add Expense
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-surface/50 border-b border-border text-text-muted">
                <tr>
                  {['Category','Amount','Date','Description',''].map(h => (
                    <th key={h} className="py-2.5 px-4 font-medium text-xs">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? Array(4).fill(0).map((_,i) => (
                  <tr key={i}>{Array(5).fill(0).map((_,j) => (
                    <td key={j} className="py-3 px-4"><div className="skeleton h-4 w-20" /></td>
                  ))}</tr>
                )) : expenses.length === 0 ? (
                  <tr><td colSpan={5} className="py-10 text-center text-text-muted">No expenses recorded</td></tr>
                ) : expenses.map(exp => (
                  <tr key={exp.id} className="hover:bg-surface/40 transition-colors">
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ background: CATEGORY_COLORS[exp.category] || '#8b8fa4' }} />
                        <span className="text-xs font-medium text-text">{CATEGORY_LABELS[exp.category] || exp.category}</span>
                        {exp.platform && <span className="text-[10px] text-text-muted">({exp.platform})</span>}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 font-medium text-red-400">${fmt(exp.amount, 2)}</td>
                    <td className="py-2.5 px-4 text-text-muted text-xs">{new Date(exp.date).toLocaleDateString('en-US')}</td>
                    <td className="py-2.5 px-4 text-text-muted text-xs truncate max-w-[180px]">{exp.description || '—'}</td>
                    <td className="py-2.5 px-4">
                      <button onClick={() => deleteExpense(exp.id)} className="text-text-muted hover:text-red-400 transition-colors">
                        <X size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── P&L Monthly Table ── */}
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-border">
            <h2 className="font-bold text-text text-sm">P&L — Last 6 Months</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-surface/50 border-b border-border text-text-muted">
                <tr>
                  {['Month','Revenue','Expenses','Net Profit','Margin'].map(h => (
                    <th key={h} className="py-2.5 px-4 font-medium text-xs">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? Array(3).fill(0).map((_,i) => (
                  <tr key={i}>{Array(5).fill(0).map((_,j) => <td key={j} className="py-3 px-4"><div className="skeleton h-4 w-16" /></td>)}</tr>
                )) : [...history].reverse().map(m => (
                  <tr key={`${m.year}-${m.month}`} className="hover:bg-surface/40">
                    <td className="py-2.5 px-4 font-medium text-text">{m.label}</td>
                    <td className="py-2.5 px-4 text-emerald-400">${fmtK(m.revenue)}</td>
                    <td className="py-2.5 px-4 text-red-400">${fmtK(m.expenses)}</td>
                    <td className={`py-2.5 px-4 font-bold ${m.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {m.profit >= 0 ? '+' : ''}${fmtK(m.profit)}
                    </td>
                    <td className={`py-2.5 px-4 text-xs ${m.margin >= 20 ? 'text-emerald-400' : m.margin >= 0 ? 'text-yellow-400' : 'text-red-400'}`}>
                      {fmt(m.margin, 1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Platform P&L ── */}
        {platforms.length > 0 && (
          <div className="card p-5">
            <h3 className="font-bold text-text mb-4 text-sm">ROI by Platform</h3>
            <div className="grid grid-cols-2 gap-3">
              {platforms.map(p => (
                <div key={p.platform} className="bg-background border border-border rounded-xl p-4">
                  <p className="text-xs font-bold text-text-muted uppercase mb-3">{p.platform}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { l: 'Revenue',  v: `$${fmtK(p.revenue)}`, c: 'text-emerald-400' },
                      { l: 'Expenses', v: `$${fmtK(p.expenses)}`,c: 'text-red-400' },
                      { l: 'Profit',   v: `$${fmtK(p.profit)}`,  c: p.profit >= 0 ? 'text-accent' : 'text-red-400' },
                      { l: 'ROI',     v: `${fmt(p.roi, 1)}%`,    c: p.roi >= 20 ? 'text-emerald-400' : 'text-yellow-400' },
                    ].map(m => (
                      <div key={m.l} className="text-center">
                        <p className={`text-sm font-bold ${m.c}`}>{m.v}</p>
                        <p className="text-[10px] text-text-muted">{m.l}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Finance Agent Panel ── */}
      <div className="w-[270px] shrink-0 space-y-4">
        <div className="card p-4 bg-gradient-to-br from-emerald-500/10 to-transparent border-emerald-500/20">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <Zap size={15} className="text-emerald-400" />
            </div>
            <div>
              <h3 className="font-bold text-text text-sm">Finance Agent</h3>
              <p className="text-[10px] text-text-muted">Daily analysis</p>
            </div>
          </div>
          {recsLoad && <div className="flex items-center gap-2 mt-2 text-xs text-text-muted"><Loader size={12} className="animate-spin" /> Analyzing...</div>}
        </div>

        {/* Alerts */}
        {(recs?.alerts || []).length > 0 && (
          <div className="card p-4">
            <p className="text-xs font-bold text-text-muted uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <AlertTriangle size={12} className="text-yellow-400" /> Alerts
            </p>
            <div className="space-y-2">
              {(recs.alerts || []).slice(0, 4).map(a => (
                <div key={a.id} className={`p-2.5 rounded-lg border text-xs ${
                  a.type === 'error'   ? 'border-red-500/20 bg-red-500/5 text-red-300' :
                  a.type === 'success' ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-300' :
                  'border-yellow-500/20 bg-yellow-500/5 text-yellow-300'
                }`}>
                  <p className="font-bold mb-0.5 truncate">{a.title}</p>
                  <p className="opacity-80 line-clamp-2">{a.message}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Cost suggestions */}
        {(recs?.costSuggestions || []).length > 0 && (
          <div className="card p-4">
            <p className="text-xs font-bold text-text-muted uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <TrendingDown size={12} className="text-accent" /> Cost Reduction Tips
            </p>
            <div className="space-y-2">
              {(recs.costSuggestions || []).map((s, i) => (
                <div key={i} className="p-2.5 rounded-lg border border-border bg-surface/40 text-xs">
                  <p className="font-bold text-text mb-0.5">{s.title}</p>
                  <p className="text-text-muted leading-relaxed">{s.detail}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Platform ROI */}
        {(recs?.platformROI || []).length > 1 && (
          <div className="card p-4">
            <p className="text-xs font-bold text-text-muted uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <BarChart2 size={12} className="text-accent" /> ROI by Platform
            </p>
            <div className="space-y-2">
              {(recs.platformROI || []).map(p => (
                <div key={p.platform} className="flex items-center justify-between p-2 bg-background rounded-lg border border-border">
                  <span className="text-xs font-bold text-text capitalize">{p.platform}</span>
                  <span className={`text-xs font-bold ${p.roi >= 20 ? 'text-emerald-400' : p.roi >= 0 ? 'text-yellow-400' : 'text-red-400'}`}>
                    ROI {fmt(p.roi, 0)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {!recsLoad && !recs?.alerts?.length && !recs?.costSuggestions?.length && (
          <div className="card p-6 text-center">
            <CheckCircle size={22} className="text-emerald-400 mx-auto mb-2" />
            <p className="text-xs text-text-muted">Finances look good</p>
            <p className="text-[10px] text-text-muted mt-1">No alerts currently</p>
          </div>
        )}
      </div>

      {showAdd && <AddExpenseModal onClose={() => setShowAdd(false)} onSave={addExpense} />}
    </div>
  )
}
