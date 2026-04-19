// ─── palstyle48 Command Center — Express Server ─────────────────────────────
const express = require('express')
const cors = require('cors')
const morgan = require('morgan')
const compression = require('compression')
require('dotenv').config() // loads server/.env (same dir Prisma uses)

const authRoutes = require('./routes/auth.route')
const healthRoutes = require('./routes/health.route')
const settingsRoutes = require('./routes/settings.route')
const platformsRoutes = require('./routes/platforms.route')
const agentsRoutes = require('./routes/agents.route')
const customersRoutes = require('./routes/customers.route')
const oauthRoutes = require('./routes/oauth.routes')
const webhooksRoutes = require('./routes/webhooks.route')
const inboxRoutes = require('./routes/inbox.route')
const campaignsRoutes = require('./routes/campaigns.route')
const contentRoutes = require('./routes/content.route')
const adsRoutes       = require('./routes/ads.route')
const financeRoutes   = require('./routes/finance.route')
const inventoryRoutes = require('./routes/inventory.route')
const masterRoutes     = require('./routes/master.route')
const dashboardRoutes  = require('./routes/dashboard.route')
const notionRoutes     = require('./routes/notion.route')
const { registry } = require('./integrations/registry')
const tokenRefresher = require('./integrations/token-refresher')
const syncScheduler = require('./services/sync/scheduler')

const app = express()
const PORT = process.env.PORT || 3001

// ─── Middleware ──────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
)

// Gzip all responses — typically 60-80% smaller JSON payloads
app.use(compression({ threshold: 512 }))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'))
}

// ─── Health check (legacy simple ping) ──────────────────────────────────────
app.get('/ping', (_req, res) => {
  res.json({
    status: 'ok',
    project: 'palstyle48 Command Center',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV,
  })
})

// ─── API Routes ──────────────────────────────────────────────────────────────
const usersRoutes = require('./routes/users.route')
app.use('/api/health',     healthRoutes)
app.use('/api/auth',       authRoutes)
app.use('/api/users',      usersRoutes)
app.use('/api/settings',   settingsRoutes)
app.use('/api/platforms',  platformsRoutes)
app.use('/api/agents',     agentsRoutes)
app.use('/api/customers',  customersRoutes)
app.use('/api/oauth',      oauthRoutes)
app.use('/api/webhooks',   webhooksRoutes)
app.use('/api/inbox',      inboxRoutes)
app.use('/api/campaigns',  campaignsRoutes)
app.use('/api/content',    contentRoutes)
app.use('/api/ads',        adsRoutes)
app.use('/api/finance',    financeRoutes)
app.use('/api/inventory',  inventoryRoutes)
app.use('/api/master',     masterRoutes)
app.use('/api/dashboard',  dashboardRoutes)
app.use('/api/notion',     notionRoutes)

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' })
})

// ─── Error Handler ───────────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[Server Error]', err.stack)
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
  })
})

// ─── Start ───────────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`\n🚀 palstyle48 Command Center`)
  console.log(`   Server running on http://localhost:${PORT}`)
  console.log(`   Health: http://localhost:${PORT}/api/health\n`)

  // Initialize Integration Layer (auto-reconnects previously connected platforms)
  try {
    await registry.init()
  } catch (err) {
    console.error('[Integration Registry] Failed to initialize:', err.message)
  }

  // Start token auto-refresh cron job
  tokenRefresher.init()

  // Start Sync Scheduler
  syncScheduler.start()
})

module.exports = app
