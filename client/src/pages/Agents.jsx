import { useState, useEffect } from 'react';
import optimizedAPI from '../services/optimizedAPI';

// ألوان وأيقونات لكل إيجنت
const AGENT_META = {
  master: { icon: '⚡', color: '#c9a55a', gradient: 'linear-gradient(135deg, #c9a55a, #fb923c)' },
  crm: { icon: '👥', color: '#34d399', gradient: 'linear-gradient(135deg, #34d399, #60a5fa)' },
  inbox: { icon: '💬', color: '#a78bfa', gradient: 'linear-gradient(135deg, #a78bfa, #f472b6)' },
  content: { icon: '📝', color: '#60a5fa', gradient: 'linear-gradient(135deg, #60a5fa, #818cf8)' },
  ads: { icon: '📢', color: '#fb923c', gradient: 'linear-gradient(135deg, #fb923c, #f87171)' },
  finance: { icon: '💰', color: '#a78bfa', gradient: 'linear-gradient(135deg, #a78bfa, #c084fc)' },
  inventory: { icon: '📦', color: '#f472b6', gradient: 'linear-gradient(135deg, #f472b6, #fb923c)' },
};

const AUTOMATION_LABELS = {
  full: { label: 'Fully Automated', color: '#34d399' },
  semi: { label: 'Semi-Automated', color: '#fbbf24' },
  manual: { label: 'Manual', color: '#f87171' },
};

export default function Agents() {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedAgent, setSelectedAgent] = useState(null);

  useEffect(() => {
    fetchAgents();
  }, []);

  async function fetchAgents() {
    try {
      setLoading(true);
      setError(null);
      const res = await optimizedAPI.get(`/agents`, {}, true, 300000);
      // Handle our custom struct if needed
      setAgents(res?.agents || res);
    } catch (err) {
      console.error('Failed to fetch agents:', err);
      setError(err.response?.data?.message || err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }

  async function toggleAgent(agentName, currentStatus) {
    if (agentName === 'master') return;
    try {
      await optimizedAPI.put(`/agents/${agentName}`, { isActive: !currentStatus });
      fetchAgents();
    } catch (err) {
      console.error('Failed to toggle agent:', err);
    }
  }

  async function changeAutomation(agentName, level) {
    try {
      await optimizedAPI.put(`/agents/${agentName}`, { automationLevel: level });
      fetchAgents();
    } catch (err) {
      console.error('Failed to change automation:', err);
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <div style={{ color: '#8b8fa4', fontSize: 16 }}>Loading agents...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 32 }}>
        <div style={{
          background: '#1a1d26', border: '1px solid #f8717144', borderRadius: 12,
          padding: 24, textAlign: 'center'
        }}>
          <div style={{ color: '#f87171', fontSize: 18, marginBottom: 8 }}>❌ Error loading agents</div>
          <div style={{ color: '#8b8fa4', fontSize: 14, marginBottom: 16 }}>{error}</div>
          <button onClick={fetchAgents} style={{
            background: '#c9a55a', color: '#0a0b0d', border: 'none', borderRadius: 8,
            padding: '8px 24px', cursor: 'pointer', fontWeight: 600
          }}>Try Again</button>
        </div>
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div style={{ padding: 32 }}>
        <div style={{
          background: '#1a1d26', border: '1px solid #2a2d3a', borderRadius: 12,
          padding: 48, textAlign: 'center'
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🤖</div>
          <div style={{ color: '#e8e8ec', fontSize: 18, marginBottom: 8 }}>No agents found</div>
          <div style={{ color: '#8b8fa4', fontSize: 14, marginBottom: 24 }}>
            Agents have not been set up in the database yet
          </div>
          <div style={{ color: '#5a5e72', fontSize: 13 }}>
            Run: <code style={{ background: '#12141a', padding: '2px 8px', borderRadius: 4 }}>npx prisma db seed</code>
          </div>
        </div>
      </div>
    );
  }

  // Adjust for the current agent names from our controller output
  const validAgents = agents.filter(a => a.agentName || a.name)
  validAgents.forEach(a => { if(!a.name) a.name = a.agentName })
  
  const masterAgent = validAgents.find(a => a.name === 'master');
  const otherAgents = validAgents.filter(a => a.name !== 'master');

  return (
    <div style={{ padding: 32 }}>

      {/* المايسترو — كارد مميز بالأعلى */}
      {masterAgent && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(201,165,90,0.1), rgba(26,29,38,1))',
          borderRadius: 16, padding: 24, marginBottom: 24,
          border: '1px solid rgba(201,165,90,0.3)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 24 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#34d399' }}>
                  {otherAgents.filter(a => a.isActive).length}/{otherAgents.length}
                </div>
                <div style={{ fontSize: 11, color: '#5a5e72' }}>Active</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#c9a55a' }}>
                  {masterAgent.logs?.length || masterAgent.recentLogs?.length || 0}
                </div>
                <div style={{ fontSize: 11, color: '#5a5e72' }}>Recent Activity</div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                <span style={{ fontSize: 20, fontWeight: 700, color: '#e8e8ec' }}>Maestro</span>
                <span style={{ fontSize: 24 }}>⚡</span>
              </div>
              <div style={{ fontSize: 13, color: '#8b8fa4', marginTop: 4 }}>{masterAgent.description}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end', marginTop: 8 }}>
                <span style={{ fontSize: 12, color: '#34d399' }}>Always Active</span>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%', background: '#34d399',
                  boxShadow: '0 0 8px #34d399'
                }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* باقي الإيجنتات */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
        gap: 16
      }}>
        {otherAgents.map(agent => {
          const meta = AGENT_META[agent.name] || { icon: '🤖', color: '#60a5fa' };
          const autoLabel = AUTOMATION_LABELS[agent.automationLevel];

          return (
            <div key={agent.id || agent.agentName} style={{
              background: '#1a1d26', borderRadius: 16, padding: 20,
              border: `1px solid ${agent.isActive ? meta.color + '33' : '#2a2d3a'}`,
              opacity: agent.isActive ? 1 : 0.6,
              transition: 'all 0.3s',
              cursor: 'pointer',
            }}
              onClick={() => setSelectedAgent(selectedAgent?.name === agent.name ? null : agent)}
            >
              {/* الهيدر */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                {/* Toggle */}
                <div
                  onClick={(e) => { e.stopPropagation(); toggleAgent(agent.name, agent.isActive); }}
                  style={{
                    width: 44, height: 24, borderRadius: 12, cursor: 'pointer',
                    background: agent.isActive ? meta.color : '#2a2d3a',
                    position: 'relative', transition: 'background 0.3s',
                  }}
                >
                  <div style={{
                    width: 18, height: 18, borderRadius: '50%', background: '#fff',
                    position: 'absolute', top: 3,
                    right: agent.isActive ? 3 : 'auto',
                    left: agent.isActive ? 'auto' : 3,
                    transition: 'all 0.3s',
                  }} />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 600, color: '#e8e8ec', fontSize: 15 }}>{agent.displayName}</span>
                  <span style={{ fontSize: 20 }}>{meta.icon}</span>
                </div>
              </div>

              {/* الوصف */}
              <div style={{ fontSize: 13, color: '#8b8fa4', textAlign: 'right', marginBottom: 16, minHeight: '40px' }}>
                {agent.description}
              </div>

              {/* مستوى الأتمتة */}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginBottom: 16 }}>
                {['full', 'semi', 'manual'].map(level => (
                  <button key={level}
                    onClick={(e) => { e.stopPropagation(); changeAutomation(agent.name, level); }}
                    style={{
                      padding: '4px 12px', borderRadius: 8, fontSize: 11, cursor: 'pointer',
                      border: `1px solid ${agent.automationLevel === level ? AUTOMATION_LABELS[level].color : '#2a2d3a'}`,
                      background: agent.automationLevel === level ? AUTOMATION_LABELS[level].color + '22' : 'transparent',
                      color: agent.automationLevel === level ? AUTOMATION_LABELS[level].color : '#5a5e72',
                    }}
                  >
                    {AUTOMATION_LABELS[level].label}
                  </button>
                ))}
              </div>

              {/* حالة */}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                paddingTop: 12, borderTop: '1px solid #2a2d3a22'
              }}>
                <span style={{ fontSize: 12, color: '#5a5e72' }}>
                  {(agent.logs?.length || agent.recentLogs?.length) ? 'Recently updated' : 'No activity yet'}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, color: agent.isActive ? '#34d399' : '#f87171' }}>
                    {agent.isActive ? 'Active' : 'Paused'}
                  </span>
                  <div style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: agent.isActive ? '#34d399' : '#f87171',
                    boxShadow: agent.isActive ? '0 0 6px #34d399' : 'none',
                  }} />
                </div>
              </div>

              {/* تفاصيل موسّعة عند الضغط */}
              {selectedAgent?.name === agent.name && (
                <div style={{
                  marginTop: 16, paddingTop: 16, borderTop: '1px solid #2a2d3a',
                }}>
                  <div style={{ fontSize: 13, color: '#8b8fa4', marginBottom: 8, textAlign: 'left' }}>Recent activity:</div>
                  {(agent.logs || agent.recentLogs)?.length > 0 ? (agent.logs || agent.recentLogs).slice(0, 5).map((log, i) => (
                    <div key={i} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '6px 0', borderBottom: i < 4 ? '1px solid #2a2d3a11' : 'none',
                    }}>
                      <span style={{ fontSize: 11, color: '#5a5e72' }}>
                        {log.timestamp ? new Date(log.timestamp).toLocaleString('en-US') : new Date().toLocaleString('en-US')}
                      </span>
                      <span style={{
                        fontSize: 12,
                        color: log.status === 'success' ? '#34d399' : log.status === 'error' ? '#f87171' : '#8b8fa4'
                      }}>
                        {log.message || log.action}
                      </span>
                    </div>
                  )) : (
                    <div style={{ fontSize: 12, color: '#5a5e72', textAlign: 'center', padding: 12 }}>
                      No recorded activity yet
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
