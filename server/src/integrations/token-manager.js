// ─── Token Manager — AES-256 encrypted token storage ─────────────────────────
// Stores platform tokens securely in the DB and handles auto-refresh.

const crypto = require('crypto')
const prisma  = require('../lib/prisma')

const ALGORITHM = 'aes-256-gcm'
const KEY_LEN   = 32   // 256 bits
const IV_LEN    = 16   // 128 bits
const AUTH_TAG_LEN = 16

// ENCRYPTION_KEY must be 32-byte hex string (64 hex chars) in .env
function _getKey() {
  const raw = process.env.ENCRYPTION_KEY || ''
  if (raw.length < 64) {
    // In dev, derive a key from JWT_SECRET so we don't break startup
    if (process.env.NODE_ENV !== 'production') {
      return crypto.createHash('sha256').update(process.env.JWT_SECRET || 'dev_fallback').digest()
    }
    throw new Error('ENCRYPTION_KEY must be a 64-char hex string in production')
  }
  return Buffer.from(raw.slice(0, 64), 'hex')
}

/** Encrypt plaintext string → base64 ciphertext */
function encrypt(plaintext) {
  if (!plaintext) return null
  const key = _getKey()
  const iv  = crypto.randomBytes(IV_LEN)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag   = cipher.getAuthTag()
  // Format: iv:authTag:ciphertext (all base64)
  return [iv.toString('base64'), authTag.toString('base64'), encrypted.toString('base64')].join(':')
}

/** Decrypt base64 ciphertext → plaintext string */
function decrypt(ciphertext) {
  if (!ciphertext) return null
  try {
    const key = _getKey()
    const [ivB64, authTagB64, encB64] = ciphertext.split(':')
    const iv         = Buffer.from(ivB64,      'base64')
    const authTag    = Buffer.from(authTagB64,  'base64')
    const encrypted  = Buffer.from(encB64,      'base64')
    const decipher   = crypto.createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}

// ─── Token Manager class ─────────────────────────────────────────────────────

class TokenManager {
  /**
   * Save (upsert) tokens for a platform — stored encrypted.
   * @param {string} platform
   * @param {{ accessToken, refreshToken, expiresAt, metadata }} tokens
   */
  async saveTokens(platform, { accessToken, refreshToken, expiresAt, metadata } = {}) {
    await prisma.platform.upsert({
      where: { name: platform },
      update: {
        accessToken:  accessToken  ? encrypt(accessToken)  : undefined,
        refreshToken: refreshToken ? encrypt(refreshToken) : undefined,
        tokenExpiry:  expiresAt   ? new Date(expiresAt)   : undefined,
        metadata:     metadata    || undefined,
        isConnected:  true,
        updatedAt:    new Date(),
      },
      create: {
        name:         platform,
        displayName:  platform.charAt(0).toUpperCase() + platform.slice(1),
        accessToken:  encrypt(accessToken),
        refreshToken: encrypt(refreshToken),
        tokenExpiry:  expiresAt ? new Date(expiresAt) : null,
        metadata:     metadata || {},
        isConnected:  true,
      },
    })
  }

  /**
   * Load and decrypt tokens for a platform.
   * @returns {{ accessToken, refreshToken, expiresAt, metadata, isConnected } | null}
   */
  async getTokens(platform) {
    const record = await prisma.platform.findUnique({ where: { name: platform } })
    if (!record) return null
    return {
      accessToken:  decrypt(record.accessToken),
      refreshToken: decrypt(record.refreshToken),
      expiresAt:    record.tokenExpiry,
      metadata:     record.metadata,
      isConnected:  record.isConnected,
      lastSync:     record.lastSync,
    }
  }

  /**
   * Clear tokens on disconnect.
   */
  async clearTokens(platform) {
    await prisma.platform.updateMany({
      where: { name: platform },
      data: {
        accessToken:  null,
        refreshToken: null,
        tokenExpiry:  null,
        isConnected:  false,
      },
    })
  }

  /**
   * Returns true if the access token will expire within `bufferMs` (default 24h).
   */
  isExpiringSoon(expiresAt, bufferMs = 24 * 60 * 60 * 1000) {
    if (!expiresAt) return false
    return new Date(expiresAt).getTime() - Date.now() < bufferMs
  }

  /**
   * Check all connected platforms and refresh tokens that are expiring soon.
   * Called by a scheduled job (cron).
   */
  async autoRefreshAll(registry) {
    const platforms = await prisma.platform.findMany({ where: { isConnected: true } })
    const results = []

    for (const p of platforms) {
      const expiresAt = p.tokenExpiry
      if (!this.isExpiringSoon(expiresAt)) continue

      try {
        const integration = registry.getIntegration(p.name)
        if (!integration || typeof integration.refreshToken !== 'function') continue

        await integration.refreshToken()
        results.push({ platform: p.name, status: 'refreshed' })
        console.log(`[TokenManager] ✅ Refreshed token for ${p.name}`)
      } catch (err) {
        results.push({ platform: p.name, status: 'failed', error: err.message })
        console.error(`[TokenManager] ❌ Failed to refresh token for ${p.name}:`, err.message)
      }
    }

    return results
  }
}

module.exports = { TokenManager, encrypt, decrypt, tokenManager: new TokenManager() }
