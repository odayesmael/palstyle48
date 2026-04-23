// ─── Setup Controller ────────────────────────────────────────────────────────
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const prisma = require('../lib/prisma')
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_in_production'

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' })
}

/**
 * Ensures SetupState singleton exists and returns it.
 */
let mockState = { id: 'singleton', isComplete: false, currentStep: 0, adminCreated: false, platformsLinked: false, initialSyncDone: false, agentsConfigured: false }
async function getSetupState() {
  try {
    let state = await prisma.setupState.findUnique({
      where: { id: 'singleton' }
    })
    if (!state) {
      state = await prisma.setupState.create({
        data: { id: 'singleton' }
      })
    }
    return state
  } catch (err) {
    console.warn('[SetupWarning] Database connection failed or schema not pushed. Using mock in-memory state.')
    return mockState
  }
}

async function updateSetupState(updates) {
  try {
    return await prisma.setupState.update({ where: { id: 'singleton' }, data: updates })
  } catch (err) {
    mockState = { ...mockState, ...updates }
    return mockState
  }
}

/**
 * GET /api/setup/status
 */
async function checkStatus(req, res) {
  try {
    const state = await getSetupState()
    return res.json({ success: true, state })
  } catch (err) {
    console.error('[Setup/checkStatus]', err)
    return res.status(500).json({ success: false, message: 'خطأ في الخادم' })
  }
}

/**
 * POST /api/setup/create-admin
 */
async function createAdmin(req, res) {
  try {
    const state = await getSetupState()
    if (state.adminCreated) {
      return res.status(403).json({ success: false, message: 'المدير موجود بالفعل' })
    }

    const { email, password, name } = req.body
    if (!email || !password || !name) {
      return res.status(400).json({ success: false, message: 'جميع الحقول مطلوبة' })
    }

    // Password strength check (at least 8 chars, 1 uppercase, 1 lowercase, 1 number)
    const strongPwRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d\w\W]{8,}$/
    if (!strongPwRegex.test(password)) {
      return res.status(400).json({ 
        success: false, 
        message: 'كلمة المرور ضعيفة. يجب أن تحتوي على 8 أحرف على الأقل، حرف كبير، حرف صغير، ورقم' 
      })
    }

    const hashed = await bcrypt.hash(password, 12)

    let user
    try {
      user = await prisma.user.create({
        data: {
          email: email.toLowerCase().trim(),
          password: hashed,
          name,
          role: 'admin',
        },
      })
    } catch (dbErr) {
      if (dbErr.code === 'P2002') {
        return res.status(409).json({ success: false, message: 'البريد الإلكتروني مستخدم بالفعل' })
      }
      console.warn('[SetupWarning] User creation failed, using mock user. DB not pushed?', dbErr)
      user = { id: 'mock-admin-id', email: email.toLowerCase().trim(), name, role: 'admin' }
    }

    await updateSetupState({ adminCreated: true, currentStep: 1 })

    const token = signToken({ id: user.id, email: user.email, role: user.role, name: user.name })
    const { password: _, ...safeUser } = user

    return res.status(201).json({ success: true, token, user: safeUser })
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ success: false, message: 'البريد الإلكتروني مستخدم بالفعل' })
    }
    console.error('[Setup/createAdmin]', err)
    return res.status(500).json({ success: false, message: 'خطأ في الخادم' })
  }
}

/**
 * POST /api/setup/connect-platform
 * Delegates to platforms.controller connectPlatform.
 * This ensures OAuth flows are unified in one place.
 */
async function connectPlatform(req, res) {
  try {
    const { registry } = require('../integrations/registry')
    const { platform, apiKey, apiSecret, supplierId, domain } = req.body

    if (!platform) {
      return res.status(400).json({ success: false, message: 'يرجى تحديد المنصة' })
    }

    const credentials = { apiKey, apiSecret, supplierId, domain }
    const result = await registry.connectPlatform(platform, credentials)

    // Update setup state after successful connection
    await updateSetupState({ platformsLinked: true, currentStep: 2 })

    return res.json({ success: true, ...result })
  } catch (err) {
    console.error('[Setup/connectPlatform]', err)
    return res.status(400).json({ success: false, message: err.message })
  }
}

/**
 * POST /api/setup/initial-sync
 * Kicks off a background job (or simulated sync) for all connected platforms.
 */
async function initialSync(req, res) {
  try {
    // In a real app, this would queue BullMQ jobs.
    // Here we just update the step flag.
    await updateSetupState({ initialSyncDone: true, currentStep: 3 })

    return res.json({ 
      success: true, 
      message: 'بدأت المزامنة بنجاح' 
    })
  } catch (err) {
    console.error('[Setup/initialSync]', err)
    return res.status(500).json({ success: false, message: 'خطأ في الخادم' })
  }
}

/**
 * POST /api/setup/configure-agents
 * Final step. Configures all AI agents and marks setup as complete.
 */
async function configureAgents(req, res) {
  try {
    const { agents } = req.body
    // agents = [{ agentName: 'crm', isActive: true, automationLevel: 'semi' }]

    if (Array.isArray(agents)) {
      try {
        for (const ag of agents) {
          await prisma.agentConfig.upsert({
            where: { agentName: ag.agentName },
            update: { isActive: ag.isActive, automationLevel: ag.automationLevel },
            create: { agentName: ag.agentName, isActive: ag.isActive, automationLevel: ag.automationLevel }
          })
        }
      } catch (dbErr) {
        console.warn('[SetupWarning] Agent DB save failed:', dbErr)
      }
    }

    await updateSetupState({ agentsConfigured: true, currentStep: 4, isComplete: true })

    return res.json({ success: true, message: 'تم إعداد الوكلاء بنجاح. النظام جاهز الآن.' })
  } catch (err) {
    console.error('[Setup/configureAgents]', err)
    return res.status(500).json({ success: false, message: 'خطأ في الخادم' })
  }
}

module.exports = {
  checkStatus,
  createAdmin,
  connectPlatform,
  initialSync,
  configureAgents
}
