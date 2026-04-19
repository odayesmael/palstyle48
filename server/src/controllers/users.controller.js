// ─── Users Controller — Admin-only CRUD ──────────────────────────────────────
const bcrypt = require('bcryptjs')
const prisma = require('../lib/prisma')

const ALL_PERMISSIONS = [
  'dashboard', 'customers', 'inbox', 'content', 'ads',
  'finance', 'inventory', 'agents', 'settings', 'users', 'tasks',
]

function safeUser(user) {
  const { password, loginAttempts, lockUntil, ...safe } = user
  return safe
}

/**
 * GET /api/users — list all users
 */
async function listUsers(req, res) {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        permissions: true,
        lastLogin: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'asc' },
    })
    return res.json({ success: true, users })
  } catch (err) {
    console.error('[Users/list]', err)
    return res.status(500).json({ success: false, message: 'خطأ في الخادم' })
  }
}

/**
 * POST /api/users — create a new user
 */
async function createUser(req, res) {
  try {
    const { email, password, name, role, permissions } = req.body

    if (!email || !password || !name) {
      return res.status(400).json({ success: false, message: 'جميع الحقول مطلوبة (الاسم، البريد، كلمة المرور)' })
    }

    if (password.length < 8) {
      return res.status(400).json({ success: false, message: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' })
    }

    const validRoles = ['admin', 'editor', 'viewer']
    const userRole = validRoles.includes(role) ? role : 'viewer'

    // Build permissions object
    let userPermissions = {}
    if (userRole === 'admin') {
      // Admin gets all permissions
      ALL_PERMISSIONS.forEach(p => { userPermissions[p] = true })
    } else if (permissions && typeof permissions === 'object') {
      ALL_PERMISSIONS.forEach(p => { userPermissions[p] = !!permissions[p] })
    } else {
      // Default viewer permissions
      userPermissions = { dashboard: true }
    }

    const hashed = await bcrypt.hash(password, 12)

    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase().trim(),
        password: hashed,
        name,
        role: userRole,
        permissions: userPermissions,
      },
    })

    return res.status(201).json({ success: true, user: safeUser(user) })
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ success: false, message: 'البريد الإلكتروني مستخدم بالفعل' })
    }
    console.error('[Users/create]', err)
    return res.status(500).json({ success: false, message: 'خطأ في الخادم' })
  }
}

/**
 * PUT /api/users/:id — update user
 */
async function updateUser(req, res) {
  try {
    const { id } = req.params
    const { name, email, role, permissions, password } = req.body

    const existing = await prisma.user.findUnique({ where: { id } })
    if (!existing) {
      return res.status(404).json({ success: false, message: 'المستخدم غير موجود' })
    }

    const validRoles = ['admin', 'editor', 'viewer']
    const data = {}

    if (name) data.name = name
    if (email) data.email = email.toLowerCase().trim()
    if (role && validRoles.includes(role)) {
      data.role = role
      if (role === 'admin') {
        const allPerms = {}
        ALL_PERMISSIONS.forEach(p => { allPerms[p] = true })
        data.permissions = allPerms
      }
    }
    if (permissions && typeof permissions === 'object') {
      const userPermissions = {}
      ALL_PERMISSIONS.forEach(p => { userPermissions[p] = !!permissions[p] })
      data.permissions = userPermissions
    }
    if (password && password.length >= 8) {
      data.password = await bcrypt.hash(password, 12)
    }

    const user = await prisma.user.update({ where: { id }, data })
    return res.json({ success: true, user: safeUser(user) })
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ success: false, message: 'البريد الإلكتروني مستخدم بالفعل' })
    }
    console.error('[Users/update]', err)
    return res.status(500).json({ success: false, message: 'خطأ في الخادم' })
  }
}

/**
 * DELETE /api/users/:id — delete user
 */
async function deleteUser(req, res) {
  try {
    const { id } = req.params

    // Prevent admin from deleting themselves
    if (id === req.user.id) {
      return res.status(400).json({ success: false, message: 'لا يمكنك حذف حسابك الخاص' })
    }

    const existing = await prisma.user.findUnique({ where: { id } })
    if (!existing) {
      return res.status(404).json({ success: false, message: 'المستخدم غير موجود' })
    }

    // Delete associated sessions first
    await prisma.session.deleteMany({ where: { userId: id } })
    await prisma.user.delete({ where: { id } })

    return res.json({ success: true, message: 'تم حذف المستخدم بنجاح' })
  } catch (err) {
    console.error('[Users/delete]', err)
    return res.status(500).json({ success: false, message: 'خطأ في الخادم' })
  }
}

module.exports = { listUsers, createUser, updateUser, deleteUser }
