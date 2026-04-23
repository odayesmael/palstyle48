import { useState, useEffect, useCallback } from 'react'
import { Link2, CheckCircle, XCircle, RefreshCw, ExternalLink, Key, AlertCircle, Trash2 } from 'lucide-react'
import optimizedAPI from '../services/optimizedAPI'
import { API_BASE_URL } from '../services/api'
import useAuthStore from '../store/authStore'

const PLATFORMS = [
  {
    key: 'meta',
    name: 'Meta',
    description: 'Facebook, Instagram & WhatsApp Business',
    color: 'from-blue-500 to-indigo-600',
    icon: '📘',
    type: 'oauth',
  },
  {
    key: 'shopify',
    name: 'Shopify',
    description: 'Store, products & orders',
    color: 'from-green-500 to-emerald-600',
    icon: '🏪',
    type: 'apikey',
    fields: [
      { name: 'accessToken', label: 'Access Token', placeholder: 'shpss_...', type: 'password' },
      { name: 'shop', label: 'Store Domain', placeholder: 'your-store.myshopify.com' },
    ],
  },
  {
    key: 'trendyol',
    name: 'Trendyol',
    description: 'Products, orders & marketplace',
    color: 'from-orange-500 to-red-500',
    icon: '🛒',
    type: 'apikey',
    fields: [
      { name: 'apiKey', label: 'API Key', placeholder: 'Enter Trendyol API Key' },
      { name: 'apiSecret', label: 'API Secret', placeholder: 'Enter Trendyol API Secret', type: 'password' },
      { name: 'supplierId', label: 'Supplier ID', placeholder: 'Enter your Supplier ID' },
    ],
  },
  {
    key: 'gmail',
    name: 'Gmail',
    description: 'Email integration',
    color: 'from-red-500 to-pink-500',
    icon: '📧',
    type: 'oauth',
  },
  {
    key: 'notion',
    name: 'Notion',
    description: 'Database & documentation',
    color: 'from-slate-600 to-slate-700',
    icon: '📄',
    type: 'apikey',
    fields: [
      { name: 'token', label: 'Notion API Token', placeholder: 'ntn_...', type: 'password' },
    ],
  },
  {
    key: 'canva',
    name: 'Canva',
    description: 'Design & content creation',
    color: 'from-cyan-500 to-teal-500',
    icon: '🎨',
    type: 'oauth',
  },
]

export default function Connect() {
  const [status, setStatus] = useState({})
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState({})
  const [disconnecting, setDisconnecting] = useState({})
  const [forms, setForms] = useState({})
  const [errors, setErrors] = useState({})
  const token = useAuthStore(s => s.token)

  const loadStatus = useCallback(async () => {
    try {
      setLoading(true)
      const res = await optimizedAPI.get('/platforms', {}, true, 300000)
      const platforms = res?.data || res?.platforms || res || []
      const statusMap = {}
      platforms.forEach(p => {
        statusMap[p.name] = {
          connected: p.isConnected,
          lastSync: p.lastSync,
          metadata: p.metadata || {},
        }
      })
      setStatus(statusMap)
    } catch (err) {
      console.error('[Connect] status error:', err)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { loadStatus() }, [loadStatus])

  const handleOAuth = (platform) => {
    window.location.href = `${API_BASE_URL}/api/oauth/${platform}/authorize?token=${token}`
  }

  const handleApiKey = async (platformKey) => {
    const formData = forms[platformKey] || {}
    setSyncing(p => ({ ...p, [platformKey]: true }))
    setErrors(p => ({ ...p, [platformKey]: null }))
    try {
      const endpoints = {
        trendyol: '/oauth/trendyol/test',
        shopify: '/oauth/shopify/test',
        notion: '/oauth/notion/test',
      }
      const endpoint = endpoints[platformKey] || '/oauth/test'
      const res = await optimizedAPI.post(endpoint, formData)
      if (res?.success) {
        await loadStatus()
        setForms(p => ({ ...p, [platformKey]: {} }))
      } else {
        setErrors(p => ({ ...p, [platformKey]: res?.message || 'Connection failed' }))
      }
    } catch (err) {
      setErrors(p => ({ ...p, [platformKey]: err?.response?.data?.message || err.message }))
    } finally { setSyncing(p => ({ ...p, [platformKey]: false })) }
  }

  const handleSync = async (platformKey) => {
    setSyncing(p => ({ ...p, [platformKey]: true }))
    setErrors(p => ({ ...p, [platformKey]: null }))
    try {
      const res = await optimizedAPI.post(`/platforms/${platformKey}/sync`)
      if (res?.success) {
        await loadStatus()
      } else {
        setErrors(p => ({ ...p, [platformKey]: res?.message || 'Sync failed' }))
      }
    } catch (err) {
      setErrors(p => ({ ...p, [platformKey]: err?.response?.data?.message || err.message }))
    } finally { setSyncing(p => ({ ...p, [platformKey]: false })) }
  }

  const handleDisconnect = async (platformKey) => {
    if (!window.confirm(`Disconnect ${platformKey}?`)) return
    setDisconnecting(p => ({ ...p, [platformKey]: true }))
    setErrors(p => ({ ...p, [platformKey]: null }))
    try {
      const res = await optimizedAPI.post(`/platforms/${platformKey}/disconnect`)
      if (res?.success) {
        await loadStatus()
      } else {
        setErrors(p => ({ ...p, [platformKey]: res?.message || 'Disconnect failed' }))
      }
    } catch (err) {
      setErrors(p => ({ ...p, [platformKey]: err?.response?.data?.message || err.message }))
    } finally { setDisconnecting(p => ({ ...p, [platformKey]: false })) }
  }

  const connectedCount = Object.values(status).filter(s => s?.connected).length

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center">
            <Link2 size={20} className="text-accent" />
          </div>
          <div>
            <h1 className="section-title">Connect Platforms</h1>
            <p className="section-subtitle">{connectedCount} of {PLATFORMS.length} connected</p>
          </div>
        </div>
        <button onClick={loadStatus} disabled={loading} className="btn-ghost flex items-center gap-2 text-sm">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Progress Bar */}
      <div className="mb-8">
        <div className="w-full h-2 rounded-full bg-surface overflow-hidden">
          <div className="h-full rounded-full bg-accent transition-all duration-700" style={{ width: `${(connectedCount / PLATFORMS.length) * 100}%` }} />
        </div>
        <p className="text-xs text-text-muted mt-1">{connectedCount === PLATFORMS.length ? '✅ All platforms connected!' : `${PLATFORMS.length - connectedCount} remaining`}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {PLATFORMS.map(platform => {
          const isConnected = status[platform.key]?.connected
          const lastSync = status[platform.key]?.lastSync
          const isSyncing = syncing[platform.key]
          const error = errors[platform.key]

          return (
            <div key={platform.key} className={`card p-6 relative overflow-hidden ${isConnected ? 'border-green-500/30' : ''}`}>
              {/* Gradient accent */}
              <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${platform.color}`} />

              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{platform.icon}</span>
                  <div>
                    <h3 className="text-lg font-bold text-text">{platform.name}</h3>
                    <p className="text-xs text-text-muted">{platform.description}</p>
                  </div>
                </div>
                {isConnected ? (
                  <div className="flex items-center gap-1.5 text-green-500 text-xs font-medium bg-green-500/10 px-2 py-1 rounded-lg">
                    <CheckCircle size={14} /> Connected
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-text-muted text-xs bg-surface px-2 py-1 rounded-lg">
                    <XCircle size={14} /> Not connected
                  </div>
                )}
              </div>

              {lastSync && (
                <p className="text-xs text-text-muted mb-3">
                  Last sync: {new Date(lastSync).toLocaleString()}
                </p>
              )}

              {error && (
                <div className="mb-3 p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-xs flex items-center gap-2">
                  <AlertCircle size={14} /> {error}
                </div>
              )}

              {/* OAuth platforms */}
              {platform.type === 'oauth' && !isConnected && (
                <button onClick={() => handleOAuth(platform.key)} disabled={isSyncing} className="w-full btn-primary flex items-center justify-center gap-2 text-sm">
                  <ExternalLink size={14} />
                  {isSyncing ? 'Connecting...' : `Connect ${platform.name}`}
                </button>
              )}

              {/* API Key platforms */}
              {platform.type === 'apikey' && !isConnected && (
                <div className="space-y-3">
                  {platform.fields.map(field => (
                    <div key={field.name}>
                      <label className="text-xs text-text-muted mb-1 block">{field.label}</label>
                      <input
                        type={field.type || 'text'}
                        placeholder={field.placeholder}
                        value={forms[platform.key]?.[field.name] || ''}
                        onChange={e => setForms(p => ({
                          ...p,
                          [platform.key]: { ...p[platform.key], [field.name]: e.target.value }
                        }))}
                        className="input w-full"
                      />
                    </div>
                  ))}
                  <button
                    onClick={() => handleApiKey(platform.key)}
                    disabled={isSyncing}
                    className="w-full btn-primary flex items-center justify-center gap-2 text-sm"
                  >
                    <Key size={14} />
                    {isSyncing ? 'Testing...' : `Connect ${platform.name}`}
                  </button>
                </div>
              )}

              {/* Connected state */}
              {isConnected && (
                <div>
                  <div className="text-xs text-text-muted mb-3 space-y-1">
                    {status[platform.key]?.metadata?.shopName && <p>Store: {status[platform.key].metadata.shopName}</p>}
                    {status[platform.key]?.metadata?.userName && <p>User: {status[platform.key].metadata.userName}</p>}
                    {status[platform.key]?.metadata?.email && <p>Email: {status[platform.key].metadata.email}</p>}
                    {lastSync && <p>Last sync: {new Date(lastSync).toLocaleString()}</p>}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSync(platform.key)}
                      disabled={syncing[platform.key]}
                      className="flex-1 btn-primary flex items-center justify-center gap-2 text-sm"
                    >
                      <RefreshCw size={14} className={syncing[platform.key] ? 'animate-spin' : ''} />
                      {syncing[platform.key] ? 'Syncing...' : 'Sync Data'}
                    </button>
                    <button
                      onClick={() => handleDisconnect(platform.key)}
                      disabled={disconnecting[platform.key]}
                      className="flex-1 btn-ghost text-red-500 border border-red-500/30 hover:bg-red-500/10 flex items-center justify-center gap-2 text-sm"
                    >
                      <Trash2 size={14} />
                      {disconnecting[platform.key] ? 'Disconnecting...' : 'Disconnect'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
