const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const prisma = require('../lib/prisma')

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_in_production'
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d'

const MAX_ATTEMPTS = 3
const LOCKOUT_MINUTES = 15

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
}

function safeUser(user) {
  const { password, loginAttempts, lockUntil, ...safe } = user
  return safe
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/login
// ─────────────────────────────────────────────────────────────────────────────
async function login(req, res) {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'البريد الإلكتروني وكلمة المرور مطلوبان',
      })
    }

    // ── Find user ───────────────────────────────────────────────────────────
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } })

    if (!user) {
      // Don't reveal that the user doesn't exist
      return res.status(401).json({
        success: false,
        message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
      })
    }

    // ── Check lock ──────────────────────────────────────────────────────────
    if (user.lockUntil && new Date(user.lockUntil) > new Date()) {
      const remainingSec = Math.ceil((new Date(user.lockUntil) - Date.now()) / 1000)
      const remainingMin = Math.ceil(remainingSec / 60)
      return res.status(429).json({
        success: false,
        message: `تم تقييد الدخول مؤقتاً. حاول بعد ${remainingMin} دقيقة`,
        lockedUntil: user.lockUntil,
        remainingSeconds: remainingSec,
      })
    }

    // ── Verify password ─────────────────────────────────────────────────────
    const isMatch = await bcrypt.compare(password, user.password)

    if (!isMatch) {
      const newAttempts = user.loginAttempts + 1
      let lockUntil = null

      if (newAttempts >= MAX_ATTEMPTS) {
        lockUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000)
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { loginAttempts: newAttempts, lockUntil },
      })

      if (lockUntil) {
        return res.status(429).json({
          success: false,
          message: `تجاوزت الحد المسموح من المحاولات. تم تقييد الدخول لمدة ${LOCKOUT_MINUTES} دقيقة`,
          lockedUntil: lockUntil,
          remainingSeconds: LOCKOUT_MINUTES * 60,
        })
      }

      const remaining = MAX_ATTEMPTS - newAttempts
      return res.status(401).json({
        success: false,
        message: 'كلمة المرور غير صحيحة',
        attemptsRemaining: remaining,
      })
    }

    // ── Success — reset attempts, update lastLogin ───────────────────────────
    await prisma.user.update({
      where: { id: user.id },
      data: {
        loginAttempts: 0,
        lockUntil: null,
        lastLogin: new Date(),
      },
    })

    const token = signToken({ id: user.id, email: user.email, role: user.role, name: user.name })

    return res.json({
      success: true,
      token,
      user: safeUser(user),
    })
  } catch (err) {
    console.error('[Auth/login]', err)
    return res.status(500).json({ success: false, message: 'خطأ في الخادم' })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/auth/me
// ─────────────────────────────────────────────────────────────────────────────
async function me(req, res) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        permissions: true,
        lastLogin: true,
        createdAt: true,
      },
    })

    if (!user) {
      return res.status(404).json({ success: false, message: 'المستخدم غير موجود' })
    }

    return res.json({ success: true, user })
  } catch (err) {
    console.error('[Auth/me]', err)
    return res.status(500).json({ success: false, message: 'خطأ في الخادم' })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/logout
// ─────────────────────────────────────────────────────────────────────────────
async function logout(_req, res) {
  return res.json({ success: true, message: 'تم تسجيل الخروج بنجاح' })
}

module.exports = { login, me, logout }
