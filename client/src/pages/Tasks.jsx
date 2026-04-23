import { useState, useEffect } from 'react'
import optimizedAPI from '../services/optimizedAPI'
import {
  LayoutList, Plus, Pencil, Trash2, X, Check, Loader2,
  Clock, AlertTriangle, AlertCircle, Calendar, MessageSquare, ListTodo
} from 'lucide-react'

const C = {
  bg: '#0f1117', surface: '#161921', card: '#1c1f29',
  border: '#2a2d3a', accent: '#c9a55a', text: '#e8e8ec',
  muted: '#8b8fa4', dim: '#5a5e72',
  red: '#ef4444', orange: '#f97316', yellow: '#eab308', green: '#10b981', blue: '#3b82f6'
}

const STATUSES = [
  { id: 'todo', label: 'To Do', color: C.blue },
  { id: 'in_progress', label: 'In Progress', color: C.yellow },
  { id: 'done', label: 'Done', color: C.green },
]

const PRIORITIES = [
  { id: 'low', label: 'Low', color: C.dim },
  { id: 'medium', label: 'Medium', color: C.blue },
  { id: 'high', label: 'High', color: C.orange },
  { id: 'urgent', label: 'Urgent', color: C.red },
]

export default function Tasks() {
  const [tasks, setTasks] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Modals
  const [showModal, setShowModal] = useState(false)
  const [editingTask, setEditingTask] = useState(null)
  const [saving, setSaving] = useState(false)

  // Form State
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium', dueDate: '', status: 'todo' })

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    try {
      setLoading(true)
      const [tasksRes, statsRes] = await Promise.all([
        optimizedAPI.get('/tasks'),
        optimizedAPI.get('/tasks/stats')
      ])
      setTasks(tasksRes.data?.tasks || [])
      setStats(statsRes.data?.stats || null)
    } catch (err) {
      setError('Failed to load tasks. Please try again.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  function handleOpenModal(task = null) {
    if (task) {
      setEditingTask(task)
      setForm({
        title: task.title,
        description: task.description || '',
        priority: task.priority,
        dueDate: task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : '',
        status: task.status
      })
    } else {
      setEditingTask(null)
      setForm({ title: '', description: '', priority: 'medium', dueDate: '', status: 'todo' })
    }
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.title.trim()) return alert('Title is required')
    setSaving(true)
    try {
      if (editingTask) {
        await optimizedAPI.put(`/tasks/${editingTask.id}`, form)
      } else {
        await optimizedAPI.post('/tasks', form)
      }
      setShowModal(false)
      fetchData()
    } catch (err) {
      alert('Save failed: ' + (err.response?.data?.message || err.message))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    if (!confirm('Are you sure you want to delete this task?')) return
    try {
      await optimizedAPI.delete(`/tasks/${id}`)
      fetchData()
    } catch (err) {
      alert('Delete failed')
    }
  }

  async function changeStatus(id, newStatus) {
    try {
      setTasks(tasks.map(t => t.id === id ? { ...t, status: newStatus } : t))
      await optimizedAPI.put(`/tasks/${id}/status`, { status: newStatus })
      fetchData()
    } catch (err) {
      fetchData() // revert
    }
  }

  // Kanban Grouping
  const columns = {
    todo: tasks.filter(t => t.status === 'todo'),
    in_progress: tasks.filter(t => t.status === 'in_progress'),
    done: tasks.filter(t => t.status === 'done')
  }

  if (loading && tasks.length === 0) return <div style={{ color: C.muted, padding: 60, textAlign: 'center' }}>Loading tasks...</div>
  if (error) return <div style={{ color: C.red, padding: 60, textAlign: 'center' }}>{error}</div>

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1400, margin: '0 auto' }}>
      
      {/* Header & Stats */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: C.text, margin: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
            <ListTodo size={28} color={C.accent} />
            Task Management
          </h1>
          <p style={{ fontSize: 14, color: C.muted, marginTop: 6 }}>Manage your CRM workflow and operations.</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 20px', borderRadius: 10, border: 'none',
            background: `linear-gradient(135deg, ${C.accent}, #e0be77)`,
            color: '#000', fontWeight: 700, fontSize: 14, cursor: 'pointer',
            boxShadow: '0 4px 15px rgba(201, 165, 90, 0.2)'
          }}
        >
          <Plus size={18} /> New Task
        </button>
      </div>

      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
          {[
            { label: 'To Do', val: stats.todo, color: C.blue, icon: ListTodo },
            { label: 'In Progress', val: stats.inProgress, color: C.yellow, icon: Clock },
            { label: 'Done', val: stats.done, color: C.green, icon: Check },
            { label: 'Overdue', val: stats.overdue, color: C.red, icon: AlertCircle }
          ].map((s, i) => (
            <div key={i} style={{ background: C.surface, borderRadius: 16, padding: 20, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ background: `${s.color}15`, padding: 12, borderRadius: 12, color: s.color }}>
                <s.icon size={24} />
              </div>
              <div>
                <div style={{ fontSize: 24, fontWeight: 700, color: C.text }}>{s.val}</div>
                <div style={{ fontSize: 13, color: C.muted }}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Kanban Board */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24, alignItems: 'start' }}>
        {STATUSES.map(col => (
          <div key={col.id} style={{ background: C.surface, borderRadius: 16, border: `1px solid ${C.border}`, padding: 20, minHeight: 400 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: col.color }} />
                <h3 style={{ fontSize: 16, fontWeight: 600, color: C.text, margin: 0 }}>{col.label}</h3>
              </div>
              <span style={{ background: C.card, padding: '4px 10px', borderRadius: 20, fontSize: 12, color: C.muted, fontWeight: 600 }}>
                {columns[col.id].length}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {columns[col.id].map(task => {
                const priority = PRIORITIES.find(p => p.id === task.priority) || PRIORITIES[0]
                const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'done'
                
                return (
                  <div key={task.id} style={{ 
                    background: C.card, borderRadius: 12, padding: 16, 
                    border: `1px solid ${isOverdue ? C.red + '44' : C.border}`,
                    borderLeft: `4px solid ${priority.color}`,
                    transition: 'transform 0.2s', cursor: 'pointer'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <h4 style={{ margin: 0, fontSize: 15, color: C.text, fontWeight: 500, lineHeight: 1.4 }}>{task.title}</h4>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button onClick={() => handleOpenModal(task)} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', padding: 2 }}><Pencil size={14} /></button>
                        <button onClick={() => handleDelete(task.id)} style={{ background: 'none', border: 'none', color: C.red, cursor: 'pointer', padding: 2 }}><Trash2 size={14} /></button>
                      </div>
                    </div>
                    
                    {task.description && (
                      <p style={{ fontSize: 13, color: C.muted, margin: '0 0 12px 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {task.description}
                      </p>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        {task.dueDate && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: isOverdue ? C.red : C.muted, background: isOverdue ? C.red+'11' : C.bg, padding: '4px 8px', borderRadius: 6 }}>
                            <Calendar size={12} /> {new Date(task.dueDate).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                      
                      {/* Status Dropdown to Move Task */}
                      <select 
                        value={task.status} 
                        onChange={(e) => changeStatus(task.id, e.target.value)}
                        style={{
                          background: C.bg, border: `1px solid ${C.border}`, color: C.text,
                          fontSize: 11, padding: '4px 8px', borderRadius: 6, outline: 'none', cursor: 'pointer'
                        }}
                      >
                        {STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                      </select>
                    </div>
                  </div>
                )
              })}
              
              {columns[col.id].length === 0 && (
                <div style={{ textAlign: 'center', padding: '32px 0', color: C.dim, fontSize: 13, border: `1px dashed ${C.border}`, borderRadius: 12 }}>
                  No tasks here
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── Modal ── */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ background: C.surface, width: 500, borderRadius: 20, padding: 32, border: `1px solid ${C.border}`, boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>
            <h2 style={{ margin: '0 0 24px 0', fontSize: 20, color: C.text }}>{editingTask ? 'Edit Task' : 'New Task'}</h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, color: C.muted, marginBottom: 6 }}>Title *</label>
                <input 
                  value={form.title} onChange={e => setForm({...form, title: e.target.value})}
                  style={{ width: '100%', padding: '10px 14px', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, outline: 'none' }} 
                  placeholder="Task title"
                />
              </div>
              
              <div>
                <label style={{ display: 'block', fontSize: 13, color: C.muted, marginBottom: 6 }}>Description</label>
                <textarea 
                  value={form.description} onChange={e => setForm({...form, description: e.target.value})}
                  style={{ width: '100%', padding: '10px 14px', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, outline: 'none', minHeight: 80, resize: 'vertical' }} 
                  placeholder="Details..."
                />
              </div>

              <div style={{ display: 'flex', gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 13, color: C.muted, marginBottom: 6 }}>Priority</label>
                  <select 
                    value={form.priority} onChange={e => setForm({...form, priority: e.target.value})}
                    style={{ width: '100%', padding: '10px 14px', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, outline: 'none' }}
                  >
                    {PRIORITIES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 13, color: C.muted, marginBottom: 6 }}>Status</label>
                  <select 
                    value={form.status} onChange={e => setForm({...form, status: e.target.value})}
                    style={{ width: '100%', padding: '10px 14px', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, outline: 'none' }}
                  >
                    {STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, color: C.muted, marginBottom: 6 }}>Due Date</label>
                <input 
                  type="date"
                  value={form.dueDate} onChange={e => setForm({...form, dueDate: e.target.value})}
                  style={{ width: '100%', padding: '10px 14px', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, outline: 'none', colorScheme: 'dark' }} 
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 32 }}>
              <button onClick={() => setShowModal(false)} style={{ flex: 1, padding: '12px', background: 'transparent', border: `1px solid ${C.border}`, color: C.muted, borderRadius: 10, cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
              <button disabled={saving} onClick={handleSave} style={{ flex: 1, padding: '12px', background: `linear-gradient(135deg, ${C.accent}, #e0be77)`, border: 'none', color: '#000', borderRadius: 10, cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700, display: 'flex', justifyContent: 'center', gap: 8 }}>
                {saving ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={18} />}
                Save Task
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
