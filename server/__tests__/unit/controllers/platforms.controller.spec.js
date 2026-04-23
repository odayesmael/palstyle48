const {
  getPlatforms,
  connectPlatform,
  disconnectPlatform,
  syncPlatform,
  refreshToken,
  syncAll,
} = require('../../../src/controllers/platforms.controller');

jest.mock('../../../src/lib/prisma', () => ({
  platform: {
    findMany: jest.fn(),
  },
}));

jest.mock('../../../src/integrations/registry', () => ({
  registry: {
    getAllStatus: jest.fn(),
    connectPlatform: jest.fn(),
    disconnectPlatform: jest.fn(),
    syncPlatform: jest.fn(),
    refreshPlatformToken: jest.fn(),
    syncAllPlatforms: jest.fn(),
  },
}));

jest.mock('../../../src/services/sync/customer-sync.service', () => ({
  syncAllCustomers: jest.fn(),
}));

jest.mock('../../../src/services/sync/order-sync.service', () => ({
  syncAllOrders: jest.fn(),
}));

jest.mock('../../../src/services/sync/product-sync.service', () => ({
  syncAllProducts: jest.fn(),
}));

jest.mock('../../../src/services/inventory/inventory-sync.service', () => ({
  syncInventory: jest.fn(),
}));

jest.mock('../../../src/services/finance/revenue-sync.service', () => ({
  syncAllRevenue: jest.fn(),
}));

const prisma = require('../../../src/lib/prisma');
const { registry } = require('../../../src/integrations/registry');
const { syncAllCustomers } = require('../../../src/services/sync/customer-sync.service');
const { syncAllOrders } = require('../../../src/services/sync/order-sync.service');
const { syncAllProducts } = require('../../../src/services/sync/product-sync.service');
const { syncInventory } = require('../../../src/services/inventory/inventory-sync.service');
const { syncAllRevenue } = require('../../../src/services/finance/revenue-sync.service');

describe('Platforms Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockRes = (overrides = {}) => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    ...overrides,
  });

  describe('getPlatforms', () => {
    it('should return all platforms with defaults', async () => {
      prisma.platform.findMany.mockResolvedValue([]);
      registry.getAllStatus.mockReturnValue([]);

      const res = mockRes();
      await getPlatforms({}, res);

      expect(res.json).toHaveBeenCalled();
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(true);
      expect(Array.isArray(response.platforms)).toBe(true);
      expect(response.platforms.length).toBe(6);
    });

    it('should include all 6 default platforms', async () => {
      prisma.platform.findMany.mockResolvedValue([]);
      registry.getAllStatus.mockReturnValue([]);

      const res = mockRes();
      await getPlatforms({}, res);

      const response = res.json.mock.calls[0][0];
      const names = response.platforms.map(p => p.name);
      expect(names).toContain('meta');
      expect(names).toContain('shopify');
      expect(names).toContain('trendyol');
      expect(names).toContain('gmail');
      expect(names).toContain('notion');
      expect(names).toContain('canva');
    });

    it('should merge database and registry status', async () => {
      const dbPlatforms = [
        { name: 'meta', isConnected: true, lastSync: new Date().toISOString() },
      ];
      const registryStatus = [{ name: 'meta', connected: true, lastSync: new Date().toISOString() }];

      prisma.platform.findMany.mockResolvedValue(dbPlatforms);
      registry.getAllStatus.mockReturnValue(registryStatus);

      const res = mockRes();
      await getPlatforms({}, res);

      const response = res.json.mock.calls[0][0];
      const meta = response.platforms.find(p => p.name === 'meta');
      expect(meta.isConnected).toBe(true);
    });

    it('should include platform display names and colors', async () => {
      prisma.platform.findMany.mockResolvedValue([]);
      registry.getAllStatus.mockReturnValue([]);

      const res = mockRes();
      await getPlatforms({}, res);

      const response = res.json.mock.calls[0][0];
      response.platforms.forEach(p => {
        expect(p).toHaveProperty('displayName');
        expect(p).toHaveProperty('color');
        expect(p).toHaveProperty('description');
      });
    });

    it('should handle registry errors gracefully', async () => {
      const dbPlatforms = [{ name: 'meta', isConnected: true }];
      prisma.platform.findMany.mockResolvedValue(dbPlatforms);
      registry.getAllStatus.mockImplementation(() => {
        throw new Error('Registry error');
      });

      const res = mockRes();
      await getPlatforms({}, res);

      expect(res.json).toHaveBeenCalled();
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(true);
    });

    it('should handle database error gracefully', async () => {
      prisma.platform.findMany.mockRejectedValue(new Error('DB error'));

      const res = mockRes();
      await getPlatforms({}, res);

      expect(res.status).toHaveBeenCalledWith(500);
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(false);
    });
  });

  describe('connectPlatform', () => {
    it('should connect a platform successfully', async () => {
      registry.connectPlatform.mockResolvedValue({ connected: true });

      const req = {
        params: { name: 'meta' },
        body: { accessToken: 'mock_token' },
      };
      const res = mockRes();
      await connectPlatform(req, res);

      expect(registry.connectPlatform).toHaveBeenCalledWith('meta', { accessToken: 'mock_token' });
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(true);
    });

    it('should pass credentials to registry', async () => {
      registry.connectPlatform.mockResolvedValue({ connected: true });

      const credentials = { apiKey: 'key123', apiSecret: 'secret456' };
      const req = { params: { name: 'shopify' }, body: credentials };
      const res = mockRes();
      await connectPlatform(req, res);

      expect(registry.connectPlatform).toHaveBeenCalledWith('shopify', credentials);
    });

    it('should handle connection errors', async () => {
      registry.connectPlatform.mockRejectedValue(new Error('Invalid credentials'));

      const req = { params: { name: 'meta' }, body: {} };
      const res = mockRes();
      await connectPlatform(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(false);
    });

    it('should return registry response data', async () => {
      const registryResponse = { connected: true, pages: ['Page 1', 'Page 2'] };
      registry.connectPlatform.mockResolvedValue(registryResponse);

      const req = { params: { name: 'meta' }, body: {} };
      const res = mockRes();
      await connectPlatform(req, res);

      const response = res.json.mock.calls[0][0];
      expect(response.connected).toBe(true);
      expect(response.pages).toEqual(['Page 1', 'Page 2']);
    });
  });

  describe('disconnectPlatform', () => {
    it('should disconnect a platform successfully', async () => {
      registry.disconnectPlatform.mockResolvedValue();

      const req = { params: { name: 'meta' } };
      const res = mockRes();
      await disconnectPlatform(req, res);

      expect(registry.disconnectPlatform).toHaveBeenCalledWith('meta');
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(true);
    });

    it('should handle disconnection errors', async () => {
      registry.disconnectPlatform.mockRejectedValue(new Error('Disconnect failed'));

      const req = { params: { name: 'meta' } };
      const res = mockRes();
      await disconnectPlatform(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(false);
    });
  });

  describe('syncPlatform', () => {
    it('should sync shopify platform with all data', async () => {
      registry.syncPlatform.mockResolvedValue({ products: 50, orders: 10 });
      syncAllCustomers.mockResolvedValue({ count: 20 });
      syncAllProducts.mockResolvedValue({ count: 50 });
      syncAllOrders.mockResolvedValue({ count: 10 });
      syncInventory.mockResolvedValue({ count: 150 });
      syncAllRevenue.mockResolvedValue({ total: 5000 });

      const req = { params: { name: 'shopify' } };
      const res = mockRes();
      await syncPlatform(req, res);

      expect(registry.syncPlatform).toHaveBeenCalledWith('shopify');
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(true);
      expect(response.data.customers.count).toBe(20);
      expect(response.data.products.count).toBe(50);
    });

    it('should include sync timestamp', async () => {
      registry.syncPlatform.mockResolvedValue({});
      syncAllCustomers.mockResolvedValue({ count: 0 });
      syncAllProducts.mockResolvedValue({ count: 0 });
      syncAllOrders.mockResolvedValue({ count: 0 });
      syncInventory.mockResolvedValue({ count: 0 });
      syncAllRevenue.mockResolvedValue({ total: 0 });

      const req = { params: { name: 'trendyol' } };
      const res = mockRes();
      await syncPlatform(req, res);

      const response = res.json.mock.calls[0][0];
      expect(response.syncedAt).toBeDefined();
    });

    it('should handle sync errors gracefully', async () => {
      registry.syncPlatform.mockRejectedValue(new Error('Sync failed'));

      const req = { params: { name: 'meta' } };
      const res = mockRes();
      await syncPlatform(req, res);

      expect(res.json).toHaveBeenCalled();
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(true);
      expect(response.data.rawError).toBeDefined();
    });

    it('should not sync non-shopify/trendyol platforms for data', async () => {
      registry.syncPlatform.mockResolvedValue({});

      const req = { params: { name: 'gmail' } };
      const res = mockRes();
      await syncPlatform(req, res);

      expect(syncAllCustomers).not.toHaveBeenCalled();
      expect(syncAllProducts).not.toHaveBeenCalled();
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(true);
    });
  });

  describe('refreshToken', () => {
    it('should refresh platform token successfully', async () => {
      registry.refreshPlatformToken.mockResolvedValue({ tokenRefreshed: true, expiresAt: '2026-05-23' });

      const req = { params: { name: 'meta' } };
      const res = mockRes();
      await refreshToken(req, res);

      expect(registry.refreshPlatformToken).toHaveBeenCalledWith('meta');
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(true);
      expect(response.tokenRefreshed).toBe(true);
    });

    it('should handle token refresh errors', async () => {
      registry.refreshPlatformToken.mockRejectedValue(new Error('Token expired'));

      const req = { params: { name: 'meta' } };
      const res = mockRes();
      await refreshToken(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(false);
    });
  });

  describe('syncAll', () => {
    it('should sync all platforms', async () => {
      const results = {
        meta: { status: 'success' },
        shopify: { status: 'success' },
      };
      registry.syncAllPlatforms.mockResolvedValue(results);

      const res = mockRes();
      await syncAll({}, res);

      expect(registry.syncAllPlatforms).toHaveBeenCalled();
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(true);
      expect(response.results).toEqual(results);
    });

    it('should handle sync all errors', async () => {
      registry.syncAllPlatforms.mockRejectedValue(new Error('Sync all failed'));

      const res = mockRes();
      await syncAll({}, res);

      expect(res.status).toHaveBeenCalledWith(500);
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(false);
    });
  });
});
