const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { login, me, logout } = require('../../../src/controllers/auth.controller');

// Mock Prisma
jest.mock('../../../src/lib/prisma', () => ({
  user: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
}));

const prisma = require('../../../src/lib/prisma');

describe('Auth Controller', () => {
  // Mock environment variables
  const originalEnv = process.env;

  beforeAll(() => {
    process.env.JWT_SECRET = 'test-jwt-secret-key';
    process.env.JWT_EXPIRES_IN = '7d';
    process.env.NODE_ENV = 'test';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('login', () => {
    const mockUser = {
      id: 'user-123',
      email: 'test@example.com',
      password: '$2a$10$hashedpassword',
      name: 'Test User',
      role: 'admin',
      loginAttempts: 0,
      lockUntil: null,
      lastLogin: new Date(),
      createdAt: new Date(),
    };

    const mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    const mockReq = {
      body: { email: 'test@example.com', password: 'TestPass@123' },
      user: { id: 'user-123' },
    };

    it('should login successfully with correct credentials', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);

      await login(mockReq, mockRes);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });
      expect(mockRes.json).toHaveBeenCalled();
      const response = mockRes.json.mock.calls[0][0];
      expect(response.success).toBe(true);
      expect(response.token).toBeDefined();
      expect(response.user).toBeDefined();
      expect(response.user.password).toBeUndefined(); // Should not include password
    });

    it('should return error if email is missing', async () => {
      const reqNoEmail = { body: { password: 'TestPass@123' } };

      await login(reqNoEmail, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalled();
      const response = mockRes.json.mock.calls[0][0];
      expect(response.success).toBe(false);
    });

    it('should return error if password is missing', async () => {
      const reqNoPassword = { body: { email: 'test@example.com' } };

      await login(reqNoPassword, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      const response = mockRes.json.mock.calls[0][0];
      expect(response.success).toBe(false);
    });

    it('should return error if user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await login(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      const response = mockRes.json.mock.calls[0][0];
      expect(response.message).toContain('البريد الإلكتروني أو كلمة المرور غير صحيحة');
    });

    it('should return error if password is incorrect', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false);
      prisma.user.update.mockResolvedValue(mockUser);

      await login(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      const response = mockRes.json.mock.calls[0][0];
      expect(response.message).toContain('كلمة المرور غير صحيحة');
      expect(response.attemptsRemaining).toBeDefined();
    });

    it('should increment login attempts on failed password', async () => {
      const userWithAttempts = { ...mockUser, loginAttempts: 1 };
      prisma.user.findUnique.mockResolvedValue(userWithAttempts);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false);
      prisma.user.update.mockResolvedValue(userWithAttempts);

      await login(mockReq, mockRes);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-123' },
          data: expect.objectContaining({
            loginAttempts: 2,
          }),
        })
      );
    });

    it('should lock account after max attempts', async () => {
      const lockedUser = { ...mockUser, loginAttempts: 2 }; // 3rd attempt will trigger lock
      prisma.user.findUnique.mockResolvedValue(lockedUser);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false);
      prisma.user.update.mockResolvedValue(lockedUser);

      await login(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(429);
      const response = mockRes.json.mock.calls[0][0];
      expect(response.message).toContain('تجاوزت الحد المسموح من المحاولات');
      expect(response.lockedUntil).toBeDefined();
    });

    it('should reject login if account is locked', async () => {
      const lockedUser = {
        ...mockUser,
        lockUntil: new Date(Date.now() + 10 * 60 * 1000), // Locked for 10 more minutes
      };
      prisma.user.findUnique.mockResolvedValue(lockedUser);

      await login(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(429);
      const response = mockRes.json.mock.calls[0][0];
      expect(response.message).toContain('تم تقييد الدخول مؤقتاً');
      expect(response.remainingSeconds).toBeDefined();
    });

    it('should reset login attempts on successful login', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);
      prisma.user.update.mockResolvedValue(mockUser);

      await login(mockReq, mockRes);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            loginAttempts: 0,
            lockUntil: null,
            lastLogin: expect.any(Date),
          }),
        })
      );
    });

    it('should normalize email (lowercase, trim)', async () => {
      const reqWithDirtyEmail = {
        body: { email: '  TEST@EXAMPLE.COM  ', password: 'TestPass@123' },
      };
      prisma.user.findUnique.mockResolvedValue(mockUser);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);

      await login(reqWithDirtyEmail, mockRes);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });
    });

    it('should include JWT token in response', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);

      await login(mockReq, mockRes);

      const response = mockRes.json.mock.calls[0][0];
      expect(response.token).toBeDefined();
      expect(typeof response.token).toBe('string');

      // Verify token is valid JWT
      const decoded = jwt.decode(response.token);
      expect(decoded.id).toBe('user-123');
      expect(decoded.email).toBe('test@example.com');
      expect(decoded.role).toBe('admin');
    });

    it('should not include password or login attempts in safe user', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);

      await login(mockReq, mockRes);

      const response = mockRes.json.mock.calls[0][0];
      expect(response.user.password).toBeUndefined();
      expect(response.user.loginAttempts).toBeUndefined();
      expect(response.user.lockUntil).toBeUndefined();
    });

    it('should handle database error gracefully', async () => {
      prisma.user.findUnique.mockRejectedValue(new Error('Database error'));

      await login(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      const response = mockRes.json.mock.calls[0][0];
      expect(response.success).toBe(false);
      expect(response.message).toBe('خطأ في الخادم');
    });

    it('should handle bcrypt comparison error gracefully', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      jest.spyOn(bcrypt, 'compare').mockRejectedValue(new Error('Bcrypt error'));

      await login(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });

    it('should show attempts remaining after failed login', async () => {
      const userWithOneAttempt = { ...mockUser, loginAttempts: 1 };
      prisma.user.findUnique.mockResolvedValue(userWithOneAttempt);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false);
      prisma.user.update.mockResolvedValue(userWithOneAttempt);

      await login(mockReq, mockRes);

      const response = mockRes.json.mock.calls[0][0];
      expect(response.attemptsRemaining).toBe(1); // 3 max - 2 used = 1 remaining
    });
  });

  describe('me', () => {
    const mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    const mockReq = {
      user: { id: 'user-123' },
    };

    it('should return current user profile', async () => {
      const mockUserProfile = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'admin',
        permissions: { create: true, read: true, update: true },
        lastLogin: new Date(),
        createdAt: new Date(),
      };

      prisma.user.findUnique.mockResolvedValue(mockUserProfile);

      await me(mockReq, mockRes);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          permissions: true,
          lastLogin: true,
          createdAt: true,
        },
      });
      expect(mockRes.json).toHaveBeenCalled();
      const response = mockRes.json.mock.calls[0][0];
      expect(response.success).toBe(true);
      expect(response.user).toEqual(mockUserProfile);
    });

    it('should return 404 if user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await me(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      const response = mockRes.json.mock.calls[0][0];
      expect(response.success).toBe(false);
      expect(response.message).toBe('المستخدم غير موجود');
    });

    it('should handle database error gracefully', async () => {
      prisma.user.findUnique.mockRejectedValue(new Error('Database error'));

      await me(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      const response = mockRes.json.mock.calls[0][0];
      expect(response.success).toBe(false);
    });

    it('should not expose password in user profile', async () => {
      // The select query in the me endpoint doesn't include password
      // so it naturally won't be in the response
      const mockUserProfile = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'admin',
        permissions: { create: true },
        lastLogin: new Date(),
        createdAt: new Date(),
      };

      prisma.user.findUnique.mockResolvedValue(mockUserProfile);

      await me(mockReq, mockRes);

      const response = mockRes.json.mock.calls[0][0];
      expect(response.user.password).toBeUndefined();
    });

    it('should include all required user fields', async () => {
      const mockUserProfile = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'admin',
        permissions: { create: true },
        lastLogin: new Date(),
        createdAt: new Date(),
      };

      prisma.user.findUnique.mockResolvedValue(mockUserProfile);

      await me(mockReq, mockRes);

      const response = mockRes.json.mock.calls[0][0];
      expect(response.user).toHaveProperty('id');
      expect(response.user).toHaveProperty('email');
      expect(response.user).toHaveProperty('name');
      expect(response.user).toHaveProperty('role');
      expect(response.user).toHaveProperty('permissions');
      expect(response.user).toHaveProperty('lastLogin');
      expect(response.user).toHaveProperty('createdAt');
    });
  });

  describe('logout', () => {
    const mockRes = {
      json: jest.fn().mockReturnThis(),
    };

    it('should return success message on logout', async () => {
      await logout({}, mockRes);

      expect(mockRes.json).toHaveBeenCalled();
      const response = mockRes.json.mock.calls[0][0];
      expect(response.success).toBe(true);
      expect(response.message).toBe('تم تسجيل الخروج بنجاح');
    });

    it('should not require request body', async () => {
      await logout({}, mockRes);

      expect(mockRes.json).toHaveBeenCalled();
    });

    it('should always return success', async () => {
      const mockReq = {
        user: { id: 'user-123' },
        body: { some: 'data' },
      };

      await logout(mockReq, mockRes);

      const response = mockRes.json.mock.calls[0][0];
      expect(response.success).toBe(true);
    });
  });

  describe('Token generation', () => {
    const mockUser = {
      id: 'user-123',
      email: 'test@example.com',
      password: '$2a$10$hashedpassword',
      name: 'Test User',
      role: 'admin',
      loginAttempts: 0,
      lockUntil: null,
    };

    const mockRes = {
      json: jest.fn().mockReturnThis(),
    };

    const mockReq = {
      body: { email: 'test@example.com', password: 'TestPass@123' },
    };

    it('should create valid JWT token with user data', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);

      await login(mockReq, mockRes);

      const response = mockRes.json.mock.calls[0][0];
      const decoded = jwt.decode(response.token);

      expect(decoded.id).toBe('user-123');
      expect(decoded.email).toBe('test@example.com');
      expect(decoded.name).toBe('Test User');
      expect(decoded.role).toBe('admin');
    });

    it('should set correct token expiry', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);

      await login(mockReq, mockRes);

      const response = mockRes.json.mock.calls[0][0];
      const decoded = jwt.decode(response.token);

      const issuedAt = decoded.iat;
      const expiresAt = decoded.exp;
      const expirySeconds = expiresAt - issuedAt;

      // 7 days = 604800 seconds (allowing 1 second tolerance)
      expect(expirySeconds).toBeGreaterThan(604799);
      expect(expirySeconds).toBeLessThan(604801);
    });
  });

  describe('Brute force protection', () => {
    const mockUser = {
      id: 'user-123',
      email: 'test@example.com',
      password: '$2a$10$hashedpassword',
      name: 'Test User',
      role: 'admin',
      loginAttempts: 0,
      lockUntil: null,
    };

    const mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    const mockReq = {
      body: { email: 'test@example.com', password: 'wrong' },
    };

    it('should allow unlock after lock period expires', async () => {
      const expiredLock = {
        ...mockUser,
        lockUntil: new Date(Date.now() - 1000), // Expired 1 second ago
      };

      prisma.user.findUnique.mockResolvedValue(expiredLock);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);

      await login(mockReq, mockRes);

      // Should allow login since lock expired
      expect(mockRes.status).not.toHaveBeenCalledWith(429);
    });

    it('should show remaining time in lockout message', async () => {
      const lockedUser = {
        ...mockUser,
        lockUntil: new Date(Date.now() + 5 * 60 * 1000), // Locked for 5 minutes
      };

      prisma.user.findUnique.mockResolvedValue(lockedUser);

      await login(mockReq, mockRes);

      const response = mockRes.json.mock.calls[0][0];
      expect(response.remainingSeconds).toBeDefined();
      expect(response.remainingSeconds).toBeGreaterThan(0);
      expect(response.remainingSeconds).toBeLessThanOrEqual(5 * 60);
    });
  });
});
