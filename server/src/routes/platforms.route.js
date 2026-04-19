// ─── Platforms Route ──────────────────────────────────────────────────────────
const express = require('express')
const router = express.Router()
const ctrl = require('../controllers/platforms.controller')
const { verifyToken } = require('../middleware/auth.middleware')

router.get('/',                        verifyToken, ctrl.getPlatforms)
router.post('/sync-all',               verifyToken, ctrl.syncAll)
router.post('/:name/connect',          verifyToken, ctrl.connectPlatform)
router.post('/:name/disconnect',       verifyToken, ctrl.disconnectPlatform)
router.post('/:name/sync',             verifyToken, ctrl.syncPlatform)
router.post('/:name/refresh-token',    verifyToken, ctrl.refreshToken)

module.exports = router
