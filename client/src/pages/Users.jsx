import { useState, useEffect, useCallback } from 'react'
import {
  UserPlus, Search, Shield, Edit3, Trash2, X, Eye, EyeOff,
  CheckCircle2, AlertCircle, Users as UsersIcon, Crown, UserCheck, User
} from 'lucide-react'
import api from '../services/api'
import useAuthStore from '../store/authStore'

const ROLES = [
  { value: 'admin',  label: 'Admin',  labelAr: 'مدير',    icon: Crown,    color: '#c9a55a' },
  { value: 'editor', label: 'Editor', labelAr: 'محرر',    icon: UserCheck, color: '#6cb4ee' },
  { value: 'viewer', label: 'Viewer', labelAr: 'مشاهد',   icon: User,      color: '#8b8fa4' },
]

const PERMISSIONS_LIST = [
  { key: 'dashboard',  label: 'Dashboard',  labelAr: 'لوحة التحكم' },
  { key: 'customers',  label: 'Customers',  labelAr: 'العملاء' },
  { key: 'inbox',      label: 'Inbox',      labelAr: 'صندوق الوارد' },
  { key: 'content',    label: 'Content',    labelAr: 'المحتوى' },
  { key: 'tasks',      label: 'Tasks',      labelAr: 'المهام' },
  { key: 'ads',        label: 'Ads',        labelAr: 'الإعلانات' },
  { key: 'finance',    label: 'Finance',    labelAr: 'المالية' },
  { key: 'inventory',  label: 'Inventory',  labelAr: 'المخزون' },
  { key: 'agents',     label: 'Agents',     labelAr: 'الإيجنتات' },
  { key: 'settings',   label: 'Settings',   labelAr: 'الإعدادات' },
  { key: 'users',      label: 'Users',      labelAr: 'المستخدمون' },
]

const DEFAULT_FORM = {
  name: '', email: '', password: '', role: 'viewer',
  permissions: PERMISSIONS_LIST.reduce((a, p) => ({ ...a, [p.key]: p.key === 'dashboard' }), {}),
}

export default function UsersPage() {
  const currentUser = useAuthStore((s) => s.user)
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [form, setForm] = useState({ ...DEFAULT_FORM })
  const [showPw, setShowPw] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true)
      const { data } = await api.get('/users')
      setUsers(data.users || [])
    } catch (err) {
      console.error('Failed to fetch users:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  // ── Helpers ────────────────────────────────────────────────────────────────
  const filteredUsers = users.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  )

  function openAddModal() {
    setEditingUser(null)
    setForm({ ...DEFAULT_FORM })
    setError('')
    setShowPw(false)
    setShowModal(true)
  }

  function openEditModal(user) {
    setEditingUser(user)
    setForm({
      name: user.name,
      email: user.email,
      password: '',
      role: user.role,
      permissions: user.permissions || {},
    })
    setError('')
    setShowPw(false)
    setShowModal(true)
  }

  function handleRoleChange(role) {
    if (role === 'admin') {
      setForm(f => ({
        ...f,
        role,
        permissions: PERMISSIONS_LIST.reduce((a, p) => ({ ...a, [p.key]: true }), {}),
      }))
    } else {
      setForm(f => ({ ...f, role }))
    }
  }

  function togglePermission(key) {
    if (form.role === 'admin') return // admin has all
    setForm(f => ({
      ...f,
      permissions: { ...f.permissions, [key]: !f.permissions[key] },
    }))
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSaving(true)

    try {
      if (editingUser) {
        // Update
        const payload = { name: form.name, email: form.email, role: form.role, permissions: form.permissions }
        if (form.password) payload.password = form.password
        await api.put(`/users/${editingUser.id}`, payload)
        setSuccessMsg('تم تحديث المستخدم بنجاح')
      } else {
        // Create
        if (!form.password || form.password.length < 8) {
          setError('كلمة المرور يجب أن تكون 8 أحرف على الأقل')
          setSaving(false)
          return
        }
        await api.post('/users', form)
        setSuccessMsg('تم إنشاء المستخدم بنجاح')
      }
      setShowModal(false)
      fetchUsers()
      setTimeout(() => setSuccessMsg(''), 3000)
    } catch (err) {
      setError(err.response?.data?.message || 'حدث خطأ')
    } finally {
      setSaving(false)
    }
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.delete(`/users/${deleteTarget.id}`)
      setDeleteTarget(null)
      setSuccessMsg('تم حذف المستخدم بنجاح')
      fetchUsers()
      setTimeout(() => setSuccessMsg(''), 3000)
    } catch (err) {
      setError(err.response?.data?.message || 'حدث خطأ في الحذف')
      setDeleteTarget(null)
    } finally {
      setDeleting(false)
    }
  }

  function getRoleBadge(role) {
    const r = ROLES.find(x => x.value === role) || ROLES[2]
    const Icon = r.icon
    return (
      <span className="users-role-badge" style={{ '--role-color': r.color }}>
        <Icon size={12} />
        {r.label}
      </span>
    )
  }

  function formatDate(d) {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  }

  // ── Guard: admin only ──────────────────────────────────────────────────────
  if (currentUser?.role !== 'admin') {
    return (
      <div className="users-no-access">
        <Shield size={48} />
        <h2>Access Denied</h2>
        <p>You don't have permission to access this page.</p>
      </div>
    )
  }

  return (
    <div className="users-page">
      {/* ── Success Toast ──────────────────────────────────────────────── */}
      {successMsg && (
        <div className="users-toast">
          <CheckCircle2 size={16} />
          {successMsg}
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="users-header">
        <div>
          <h1 className="users-title">
            <UsersIcon size={24} />
            User Management
          </h1>
          <p className="users-subtitle">Manage user accounts and permissions</p>
        </div>
        <button className="users-add-btn" onClick={openAddModal}>
          <UserPlus size={16} />
          Add User
        </button>
      </div>

      {/* ── Search ─────────────────────────────────────────────────────── */}
      <div className="users-search-bar">
        <Search size={16} className="users-search-icon" />
        <input
          type="text"
          placeholder="Search users..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="users-search-input"
        />
      </div>

      {/* ── Table ──────────────────────────────────────────────────────── */}
      <div className="users-table-wrap">
        {loading ? (
          <div className="users-loading">
            <div className="users-spinner" />
            <p>Loading users...</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="users-empty">
            <UsersIcon size={40} />
            <p>{search ? 'No users match your search' : 'No users found'}</p>
          </div>
        ) : (
          <table className="users-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Permissions</th>
                <th>Last Login</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map(u => {
                const perms = u.permissions || {}
                const activePerms = Object.keys(perms).filter(k => perms[k])
                return (
                  <tr key={u.id} className={u.id === currentUser?.id ? 'users-row-self' : ''}>
                    <td>
                      <div className="users-user-cell">
                        <div className="users-avatar">
                          {u.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="users-name">
                            {u.name}
                            {u.id === currentUser?.id && <span className="users-you-badge">You</span>}
                          </div>
                          <div className="users-email">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>{getRoleBadge(u.role)}</td>
                    <td>
                      <div className="users-perms-cell">
                        {activePerms.length === PERMISSIONS_LIST.length ? (
                          <span className="users-perm-tag all">All</span>
                        ) : activePerms.length === 0 ? (
                          <span className="users-perm-tag none">None</span>
                        ) : (
                          <>
                            {activePerms.slice(0, 3).map(k => (
                              <span key={k} className="users-perm-tag">{k}</span>
                            ))}
                            {activePerms.length > 3 && (
                              <span className="users-perm-tag more">+{activePerms.length - 3}</span>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                    <td className="users-date">{formatDate(u.lastLogin)}</td>
                    <td className="users-date">{formatDate(u.createdAt)}</td>
                    <td>
                      <div className="users-actions">
                        <button className="users-action-btn edit" onClick={() => openEditModal(u)} title="Edit">
                          <Edit3 size={14} />
                        </button>
                        {u.id !== currentUser?.id && (
                          <button className="users-action-btn delete" onClick={() => setDeleteTarget(u)} title="Delete">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Add/Edit Modal ─────────────────────────────────────────────── */}
      {showModal && (
        <div className="users-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="users-modal" onClick={e => e.stopPropagation()}>
            <div className="users-modal-header">
              <h2>{editingUser ? 'Edit User' : 'Add New User'}</h2>
              <button className="users-modal-close" onClick={() => setShowModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="users-modal-form">
              {/* Name */}
              <div className="users-field">
                <label>Name</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Full name"
                />
              </div>

              {/* Email */}
              <div className="users-field">
                <label>Email</label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="user@example.com"
                />
              </div>

              {/* Password */}
              <div className="users-field">
                <label>
                  Password
                  {editingUser && <span className="users-field-hint">(Leave empty to keep current)</span>}
                </label>
                <div className="users-pw-wrap">
                  <input
                    type={showPw ? 'text' : 'password'}
                    required={!editingUser}
                    minLength={8}
                    value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    placeholder={editingUser ? '••••••••' : 'Min 8 characters'}
                  />
                  <button type="button" className="users-pw-toggle" onClick={() => setShowPw(!showPw)}>
                    {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              {/* Role */}
              <div className="users-field">
                <label>Role</label>
                <div className="users-role-selector">
                  {ROLES.map(r => {
                    const Icon = r.icon
                    return (
                      <button
                        key={r.value}
                        type="button"
                        className={`users-role-option ${form.role === r.value ? 'active' : ''}`}
                        style={{ '--role-color': r.color }}
                        onClick={() => handleRoleChange(r.value)}
                      >
                        <Icon size={16} />
                        <span>{r.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Permissions */}
              <div className="users-field">
                <label>Permissions</label>
                {form.role === 'admin' && (
                  <p className="users-perm-note">
                    <Shield size={12} /> Admins have full access to all sections
                  </p>
                )}
                <div className={`users-perms-grid ${form.role === 'admin' ? 'disabled' : ''}`}>
                  {PERMISSIONS_LIST.map(p => (
                    <label key={p.key} className="users-perm-check">
                      <input
                        type="checkbox"
                        checked={!!form.permissions[p.key]}
                        disabled={form.role === 'admin'}
                        onChange={() => togglePermission(p.key)}
                      />
                      <span className="users-perm-checkmark" />
                      <span>{p.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="users-modal-error">
                  <AlertCircle size={14} />
                  {error}
                </div>
              )}

              {/* Actions */}
              <div className="users-modal-actions">
                <button type="button" className="users-btn-cancel" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="users-btn-save" disabled={saving}>
                  {saving ? 'Saving...' : editingUser ? 'Update' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete Confirm Modal ──────────────────────────────────────── */}
      {deleteTarget && (
        <div className="users-modal-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="users-delete-modal" onClick={e => e.stopPropagation()}>
            <div className="users-delete-icon">
              <Trash2 size={24} />
            </div>
            <h3>Delete User</h3>
            <p>Are you sure you want to delete <strong>{deleteTarget.name}</strong>?</p>
            <p className="users-delete-warning">This action cannot be undone.</p>
            <div className="users-modal-actions">
              <button className="users-btn-cancel" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button className="users-btn-delete" disabled={deleting} onClick={handleDelete}>
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
