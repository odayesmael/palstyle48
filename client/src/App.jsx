import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import MainLayout from './components/layout/MainLayout'
import LoginPage from './components/auth/LoginPage'
import AppInit from './components/auth/AppInit'
import useAuthStore from './store/authStore'

// ── Lazy-load all pages — each becomes its own JS chunk ──────────────────────
// The browser only downloads a page's code when the user navigates to it.
const Dashboard     = lazy(() => import('./pages/Dashboard'))
const Customers     = lazy(() => import('./pages/Customers'))
const CustomerDetail = lazy(() => import('./pages/CustomerDetail'))
const Inbox         = lazy(() => import('./pages/Inbox'))
const Content       = lazy(() => import('./pages/Content'))
const Ads           = lazy(() => import('./pages/Ads'))
const Finance       = lazy(() => import('./pages/Finance'))
const Inventory     = lazy(() => import('./pages/Inventory'))
const Agents        = lazy(() => import('./pages/Agents'))
const Settings      = lazy(() => import('./pages/Settings'))
const Tasks         = lazy(() => import('./pages/Tasks'))
const Users         = lazy(() => import('./pages/Users'))
const Connect       = lazy(() => import('./pages/Connect'))
const OAuthCallback = lazy(() => import('./pages/OAuthCallback'))

// ── Lightweight fallback while a page chunk loads ────────────────────────────
function PageLoader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div style={{
        width: 36, height: 36, borderRadius: '50%',
        border: '3px solid rgba(201,165,90,0.15)',
        borderTopColor: '#c9a55a',
        animation: 'spin 0.7s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ─── Auth guard: redirect to /login if no token ──────────────────────────────
function RequireAuth({ children }) {
  const token = useAuthStore((s) => s.token)
  if (!token) return <Navigate to="/login" replace />
  return children
}

// ─── Already logged in? Redirect away from /login ────────────────────────────
function RedirectIfAuthed({ children }) {
  const token = useAuthStore((s) => s.token)
  if (token) return <Navigate to="/dashboard" replace />
  return children
}

export default function App() {
  return (
    <AppInit>
      <Routes>
        {/* ── Public ──────────────────────────────────────────────────── */}
        <Route
          path="/login"
          element={
            <RedirectIfAuthed>
              <LoginPage />
            </RedirectIfAuthed>
          }
        />

        {/* ── OAuth Callback — runs in popup, no layout needed ─────── */}
        <Route path="/oauth/callback" element={<OAuthCallback />} />

        <Route
          path="/"
          element={
            <RequireAuth>
              <MainLayout />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard"     element={<Suspense fallback={<PageLoader />}><Dashboard /></Suspense>} />
          <Route path="customers"     element={<Suspense fallback={<PageLoader />}><Customers /></Suspense>} />
          <Route path="customers/:id" element={<Suspense fallback={<PageLoader />}><CustomerDetail /></Suspense>} />
          <Route path="inbox"         element={<Suspense fallback={<PageLoader />}><Inbox /></Suspense>} />
          <Route path="content"       element={<Suspense fallback={<PageLoader />}><Content /></Suspense>} />
          <Route path="ads"           element={<Suspense fallback={<PageLoader />}><Ads /></Suspense>} />
          <Route path="finance"       element={<Suspense fallback={<PageLoader />}><Finance /></Suspense>} />
          <Route path="inventory"     element={<Suspense fallback={<PageLoader />}><Inventory /></Suspense>} />
          <Route path="agents"        element={<Suspense fallback={<PageLoader />}><Agents /></Suspense>} />
          <Route path="tasks"         element={<Suspense fallback={<PageLoader />}><Tasks /></Suspense>} />
          <Route path="users"         element={<Suspense fallback={<PageLoader />}><Users /></Suspense>} />
          <Route path="connect"      element={<Suspense fallback={<PageLoader />}><Connect /></Suspense>} />
          <Route path="settings"      element={<Suspense fallback={<PageLoader />}><Settings /></Suspense>} />
        </Route>

        {/* ── Catch all ───────────────────────────────────────────────── */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AppInit>
  )
}
