const express = require('express')
const router = express.Router()
const setupController = require('../controllers/setup.controller')

// All setup routes are public, but state checks in the controllers ensure they can only be run once.
router.get('/status', setupController.checkStatus)
router.post('/create-admin', setupController.createAdmin)
router.post('/connect-platform', setupController.connectPlatform)
router.post('/initial-sync', setupController.initialSync)
router.post('/configure-agents', setupController.configureAgents)

module.exports = router
