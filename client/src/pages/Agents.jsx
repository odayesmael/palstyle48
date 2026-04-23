import { useState, useEffect } from 'react'
import optimizedAPI from '../services/optimizedAPI'
import {
  Bot, Zap, Activity, Clock, Check, Play, Loader2,
  AlertTriangle, Lightbulb, TrendingUp, XCircle, Settings, X
} from 'lucide-react'

const C = {
  bg: '#0f1117', surface: '#161921', card: '#1c1f29',
  border: '#2a2d3a', accent: '#c9a55a', text: '#e8e8ec',
  muted: '#8b8fa4', dim: '#5a5e72',
  red: '#ef4444', orange: '#f97316', yellow: '#eab308', green: '#10b981', blue: '#3b82f6',
  purple: '#8b5cf6', pink: '#ec4899'
}

const AGENT_META = {
  master:    { icon: Zap,      color: C.accent, bg: 'rgba(201,165,90,0.1)' },
  crm:       { icon: Bot,      color: C.green,  bg: 'rgba(16,185,129,0.1)' },
  inbox:     { icon: Bot,      color: C.purple, bg: 'rgba(139,92,246,0.1)' },
  content:   { icon: Bot,      color: C.blue,   bg: 'rgba(59,130,246,0.1)' },
  ads:       { icon: TrendingUp, color: C.orange, bg: 'rgba(249,115,22,0.1)' },
  finance:   { icon: Activity, color: C.purple, bg: 'rgba(139,92,246,0.1)' },
  inventory: { icon: Bot,      color: C.pink,   bg: 'rgba(236,72,153,0.1)' },
}

export default function Agents() {
  const [agents, setAgents] = useState([])
  const [recommendations, setRecommendations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  
  const [triggering, setTriggering] = useState(null) // agent name

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    try {
      setLoading(true)
      const [agentsRes, recsRes] = await Promise.all([
        optimizedAPI.get('/agents'),
        optimizedAPI.get('/agents/recommendations')
      ])
      const agentsData = agentsRes?.data || agentsRes?.agents || agentsRes || []
      const recsData = recsRes?.data || recsRes?.recommendations || recsRes || []
      setAgents(Array.isArray(agentsData) ? agentsData : [])
      setRecommendations(Array.isArray(recsData) ? recsData : [])
    } catch (err) {
      console.error(err)
      setError('Failed to load agent data')
    } finally {
      setLoading(false)
    }
  }

  async function toggleAgent(agentName, currentStatus) {
    if (agentName === 'master') return
    try {
      await optimizedAPI.put(`/agents/${agentName}`, { isActive: !currentStatus })
      fetchData()
    } catch (err) {
      console.error(err)
    }
  }

  async function triggerAgent(agentName) {
    if (triggering) return
    setTriggering(agentName)
    try {
      await optimizedAPI.post(`/agents/${agentName}/trigger`)
      await fetchData()
    } catch (err) {
      alert('Failed to run agent: ' + (err.response?.data?.message || err.message))
    } finally {
      setTriggering(null)
    }
  }

  async function handleRecommendation(id, action) {
    try {
      await optimizedAPI.post(`/agents/recommendations/${id}/${action}`)
      setRecommendations(prev => prev.filter(r => r.id !== id))
    } catch (err) {
      alert('Failed to process recommendation')
    }
  }

  if (loading && agents.length === 0) return <div style={{ color: C.muted, padding: 60, textAlign: 'center' }}>Loading AI Agents...</div>
  if (error) return <div style={{ color: C.red, padding: 60, textAlign: 'center' }}>{error}</div>

  // Normalize names
  const validAgents = agents.filter(a => a.name || a.agentName).map(a => ({...a, name: a.name || a.agentName}))
  const masterAgent = validAgents.find(a => a.name === 'master')
  const otherAgents = validAgents.filter(a => a.name !== 'master')

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1400, margin: '0 auto' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: C.text, margin: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
            <Bot size={28} color={C.accent} />
            AI Intelligence Hub
          </h1>
          <p style={{ fontSize: 14, color: C.muted, marginTop: 6 }}>Manage specialized AI agents and view actionable insights.</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24, alignItems: 'start' }}>
        
        {/* Main Content: Agents List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          
          {/* Maestro Card */}
          {masterAgent && (
            <div style={{
              background: `linear-gradient(135deg, ${C.card}, ${C.bg})`,
              border: `1px solid ${C.accent}44`,
              borderRadius: 20, padding: 24,
              boxShadow: `0 10px 30px ${C.accent}11`,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <div style={{ display: 'flex', gap: 24 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: C.green }}>{otherAgents.filter(a => a.isActive).length}/{otherAgents.length}</div>
                  <div style={{ fontSize: 11, color: C.dim, textTransform: 'uppercase', letterSpacing: 1, marginTop: 4 }}>Active</div>
                </div>
                <div style={{ width: 1, background: C.border }} />
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: C.accent }}>{(masterAgent.logs || []).length}</div>
                  <div style={{ fontSize: 11, color: C.dim, textTransform: 'uppercase', letterSpacing: 1, marginTop: 4 }}>Operations</div>
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end', marginBottom: 4 }}>
                  <h2 style={{ margin: 0, fontSize: 22, color: C.text }}>Maestro</h2>
                  <div style={{ background: C.accent, padding: 6, borderRadius: 10, color: '#000' }}><Zap size={18} /></div>
                </div>
                <p style={{ margin: 0, fontSize: 14, color: C.muted }}>Global orchestration and system optimization</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end', marginTop: 10 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.green, boxShadow: `0 0 10px ${C.green}` }} />
                  <span style={{ fontSize: 12, color: C.green, fontWeight: 600 }}>System Online</span>
                </div>
              </div>
            </div>
          )}

          {/* Specialized Agents Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
            {otherAgents.map(agent => {
              const meta = AGENT_META[agent.name] || { icon: Bot, color: C.blue, bg: C.surface }
              const isRunning = triggering === agent.name

              return (
                <div key={agent.id || agent.name} style={{
                  background: C.surface, borderRadius: 16, padding: 20,
                  border: `1px solid ${agent.isActive ? meta.color + '44' : C.border}`,
                  opacity: agent.isActive ? 1 : 0.6,
                  transition: 'all 0.3s',
                  position: 'relative', overflow: 'hidden'
                }}>
                  {/* Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ background: agent.isActive ? meta.bg : C.border, padding: 8, borderRadius: 10, color: agent.isActive ? meta.color : C.muted }}>
                        <meta.icon size={20} />
                      </div>
                      <h3 style={{ margin: 0, fontSize: 16, color: C.text, fontWeight: 600 }}>{agent.displayName}</h3>
                    </div>
                    
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button 
                        onClick={() => triggerAgent(agent.name)}
                        disabled={!agent.isActive || isRunning}
                        title="Run Agent Now"
                        style={{
                          background: isRunning ? 'transparent' : C.card, border: `1px solid ${C.border}`,
                          color: isRunning ? C.accent : C.text, borderRadius: 8, width: 32, height: 32,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: (!agent.isActive || isRunning) ? 'not-allowed' : 'pointer'
                        }}
                      >
                        {isRunning ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Play size={14} />}
                      </button>
                      <button
                        onClick={() => toggleAgent(agent.name, agent.isActive)}
                        title={agent.isActive ? 'Pause Agent' : 'Activate Agent'}
                        style={{
                          background: agent.isActive ? meta.color : C.card,
                          border: `1px solid ${agent.isActive ? meta.color : C.border}`,
                          color: agent.isActive ? '#000' : C.muted, borderRadius: 8, width: 32, height: 32,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
                        }}
                      >
                        {agent.isActive ? <Check size={16} /> : <X size={16} />}
                      </button>
                    </div>
                  </div>

                  <p style={{ margin: 0, fontSize: 13, color: C.muted, minHeight: 40, lineHeight: 1.5 }}>
                    {agent.description}
                  </p>

                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 12, color: C.dim }}>
                      {agent.recentLogs?.length > 0 
                        ? `Last run: ${new Date(agent.recentLogs[0].timestamp).toLocaleTimeString()}`
                        : 'No recent activity'}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: agent.isActive ? meta.color : C.dim, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      {agent.automationLevel}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Sidebar: Recommendations (Alerts) */}
        <div style={{ background: C.surface, borderRadius: 20, border: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', height: '100%', minHeight: 600 }}>
          <div style={{ padding: '24px 24px 16px', borderBottom: `1px solid ${C.border}` }}>
            <h3 style={{ margin: 0, fontSize: 16, color: C.text, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Lightbulb size={18} color={C.yellow} />
              AI Recommendations
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: C.muted }}>Actionable insights from your agents</p>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {recommendations.length === 0 ? (
              <div style={{ textAlign: 'center', color: C.dim, marginTop: 40 }}>
                <Check size={40} style={{ opacity: 0.2, marginBottom: 16 }} />
                <p style={{ margin: 0 }}>You're all caught up!</p>
                <p style={{ margin: '4px 0 0', fontSize: 13 }}>No new recommendations.</p>
              </div>
            ) : (
              recommendations.map(rec => {
                const isError = rec.type === 'error' || rec.severity === 'high'
                const isWarn = rec.type === 'warning' || rec.severity === 'medium'
                const color = isError ? C.red : isWarn ? C.orange : C.blue

                return (
                  <div key={rec.id} style={{ 
                    background: C.card, borderRadius: 12, border: `1px solid ${color}44`,
                    padding: 16, borderLeft: `3px solid ${color}`
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <h4 style={{ margin: 0, fontSize: 14, color: C.text, fontWeight: 600, lineHeight: 1.4 }}>{rec.title}</h4>
                      <span style={{ fontSize: 10, background: C.bg, padding: '2px 6px', borderRadius: 10, color: C.muted, textTransform: 'uppercase' }}>
                        {rec.agentName}
                      </span>
                    </div>
                    
                    <p style={{ margin: '0 0 16px 0', fontSize: 13, color: C.muted, lineHeight: 1.5, whiteSpace: 'pre-line' }}>
                      {rec.message}
                    </p>

                    <div style={{ display: 'flex', gap: 8 }}>
                      <button 
                        onClick={() => handleRecommendation(rec.id, 'apply')}
                        style={{ flex: 1, padding: '8px 0', background: `${color}22`, color: color, border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                      >
                        Apply Suggestion
                      </button>
                      <button 
                        onClick={() => handleRecommendation(rec.id, 'dismiss')}
                        style={{ width: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', color: C.muted, border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer' }}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

    </div>
  )
}
