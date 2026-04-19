import { useState, useEffect, useCallback } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import MaestroChat from './MaestroChat'

// Computed once — avoids reading window.innerWidth on every render
const isDesktop = () => window.innerWidth >= 1024

export default function MainLayout() {
  const { pathname } = useLocation()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [desktop, setDesktop] = useState(isDesktop)

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileSidebarOpen(false)
  }, [pathname])

  // Throttled resize listener — not on every frame
  useEffect(() => {
    let timer
    function handleResize() {
      clearTimeout(timer)
      timer = setTimeout(() => {
        const d = isDesktop()
        setDesktop(d)
        if (d) setMobileSidebarOpen(false)
      }, 150)
    }
    window.addEventListener('resize', handleResize, { passive: true })
    return () => { window.removeEventListener('resize', handleResize); clearTimeout(timer) }
  }, [])

  const sidebarWidth = sidebarCollapsed
    ? 'var(--sidebar-collapsed-width)'
    : 'var(--sidebar-width)'

  const toggleSidebar = useCallback(() => setSidebarCollapsed(p => !p), [])
  const openMobile   = useCallback(() => setMobileSidebarOpen(p => !p), [])
  const closeMobile  = useCallback(() => setMobileSidebarOpen(false), [])

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>

      {/* Mobile Overlay */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={closeMobile}
        />
      )}

      {/* Desktop Sidebar */}
      <div className="hidden lg:block">
        <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
      </div>

      {/* Mobile Sidebar */}
      <div
        className="lg:hidden fixed top-0 left-0 h-full z-40 transition-transform duration-200"
        style={{
          width: 'var(--sidebar-width)',
          transform: mobileSidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
          contain: 'layout style',
        }}
      >
        <Sidebar collapsed={false} onToggle={closeMobile} />
      </div>

      {/* Main Content */}
      <div
        className="flex flex-col min-h-screen"
        style={{ marginLeft: desktop ? sidebarWidth : '0px' }}
      >
        <Header onMenuToggle={openMobile} />
        <main className="flex-1" style={{ marginTop: 'var(--header-height)' }}>
          <Outlet />
        </main>
      </div>

      <MaestroChat />
    </div>
  )
}
