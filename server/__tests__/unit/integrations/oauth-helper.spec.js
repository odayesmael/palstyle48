const { generateState, verifyState, generatePKCE, buildUrl, redirectSuccess, redirectError } = require('../../../src/integrations/oauth-helper');

describe('OAuth Helper', () => {
  describe('generateState', () => {
    it('should generate a random 64-character hex string', () => {
      const state = generateState();

      expect(state).toBeDefined();
      expect(typeof state).toBe('string');
      expect(state.length).toBe(64); // 32 bytes = 64 hex chars
      expect(/^[0-9a-f]{64}$/.test(state)).toBe(true);
    });

    it('should generate different states on each call', () => {
      const state1 = generateState();
      const state2 = generateState();

      expect(state1).not.toEqual(state2);
    });

    it('should accept platform parameter', () => {
      const state = generateState('meta');

      expect(state).toBeDefined();
      expect(typeof state).toBe('string');
    });

    it('should accept extra data parameter', () => {
      const extra = { pkceVerifier: 'test-verifier', userId: '123' };
      const state = generateState('shopify', extra);

      expect(state).toBeDefined();
    });

    it('should store multiple states independently', () => {
      const state1 = generateState('meta');
      const state2 = generateState('shopify');
      const state3 = generateState('gmail');

      expect(state1).not.toEqual(state2);
      expect(state2).not.toEqual(state3);
      expect(state1).not.toEqual(state3);
    });
  });

  describe('verifyState', () => {
    it('should verify a valid state token', () => {
      const state = generateState('meta', { extra: 'data' });
      const verified = verifyState(state);

      expect(verified).toBeDefined();
      expect(verified.platform).toBe('meta');
      expect(verified.extra).toBe('data');
      expect(verified.createdAt).toBeDefined();
    });

    it('should throw for null state', () => {
      expect(() => verifyState(null)).toThrow('Missing state parameter');
    });

    it('should throw for undefined state', () => {
      expect(() => verifyState(undefined)).toThrow('Missing state parameter');
    });

    it('should throw for empty string state', () => {
      expect(() => verifyState('')).toThrow('Missing state parameter');
    });

    it('should throw for non-existent state', () => {
      expect(() => verifyState('nonexistent-state-12345')).toThrow('Invalid or expired OAuth state');
    });

    it('should be single-use (delete after verify)', () => {
      const state = generateState('shopify');
      verifyState(state);

      // Second verification should fail
      expect(() => verifyState(state)).toThrow('Invalid or expired OAuth state');
    });

    it('should return stored extra data', () => {
      const extra = { pkceVerifier: 'abc123', userId: 'user-123' };
      const state = generateState('canva', extra);
      const verified = verifyState(state);

      expect(verified.pkceVerifier).toBe('abc123');
      expect(verified.userId).toBe('user-123');
    });

    it('should return platform information', () => {
      const state = generateState('notion');
      const verified = verifyState(state);

      expect(verified.platform).toBe('notion');
    });

    it('should handle rapid verification (within TTL)', () => {
      const state1 = generateState('gmail');
      const state2 = generateState('meta');

      // Both should verify successfully
      const verified1 = verifyState(state1);
      const verified2 = verifyState(state2);

      expect(verified1.platform).toBe('gmail');
      expect(verified2.platform).toBe('meta');
    });
  });

  describe('generatePKCE', () => {
    it('should generate verifier and challenge pair', () => {
      const { verifier, challenge } = generatePKCE();

      expect(verifier).toBeDefined();
      expect(challenge).toBeDefined();
      expect(typeof verifier).toBe('string');
      expect(typeof challenge).toBe('string');
    });

    it('should generate valid base64url strings', () => {
      const { verifier, challenge } = generatePKCE();

      // base64url uses A-Z, a-z, 0-9, -, _ (no padding with =)
      expect(/^[A-Za-z0-9_-]+$/.test(verifier)).toBe(true);
      expect(/^[A-Za-z0-9_-]+$/.test(challenge)).toBe(true);
    });

    it('should generate different verifiers on each call', () => {
      const pkce1 = generatePKCE();
      const pkce2 = generatePKCE();

      expect(pkce1.verifier).not.toEqual(pkce2.verifier);
      expect(pkce1.challenge).not.toEqual(pkce2.challenge);
    });

    it('should challenge be SHA-256 hash of verifier', () => {
      const { verifier, challenge } = generatePKCE();

      // Verify that challenge is indeed the SHA-256 of verifier
      const crypto = require('crypto');
      const expectedChallenge = crypto.createHash('sha256').update(verifier).digest('base64url');

      expect(challenge).toBe(expectedChallenge);
    });

    it('should generate sufficiently long verifiers', () => {
      const { verifier } = generatePKCE();

      // PKCE spec recommends 43-128 chars; we use 32 bytes = ~43 base64url chars
      expect(verifier.length).toBeGreaterThanOrEqual(40);
      expect(verifier.length).toBeLessThanOrEqual(50);
    });

    it('should be compatible with Canva PKCE requirements', () => {
      const { verifier, challenge } = generatePKCE();

      // Canva requires: code_challenge, code_challenge_method=S256
      // code_challenge should be base64url-encoded SHA-256 hash
      expect(verifier).toBeDefined();
      expect(challenge).toBeDefined();
      expect(challenge.length).toBeGreaterThan(0);
    });

    it('should generate multiple independent PKCE pairs', () => {
      const pairs = [generatePKCE(), generatePKCE(), generatePKCE()];

      // All verifiers should be unique
      const verifiers = pairs.map(p => p.verifier);
      expect(new Set(verifiers).size).toBe(3);

      // All challenges should be unique
      const challenges = pairs.map(p => p.challenge);
      expect(new Set(challenges).size).toBe(3);
    });
  });

  describe('buildUrl', () => {
    it('should build URL with query parameters', () => {
      const url = buildUrl('https://example.com/callback', {
        code: 'auth-code-123',
        state: 'state-token',
      });

      expect(url).toContain('https://example.com/callback');
      expect(url).toContain('code=auth-code-123');
      expect(url).toContain('state=state-token');
    });

    it('should filter out undefined parameters', () => {
      const url = buildUrl('https://example.com/callback', {
        code: 'auth-code',
        scope: undefined,
        state: 'state-token',
      });

      expect(url).toContain('code=auth-code');
      expect(url).toContain('state=state-token');
      expect(url).not.toContain('scope');
    });

    it('should filter out null parameters', () => {
      const url = buildUrl('https://example.com/callback', {
        code: 'auth-code',
        error: null,
      });

      expect(url).toContain('code=auth-code');
      expect(url).not.toContain('error');
    });

    it('should filter out empty string parameters', () => {
      const url = buildUrl('https://example.com/callback', {
        code: 'auth-code',
        extra: '',
      });

      expect(url).toContain('code=auth-code');
      expect(url).not.toContain('extra');
    });

    it('should handle special characters in parameters', () => {
      const url = buildUrl('https://example.com/callback', {
        message: 'Hello World!',
        code: 'abc/123+456',
      });

      // Space can be encoded as %20 or +, both are valid
      expect(url).toContain('message=Hello');
      expect(url).toContain('World%21'); // Exclamation mark should be encoded
      expect(url).toContain('code=abc%2F123%2B456');
    });

    it('should handle empty params object', () => {
      const url = buildUrl('https://example.com/callback', {});

      expect(url).toBe('https://example.com/callback');
    });

    it('should handle no params parameter', () => {
      const url = buildUrl('https://example.com/callback');

      expect(url).toBe('https://example.com/callback');
    });

    it('should preserve existing query parameters in base URL', () => {
      const url = buildUrl('https://example.com/callback?existing=param', {
        code: 'auth-code',
      });

      expect(url).toContain('existing=param');
      expect(url).toContain('code=auth-code');
    });

    it('should handle numeric values', () => {
      const url = buildUrl('https://example.com/callback', {
        expires_in: 3600,
        timestamp: 1234567890,
      });

      expect(url).toContain('expires_in=3600');
      expect(url).toContain('timestamp=1234567890');
    });
  });

  describe('redirectSuccess', () => {
    it('should redirect to settings page with success status', () => {
      const res = {
        redirect: jest.fn(),
      };

      redirectSuccess(res, 'meta');

      expect(res.redirect).toHaveBeenCalled();
      const redirectUrl = res.redirect.mock.calls[0][0];
      expect(redirectUrl).toContain('/settings');
      expect(redirectUrl).toContain('platform=meta');
      expect(redirectUrl).toContain('status=success');
    });

    it('should use FRONTEND_URL from environment', () => {
      const originalFrontendUrl = process.env.FRONTEND_URL;
      process.env.FRONTEND_URL = 'https://app.example.com';

      const res = { redirect: jest.fn() };
      redirectSuccess(res, 'shopify');

      const redirectUrl = res.redirect.mock.calls[0][0];
      expect(redirectUrl).toContain('https://app.example.com');

      process.env.FRONTEND_URL = originalFrontendUrl;
    });

    it('should use localhost as default when FRONTEND_URL not set', () => {
      const originalFrontendUrl = process.env.FRONTEND_URL;
      delete process.env.FRONTEND_URL;

      const res = { redirect: jest.fn() };
      redirectSuccess(res, 'gmail');

      const redirectUrl = res.redirect.mock.calls[0][0];
      expect(redirectUrl).toContain('localhost:5173');

      process.env.FRONTEND_URL = originalFrontendUrl;
    });
  });

  describe('redirectError', () => {
    it('should redirect to settings page with error status', () => {
      const res = {
        redirect: jest.fn(),
      };

      redirectError(res, 'meta', 'User denied access');

      expect(res.redirect).toHaveBeenCalled();
      const redirectUrl = res.redirect.mock.calls[0][0];
      expect(redirectUrl).toContain('/settings');
      expect(redirectUrl).toContain('platform=meta');
      expect(redirectUrl).toContain('status=error');
      expect(redirectUrl).toContain('message=');
    });

    it('should URL-encode error message', () => {
      const res = { redirect: jest.fn() };

      redirectError(res, 'shopify', 'Invalid oauth state');

      const redirectUrl = res.redirect.mock.calls[0][0];
      expect(redirectUrl).toContain('message=Invalid%20oauth%20state');
    });

    it('should use default error message if not provided', () => {
      const res = { redirect: jest.fn() };

      redirectError(res, 'notion');

      const redirectUrl = res.redirect.mock.calls[0][0];
      expect(redirectUrl).toContain('message=oauth_error');
    });

    it('should handle special characters in error message', () => {
      const res = { redirect: jest.fn() };

      redirectError(res, 'canva', 'Error: Invalid redirect_uri (expected: /callback)');

      const redirectUrl = res.redirect.mock.calls[0][0];
      // Message should be properly URL-encoded
      expect(redirectUrl).toContain('message=');
      expect(redirectUrl).toContain('%');
    });
  });

  describe('State token TTL behavior', () => {
    it('should handle multiple states with different platforms', () => {
      const metaState = generateState('meta');
      const shopifyState = generateState('shopify');
      const gmailState = generateState('gmail');

      const metaVerified = verifyState(metaState);
      expect(metaVerified.platform).toBe('meta');

      const shopifyVerified = verifyState(shopifyState);
      expect(shopifyVerified.platform).toBe('shopify');

      const gmailVerified = verifyState(gmailState);
      expect(gmailVerified.platform).toBe('gmail');
    });

    it('should store and retrieve platform-specific data', () => {
      const extra = { page_id: '123', instagram_id: '456' };
      const state = generateState('meta', extra);

      const verified = verifyState(state);
      expect(verified.page_id).toBe('123');
      expect(verified.instagram_id).toBe('456');
    });
  });

  describe('PKCE with state integration', () => {
    it('should store PKCE verifier with state token', () => {
      const pkce = generatePKCE();
      const state = generateState('canva', { pkceVerifier: pkce.verifier });

      const verified = verifyState(state);
      expect(verified.pkceVerifier).toBe(pkce.verifier);
    });

    it('should allow retrieving PKCE verifier after state verification', () => {
      const { verifier, challenge } = generatePKCE();
      const state = generateState('canva', {
        pkceVerifier: verifier,
        pkceChallenge: challenge,
      });

      const verified = verifyState(state);
      expect(verified.pkceVerifier).toBe(verifier);
      expect(verified.pkceChallenge).toBe(challenge);
    });
  });
});
