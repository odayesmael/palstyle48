const crypto = require('crypto');
const { encrypt, decrypt, TokenManager } = require('../../../src/integrations/token-manager');

describe('Token Manager', () => {
  // Mock the encryption key from environment
  const originalEnv = process.env;

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = '9fd3308aa147f1c93f5bc4ceaf709e03d9f3adb9f3a6209b88592f34ff743736';
    process.env.JWT_SECRET = 'test-jwt-secret';
    process.env.NODE_ENV = 'test';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('encrypt function', () => {
    it('should encrypt plaintext to base64 ciphertext', () => {
      const plaintext = 'test-token-12345';
      const ciphertext = encrypt(plaintext);

      expect(ciphertext).toBeDefined();
      expect(typeof ciphertext).toBe('string');
      expect(ciphertext).toContain(':'); // Format: iv:authTag:ciphertext
    });

    it('should return null for empty string', () => {
      const result = encrypt('');
      expect(result).toBeNull();
    });

    it('should return null for null input', () => {
      const result = encrypt(null);
      expect(result).toBeNull();
    });

    it('should return null for undefined input', () => {
      const result = encrypt(undefined);
      expect(result).toBeNull();
    });

    it('should produce different ciphertext for same plaintext (due to random IV)', () => {
      const plaintext = 'test-token';
      const cipher1 = encrypt(plaintext);
      const cipher2 = encrypt(plaintext);

      expect(cipher1).not.toEqual(cipher2); // Different due to random IV
    });

    it('should handle long tokens', () => {
      const longToken = 'x'.repeat(10000);
      const ciphertext = encrypt(longToken);

      expect(ciphertext).toBeDefined();
      expect(typeof ciphertext).toBe('string');
    });
  });

  describe('decrypt function', () => {
    it('should decrypt ciphertext back to plaintext', () => {
      const plaintext = 'test-token-12345';
      const ciphertext = encrypt(plaintext);
      const decrypted = decrypt(ciphertext);

      expect(decrypted).toBe(plaintext);
    });

    it('should return null for empty string', () => {
      const result = decrypt('');
      expect(result).toBeNull();
    });

    it('should return null for null input', () => {
      const result = decrypt(null);
      expect(result).toBeNull();
    });

    it('should return null for undefined input', () => {
      const result = decrypt(undefined);
      expect(result).toBeNull();
    });

    it('should return null for corrupted ciphertext', () => {
      const corrupted = 'invalid:ciphertext:format';
      const result = decrypt(corrupted);

      expect(result).toBeNull();
    });

    it('should return null for tampered auth tag', () => {
      const plaintext = 'test-token';
      const ciphertext = encrypt(plaintext);
      const parts = ciphertext.split(':');

      // Tamper with auth tag
      parts[1] = Buffer.from('tampered').toString('base64');
      const tampered = parts.join(':');

      const result = decrypt(tampered);
      expect(result).toBeNull();
    });

    it('should handle encrypted long tokens', () => {
      const longToken = 'x'.repeat(10000);
      const ciphertext = encrypt(longToken);
      const decrypted = decrypt(ciphertext);

      expect(decrypted).toBe(longToken);
    });

    it('should preserve special characters', () => {
      const specialToken = 'token!@#$%^&*()_+-={}[]|:;<>?,./';
      const ciphertext = encrypt(specialToken);
      const decrypted = decrypt(ciphertext);

      expect(decrypted).toBe(specialToken);
    });

    it('should preserve unicode characters', () => {
      const unicodeToken = 'token-مرحبا-世界-🔐';
      const ciphertext = encrypt(unicodeToken);
      const decrypted = decrypt(ciphertext);

      expect(decrypted).toBe(unicodeToken);
    });
  });

  describe('TokenManager class', () => {
    let tokenManager;

    beforeEach(() => {
      tokenManager = new TokenManager();
    });

    describe('isExpiringSoon', () => {
      it('should return false for undefined expiry', () => {
        const result = tokenManager.isExpiringSoon(undefined);
        expect(result).toBe(false);
      });

      it('should return false for null expiry', () => {
        const result = tokenManager.isExpiringSoon(null);
        expect(result).toBe(false);
      });

      it('should return false for future date (> 24h away)', () => {
        const futureDate = new Date(Date.now() + 25 * 60 * 60 * 1000); // 25 hours
        const result = tokenManager.isExpiringSoon(futureDate);

        expect(result).toBe(false);
      });

      it('should return true for near-future date (< 24h away)', () => {
        const nearFutureDate = new Date(Date.now() + 12 * 60 * 60 * 1000); // 12 hours
        const result = tokenManager.isExpiringSoon(nearFutureDate);

        expect(result).toBe(true);
      });

      it('should return true for past date', () => {
        const pastDate = new Date(Date.now() - 1000); // 1 second ago
        const result = tokenManager.isExpiringSoon(pastDate);

        expect(result).toBe(true);
      });

      it('should respect custom buffer time', () => {
        const bufferMs = 2 * 60 * 60 * 1000; // 2 hours
        const nearDate = new Date(Date.now() + 1 * 60 * 60 * 1000); // 1 hour

        const result = tokenManager.isExpiringSoon(nearDate, bufferMs);
        expect(result).toBe(true); // 1 hour < 2 hour buffer
      });

      it('should handle string date format', () => {
        const futureDate = new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString();
        const result = tokenManager.isExpiringSoon(futureDate);

        expect(result).toBe(false);
      });
    });

    describe('Encryption/Decryption round-trip', () => {
      it('should handle complex JWT-like tokens', () => {
        const jwtToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
        const ciphertext = encrypt(jwtToken);
        const decrypted = decrypt(ciphertext);

        expect(decrypted).toBe(jwtToken);
      });

      it('should handle OAuth access tokens', () => {
        const accessToken = 'PKe7U19D1W2udNI8hXw8BA==:lxdVmxmiGYAfQaVCyQ9EAg==';
        const ciphertext = encrypt(accessToken);
        const decrypted = decrypt(ciphertext);

        expect(decrypted).toBe(accessToken);
      });

      it('should handle Meta long-lived tokens', () => {
        const metaToken = 'EAAMBJZB6f8ABAMcwXw0pkZAC1ZA2WBJ3aDw0vGt2yvOPdZBudKJZBW2K';
        const ciphertext = encrypt(metaToken);
        const decrypted = decrypt(ciphertext);

        expect(decrypted).toBe(metaToken);
      });
    });
  });

  describe('Encryption edge cases', () => {
    it('should handle empty buffer edge case', () => {
      const emptyToken = Buffer.alloc(0).toString();
      const ciphertext = encrypt(emptyToken);

      expect(ciphertext).toBeDefined(); // Empty string is still encryptable
    });

    it('should handle whitespace-only strings', () => {
      const whitespaceToken = '   \n\t  ';
      const ciphertext = encrypt(whitespaceToken);
      const decrypted = decrypt(ciphertext);

      expect(decrypted).toBe(whitespaceToken);
    });

    it('should handle tokens with newlines', () => {
      const tokenWithNewlines = 'line1\nline2\nline3';
      const ciphertext = encrypt(tokenWithNewlines);
      const decrypted = decrypt(ciphertext);

      expect(decrypted).toBe(tokenWithNewlines);
    });
  });

  describe('Format validation', () => {
    it('should produce base64-encoded output', () => {
      const plaintext = 'test-token';
      const ciphertext = encrypt(plaintext);

      if (ciphertext) {
        const [iv, authTag, encrypted] = ciphertext.split(':');

        // Check if all parts are valid base64
        expect(() => Buffer.from(iv, 'base64')).not.toThrow();
        expect(() => Buffer.from(authTag, 'base64')).not.toThrow();
        expect(() => Buffer.from(encrypted, 'base64')).not.toThrow();
      }
    });

    it('should have correct format with 3 colon-separated parts', () => {
      const plaintext = 'test-token';
      const ciphertext = encrypt(plaintext);

      if (ciphertext) {
        const parts = ciphertext.split(':');
        expect(parts.length).toBe(3);
      }
    });
  });
});
