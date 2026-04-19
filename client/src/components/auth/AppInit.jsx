import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import useAuthStore from '../../store/authStore'

/**
 * AppInit — mounts once at app root.
 * If no token → redirect to /login
 * If token exists → stay on current route (protected routes handle the rest)
 */
export default function AppInit({ children }) {
  const [ready, setReady] = useState(false)
  const { token } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    // Skip check if we're already on /login
    if (location.pathname === '/login') {
      setReady(true)
      return
    }

    if (!token) {
      navigate('/login', { replace: true })
    }

    setReady(true)
    // Only run on first mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!ready) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a0b0d',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              border: '3px solid rgba(201,165,90,0.15)',
              borderTopColor: '#c9a55a',
              animation: 'spin 0.8s linear infinite',
              margin: '0 auto 1rem',
            }}
          />
          <p style={{ color: '#8b8fa4', fontSize: '0.8rem' }}>Loading...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    )
  }

  return children
}
