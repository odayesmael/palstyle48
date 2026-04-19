import { useState, useEffect, useRef, memo } from 'react'
import { useLocation } from 'react-router-dom'
import { Menu, Sparkles, Bell } from 'lucide-react'
import api from '../../services/api'

const PAGE_TITLES = {
  '/dashboard': 'Dashboard',
  '/customers': 'Customers',
  '/inbox':     'Inbox',
  '/content':   'Content',
  '/ads':       'Ads',
  '/finance':   'Finance',
  '/inventory': 'Inventory',
  '/agents':    'Agents',
  '/settings':  'Settings',
  '/tasks':     'Tasks',
}

// Computed once — date never changes during a session
const ENGLISH_DATE = new Intl.DateTimeFormat('en-US', {
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
}).format(new Date())

// Fetch alerts once on mount, then poll every 2 minutes — NOT on every navigation
let _alertsCache = 0
let _lastFetch = 0
const ALERTS_TTL = 120_000 // 2 minutes

async function fetchAlerts() {
  if (Date.now() - _lastFetch < ALERTS_TTL) return _alertsCache
  try {
    const res = await api.get('/master/alerts')
    _alertsCache = res.data?.data?.total || 0
    _lastFetch = Date.now()
  } catch {}
  return _alertsCache
}

const Header = memo(function Header({ onMenuToggle }) {
  const { pathname } = useLocation()
  const pageTitle = PAGE_TITLES[pathname] ?? 'palstyle48'
  const [alertsCount, setAlertsCount] = useState(_alertsCache)
  const intervalRef = useRef(null)

  useEffect(() => {
    // Fetch immediately on mount (non-blocking)
    fetchAlerts().then(setAlertsCount)

    // Poll every 2 minutes
    intervalRef.current = setInterval(() => {
      _lastFetch = 0 // force refresh
      fetchAlerts().then(setAlertsCount)
    }, ALERTS_TTL)

    return () => clearInterval(intervalRef.current)
  }, []) // ← empty deps: runs ONCE, not on every route change

  const openMaestro = () => {
    window.dispatchEvent(new CustomEvent('open-maestro'))
  }

  return (
    <header
      className="fixed top-0 left-0 right-0 z-30 flex items-center justify-between px-4 lg:px-6 border-b border-border"
      style={{
        height: 'var(--header-height)',
        background: 'rgba(18, 20, 26, 0.95)', // solid enough — no blur needed
        willChange: 'auto',
      }}
    >
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuToggle}
          className="p-2 rounded-lg text-text-muted hover:text-accent hover:bg-white/5 transition-colors lg:hidden"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>
        <div>
          <h1 className="text-base font-bold text-text leading-tight">{pageTitle}</h1>
          <p className="text-[11px] text-text-muted leading-tight">{ENGLISH_DATE}</p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button className="relative text-text-muted hover:text-text transition-colors">
          <Bell size={20} />
          {alertsCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
              {alertsCount > 99 ? '99+' : alertsCount}
            </span>
          )}
        </button>
        <button onClick={openMaestro} className="btn-gold text-xs gap-1.5 px-3 py-2">
          <Sparkles size={14} strokeWidth={2.5} />
          <span>Maestro</span>
        </button>
      </div>
    </header>
  )
})

export default Header
