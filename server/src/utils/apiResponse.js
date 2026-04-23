// ─── Standardized API Response Helpers ────────────────────────────────────────
// Usage:
//   const { ok, fail, paginated } = require('../utils/apiResponse')
//   res.json(ok(data))
//   res.status(400).json(fail('Invalid input'))
//   res.json(paginated(items, total, page, limit))

/**
 * Success response
 * @param {*} data
 * @param {object} [meta] — additional metadata
 * @returns {{ success: true, data, meta? }}
 */
function ok(data, meta) {
  const response = { success: true, data }
  if (meta) response.meta = meta
  return response
}

/**
 * Failure response
 * @param {string} message
 * @param {number} [code] — optional error code
 * @param {object} [details] — optional error details
 * @returns {{ success: false, error: { message, code?, details? } }}
 */
function fail(message, code, details) {
  const error = { message }
  if (code) error.code = code
  if (details) error.details = details
  return { success: false, error }
}

/**
 * Paginated response
 * @param {Array} data
 * @param {number} total
 * @param {number} page
 * @param {number} limit
 * @returns {{ success: true, data, meta: { total, page, pages, limit } }}
 */
function paginated(data, total, page, limit) {
  return {
    success: true,
    data,
    meta: {
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
      limit: Number(limit),
    },
  }
}

module.exports = { ok, fail, paginated }
