import { useState, useEffect } from 'react'
import optimizedAPI from '../services/optimizedAPI'
import { pageCache } from '../utils/pageCache'
const PC = 'tasks'
import { useDebounce } from '../hooks/useDebounce'
import {
  LayoutList, FileText, Database, ArrowRight,
  Plus, Pencil, Trash2, X, Check, Loader2
} from 'lucide-react'

const C = {
  bg: '#0a0b0d', surface: '#12141a', card: '#1a1d26',
  border: '#2a2d3a', accent: '#c9a55a', text: '#e8e8ec',
  muted: '#8b8fa4', dim: '#5a5e72', red: '#f87171', green: '#34d399',
}

// ─── Helper: render property value as readable text ──────────────────────────
function getPropText(prop) {
  if (!prop) return ''
  if (prop.title)        return prop.title.map(t => t.plain_text).join('')
  if (prop.rich_text)    return prop.rich_text.map(t => t.plain_text).join('')
  if (prop.select)       return prop.select.name
  if (prop.status)       return prop.status.name
  if (prop.multi_select) return prop.multi_select.map(s => s.name).join(', ')
  if (prop.date)         return prop.date.start
  if (prop.checkbox !== undefined) return prop.checkbox ? '✅' : '❌'
  if (prop.number !== null && prop.number !== undefined) return prop.number
  return ''
}

// ─── Helper: convert raw form values + schema → Notion properties format ─────
function buildNotionProperties(schema, formValues) {
  const props = {}
  for (const [key, def] of Object.entries(schema)) {
    const val = formValues[key]
    if (val === undefined || val === '' || val === null) continue
    if (def.type === 'title')       props[key] = { title: [{ text: { content: val } }] }
    if (def.type === 'rich_text')   props[key] = { rich_text: [{ text: { content: val } }] }
    if (def.type === 'number')      props[key] = { number: parseFloat(val) }
    if (def.type === 'checkbox')    props[key] = { checkbox: val === true || val === 'true' }
    if (def.type === 'select')      props[key] = { select: { name: val } }
    if (def.type === 'status')      props[key] = { status: { name: val } }
    if (def.type === 'date')        props[key] = { date: { start: val } }
    if (def.type === 'multi_select') {
      props[key] = { multi_select: (val || []).map(v => ({ name: v })) }
    }
  }
  return props
}

// ─── Helper: extract editable field types ────────────────────────────────────
const EDITABLE_TYPES = ['title', 'rich_text', 'number', 'checkbox', 'select', 'status', 'date', 'multi_select']

function getEditableSchema(schema) {
  return Object.fromEntries(
    Object.entries(schema).filter(([, def]) => EDITABLE_TYPES.includes(def.type))
  )
}

// ─── Dynamic Form Field ───────────────────────────────────────────────────────
function DynamicField({ fieldKey, def, value, onChange }) {
  const inputStyle = {
    width: '100%', padding: '10px 14px', borderRadius: 10,
    background: C.bg, border: `1px solid ${C.border}`,
    color: C.text, fontSize: 14, outline: 'none', fontFamily: 'inherit',
    boxSizing: 'border-box', direction: 'ltr',
  }

  if (def.type === 'checkbox') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input
          type="checkbox"
          checked={!!value}
          onChange={e => onChange(e.target.checked)}
          style={{ width: 18, height: 18, accentColor: C.accent, cursor: 'pointer' }}
        />
        <span style={{ color: C.muted, fontSize: 13 }}>{fieldKey}</span>
      </div>
    )
  }

  if (def.type === 'select' || def.type === 'status') {
    const options = def.type === 'select'
      ? (def.select?.options || [])
      : (def.status?.options || [])
    return (
      <select
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        style={{ ...inputStyle, cursor: 'pointer' }}
      >
        <option value="">-- Select --</option>
        {options.map(opt => (
          <option key={opt.name} value={opt.name}>{opt.name}</option>
        ))}
      </select>
    )
  }

  if (def.type === 'date') {
    return (
      <input
        type="date"
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        style={{ ...inputStyle, direction: 'ltr' }}
      />
    )
  }

  if (def.type === 'number') {
    return (
      <input
        type="number"
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        style={inputStyle}
      />
    )
  }

  // title and rich_text
  return (
    <input
      type="text"
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      placeholder={`Enter ${fieldKey}...`}
      style={inputStyle}
    />
  )
}

// ─── Task Modal (Create / Edit) ───────────────────────────────────────────────
function TaskModal({ mode, schema, initialValues = {}, onClose, onSave, saving }) {
  const editableSchema = getEditableSchema(schema)
  const [form, setForm] = useState(initialValues)

  function handleChange(key, val) {
    setForm(prev => ({ ...prev, [key]: val }))
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
        backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center',
        alignItems: 'center', zIndex: 1000, padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: C.surface, borderRadius: 20, padding: '32px 36px',
          width: '100%', maxWidth: 520, maxHeight: '80vh', overflowY: 'auto',
          border: `1px solid ${C.border}`, boxShadow: '0 25px 60px rgba(0,0,0,0.6)',
        }}
      >
        {/* Modal Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted }}>
            <X size={20} />
          </button>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: C.text, margin: 0, textAlign: 'left' }}>
              {mode === 'create' ? '➕ Add New Task' : '✏️ Edit Task'}
            </h2>
          </div>
        </div>

        {/* Form Fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {Object.entries(editableSchema).map(([key, def]) => (
            def.type !== 'checkbox' ? (
              <div key={key}>
                <label style={{ display: 'block', fontSize: 13, color: C.muted, marginBottom: 8, textAlign: 'left', fontWeight: 500 }}>
                  {key}
                </label>
                <DynamicField
                  fieldKey={key}
                  def={def}
                  value={form[key]}
                  onChange={val => handleChange(key, val)}
                />
              </div>
            ) : (
              <div key={key}>
                <DynamicField
                  fieldKey={key}
                  def={def}
                  value={form[key]}
                  onChange={val => handleChange(key, val)}
                />
              </div>
            )
          ))}
        </div>

        {/* Modal Actions */}
        <div style={{ display: 'flex', gap: 12, marginTop: 32 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: '12px 0', borderRadius: 12,
              border: `1px solid ${C.border}`, background: 'transparent',
              color: C.muted, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(form)}
            disabled={saving}
            style={{
              flex: 1, padding: '12px 0', borderRadius: 12, border: 'none',
              background: `linear-gradient(135deg, #d4a843, ${C.accent})`,
              color: '#000', cursor: saving ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', fontWeight: 700, fontSize: 15,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={16} />}
            {mode === 'create' ? 'Add' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Tasks Page ──────────────────────────────────────────────────────────
export default function Tasks() {
  const _c = pageCache.get(PC) || {}
  const [databases, setDatabases]   = useState(_c.databases ?? [])
  const [selectedDb, setSelectedDb] = useState(_c.selectedDb ?? null)
  const [schema, setSchema]         = useState(_c.schema ?? {})
  const [tasks, setTasks]           = useState(_c.tasks ?? [])
  const [loading, setLoading]       = useState(!pageCache.has(PC))
  const [tasksLoading, setTasksLoading] = useState(false)
  const [error, setError]           = useState(null)

  // Modal states
  const [showModal, setShowModal]   = useState(false)
  const [editingTask, setEditingTask] = useState(null) // null = create mode
  const [saving, setSaving]         = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null) // task id to confirm delete
  const [deleting, setDeleting]     = useState(false)

  useEffect(() => { fetchDatabases() }, [])
  useEffect(() => { if (selectedDb) { fetchTasks(selectedDb.id); fetchSchema(selectedDb.id) } }, [selectedDb])

  async function fetchDatabases() {
    try {
      if (!pageCache.has(PC)) setLoading(true)
      const res = await optimizedAPI.get('/notion/databases', {}, true, 300000)
      setDatabases(res.data)
      const first = pageCache.get(PC)?.selectedDb || (res.data.length > 0 ? res.data[0] : null)
      if (first) setSelectedDb(first)
      pageCache.set(PC, { ...pageCache.get(PC), databases: res.data, selectedDb: first })
    } catch (err) {
      setError(err.response?.data?.message || err.message)
    } finally {
      setLoading(false)
    }
  }

  async function fetchSchema(dbId) {
    try {
      const res = await optimizedAPI.get(`/notion/databases/${dbId}`, {}, true, 300000)
      setSchema(res.data.properties || {})
    } catch (err) {
      console.error('[Schema]', err.message)
    }
  }

  async function fetchTasks(dbId) {
    try {
      setTasksLoading(true)
      const res = await optimizedAPI.get(`/notion/databases/${dbId}/query`, {}, true, 300000)
      setTasks(res.data)
    } catch (err) {
      console.error(err)
    } finally {
      setTasksLoading(false)
    }
  }

  // ── Extract initial values from a task for the edit form ──
  function extractFormValues(task) {
    const values = {}
    const editableSchema = getEditableSchema(schema)
    for (const [key, def] of Object.entries(editableSchema)) {
      const prop = task.properties[key]
      if (!prop) continue
      if (def.type === 'title')      values[key] = prop.title?.map(t => t.plain_text).join('') || ''
      if (def.type === 'rich_text')  values[key] = prop.rich_text?.map(t => t.plain_text).join('') || ''
      if (def.type === 'number')     values[key] = prop.number ?? ''
      if (def.type === 'checkbox')   values[key] = prop.checkbox ?? false
      if (def.type === 'select')     values[key] = prop.select?.name ?? ''
      if (def.type === 'status')     values[key] = prop.status?.name ?? ''
      if (def.type === 'date')       values[key] = prop.date?.start ?? ''
      if (def.type === 'multi_select') values[key] = prop.multi_select?.map(s => s.name) ?? []
    }
    return values
  }

  async function handleSave(formValues) {
    const properties = buildNotionProperties(schema, formValues)
    setSaving(true)
    try {
      if (editingTask) {
        await optimizedAPI.patch(`/notion/pages/${editingTask.id}`, { properties })
      } else {
        await optimizedAPI.post(`/notion/databases/${selectedDb.id}/pages`, { properties })
      }
      setShowModal(false)
      setEditingTask(null)
      fetchTasks(selectedDb.id)
    } catch (err) {
      alert('Save failed: ' + (err.response?.data?.message || err.message))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(taskId) {
    setDeleting(true)
    try {
      await optimizedAPI.delete(`/notion/pages/${taskId}`)
      setDeleteConfirm(null)
      fetchTasks(selectedDb.id)
    } catch (err) {
      alert('Delete failed: ' + (err.response?.data?.message || err.message))
    } finally {
      setDeleting(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────

  if (loading) return <div style={{ color: C.muted, padding: 60, textAlign: 'center', fontSize: 15 }}>⏳ Loading Notion databases...</div>

  if (error) return (
    <div style={{ padding: 60, textAlign: 'center' }}>
      <p style={{ fontSize: 48, marginBottom: 16 }}>📝</p>
      <h2 style={{ color: C.red, fontSize: 22, marginBottom: 8 }}>Could not connect to Notion</h2>
      <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.7 }}>{error}<br />Please make sure Notion is connected in Settings and that your databases are shared with the integration.</p>
    </div>
  )

  if (databases.length === 0) return (
    <div style={{ padding: 60, textAlign: 'center' }}>
      <p style={{ fontSize: 48, marginBottom: 16 }}>🗂️</p>
      <h2 style={{ color: C.text, fontSize: 22, marginBottom: 8 }}>No databases found</h2>
      <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.7 }}>No shared databases were found.<br />Open the database in Notion, click Share, and enable access for the integration.</p>
    </div>
  )

  const columns = tasks.length > 0 ? Object.keys(tasks[0].properties || {}) : []

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1400, margin: '0 auto' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <button
          onClick={() => { setEditingTask(null); setShowModal(true) }}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 20px', borderRadius: 12, border: 'none',
            background: `linear-gradient(135deg, #d4a843, ${C.accent})`,
            color: '#000', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          <Plus size={18} /> Add Task
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, margin: 0, textAlign: 'left' }}>Tasks & Work Boards</h1>
            <p style={{ fontSize: 13, color: C.muted, marginTop: 4, textAlign: 'left' }}>Data synced directly from Notion</p>
          </div>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <LayoutList size={22} color={C.accent} />
          </div>
        </div>
      </div>

      {/* ── Database Tabs ───────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 12, marginBottom: 28 }}>
        {databases.map(db => (
          <button
            key={db.id}
            onClick={() => setSelectedDb(db)}
            style={{
              padding: '9px 20px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
              border: `1px solid ${selectedDb?.id === db.id ? C.accent : C.border}`,
              background: selectedDb?.id === db.id ? 'rgba(201,165,90,0.12)' : 'transparent',
              color: selectedDb?.id === db.id ? C.accent : C.muted,
              display: 'flex', alignItems: 'center', gap: 8,
              fontWeight: selectedDb?.id === db.id ? 600 : 400,
              transition: 'all 0.2s',
            }}
          >
            <Database size={15} /> {db.title}
          </button>
        ))}
      </div>

      {/* ── Tasks Table ─────────────────────────────────────────────────────── */}
      <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
        {tasksLoading ? (
          <div style={{ padding: 60, textAlign: 'center', color: C.muted }}>⏳ Loading data...</div>
        ) : tasks.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: C.dim }}>
            <FileText size={48} style={{ margin: '0 auto 16px', opacity: 0.4 }} />
            <p>This database is empty. Click "Add Task" to get started.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: C.surface, borderBottom: `1px solid ${C.border}` }}>
                  {columns.map(col => (
                    <th key={col} style={{ padding: '14px 20px', fontSize: 12, fontWeight: 600, color: C.muted, whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {col}
                    </th>
                  ))}
                  <th style={{ padding: '14px 20px', width: 110, textAlign: 'center', fontSize: 12, fontWeight: 600, color: C.muted }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map(task => (
                  <tr
                    key={task.id}
                    style={{ borderBottom: `1px solid ${C.border}`, transition: 'background 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    {columns.map(col => (
                      <td key={col} style={{ padding: '14px 20px', fontSize: 14, color: C.text, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {getPropText(task.properties[col]) || <span style={{ color: C.dim }}>—</span>}
                      </td>
                    ))}
                    <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                        {/* Edit */}
                        <button
                          onClick={() => { setEditingTask(task); setShowModal(true) }}
                          title="Edit"
                          style={{
                            background: 'rgba(201,165,90,0.1)', border: `1px solid rgba(201,165,90,0.3)`,
                            borderRadius: 8, padding: '6px 10px', cursor: 'pointer', color: C.accent,
                            display: 'flex', alignItems: 'center',
                          }}
                        >
                          <Pencil size={14} />
                        </button>
                        {/* View in Notion */}
                        <a
                          href={task.url}
                          target="_blank"
                          rel="noreferrer"
                          title="View in Notion"
                          style={{
                            background: 'rgba(255,255,255,0.05)', border: `1px solid ${C.border}`,
                            borderRadius: 8, padding: '6px 10px', cursor: 'pointer', color: C.muted,
                            display: 'flex', alignItems: 'center', textDecoration: 'none',
                          }}
                        >
                          <ArrowRight size={14} />
                        </a>
                        {/* Delete */}
                        <button
                          onClick={() => setDeleteConfirm(task.id)}
                          title="Delete"
                          style={{
                            background: 'rgba(248,113,113,0.1)', border: `1px solid rgba(248,113,113,0.3)`,
                            borderRadius: 8, padding: '6px 10px', cursor: 'pointer', color: C.red,
                            display: 'flex', alignItems: 'center',
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Create / Edit Modal ─────────────────────────────────────────────── */}
      {showModal && (
        <TaskModal
          mode={editingTask ? 'edit' : 'create'}
          schema={schema}
          initialValues={editingTask ? extractFormValues(editingTask) : {}}
          onClose={() => { setShowModal(false); setEditingTask(null) }}
          onSave={handleSave}
          saving={saving}
        />
      )}

      {/* ── Delete Confirm Modal ────────────────────────────────────────────── */}
      {deleteConfirm && (
        <div
          onClick={() => setDeleteConfirm(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
            backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center',
            alignItems: 'center', zIndex: 1000,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: C.surface, borderRadius: 20, padding: '36px 40px', width: 400,
              border: `1px solid rgba(248,113,113,0.35)`, boxShadow: '0 25px 60px rgba(0,0,0,0.6)',
              textAlign: 'center',
            }}
          >
            <p style={{ fontSize: 48, marginBottom: 12 }}>🗑️</p>
            <h3 style={{ color: C.text, fontSize: 20, marginBottom: 10 }}>Confirm Delete</h3>
            <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.7, marginBottom: 28 }}>
              This task will be archived in Notion and hidden. Are you sure?
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => setDeleteConfirm(null)}
                style={{ flex: 1, padding: 12, borderRadius: 12, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                disabled={deleting}
                style={{ flex: 1, padding: 12, borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#f87171,#ef4444)', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }}
              >
                {deleting ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={16} />}
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
