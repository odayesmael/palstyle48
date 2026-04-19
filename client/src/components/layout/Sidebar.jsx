import { NavLink, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import {
  LayoutDashboard,
  Users,
  UsersRound,
  Inbox,
  FileText,
  Megaphone,
  Wallet,
  Package,
  Bot,
  Settings,
  CheckSquare,
  ChevronRight,
  Zap,
} from 'lucide-react'
import useAuthStore from '../../store/authStore'

const NAV_ITEMS = [
  { to: '/dashboard',  icon: LayoutDashboard, label: 'لوحة التحكم',   labelEn: 'Dashboard' },
  { to: '/customers',  icon: Users,           label: 'العملاء',         labelEn: 'Customers' },
  { to: '/inbox',      icon: Inbox,           label: 'صندوق الوارد',    labelEn: 'Inbox',    badge: 'NEW' },
  { to: '/content',    icon: FileText,        label: 'المحتوى',         labelEn: 'Content' },
  { to: '/tasks',      icon: CheckSquare,     label: 'المهام',          labelEn: 'Tasks' },
  { to: '/ads',        icon: Megaphone,       label: 'الإعلانات',       labelEn: 'Ads' },
  { to: '/finance',    icon: Wallet,          label: 'المالية',         labelEn: 'Finance' },
  { to: '/inventory',  icon: Package,         label: 'المخزون',         labelEn: 'Inventory' },
  { to: '/agents',     icon: Bot,             label: 'الإيجنتات',       labelEn: 'Agents' },
  { to: '/settings',   icon: Settings,        label: 'الإعدادات',       labelEn: 'Settings' },
  { to: '/users',      icon: UsersRound,      label: 'المستخدمون',      labelEn: 'Users',    adminOnly: true },
]

export default function Sidebar({ collapsed, onToggle }) {
  const logout = useAuthStore((s) => s.logout)
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <aside
      className="fixed top-0 left-0 h-full z-40 flex flex-col transition-all duration-300"
      style={{
        width: collapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)',
        background: '#0f1117',
        borderRight: '1px solid rgba(255, 255, 255, 0.05)',
        contain: 'layout style',
      }}
    >
      {/* ─── Logo ─────────────────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-3 px-4 py-4 border-b border-border shrink-0"
        style={{ height: 'var(--header-height)' }}
      >
        {/* Icon mark */}
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-gold shrink-0">
          <Zap size={18} className="text-background" strokeWidth={2.5} />
        </div>

        {/* Brand name */}
        {!collapsed && (
          <div className="overflow-hidden">
            <p className="text-sm font-bold text-text leading-tight">palstyle48</p>
            <p className="text-[10px] text-text-muted leading-tight tracking-wide uppercase">Command Center</p>
          </div>
        )}

        {/* Collapse toggle (desktop) */}
        <button
          onClick={onToggle}
          className="ml-auto p-1 rounded-md text-text-muted hover:text-accent hover:bg-white/5 transition-colors hidden lg:flex"
          aria-label="Toggle sidebar"
        >
          <ChevronRight
            size={16}
            className="transition-transform duration-300"
            style={{ transform: collapsed ? 'rotate(180deg)' : 'rotate(0deg)' }}
          />
        </button>
      </div>

      {/* ─── Navigation ───────────────────────────────────────────────────── */}
      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.filter(item => !item.adminOnly || user?.role === 'admin').map(({ to, icon: Icon, labelEn, badge }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              isActive ? 'nav-link-active' : 'nav-link'
            }
            title={collapsed ? labelEn : undefined}
          >
            <Icon size={18} className="shrink-0" />
            {!collapsed && (
              <span className="flex-1">{labelEn}</span>
            )}
            {!collapsed && badge && (
              <span className="badge-gold text-[10px] px-1.5 py-0.5">{badge}</span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* ─── Bottom: Logout ────────────────────────────────────────────────── */}
      <div className="px-2 py-3 border-t border-border shrink-0">
        <button
          onClick={handleLogout}
          className="nav-link w-full justify-start text-danger hover:bg-danger/10 hover:text-danger"
          title={collapsed ? 'Sign Out' : undefined}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          {!collapsed && <span className="flex-1">Sign Out</span>}
        </button>
      </div>
    </aside>
  )
}
