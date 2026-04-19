// ─── OAuth Callback Page ──────────────────────────────────────────────────────
// This page is shown inside the OAuth popup window.
// It reads URL params, messages the opener window, then closes itself.

import { useEffect, useState } from 'react'

export default function OAuthCallback() {
  const [status, setStatus] = useState('processing')
  const [platform, setPlatform] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const params   = new URLSearchParams(window.location.search)
    const statusP  = params.get('status')   || 'error'
    const platformP = params.get('platform') || ''
    const msgP     = params.get('message')  || ''

    setStatus(statusP)
    setPlatform(platformP)
    setMessage(msgP ? decodeURIComponent(msgP) : '')

    // Notify parent window
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(
        { type: 'oauth_complete', platform: platformP, status: statusP, message: msgP },
        window.location.origin
      )
      // Close after brief delay so user sees the result
      setTimeout(() => window.close(), 1500)
    } else {
      // Opened directly (not as popup) — redirect to settings
      setTimeout(() => {
        window.location.href = `/settings?platform=${platformP}&status=${statusP}`
      }, 2000)
    }
  }, [])

  const PLATFORM_NAMES = {
    meta: 'Meta', shopify: 'Shopify', trendyol: 'Trendyol',
    gmail: 'Gmail', notion: 'Notion', canva: 'Canva',
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0a0b0d',
      fontFamily: '"Noto Sans Arabic", sans-serif',
      direction: 'rtl',
    }}>
      <div style={{
        textAlign: 'center',
        padding: '2rem',
        maxWidth: '320px',
      }}>
        {status === 'processing' && (
          <>
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>⏳</div>
            <p style={{ color: '#8b8fa4', fontSize: '0.9rem' }}>Processing connection...</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div style={{
              width: '64px', height: '64px', borderRadius: '50%',
              background: 'rgba(52,211,153,0.15)', border: '2px solid rgba(52,211,153,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 1rem', fontSize: '1.75rem',
            }}>✓</div>
            <h2 style={{ color: '#e8e8ec', fontWeight: 700, marginBottom: '0.5rem' }}>Connected successfully!</h2>
            <p style={{ color: '#34d399', fontSize: '0.875rem', marginBottom: '0.25rem' }}>
              {PLATFORM_NAMES[platform] || platform}
            </p>
            <p style={{ color: '#8b8fa4', fontSize: '0.75rem' }}>This window will close automatically...</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div style={{
              width: '64px', height: '64px', borderRadius: '50%',
              background: 'rgba(248,113,113,0.15)', border: '2px solid rgba(248,113,113,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 1rem', fontSize: '1.75rem',
            }}>✕</div>
            <h2 style={{ color: '#e8e8ec', fontWeight: 700, marginBottom: '0.5rem' }}>Connection failed</h2>
            <p style={{ color: '#f87171', fontSize: '0.8rem', marginBottom: '0.5rem' }}>
              {message || 'An error occurred while connecting'}
            </p>
            <p style={{ color: '#8b8fa4', fontSize: '0.75rem' }}>Close this window and try again</p>
            <button
              onClick={() => window.close()}
              style={{
                marginTop: '1.25rem', padding: '0.6rem 1.5rem',
                background: 'rgba(42,45,58,0.8)', border: '1px solid #2a2d3a',
                borderRadius: '8px', color: '#e8e8ec', cursor: 'pointer', fontSize: '0.85rem',
              }}
            >
              Close
            </button>
          </>
        )}
      </div>
    </div>
  )
}
