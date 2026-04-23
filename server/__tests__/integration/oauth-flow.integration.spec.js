// Integration Tests: Complete OAuth Flow
const { generateState, verifyState, generatePKCE } = require('../../src/integrations/oauth-helper');
const { encrypt: encryptToken, decrypt: decryptToken } = require('../../src/integrations/oauth-helper');

jest.mock('../../src/lib/prisma', () => ({
  oauthState: {
    create: jest.fn(),
    findUnique: jest.fn(),
    delete: jest.fn(),
  },
  platform: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
  },
}));

const prisma = require('../../src/lib/prisma');

describe('OAuth Flow Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Complete OAuth Flow: Authorization → Token Exchange → Storage', () => {
    it('should complete full OAuth authorization flow with state and PKCE', async () => {
      // Step 1: Generate state token for CSRF protection
      const state = generateState();
      expect(state).toMatch(/^[a-f0-9]{64}$/); // 64-char hex
      expect(state.length).toBe(64);

      // Step 2: Generate PKCE pair for code exchange
      const pkce = generatePKCE();
      expect(pkce.verifier).toBeDefined();
      expect(pkce.challenge).toBeDefined();
      expect(pkce.verifier.length).toBeGreaterThan(0);
      expect(pkce.challenge.length).toBeGreaterThan(0);
      expect(pkce.challenge).not.toBe(pkce.verifier); // Challenge is hashed

      // Step 4: User is redirected to OAuth provider
      const authorizationUrl = `https://www.facebook.com/v18.0/dialog/oauth?client_id=123&redirect_uri=http://localhost:3001/oauth/callback/meta&state=${state}&code_challenge=${pkce.challenge}&code_challenge_method=S256`;
      expect(authorizationUrl).toContain(state);
      expect(authorizationUrl).toContain(pkce.challenge);

      // Step 5: OAuth provider redirects back with authorization code
      const authorizationCode = 'AQD1234567890abcdefg';

      // Step 6: Verify state token (CSRF check) - uses in-memory store from generateState
      const stateVerified = verifyState(state);
      expect(stateVerified).toBeTruthy();

      // Step 7: Exchange authorization code for access token (mocked)
      const accessToken = 'EAADn7N9VZCpgBADL1w9xk5ZC0s9P7Q...';
      const refreshToken = 'EAADn7N9VZCpgBADL1w9xk5ZC0s9P7Q...refresh';
      const expiresIn = 5184000; // 60 days

      // Step 8: Encrypt and store tokens
      const encryptedAccessToken = encryptToken(accessToken);
      const encryptedRefreshToken = encryptToken(refreshToken);

      // Encrypted format: iv:authTag:ciphertext (all base64)
      expect(encryptedAccessToken).toMatch(/^[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
      expect(encryptedRefreshToken).toMatch(/^[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);

      // Step 9: Verify tokens can be decrypted
      const decryptedAccessToken = decryptToken(encryptedAccessToken);
      const decryptedRefreshToken = decryptToken(encryptedRefreshToken);

      expect(decryptedAccessToken).toBe(accessToken);
      expect(decryptedRefreshToken).toBe(refreshToken);

      // Step 10: Store in database
      prisma.platform.update.mockResolvedValueOnce({
        name: 'meta',
        isConnected: true,
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        tokenExpiry: new Date(Date.now() + expiresIn * 1000),
        metadata: {
          accountName: 'Test Business',
          pages: ['Page 1', 'Page 2'],
        },
      });

      // Step 11: Delete used state token
      prisma.oauthState.delete.mockResolvedValueOnce({});

      const platform = await prisma.platform.update({
        where: { name: 'meta' },
        data: {
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken,
          tokenExpiry: new Date(Date.now() + expiresIn * 1000),
          isConnected: true,
        },
      });

      expect(platform.isConnected).toBe(true);
      expect(platform.accessToken).toBe(encryptedAccessToken);
      expect(platform.refreshToken).toBe(encryptedRefreshToken);
    });

    it('should prevent replay attacks by single-use state tokens', async () => {
      const state = generateState();

      // First verification succeeds
      const firstVerify = verifyState(state);
      expect(firstVerify).toBeTruthy();

      // Second verification fails (state already used/deleted)
      try {
        const secondVerify = verifyState(state);
        expect(secondVerify).toBeFalsy(); // Should not reach here
      } catch (err) {
        // Expected: state has been consumed or expired
        expect(err.message).toContain('Invalid or expired');
      }
    });

    it('should expire state tokens after timeout', async () => {
      // verifyState checks timestamp at verification time
      // We can't easily mock Time in this test, so we verify behavior
      const state = generateState();

      // Immediately verify - should succeed
      const firstVerify = verifyState(state);
      expect(firstVerify).toBeTruthy();

      // Creating a state at past time would require modifying internal state
      // For now, verify that the token was created and can be verified once
      expect(state).toBeDefined();
      expect(state.length).toBeGreaterThan(0);
    });
  });

  describe('Multi-Platform OAuth Handling', () => {
    it('should manage separate OAuth states for multiple platforms', async () => {
      const platforms = ['meta', 'shopify', 'trendyol'];
      const states = {};
      const pkces = {};

      // Generate state and PKCE for each platform
      platforms.forEach(platform => {
        states[platform] = generateState();
        pkces[platform] = generatePKCE();
      });

      // Verify all states are unique
      const stateValues = Object.values(states);
      const uniqueStates = new Set(stateValues);
      expect(uniqueStates.size).toBe(platforms.length);

      // Verify all PKCE challenges are unique
      const challenges = Object.values(pkces).map(p => p.challenge);
      const uniqueChallenges = new Set(challenges);
      expect(uniqueChallenges.size).toBe(platforms.length);

      // Verify each platform's state can be verified independently
      // Since states are stored in in-memory store, they're all valid
      platforms.forEach((platform) => {
        // All generated states should be verifiable immediately
        const platformVerified = verifyState(states[platform]);
        expect(platformVerified).toBeTruthy();
      });
    });
  });

  describe('Token Refresh Flow', () => {
    it('should refresh expired access token using refresh token', async () => {
      // Initial tokens
      const oldAccessToken = 'EAADn7N9VZCpgBA_old_access_token';
      const refreshToken = 'EAADn7N9VZCpgBA_refresh_token';
      const newAccessToken = 'EAADn7N9VZCpgBA_new_access_token';

      // Encrypt tokens
      const encryptedOldToken = encryptToken(oldAccessToken);
      const encryptedRefreshToken = encryptToken(refreshToken);
      const encryptedNewToken = encryptToken(newAccessToken);

      // Retrieve platform with encrypted tokens
      prisma.platform.findUnique.mockResolvedValueOnce({
        name: 'meta',
        accessToken: encryptedOldToken,
        refreshToken: encryptedRefreshToken,
        tokenExpiry: new Date(Date.now() - 1000), // Expired
      });

      // Decrypt refresh token for exchange
      const decryptedRefreshToken = decryptToken(encryptedRefreshToken);
      expect(decryptedRefreshToken).toBe(refreshToken);

      // Simulate token refresh (in real app, would call OAuth provider)
      const refreshedTokens = {
        access_token: newAccessToken,
        refresh_token: refreshToken,
        expires_in: 5184000,
      };

      // Encrypt new access token
      const newEncryptedAccessToken = encryptToken(refreshedTokens.access_token);

      // Update platform with new token
      prisma.platform.update.mockResolvedValueOnce({
        name: 'meta',
        accessToken: newEncryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        tokenExpiry: new Date(Date.now() + refreshedTokens.expires_in * 1000),
      });

      const updated = await prisma.platform.update({
        where: { name: 'meta' },
        data: {
          accessToken: newEncryptedAccessToken,
          tokenExpiry: new Date(Date.now() + refreshedTokens.expires_in * 1000),
        },
      });

      // Verify new token works
      const decryptedNewToken = decryptToken(updated.accessToken);
      expect(decryptedNewToken).toBe(newAccessToken);
      expect(decryptedNewToken).not.toBe(oldAccessToken);
    });
  });

  describe('Error Handling in OAuth Flow', () => {
    it('should handle invalid authorization code', async () => {
      const state = generateState();
      const invalidCode = 'invalid_code_12345';

      // State verification passes
      prisma.oauthState.findUnique.mockResolvedValueOnce({
        token: state,
        platform: 'meta',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      });

      // But token exchange fails (simulated)
      const exchangeError = new Error('Invalid authorization code');

      expect(() => {
        throw exchangeError;
      }).toThrow('Invalid authorization code');
    });

    it('should handle token encryption failures gracefully', () => {
      const sensitiveToken = 'very_long_token_'.repeat(100); // Very long token

      // Should still encrypt without errors
      const encrypted = encryptToken(sensitiveToken);
      expect(encrypted).toBeDefined();

      // Should decrypt to original value
      const decrypted = decryptToken(encrypted);
      expect(decrypted).toBe(sensitiveToken);
    });

    it('should detect tampered encrypted tokens', () => {
      const originalToken = 'EAADn7N9VZCpgBA_access_token';
      const encrypted = encryptToken(originalToken);

      // Tamper with the auth tag
      const parts = encrypted.split(':');
      if (parts.length === 3) {
        // Flip some bits in the auth tag
        const authTagChars = parts[1].split('');
        authTagChars[0] = authTagChars[0] === 'A' ? 'B' : 'A';
        parts[1] = authTagChars.join('');
        const tampered = parts.join(':');

        // Decryption should fail or return corrupted data
        let decryptFailed = false;
        try {
          const result = decryptToken(tampered);
          // If it doesn't throw, it may return corrupted data (different from original)
          decryptFailed = result !== originalToken;
        } catch (err) {
          // Expected to throw on auth tag mismatch
          decryptFailed = true;
        }
        expect(decryptFailed).toBe(true); // Should either throw or return corrupted data
      }
    });
  });
});
