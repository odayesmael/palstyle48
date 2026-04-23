const bcrypt = require('bcryptjs');
const { listUsers, createUser, updateUser, deleteUser } = require('../../../src/controllers/users.controller');

jest.mock('../../../src/lib/prisma', () => ({
  user: {
    findMany: jest.fn(),
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  session: {
    deleteMany: jest.fn(),
  },
}));

const prisma = require('../../../src/lib/prisma');

describe('Users Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockRes = (overrides = {}) => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    ...overrides,
  });

  describe('listUsers', () => {
    it('should return all users without sensitive fields', async () => {
      const mockUsers = [
        {
          id: 'user-1',
          email: 'user1@test.com',
          name: 'User One',
          role: 'admin',
          permissions: {},
          lastLogin: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
      prisma.user.findMany.mockResolvedValue(mockUsers);

      const res = mockRes();
      await listUsers({}, res);

      expect(res.json).toHaveBeenCalled();
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(true);
      expect(Array.isArray(response.users)).toBe(true);
    });

    it('should exclude password from response', async () => {
      const mockUsers = [
        {
          id: 'user-1',
          email: 'user1@test.com',
          name: 'User One',
          role: 'admin',
          permissions: {},
          lastLogin: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
      prisma.user.findMany.mockResolvedValue(mockUsers);

      const res = mockRes();
      await listUsers({}, res);

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.not.objectContaining({ password: expect.anything() }),
        })
      );
    });

    it('should handle database error gracefully', async () => {
      prisma.user.findMany.mockRejectedValue(new Error('DB error'));

      const res = mockRes();
      await listUsers({}, res);

      expect(res.status).toHaveBeenCalledWith(500);
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(false);
    });

    it('should order users by creation date', async () => {
      prisma.user.findMany.mockResolvedValue([]);

      const res = mockRes();
      await listUsers({}, res);

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'asc' },
        })
      );
    });
  });

  describe('createUser', () => {
    const mockReq = {
      body: {
        email: 'newuser@test.com',
        password: 'Password123',
        name: 'New User',
      },
    };

    it('should create a user successfully', async () => {
      const newUser = {
        id: 'user-123',
        email: 'newuser@test.com',
        name: 'New User',
        role: 'viewer',
        permissions: { dashboard: true },
        createdAt: new Date().toISOString(),
      };
      prisma.user.create.mockResolvedValue(newUser);
      jest.spyOn(bcrypt, 'hash').mockResolvedValue('$2a$12$hashedpassword');

      const res = mockRes();
      await createUser(mockReq, res);

      expect(res.status).toHaveBeenCalledWith(201);
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(true);
      expect(response.user.password).toBeUndefined();
    });

    it('should normalize email to lowercase', async () => {
      const newUser = { id: 'user-123', email: 'newuser@test.com', name: 'New User', role: 'viewer' };
      prisma.user.create.mockResolvedValue(newUser);
      jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashed');

      const req = {
        body: {
          email: '  NEWUSER@TEST.COM  ',
          password: 'Password123',
          name: 'New User',
        },
      };
      const res = mockRes();
      await createUser(req, res);

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'newuser@test.com',
          }),
        })
      );
    });

    it('should reject if email is missing', async () => {
      const req = { body: { password: 'Password123', name: 'User' } };
      const res = mockRes();
      await createUser(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(false);
    });

    it('should reject if password is missing', async () => {
      const req = { body: { email: 'user@test.com', name: 'User' } };
      const res = mockRes();
      await createUser(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should reject if name is missing', async () => {
      const req = { body: { email: 'user@test.com', password: 'Password123' } };
      const res = mockRes();
      await createUser(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should enforce minimum password length', async () => {
      const req = { body: { email: 'user@test.com', password: 'Short1', name: 'User' } };
      const res = mockRes();
      await createUser(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should default to viewer role if invalid role provided', async () => {
      const newUser = { id: 'user-123', email: 'user@test.com', name: 'User', role: 'viewer' };
      prisma.user.create.mockResolvedValue(newUser);
      jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashed');

      const req = {
        body: {
          email: 'user@test.com',
          password: 'Password123',
          name: 'User',
          role: 'invalid_role',
        },
      };
      const res = mockRes();
      await createUser(req, res);

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            role: 'viewer',
          }),
        })
      );
    });

    it('should give admin all permissions', async () => {
      const newUser = { id: 'user-123', email: 'user@test.com', name: 'User', role: 'admin' };
      prisma.user.create.mockResolvedValue(newUser);
      jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashed');

      const req = {
        body: {
          email: 'user@test.com',
          password: 'Password123',
          name: 'User',
          role: 'admin',
        },
      };
      const res = mockRes();
      await createUser(req, res);

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            permissions: expect.objectContaining({
              dashboard: true,
              customers: true,
              inbox: true,
              content: true,
              ads: true,
              finance: true,
              inventory: true,
              agents: true,
              settings: true,
              users: true,
              tasks: true,
            }),
          }),
        })
      );
    });

    it('should handle duplicate email error', async () => {
      prisma.user.create.mockRejectedValue({ code: 'P2002' });
      jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashed');

      const res = mockRes();
      await createUser(mockReq, res);

      expect(res.status).toHaveBeenCalledWith(409);
      const response = res.json.mock.calls[0][0];
      expect(response.message).toContain('مستخدم');
    });

    it('should hash password with bcrypt cost 12', async () => {
      const newUser = { id: 'user-123', email: 'user@test.com', name: 'User', role: 'viewer' };
      prisma.user.create.mockResolvedValue(newUser);
      const hashSpy = jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashed');

      const res = mockRes();
      await createUser(mockReq, res);

      expect(hashSpy).toHaveBeenCalledWith('Password123', 12);
    });
  });

  describe('updateUser', () => {
    it('should update user successfully', async () => {
      const existing = { id: 'user-123', email: 'user@test.com', name: 'User' };
      const updated = { id: 'user-123', email: 'newemail@test.com', name: 'Updated User', role: 'editor' };

      prisma.user.findUnique.mockResolvedValue(existing);
      prisma.user.update.mockResolvedValue(updated);

      const req = {
        params: { id: 'user-123' },
        body: { email: 'newemail@test.com', name: 'Updated User', role: 'editor' },
      };
      const res = mockRes();
      await updateUser(req, res);

      expect(res.json).toHaveBeenCalled();
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(true);
    });

    it('should return 404 if user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const req = { params: { id: 'nonexistent' }, body: { name: 'Updated' } };
      const res = mockRes();
      await updateUser(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should update name if provided', async () => {
      const existing = { id: 'user-123', email: 'user@test.com', name: 'Old Name' };
      const updated = { id: 'user-123', email: 'user@test.com', name: 'New Name' };

      prisma.user.findUnique.mockResolvedValue(existing);
      prisma.user.update.mockResolvedValue(updated);

      const req = { params: { id: 'user-123' }, body: { name: 'New Name' } };
      const res = mockRes();
      await updateUser(req, res);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: 'New Name' }),
        })
      );
    });

    it('should update email if provided', async () => {
      const existing = { id: 'user-123', email: 'old@test.com' };
      const updated = { id: 'user-123', email: 'new@test.com' };

      prisma.user.findUnique.mockResolvedValue(existing);
      prisma.user.update.mockResolvedValue(updated);

      const req = { params: { id: 'user-123' }, body: { email: 'new@test.com' } };
      const res = mockRes();
      await updateUser(req, res);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ email: 'new@test.com' }),
        })
      );
    });

    it('should promote to admin with all permissions', async () => {
      const existing = { id: 'user-123', role: 'viewer' };
      const updated = { id: 'user-123', role: 'admin' };

      prisma.user.findUnique.mockResolvedValue(existing);
      prisma.user.update.mockResolvedValue(updated);

      const req = { params: { id: 'user-123' }, body: { role: 'admin' } };
      const res = mockRes();
      await updateUser(req, res);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            role: 'admin',
            permissions: expect.objectContaining({ dashboard: true, users: true }),
          }),
        })
      );
    });

    it('should update password if provided with valid length', async () => {
      const existing = { id: 'user-123' };
      const updated = { id: 'user-123' };

      prisma.user.findUnique.mockResolvedValue(existing);
      prisma.user.update.mockResolvedValue(updated);
      jest.spyOn(bcrypt, 'hash').mockResolvedValue('newhashed');

      const req = { params: { id: 'user-123' }, body: { password: 'NewPassword123' } };
      const res = mockRes();
      await updateUser(req, res);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ password: 'newhashed' }),
        })
      );
    });

    it('should ignore password if too short', async () => {
      const existing = { id: 'user-123' };
      const updated = { id: 'user-123' };

      prisma.user.findUnique.mockResolvedValue(existing);
      prisma.user.update.mockResolvedValue(updated);

      const req = { params: { id: 'user-123' }, body: { password: 'Short' } };
      const res = mockRes();
      await updateUser(req, res);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({ password: expect.any(String) }),
        })
      );
    });

    it('should exclude sensitive fields from response', async () => {
      const existing = { id: 'user-123' };
      const updated = {
        id: 'user-123',
        email: 'user@test.com',
        name: 'User',
        password: 'hashed',
        loginAttempts: 2,
        lockUntil: null,
      };

      prisma.user.findUnique.mockResolvedValue(existing);
      prisma.user.update.mockResolvedValue(updated);

      const req = { params: { id: 'user-123' }, body: { name: 'Updated' } };
      const res = mockRes();
      await updateUser(req, res);

      const response = res.json.mock.calls[0][0];
      expect(response.user).not.toHaveProperty('password');
      expect(response.user).not.toHaveProperty('loginAttempts');
      expect(response.user).not.toHaveProperty('lockUntil');
    });

    it('should handle duplicate email error', async () => {
      const existing = { id: 'user-123' };
      prisma.user.findUnique.mockResolvedValue(existing);
      prisma.user.update.mockRejectedValue({ code: 'P2002' });

      const req = { params: { id: 'user-123' }, body: { email: 'taken@test.com' } };
      const res = mockRes();
      await updateUser(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
    });
  });

  describe('deleteUser', () => {
    it('should delete user successfully', async () => {
      const existing = { id: 'user-123', email: 'user@test.com' };
      prisma.user.findUnique.mockResolvedValue(existing);
      prisma.session.deleteMany.mockResolvedValue({});
      prisma.user.delete.mockResolvedValue(existing);

      const req = { params: { id: 'user-123' }, user: { id: 'admin-id' } };
      const res = mockRes();
      await deleteUser(req, res);

      expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-123' } });
      expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'user-123' } });
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(true);
    });

    it('should prevent user from deleting themselves', async () => {
      const req = { params: { id: 'user-123' }, user: { id: 'user-123' } };
      const res = mockRes();
      await deleteUser(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      const response = res.json.mock.calls[0][0];
      expect(response.message).toContain('الخاص');
      expect(prisma.user.delete).not.toHaveBeenCalled();
    });

    it('should return 404 if user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const req = { params: { id: 'nonexistent' }, user: { id: 'admin-id' } };
      const res = mockRes();
      await deleteUser(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(prisma.user.delete).not.toHaveBeenCalled();
    });

    it('should delete associated sessions before deleting user', async () => {
      const existing = { id: 'user-123' };
      prisma.user.findUnique.mockResolvedValue(existing);
      prisma.session.deleteMany.mockResolvedValue({});
      prisma.user.delete.mockResolvedValue(existing);

      const req = { params: { id: 'user-123' }, user: { id: 'admin-id' } };
      const res = mockRes();
      await deleteUser(req, res);

      // Verify session delete was called before user delete
      expect(prisma.session.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.user.delete.mock.invocationCallOrder[0]
      );
    });

    it('should handle database error gracefully', async () => {
      prisma.user.findUnique.mockRejectedValue(new Error('DB error'));

      const req = { params: { id: 'user-123' }, user: { id: 'admin-id' } };
      const res = mockRes();
      await deleteUser(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(false);
    });
  });
});
