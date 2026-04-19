const jwt = require('jsonwebtoken')

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_in_production'

/**
 * Middleware to verify JWT token.
 * Attaches decoded user payload to req.user.
 */
function verifyToken(req, res, next) {
  let token = null
  const authHeader = req.headers.authorization

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1]
  } else if (req.query?.token) {
    // Fallback for OAuth popups (window.open cannot set headers)
    token = req.query.token
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'يرجى تسجيل الدخول أولاً' })
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    req.user = decoded
    next()
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'انتهت صلاحية الجلسة، يرجى تسجيل الدخول مجدداً' })
    }
    return res.status(401).json({ success: false, message: 'رمز مصادقة غير صالح' })
  }
}

/**
 * Middleware to check user role.
 * Usage: requireRole('ADMIN')
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'غير مصرح' })
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'ليس لديك صلاحية للوصول لهذا المورد' })
    }
    next()
  }
}

module.exports = { verifyToken, requireRole }
