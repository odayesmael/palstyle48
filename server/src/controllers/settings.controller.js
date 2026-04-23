// ─── Settings Controller ──────────────────────────────────────────────────────
const prisma = require('../lib/prisma')

/**
 * GET /api/settings
 */
async function getSettings(_req, res) {
  try {
    const settings = await prisma.systemSetting.findMany()
    const result = {}
    
    // Sensible defaults
    const defaults = {
      store_name: 'palstyle48',
      default_currency: 'USD',
      timezone: 'Asia/Istanbul',
      ai_provider: 'groq',
      groq_api_key: '',
      ollama_url: 'http://localhost:11434',
    }
    
    if (settings && settings.length > 0) {
      settings.forEach(s => { result[s.key] = s.value })
    }
    
    // Merge DB values over defaults
    const finalSettings = { ...defaults, ...result }

    return res.json({ success: true, settings: finalSettings })
  } catch (err) {
    console.error('[Settings/getSettings]', err)
    return res.status(500).json({ error: err.message })
  }
}

/**
 * PUT /api/settings
 */
async function updateSettings(req, res) {
  try {
    const ObjectData = req.body || {}
    for (const [key, value] of Object.entries(ObjectData)) {
      if (!key) continue;
      await prisma.systemSetting.upsert({
        where: { key: key },
        update: { value: value },
        create: { key: key, value: value },
      })
    }
    return res.json({ success: true, message: 'تم حفظ الإعدادات بنجاح' })
  } catch (err) {
    console.error('[Settings/updateSettings]', err)
    return res.status(500).json({ error: err.message })
  }
}

/**
 * GET /api/auth/sessions  — mock login history
 */
async function getSessions(req, res) {
  try {
    const mock = Array.from({ length: 8 }, (_, i) => ({
      id: i + 1,
      ip: `192.168.1.${10 + i}`,
      success: i % 3 !== 2,
      createdAt: new Date(Date.now() - i * 3600000 * 6).toISOString(),
      device: i % 2 === 0 ? 'Chrome / macOS' : 'Safari / iOS',
    }))
    return res.json({ success: true, sessions: mock })
  } catch (err) {
    return res.status(500).json({ success: false, message: 'خطأ في الخادم' })
  }
}

/**
 * PUT /api/auth/password
 */
async function changePassword(req, res) {
  try {
    const bcrypt = require('bcryptjs')
    const { currentPassword, newPassword } = req.body
    if (!currentPassword || !newPassword)
      return res.status(400).json({ success: false, message: 'جميع الحقول مطلوبة' })
    if (newPassword.length < 8)
      return res.status(400).json({ success: false, message: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' })

    const user = await prisma.user.findUnique({ where: { id: req.user.id } })
    const match = await bcrypt.compare(currentPassword, user.password)
    if (!match)
      return res.status(401).json({ success: false, message: 'كلمة المرور الحالية غير صحيحة' })

    const hashed = await bcrypt.hash(newPassword, 12)
    await prisma.user.update({ where: { id: req.user.id }, data: { password: hashed } })
    return res.json({ success: true, message: 'تم تغيير كلمة المرور بنجاح' })
  } catch (err) {
    console.error('[Settings/changePassword]', err)
    return res.status(500).json({ success: false, message: 'خطأ في الخادم' })
  }
}

module.exports = { getSettings, updateSettings, getSessions, changePassword }
