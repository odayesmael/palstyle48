const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { checkStatus, createAdmin, connectPlatform, initialSync, configureAgents } = require('../../../src/controllers/setup.controller');

jest.mock('../../../src/lib/prisma', () => ({
  setupState: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  user: {
    create: jest.fn(),
  },
  platform: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  agentConfig: {
    upsert: jest.fn(),
  },
}));

jest.mock('../../../src/integrations/registry', () => ({
  registry: {
    connectPlatform: jest.fn(),
  },
}));

const prisma = require('../../../src/lib/prisma');
const { registry } = require('../../../src/integrations/registry');

describe('Setup Controller', () => {
  const originalEnv = process.env;

  beforeAll(() => {
    process.env.JWT_SECRET = 'test-jwt-secret';
    process.env.NODE_ENV = 'test';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockRes = (overrides = {}) => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    ...overrides,
  });

  describe('checkStatus', () => {
    it('should return current setup state', async () => {
      const setupState = {
        id: 'singleton',
        isComplete: false,
        currentStep: 0,
        adminCreated: false,
      };
      prisma.setupState.findUnique.mockResolvedValue(setupState);

      const res = mockRes();
      await checkStatus({}, res);

      expect(res.json).toHaveBeenCalled();
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(true);
      expect(response.state).toEqual(setupState);
    });

    it('should create setup state if not found', async () => {
      const newSetupState = { id: 'singleton', isComplete: false, currentStep: 0 };
      prisma.setupState.findUnique.mockResolvedValue(null);
      prisma.setupState.create.mockResolvedValue(newSetupState);

      const res = mockRes();
      await checkStatus({}, res);

      expect(prisma.setupState.create).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalled();
    });

    it('should handle database error gracefully', async () => {
      prisma.setupState.findUnique.mockRejectedValue(new Error('DB error'));

      const res = mockRes();
      await checkStatus({}, res);

      expect(res.json).toHaveBeenCalled();
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(true);
      expect(response.state).toBeDefined();
    });
  });

  describe('createAdmin', () => {
    const mockReq = {
      body: {
        email: 'admin@test.com',
        password: 'Admin@123456',
        name: 'Admin User',
      },
    };

    it('should create admin user successfully', async () => {
      const setupState = { id: 'singleton', adminCreated: false, currentStep: 0 };
      const newUser = {
        id: 'user-123',
        email: 'admin@test.com',
        name: 'Admin User',
        role: 'admin',
      };

      prisma.setupState.findUnique.mockResolvedValue(setupState);
      prisma.user.create.mockResolvedValue(newUser);
      prisma.setupState.update.mockResolvedValue({ ...setupState, adminCreated: true });
      jest.spyOn(bcrypt, 'hash').mockResolvedValue('$2a$12$hashedpassword');

      const res = mockRes();
      await createAdmin(mockReq, res);

      expect(res.status).toHaveBeenCalledWith(201);
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(true);
      expect(response.token).toBeDefined();
      expect(response.user.password).toBeUndefined();
    });

    it('should reject if admin already exists', async () => {
      const setupState = { id: 'singleton', adminCreated: true };
      prisma.setupState.findUnique.mockResolvedValue(setupState);

      const res = mockRes();
      await createAdmin(mockReq, res);

      expect(res.status).toHaveBeenCalledWith(403);
      const response = res.json.mock.calls[0][0];
      expect(response.message).toContain('المدير موجود بالفعل');
    });

    it('should return error if email is missing', async () => {
      const setupState = { id: 'singleton', adminCreated: false };
      prisma.setupState.findUnique.mockResolvedValue(setupState);

      const reqMissingEmail = { body: { password: 'Admin@123456', name: 'Admin' } };
      const res = mockRes();
      await createAdmin(reqMissingEmail, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return error if password is missing', async () => {
      const setupState = { id: 'singleton', adminCreated: false };
      prisma.setupState.findUnique.mockResolvedValue(setupState);

      const reqMissingPassword = { body: { email: 'admin@test.com', name: 'Admin' } };
      const res = mockRes();
      await createAdmin(reqMissingPassword, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return error if name is missing', async () => {
      const setupState = { id: 'singleton', adminCreated: false };
      prisma.setupState.findUnique.mockResolvedValue(setupState);

      const reqMissingName = { body: { email: 'admin@test.com', password: 'Admin@123456' } };
      const res = mockRes();
      await createAdmin(reqMissingName, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should validate password strength', async () => {
      const setupState = { id: 'singleton', adminCreated: false };
      prisma.setupState.findUnique.mockResolvedValue(setupState);

      const cases = [
        { password: 'weak', reason: 'too short and no caps' },
        { password: 'WeakPass', reason: 'no numbers' },
        { password: '12345678', reason: 'no letters' },
        { password: 'UPPERCASE123', reason: 'no lowercase' },
      ];

      for (const testCase of cases) {
        jest.clearAllMocks();
        prisma.setupState.findUnique.mockResolvedValue(setupState);

        const req = {
          body: {
            email: 'admin@test.com',
            password: testCase.password,
            name: 'Admin',
          },
        };
        const res = mockRes();
        await createAdmin(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
      }
    });

    it('should accept strong password', async () => {
      const setupState = { id: 'singleton', adminCreated: false };
      const newUser = {
        id: 'user-123',
        email: 'admin@test.com',
        name: 'Admin',
        role: 'admin',
      };

      prisma.setupState.findUnique.mockResolvedValue(setupState);
      prisma.user.create.mockResolvedValue(newUser);
      prisma.setupState.update.mockResolvedValue(setupState);
      jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashedpw');

      const strongReq = {
        body: {
          email: 'admin@test.com',
          password: 'StrongPass123',
          name: 'Admin',
        },
      };
      const res = mockRes();
      await createAdmin(strongReq, res);

      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('should normalize email (lowercase, trim)', async () => {
      const setupState = { id: 'singleton', adminCreated: false };
      const newUser = { id: 'user-123', email: 'admin@test.com', name: 'Admin', role: 'admin' };

      prisma.setupState.findUnique.mockResolvedValue(setupState);
      prisma.user.create.mockResolvedValue(newUser);
      prisma.setupState.update.mockResolvedValue(setupState);
      jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashedpw');

      const reqWithDirtyEmail = {
        body: {
          email: '  ADMIN@TEST.COM  ',
          password: 'StrongPass123',
          name: 'Admin',
        },
      };
      const res = mockRes();
      await createAdmin(reqWithDirtyEmail, res);

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'admin@test.com',
          }),
        })
      );
    });

    it('should handle duplicate email error', async () => {
      const setupState = { id: 'singleton', adminCreated: false };
      prisma.setupState.findUnique.mockResolvedValue(setupState);
      prisma.user.create.mockRejectedValue({ code: 'P2002' });
      jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashedpw');

      const res = mockRes();
      await createAdmin(mockReq, res);

      expect(res.status).toHaveBeenCalledWith(409);
    });

    it('should hash password with bcrypt', async () => {
      const setupState = { id: 'singleton', adminCreated: false };
      const newUser = { id: 'user-123', email: 'admin@test.com', name: 'Admin', role: 'admin' };

      prisma.setupState.findUnique.mockResolvedValue(setupState);
      prisma.user.create.mockResolvedValue(newUser);
      prisma.setupState.update.mockResolvedValue(setupState);

      const bcryptSpy = jest.spyOn(bcrypt, 'hash').mockResolvedValue('$2a$12$hashedpassword');

      const res = mockRes();
      await createAdmin(mockReq, res);

      expect(bcryptSpy).toHaveBeenCalledWith('Admin@123456', 12);
    });

    it('should return JWT token on success', async () => {
      const setupState = { id: 'singleton', adminCreated: false };
      const newUser = { id: 'user-123', email: 'admin@test.com', name: 'Admin', role: 'admin' };

      prisma.setupState.findUnique.mockResolvedValue(setupState);
      prisma.user.create.mockResolvedValue(newUser);
      prisma.setupState.update.mockResolvedValue(setupState);
      jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashedpw');

      const res = mockRes();
      await createAdmin(mockReq, res);

      const response = res.json.mock.calls[0][0];
      expect(response.token).toBeDefined();

      const decoded = jwt.decode(response.token);
      expect(decoded.id).toBe('user-123');
      expect(decoded.email).toBe('admin@test.com');
      expect(decoded.role).toBe('admin');
    });

    it('should not expose password in response', async () => {
      const setupState = { id: 'singleton', adminCreated: false };
      const newUser = {
        id: 'user-123',
        email: 'admin@test.com',
        name: 'Admin',
        role: 'admin',
        password: 'should-not-expose',
      };

      prisma.setupState.findUnique.mockResolvedValue(setupState);
      prisma.user.create.mockResolvedValue(newUser);
      prisma.setupState.update.mockResolvedValue(setupState);
      jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashedpw');

      const res = mockRes();
      await createAdmin(mockReq, res);

      const response = res.json.mock.calls[0][0];
      expect(response.user.password).toBeUndefined();
    });
  });

  describe('connectPlatform', () => {
    it('should connect a platform successfully', async () => {
      const mockResult = { connected: true, pages: 2 };
      registry.connectPlatform.mockResolvedValue(mockResult);
      prisma.setupState.update.mockResolvedValue({});

      const req = {
        body: { platform: 'meta', apiKey: 'key123' },
      };
      const res = mockRes();
      await connectPlatform(req, res);

      expect(registry.connectPlatform).toHaveBeenCalledWith('meta', expect.any(Object));
      expect(prisma.setupState.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            platformsLinked: true,
            currentStep: 2,
          }),
        })
      );
      expect(res.json).toHaveBeenCalled();
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(true);
    });

    it('should require platform parameter', async () => {
      const req = { body: {} };
      const res = mockRes();
      await connectPlatform(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should handle different platform types', async () => {
      const platforms = ['meta', 'shopify', 'trendyol', 'notion', 'canva', 'gmail'];

      for (const platform of platforms) {
        jest.clearAllMocks();
        registry.connectPlatform.mockResolvedValue({ connected: true });
        prisma.setupState.update.mockResolvedValue({});

        const req = { body: { platform, apiKey: 'test-key' } };
        const res = mockRes();
        await connectPlatform(req, res);

        expect(registry.connectPlatform).toHaveBeenCalledWith(platform, expect.any(Object));
        expect(prisma.setupState.update).toHaveBeenCalled();
        const response = res.json.mock.calls[0][0];
        expect(response.success).toBe(true);
      }
    });

    it('should handle connection errors gracefully', async () => {
      registry.connectPlatform.mockRejectedValue(new Error('Connection failed'));

      const req = { body: { platform: 'meta', apiKey: 'invalid' } };
      const res = mockRes();
      await connectPlatform(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(false);
      expect(response.message).toBeDefined();
    });
  });

  describe('initialSync', () => {
    it('should start initial sync', async () => {
      prisma.setupState.update.mockResolvedValue({ currentStep: 3 });

      const res = mockRes();
      await initialSync({}, res);

      expect(prisma.setupState.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            initialSyncDone: true,
            currentStep: 3,
          }),
        })
      );
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(true);
    });

    it('should handle database error gracefully', async () => {
      prisma.setupState.update.mockRejectedValue(new Error('DB error'));

      const res = mockRes();
      await initialSync({}, res);

      expect(res.json).toHaveBeenCalled();
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(true);
    });
  });

  describe('configureAgents', () => {
    it('should configure agents successfully', async () => {
      prisma.agentConfig.upsert.mockResolvedValue({});
      prisma.setupState.update.mockResolvedValue({ isComplete: true });

      const req = {
        body: {
          agents: [
            { agentName: 'crm', isActive: true, automationLevel: 'semi' },
            { agentName: 'inbox', isActive: true, automationLevel: 'full' },
          ],
        },
      };
      const res = mockRes();
      await configureAgents(req, res);

      expect(prisma.agentConfig.upsert).toHaveBeenCalledTimes(2);
      expect(prisma.setupState.update).toHaveBeenCalled();
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(true);
      expect(response.message).toContain('جاهز الآن');
    });

    it('should handle agents array gracefully', async () => {
      prisma.setupState.update.mockResolvedValue({ isComplete: true });

      const req = { body: { agents: [] } };
      const res = mockRes();
      await configureAgents(req, res);

      expect(res.json).toHaveBeenCalled();
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(true);
    });

    it('should mark setup as complete', async () => {
      prisma.agentConfig.upsert.mockResolvedValue({});
      prisma.setupState.update.mockResolvedValue({ isComplete: true });

      const req = {
        body: {
          agents: [{ agentName: 'crm', isActive: true, automationLevel: 'semi' }],
        },
      };
      const res = mockRes();
      await configureAgents(req, res);

      expect(prisma.setupState.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isComplete: true,
            currentStep: 4,
          }),
        })
      );
    });

    it('should handle database error gracefully', async () => {
      prisma.setupState.update.mockRejectedValue(new Error('DB error'));

      const req = {
        body: {
          agents: [{ agentName: 'crm', isActive: true }],
        },
      };
      const res = mockRes();
      await configureAgents(req, res);

      expect(res.json).toHaveBeenCalled();
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(true);
    });
  });
});
