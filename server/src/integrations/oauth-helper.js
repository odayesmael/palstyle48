// ─── OAuth Helper Utilities ───────────────────────────────────────────────────
// Shared utilities used by all OAuth flows:
//   • State / CSRF protection (in-memory TTL store)
//   • PKCE challenge / verifier generation (required by Canva)
//   • Re-exports of encrypt/decrypt from token-manager

const crypto = require('crypto')
const { encrypt, decrypt } = require('./token-manager')

// ─── In-memory state store (CSRF) ────────────────────────────────────────────
// Maps state → { platform, createdAt, extra }
// TTL: 10 minutes — sufficient for completing the OAuth round-trip.
// In production replace with Redis.

const _stateStore = new Map()
const STATE_TTL_MS = 10 * 60 * 1000   // 10 min

// Purge expired states every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, val] of _stateStore.entries()) {
    if (now - val.createdAt > STATE_TTL_MS) _stateStore.delete(key)
  }
}, 5 * 60 * 1000).unref()

/**
 * Generate a random CSRF state token and store it.
 * @param {string} platform  - platform name for logging
 * @param {object} extra     - any extra data to store (e.g. PKCE verifier)
 * @returns {string}         - the state token
 */
function generateState(platform = '', extra = {}) {
  const state = crypto.randomBytes(32).toString('hex')
  _stateStore.set(state, { platform, createdAt: Date.now(), ...extra })
  return state
}

/**
 * Verify a state token (single-use — deletes after verify).
 * @throws if state is missing or expired
 * @returns the stored value
 */
function verifyState(state) {
  if (!state) throw new Error('Missing state parameter')
  const stored = _stateStore.get(state)
  if (!stored) throw new Error('Invalid or expired OAuth state')
  if (Date.now() - stored.createdAt > STATE_TTL_MS) {
    _stateStore.delete(state)
    throw new Error('OAuth state expired — please try again')
  }
  _stateStore.delete(state)   // single-use
  return stored
}

// ─── PKCE (Proof Key for Code Exchange) ──────────────────────────────────────
// Required by Canva Connect API.

/**
 * Generate a PKCE code_verifier and code_challenge pair.
 * @returns {{ verifier: string, challenge: string }}
 */
function generatePKCE() {
  const verifier  = crypto.randomBytes(32).toString('base64url')
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

// ─── URL builder helper ───────────────────────────────────────────────────────

/**
 * Build a URL with query parameters (filters out undefined/null values).
 * @param {string}  base
 * @param {object}  params
 * @returns {string}
 */
function buildUrl(base, params = {}) {
  const url = new URL(base)
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v)
  }
  return url.toString()
}

/**
 * Standard callback redirect after OAuth completes.
 * Sends the user back to the frontend settings page.
 */
function redirectSuccess(res, platform) {
  const base = process.env.FRONTEND_URL || 'http://localhost:5173'
  return res.redirect(`${base}/settings?platform=${platform}&status=success`)
}

function redirectError(res, platform, message = 'oauth_error') {
  const base = process.env.FRONTEND_URL || 'http://localhost:5173'
  const msg  = encodeURIComponent(message)
  return res.redirect(`${base}/settings?platform=${platform}&status=error&message=${msg}`)
}

module.exports = { generateState, verifyState, generatePKCE, buildUrl, redirectSuccess, redirectError, encrypt, decrypt }
