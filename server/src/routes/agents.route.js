// ─── Agents Route ─────────────────────────────────────────────────────────────
const express = require('express')
const router = express.Router()
const ctrl = require('../controllers/agents.controller')
const { verifyToken } = require('../middleware/auth.middleware')

router.get('/',         verifyToken, ctrl.getAgents)
router.put('/:name',    verifyToken, ctrl.updateAgent)

module.exports = router
