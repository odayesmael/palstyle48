// ─── Notion Controller ──────────────────────────────────────────────────────────
const { registry } = require('../integrations/registry')

/**
 * Helper to get the active Notion integration instance.
 * Throws if Notion is not connected.
 */
function getNotion() {
  const notion = registry.getIntegration('notion')
  if (!notion || !notion._connected) {
    throw new Error('Notion is not connected. Please connect it from the Settings page.')
  }
  return notion
}

/**
 * GET /api/notion/databases
 * Fetch all available Notion databases.
 */
async function getDatabases(req, res) {
  try {
    const notion = getNotion()
    const databases = await notion.getDatabases()
    return res.json({ success: true, count: databases.length, data: databases })
  } catch (err) {
    console.error('[Notion Controller - getDatabases]', err.message)
    return res.status(400).json({ success: false, message: err.message })
  }
}

/**
 * GET /api/notion/databases/:id/query
 * Query a specific Notion database.
 */
async function queryDatabase(req, res) {
  try {
    const { id } = req.params
    const { startCursor, pageSize = 50 } = req.query
    
    // Convert to integers/objects if needed, though Notion proxy handles JSON
    const notion = getNotion()
    const result = await notion.queryDatabase(id, {
      startCursor,
      pageSize: parseInt(pageSize, 10),
      // Optional: Add basic sort by descending last_edited_time if we want
      sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }]
    })
    
    return res.json({ success: true, data: result.results, nextCursor: result.nextCursor, hasMore: result.hasMore })
  } catch (err) {
    console.error('[Notion Controller - queryDatabase]', err.message)
    return res.status(400).json({ success: false, message: err.message })
  }
}

/**
 * GET /api/notion/databases/:id
 * Fetches the schema of the database to build dynamic forms.
 */
async function getDatabaseSchema(req, res) {
  try {
    const notion = getNotion()
    const db = await notion.getDatabase(req.params.id)
    return res.json({ success: true, data: db })
  } catch (err) {
    console.error('[Notion Controller - getDatabaseSchema]', err.message)
    return res.status(400).json({ success: false, message: err.message })
  }
}

/**
 * POST /api/notion/databases/:id/pages
 * Creates a new task/page in a specific database.
 */
async function createTask(req, res) {
  try {
    const { id } = req.params
    const { properties } = req.body // Format must match Notion's properties API specification
    const notion = getNotion()
    const result = await notion.createPage(id, { properties })
    return res.json({ success: true, data: result })
  } catch (err) {
    console.error('[Notion Controller - createTask]', err.message)
    return res.status(400).json({ success: false, message: err.message })
  }
}

/**
 * PATCH /api/notion/pages/:pageId
 * Updates properties of a specific task/page.
 */
async function updateTask(req, res) {
  try {
    const { pageId } = req.params
    const { properties } = req.body
    const notion = getNotion()
    const result = await notion.updatePage(pageId, { properties })
    return res.json({ success: true, data: result })
  } catch (err) {
    console.error('[Notion Controller - updateTask]', err.message)
    return res.status(400).json({ success: false, message: err.message })
  }
}

/**
 * DELETE /api/notion/pages/:pageId
 * Archives a page (which acts as a delete in Notion).
 */
async function deleteTask(req, res) {
  try {
    const { pageId } = req.params
    const notion = getNotion()
    const result = await notion.updatePage(pageId, { archived: true })
    return res.json({ success: true, data: result })
  } catch (err) {
    console.error('[Notion Controller - deleteTask]', err.message)
    return res.status(400).json({ success: false, message: err.message })
  }
}

module.exports = {
  getDatabases,
  queryDatabase,
  getDatabaseSchema,
  createTask,
  updateTask,
  deleteTask
}
