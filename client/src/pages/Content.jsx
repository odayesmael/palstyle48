import { useState, useEffect } from 'react'
import {
  Calendar, List, Plus, X, Instagram, Facebook, Zap,
  Clock, Star, Image, Video, AlignLeft, Layers,
  ChevronLeft, ChevronRight, Send, BookOpen, BarChart2,
  Trash2, Eye, Upload, Hash, Loader
} from 'lucide-react'
import optimizedAPI from '../services/optimizedAPI'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday, getDay, addMonths, subMonths } from 'date-fns'
import { enUS } from 'date-fns/locale'

// ── Constants ─────────────────────────────────────────────────────────────────
const PLATFORMS = {
  instagram: { label: 'Instagram', icon: Instagram, color: 'text-pink-500', bg: 'bg-pink-500', light: 'bg-pink-500/10 border-pink-500/20' },
  facebook:  { label: 'Facebook',  icon: Facebook,  color: 'text-blue-500',  bg: 'bg-blue-500',  light: 'bg-blue-500/10 border-blue-500/20' }
}

const CONTENT_TYPES = [
  { value: 'post',     label: 'Post',    icon: Image },
  { value: 'reel',     label: 'Reel',    icon: Video },
  { value: 'story',    label: 'Story',   icon: Clock },
  { value: 'carousel', label: 'Carousel', icon: Layers }
]

const STATUS_COLORS = {
  draft:     'bg-gray-500',
  scheduled: 'bg-blue-500',
  published: 'bg-emerald-500',
  failed:    'bg-red-500'
}

const STATUS_LABELS = { draft: 'Draft', scheduled: 'Scheduled', published: 'Published', failed: 'Failed' }

const TONES = ['Trendy', 'Classic', 'Energetic', 'Luxury']

// ── Caption Generator Modal ───────────────────────────────────────────────────
function CaptionGenerator({ onSelect, onClose }) {
  const [productName, setProductName] = useState('')
  const [productDesc, setProductDesc] = useState('')
  const [platform, setPlatform] = useState('instagram')
  const [tone, setTone] = useState('Trendy')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [selected, setSelected] = useState('medium')

  const generate = async () => {
    if (!productName) return
    setLoading(true)
    try {
      const data = await optimizedAPI.post('/content/generate-caption', { productName, productDesc, platform, tone })
      if (data?.success) setResult(data.data)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-text flex items-center gap-2"><Zap size={18} className="text-accent" /> AI Caption Generator</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text"><X size={20} /></button>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="col-span-2">
            <input value={productName} onChange={e => setProductName(e.target.value)} placeholder="Product name *" className="w-full bg-background border border-border rounded-lg py-2.5 px-4 text-sm focus:outline-none focus:border-accent" />
          </div>
          <div className="col-span-2">
            <textarea value={productDesc} onChange={e => setProductDesc(e.target.value)} placeholder="Product description (optional)" rows={2} className="w-full bg-background border border-border rounded-lg py-2.5 px-4 text-sm focus:outline-none focus:border-accent resize-none" />
          </div>
          <select value={platform} onChange={e => setPlatform(e.target.value)} className="bg-background border border-border rounded-lg py-2.5 px-3 text-sm focus:outline-none focus:border-accent">
            <option value="instagram">Instagram</option>
            <option value="facebook">Facebook</option>
          </select>
          <select value={tone} onChange={e => setTone(e.target.value)} className="bg-background border border-border rounded-lg py-2.5 px-3 text-sm focus:outline-none focus:border-accent">
            {TONES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <button onClick={generate} disabled={!productName || loading} className="btn-primary w-full mb-5 flex items-center justify-center gap-2">
          {loading ? <><Loader size={16} className="animate-spin" /> Generating...</> : <><Zap size={16} /> Generate Caption</>}
        </button>

        {result && (
          <div className="space-y-3">
            {['short', 'medium', 'long'].map(len => {
              const labels = { short: 'Short (Story)', medium: 'Medium (Post)', long: 'Long' }
              return (
                <div key={len} onClick={() => setSelected(len)} className={`p-3 rounded-xl border cursor-pointer transition-all ${selected === len ? 'border-accent bg-accent/5' : 'border-border bg-background hover:border-accent/50'}`}>
                  <p className="text-xs font-bold text-accent mb-1">{labels[len]}</p>
                  <p className="text-sm text-text-muted whitespace-pre-wrap leading-relaxed">{result[len]}</p>
                </div>
              )
            })}

            {result.hashtags?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {result.hashtags.map(h => (
                  <span key={h} className="text-xs px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20">#{h}</span>
                ))}
              </div>
            )}

            <div className="flex gap-3 mt-4">
              <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
              <button
                onClick={() => onSelect({ caption: result[selected], hashtags: result.hashtags || [] })}
                className="btn-primary flex-1"
              >
                Use this Caption
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Content Create/Edit Modal ─────────────────────────────────────────────────
function ContentModal({ item, bestTimes, onClose, onSave }) {
  const [form, setForm] = useState({
    platform: item?.platform || 'instagram',
    type: item?.type || 'post',
    caption: item?.caption || '',
    hashtags: item?.hashtags || [],
    mediaUrls: item?.mediaUrls || [],
    scheduledAt: item?.scheduledAt ? format(new Date(item.scheduledAt), "yyyy-MM-dd'T'HH:mm") : '',
    notes: item?.notes || ''
  })
  const [hashInput, setHashInput] = useState('')
  const [mediaInput, setMediaInput] = useState('')
  const [showAIGen, setShowAIGen] = useState(false)
  const [saving, setSaving] = useState(false)

  const charCount = form.caption.length
  const maxChars = form.platform === 'instagram' ? 2200 : 63206

  const addHashtag = (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && hashInput.trim()) {
      e.preventDefault()
      const tag = hashInput.trim().replace(/^#/, '')
      if (tag && !form.hashtags.includes(tag)) {
        setForm(f => ({ ...f, hashtags: [...f.hashtags, tag] }))
      }
      setHashInput('')
    }
  }

  const addMedia = () => {
    if (mediaInput.trim()) {
      setForm(f => ({ ...f, mediaUrls: [...f.mediaUrls, mediaInput.trim()] }))
      setMediaInput('')
    }
  }

  const handleSave = async (status) => {
    setSaving(true)
    try {
      await onSave({ ...form, status, scheduledAt: form.scheduledAt || null })
    } finally { setSaving(false) }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
        <div className="bg-surface border border-border rounded-2xl w-full max-w-xl p-6 shadow-2xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-bold text-text flex items-center gap-2"><Plus size={18} className="text-accent" /> {item ? 'Edit Content' : 'New Content'}</h3>
            <button onClick={onClose}><X size={20} className="text-text-muted" /></button>
          </div>

          {/* Platform + Type */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="flex gap-2">
              {Object.entries(PLATFORMS).map(([k, v]) => {
                const Icon = v.icon
                return (
                  <button key={k} onClick={() => setForm(f => ({ ...f, platform: k }))} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border text-xs font-bold transition-all ${form.platform === k ? `${v.light} ${v.color}` : 'border-border text-text-muted hover:border-accent'}`}>
                    <Icon size={14} /> {v.label}
                  </button>
                )
              })}
            </div>
            <div className="flex gap-1">
              {CONTENT_TYPES.map(t => {
                const Icon = t.icon
                return (
                  <button key={t.value} onClick={() => setForm(f => ({ ...f, type: t.value }))} title={t.label} className={`flex-1 flex items-center justify-center py-2 rounded-lg border text-xs transition-all ${form.type === t.value ? 'border-accent bg-accent/10 text-accent' : 'border-border text-text-muted hover:border-accent'}`}>
                    <Icon size={14} />
                  </button>
                )
              })}
            </div>
          </div>

          {/* Media URLs */}
          <div className="mb-4">
            <label className="text-xs text-text-muted mb-1.5 flex items-center gap-1"><Image size={12}/> Image / Video URL</label>
            <div className="flex gap-2">
              <input value={mediaInput} onChange={e => setMediaInput(e.target.value)} placeholder="https://..." className="flex-1 bg-background border border-border rounded-lg py-2 px-3 text-sm focus:outline-none focus:border-accent" onKeyDown={e => e.key === 'Enter' && addMedia()} />
              <button onClick={addMedia} className="btn-secondary text-xs px-3">Add</button>
            </div>
            {form.mediaUrls.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {form.mediaUrls.map((url, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-xs bg-background border border-border rounded px-2 py-1 text-text-muted">
                    <Image size={10} /> {url.split('/').pop().slice(0, 20)}
                    <button onClick={() => setForm(f => ({ ...f, mediaUrls: f.mediaUrls.filter((_, j) => j !== i) }))}><X size={10} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Caption */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-text-muted flex items-center gap-1"><AlignLeft size={12}/> Caption</label>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] ${charCount > maxChars ? 'text-red-500' : 'text-text-muted'}`}>{charCount}/{maxChars}</span>
                <button onClick={() => setShowAIGen(true)} className="flex items-center gap-1 text-[11px] font-bold text-accent hover:text-accent/80">
                  <Zap size={11} /> Generate with AI
                </button>
              </div>
            </div>
            <textarea
              value={form.caption}
              onChange={e => setForm(f => ({ ...f, caption: e.target.value }))}
              rows={5}
              placeholder="Write caption here..."
              className="w-full bg-background border border-border rounded-lg py-2.5 px-4 text-sm focus:outline-none focus:border-accent resize-none"
            />
          </div>

          {/* Hashtags */}
          <div className="mb-4">
            <label className="text-xs text-text-muted mb-1.5 flex items-center gap-1"><Hash size={12}/> Hashtags (press Enter or Space to add)</label>
            <input
              value={hashInput}
              onChange={e => setHashInput(e.target.value)}
              onKeyDown={addHashtag}
              placeholder="Type a hashtag..."
              className="w-full bg-background border border-border rounded-lg py-2 px-3 text-sm focus:outline-none focus:border-accent mb-2"
            />
            <div className="flex flex-wrap gap-1.5">
              {form.hashtags.map(h => (
                <span key={h} className="flex items-center gap-1 text-xs bg-accent/10 text-accent border border-accent/20 px-2 py-0.5 rounded-full">
                  #{h} <button onClick={() => setForm(f => ({ ...f, hashtags: f.hashtags.filter(x => x !== h) }))}><X size={10} /></button>
                </span>
              ))}
            </div>
          </div>

          {/* Schedule */}
          <div className="mb-6">
            <label className="text-xs text-text-muted mb-1.5 flex items-center gap-1"><Clock size={12}/> Publish Time</label>
            <input type="datetime-local" value={form.scheduledAt} onChange={e => setForm(f => ({ ...f, scheduledAt: e.target.value }))} className="w-full bg-background border border-border rounded-lg py-2.5 px-4 text-sm focus:outline-none focus:border-accent" />
            {bestTimes?.length > 0 && (
              <div className="flex gap-2 mt-2">
                <span className="text-[10px] text-text-muted">Best times:</span>
                {bestTimes.slice(0,3).map(t => (
                  <button key={t.hour} onClick={() => {
                    const d = new Date(); d.setHours(t.hour, 0, 0, 0)
                    setForm(f => ({ ...f, scheduledAt: format(d, "yyyy-MM-dd'T'HH:mm") }))
                  }} className="text-[10px] text-accent border border-accent/30 px-2 py-0.5 rounded hover:bg-accent/10">
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <button onClick={() => handleSave('draft')} disabled={saving} className="btn-secondary flex-1 text-sm">Save Draft</button>
            {form.scheduledAt && (
              <button onClick={() => handleSave('scheduled')} disabled={saving} className="flex-1 text-sm py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white font-bold flex items-center justify-center gap-1.5">
                <Clock size={14} /> Schedule
              </button>
            )}
            <button onClick={() => handleSave('publish')} disabled={saving} className="btn-primary flex-1 text-sm flex items-center justify-center gap-1.5">
              {saving ? <Loader size={14} className="animate-spin" /> : <Send size={14} />} Publish Now
            </button>
          </div>
        </div>
      </div>

      {showAIGen && (
        <CaptionGenerator
          onClose={() => setShowAIGen(false)}
          onSelect={({ caption, hashtags }) => {
            setForm(f => ({ ...f, caption, hashtags: [...new Set([...f.hashtags, ...hashtags])] }))
            setShowAIGen(false)
          }}
        />
      )}
    </>
  )
}

// ── Main Content Page ─────────────────────────────────────────────────────────
export default function ContentPage() {
  const [view, setView] = useState('calendar') // 'calendar' | 'list' | 'analytics'
  const [currentDate, setCurrentDate] = useState(new Date())
  const [content, setContent] = useState([])
  const [analytics, setAnalytics] = useState(null)
  const [bestTimes, setBestTimes] = useState([])
  const [weeklyIdeas, setWeeklyIdeas] = useState([])
  const [loadingIdeas, setLoadingIdeas] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [platformFilter, setPlatformFilter] = useState('all')
  const [statsCard, setStatsCard] = useState(null)

  // Fetch content for current month
  useEffect(() => {
    fetchContent()
  }, [currentDate, platformFilter])

  useEffect(() => {
    if (view === 'analytics') fetchAnalytics()
  }, [view])

  useEffect(() => {
    fetchBestTimes()
  }, [])

  const fetchContent = async () => {
    try {
      const params = {
        month: currentDate.getMonth(),
        year: currentDate.getFullYear(),
      }
      if (platformFilter !== 'all') params.platform = platformFilter
      const data = await optimizedAPI.get('/content', { params }, true, 300000)
      if (data?.success) setContent(data.data)
    } catch {}
  }

  const fetchAnalytics = async () => {
    try {
      const data = await optimizedAPI.get('/content/analytics', {}, true, 300000)
      if (data?.success) {
        setAnalytics(data)
        setStatsCard(data.stats)
      }
    } catch {}
  }

  const fetchBestTimes = async () => {
    try {
      const data = await optimizedAPI.get('/content/best-times', {}, true, 300000)
      if (data?.success) setBestTimes(data.data)
    } catch {}
  }

  const fetchWeeklyIdeas = async () => {
    setLoadingIdeas(true)
    try {
      const data = await optimizedAPI.post('/content/suggest-ideas')
      if (data?.success) setWeeklyIdeas(data.data)
    } catch {} finally { setLoadingIdeas(false) }
  }

  const saveContent = async (form) => {
    try {
      if (editItem) {
        const shouldPublish = form.status === 'publish'
        if (shouldPublish) {
          await optimizedAPI.put(`/content/${editItem.id}`, { ...form, status: 'draft' })
          await optimizedAPI.post(`/content/${editItem.id}/publish`)
        } else {
          await optimizedAPI.put(`/content/${editItem.id}`, form)
        }
      } else {
        const data = await optimizedAPI.post('/content', { ...form, status: form.status === 'publish' ? 'draft' : form.status })
        if (form.status === 'publish' && data?.data?.id) {
          await optimizedAPI.post(`/content/${data.data.id}/publish`)
        }
      }
      setShowModal(false)
      setEditItem(null)
      fetchContent()
    } catch (err) { console.error(err) }
  }

  const deleteContent = async (id) => {
    if (!confirm('Are you sure you want to delete this content?')) return
    await optimizedAPI.delete(`/content/${id}`)
    fetchContent()
  }

  // Build calendar grid
  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd })
  const startDayIndex = getDay(monthStart) // 0=Sun

  const getContentForDay = (day) => content.filter(c => {
    const d = c.scheduledAt || c.publishedAt || c.createdAt
    return d && isSameDay(new Date(d), day)
  })

  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  return (
    <div className="page-container flex gap-5">
      {/* Main Area */}
      <div className="flex-1 min-w-0 space-y-5">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
              <BookOpen size={20} className="text-purple-400" />
            </div>
            <div>
              <h1 className="section-title">Content Management</h1>
              <p className="section-subtitle">Publishing schedule & calendar</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg overflow-hidden border border-border text-sm">
              <button onClick={() => setView('calendar')} className={`px-3 py-1.5 flex items-center gap-1.5 ${view==='calendar'?'bg-accent text-white':'bg-background text-text-muted hover:bg-surface'}`}><Calendar size={14}/> Calendar</button>
              <button onClick={() => setView('list')} className={`px-3 py-1.5 flex items-center gap-1.5 ${view==='list'?'bg-accent text-white':'bg-background text-text-muted hover:bg-surface'}`}><List size={14}/> List</button>
              <button onClick={() => setView('analytics')} className={`px-3 py-1.5 flex items-center gap-1.5 ${view==='analytics'?'bg-accent text-white':'bg-background text-text-muted hover:bg-surface'}`}><BarChart2 size={14}/> Analytics</button>
            </div>
            <div className="flex gap-1">
              {['all','instagram','facebook'].map(p => (
                <button key={p} onClick={() => setPlatformFilter(p)} className={`px-3 py-1.5 text-xs rounded-lg border transition-all ${platformFilter===p?'bg-accent text-white border-accent':'border-border text-text-muted hover:border-accent'}`}>
                  {p === 'all' ? 'All' : PLATFORMS[p]?.label}
                </button>
              ))}
            </div>
            <button onClick={() => { setEditItem(null); setShowModal(true) }} className="btn-primary flex items-center gap-2">
              <Plus size={16} /> New Content
            </button>
          </div>
        </div>

        {/* Stats mini row */}
        {statsCard && (
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Total', value: statsCard.total, color: 'text-text' },
              { label: 'Published', value: statsCard.published, color: 'text-emerald-500' },
              { label: 'Scheduled', value: statsCard.scheduled, color: 'text-blue-500' },
              { label: 'This Week', value: statsCard.publishedThisWeek, color: 'text-purple-400' }
            ].map(s => (
              <div key={s.label} className="card p-3 text-center">
                <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-text-muted mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── Calendar View ── */}
        {view === 'calendar' && (
          <div className="card p-4">
            {/* Month Nav */}
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => setCurrentDate(d => subMonths(d, 1))} className="w-8 h-8 rounded-lg border border-border flex items-center justify-center hover:border-accent hover:text-accent">
                <ChevronRight size={16} />
              </button>
              <h2 className="font-bold text-text text-lg">{format(currentDate, 'MMMM yyyy', { locale: enUS })}</h2>
              <button onClick={() => setCurrentDate(d => addMonths(d, 1))} className="w-8 h-8 rounded-lg border border-border flex items-center justify-center hover:border-accent hover:text-accent">
                <ChevronLeft size={16} />
              </button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 mb-2">
              {DAY_NAMES.map(d => (
                <div key={d} className="text-center text-xs font-bold text-text-muted py-1">{d}</div>
              ))}
            </div>

            {/* Days grid */}
            <div className="grid grid-cols-7 gap-1">
              {Array(startDayIndex).fill(null).map((_, i) => <div key={`e-${i}`} />)}
              {daysInMonth.map(day => {
                const dayContent = getContentForDay(day)
                const isCurrentDay = isToday(day)
                return (
                  <div key={day.toString()} className={`min-h-[80px] p-1.5 rounded-lg border transition-colors cursor-pointer hover:border-accent/50 ${isCurrentDay ? 'border-accent bg-accent/5' : 'border-border/50 hover:bg-surface/50'}`}
                    onClick={() => { setEditItem(null); setShowModal(true) }}>
                    <p className={`text-xs font-bold mb-1 ${isCurrentDay ? 'text-accent' : 'text-text-muted'}`}>{format(day, 'd')}</p>
                    <div className="space-y-0.5">
                      {dayContent.slice(0,3).map(c => (
                        <div key={c.id} onClick={e => { e.stopPropagation(); setEditItem(c); setShowModal(true) }} className={`w-full flex items-center gap-1 px-1 py-0.5 rounded text-[9px] font-bold text-white truncate ${PLATFORMS[c.platform]?.bg || 'bg-gray-500'}`}>
                          <div className={`w-1.5 h-1.5 rounded-full ${STATUS_COLORS[c.status]} shrink-0`}></div>
                          {c.caption?.slice(0, 12) || c.type}
                        </div>
                      ))}
                      {dayContent.length > 3 && <p className="text-[9px] text-text-muted px-1">+{dayContent.length - 3}</p>}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Legend */}
            <div className="flex gap-4 mt-4 pt-3 border-t border-border">
              {Object.entries(STATUS_COLORS).map(([status, color]) => (
                <div key={status} className="flex items-center gap-1.5 text-xs text-text-muted">
                  <div className={`w-2 h-2 rounded-full ${color}`}></div> {STATUS_LABELS[status]}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── List View ── */}
        {view === 'list' && (
          <div className="card overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-surface/50 border-b border-border text-text-muted">
                <tr>
                  <th className="py-3 px-4 font-medium">Content</th>
                  <th className="py-3 px-4 font-medium">Platform</th>
                  <th className="py-3 px-4 font-medium">Type</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium">Publish Time</th>
                  <th className="py-3 px-4 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {content.length === 0 ? (
                  <tr><td colSpan={6} className="py-10 text-center text-text-muted">No content yet</td></tr>
                ) : content.map(c => {
                  const P = PLATFORMS[c.platform]
                  const Icon = P?.icon || Calendar
                  return (
                    <tr key={c.id} className="hover:bg-surface/50 transition-colors">
                      <td className="py-3 px-4">
                        <p className="font-medium text-text truncate max-w-xs">{c.caption?.slice(0,60) || '(No caption)'}</p>
                        {c.hashtags?.length > 0 && <p className="text-[11px] text-text-muted mt-0.5">#{c.hashtags.slice(0,3).join(' #')}</p>}
                      </td>
                      <td className="py-3 px-4"><span className={`flex items-center gap-1.5 ${P?.color}`}><Icon size={14}/>{P?.label}</span></td>
                      <td className="py-3 px-4 capitalize text-text-muted">{c.type}</td>
                      <td className="py-3 px-4"><span className={`px-2 py-0.5 rounded-full text-[11px] font-bold text-white ${STATUS_COLORS[c.status]}`}>{STATUS_LABELS[c.status]}</span></td>
                      <td className="py-3 px-4 text-text-muted text-xs">{c.scheduledAt ? format(new Date(c.scheduledAt), 'dd/MM HH:mm') : c.publishedAt ? format(new Date(c.publishedAt), 'dd/MM HH:mm') : '—'}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <button onClick={() => { setEditItem(c); setShowModal(true) }} className="text-text-muted hover:text-accent"><Eye size={15}/></button>
                          {c.status !== 'published' && <button onClick={() => optimizedAPI.post(`/content/${c.id}/publish`).then(fetchContent)} className="text-text-muted hover:text-emerald-500"><Send size={15}/></button>}
                          <button onClick={() => deleteContent(c.id)} className="text-text-muted hover:text-red-500"><Trash2 size={15}/></button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Analytics View ── */}
        {view === 'analytics' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {/* Top Posts */}
              <div className="card p-5">
                <h3 className="font-bold text-text mb-4 flex items-center gap-2"><Star size={16} className="text-yellow-500"/> Top 5 Performing Posts</h3>
                <div className="space-y-3">
                  {analytics?.topPosts?.length > 0 ? analytics.topPosts.map((p, i) => (
                    <div key={p.id} className="flex items-center gap-3">
                      <span className="text-xs font-bold text-text-muted w-4">{i+1}</span>
                      <div className="flex-1">
                        <p className="text-xs text-text truncate">{p.caption || '(reel/video)'}</p>
                        <div className="flex gap-3 mt-0.5 text-[10px] text-text-muted">
                          <span>❤️ {p.likes}</span><span>💬 {p.comments}</span><span>🔖 {p.saves}</span>
                        </div>
                      </div>
                      <span className="text-xs font-bold text-accent">{p.engagement}</span>
                    </div>
                  )) : <p className="text-sm text-text-muted text-center py-4">Connect your Instagram account to see data</p>}
                </div>
              </div>

              {/* Best times */}
              <div className="card p-5">
                <h3 className="font-bold text-text mb-4 flex items-center gap-2"><Clock size={16} className="text-blue-400"/> Best Publishing Times</h3>
                <div className="space-y-3">
                  {bestTimes.length > 0 ? bestTimes.map((t, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-background rounded-lg border border-border">
                      <span className="font-bold text-text">{t.label}</span>
                      <span className="text-xs text-text-muted">{t.reason}</span>
                    </div>
                  )) : [
                    { label: '7:00 PM', reason: 'Evening peak' },
                    { label: '9:00 AM', reason: 'Start of day' },
                    { label: '9:00 PM', reason: 'Leisure time' }
                  ].map((t, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-background rounded-lg border border-border">
                      <span className="font-bold text-text">{t.label}</span>
                      <span className="text-xs text-text-muted">{t.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Right Sidebar — Content Agent */}
      <div className="w-[280px] shrink-0 space-y-4">
        <div className="card p-4 bg-gradient-to-br from-purple-500/10 to-transparent border-purple-500/20">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400"><Zap size={16}/></div>
            <h3 className="font-bold text-text text-sm">Content Agent</h3>
          </div>

          {/* Best Times */}
          <div className="mb-4">
            <p className="text-xs font-bold text-text-muted mb-2 uppercase tracking-wide">⏰ Best Times Today</p>
            <div className="space-y-1.5">
              {(bestTimes.slice(0,3).length > 0 ? bestTimes.slice(0,3) : [
                { label: '7:00 PM' }, { label: '9:00 AM' }, { label: '9:00 PM' }
              ]).map((t, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="w-5 h-5 rounded-full bg-purple-500/20 text-purple-400 text-[10px] font-bold flex items-center justify-center">{i+1}</span>
                  <span className="text-text font-medium">{t.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Weekly Ideas */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-text-muted uppercase tracking-wide">💡 Weekly Ideas</p>
              <button onClick={fetchWeeklyIdeas} disabled={loadingIdeas} className="text-[10px] text-accent hover:text-accent/80 flex items-center gap-1">
                {loadingIdeas ? <Loader size={10} className="animate-spin" /> : <Zap size={10} />} {loadingIdeas ? 'Loading...' : 'Generate'}
              </button>
            </div>
            <div className="space-y-2">
              {weeklyIdeas.length > 0 ? weeklyIdeas.map((idea, i) => (
                <div key={i} className="bg-surface/80 p-2.5 rounded-lg border border-border">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold text-purple-400">{idea.day}</span>
                    <span className="text-[9px] text-text-muted uppercase">{idea.type} · {idea.bestTime}</span>
                  </div>
                  <p className="text-xs text-text-muted leading-relaxed">{idea.idea}</p>
                </div>
              )) : (
                <div className="text-center py-4">
                  <p className="text-xs text-text-muted mb-2">Click "Generate" to get weekly content ideas</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {showModal && (
        <ContentModal
          item={editItem}
          bestTimes={bestTimes}
          onClose={() => { setShowModal(false); setEditItem(null) }}
          onSave={saveContent}
        />
      )}
    </div>
  )
}
