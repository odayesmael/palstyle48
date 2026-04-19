// ─── Settings Route ───────────────────────────────────────────────────────────
const express = require('express')
const router = express.Router()
const ctrl = require('../controllers/settings.controller')
const { verifyToken } = require('../middleware/auth.middleware')

router.get('/',  verifyToken, ctrl.getSettings)
router.put('/',  verifyToken, ctrl.updateSettings)

module.exports = router
