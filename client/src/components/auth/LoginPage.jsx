import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Lock, Mail, ShieldAlert, Clock } from 'lucide-react'
import useAuthStore from '../../store/authStore'
import api from '../../services/api'

const MAX_ATTEMPTS = 3
const LOCKOUT_SECONDS = 15 * 60 // 15 minutes

export default function LoginPage() {
  const [form, setForm] = useState({ email: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Rate-limit state (stored in sessionStorage so it survives page refresh but not new tabs)
  const [attempts, setAttempts] = useState(() => {
    const saved = sessionStorage.getItem('login_attempts')
    return saved ? JSON.parse(saved) : { count: 0, lockedUntil: null }
  })
  const [countdown, setCountdown] = useState(0)
  const timerRef = useRef(null)

  const login = useAuthStore((s) => s.login)
  const navigate = useNavigate()

  // ─── Countdown timer ───────────────────────────────────────────────────────
  useEffect(() => {
    if (attempts.lockedUntil) {
      const remaining = Math.ceil((attempts.lockedUntil - Date.now()) / 1000)
      if (remaining > 0) {
        setCountdown(remaining)
        timerRef.current = setInterval(() => {
          setCountdown((prev) => {
            if (prev <= 1) {
              clearInterval(timerRef.current)
              // Reset lock
              const reset = { count: 0, lockedUntil: null }
              setAttempts(reset)
              sessionStorage.setItem('login_attempts', JSON.stringify(reset))
              return 0
            }
            return prev - 1
          })
        }, 1000)
      } else {
        // Lock expired
        const reset = { count: 0, lockedUntil: null }
        setAttempts(reset)
        sessionStorage.setItem('login_attempts', JSON.stringify(reset))
      }
    }
    return () => clearInterval(timerRef.current)
  }, [attempts.lockedUntil])

  const isLocked = countdown > 0

  function formatCountdown(secs) {
    const m = Math.floor(secs / 60).toString().padStart(2, '0')
    const s = (secs % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  // ─── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault()
    if (isLocked || loading) return
    setError('')
    setLoading(true)

    try {
      const { data } = await api.post('/auth/login', form)
      // Success → reset attempts, store token, go to dashboard
      const reset = { count: 0, lockedUntil: null }
      setAttempts(reset)
      sessionStorage.setItem('login_attempts', JSON.stringify(reset))
      login(data.token, data.user)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      const msg = err.response?.data?.message ?? 'Server error, please try again'

      // Increment attempts
      setAttempts((prev) => {
        const newCount = prev.count + 1
        let lockedUntil = null
        if (newCount >= MAX_ATTEMPTS) {
          lockedUntil = Date.now() + LOCKOUT_SECONDS * 1000
        }
        const updated = { count: newCount, lockedUntil }
        sessionStorage.setItem('login_attempts', JSON.stringify(updated))
        return updated
      })

      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const remainingAttempts = MAX_ATTEMPTS - attempts.count

  return (
    <div className="login-root">
      {/* ─── Animated background ──────────────────────────────────────── */}
      <div className="login-bg" aria-hidden="true">
        <div className="login-orb login-orb-1" />
        <div className="login-orb login-orb-2" />
        <div className="login-orb login-orb-3" />
        <div className="login-grid" />
      </div>

      {/* ─── Card ─────────────────────────────────────────────────────── */}
      <div className="login-card-wrap">
        <div className="login-card">

          {/* ── Logo ──── */}
          <div className="login-logo-area">
            <div className="login-logo-ring">
              <div className="login-logo-inner">
                {/* P monogram */}
                <span className="login-logo-letter">P</span>
              </div>
            </div>
            <h1 className="login-brand">PALSTYLE48</h1>
            <p className="login-sub">COMMAND CENTER</p>
            <div className="login-brand-divider" />
          </div>

          {/* ── Lockout banner ──── */}
          {isLocked && (
            <div className="login-lockout">
              <ShieldAlert size={18} className="shrink-0 text-danger" />
              <div>
                <p className="font-semibold text-danger text-sm">Access temporarily restricted</p>
                <p className="text-xs text-text-muted mt-0.5">
                  Try again after{' '}
                  <span className="font-mono text-accent font-bold">{formatCountdown(countdown)}</span>
                </p>
              </div>
              <div className="login-countdown">
                <Clock size={14} />
                <span className="font-mono font-bold">{formatCountdown(countdown)}</span>
              </div>
            </div>
          )}

          {/* ── Form ──── */}
          <form
            id="login-form"
            onSubmit={handleSubmit}
            className="login-form"
            noValidate
          >
            {/* Email */}
            <div className="login-field">
              <label htmlFor="login-email" className="login-label">
                Email
              </label>
              <div className="login-input-wrap">
                <Mail size={15} className="login-input-icon" />
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  required
                  disabled={isLocked}
                  placeholder="admin@palstyle48.com"
                  className="login-input"
                  value={form.email}
                  onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                />
              </div>
            </div>

            {/* Password */}
            <div className="login-field">
              <label htmlFor="login-password" className="login-label">
                Password
              </label>
              <div className="login-input-wrap">
                <Lock size={15} className="login-input-icon" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  disabled={isLocked}
                  placeholder="••••••••••"
                  className="login-input login-input-pw"
                  value={form.password}
                  onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  disabled={isLocked}
                  onClick={() => setShowPassword((p) => !p)}
                  className="login-pw-toggle"
                  aria-label={showPassword ? 'Hide' : 'Show'}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Error message */}
            {error && !isLocked && (
              <div className="login-error" role="alert">
                <ShieldAlert size={14} className="shrink-0" />
                <span>{error}</span>
                {attempts.count > 0 && attempts.count < MAX_ATTEMPTS && (
                  <span className="login-attempts-left">
                    {remainingAttempts} {remainingAttempts === 1 ? 'attempt' : 'attempts'} left
                  </span>
                )}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              id="login-submit"
              disabled={loading || isLocked}
              className="login-btn"
            >
              {loading ? (
                <span className="login-btn-loading">
                  <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  Verifying...
                </span>
              ) : isLocked ? (
                <span className="login-btn-loading">
                  <Clock size={16} />
                  {formatCountdown(countdown)}
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          {/* Footer */}
          <p className="login-footer">
            palstyle48 &copy; {new Date().getFullYear()} — All rights reserved
          </p>
        </div>
      </div>
    </div>
  )
}
