import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  MessageSquare, Search, Instagram, Phone, Mail, Star, Clock,
  CheckCheck, Check, Send, Paperclip, ChevronDown, X, Megaphone,
  Plus, UserCheck, Tag, ExternalLink, ShoppingBag, MessageCircle,
  RefreshCcw, AlertCircle, Zap
} from 'lucide-react'
import optimizedAPI from '../services/optimizedAPI'
import { useDebounce } from '../hooks/useDebounce'
import { requestDeduplicator } from '../utils/performance'
import { formatDistanceToNow, format } from 'date-fns'
import { enUS } from 'date-fns/locale'

// ── Platform config ──────────────────────────────────────────────────────────
const PLATFORMS = {
  instagram: { label: 'Instagram', icon: Instagram, color: 'text-pink-500', bg: 'bg-pink-500/10', border: 'border-pink-500/20', bubble: 'bg-pink-500/10 border-pink-500/10' },
  facebook:  { label: 'Facebook',  icon: MessageSquare, color: 'text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-500/20', bubble: 'bg-blue-500/10 border-blue-500/10' },
  whatsapp:  { label: 'WhatsApp',  icon: Phone, color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', bubble: 'bg-emerald-500/10 border-emerald-500/10' },
  gmail:     { label: 'Gmail',     icon: Mail, color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/20', bubble: 'bg-red-500/10 border-red-500/10' }
}

const INTENT_BADGES = {
  inquiry:   { label: 'Inquiry',   cls: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  purchase:  { label: 'Purchase',  cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  complaint: { label: 'Complaint', cls: 'bg-red-500/10 text-red-400 border-red-500/20' },
  support:   { label: 'Support',   cls: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
  general:   { label: 'General',   cls: 'bg-gray-500/10 text-gray-400 border-gray-500/20' }
}

const QUICK_TEMPLATES = [
  { label: 'Welcome',   text: 'Welcome! 😊 Thank you for reaching out to palstyle48. How can I help you?' },
  { label: 'Thanks',    text: 'Thank you so much for your trust! 🙏 We\'re always happy to serve you.' },
  { label: 'Follow-up', text: 'Hi! 👋 Just following up — did you need any further assistance?' },
  { label: 'Shipping',  text: 'Your order is on its way and you\'ll receive a tracking number within 24 hours. 📦' },
  { label: 'Offer',     text: 'Special deal for you! 🎁 Buy 2 items and get 10% off automatically.' },
]

// ── Campaign Modal ────────────────────────────────────────────────────────────
function CampaignModal({ onClose, onSave }) {
  const [form, setForm] = useState({ name: '', platform: 'whatsapp', targetSegment: 'all', content: '', scheduledAt: '' })
  const [generatingAI, setGeneratingAI] = useState(false)

  const generateContent = async () => {
    setGeneratingAI(true)
    try {
      const res = await optimizedAPI.post('/agents/generate-campaign-text', { segment: form.targetSegment, platform: form.platform })
      if (res?.data?.text) setForm(f => ({ ...f, content: res.data.text }))
    } catch {
      setForm(f => ({ ...f, content: `Dear customer! 🎉 We have amazing offers waiting for you this week. Visit our store now!` }))
    } finally { setGeneratingAI(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-surface border border-border rounded-2xl w-full max-w-lg p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-text flex items-center gap-2"><Megaphone size={20} className="text-accent" /> New Message Campaign</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text"><X size={20} /></button>
        </div>

        <div className="space-y-4">
          <input value={form.name} onChange={e => setForm(f=>({...f, name: e.target.value}))} placeholder="Campaign name" className="w-full bg-background border border-border rounded-lg py-2.5 px-4 text-sm focus:outline-none focus:border-accent" />

          <div className="grid grid-cols-2 gap-3">
            <select value={form.platform} onChange={e => setForm(f=>({...f, platform: e.target.value}))} className="bg-background border border-border rounded-lg py-2.5 px-3 text-sm focus:outline-none focus:border-accent">
              <option value="whatsapp">WhatsApp</option>
              <option value="instagram">Instagram DM</option>
              <option value="gmail">Email</option>
            </select>
            <select value={form.targetSegment} onChange={e => setForm(f=>({...f, targetSegment: e.target.value}))} className="bg-background border border-border rounded-lg py-2.5 px-3 text-sm focus:outline-none focus:border-accent">
              <option value="all">All Customers</option>
              <option value="vip">VIP Only</option>
              <option value="active">Active</option>
              <option value="idle">Idle</option>
              <option value="lost">Lost</option>
              <option value="new">New</option>
            </select>
          </div>

          <div className="relative">
            <textarea
              value={form.content}
              onChange={e => setForm(f=>({...f, content: e.target.value}))}
              placeholder="Message content..."
              rows={4}
              className="w-full bg-background border border-border rounded-lg py-2.5 px-4 text-sm focus:outline-none focus:border-accent resize-none"
            />
            <button onClick={generateContent} disabled={generatingAI} className="absolute bottom-2 left-2 text-xs font-bold flex items-center gap-1 text-accent hover:text-accent/80">
              <Zap size={12} className={generatingAI ? 'animate-pulse' : ''} />
              {generatingAI ? 'Generating...' : 'Generate with AI'}
            </button>
          </div>

          <input type="datetime-local" value={form.scheduledAt} onChange={e => setForm(f=>({...f, scheduledAt: e.target.value}))} className="w-full bg-background border border-border rounded-lg py-2.5 px-4 text-sm focus:outline-none focus:border-accent" />
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={() => onSave(form)} className="btn-primary flex-1">
            {form.scheduledAt ? 'Schedule Campaign' : 'Send Now'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Inbox Component ──────────────────────────────────────────────────────
export default function InboxPage() {
  const navigate = useNavigate()
  const messagesEndRef = useRef(null)

  const [activeTab, setActiveTab] = useState('inbox') // 'inbox' | 'campaigns'
  const [stats, setStats] = useState(null)
  const [messages, setMessages] = useState([])
  const [campaigns, setCampaigns] = useState([])
  const [selectedMsg, setSelectedMsg] = useState(null)
  const [customerDetail, setCustomerDetail] = useState(null)

  const [platformFilter, setPlatformFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('unread')
  const [search, setSearch] = useState('')
  const [replyText, setReplyText] = useState('')
  const [showTemplates, setShowTemplates] = useState(false)
  const [showCampaignModal, setShowCampaignModal] = useState(false)
  const [sending, setSending] = useState(false)
  const [approvingId, setApprovingId] = useState(null)
  const [editingAgent, setEditingAgent] = useState(false)
  const [editedAgentText, setEditedAgentText] = useState('')

  // Debounce search
  const debouncedSearch = useDebounce(search, 300)

  // Fetch stats + messages with request deduplication
  useEffect(() => {
    const loadData = async () => {
      try {
        return requestDeduplicator.deduplicate(`inbox-${platformFilter}-${statusFilter}`, async () => {
          const params = { limit: 50 }
          if (platformFilter !== 'all') params.platform = platformFilter
          if (statusFilter !== 'all') params.status = statusFilter
          
          const [statsRes, messagesRes] = await Promise.all([
            optimizedAPI.get('/inbox/stats', {}, true, 300000),
            optimizedAPI.get('/inbox', { params }, true, 300000)
          ])
          
          if (statsRes?.success) setStats(statsRes.stats)
          if (messagesRes?.success) setMessages(messagesRes.data)
        })
      } catch (err) {
        console.error('Load error:', err)
      }
    }
    
    loadData()
  }, [platformFilter, statusFilter])

  useEffect(() => {
    if (activeTab === 'campaigns') {
      const loadCampaigns = async () => {
        try {
          const data = await optimizedAPI.get('/campaigns', {}, true, 300000)
          if (data?.success) setCampaigns(data.data)
        } catch (err) {
          console.error('Load campaigns error:', err)
        }
      }
      loadCampaigns()
    }
  }, [activeTab])

  const openMessage = async (msg) => {
    setSelectedMsg(msg)
    setEditingAgent(false)
    setEditedAgentText(msg.agentResponse || '')
    setReplyText('')

    // Load customer details if linked
    if (msg.customer?.id) {
      try {
        const data = await optimizedAPI.get(`/customers/${msg.customer.id}`, {}, true, 300000)
        if (data?.success) setCustomerDetail(data.data)
      } catch {}
    } else {
      setCustomerDetail(null)
    }

    // Mark as read
    if (msg.status === 'unread') {
      await optimizedAPI.put(`/inbox/${msg.id}/status`, { status: 'read' })
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, status: 'read' } : m))
      setSelectedMsg({ ...msg, status: 'read' })
    }
  }

  const handleSendReply = async () => {
    if (!replyText.trim() || !selectedMsg) return
    setSending(true)
    try {
      await optimizedAPI.post(`/inbox/${selectedMsg.id}/reply`, { response: replyText })
      setMessages(prev => prev.map(m => m.id === selectedMsg.id ? { ...m, status: 'replied' } : m))
      setSelectedMsg(prev => ({ ...prev, status: 'replied' }))
      setReplyText('')
    } catch (err) {
      console.error('Reply failed:', err)
    } finally {
      setSending(false)
    }
  }

  const handleApprove = async (msgId, customText) => {
    setApprovingId(msgId)
    try {
      if (customText) {
        await optimizedAPI.post(`/inbox/${msgId}/reply`, { response: customText })
      } else {
        await optimizedAPI.post(`/inbox/${msgId}/approve`)
      }
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, status: 'replied' } : m))
      setSelectedMsg(prev => ({ ...prev, status: 'replied' }))
    } catch (err) {
      console.error('Approve failed:', err)
    } finally {
      setApprovingId(null)
    }
  }

  const saveCampaign = async (form) => {
    try {
      const res = await optimizedAPI.post('/campaigns', form)
      if (res?.data?.success) {
        setCampaigns(prev => [res.data.data, ...prev])
        setShowCampaignModal(false)
        if (!form.scheduledAt) {
          await optimizedAPI.post(`/campaigns/${res.data.data.id}/send`)
        }
      }
    } catch {}
  }

  // Memoize filtered messages with debounced search
  const filteredMessages = useMemo(() => {
    return messages.filter(m => {
      if (!debouncedSearch) return true
      const name = m.customer?.name || m.senderName || m.senderHandle || ''
      return name.toLowerCase().includes(debouncedSearch.toLowerCase()) || m.content?.toLowerCase().includes(debouncedSearch.toLowerCase())
    })
  }, [messages, debouncedSearch])

  const platform = selectedMsg ? PLATFORMS[selectedMsg.platform] : null

  return (
    <div className="flex flex-col h-screen overflow-hidden p-6 bg-[#07080a]">
      
      {/* ── Top Stats Bar: Premium Dashboard Style ────────────────────────── */}
      <div className="shrink-0 p-6 rounded-2xl border border-white/5 glass-panel relative z-10 mb-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-gold flex items-center justify-center shadow-gold-soft rotate-3">
              <MessageSquare size={24} className="text-background -rotate-3" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-text tracking-tight">Inbox</h1>
              <p className="text-sm text-text-muted mt-0.5 font-medium opacity-80">Unified conversation management • {stats?.totalUnread ?? 0} new messages</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button 
              onClick={() => { 
                requestDeduplicator.deduplicate(`inbox-${platformFilter}-${statusFilter}`, async () => {
                  const params = { limit: 50 }
                  if (platformFilter !== 'all') params.platform = platformFilter
                  if (statusFilter !== 'all') params.status = statusFilter
                  
                  const [statsRes, messagesRes] = await Promise.all([
                    optimizedAPI.get('/inbox/stats', {}, true, 0),
                    optimizedAPI.get('/inbox', { params }, true, 0)
                  ])
                  
                  if (statsRes?.success) setStats(statsRes.stats)
                  if (messagesRes?.success) setMessages(messagesRes.data)
                })
              }} 
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 hover:border-accent/40 text-text-muted hover:text-accent transition-all duration-300"
            >
              <RefreshCcw size={18} />
            </button>
            <div className="flex p-1 bg-white/5 rounded-2xl border border-white/10">
              <button 
                onClick={() => setActiveTab('inbox')} 
                className={`px-6 py-2 rounded-xl text-sm font-bold transition-all duration-300 ${activeTab === 'inbox' ? 'bg-gradient-gold text-background shadow-gold-soft' : 'text-text-muted hover:text-text'}`}
              >
                Messages
              </button>
              <button
                onClick={() => setActiveTab('campaigns')}
                className={`px-6 py-2 rounded-xl text-sm font-bold transition-all duration-300 ${activeTab === 'campaigns' ? 'bg-gradient-gold text-background shadow-gold-soft' : 'text-text-muted hover:text-text'}`}
              >
                Campaigns
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center gap-4 hover:border-blue-500/30 transition-all duration-300 group">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)] animate-pulse"></span></div>
            <div>
              <p className="text-xs text-text-muted font-bold">Unread</p>
              <p className="text-lg font-black text-text">{stats?.totalUnread ?? 0}</p>
            </div>
          </div>
          {['instagram', 'whatsapp', 'facebook', 'gmail'].map(p => {
            const P = PLATFORMS[p];
            const Icon = P.icon;
            return (
              <div key={p} className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center gap-4 hover:border-accent/30 transition-all duration-300 group">
                <div className={`w-10 h-10 rounded-xl ${P.bg} flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform`}>
                  <Icon size={18} className={P.color} />
                </div>
                <div>
                  <p className="text-xs text-text-muted font-bold capitalize">{p}</p>
                  <p className="text-lg font-black text-text">{stats?.byPlatform?.[p] ?? 0}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {activeTab === 'campaigns' ? (
        /* ── CAMPAIGNS TAB ──────────────────────────────────────────────── */
        <div className="flex-1 overflow-y-auto p-6 rounded-2xl border border-white/5">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-text">Message Campaigns</h2>
            <button onClick={() => setShowCampaignModal(true)} className="btn-primary flex items-center gap-2"><Plus size={16} /> New Campaign</button>
          </div>
          <div className="space-y-3">
            {campaigns.length === 0 ? (
              <div className="text-center py-16 text-text-muted"><Megaphone size={40} className="mx-auto mb-3 opacity-30" /><p>No campaigns yet</p></div>
            ) : campaigns.map(c => (
              <div key={c.id} className="card p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${PLATFORMS[c.platform]?.bg || 'bg-accent/10'}`}>
                    {(() => { const P = PLATFORMS[c.platform]; const Icon = P?.icon || Megaphone; return <Icon size={18} className={P?.color || 'text-accent'} /> })()}
                  </div>
                  <div>
                    <p className="font-bold text-text">{c.name}</p>
                    <p className="text-xs text-text-muted mt-0.5">Segment: {c.targetSegment} · {c.platform}</p>
                  </div>
                </div>
                <div className="flex items-center gap-6 text-sm text-text-muted">
                  <div className="text-center"><p className="font-bold text-text">{c.totalSent}</p><p className="text-xs">Sent</p></div>
                  <div className="text-center"><p className="font-bold text-emerald-500">{c.totalDelivered}</p><p className="text-xs">Delivered</p></div>
                  <div className="text-center"><p className="font-bold text-blue-500">{c.totalRead}</p><p className="text-xs">Read</p></div>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold border ${c.status === 'sent' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-400/20' : c.status === 'draft' ? 'bg-gray-500/10 text-gray-400 border-gray-400/20' : 'bg-blue-500/10 text-blue-400 border-blue-400/20'}`}>{c.status === 'sent' ? 'Sent' : c.status === 'draft' ? 'Draft' : c.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* ── INBOX TAB: 3-column layout ─────────────────────────────────── */
        <div className="flex flex-1 overflow-hidden rounded-2xl border border-white/5">

          {/* ── Col 1: Conversation List ────────────────────────────────── */}
          <div className="w-[380px] shrink-0 flex flex-col border-r border-white/5 bg-white/[0.02] backdrop-blur-xl pl-4">
            {/* Filters */}
            <div className="pr-6 py-6 space-y-4">
              <div className="relative group">
                <Search size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-accent transition-colors" />
                <input 
                  value={search} 
                  onChange={e => setSearch(e.target.value)} 
                  placeholder="Search conversations..."
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pr-12 pl-4 text-sm focus:outline-none focus:border-accent/50 focus:ring-4 focus:ring-accent/5 transition-all outline-none" 
                />
              </div>
              
              <div className="flex flex-col gap-3">
                <p className="text-[10px] font-black text-text-muted uppercase tracking-widest">Channels</p>
                <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                  {['all', 'instagram', 'whatsapp', 'facebook', 'gmail'].map(p => (
                    <button 
                      key={p} 
                      onClick={() => setPlatformFilter(p)} 
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 border ${
                        platformFilter === p 
                        ? 'bg-accent text-background border-accent shadow-gold-soft' 
                        : 'bg-white/5 border-white/10 text-text-muted hover:border-accent/40'
                      }`}
                    >
                      {p === 'all' ? 'All' : PLATFORMS[p]?.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <p className="text-[10px] font-black text-text-muted uppercase tracking-widest">Status</p>
                <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                  {[
                    {v:'all',l:'All'},
                    {v:'unread',l:'Unread'},
                    {v:'read',l:'Read'},
                    {v:'replied',l:'Replied'},
                    {v:'archived',l:'Archived'}
                  ].map(({v,l}) => (
                    <button 
                      key={v} 
                      onClick={() => setStatusFilter(v)} 
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 ${
                        statusFilter === v 
                        ? 'bg-accent/10 text-accent border border-accent/20' 
                        : 'text-text-muted hover:text-text'
                      }`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="divider opacity-30" />

            {/* List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {filteredMessages.length === 0 ? (
                <div className="text-center py-20 text-text-muted animate-fade-in">
                  <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
                    <MessageSquare size={32} className="opacity-20" />
                  </div>
                  <p className="text-sm font-medium">No messages found</p>
                </div>
              ) : (
                <div className="pr-6 py-2 space-y-1">
                  {filteredMessages.map(msg => {
                    const P = PLATFORMS[msg.platform] || PLATFORMS.gmail
                    const Icon = P.icon
                    const isSelected = selectedMsg?.id === msg.id
                    const isUnread = msg.status === 'unread'
                    const intent = INTENT_BADGES[msg.intent]
                    const isVIP = msg.customer?.segment === 'vip'

                    return (
                      <button 
                        key={msg.id} 
                        onClick={() => openMessage(msg)} 
                        className={`w-full text-left p-4 rounded-2xl flex items-start gap-4 transition-all duration-300 relative group ${
                          isSelected 
                          ? 'bg-accent/10 border border-accent/20 shadow-premium' 
                          : 'hover:bg-white/5 border border-transparent'
                        }`}
                      >
                        <div className="relative shrink-0">
                          <div className={`w-12 h-12 rounded-2xl ${P.bg} border ${P.border} flex items-center justify-center transition-transform group-hover:scale-105`}>
                            <Icon size={20} className={P.color} />
                          </div>
                          {isUnread && (
                            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-blue-500 border-2 border-[#07080a] shadow-[0_0_10px_rgba(59,130,246,0.5)]"></span>
                          )}
                        </div>

                        <div className="flex-1 min-w-0 text-left">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-bold text-text text-sm truncate flex items-center gap-2">
                              {isVIP && <Star size={12} className="text-yellow-400 fill-yellow-400 shrink-0 animate-pulse" />}
                              {msg.customer?.name || msg.senderName || msg.senderHandle || 'Unknown customer'}
                            </span>
                            <span className="text-[10px] text-text-muted shrink-0 font-medium">
                              {formatDistanceToNow(new Date(msg.createdAt), { locale: enUS, addSuffix: false })}
                            </span>
                          </div>
                          
                          <p className={`text-xs truncate ${isUnread ? 'text-text font-bold' : 'text-text-muted font-medium'}`}>
                            {msg.content}
                          </p>

                          <div className="flex items-center gap-2 mt-2">
                            {intent && (
                              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-black uppercase tracking-tighter ${intent.cls}`}>
                                {intent.label}
                              </span>
                            )}
                            {msg.agentResponse && msg.status !== 'replied' && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full border border-yellow-500/20 bg-yellow-500/10 text-yellow-500 font-black flex items-center gap-1">
                                <Zap size={10} /> Suggested
                              </span>
                            )}
                          </div>
                        </div>
                        
                        {isSelected && (
                          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-accent rounded-l-full shadow-[0_0_15px_rgba(201,165,90,0.5)]"></div>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ── Col 2: Chat View ─────────────────────────────────────────── */}
          <div className="flex-1 flex flex-col min-w-0 bg-[#0a0b0d] relative">
            {!selectedMsg ? (
              <div className="flex-1 flex flex-col items-center justify-center text-text-muted/40 animate-fade-in">
                <div className="w-24 h-24 rounded-full bg-white/5 flex items-center justify-center mb-6 border border-white/5">
                  <MessageSquare size={48} className="opacity-20" />
                </div>
                <h3 className="text-lg font-black text-text/60">Start a conversation</h3>
                <p className="text-sm font-medium mt-1">Select a conversation from the list to get started</p>
              </div>
            ) : (
              <>
                {/* Chat header */}
                <div className="shrink-0 p-6 border-b border-white/5 flex items-center justify-between glass-panel">
                  <div className="flex items-center gap-4">
                    {platform && (() => { 
                      const Icon = platform.icon; 
                      return (
                        <div className="relative">
                          <div className={`w-12 h-12 rounded-2xl ${platform.bg} border ${platform.border} flex items-center justify-center shadow-lg`}>
                            <Icon size={20} className={platform.color} />
                          </div>
                          <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-[#0a0b0d]"></span>
                        </div>
                      ) 
                    })()}
                    <div>
                      <h2 className="font-black text-text text-lg">
                        {selectedMsg.customer?.name || selectedMsg.senderName || 'Customer'}
                      </h2>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className={`text-xs font-bold uppercase tracking-widest ${platform?.color}`}>{platform?.label}</p>
                        <span className="w-1 h-1 rounded-full bg-text-muted opacity-30"></span>
                        <p className="text-[10px] text-text-muted font-bold">Active now</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    {INTENT_BADGES[selectedMsg.intent] && (
                      <span className={`text-[10px] px-3 py-1 rounded-full border font-black uppercase tracking-tighter shadow-sm ${INTENT_BADGES[selectedMsg.intent].cls}`}>
                        {INTENT_BADGES[selectedMsg.intent].label}
                      </span>
                    )}
                    <button className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-text-muted hover:text-text hover:border-white/20 transition-all">
                      <Phone size={18} />
                    </button>
                    <button className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-text-muted hover:text-text hover:border-white/20 transition-all">
                      <Star size={18} />
                    </button>
                  </div>
                </div>

                {/* Messages area */}
                <div className="flex-1 overflow-y-auto px-6 py-8 space-y-6 custom-scrollbar bg-[radial-gradient(circle_at_50%_50%,rgba(201,165,90,0.03)_0%,transparent_100%)]">
                  {/* Inbound message bubble */}
                  <div className="flex justify-start">
                    <div className="flex flex-col gap-1.5 max-w-[80%]">
                      <div className={`rounded-2xl rounded-tr-sm px-5 py-3.5 border shadow-premium ${platform?.bubble || 'bg-white/5 border-white/10'}`}>
                        <p className="text-[15px] text-text leading-relaxed font-medium">{selectedMsg.content}</p>
                      </div>
                      <p className="text-[10px] text-text-muted font-bold mr-1">{format(new Date(selectedMsg.createdAt), 'HH:mm')}</p>
                    </div>
                  </div>

                  {/* Outbound / replied message placeholder */}
                  {selectedMsg.status === 'replied' && (
                    <div className="flex justify-end">
                      <div className="flex flex-col items-end gap-1.5 max-w-[80%]">
                        <div className="rounded-2xl rounded-tl-sm bg-gradient-gold px-5 py-3.5 shadow-gold-soft">
                          <p className="text-[15px] text-background leading-relaxed font-bold">{selectedMsg.agentResponse || 'Reply sent'}</p>
                        </div>
                        <div className="flex items-center gap-1.5 ml-1">
                          <CheckCheck size={14} className="text-accent" />
                          <p className="text-[10px] text-text-muted font-bold">Sent</p>
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Agent Suggestion Box: Floating Style */}
                {selectedMsg.agentResponse && selectedMsg.status !== 'replied' && (
                  <div className="mx-6 mb-4">
                    <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/5 backdrop-blur-md p-5 shadow-2xl relative overflow-hidden group">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-500/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl"></div>
                      
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-yellow-500/20 flex items-center justify-center">
                            <Zap size={16} className="text-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.3)]" />
                          </div>
                          <span className="text-sm font-black text-yellow-500 tracking-tight">AI Agent</span>
                        </div>
                        {!editingAgent && (
                          <button onClick={() => setEditingAgent(true)} className="text-[10px] font-black uppercase text-yellow-500/60 hover:text-yellow-500 transition-colors">Edit Reply</button>
                        )}
                      </div>

                      {editingAgent ? (
                        <textarea 
                          value={editedAgentText} 
                          onChange={e => setEditedAgentText(e.target.value)} 
                          rows={3} 
                          className="w-full bg-black/40 border border-yellow-500/20 rounded-xl text-[15px] p-4 text-text focus:outline-none focus:border-yellow-500/40 resize-none transition-all" 
                        />
                      ) : (
                        <p className="text-[15px] text-text-muted leading-relaxed font-medium px-1">{selectedMsg.agentResponse}</p>
                      )}

                      <div className="flex gap-3 mt-5">
                        <button 
                          onClick={() => handleApprove(selectedMsg.id, editingAgent ? editedAgentText : null)} 
                          disabled={!!approvingId} 
                          className="flex-1 flex items-center justify-center gap-2 p-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white text-sm font-black shadow-lg shadow-emerald-500/20 transition-all active:scale-[0.98]"
                        >
                          <Check size={18} strokeWidth={3} /> Send Reply
                        </button>
                        <button 
                          onClick={() => optimizedAPI.put(`/inbox/${selectedMsg.id}/status`, { status: 'read' }).then(() => setSelectedMsg(v => ({...v, agentResponse: null})))} 
                          className="px-6 py-3 rounded-xl bg-white/5 border border-white/10 text-red-400/80 text-sm font-black hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20 transition-all"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Reply input: Premium Floating Bar */}
                <div className="shrink-0 px-6 py-4">
                  <div className="bg-white/5 border border-white/10 rounded-3xl p-3 flex items-end gap-3 focus-within:border-accent/40 focus-within:bg-white/[0.07] transition-all shadow-premium backdrop-blur-xl">
                    <div className="flex-1 min-w-0">
                      <textarea
                        value={replyText}
                        onChange={e => setReplyText(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendReply() } }}
                        placeholder="Type your message here..."
                        rows={1}
                        className="w-full bg-transparent text-[15px] py-2 px-4 text-text placeholder:text-text-muted/60 focus:outline-none resize-none max-h-32 min-h-[44px]"
                        style={{ height: 'auto' }}
                        onInput={(e) => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px' }}
                      />
                      <div className="flex items-center gap-4 px-4 pb-1">
                        <button className="text-text-muted hover:text-accent transition-all"><Paperclip size={18} /></button>
                        <div className="relative">
                          <button 
                            onClick={() => setShowTemplates(!showTemplates)} 
                            className={`flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest transition-all ${showTemplates ? 'text-accent' : 'text-text-muted hover:text-accent'}`}
                          >
                            <Zap size={14} /> Templates
                          </button>
                          {showTemplates && (
                            <div className="absolute bottom-10 right-0 bg-card border border-white/10 rounded-2xl shadow-2xl w-64 overflow-hidden z-20 animate-slidedown">
                              <div className="p-3 border-b border-white/5 bg-white/5"><p className="text-[10px] font-black text-text-muted uppercase tracking-widest">Choose a template</p></div>
                              {QUICK_TEMPLATES.map(t => (
                                <button key={t.label} onClick={() => { setReplyText(t.text); setShowTemplates(false) }} className="w-full text-left px-4 py-3 text-xs text-text-muted hover:bg-accent/10 hover:text-accent flex items-center justify-between gap-3 border-b border-white/5 last:border-0 transition-colors">
                                  <span className="font-black text-accent shrink-0">{t.label}</span> 
                                  <span className="truncate opacity-60 font-medium">{t.text}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <button 
                      onClick={handleSendReply} 
                      disabled={!replyText.trim() || sending} 
                      className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all shrink-0 shadow-lg ${
                        replyText.trim() && !sending 
                        ? 'bg-gradient-gold text-background shadow-gold-soft hover:scale-105 active:scale-[0.98]' 
                        : 'bg-white/5 text-text-muted cursor-not-allowed border border-white/5'
                      }`}
                    >
                      {sending ? <RefreshCcw size={22} className="animate-spin" /> : <Send size={22} strokeWidth={2.5} />}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* ── Col 3: Customer Panel ────────────────────────────────────── */}
          <div className="w-80 shrink-0 border-l border-white/5 overflow-y-auto bg-white/[0.01] backdrop-blur-xl custom-scrollbar">
            {!selectedMsg ? (
              <div className="flex flex-col items-center justify-center h-full text-text-muted/40 p-10 text-center">
                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                  <UserCheck size={24} className="opacity-20" />
                </div>
                <p className="text-xs font-bold uppercase tracking-widest leading-loose">Select a conversation to view the customer profile</p>
              </div>
            ) : (
              <div className="p-6 space-y-6 animate-fade-in">
                {/* Customer Profile Card */}
                <div className="relative pt-8 pb-6 flex flex-col items-center">
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-40 bg-accent/5 rounded-full blur-[60px] -z-10"></div>
                  <div className="w-24 h-24 rounded-[32px] bg-gradient-to-br from-accent to-accent-dark p-1 shadow-gold-soft rotate-3">
                    <div className="w-full h-full rounded-[28px] bg-background flex items-center justify-center text-accent font-black text-3xl -rotate-3 overflow-hidden border border-white/10">
                      {(selectedMsg.customer?.name || 'CU').slice(0,2).toUpperCase()}
                    </div>
                  </div>
                  <h3 className="font-black text-text text-xl mt-6">{selectedMsg.customer?.name || selectedMsg.senderName || 'Potential customer'}</h3>
                  <div className="flex items-center gap-2 mt-2">
                    {customerDetail?.segment && (
                      <span className={`text-[10px] px-3 py-1 rounded-full border font-black uppercase tracking-widest ${
                        customerDetail.segment === 'vip' 
                        ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20 shadow-[0_0_10px_rgba(234,179,8,0.2)]' 
                        : 'bg-blue-500/10 text-blue-400 border-blue-400/20'
                      }`}>
                        {customerDetail.segment === 'vip' ? '⭐ VIP Member' : customerDetail.segment}
                      </span>
                    )}
                  </div>
                </div>

                {/* Contact Quick Info */}
                <div className="space-y-3">
                  <p className="text-[10px] font-black text-text-muted uppercase tracking-widest">Contact Info</p>
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0"><Mail size={14} className="text-red-400" /></div>
                      <div className="min-w-0">
                        <p className="text-[10px] text-text-muted font-bold uppercase">Email</p>
                        <p className="text-sm text-text font-medium truncate">{customerDetail?.email || 'N/A'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0"><Phone size={14} className="text-emerald-400" /></div>
                      <div className="min-w-0">
                        <p className="text-[10px] text-text-muted font-bold uppercase">Phone</p>
                        <p className="text-sm text-text font-medium" dir="ltr">{customerDetail?.phone || 'N/A'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center shrink-0"><MessageCircle size={14} className="text-indigo-400" /></div>
                      <div className="min-w-0">
                        <p className="text-[10px] text-text-muted font-bold uppercase">Source</p>
                        <p className="text-sm text-text font-medium tracking-tight capitalize">{customerDetail?.source || 'Direct'}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Key Metrics */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center group hover:border-accent/30 transition-all">
                    <p className="text-2xl font-black text-text group-hover:scale-110 transition-transform">{customerDetail?.totalOrders ?? 0}</p>
                    <p className="text-[10px] text-text-muted font-black uppercase mt-1">Orders</p>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center group hover:border-emerald-500/30 transition-all">
                    <p className="text-2xl font-black text-emerald-500 group-hover:scale-110 transition-transform">${customerDetail?.totalSpent?.toFixed(0) ?? 0}</p>
                    <p className="text-[10px] text-text-muted font-black uppercase mt-1">Revenue</p>
                  </div>
                </div>

                {/* Order History */}
                {customerDetail?.orders?.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-black text-text-muted uppercase tracking-widest">Recent Orders</p>
                      <ShoppingBag size={12} className="text-text-muted" />
                    </div>
                    <div className="space-y-2">
                      {customerDetail.orders.slice(0,3).map(o => (
                        <div key={o.id} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5 hover:border-white/10 transition-all">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-accent"></div>
                            <span className="text-xs font-bold text-text uppercase tracking-tight">{o.platform}</span>
                          </div>
                          <span className="text-xs font-black text-emerald-500">${o.total}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action Shortcuts */}
                <div className="pt-4 space-y-3">
                  <button 
                    onClick={() => navigate(`/customers/${customerDetail.id}`)} 
                    disabled={!customerDetail}
                    className="w-full flex items-center justify-center gap-2 p-4 rounded-2xl bg-white/5 border border-white/10 text-text-muted text-xs font-black uppercase tracking-widest hover:bg-white/10 hover:text-text hover:border-accent/40 transition-all disabled:opacity-30"
                  >
                    <ExternalLink size={14} /> View Full Profile
                  </button>
                  <button 
                    disabled={!customerDetail}
                    className="w-full flex items-center justify-center gap-2 p-4 rounded-2xl bg-white/5 border border-white/10 text-text-muted text-xs font-black uppercase tracking-widest hover:bg-white/10 hover:text-text hover:border-accent/40 transition-all disabled:opacity-30"
                  >
                    <Tag size={14} /> Add Tag
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Campaign Modal */}
      {showCampaignModal && <CampaignModal onClose={() => setShowCampaignModal(false)} onSave={saveCampaign} />}
    </div>
  )
}
