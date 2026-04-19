import { useState, useEffect, useCallback } from 'react'
import { pageCache } from '../utils/pageCache'
const PC = 'ads'
import {
  Megaphone, TrendingUp, DollarSign, Target,
  ShoppingCart, BarChart2, AlertTriangle, Zap, RefreshCw,
  ChevronRight, ArrowLeft, Activity, Users,
  CheckCircle, PauseCircle, StopCircle, Loader,
  ArrowUpRight, ArrowDownRight, Info
} from 'lucide-react'
import optimizedAPI from '../services/optimizedAPI'
import { useDebounce } from '../hooks/useDebounce'
import { format } from 'date-fns'
import { enUS } from 'date-fns/locale'

// ── Formatters ────────────────────────────────────────────────────────────────
const fmt   = (n, d = 2) => (typeof n === 'number' ? n.toFixed(d) : '0')
const fmtK  = (n) => {
  if (!n || isNaN(n)) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return String(Math.round(n))
}
const ROAS_COLOR = (v) => (v >= 3 ? 'text-emerald-400' : v >= 2 ? 'text-yellow-400' : 'text-red-400')
const ROAS_BG   = (v) => (v >= 3 ? 'bg-emerald-500/10 border-emerald-500/20' : v >= 2 ? 'bg-yellow-500/10 border-yellow-500/20' : 'bg-red-500/10 border-red-500/20')

// ── Platform / Status config ──────────────────────────────────────────────────
const PLATFORMS = {
  meta:     { label: 'Meta Ads',  color: 'text-blue-400',   light: 'bg-blue-500/10 border-blue-500/20',   dot: 'bg-blue-400'   },
  trendyol: { label: 'Trendyol', color: 'text-orange-400', light: 'bg-orange-500/10 border-orange-500/20', dot: 'bg-orange-400' },
}
const STATUS_CFG = {
  active: { label: 'Active', icon: CheckCircle,  cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  paused: { label: 'Paused', icon: PauseCircle,  cls: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20'  },
  ended:  { label: 'Ended',  icon: StopCircle,   cls: 'text-gray-400 bg-gray-500/10 border-gray-500/20'        },
}

// ── Pure-SVG Line Chart ───────────────────────────────────────────────────────
function SvgLineChart({ data, keys, colors, labels, height = 160 }) {
  if (!data.length) return (
    <div className="flex items-center justify-center text-text-muted text-xs" style={{ height }}>No data</div>
  )
  const W = 100, H = 100
  const allVals = keys.flatMap(k => data.map(d => d[k] || 0))
  const maxV = Math.max(...allVals, 1)
  const minV = 0
  const scaleX = (i) => (i / (data.length - 1)) * W
  const scaleY = (v) => H - ((v - minV) / (maxV - minV)) * H

  const path = (key) => {
    return data.map((d, i) => {
      const x = scaleX(i), y = scaleY(d[key] || 0)
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`
    }).join(' ')
  }

  const fill = (key, color) => {
    const top  = data.map((d, i) => `${scaleX(i).toFixed(2)},${scaleY(d[key] || 0).toFixed(2)}`).join(' ')
    const last = scaleX(data.length - 1)
    return `M0,${H} L${top} L${last},${H} Z`
  }

  return (
    <div style={{ height }} className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-full">
        <defs>
          {keys.map((k, idx) => (
            <linearGradient key={k} id={`g-${k}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colors[idx]} stopOpacity="0.3" />
              <stop offset="100%" stopColor={colors[idx]} stopOpacity="0.02" />
            </linearGradient>
          ))}
        </defs>
        {/* Grid lines */}
        {[0.25, 0.5, 0.75].map(f => (
          <line key={f} x1="0" y1={H * f} x2={W} y2={H * f} stroke="#2a2d3a" strokeWidth="0.5" />
        ))}
        {/* Fill areas */}
        {keys.map((k, idx) => (
          <path key={`fill-${k}`} d={fill(k, colors[idx])} fill={`url(#g-${k})`} />
        ))}
        {/* Lines */}
        {keys.map((k, idx) => (
          <path key={`line-${k}`} d={path(k)} fill="none" stroke={colors[idx]} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {/* Dots on last point */}
        {keys.map((k, idx) => {
          const last = data[data.length - 1]
          return (
            <circle key={`dot-${k}`}
              cx={scaleX(data.length - 1)}
              cy={scaleY(last[k] || 0)}
              r="2" fill={colors[idx]}
            />
          )
        })}
      </svg>
      {/* Legend */}
      <div className="flex gap-4 mt-2 justify-center">
        {keys.map((k, idx) => (
          <div key={k} className="flex items-center gap-1.5 text-[10px] text-text-muted">
            <span className="w-3 h-0.5 rounded-full inline-block" style={{ background: colors[idx] }} />
            {labels[idx]}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Pure-SVG Bar Chart ────────────────────────────────────────────────────────
function SvgBarChart({ data, keys, colors, labels, height = 160 }) {
  if (!data.length) return null
  const allVals = keys.flatMap(k => data.map(d => d[k] || 0))
  const maxV = Math.max(...allVals, 1)
  const barW = 80 / (data.length * keys.length + data.length)
  const gap  = barW * 0.3

  const barX = (di, ki) => {
    const groupW = keys.length * barW + (keys.length - 1) * gap
    const groupStart = (di / data.length) * 100 + (100 / data.length - groupW) / 2
    return groupStart + ki * (barW + gap)
  }

  return (
    <div style={{ height }} className="w-full">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
        {[0.25, 0.5, 0.75].map(f => (
          <line key={f} x1="0" y1={100 * f} x2="100" y2={100 * f} stroke="#2a2d3a" strokeWidth="0.5" />
        ))}
        {data.map((d, di) =>
          keys.map((k, ki) => {
            const h = ((d[k] || 0) / maxV) * 95
            const x = barX(di, ki)
            return (
              <rect key={`${di}-${ki}`}
                x={x} y={100 - h} width={barW} height={h}
                fill={colors[ki]} rx="1"
                opacity="0.85"
              />
            )
          })
        )}
      </svg>
      <div className="flex items-center gap-4 mt-2 justify-center">
        {keys.map((k, idx) => (
          <div key={k} className="flex items-center gap-1.5 text-[10px] text-text-muted">
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: colors[idx] }} />
            {labels[idx]}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Trend Badge ────────────────────────────────────────────────────────────────
function TrendBadge({ value }) {
  if (!value && value !== 0) return null
  const up = value > 0
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold px-1.5 py-0.5 rounded-full ${up ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10'}`}>
      <Icon size={11} /> {Math.abs(value).toFixed(1)}%
    </span>
  )
}

// ── Stat Card ──────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, value, sub, trend, iconColor, loading }) {
  return (
    <div className="card p-5 flex flex-col gap-3 hover:border-accent/30 transition-all">
      <div className="flex items-center justify-between">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-white/5 border border-white/10 ${iconColor}`}>
          <Icon size={20} />
        </div>
        {trend !== undefined && !loading && <TrendBadge value={trend} />}
      </div>
      {loading ? (
        <>
          <div className="skeleton h-7 w-28" />
          <div className="skeleton h-3 w-20" />
        </>
      ) : (
        <>
          <p className="text-2xl font-bold text-text">{value}</p>
          <p className="text-xs text-text-muted">{sub}</p>
        </>
      )}
    </div>
  )
}

// ── Badges ─────────────────────────────────────────────────────────────────────
function PlatformBadge({ platform }) {
  const p = PLATFORMS[platform] || PLATFORMS.meta
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border ${p.light} ${p.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${p.dot}`} /> {p.label}
    </span>
  )
}
function StatusBadge({ status }) {
  const c = STATUS_CFG[status] || STATUS_CFG.paused
  const Icon = c.icon
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border ${c.cls}`}>
      <Icon size={11} /> {c.label}
    </span>
  )
}

// ── Campaign Detail Drawer ─────────────────────────────────────────────────────
function CampaignDetail({ campaign, onClose }) {
  const [insights, setInsights] = useState([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    optimizedAPI.get(`/ads/campaigns/${campaign.id}/insights`, {}, true, 300000)
      .then(r => r?.success && setInsights(r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [campaign.id])

  const chartData = insights.slice(-30).map(i => ({
    date:    format(new Date(i.date), 'dd/MM', { locale: enUS }),
    spend:   parseFloat(i.spend || 0),
    revenue: parseFloat(i.revenue || 0),
  }))

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="h-full w-full max-w-2xl bg-surface border-l border-border shadow-2xl overflow-y-auto"
        style={{ direction: 'ltr' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-surface border-b border-border px-6 py-4 flex items-center gap-3">
          <button onClick={onClose} className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-text-muted hover:text-accent hover:border-accent transition-colors">
            <ArrowLeft size={16} />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-text truncate">{campaign.name}</h2>
            <div className="flex items-center gap-2 mt-0.5">
              <PlatformBadge platform={campaign.platform} />
              <StatusBadge status={campaign.status} />
            </div>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* KPI grid */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { l: 'Spend',       v: `$${fmt(campaign.spend)}`,   c: 'text-text' },
              { l: 'ROAS',        v: `${fmt(campaign.roas)}x`,    c: ROAS_COLOR(campaign.roas) },
              { l: 'Conversions', v: fmtK(campaign.conversions),  c: 'text-accent' },
              { l: 'CPA',         v: `$${fmt(campaign.cpa)}`,     c: 'text-text' },
              { l: 'Budget',      v: `$${fmt(campaign.budget, 0)}`, c: 'text-text' },
              { l: 'Revenue',     v: `$${fmt(campaign.revenue)}`, c: 'text-emerald-400' },
            ].map(k => (
              <div key={k.l} className="card p-3 text-center">
                <p className={`text-lg font-bold ${k.c}`}>{k.v}</p>
                <p className="text-[11px] text-text-muted mt-0.5">{k.l}</p>
              </div>
            ))}
          </div>

          {/* Spend vs Revenue Chart */}
          <div className="card p-5">
            <h3 className="font-bold text-text mb-4 flex items-center gap-2">
              <BarChart2 size={16} className="text-accent" /> Spend vs Revenue (Last 30 Days)
            </h3>
            {loading ? (
              <div className="h-40 flex items-center justify-center">
                <Loader size={22} className="animate-spin text-text-muted" />
              </div>
            ) : (
              <SvgLineChart
                data={chartData}
                keys={['spend', 'revenue']}
                colors={['#f87171', '#34d399']}
                labels={['Spend', 'Revenue']}
                height={160}
              />
            )}
          </div>

          {/* Daily table */}
          {insights.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <h3 className="font-bold text-text text-sm flex items-center gap-2">
                  <Activity size={14} className="text-accent" /> Daily Metrics
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-surface/50 text-text-muted">
                    <tr>
                      {['Date','Impressions','Clicks','CTR','Conversions','Spend','Revenue','ROAS'].map(h => (
                        <th key={h} className="px-3 py-2 font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {[...insights].reverse().slice(0, 14).map(row => {
                      const r = parseFloat(row.roas || 0)
                      return (
                        <tr key={String(row.date)} className="hover:bg-surface/40">
                          <td className="px-3 py-2 text-text-muted whitespace-nowrap">
                            {format(new Date(row.date), 'dd MMM', { locale: enUS })}
                          </td>
                          <td className="px-3 py-2">{fmtK(row.impressions)}</td>
                          <td className="px-3 py-2">{fmtK(row.clicks)}</td>
                          <td className="px-3 py-2">{fmt(row.ctr, 1)}%</td>
                          <td className="px-3 py-2">{row.conversions}</td>
                          <td className="px-3 py-2">${fmt(row.spend)}</td>
                          <td className="px-3 py-2">${fmt(row.revenue)}</td>
                          <td className={`px-3 py-2 font-bold ${ROAS_COLOR(r)}`}>{fmt(r)}x</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Audience breakdown (Meta only) */}
          {campaign.platform === 'meta' && (
            <div className="card p-5">
              <h3 className="font-bold text-text mb-3 flex items-center gap-2">
                <Users size={14} className="text-blue-400" /> Audience Breakdown (approximate)
              </h3>
              <div className="space-y-2.5">
                {[
                  { l: '18–24', pct: 28 },
                  { l: '25–34', pct: 42 },
                  { l: '35–44', pct: 20 },
                  { l: '45+',   pct: 10 },
                ].map(g => (
                  <div key={g.l} className="flex items-center gap-3">
                    <span className="text-xs text-text-muted w-10">{g.l}</span>
                    <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-l from-blue-500 to-blue-400 transition-all duration-700"
                        style={{ width: `${g.pct}%` }} />
                    </div>
                    <span className="text-xs text-text-muted w-8">{g.pct}%</span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-text-muted mt-3 flex items-center gap-1">
                <Info size={10} /> Connect your Meta Ads Account for real data
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Ads Agent Panel ────────────────────────────────────────────────────────────
function AgentPanel({ loading, data }) {
  const alerts    = data?.alerts    || []
  const budget    = data?.budgetSuggestions  || []
  const audience  = data?.audienceSuggestions || []
  const breakdown = data?.platformBreakdown  || []

  return (
    <div className="w-[285px] shrink-0 space-y-4">
      {/* Agent card */}
      <div className="card p-4 bg-gradient-to-br from-accent/10 to-transparent border-accent/20">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center">
            <Zap size={15} className="text-accent" />
          </div>
          <div>
            <h3 className="font-bold text-text text-sm">Ads Agent</h3>
            <p className="text-[10px] text-text-muted">Hourly monitoring</p>
          </div>
        </div>
        {loading && (
          <div className="flex items-center gap-2 mt-2 text-xs text-text-muted">
            <Loader size={12} className="animate-spin" /> Analyzing...
          </div>
        )}
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="card p-4">
          <p className="text-xs font-bold text-text-muted uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <AlertTriangle size={12} className="text-yellow-400" /> Alerts
          </p>
          <div className="space-y-2">
            {alerts.slice(0, 4).map(a => (
              <div key={a.id} className={`p-2.5 rounded-lg border text-xs ${
                a.type === 'error'   ? 'border-red-500/20 bg-red-500/5 text-red-300' :
                a.type === 'warning' ? 'border-yellow-500/20 bg-yellow-500/5 text-yellow-300' :
                'border-border bg-surface/40 text-text-muted'
              }`}>
                <p className="font-bold mb-0.5 truncate">{a.title}</p>
                <p className="opacity-80 line-clamp-2 leading-relaxed">{a.message}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Budget suggestions */}
      {budget.length > 0 && (
        <div className="card p-4">
          <p className="text-xs font-bold text-text-muted uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <DollarSign size={12} className="text-accent" /> Budget Suggestions
          </p>
          <div className="space-y-2">
            {budget.slice(0, 3).map((s, i) => (
              <div key={i} className="p-2.5 rounded-lg border border-border bg-surface/50">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className={`w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center ${
                    s.type === 'increase' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                  }`}>{s.type === 'increase' ? '↑' : '↓'}</span>
                  <span className="text-[11px] font-bold text-text truncate">{s.campaign}</span>
                </div>
                <p className="text-[10px] text-text-muted leading-relaxed">{s.reason}</p>
                <div className="flex items-center gap-1.5 mt-1 text-[10px]">
                  <span className="text-text-muted">${s.current} →</span>
                  <span className={`font-bold ${s.type === 'increase' ? 'text-emerald-400' : 'text-red-400'}`}>${s.suggested}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lookalike audiences */}
      {audience.length > 0 && (
        <div className="card p-4">
          <p className="text-xs font-bold text-text-muted uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <Users size={12} className="text-blue-400" /> Lookalike Audiences
          </p>
          <div className="space-y-2">
            {audience.slice(0, 2).map((s, i) => (
              <div key={i} className="p-2.5 rounded-lg border border-blue-500/20 bg-blue-500/5">
                <p className="text-[11px] font-bold text-blue-300 mb-0.5">{s.title}</p>
                <p className="text-[10px] text-text-muted leading-relaxed line-clamp-2">{s.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Meta vs Trendyol ROI */}
      {breakdown.length > 1 && (
        <div className="card p-4">
          <p className="text-xs font-bold text-text-muted uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <BarChart2 size={12} className="text-accent" /> Meta vs Trendyol
          </p>
          <div className="space-y-3">
            {breakdown.map(p => {
              const pCfg = PLATFORMS[p.platform] || PLATFORMS.meta
              const maxS = Math.max(...breakdown.map(x => x.spend || 0), 1)
              const pct  = Math.round(((p.spend || 0) / maxS) * 100)
              return (
                <div key={p.platform}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`text-xs font-bold ${pCfg.color}`}>{pCfg.label}</span>
                    <span className={`text-xs font-bold ${ROAS_COLOR(p.roas || 0)}`}>ROAS {fmt(p.roas || 0)}x</span>
                  </div>
                  <div className="h-1.5 bg-border rounded-full overflow-hidden mb-2">
                    <div className={`h-full rounded-full transition-all ${p.platform === 'meta' ? 'bg-blue-500' : 'bg-orange-500'}`}
                      style={{ width: `${pct}%` }} />
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-center">
                    {[
                      { l: 'Spend',   v: `$${fmt(p.spend || 0, 0)}` },
                      { l: 'Revenue', v: `$${fmt(p.revenue || 0, 0)}` },
                      { l: 'Conv.',   v: fmtK(p.conversions || 0) },
                    ].map(m => (
                      <div key={m.l} className="bg-background rounded p-1 border border-border">
                        <p className="text-[10px] font-bold text-text">{m.v}</p>
                        <p className="text-[9px] text-text-muted">{m.l}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Empty */}
      {!loading && !alerts.length && !budget.length && !audience.length && (
        <div className="card p-6 text-center">
          <Zap size={22} className="text-text-muted mx-auto mb-2 opacity-40" />
          <p className="text-xs text-text-muted">No recommendations currently</p>
          <p className="text-[10px] text-text-muted mt-1">The agent will analyze data when available</p>
        </div>
      )}
    </div>
  )
}

// ── Main Ads Page ──────────────────────────────────────────────────────────────
export default function Ads() {
  const _c = pageCache.get(PC) || {}
  const [overview, setOverview]           = useState(_c.overview   ?? null)
  const [campaigns, setCampaigns]         = useState(_c.campaigns  ?? [])
  const [recs, setRecs]                   = useState(_c.recs       ?? null)
  const [selectedCamp, setSelectedCamp]   = useState(null)
  const [loading, setLoading]             = useState(!pageCache.has(PC))
  const [recsLoading, setRecsLoading]     = useState(!pageCache.has(PC))
  const [syncing, setSyncing]             = useState(false)
  const [platformFilter, setPlatformFilter] = useState('all')
  const [statusFilter, setStatusFilter]   = useState('all')
  const [sortBy, setSortBy]               = useState('roas')

  const fetchData = useCallback(async () => {
    if (!pageCache.has(PC)) setLoading(true)
    try {
      const params = {}
      if (platformFilter !== 'all') params.platform = platformFilter
      if (statusFilter   !== 'all') params.status   = statusFilter

      const [ovRes, campRes] = await Promise.allSettled([
        optimizedAPI.get('/ads/overview', {}, true, 300000),
        optimizedAPI.get('/ads/campaigns', { params }, true, 300000),
      ])
      const next = { ...pageCache.get(PC) }
      if (ovRes.status   === 'fulfilled' && ovRes.value?.success)  { setOverview(ovRes.value.data);        next.overview  = ovRes.value.data }
      if (campRes.status === 'fulfilled' && campRes.value?.success) { setCampaigns(campRes.value.data||[]); next.campaigns = campRes.value.data||[] }
      pageCache.set(PC, next)
    } catch {}
    setLoading(false)
  }, [platformFilter, statusFilter])

  const fetchRecs = useCallback(async () => {
    if (!pageCache.has(PC)) setRecsLoading(true)
    try {
      const data = await optimizedAPI.get('/ads/recommendations', {}, true, 300000)
      if (data?.success) {
        setRecs(data.data)
        pageCache.set(PC, { ...pageCache.get(PC), recs: data.data })
      }
    } catch {}
    setRecsLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { fetchRecs()  }, [fetchRecs])

  const handleSync = async () => {
    setSyncing(true)
    try { await optimizedAPI.post('/ads/sync'); await fetchData(); await fetchRecs() }
    catch {}
    setSyncing(false)
  }

  const sorted = [...campaigns].sort((a, b) =>
    sortBy === 'roas'   ? b.roas - a.roas :
    sortBy === 'spend'  ? b.spend - a.spend :
    sortBy === 'conv'   ? b.conversions - a.conversions :
    b.budget - a.budget
  )

  const ov = overview || {}

  // Chart for platform comparison  
  const platformChartData = (ov.platformBreakdown || []).map(p => ({
    name:    PLATFORMS[p.platform]?.label || p.platform,
    spend:   parseFloat(p.spend || 0),
    revenue: parseFloat(p.revenue || 0),
  }))

  return (
    <div className="page-container flex gap-5">
      {/* ── Main ── */}
      <div className="flex-1 min-w-0 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-danger/10 border border-danger/20 flex items-center justify-center">
              <Megaphone size={20} className="text-danger" />
            </div>
            <div>
              <h1 className="section-title">Ads Management</h1>
              <p className="section-subtitle">Meta Ads + Trendyol — Campaign monitoring & analytics</p>
            </div>
          </div>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg border border-border text-text-muted hover:border-accent hover:text-accent transition-colors"
          >
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>

        {/* ── 4 Stats Cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={DollarSign}   value={`$${fmtK(ov.spend)}`}      sub="Ad Spend — This Month" trend={ov.spendTrend}    iconColor="text-red-400"     loading={loading} />
          <StatCard icon={TrendingUp}   value={`${fmt(ov.roas)}x`}         sub={ov.roas >= 3 ? 'ROAS Excellent 🟢' : ov.roas >= 2 ? 'ROAS Good 🟡' : 'ROAS Poor 🔴'}       iconColor={ROAS_COLOR(ov.roas || 0)} loading={loading} />
          <StatCard icon={ShoppingCart} value={fmtK(ov.conversions)}       sub={`Total Conversions | CTR ${fmt(ov.ctr, 1)}%`}            iconColor="text-accent"      loading={loading} />
          <StatCard icon={Target}       value={`$${fmt(ov.cpa)}`}          sub={`Avg. CPA | ${fmtK(ov.impressions)} Impressions`}           iconColor="text-purple-400"  loading={loading} />
        </div>

        {/* ── Campaigns Table ── */}
        <div className="card overflow-hidden">
          {/* Filters row */}
          <div className="px-5 py-3 border-b border-border flex items-center gap-3 flex-wrap">
            <h2 className="font-bold text-text text-sm flex-1">Ad Campaigns</h2>

            <div className="flex rounded-lg overflow-hidden border border-border text-xs">
              {[{v:'all',l:'All'},{v:'meta',l:'Meta'},{v:'trendyol',l:'Trendyol'}].map(({v,l}) => (
                <button key={v} onClick={() => setPlatformFilter(v)}
                  className={`px-3 py-1.5 transition-colors ${platformFilter === v ? 'bg-accent text-white' : 'bg-background text-text-muted hover:bg-surface'}`}>
                  {l}
                </button>
              ))}
            </div>

            <div className="flex rounded-lg overflow-hidden border border-border text-xs">
              {[{v:'all',l:'All'},{v:'active',l:'Active'},{v:'paused',l:'Paused'},{v:'ended',l:'Ended'}].map(({v,l}) => (
                <button key={v} onClick={() => setStatusFilter(v)}
                  className={`px-3 py-1.5 transition-colors ${statusFilter === v ? 'bg-accent text-white' : 'bg-background text-text-muted hover:bg-surface'}`}>
                  {l}
                </button>
              ))}
            </div>

            <select value={sortBy} onChange={e => setSortBy(e.target.value)}
              className="bg-background border border-border rounded-lg py-1.5 px-3 text-xs text-text focus:outline-none focus:border-accent">
              <option value="roas">Sort: ROAS</option>
              <option value="spend">Sort: Spend</option>
              <option value="conv">Sort: Conversions</option>
              <option value="budget">Sort: Budget</option>
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-surface/50 border-b border-border text-text-muted">
                <tr>
                  {['Campaign','Platform','Status','Budget','Spend','ROAS','Conversions','CPA',''].map(h => (
                    <th key={h} className="py-3 px-4 font-medium whitespace-nowrap text-xs">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  Array(4).fill(0).map((_,i) => (
                    <tr key={i}>{Array(9).fill(0).map((_,j) => (
                      <td key={j} className="py-3 px-4"><div className="skeleton h-4 w-20" /></td>
                    ))}</tr>
                  ))
                ) : sorted.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-16 text-center">
                      <Megaphone size={32} className="text-text-muted mx-auto mb-3 opacity-30" />
                      <p className="text-text-muted text-sm">No campaigns yet</p>
                      <p className="text-text-muted text-xs mt-1">Connect Meta Ads or Trendyol in Settings then click "Sync Now"</p>
                    </td>
                  </tr>
                ) : sorted.map(camp => (
                  <tr key={camp.id} onClick={() => setSelectedCamp(camp)}
                    className="hover:bg-surface/50 cursor-pointer group transition-colors">
                    <td className="py-3 px-4">
                      <p className="font-medium text-text max-w-[180px] truncate group-hover:text-accent transition-colors">{camp.name}</p>
                      {camp.objective && <p className="text-[10px] text-text-muted mt-0.5 capitalize">{camp.objective}</p>}
                    </td>
                    <td className="py-3 px-4"><PlatformBadge platform={camp.platform} /></td>
                    <td className="py-3 px-4"><StatusBadge status={camp.status} /></td>
                    <td className="py-3 px-4 text-text-muted text-xs">
                      ${fmt(camp.budget, 0)}
                      <span className="opacity-60 ml-1">/{camp.budgetType === 'daily' ? 'day' : 'total'}</span>
                    </td>
                    <td className="py-3 px-4 font-medium">${fmt(camp.spend)}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${ROAS_BG(camp.roas)} ${ROAS_COLOR(camp.roas)}`}>
                        {fmt(camp.roas)}x
                      </span>
                    </td>
                    <td className="py-3 px-4 font-medium">{fmtK(camp.conversions)}</td>
                    <td className="py-3 px-4 text-text-muted">${fmt(camp.cpa)}</td>
                    <td className="py-3 px-4">
                      <ChevronRight size={15} className="text-text-muted group-hover:text-accent transition-colors" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!loading && sorted.length > 0 && (
            <div className="px-5 py-2.5 border-t border-border bg-surface/30 flex items-center justify-between text-xs text-text-muted">
              <span>{sorted.length} campaign{sorted.length !== 1 ? 's' : ''}</span>
              <span>
                Spend: <strong className="text-red-400">${fmt(sorted.reduce((s,c) => s + c.spend, 0))}</strong>
                {' | '}
                Revenue: <strong className="text-emerald-400">${fmt(sorted.reduce((s,c) => s + c.revenue, 0))}</strong>
              </span>
            </div>
          )}
        </div>

        {/* ── Platform Comparison Chart ── */}
        {!loading && platformChartData.length > 1 && (
          <div className="card p-5">
            <h3 className="font-bold text-text mb-4 flex items-center gap-2">
              <BarChart2 size={16} className="text-accent" /> Platform Comparison — Spend vs Revenue
            </h3>
            <SvgBarChart
              data={platformChartData}
              keys={['spend', 'revenue']}
              colors={['#f87171', '#34d399']}
              labels={['Spend', 'Revenue']}
              height={160}
            />
          </div>
        )}
      </div>

      {/* ── Side Panel ── */}
      <AgentPanel loading={recsLoading} data={recs} />

      {/* ── Detail Drawer ── */}
      {selectedCamp && (
        <CampaignDetail campaign={selectedCamp} onClose={() => setSelectedCamp(null)} />
      )}
    </div>
  )
}
