// ─── Tasks Routes — Full CRUD ─────────────────────────────────────────────────
const express = require('express')
const router  = express.Router()
const prisma  = require('../lib/prisma')
const { verifyToken } = require('../middleware/auth.middleware')
const { ok, fail, paginated } = require('../utils/apiResponse')

router.use(verifyToken)

// ── GET /api/tasks — list with filters ────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      status = 'all',
      priority = 'all',
      assignee = 'all',
      sortBy = 'newest',
    } = req.query

    const where = {}
    if (status   !== 'all') where.status   = status
    if (priority !== 'all') where.priority = priority
    if (assignee !== 'all') where.assignedToId = assignee

    const orderBy = {
      newest:   { createdAt: 'desc' },
      oldest:   { createdAt: 'asc' },
      due_soon: { dueDate: 'asc' },
      priority: { priority: 'desc' },
    }[sortBy] || { createdAt: 'desc' }

    const skip = (Number(page) - 1) * Number(limit)

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        orderBy,
        skip,
        take: Number(limit),
        include: {
          assignedTo: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.task.count({ where }),
    ])

    res.json(paginated(tasks, total, page, limit))
  } catch (err) {
    console.error('[Tasks] list error:', err)
    res.status(500).json(fail(err.message))
  }
})

// ── GET /api/tasks/stats — task statistics ────────────────────────────────────
router.get('/stats', async (_req, res) => {
  try {
    const [todo, inProgress, done, cancelled, overdue] = await Promise.all([
      prisma.task.count({ where: { status: 'todo' } }),
      prisma.task.count({ where: { status: 'in_progress' } }),
      prisma.task.count({ where: { status: 'done' } }),
      prisma.task.count({ where: { status: 'cancelled' } }),
      prisma.task.count({
        where: {
          status: { in: ['todo', 'in_progress'] },
          dueDate: { lt: new Date() },
        },
      }),
    ])
    res.json(ok({ todo, inProgress, done, cancelled, overdue, total: todo + inProgress + done + cancelled }))
  } catch (err) {
    res.status(500).json(fail(err.message))
  }
})

// ── GET /api/tasks/:id — single task ──────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const task = await prisma.task.findUnique({
      where: { id: req.params.id },
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
      },
    })
    if (!task) return res.status(404).json(fail('Task not found'))
    res.json(ok(task))
  } catch (err) {
    res.status(500).json(fail(err.message))
  }
})

// ── POST /api/tasks — create task ─────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { title, description, status, priority, dueDate, assignedToId, relatedCustomerId, relatedOrderId } = req.body
    if (!title) return res.status(400).json(fail('Title is required'))

    const task = await prisma.task.create({
      data: {
        title,
        description: description || null,
        status: status || 'todo',
        priority: priority || 'medium',
        dueDate: dueDate ? new Date(dueDate) : null,
        assignedToId: assignedToId || null,
        relatedCustomerId: relatedCustomerId || null,
        relatedOrderId: relatedOrderId || null,
      },
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
      },
    })
    res.status(201).json(ok(task))
  } catch (err) {
    console.error('[Tasks] create error:', err)
    res.status(500).json(fail(err.message))
  }
})

// ── PUT /api/tasks/:id — update task ──────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { title, description, status, priority, dueDate, assignedToId, relatedCustomerId, relatedOrderId } = req.body

    const data = {}
    if (title !== undefined)              data.title = title
    if (description !== undefined)        data.description = description
    if (status !== undefined)             data.status = status
    if (priority !== undefined)           data.priority = priority
    if (dueDate !== undefined)            data.dueDate = dueDate ? new Date(dueDate) : null
    if (assignedToId !== undefined)       data.assignedToId = assignedToId || null
    if (relatedCustomerId !== undefined)  data.relatedCustomerId = relatedCustomerId
    if (relatedOrderId !== undefined)     data.relatedOrderId = relatedOrderId

    // Auto-set completedAt when status changes to done
    if (status === 'done') data.completedAt = new Date()
    if (status === 'todo' || status === 'in_progress') data.completedAt = null

    const task = await prisma.task.update({
      where: { id: req.params.id },
      data,
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
      },
    })
    res.json(ok(task))
  } catch (err) {
    console.error('[Tasks] update error:', err)
    res.status(500).json(fail(err.message))
  }
})

// ── PUT /api/tasks/:id/status — quick status change ──────────────────────────
router.put('/:id/status', async (req, res) => {
  try {
    const { status } = req.body
    const allowed = ['todo', 'in_progress', 'done', 'cancelled']
    if (!allowed.includes(status)) {
      return res.status(400).json(fail(`Invalid status. Allowed: ${allowed.join(', ')}`))
    }

    const data = { status }
    if (status === 'done') data.completedAt = new Date()
    if (status === 'todo' || status === 'in_progress') data.completedAt = null

    const task = await prisma.task.update({
      where: { id: req.params.id },
      data,
    })
    res.json(ok(task))
  } catch (err) {
    res.status(500).json(fail(err.message))
  }
})

// ── DELETE /api/tasks/:id — delete task ───────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    await prisma.task.delete({ where: { id: req.params.id } })
    res.json(ok({ deleted: true }))
  } catch (err) {
    res.status(500).json(fail(err.message))
  }
})

module.exports = router
