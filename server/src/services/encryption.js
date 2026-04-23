// ─── AES-256-GCM Encryption Service ──────────────────────────────────────────
// Used for encrypting OAuth tokens, API keys, and other sensitive data at rest.
// Requires ENCRYPTION_KEY env var (64-char hex = 32 bytes).

const crypto = require('crypto')

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16   // 128 bits
const TAG_LENGTH = 16  // 128 bits

function _getKey() {
  const key = process.env.ENCRYPTION_KEY
  if (!key) throw new Error('ENCRYPTION_KEY env var is required for encryption')
  return Buffer.from(key, 'hex')
}

/**
 * Encrypt a plaintext string.
 * @param {string} plaintext
 * @returns {string} - Base64 encoded string: iv:ciphertext:authTag
 */
function encrypt(plaintext) {
  if (!plaintext) return plaintext
  const key = _getKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

  let encrypted = cipher.update(plaintext, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const authTag = cipher.getAuthTag().toString('hex')

  return `${iv.toString('hex')}:${encrypted}:${authTag}`
}

/**
 * Decrypt an encrypted string.
 * @param {string} encryptedText - Format: iv:ciphertext:authTag (hex)
 * @returns {string} - Original plaintext
 */
function decrypt(encryptedText) {
  if (!encryptedText) return encryptedText
  // If it doesn't look encrypted, return as-is (backward compat)
  if (!encryptedText.includes(':')) return encryptedText

  const key = _getKey()
  const [ivHex, cipherHex, tagHex] = encryptedText.split(':')

  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(tagHex, 'hex')
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(cipherHex, 'hex', 'utf8')
  decrypted += decipher.final('utf8')

  return decrypted
}

/**
 * Hash a value (one-way, for comparison).
 * @param {string} value
 * @returns {string}
 */
function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

module.exports = { encrypt, decrypt, hash }
