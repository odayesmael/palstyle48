// Settings Controller Unit Tests — 23 test cases
const bcrypt = require('bcryptjs');
const { getSettings, updateSettings, getSessions, changePassword } = require('../../../src/controllers/settings.controller');

jest.mock('../../../src/lib/prisma', () => ({
  systemSetting: {
    findMany: jest.fn(),
    upsert: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
}));

const prisma = require('../../../src/lib/prisma');

describe('Settings Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockRes = (overrides = {}) => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    ...overrides,
  });

  describe('getSettings', () => {
    it('should return default settings when none exist', async () => {
      prisma.systemSetting.findMany.mockResolvedValue([]);

      const res = mockRes();
      await getSettings({}, res);

      expect(res.json).toHaveBeenCalled();
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(true);
      expect(response.settings.store_name).toBe('palstyle48');
      expect(response.settings.default_currency).toBe('USD');
      expect(response.settings.timezone).toBe('Asia/Istanbul');
      expect(response.settings.ai_provider).toBe('groq');
    });

    it('should merge database settings over defaults', async () => {
      const dbSettings = [
        { key: 'store_name', value: 'custom_store' },
        { key: 'default_currency', value: 'AED' },
      ];
      prisma.systemSetting.findMany.mockResolvedValue(dbSettings);

      const res = mockRes();
      await getSettings({}, res);

      const response = res.json.mock.calls[0][0];
      expect(response.settings.store_name).toBe('custom_store');
      expect(response.settings.default_currency).toBe('AED');
      expect(response.settings.timezone).toBe('Asia/Istanbul'); // from defaults
    });

    it('should handle database error gracefully', async () => {
      prisma.systemSetting.findMany.mockRejectedValue(new Error('DB error'));

      const res = mockRes();
      await getSettings({}, res);

      expect(res.status).toHaveBeenCalledWith(500);
      const response = res.json.mock.calls[0][0];
      expect(response.error).toBeDefined();
    });

    it('should include all default settings keys', async () => {
      prisma.systemSetting.findMany.mockResolvedValue([]);

      const res = mockRes();
      await getSettings({}, res);

      const response = res.json.mock.calls[0][0];
      expect(response.settings).toHaveProperty('store_name');
      expect(response.settings).toHaveProperty('default_currency');
      expect(response.settings).toHaveProperty('timezone');
      expect(response.settings).toHaveProperty('ai_provider');
      expect(response.settings).toHaveProperty('groq_api_key');
      expect(response.settings).toHaveProperty('ollama_url');
    });
  });

  describe('updateSettings', () => {
    it('should update single setting', async () => {
      prisma.systemSetting.upsert.mockResolvedValue({ key: 'store_name', value: 'new_store' });

      const req = { body: { store_name: 'new_store' } };
      const res = mockRes();
      await updateSettings(req, res);

      expect(prisma.systemSetting.upsert).toHaveBeenCalledWith({
        where: { key: 'store_name' },
        update: { value: 'new_store' },
        create: { key: 'store_name', value: 'new_store' },
      });
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(true);
    });

    it('should update multiple settings', async () => {
      prisma.systemSetting.upsert.mockResolvedValue({});

      const req = {
        body: {
          store_name: 'new_store',
          default_currency: 'AED',
          timezone: 'Asia/Amman',
        },
      };
      const res = mockRes();
      await updateSettings(req, res);

      expect(prisma.systemSetting.upsert).toHaveBeenCalledTimes(3);
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(true);
    });

    it('should handle empty request body', async () => {
      const req = { body: {} };
      const res = mockRes();
      await updateSettings(req, res);

      expect(prisma.systemSetting.upsert).not.toHaveBeenCalled();
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(true);
    });

    it('should skip empty keys', async () => {
      prisma.systemSetting.upsert.mockResolvedValue({});

      const req = {
        body: {
          store_name: 'store',
          '': 'empty_key_value',
        },
      };
      const res = mockRes();
      await updateSettings(req, res);

      expect(prisma.systemSetting.upsert).toHaveBeenCalledTimes(1);
      expect(prisma.systemSetting.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { key: 'store_name' },
        })
      );
    });

    it('should handle database error gracefully', async () => {
      prisma.systemSetting.upsert.mockRejectedValue(new Error('DB error'));

      const req = { body: { store_name: 'store' } };
      const res = mockRes();
      await updateSettings(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      const response = res.json.mock.calls[0][0];
      expect(response.error).toBeDefined();
    });

    it('should upsert (update or create) settings', async () => {
      prisma.systemSetting.upsert.mockResolvedValue({ key: 'new_key', value: 'new_value' });

      const req = { body: { new_key: 'new_value' } };
      const res = mockRes();
      await updateSettings(req, res);

      expect(prisma.systemSetting.upsert).toHaveBeenCalledWith({
        where: { key: 'new_key' },
        update: { value: 'new_value' },
        create: { key: 'new_key', value: 'new_value' },
      });
    });
  });

  describe('getSessions', () => {
    it('should return mock login history', async () => {
      const res = mockRes();
      await getSessions({}, res);

      expect(res.json).toHaveBeenCalled();
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(true);
      expect(Array.isArray(response.sessions)).toBe(true);
      expect(response.sessions.length).toBe(8);
    });

    it('should include required session fields', async () => {
      const res = mockRes();
      await getSessions({}, res);

      const response = res.json.mock.calls[0][0];
      const session = response.sessions[0];
      expect(session).toHaveProperty('id');
      expect(session).toHaveProperty('ip');
      expect(session).toHaveProperty('success');
      expect(session).toHaveProperty('createdAt');
      expect(session).toHaveProperty('device');
    });

    it('should have valid IP addresses', async () => {
      const res = mockRes();
      await getSessions({}, res);

      const response = res.json.mock.calls[0][0];
      response.sessions.forEach((session) => {
        expect(session.ip).toMatch(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/);
      });
    });

    it('should vary success status', async () => {
      const res = mockRes();
      await getSessions({}, res);

      const response = res.json.mock.calls[0][0];
      const successValues = response.sessions.map(s => s.success);
      expect(successValues.some(v => v === true)).toBe(true);
      expect(successValues.some(v => v === false)).toBe(true);
    });

    it('should include device information', async () => {
      const res = mockRes();
      await getSessions({}, res);

      const response = res.json.mock.calls[0][0];
      response.sessions.forEach((session) => {
        expect(['Chrome / macOS', 'Safari / iOS']).toContain(session.device);
      });
    });
  });

  describe('changePassword', () => {
    const mockUser = {
      id: 'user-123',
      email: 'user@test.com',
      password: '$2a$12$hashedpassword',
    };

    it('should change password successfully', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);
      jest.spyOn(bcrypt, 'hash').mockResolvedValue('$2a$12$newhashed');
      prisma.user.update.mockResolvedValue({ ...mockUser, password: '$2a$12$newhashed' });

      const req = {
        user: { id: 'user-123' },
        body: {
          currentPassword: 'OldPassword123',
          newPassword: 'NewPassword456',
        },
      };
      const res = mockRes();
      await changePassword(req, res);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: { password: '$2a$12$newhashed' },
      });
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(true);
    });

    it('should reject if current password is missing', async () => {
      const req = {
        user: { id: 'user-123' },
        body: { newPassword: 'NewPassword456' },
      };
      const res = mockRes();
      await changePassword(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(false);
    });

    it('should reject if new password is missing', async () => {
      const req = {
        user: { id: 'user-123' },
        body: { currentPassword: 'OldPassword123' },
      };
      const res = mockRes();
      await changePassword(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(false);
    });

    it('should enforce minimum password length', async () => {
      const req = {
        user: { id: 'user-123' },
        body: {
          currentPassword: 'OldPassword123',
          newPassword: 'Short',
        },
      };
      const res = mockRes();
      await changePassword(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      const response = res.json.mock.calls[0][0];
      expect(response.message).toContain('8 أحرف');
    });

    it('should reject incorrect current password', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false);

      const req = {
        user: { id: 'user-123' },
        body: {
          currentPassword: 'WrongPassword',
          newPassword: 'NewPassword456',
        },
      };
      const res = mockRes();
      await changePassword(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      const response = res.json.mock.calls[0][0];
      expect(response.message).toContain('غير صحيحة');
    });

    it('should hash new password with bcrypt', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);
      const hashSpy = jest.spyOn(bcrypt, 'hash').mockResolvedValue('$2a$12$newhashed');
      prisma.user.update.mockResolvedValue({ ...mockUser, password: '$2a$12$newhashed' });

      const req = {
        user: { id: 'user-123' },
        body: {
          currentPassword: 'OldPassword123',
          newPassword: 'NewPassword456',
        },
      };
      const res = mockRes();
      await changePassword(req, res);

      expect(hashSpy).toHaveBeenCalledWith('NewPassword456', 12);
    });

    it('should handle user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const req = {
        user: { id: 'user-123' },
        body: {
          currentPassword: 'OldPassword123',
          newPassword: 'NewPassword456',
        },
      };
      const res = mockRes();
      await changePassword(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('should handle database error gracefully', async () => {
      prisma.user.findUnique.mockRejectedValue(new Error('DB error'));

      const req = {
        user: { id: 'user-123' },
        body: {
          currentPassword: 'OldPassword123',
          newPassword: 'NewPassword456',
        },
      };
      const res = mockRes();
      await changePassword(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(false);
    });
  });
});
