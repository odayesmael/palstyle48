const express = require('express')
const router = express.Router()
const authController = require('../controllers/auth.controller')
const { verifyToken } = require('../middleware/auth.middleware')

// POST /api/auth/login
router.post('/login', authController.login)

// POST /api/auth/logout (protected)
router.post('/logout', verifyToken, authController.logout)

// GET /api/auth/me (protected)
router.get('/me', verifyToken, authController.me)

// PUT /api/auth/password — change password (protected)
const settingsCtrl = require('../controllers/settings.controller')
router.put('/password', verifyToken, settingsCtrl.changePassword)

// GET /api/auth/sessions — login history (protected)
router.get('/sessions', verifyToken, settingsCtrl.getSessions)

module.exports = router
