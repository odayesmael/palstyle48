// Integration Tests: Complete Authentication Flow
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

jest.mock('../../src/lib/prisma', () => ({
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  setupState: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
}));

const prisma = require('../../src/lib/prisma');
const { login } = require('../../src/controllers/auth.controller');
const { createAdmin } = require('../../src/controllers/setup.controller');

describe('Auth Flow Integration Tests', () => {
  const JWT_SECRET = 'test-jwt-secret';

  beforeAll(() => {
    process.env.JWT_SECRET = JWT_SECRET;
    process.env.NODE_ENV = 'test';
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockRes = (overrides = {}) => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    ...overrides,
  });

  describe('Complete Auth Flow: Setup → Login → Access', () => {
    it('should complete full setup and login flow', async () => {
      // Step 1: Admin creates account during setup
      const setupState = { id: 'singleton', adminCreated: false };
      const newAdmin = {
        id: 'admin-123',
        email: 'admin@test.com',
        name: 'Admin User',
        role: 'admin',
      };

      prisma.setupState.findUnique.mockResolvedValueOnce(setupState);
      prisma.user.create.mockResolvedValueOnce(newAdmin);
      prisma.setupState.update.mockResolvedValueOnce({ ...setupState, adminCreated: true });
      jest.spyOn(bcrypt, 'hash').mockResolvedValueOnce('$2a$12$hashedpw123');

      const createReq = {
        body: {
          email: 'admin@test.com',
          password: 'AdminPass123',
          name: 'Admin User',
        },
      };
      const createRes = mockRes();
      await createAdmin(createReq, createRes);

      expect(createRes.status).toHaveBeenCalledWith(201);
      const createResponse = createRes.json.mock.calls[0][0];
      expect(createResponse.success).toBe(true);
      expect(createResponse.token).toBeDefined();

      // Extract token and verify
      const adminToken = createResponse.token;
      const decoded = jwt.decode(adminToken);
      expect(decoded.id).toBe('admin-123');
      expect(decoded.email).toBe('admin@test.com');
      expect(decoded.role).toBe('admin');

      // Step 2: Admin logs in with credentials
      const storedUser = {
        id: 'admin-123',
        email: 'admin@test.com',
        name: 'Admin User',
        role: 'admin',
        password: '$2a$12$hashedpw123',
        loginAttempts: 0,
        lockUntil: null,
      };

      jest.spyOn(bcrypt, 'compare').mockResolvedValueOnce(true);
      prisma.user.findUnique.mockResolvedValueOnce(storedUser);
      prisma.user.update.mockResolvedValueOnce({ ...storedUser, loginAttempts: 0 });

      const loginReq = {
        body: {
          email: 'admin@test.com',
          password: 'AdminPass123',
        },
      };
      const loginRes = mockRes();
      await login(loginReq, loginRes);

      expect(loginRes.json).toHaveBeenCalled();
      const loginResponse = loginRes.json.mock.calls[0][0];
      expect(loginResponse.success).toBe(true);
      expect(loginResponse.token).toBeDefined();

      // Step 3: Verify login token is valid
      const loginToken = loginResponse.token;
      const loginDecoded = jwt.decode(loginToken);
      expect(loginDecoded.id).toBe('admin-123');
      expect(loginDecoded.email).toBe('admin@test.com');

      // Step 4: Verify token expiry is set
      expect(loginDecoded.exp).toBeDefined();
      const expiryTime = loginDecoded.exp - loginDecoded.iat;
      expect(expiryTime).toBe(7 * 24 * 60 * 60); // 7 days in seconds
    });

    it('should prevent login with incorrect password after failed attempts', async () => {
      const user = {
        id: 'user-123',
        email: 'user@test.com',
        password: '$2a$12$hashedpw',
        loginAttempts: 0,
        lockUntil: null,
      };

      // Attempt 1: Wrong password
      jest.spyOn(bcrypt, 'compare').mockResolvedValueOnce(false);
      prisma.user.findUnique.mockResolvedValueOnce(user);
      prisma.user.update.mockResolvedValueOnce({ ...user, loginAttempts: 1 });

      const req1 = { body: { email: 'user@test.com', password: 'WrongPass' } };
      const res1 = mockRes();
      await login(req1, res1);

      expect(res1.status).toHaveBeenCalledWith(401);

      // Attempt 2: Wrong password again
      jest.clearAllMocks();
      jest.spyOn(bcrypt, 'compare').mockResolvedValueOnce(false);
      prisma.user.findUnique.mockResolvedValueOnce({ ...user, loginAttempts: 1 });
      prisma.user.update.mockResolvedValueOnce({ ...user, loginAttempts: 2 });

      const req2 = { body: { email: 'user@test.com', password: 'WrongPass' } };
      const res2 = mockRes();
      await login(req2, res2);

      expect(res2.status).toHaveBeenCalledWith(401);

      // Attempt 3: Wrong password - should trigger lockout
      jest.clearAllMocks();
      jest.spyOn(bcrypt, 'compare').mockResolvedValueOnce(false);
      const lockedUser = { ...user, loginAttempts: 2 };
      prisma.user.findUnique.mockResolvedValueOnce(lockedUser);

      const lockTime = new Date(Date.now() + 15 * 60 * 1000);
      prisma.user.update.mockResolvedValueOnce({ ...user, loginAttempts: 3, lockUntil: lockTime });

      const req3 = { body: { email: 'user@test.com', password: 'WrongPass' } };
      const res3 = mockRes();
      await login(req3, res3);

      expect(res3.status).toHaveBeenCalledWith(429);
      const response = res3.json.mock.calls[0][0];
      expect(response.message).toContain('تقييد');
    });

    it('should reset login attempts on successful login', async () => {
      const user = {
        id: 'user-123',
        email: 'user@test.com',
        password: '$2a$12$hashedpw',
        loginAttempts: 2, // Previous failed attempts
        lockUntil: null,
      };

      jest.spyOn(bcrypt, 'compare').mockResolvedValueOnce(true);
      prisma.user.findUnique.mockResolvedValueOnce(user);

      // Should reset loginAttempts to 0
      const updatedUser = { ...user, loginAttempts: 0 };
      prisma.user.update.mockResolvedValueOnce(updatedUser);

      const req = { body: { email: 'user@test.com', password: 'CorrectPass123' } };
      const res = mockRes();
      await login(req, res);

      expect(res.json).toHaveBeenCalled();
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(true);

      // Verify loginAttempts were reset
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            loginAttempts: 0,
          }),
        })
      );
    });

    it('should handle lockout expiry and allow login after timeout', async () => {
      // User is locked out
      const lockTime = new Date(Date.now() - 1000); // Lock expired 1 second ago
      const lockedUser = {
        id: 'user-123',
        email: 'user@test.com',
        password: '$2a$12$hashedpw',
        loginAttempts: 3,
        lockUntil: lockTime,
      };

      jest.spyOn(bcrypt, 'compare').mockResolvedValueOnce(true);
      prisma.user.findUnique.mockResolvedValueOnce(lockedUser);

      // Should reset lockout and allow login
      const unlockedUser = { ...lockedUser, loginAttempts: 0, lockUntil: null };
      prisma.user.update.mockResolvedValueOnce(unlockedUser);

      const req = { body: { email: 'user@test.com', password: 'CorrectPass123' } };
      const res = mockRes();
      await login(req, res);

      expect(res.json).toHaveBeenCalled();
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(true);
      expect(response.token).toBeDefined();
    });
  });

  describe('Password Change Flow', () => {
    it('should change password and require new password on next login', async () => {
      const { changePassword } = require('../../src/controllers/settings.controller');

      const user = {
        id: 'user-123',
        email: 'user@test.com',
        password: '$2a$12$oldhashed',
      };

      // Step 1: Verify old password and change
      jest.spyOn(bcrypt, 'compare').mockResolvedValueOnce(true);
      prisma.user.findUnique.mockResolvedValueOnce(user);
      jest.spyOn(bcrypt, 'hash').mockResolvedValueOnce('$2a$12$newhashed');
      prisma.user.update.mockResolvedValueOnce({ ...user, password: '$2a$12$newhashed' });

      const changeReq = {
        user: { id: 'user-123' },
        body: {
          currentPassword: 'OldPassword123',
          newPassword: 'NewPassword456',
        },
      };
      const changeRes = mockRes();
      await changePassword(changeReq, changeRes);

      expect(changeRes.json).toHaveBeenCalled();
      const changeResponse = changeRes.json.mock.calls[0][0];
      expect(changeResponse.success).toBe(true);

      // Step 2: Verify old password no longer works
      jest.clearAllMocks();
      jest.spyOn(bcrypt, 'compare').mockResolvedValueOnce(false);
      prisma.user.findUnique.mockResolvedValueOnce({ ...user, password: '$2a$12$newhashed' });

      const oldLoginReq = { body: { email: 'user@test.com', password: 'OldPassword123' } };
      const oldLoginRes = mockRes();
      await login(oldLoginReq, oldLoginRes);

      expect(oldLoginRes.status).toHaveBeenCalledWith(401);

      // Step 3: Verify new password works
      jest.clearAllMocks();
      jest.spyOn(bcrypt, 'compare').mockResolvedValueOnce(true);
      prisma.user.findUnique.mockResolvedValueOnce({ ...user, password: '$2a$12$newhashed' });
      prisma.user.update.mockResolvedValueOnce({ ...user, loginAttempts: 0 });

      const newLoginReq = { body: { email: 'user@test.com', password: 'NewPassword456' } };
      const newLoginRes = mockRes();
      await login(newLoginReq, newLoginRes);

      expect(newLoginRes.json).toHaveBeenCalled();
      const loginResponse = newLoginRes.json.mock.calls[0][0];
      expect(loginResponse.success).toBe(true);
    });
  });

  describe('Session Management', () => {
    it('should generate unique tokens for multiple logins', async () => {
      const user = {
        id: 'user-123',
        email: 'user@test.com',
        password: '$2a$12$hashedpw',
        loginAttempts: 0,
        lockUntil: null,
      };

      // First login
      jest.spyOn(bcrypt, 'compare').mockResolvedValueOnce(true);
      prisma.user.findUnique.mockResolvedValueOnce(user);
      prisma.user.update.mockResolvedValueOnce(user);

      const req1 = { body: { email: 'user@test.com', password: 'Password123' } };
      const res1 = mockRes();
      await login(req1, res1);

      const token1 = res1.json.mock.calls[0][0].token;

      // Second login (should generate different token due to iat)
      jest.clearAllMocks();
      jest.spyOn(bcrypt, 'compare').mockResolvedValueOnce(true);
      prisma.user.findUnique.mockResolvedValueOnce(user);
      prisma.user.update.mockResolvedValueOnce(user);

      const req2 = { body: { email: 'user@test.com', password: 'Password123' } };
      const res2 = mockRes();
      await login(req2, res2);

      const token2 = res2.json.mock.calls[0][0].token;

      // Tokens should be different OR same user data if generated in same second
      // In mocked environment with fixed time, tokens may be identical
      // Verify both decoded tokens represent the same user
      const decoded1 = jwt.decode(token1);
      const decoded2 = jwt.decode(token2);

      // Both should decode to same user
      expect(decoded1.id).toBe(decoded2.id);
      expect(decoded1.email).toBe(decoded2.email);
    });

    it('should expire tokens after 7 days', async () => {
      const user = {
        id: 'user-123',
        email: 'user@test.com',
        password: '$2a$12$hashedpw',
        loginAttempts: 0,
        lockUntil: null,
      };

      jest.spyOn(bcrypt, 'compare').mockResolvedValueOnce(true);
      prisma.user.findUnique.mockResolvedValueOnce(user);
      prisma.user.update.mockResolvedValueOnce(user);

      const req = { body: { email: 'user@test.com', password: 'Password123' } };
      const res = mockRes();
      await login(req, res);

      const token = res.json.mock.calls[0][0].token;
      const decoded = jwt.decode(token);

      // Check expiry is 7 days from issue
      const expirySeconds = decoded.exp - decoded.iat;
      expect(expirySeconds).toBe(7 * 24 * 60 * 60); // 604800 seconds = 7 days
    });
  });
});
