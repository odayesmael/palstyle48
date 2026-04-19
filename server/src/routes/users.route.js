const express = require('express')
const router = express.Router()
const usersController = require('../controllers/users.controller')
const { verifyToken, requireRole } = require('../middleware/auth.middleware')

// All routes require admin role
router.use(verifyToken)
router.use(requireRole('admin'))

// GET /api/users
router.get('/', usersController.listUsers)

// POST /api/users
router.post('/', usersController.createUser)

// PUT /api/users/:id
router.put('/:id', usersController.updateUser)

// DELETE /api/users/:id
router.delete('/:id', usersController.deleteUser)

module.exports = router
