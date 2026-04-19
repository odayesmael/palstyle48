// ─── Notion Router ────────────────────────────────────────────────────────────
const express = require('express')
const router = express.Router()
const ctrl = require('../controllers/notion.controller')
const { verifyToken } = require('../middleware/auth.middleware')

// Routes
router.get('/databases',               verifyToken, ctrl.getDatabases)
router.get('/databases/:id',           verifyToken, ctrl.getDatabaseSchema)
router.get('/databases/:id/query',     verifyToken, ctrl.queryDatabase)
router.post('/databases/:id/pages',    verifyToken, ctrl.createTask)
router.patch('/pages/:pageId',         verifyToken, ctrl.updateTask)
router.delete('/pages/:pageId',        verifyToken, ctrl.deleteTask)

module.exports = router
