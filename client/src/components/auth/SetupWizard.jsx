import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  User, Mail, Lock, Eye, EyeOff, ArrowLeft, ArrowRight,
  CheckCircle2, ShieldCheck, Link2, DownloadCloud, Box, AlertCircle, Sparkles
} from 'lucide-react'
import api from '../../services/api'
import useAuthStore from '../../store/authStore'

const STEPS = ['Welcome', 'Create Admin', 'Connect Platforms', 'Sync', 'Activate Agents']

// Mocks
const PLATFORMS = [
  { id: 'meta', name: 'Meta Business', icon: 'M', desc: 'Instagram, Facebook, WhatsApp', requiredScope: 'pages_manage, instagram_basic' },
  { id: 'shopify', name: 'Shopify', icon: 'S', desc: 'Connect sales and product data', requiredScope: 'read_products, read_orders' },
  { id: 'trendyol', name: 'Trendyol', icon: 'T', desc: 'Connect seller account', requiredScope: 'API Key & Secret' },
  { id: 'notion', name: 'Notion', icon: 'N', desc: 'Sync workspace databases', requiredScope: 'Internal Integration Token' },
  { id: 'canva', name: 'Canva', icon: 'C', desc: 'Ad template designs', requiredScope: 'OAuth' },
  { id: 'gmail', name: 'Gmail', icon: 'G', desc: 'Manage customer support and messages', requiredScope: 'gmail.readonly, gmail.send' }
]

const AGENTS = [
  { id: 'master', name: 'Maestro', desc: 'The main agent that manages all other agents and monitors the system.', locked: true },
  { id: 'crm', name: 'Customer Service Agent', desc: 'Responds to messages and inquiries via WhatsApp and Instagram.', locked: false },
  { id: 'ads', name: 'Ads Agent', desc: 'Launches and optimizes Meta and TikTok campaigns automatically.', locked: false },
  { id: 'content', name: 'Content Agent', desc: 'Creates and schedules posts daily.', locked: false }
]

export default function SetupWizard() {
  const [step, setStep] = useState(0)
  
  // Step 1: Admin Form
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' })
  const [showPw, setShowPw] = useState({ password: false, confirm: false })
  const [pwStrength, setPwStrength] = useState({ score: 0, text: '', color: '' })
  const [adminLoading, setAdminLoading] = useState(false)
  const [setupError, setSetupError] = useState('')

  // Step 2: Platforms
  const [linkedPlatforms, setLinkedPlatforms] = useState([])
  const [platformModals, setPlatformModals] = useState({}) // track which forms are open
  const [platformForm, setPlatformForm] = useState({})

  // Step 3: Sync
  const [syncProgress, setSyncProgress] = useState({})
  const [isSyncing, setIsSyncing] = useState(false)
  
  // Step 4: Agents
  const [agentConfig, setAgentConfig] = useState(
    AGENTS.reduce((acc, a) => ({
      ...acc,
      [a.id]: { isActive: true, level: 'semi' }
    }), {})
  )
  const [finishing, setFinishing] = useState(false)

  const login = useAuthStore((s) => s.login)
  const setNeedsSetup = useAuthStore((s) => s.setNeedsSetup)
  const navigate = useNavigate()

  // ─── Helpers ─────────────────────────────────────────────────────────────
  
  function checkPasswordStrength(pw) {
    let score = 0
    if (pw.length >= 8) score++
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++
    if (/\d/.test(pw)) score++
    if (/[^a-zA-Z\d]/.test(pw)) score++ // special char

    if (pw.length === 0) setPwStrength({ score: 0, text: '', color: 'transparent' })
    else if (score <= 1) setPwStrength({ score: 1, text: 'Weak', color: 'var(--danger)' })
    else if (score === 2) setPwStrength({ score: 2, text: 'Medium', color: 'var(--accent-light)' })
    else setPwStrength({ score: 3, text: 'Strong', color: 'var(--success)' })
  }

  // ─── Handlers ────────────────────────────────────────────────────────────

  async function handleCreateAdmin(e) {
    e.preventDefault()
    setSetupError('')
    if (form.password !== form.confirm) return setSetupError('Passwords do not match')
    if (pwStrength.score < 3) return setSetupError('Password must be strong (uppercase, lowercase, number, and 8+ characters)')

    setAdminLoading(true)
    try {
      const { data } = await api.post('/setup/create-admin', form)
      // Save token but keep needSetup=true because setup isn't complete yet
      login(data.token, data.user)
      setStep(2)
    } catch (err) {
      setSetupError(err.response?.data?.message ?? 'An error occurred')
    } finally {
      setAdminLoading(false)
    }
  }

  async function connectPlatformMock(platformId, additionalData = {}) {
    try {
      const { data } = await api.post('/setup/connect-platform', {
        platform: platformId,
        ...additionalData
      })
      setLinkedPlatforms((prev) => [...prev, platformId])
      setPlatformModals((prev) => ({ ...prev, [platformId]: false })) // close form
    } catch (err) {
      alert('Connection error')
    }
  }

  async function startSync() {
    setIsSyncing(true)
    setSyncProgress(linkedPlatforms.reduce((acc, p) => ({ ...acc, [p]: 0 }), {}))

    // Real API call to mark step done
    await api.post('/setup/initial-sync')

    // Fake progress simulation
    for (const p of linkedPlatforms) {
      for (let i = 0; i <= 100; i += 10) {
        setSyncProgress((prev) => ({ ...prev, [p]: i }))
        await new Promise(r => setTimeout(r, 100))
      }
    }
    setTimeout(() => setStep(4), 600)
  }

  async function handleFinish() {
    setFinishing(true)
    try {
      const agentsPayload = Object.keys(agentConfig).map(id => ({
        agentName: id,
        isActive: agentConfig[id].isActive,
        automationLevel: agentConfig[id].level
      }))
      await api.post('/setup/configure-agents', { agents: agentsPayload })
      setNeedsSetup(false)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      alert('An error occurred while finishing setup')
    } finally {
      setFinishing(false)
    }
  }

  // ─── Renders ─────────────────────────────────────────────────────────────

  return (
    <div className="setup-root">
      {/* ProgressBar Header */}
      {step > 0 && (
        <div className="setup-header">
          <div className="setup-progress-bar">
            {STEPS.slice(1).map((s, i) => {
              const isActive = step === i + 1
              const isPast = step > i + 1
              return (
                <div key={s} className="setup-step-item">
                  <div className={`setup-step-circle ${isActive ? 'active' : ''} ${isPast ? 'past' : ''}`}>
                    {isPast ? <CheckCircle2 size={16} /> : i + 1}
                  </div>
                  <span className={`setup-step-label ${isActive || isPast ? 'active' : ''}`}>{s}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className={`setup-card-wrap ${step === 0 ? 'centered' : ''}`}>
        
        {/* Step 0: Welcome */}
        {step === 0 && (
          <div className="setup-welcome fade-in">
            <div className="login-logo-ring" style={{ margin: '0 auto 1.5rem' }}>
              <div className="login-logo-inner"><span className="login-logo-letter">P</span></div>
            </div>
            <h1 className="text-3xl font-bold text-text mb-2 animate-slidedown">palstyle48</h1>
            <p className="text-accent tracking-widest text-sm mb-6 animate-slidedown delay-1">COMMAND CENTER</p>
            <h2 className="text-xl font-medium text-text mb-4">Welcome to the Central Management System</h2>
            <p className="text-text-muted text-sm mb-8 max-w-md mx-auto leading-relaxed">
              It looks like this is the first time the system is being launched. The setup wizard will help you configure the admin account, connect your platforms, and activate the AI agents.
            </p>
            <button className="btn-gold px-8 py-3 w-full max-w-xs text-base" onClick={() => setStep(1)}>
              Get Started
            </button>
          </div>
        )}

        {/* Step 1: Create Admin */}
        {step === 1 && (
          <div className="setup-panel fade-in">
            <div className="setup-panel-header">
              <h2>Create Admin Account</h2>
              <p>Hello! Let's start by setting up the main system account.</p>
            </div>
            
            <form onSubmit={handleCreateAdmin} className="space-y-4">
              <div className="login-field">
                <label className="login-label">Full Name</label>
                <div className="login-input-wrap">
                  <User size={15} className="login-input-icon" />
                  <input required className="login-input" placeholder="Admin name"
                    value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))} />
                </div>
              </div>

              <div className="login-field">
                <label className="login-label">Email</label>
                <div className="login-input-wrap">
                  <Mail size={15} className="login-input-icon" />
                  <input type="email" required className="login-input" placeholder="admin@palstyle48.com"
                    value={form.email} onChange={e => setForm(p => ({...p, email: e.target.value}))} />
                </div>
              </div>

              <div className="login-field">
                <label className="login-label text-left w-full flex justify-between">
                  <span>Password</span>
                  <span style={{color: pwStrength.color, fontSize:'0.75rem'}}>{pwStrength.text}</span>
                </label>
                <div className="login-input-wrap">
                  <Lock size={15} className="login-input-icon" />
                  <input required type={showPw.password ? 'text' : 'password'} className="login-input login-input-pw" placeholder="••••••••"
                    value={form.password} onChange={e => {
                      setForm(p => ({...p, password: e.target.value}))
                      checkPasswordStrength(e.target.value)
                    }} />
                  <button type="button" className="login-pw-toggle" onClick={() => setShowPw(p => ({...p, password: !p.password}))}>
                    {showPw.password ? <EyeOff size={15}/> : <Eye size={15}/>}
                  </button>
                </div>
                {/* Strength Bar */}
                <div className="flex gap-1 h-1 mt-1">
                  {[1,2,3].map(i => (
                    <div key={i} className={`flex-1 rounded-full bg-border transition-colors duration-300`} 
                         style={{ backgroundColor: pwStrength.score >= i ? pwStrength.color : 'var(--border)' }} />
                  ))}
                </div>
              </div>

              <div className="login-field">
                <label className="login-label">Confirm Password</label>
                <div className="login-input-wrap">
                  <Lock size={15} className="login-input-icon" />
                  <input required type={showPw.confirm ? 'text' : 'password'} className="login-input login-input-pw" placeholder="••••••••"
                    value={form.confirm} onChange={e => setForm(p => ({...p, confirm: e.target.value}))} />
                  <button type="button" className="login-pw-toggle" onClick={() => setShowPw(p => ({...p, confirm: !p.confirm}))}>
                    {showPw.confirm ? <EyeOff size={15}/> : <Eye size={15}/>}
                  </button>
                </div>
              </div>

              {setupError && (
                <div className="login-error"><AlertCircle size={14}/> {setupError}</div>
              )}

              <div className="pt-4 flex justify-end">
                <button type="submit" disabled={adminLoading} className="btn-gold py-2.5 px-8">
                  {adminLoading ? 'Creating...' : 'Next'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Step 2: Link Platforms */}
        {step === 2 && (
          <div className="setup-panel fade-in">
            <div className="setup-panel-header">
              <h2>Connect Platforms</h2>
              <p>Connect your business platforms to gather data in one place. You can skip some platforms and connect them later.</p>
            </div>
            
            <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-2 pb-2 custom-scrollbar">
              {PLATFORMS.map((p) => {
                const isLinked = linkedPlatforms.includes(p.id)
                const isFormOpen = platformModals[p.id]

                return (
                  <div key={p.id} className={`p-4 rounded-xl border transition-all ${isLinked ? 'bg-success/5 border-success/30' : 'bg-surface border-border hover:border-accent/30'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-lg ${isLinked ? 'bg-success/20 text-success' : 'bg-card text-text'}`}>
                          {p.icon}
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold text-text flex items-center gap-2">
                            {p.name}
                            {isLinked && <CheckCircle2 size={14} className="text-success" />}
                          </h3>
                          <p className="text-xs text-text-muted mt-0.5">{p.desc}</p>
                        </div>
                      </div>
                      
                      {!isLinked && !isFormOpen && (
                        <button className="btn-ghost text-xs py-1.5 px-3" onClick={() => setPlatformModals(m => ({ ...m, [p.id]: true }))}>
                          Connect
                        </button>
                      )}
                      {isLinked && (
                        <div className="badge-success">Connected</div>
                      )}
                    </div>

                    {/* Inline form for specific platforms if opened */}
                    {isFormOpen && !isLinked && (
                      <div className="mt-4 pt-4 border-t border-border animate-fade-in space-y-3">
                        <p className="text-xs text-text-muted"><ShieldCheck size={12} className="inline mr-1"/> Required permissions: {p.requiredScope}</p>
                        
                        {p.id === 'shopify' && (
                          <input type="text" className="input-field text-sm" placeholder="example.myshopify.com" 
                            onChange={e => setPlatformForm(f => ({ ...f, shopifyDomain: e.target.value }))} />
                        )}
                        {p.id === 'trendyol' && (
                          <div className="flex gap-2">
                            <input type="text" className="input-field text-sm" placeholder="API Key" onChange={e => setPlatformForm(f => ({ ...f, apiKey: e.target.value }))} />
                            <input type="text" className="input-field text-sm" placeholder="API Secret" onChange={e => setPlatformForm(f => ({ ...f, apiSecret: e.target.value }))} />
                          </div>
                        )}
                        {p.id === 'notion' && (
                          <input type="text" className="input-field text-sm" placeholder="Integration Token" onChange={e => setPlatformForm(f => ({ ...f, apiKey: e.target.value }))} />
                        )}
                        
                        <div className="flex gap-2 justify-end pt-2">
                          <button className="text-xs text-text-muted hover:text-text px-2" onClick={() => setPlatformModals(m => ({ ...m, [p.id]: false }))}>Cancel</button>
                          <button className="btn-gold text-xs py-1.5 px-4" onClick={() => connectPlatformMock(p.id, platformForm)}>
                            {p.id === 'meta' || p.id === 'canva' || p.id === 'gmail' ? 'Start OAuth Authorization' : 'Connect & Test'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="pt-6 flex justify-between items-center">
              <span className="text-xs text-text-muted">
                {linkedPlatforms.length === 0 ? 'At least one platform must be connected' : `${linkedPlatforms.length} platform(s) connected`}
              </span>
              <button disabled={linkedPlatforms.length === 0} className="btn-gold py-2 px-6" onClick={() => setStep(3)}>
                Next <ArrowLeft size={16}/>
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Sync */}
        {step === 3 && (
          <div className="setup-panel fade-in text-center py-6">
            <div className="w-16 h-16 rounded-full bg-accent/10 text-accent flex items-center justify-center mx-auto mb-4 animate-bounce">
              <DownloadCloud size={30} />
            </div>
            <h2 className="text-xl font-bold mb-2">Initial Sync</h2>
            <p className="text-sm text-text-muted mb-8">Pulling your historical data and learning from it to train the system...</p>

            <div className="space-y-4 text-left">
              {linkedPlatforms.map(p => {
                const plat = PLATFORMS.find(x => x.id === p)
                const prog = syncProgress[p] || 0
                return (
                  <div key={p} className="bg-surface p-3 rounded-lg border border-border">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium">{plat?.name}</span>
                      <span className="text-xs text-accent font-mono">{prog}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-card rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-gold transition-all duration-300" style={{ width: `${prog}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="pt-8">
              {!isSyncing ? (
                <button className="btn-gold px-8 w-full justify-center" onClick={startSync}>
                  Start Sync
                </button>
              ) : (
                <div className="text-sm text-text-muted animate-pulse">Please wait, this may take a few minutes...</div>
              )}
            </div>
          </div>
        )}

        {/* Step 4: Agents */}
        {step === 4 && (
          <div className="setup-panel fade-in">
            <div className="setup-panel-header">
              <h2>Activate Agents</h2>
              <p>Set the autonomy level for each agent in making decisions.</p>
            </div>

            <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2 pb-2 custom-scrollbar">
              {AGENTS.map((a) => {
                const conf = agentConfig[a.id]
                return (
                  <div key={a.id} className="p-4 rounded-xl bg-surface border border-border hover:border-accent/30 transition-colors">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="text-sm font-semibold flex items-center gap-2">
                          {a.name}
                          {a.locked && <Sparkles size={14} className="text-accent" />}
                        </h3>
                        <p className="text-xs text-text-muted mt-1">{a.desc}</p>
                      </div>
                      
                      {/* Toggle */}
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" checked={conf.isActive} disabled={a.locked}
                          onChange={(e) => setAgentConfig(prev => ({ ...prev, [a.id]: { ...prev[a.id], isActive: e.target.checked } }))} />
                        <div className="w-9 h-5 bg-card peer-focus:outline-none rounded-full peer peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-text-muted peer-checked:after:bg-background after:border-border after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-success opacity-90 disabled:cursor-not-allowed"></div>
                      </label>
                    </div>

                    {/* Automation Level */}
                    <div className={`mt-3 pt-3 border-t border-border/50 flex gap-2 transition-opacity ${!conf.isActive ? 'opacity-30 pointer-events-none' : ''}`}>
                      <button 
                        onClick={() => setAgentConfig(p => ({...p, [a.id]: {...p[a.id], level: 'manual'}}))}
                        className={`flex-1 py-1.5 rounded-md text-xs font-medium border ${conf.level === 'manual' ? 'bg-danger/10 border-danger text-danger' : 'border-border text-text-muted'}`}>
                        🔴 Manual
                      </button>
                      <button
                        onClick={() => setAgentConfig(p => ({...p, [a.id]: {...p[a.id], level: 'semi'}}))}
                        className={`flex-1 py-1.5 rounded-md text-xs font-medium border ${conf.level === 'semi' ? 'bg-accent/10 border-accent text-accent' : 'border-border text-text-muted'}`}>
                        🟡 Semi-Auto
                      </button>
                      <button
                        disabled={a.locked} // Master agent is usually fully autonomous or semi, logic goes here
                        onClick={() => !a.locked && setAgentConfig(p => ({...p, [a.id]: {...p[a.id], level: 'full'}}))}
                        className={`flex-1 py-1.5 rounded-md text-xs font-medium border ${conf.level === 'full' ? 'bg-success/10 border-success text-success' : 'border-border text-text-muted'} disabled:opacity-50`}>
                        🟢 Fully Auto
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="pt-6 flex justify-end">
              <button disabled={finishing} className="btn-gold py-3 px-8 w-full justify-center text-base shadow-gold" onClick={handleFinish}>
                {finishing ? 'Setting up...' : 'Enter Dashboard'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
