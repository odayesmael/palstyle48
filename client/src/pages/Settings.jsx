import { useState, useEffect } from 'react';
import api from '../services/api';
import optimizedAPI from '../services/optimizedAPI';

// ==================== الألوان ====================
const C = {
  bg: '#0a0b0d', surface: '#12141a', card: '#1a1d26', cardHover: '#1f2330',
  border: '#2a2d3a', accent: '#c9a55a', green: '#34d399', red: '#f87171',
  blue: '#60a5fa', purple: '#a78bfa', orange: '#fb923c', pink: '#f472b6',
  text: '#e8e8ec', muted: '#8b8fa4', dim: '#5a5e72',
};

// ==================== بيانات المنصات ====================
const PLATFORM_INFO = {
  meta: { displayName: 'Meta (Instagram + Facebook + WhatsApp)', icon: '📱', color: '#1877F2', oauthUrl: '/oauth/meta/authorize' },
  shopify: { displayName: 'Shopify', icon: '🛍️', color: '#96BF48', oauthUrl: null }, // تحويل Shopify إلى الربط اليدوي لتفادي مشاكل OAuth
  trendyol: { displayName: 'Trendyol', icon: '🧡', color: '#F27A1A', oauthUrl: null }, // بدون OAuth
  gmail: { displayName: 'Gmail', icon: '📧', color: '#EA4335', oauthUrl: '/oauth/gmail/authorize' },
  notion: { displayName: 'Notion', icon: '📝', color: '#FFFFFF', oauthUrl: null },
  canva: { displayName: 'Canva', icon: '🎨', color: '#00C4CC', oauthUrl: '/oauth/canva/authorize' },
};

const AGENT_INFO = {
  master: { icon: '⚡', color: '#c9a55a' },
  crm: { icon: '👥', color: '#34d399' },
  inbox: { icon: '💬', color: '#a78bfa' },
  content: { icon: '📝', color: '#60a5fa' },
  ads: { icon: '📢', color: '#fb923c' },
  finance: { icon: '💰', color: '#a78bfa' },
  inventory: { icon: '📦', color: '#f472b6' },
};

const AUTO_LEVELS = {
  full: { label: 'Automatic', color: C.green },
  semi: { label: 'Semi-Auto', color: '#fbbf24' },
  manual: { label: 'Manual', color: C.red },
};

// ==================== مكونات مشتركة ====================
function TabButton({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: '10px 24px', background: 'none', border: 'none', cursor: 'pointer',
      color: active ? C.accent : C.muted, fontSize: 14, fontWeight: active ? 600 : 400,
      borderBottom: active ? `2px solid ${C.accent}` : '2px solid transparent',
      transition: 'all 0.2s', fontFamily: 'inherit',
    }}>{label}</button>
  );
}

function Toggle({ value, onChange, disabled }) {
  return (
    <div onClick={disabled ? null : onChange} style={{
      width: 44, height: 24, borderRadius: 12, cursor: disabled ? 'not-allowed' : 'pointer',
      background: value ? C.green : C.border, position: 'relative', transition: 'background 0.3s',
      opacity: disabled ? 0.5 : 1,
    }}>
      <div style={{
        width: 18, height: 18, borderRadius: '50%', background: '#fff',
        position: 'absolute', top: 3, transition: 'all 0.3s',
        right: value ? 3 : 'auto', left: value ? 'auto' : 3,
      }} />
    </div>
  );
}

function LoadingState({ text }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 60 }}>
      <div style={{ color: C.muted, fontSize: 14 }}>{text || 'Loading...'}</div>
    </div>
  );
}

function ErrorState({ message, onRetry }) {
  return (
    <div style={{ textAlign: 'center', padding: 40 }}>
      <div style={{ color: C.red, fontSize: 16, marginBottom: 8 }}>❌ {message}</div>
      {onRetry && (
        <button onClick={onRetry} style={{
          background: C.accent, color: C.bg, border: 'none', borderRadius: 8,
          padding: '8px 24px', cursor: 'pointer', fontWeight: 600, marginTop: 8
        }}>Try Again</button>
      )}
    </div>
  );
}

// ==================== تبويب عام ====================
function GeneralTab() {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { fetchSettings(); }, []);

  async function fetchSettings() {
    try {
      setLoading(true);
      const res = await optimizedAPI.get(`/settings`, {}, true, 300000);
      setSettings(res?.data || res?.settings || res || {});
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings() {
    try {
      setSaving(true);
      await optimizedAPI.put(`/settings`, settings);
      alert('✅ Settings saved');
    } catch (err) {
      alert('❌ Save failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState text="Loading settings..." />;
  if (error) return <ErrorState message={error} onRetry={fetchSettings} />;

  const inputStyle = {
    width: '100%', padding: '10px 14px', borderRadius: 10,
    background: C.surface, border: `1px solid ${C.border}`, color: C.text,
    fontSize: 14, outline: 'none', fontFamily: 'inherit', textAlign: 'left',
  };
  const labelStyle = { fontSize: 13, color: C.muted, marginBottom: 6, textAlign: 'left', display: 'block' };
  const fieldStyle = { marginBottom: 20 };

  return (
    <div style={{ maxWidth: 500, marginLeft: 'auto' }}>
      <div style={fieldStyle}>
        <label style={labelStyle}>Store Name</label>
        <input style={inputStyle} value={settings.store_name || ''}
          onChange={e => setSettings({ ...settings, store_name: e.target.value })} />
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle}>Default Currency</label>
        <select style={inputStyle} value={settings.default_currency || 'USD'}
          onChange={e => setSettings({ ...settings, default_currency: e.target.value })}>
          <option value="USD">USD — US Dollar</option>
          <option value="TRY">TRY — Turkish Lira</option>
          <option value="EUR">EUR — Euro</option>
          <option value="ILS">ILS — Shekel</option>
        </select>
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle}>Timezone</label>
        <select style={inputStyle} value={settings.timezone || 'Asia/Istanbul'}
          onChange={e => setSettings({ ...settings, timezone: e.target.value })}>
          <option value="Asia/Istanbul">Asia/Istanbul (Turkey)</option>
          <option value="Asia/Jerusalem">Asia/Jerusalem (Palestine)</option>
          <option value="Asia/Riyadh">Asia/Riyadh (Saudi Arabia)</option>
          <option value="Africa/Cairo">Africa/Cairo (Egypt)</option>
          <option value="Asia/Dubai">Asia/Dubai (UAE)</option>
        </select>
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle}>AI Provider</label>
        <select style={inputStyle} value={settings.ai_provider || 'groq'}
          onChange={e => setSettings({ ...settings, ai_provider: e.target.value })}>
          <option value="groq">Groq (Free)</option>
          <option value="ollama">Ollama (Local)</option>
          <option value="claude">Claude (Anthropic)</option>
          <option value="openai">OpenAI (ChatGPT)</option>
        </select>
      </div>

      {settings.ai_provider === 'groq' && (
        <div style={fieldStyle}>
          <label style={labelStyle}>Groq API Key</label>
          <input style={inputStyle} type="password" placeholder="gsk_..." 
            value={settings.groq_api_key || ''}
            onChange={e => setSettings({ ...settings, groq_api_key: e.target.value })} />
        </div>
      )}

      {settings.ai_provider === 'ollama' && (
        <div style={fieldStyle}>
          <label style={labelStyle}>Ollama Server URL</label>
          <input style={inputStyle} placeholder="http://localhost:11434" 
            value={settings.ollama_url || ''}
            onChange={e => setSettings({ ...settings, ollama_url: e.target.value })} />
        </div>
      )}

      <button onClick={saveSettings} disabled={saving} style={{
        background: C.accent, color: C.bg, border: 'none', borderRadius: 10,
        padding: '12px 32px', cursor: 'pointer', fontWeight: 600, fontSize: 14,
        fontFamily: 'inherit', opacity: saving ? 0.6 : 1, width: '100%',
      }}>{saving ? 'Saving...' : 'Save Changes'}</button>
    </div>
  );
}

// ==================== تبويب المنصات ====================
function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function PlatformsTab() {
  const [platforms, setPlatforms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [oauthError, setOauthError] = useState(null);
  const [showTrendyolModal, setShowTrendyolModal] = useState(false);
  const [showShopifyModal, setShowShopifyModal] = useState(false);
  const [showNotionModal, setShowNotionModal] = useState(false);
  const [disconnectModal, setDisconnectModal] = useState({ show: false, platformName: null });
  const [trendyolForm, setTrendyolForm] = useState({ apiKey: '', apiSecret: '', supplierId: '' });
  const [shopifyForm, setShopifyForm] = useState({ accessToken: '', shop: '' });
  const [notionForm, setNotionForm] = useState({ token: '' });

  useEffect(() => { fetchPlatforms(); }, []);

  useEffect(() => {
    function handleMessage(event) {
      if (event.data?.type === 'oauth_complete') {
        fetchPlatforms();
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('platform') && params.get('status') === 'success') {
      fetchPlatforms();
      window.history.replaceState({}, '', '/settings#platforms');
    }
    if (params.get('status') === 'error') {
      const platform = params.get('platform') || 'Platform';
      const msg = decodeURIComponent(params.get('message') || 'An unknown error occurred');
      setOauthError({ platform, message: msg });
      window.history.replaceState({}, '', '/settings#platforms');
    }
  }, []);

  async function fetchPlatforms() {
    try {
      setLoading(true);
      const res = await optimizedAPI.get(`/platforms`, {}, true, 300000);
      setPlatforms(res?.data || res?.platforms || res || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function connectPlatform(platformName) {
    if (platformName === 'trendyol') {
      setShowTrendyolModal(true);
      return;
    }
    if (platformName === 'shopify') {
      setShowShopifyModal(true);
      return;
    }
    if (platformName === 'notion') {
      setShowNotionModal(true);
      return;
    }
    const info = PLATFORM_INFO[platformName];
    if (!info?.oauthUrl) return;

    const authStore = localStorage.getItem('palstyle48-auth');
    let tokenParam = '';
    if (authStore) {
      try {
        const parsed = JSON.parse(authStore);
        if (parsed?.state?.token) {
          tokenParam = `?token=${parsed.state.token}`;
        }
      } catch (e) {}
    }

    const w = 600, h = 700;
    const left = window.screenX + (window.outerWidth - w) / 2;
    const top = window.screenY + (window.outerHeight - h) / 2;
    const popup = window.open(
      `${api.defaults.baseURL}${info.oauthUrl}${tokenParam}`,
      `Connect ${platformName}`,
      `width=${w},height=${h},left=${left},top=${top},toolbar=no,menubar=no`
    );
    const check = setInterval(() => {
      if (popup?.closed) { clearInterval(check); fetchPlatforms(); }
    }, 1000);
  }

  async function disconnectPlatform(name) {
    setDisconnectModal({ show: true, platformName: name });
  }

  async function confirmDisconnect() {
    const name = disconnectModal.platformName;
    if (!name) return;
    try {
      setDisconnectModal({ show: false, platformName: null });
      await optimizedAPI.post(`/platforms/${name}/disconnect`);
      fetchPlatforms();
    } catch (err) {
      alert('Disconnect failed: ' + err.message);
    }
  }

  async function syncPlatform(name) {
    try {
      await optimizedAPI.post(`/platforms/${name}/sync`);
      fetchPlatforms();
      setTimeout(fetchPlatforms, 4000);
    } catch (err) {
      alert('Sync failed: ' + err.message);
    }
  }

  async function connectTrendyol() {
    try {
      const res = await optimizedAPI.post(`/platforms/trendyol/connect`, trendyolForm);
      if (res.success) {
        setShowTrendyolModal(false);
        fetchPlatforms();
      }
    } catch (err) {
      alert('Connection failed: ' + (err.response?.data?.error || err.message));
    }
  }

  async function connectShopifyManual() {
    if (!shopifyForm.accessToken || !shopifyForm.shop) {
      alert('Please fill in all fields first.');
      return;
    }
    try {
      const res = await optimizedAPI.post(`/oauth/shopify/test`, shopifyForm);
      if (res.success) {
        setShowShopifyModal(false);
        fetchPlatforms();
      }
    } catch (err) {
      alert('Connection failed: ' + (err.response?.data?.message || err.message));
    }
  }

  async function connectNotion() {
    if (!notionForm.token) {
      alert('Please enter the Internal Integration Token for your Notion workspace.');
      return;
    }
    try {
      const res = await optimizedAPI.post(`/platforms/notion/connect`, notionForm);
      if (res.success) {
        setShowNotionModal(false);
        fetchPlatforms();
      }
    } catch (err) {
      alert('Connection failed: ' + (err.response?.data?.error || err.message));
    }
  }

  if (loading) return <LoadingState text="Loading platforms..." />;
  if (error) return <ErrorState message={error} onRetry={fetchPlatforms} />;

  const isMetaRedirectError = oauthError?.message?.includes('redirect') || oauthError?.message?.includes('URL') || oauthError?.message?.includes('valid') || oauthError?.message?.includes('OAuthException');

  return (
    <>
      {/* OAuth Error Banner */}
      {oauthError && (
        <div style={{
          background: 'rgba(248, 113, 113, 0.08)',
          border: '1px solid rgba(248, 113, 113, 0.3)',
          borderRadius: 16,
          padding: '20px 24px',
          marginBottom: 24,
          textAlign: 'left',
          direction: 'ltr',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 28 }}>⚠️</span>
              <div>
                <div style={{ color: C.red, fontWeight: 700, fontSize: 15, marginBottom: 4 }}>❌ Failed to connect {oauthError.platform}</div>
                <div style={{ color: C.muted, fontSize: 13, fontFamily: 'monospace', wordBreak: 'break-all' }}>{oauthError.message}</div>
              </div>
            </div>
            <button onClick={() => setOauthError(null)} style={{
              background: 'none', border: 'none', color: C.dim, cursor: 'pointer', fontSize: 18, lineHeight: 1,
            }}>✕</button>
          </div>
          {(oauthError.platform === 'meta' || isMetaRedirectError) && (
            <div style={{
              background: 'rgba(201, 165, 90, 0.06)',
              border: '1px solid rgba(201, 165, 90, 0.2)',
              borderRadius: 12, padding: '16px 20px', marginTop: 12,
            }}>
              <div style={{ color: C.accent, fontWeight: 700, marginBottom: 10, fontSize: 14 }}>🔧 Fix Steps:</div>
              <div style={{ color: C.muted, fontSize: 13, lineHeight: 2 }}>
                <div>1️⃣ Go to <a href="https://developers.facebook.com/apps/1290630355844347/fb-login/settings/" target="_blank" rel="noreferrer" style={{ color: C.blue }}>Facebook Developers → Facebook Login → Settings</a></div>
                <div>2️⃣ In the <strong style={{color: C.text}}>"Valid OAuth Redirect URIs"</strong> field, add this URL:</div>
                <div style={{
                  background: C.bg, borderRadius: 8, padding: '8px 14px', margin: '6px 0',
                  fontFamily: 'monospace', fontSize: 13, color: C.green, border: `1px solid ${C.border}`,
                  direction: 'ltr', textAlign: 'left',
                }}>http://localhost:3001/api/oauth/meta/callback</div>
                <div>3️⃣ Make sure the App is not in <strong style={{color: C.red}}>Restricted Mode</strong> and add yourself as a <strong style={{color: C.text}}>Tester</strong> if it's in Development mode</div>
                <div>4️⃣ Click <strong style={{color: C.text}}>Save Changes</strong> then try again</div>
              </div>
            </div>
          )}
        </div>
      )}
      <style>{`
        .platforms-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 24px;
        }
        .platform-card {
          background: rgba(26, 29, 38, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 20px;
          padding: 24px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          position: relative;
          overflow: hidden;
          text-align: left;
          min-height: 220px;
        }
        .platform-card:hover {
          transform: translateY(-5px);
          border-color: var(--brand-color, rgba(201, 165, 90, 0.5));
          box-shadow: 0 15px 35px -10px var(--brand-color-dim, rgba(201, 165, 90, 0.15));
        }
        .platform-card::before {
          content: "";
          position: absolute;
          top: 0; left: 0; right: 0; height: 100%;
          background: radial-gradient(circle at 0% 0%, var(--brand-color-dim) 0%, transparent 50%);
          opacity: 0;
          transition: opacity 0.3s ease;
          pointer-events: none;
        }
        .platform-card:hover::before {
          opacity: 1;
        }
        .platform-icon-box {
          width: 56px;
          height: 56px;
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 28px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.2);
          flex-shrink: 0;
          animation: floatFloat 6s ease-in-out infinite;
        }
        @keyframes floatFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
        .connect-btn {
          padding: 10px 16px;
          border-radius: 12px;
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
          font-family: inherit;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        .connect-btn.primary {
          background: var(--brand-color);
          color: #fff;
          border: none;
          box-shadow: 0 4px 14px rgba(0,0,0,0.2);
          width: 100%;
        }
        .connect-btn.primary:hover {
          filter: brightness(1.15);
          transform: translateY(-2px);
          box-shadow: 0 6px 20px var(--brand-color-dim);
        }
        .connect-btn.danger {
          background: rgba(248, 113, 113, 0.1);
          color: #f87171;
          border: 1px solid rgba(248, 113, 113, 0.2);
          flex: 1;
        }
        .connect-btn.danger:hover {
          background: rgba(248, 113, 113, 0.2);
        }
        .connect-btn.outline {
          background: rgba(255, 255, 255, 0.02);
          color: #e8e8ec;
          border: 1px solid rgba(255, 255, 255, 0.1);
          flex: 1;
        }
        .connect-btn.outline:hover {
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(255, 255, 255, 0.2);
        }
      `}</style>
      
      <div className="platforms-grid">
        {platforms.map(platform => {
          const info = PLATFORM_INFO[platform.name] || { displayName: platform.displayName, icon: '🔗', color: C.muted };
          const connected = platform.isConnected;
          const brandRgb = info.color;
          const brandDim = hexToRgba(brandRgb, 0.15);

          return (
            <div key={platform.id || platform.name} className="platform-card" style={{
              '--brand-color': brandRgb,
              '--brand-color-dim': brandDim,
              border: connected ? `1px solid ${brandDim}` : undefined
            }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                {connected && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: `${C.green}15`, padding: '4px 10px', borderRadius: 20,
                    border: `1px solid ${C.green}33`, color: C.green, fontSize: 11, fontWeight: 600
                  }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.green, boxShadow: `0 0 6px ${C.green}` }} />
                    Connected
                  </div>
                )}
                {!connected && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: `rgba(255,255,255,0.05)`, padding: '4px 10px', borderRadius: 20,
                    border: `1px solid rgba(255,255,255,0.1)`, color: C.dim, fontSize: 11, fontWeight: 500
                  }}>
                    Disconnected
                  </div>
                )}
                <div className="platform-icon-box" style={{ animationDelay: `${Math.random()}s` }}>
                  {info.icon}
                </div>
              </div>

              {/* Info */}
              <div style={{ marginBottom: 24, zIndex: 1 }}>
                <div style={{ fontSize: 18, color: C.text, fontWeight: 600, marginBottom: 6 }}>{info.displayName}</div>
                {connected ? (
                  <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5 }}>
                    <div>Account: <span style={{ color: C.text }}>{platform.metadata?.shopName || platform.metadata?.email || platform.metadata?.userName || platform.metadata?.workspaceName || 'Active'}</span></div>
                    {platform.lastSync && <div style={{ marginTop: 4 }}>Last sync: <span style={{ color: C.text }}>{new Date(platform.lastSync).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></div>}
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: C.dim, lineHeight: 1.5 }}>
                    Connect {info.displayName} to sync data, messages, and ads automatically.
                  </div>
                )}
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 12, marginTop: 'auto', zIndex: 1 }}>
                {connected ? (
                  <>
                    <button className="connect-btn outline" onClick={() => syncPlatform(platform.name)}>
                      {platform.syncStatus === 'syncing' ? '⏳ Syncing...' : '🔄 Sync'}
                    </button>
                    <button className="connect-btn danger" onClick={() => disconnectPlatform(platform.name)}>
                      Disconnect
                    </button>
                  </>
                ) : (
                  <button className="connect-btn primary" onClick={() => connectPlatform(platform.name)}>
                    Connect
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

        {/* Trendyol Modal */}
      {showTrendyolModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(10px)',
          display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000,
        }} onClick={() => setShowTrendyolModal(false)}>
          <div style={{
            background: C.surface, borderRadius: 24, padding: '32px 40px', width: 420,
            border: `1px solid ${hexToRgba('#F27A1A', 0.3)}`,
            boxShadow: `0 25px 50px -12px rgba(0,0,0,0.5)`,
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <span style={{ fontSize: 32 }}>🧡</span>
              <div style={{ fontSize: 24, fontWeight: 700, color: C.text }}>Connect Trendyol</div>
            </div>
            <div style={{ fontSize: 13, color: C.dim, marginBottom: 24, textAlign: 'left', lineHeight: 1.6 }}>
              To connect your inbox and products, get your keys from Trendyol Seller Center via Integration {'>'} API Integration.
            </div>
            {['apiKey', 'apiSecret', 'supplierId'].map(field => (
              <div key={field} style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 13, color: C.muted, display: 'block', marginBottom: 8, textAlign: 'left', fontWeight: 500 }}>
                  {field === 'apiKey' ? 'API Key' : field === 'apiSecret' ? 'Secret' : 'Supplier ID'}
                </label>
                <input
                  type={field === 'apiSecret' ? 'password' : 'text'}
                  value={trendyolForm[field]}
                  onChange={e => setTrendyolForm({ ...trendyolForm, [field]: e.target.value })}
                  style={{
                    width: '100%', padding: '12px 16px', borderRadius: 12,
                    background: C.bg, border: `1px solid ${C.border}`,
                    color: C.text, fontSize: 14, outline: 'none', textAlign: 'left',
                    boxSizing: 'border-box', transition: 'border 0.2s',
                  }}
                  onFocus={e => e.target.style.borderColor = '#F27A1A'}
                  onBlur={e => e.target.style.borderColor = C.border}
                />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 12, marginTop: 32 }}>
              <button onClick={() => setShowTrendyolModal(false)} style={{
                flex: 1, padding: 12, borderRadius: 12, border: `1px solid ${C.border}`,
                background: 'transparent', color: C.muted, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600
              }}>Cancel</button>
              <button onClick={connectTrendyol} style={{
                flex: 1, padding: 12, borderRadius: 12, border: 'none',
                background: 'linear-gradient(to right, #F27A1A, #E06710)', color: '#fff',
                cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit',
                boxShadow: '0 4px 12px rgba(242, 122, 26, 0.3)'
              }}>Test & Connect</button>
            </div>
          </div>
        </div>
      )}

      {/* Shopify Custom App Modal */}
      {showShopifyModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(10px)',
          display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000,
        }} onClick={() => setShowShopifyModal(false)}>
          <div style={{
            background: C.surface, borderRadius: 24, padding: '32px 40px', width: 420,
            border: `1px solid ${hexToRgba('#96BF48', 0.3)}`,
            boxShadow: `0 25px 50px -12px rgba(0,0,0,0.5)`,
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <span style={{ fontSize: 32 }}>🛍️</span>
              <div style={{ fontSize: 24, fontWeight: 700, color: C.text }}>Connect Shopify (Custom App)</div>
            </div>
            <div style={{ fontSize: 13, color: C.dim, marginBottom: 24, textAlign: 'left', lineHeight: 1.6 }}>
              Use your Custom App access token directly to connect your Shopify store.
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, color: C.muted, display: 'block', marginBottom: 8, textAlign: 'left', fontWeight: 500 }}>
                Store URL (e.g. store.myshopify.com)
              </label>
              <input
                type="text"
                placeholder="storename.myshopify.com"
                value={shopifyForm.shop}
                onChange={e => setShopifyForm({ ...shopifyForm, shop: e.target.value })}
                style={{
                  width: '100%', padding: '12px 16px', borderRadius: 12,
                  background: C.bg, border: `1px solid ${C.border}`,
                  color: C.text, fontSize: 14, outline: 'none', textAlign: 'left', direction: 'ltr',
                  boxSizing: 'border-box', transition: 'border 0.2s',
                }}
                onFocus={e => e.target.style.borderColor = '#96BF48'}
                onBlur={e => e.target.style.borderColor = C.border}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, color: C.muted, display: 'block', marginBottom: 8, textAlign: 'left', fontWeight: 500 }}>
                Access Token (Admin API Access Token)
              </label>
              <input
                type="password"
                placeholder="shpat_..."
                value={shopifyForm.accessToken}
                onChange={e => setShopifyForm({ ...shopifyForm, accessToken: e.target.value })}
                style={{
                  width: '100%', padding: '12px 16px', borderRadius: 12,
                  background: C.bg, border: `1px solid ${C.border}`,
                  color: C.text, fontSize: 14, outline: 'none', textAlign: 'left', direction: 'ltr',
                  boxSizing: 'border-box', transition: 'border 0.2s',
                }}
                onFocus={e => e.target.style.borderColor = '#96BF48'}
                onBlur={e => e.target.style.borderColor = C.border}
              />
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 32 }}>
              <button onClick={() => setShowShopifyModal(false)} style={{
                flex: 1, padding: 12, borderRadius: 12, border: `1px solid ${C.border}`,
                background: 'transparent', color: C.muted, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600
              }}>Cancel</button>
              <button onClick={connectShopifyManual} style={{
                flex: 1, padding: 12, borderRadius: 12, border: 'none',
                background: 'linear-gradient(to right, #96BF48, #82A938)', color: '#fff',
                cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit',
                boxShadow: '0 4px 12px rgba(150, 191, 72, 0.3)'
              }}>Test & Connect</button>
            </div>
          </div>
        </div>
      )}

      {/* Notion Internal Integration Modal */}
      {showNotionModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(10px)',
          display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000,
        }} onClick={() => setShowNotionModal(false)}>
          <div style={{
            background: C.surface, borderRadius: 24, padding: '32px 40px', width: 420,
            border: `1px solid ${hexToRgba('#FFFFFF', 0.3)}`,
            boxShadow: `0 25px 50px -12px rgba(0,0,0,0.5)`,
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <span style={{ fontSize: 32 }}>📝</span>
              <div style={{ fontSize: 24, fontWeight: 700, color: C.text }}>Connect Notion Workspace</div>
            </div>
            <div style={{ fontSize: 13, color: C.dim, marginBottom: 24, textAlign: 'left', lineHeight: 1.6 }}>
              To connect Notion you need an Internal Integration Token. Go to <b>www.notion.so/my-integrations</b> to create a new integration and copy the secret.
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, color: C.muted, display: 'block', marginBottom: 8, textAlign: 'left', fontWeight: 500 }}>
                Internal Integration Secret
              </label>
              <input
                type="password"
                placeholder="secret_..."
                value={notionForm.token}
                onChange={e => setNotionForm({ ...notionForm, token: e.target.value })}
                style={{
                  width: '100%', padding: '12px 16px', borderRadius: 12,
                  background: C.bg, border: `1px solid ${C.border}`,
                  color: C.text, fontSize: 14, outline: 'none', textAlign: 'left', direction: 'ltr',
                  boxSizing: 'border-box', transition: 'border 0.2s',
                }}
                onFocus={e => e.target.style.borderColor = '#FFFFFF'}
                onBlur={e => e.target.style.borderColor = C.border}
              />
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 32 }}>
              <button onClick={() => setShowNotionModal(false)} style={{
                flex: 1, padding: 12, borderRadius: 12, border: `1px solid ${C.border}`,
                background: 'transparent', color: C.muted, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600
              }}>Cancel</button>
              <button onClick={connectNotion} style={{
                flex: 1, padding: 12, borderRadius: 12, border: 'none',
                background: 'linear-gradient(to right, #CCCCCC, #FFFFFF)', color: '#000',
                cursor: 'pointer', fontWeight: 700, fontFamily: 'inherit',
                boxShadow: '0 4px 12px rgba(255, 255, 255, 0.2)'
              }}>Test & Connect</button>
            </div>
          </div>
        </div>
      )}

      {/* Disconnect Confirmation Modal */}
      {disconnectModal.show && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(10px)',
          display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000,
        }} onClick={() => setDisconnectModal({ show: false, platformName: null })}>
          <div style={{
            background: C.surface, borderRadius: 24, padding: '32px 40px', width: 420,
            border: `1px solid rgba(248, 113, 113, 0.3)`,
            boxShadow: `0 25px 50px -12px rgba(0,0,0,0.5)`,
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <span style={{ fontSize: 28 }}>⚠️</span>
              <div style={{ fontSize: 22, fontWeight: 700, color: C.text }}>Confirm Disconnect</div>
            </div>
            <div style={{ fontSize: 14, color: C.dim, marginBottom: 24, textAlign: 'left', lineHeight: 1.6 }}>
              Are you sure you want to disconnect <strong style={{color: C.text}}>{PLATFORM_INFO[disconnectModal.platformName]?.displayName || 'this platform'}</strong>? Auto-sync will stop immediately.
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 32 }}>
              <button onClick={() => setDisconnectModal({ show: false, platformName: null })} style={{
                flex: 1, padding: 12, borderRadius: 12, border: `1px solid ${C.border}`,
                background: 'transparent', color: C.muted, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600
              }}>Cancel</button>
              <button onClick={confirmDisconnect} style={{
                flex: 1, padding: 12, borderRadius: 12,
                background: 'rgba(248, 113, 113, 0.15)', color: '#f87171',
                border: '1px solid rgba(248, 113, 113, 0.3)',
                cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit',
              }}>Yes, Disconnect</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ==================== تبويب الإيجنتات ====================
function AgentsTab() {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => { fetchAgents(); }, []);

  async function fetchAgents() {
    try {
      setLoading(true);
      const res = await optimizedAPI.get(`/agents`, {}, true, 300000);

      const resData = res?.data || res?.agents || res || [];
      const validAgents = (Array.isArray(resData) ? resData : []).filter(a => a.agentName || a.name)
      validAgents.forEach(a => { if(!a.name) a.name = a.agentName })

      setAgents(validAgents);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function toggleAgent(name, current) {
    if (name === 'master') return;
    try {
      await optimizedAPI.put(`/agents/${name}`, { isActive: !current });
      fetchAgents();
    } catch (err) { console.error(err); }
  }

  async function setAutomation(name, level) {
    try {
      await optimizedAPI.put(`/agents/${name}`, { automationLevel: level });
      fetchAgents();
    } catch (err) { console.error(err); }
  }

  if (loading) return <LoadingState text="Loading agents..." />;
  if (error) return <ErrorState message={error} onRetry={fetchAgents} />;
  if (agents.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🤖</div>
        <div style={{ color: C.text, fontSize: 16, marginBottom: 8 }}>No agents found</div>
        <div style={{ color: C.dim, fontSize: 13 }}>
          Agents have not been set up yet
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {agents.map(agent => {
        const meta = AGENT_INFO[agent.name] || { icon: '🤖', color: C.blue };
        const isMaster = agent.name === 'master';

        return (
          <div key={agent.id || agent.name} style={{
            background: isMaster ? `linear-gradient(135deg, ${C.accent}11, ${C.card})` : C.card,
            borderRadius: 14, padding: '16px 20px',
            border: `1px solid ${isMaster ? C.accent + '44' : C.border}`,
            opacity: agent.isActive ? 1 : 0.5,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              {/* Toggle + مستوى الأتمتة */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Toggle value={agent.isActive} onChange={() => toggleAgent(agent.name, agent.isActive)}
                  disabled={isMaster} />
                <div style={{ display: 'flex', gap: 6 }}>
                  {Object.entries(AUTO_LEVELS).map(([level, info]) => (
                    <button key={level} onClick={() => setAutomation(agent.name, level)} style={{
                      padding: '3px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
                      border: `1px solid ${agent.automationLevel === level ? info.color : C.border}`,
                      background: agent.automationLevel === level ? info.color + '22' : 'transparent',
                      color: agent.automationLevel === level ? info.color : C.dim,
                      fontFamily: 'inherit',
                    }}>{info.label}</button>
                  ))}
                </div>
              </div>

              {/* agent name */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 22 }}>{meta.icon}</span>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{agent.displayName}</div>
                  <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>{agent.description}</div>
                </div>
                <div style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: agent.isActive ? C.green : C.dim,
                  boxShadow: agent.isActive ? `0 0 6px ${C.green}` : 'none',
                }} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ==================== تبويب الأمان ====================
function SecurityTab() {
  const [passwords, setPasswords] = useState({ current: '', new: '', confirm: '' });
  const [sessions, setSessions] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get(`/auth/sessions`)
      .then(res => setSessions(res.data?.sessions || res.data || []))
      .catch(() => {});
  }, []);

  async function changePassword() {
    if (passwords.new !== passwords.confirm) {
      alert('New passwords do not match.');
      return;
    }
    if (passwords.new.length < 8) {
      alert('Password must be at least 8 characters.');
      return;
    }
    try {
      setSaving(true);
      await api.put(`/auth/password`, {
        currentPassword: passwords.current,
        newPassword: passwords.new,
      });
      alert('✅ Password changed successfully');
      setPasswords({ current: '', new: '', confirm: '' });
    } catch (err) {
      alert('❌ ' + (err.response?.data?.message || err.response?.data?.error || 'Failed to change password'));
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = {
    width: '100%', padding: '10px 14px', borderRadius: 10,
    background: C.surface, border: `1px solid ${C.border}`, color: C.text,
    fontSize: 14, outline: 'none', textAlign: 'left', boxSizing: 'border-box',
  };

  return (
    <div style={{ maxWidth: 500, marginLeft: 'auto' }}>
      <div style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 16, textAlign: 'left' }}>
        Change Password
      </div>

      {[
        { key: 'current', label: 'Current Password' },
        { key: 'new', label: 'New Password' },
        { key: 'confirm', label: 'Confirm New Password' },
      ].map(field => (
        <div key={field.key} style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, color: C.muted, display: 'block', marginBottom: 4, textAlign: 'left' }}>
            {field.label}
          </label>
          <input type="password" style={inputStyle} value={passwords[field.key]}
            onChange={e => setPasswords({ ...passwords, [field.key]: e.target.value })} />
        </div>
      ))}

      <button onClick={changePassword} disabled={saving} style={{
        background: C.accent, color: C.bg, border: 'none', borderRadius: 10,
        padding: '12px 32px', cursor: 'pointer', fontWeight: 600, fontSize: 14,
        width: '100%', fontFamily: 'inherit', opacity: saving ? 0.6 : 1,
      }}>{saving ? 'Saving...' : 'Change Password'}</button>

      {/* Login History */}
      {sessions.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 12, textAlign: 'left' }}>
            Login History
          </div>
          {sessions.map((s, i) => (
            <div key={s.id || i} style={{
              display: 'flex', justifyContent: 'space-between', padding: '10px 0',
              borderBottom: i < sessions.length - 1 ? `1px solid ${C.border}22` : 'none',
            }}>
              <span style={{ fontSize: 12, color: C.dim }}>{s.ip || s.device || 'Unknown'}</span>
              <span style={{ fontSize: 12, color: C.muted }}>
                {new Date(s.createdAt).toLocaleString('en-US')}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== الصفحة الرئيسية ====================
export default function Settings() {
  const [tab, setTab] = useState('general');

  // اقرأ التبويب من الـ hash
  useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    if (['general', 'platforms', 'agents', 'security'].includes(hash)) {
      setTab(hash);
    }
  }, []);

  function changeTab(newTab) {
    setTab(newTab);
    window.location.hash = newTab;
  }

  return (
    <div style={{ padding: 32 }}>
      {/* التبويبات */}
      <div style={{
        display: 'flex', justifyContent: 'center', gap: 0,
        borderBottom: `1px solid ${C.border}`, marginBottom: 32,
      }}>
        <TabButton label="General" active={tab === 'general'} onClick={() => changeTab('general')} />
        <TabButton label="Agents" active={tab === 'agents'} onClick={() => changeTab('agents')} />
        <TabButton label="Security" active={tab === 'security'} onClick={() => changeTab('security')} />
      </div>

      {/* محتوى التبويب */}
      {tab === 'general' && <GeneralTab />}
      {tab === 'agents' && <AgentsTab />}
      {tab === 'security' && <SecurityTab />}
    </div>
  );
}
