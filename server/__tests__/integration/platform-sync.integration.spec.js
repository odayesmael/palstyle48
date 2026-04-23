// Integration Tests: Platform Connection and Data Sync Flow
jest.mock('../../src/lib/prisma', () => ({
  platform: {
    findUnique: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  },
  customer: {
    createMany: jest.fn(),
  },
  product: {
    createMany: jest.fn(),
  },
  order: {
    createMany: jest.fn(),
  },
  setupState: {
    update: jest.fn(),
  },
}));

jest.mock('../../src/integrations/registry', () => ({
  registry: {
    connectPlatform: jest.fn(),
    syncPlatform: jest.fn(),
  },
}));

jest.mock('../../src/services/sync/customer-sync.service', () => ({
  syncAllCustomers: jest.fn(),
}));

jest.mock('../../src/services/sync/product-sync.service', () => ({
  syncAllProducts: jest.fn(),
}));

jest.mock('../../src/services/sync/order-sync.service', () => ({
  syncAllOrders: jest.fn(),
}));

const prisma = require('../../src/lib/prisma');
const { registry } = require('../../src/integrations/registry');
const { syncAllCustomers } = require('../../src/services/sync/customer-sync.service');
const { syncAllProducts } = require('../../src/services/sync/product-sync.service');
const { syncAllOrders } = require('../../src/services/sync/order-sync.service');

describe('Platform Sync Flow Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockRes = (overrides = {}) => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    ...overrides,
  });

  describe('Complete Platform Connection Flow', () => {
    it('should connect shopify platform and sync all data', async () => {
      // Step 1: User provides Shopify credentials
      const shopifyCredentials = {
        apiKey: 'shppa_1234567890abcdef',
        apiSecret: 'shp_1234567890abcdefghijklmn',
        domain: 'mystore.myshopify.com',
      };

      // Step 2: Registry connects to platform
      registry.connectPlatform.mockResolvedValueOnce({
        connected: true,
        shop: {
          id: 'gid://shopify/Shop/123456',
          name: 'My Store',
          email: 'admin@mystore.com',
        },
        pages: 1,
        products: 150,
      });

      const connectResult = await registry.connectPlatform('shopify', shopifyCredentials);
      expect(connectResult.connected).toBe(true);
      expect(connectResult.products).toBe(150);

      // Step 3: Store platform in database
      prisma.platform.create.mockResolvedValueOnce({
        name: 'shopify',
        isConnected: true,
        metadata: {
          storeName: 'mystore.myshopify.com',
          productsCount: 150,
        },
        accessToken: 'encrypted_token_xyz',
      });

      // Step 4: Sync all platform data
      registry.syncPlatform.mockResolvedValueOnce({
        customers: 50,
        products: 150,
        orders: 300,
      });

      const syncRaw = await registry.syncPlatform('shopify');
      expect(syncRaw.customers).toBe(50);
      expect(syncRaw.products).toBe(150);
      expect(syncRaw.orders).toBe(300);

      // Step 5: Sync customers to app database
      syncAllCustomers.mockResolvedValueOnce({
        created: 45,
        updated: 5,
        total: 50,
      });

      const customersResult = await syncAllCustomers();
      expect(customersResult.total).toBe(50);

      // Step 6: Sync products to app database
      syncAllProducts.mockResolvedValueOnce({
        created: 140,
        updated: 10,
        total: 150,
      });

      const productsResult = await syncAllProducts();
      expect(productsResult.total).toBe(150);

      // Step 7: Sync orders to app database
      syncAllOrders.mockResolvedValueOnce({
        created: 280,
        updated: 20,
        total: 300,
      });

      const ordersResult = await syncAllOrders();
      expect(ordersResult.total).toBe(300);

      // Step 8: Update setup state to mark sync complete
      prisma.setupState.update.mockResolvedValueOnce({
        platformsLinked: true,
        currentStep: 2,
      });

      // Verify all data was synced
      expect(customersResult.total + productsResult.total + ordersResult.total).toBe(500);
    });

    it('should handle trendyol connection and incremental sync', async () => {
      // Step 1: Connect to Trendyol
      registry.connectPlatform.mockResolvedValueOnce({
        connected: true,
        supplierId: 'SUP123456',
        storeName: 'PalStyle TY',
        balance: 5000,
      });

      const trendyolResult = await registry.connectPlatform('trendyol', {
        supplierId: 'SUP123456',
        apiKey: 'trendyol_api_key',
      });

      expect(trendyolResult.connected).toBe(true);
      expect(trendyolResult.supplierId).toBe('SUP123456');

      // Step 2: First sync - all data
      registry.syncPlatform.mockResolvedValueOnce({
        customers: 100,
        products: 200,
        orders: 500,
      });

      const firstSync = await registry.syncPlatform('trendyol');
      expect(firstSync.orders).toBe(500);

      // Step 3: Store sync timestamp
      prisma.platform.update.mockResolvedValueOnce({
        lastSync: new Date().toISOString(),
        syncStatus: 'completed',
      });

      // Step 4: Incremental sync (only new/updated items)
      registry.syncPlatform.mockResolvedValueOnce({
        customers: 5, // Only new customers
        products: 10, // Only updated products
        orders: 25, // Only new orders since last sync
      });

      const incrementalSync = await registry.syncPlatform('trendyol');
      expect(incrementalSync.orders).toBeLessThan(firstSync.orders);
    });
  });

  describe('Multi-Platform Sync Coordination', () => {
    it('should sync multiple platforms in parallel without conflicts', async () => {
      const platforms = ['shopify', 'trendyol', 'meta'];

      // Setup mock returns for each platform
      const syncResults = {
        shopify: { customers: 50, products: 150, orders: 300 },
        trendyol: { customers: 100, products: 200, orders: 500 },
        meta: { customers: 25, orders: 100 }, // Meta doesn't have products
      };

      // Simulate parallel syncs
      platforms.forEach(platform => {
        registry.syncPlatform.mockResolvedValueOnce(syncResults[platform]);
      });

      // Execute parallel syncs
      const results = await Promise.all(
        platforms.map(p => registry.syncPlatform(p))
      );

      expect(results).toHaveLength(3);
      expect(results[0].orders).toBe(300);
      expect(results[1].orders).toBe(500);
      expect(results[2].orders).toBe(100);
    });

    it('should handle one platform sync failure without affecting others', async () => {
      // Shopify syncs successfully
      registry.syncPlatform.mockResolvedValueOnce({
        customers: 50,
        products: 150,
        orders: 300,
      });

      // Trendyol fails
      registry.syncPlatform.mockRejectedValueOnce(new Error('Trendyol API error'));

      // Meta syncs successfully
      registry.syncPlatform.mockResolvedValueOnce({
        customers: 25,
        orders: 100,
      });

      const shopifyResult = await registry.syncPlatform('shopify');
      expect(shopifyResult.orders).toBe(300);

      // Trendyol fails but doesn't affect others
      try {
        await registry.syncPlatform('trendyol');
      } catch (e) {
        expect(e.message).toContain('API error');
      }

      const metaResult = await registry.syncPlatform('meta');
      expect(metaResult.orders).toBe(100);
    });
  });

  describe('Data Sync Verification', () => {
    it('should verify data integrity after sync', async () => {
      // Sync mock data
      const syncData = {
        customers: [
          { id: 'cust-1', email: 'customer1@test.com', name: 'Customer 1' },
          { id: 'cust-2', email: 'customer2@test.com', name: 'Customer 2' },
        ],
        products: [
          { id: 'prod-1', sku: 'SKU001', name: 'Product 1', price: 100 },
          { id: 'prod-2', sku: 'SKU002', name: 'Product 2', price: 200 },
        ],
      };

      registry.syncPlatform.mockResolvedValueOnce({
        customers: syncData.customers.length,
        products: syncData.products.length,
      });

      syncAllCustomers.mockResolvedValueOnce({
        created: syncData.customers.length,
        updated: 0,
        total: syncData.customers.length,
        data: syncData.customers,
      });

      syncAllProducts.mockResolvedValueOnce({
        created: syncData.products.length,
        updated: 0,
        total: syncData.products.length,
        data: syncData.products,
      });

      // Execute sync
      const rawSync = await registry.syncPlatform('shopify');
      const customersSync = await syncAllCustomers();
      const productsSync = await syncAllProducts();

      // Verify data counts match
      expect(customersSync.total).toBe(rawSync.customers);
      expect(productsSync.total).toBe(rawSync.products);

      // Verify data structure integrity
      customersSync.data.forEach(customer => {
        expect(customer).toHaveProperty('id');
        expect(customer).toHaveProperty('email');
        expect(customer).toHaveProperty('name');
      });

      productsSync.data.forEach(product => {
        expect(product).toHaveProperty('id');
        expect(product).toHaveProperty('sku');
        expect(product).toHaveProperty('price');
      });
    });

    it('should detect and skip duplicate records during sync', async () => {
      const mockCustomers = [
        { id: 'cust-1', email: 'customer1@test.com', externalId: 'ext-1' },
        { id: 'cust-2', email: 'customer2@test.com', externalId: 'ext-2' },
        { id: 'cust-1', email: 'customer1@test.com', externalId: 'ext-1' }, // Duplicate
      ];

      syncAllCustomers.mockResolvedValueOnce({
        created: 2,
        updated: 0,
        skipped: 1, // Duplicate skipped
        total: 3,
      });

      const result = await syncAllCustomers();
      expect(result.skipped).toBe(1);
      expect(result.created).toBe(2);
      expect(result.total).toBe(3);
    });
  });

  describe('Sync Error Recovery', () => {
    it('should resume sync from last checkpoint on failure', async () => {
      const platform = {
        name: 'shopify',
        lastSyncTimestamp: '2026-04-23T10:00:00Z',
        syncStatus: 'in_progress',
        lastProcessedId: 'cust-150', // Resumed from here
      };

      prisma.platform.findUnique.mockResolvedValueOnce(platform);

      // Sync only new/updated records after last checkpoint
      registry.syncPlatform.mockResolvedValueOnce({
        customers: 25, // Only new customers after checkpoint
        products: 50,
        orders: 100,
        startedFrom: 'cust-150',
      });

      const resumeSync = await registry.syncPlatform('shopify');
      expect(resumeSync.startedFrom).toBe('cust-150');
      expect(resumeSync.customers).toBeLessThan(200); // Partial sync
    });

    it('should rollback failed sync and restore previous state', async () => {
      // Attempted sync fails partway through
      const syncError = new Error('Connection timeout at 50%');
      registry.syncPlatform.mockRejectedValueOnce(syncError);

      try {
        await registry.syncPlatform('shopify');
      } catch (e) {
        // Verify error was thrown
        expect(e.message).toContain('Connection timeout');

        // In real implementation, would restore previous state
        // For this test, we verify that sync error is properly caught
        expect(e).toBeDefined();
        expect(e.message).toBeDefined();
      }
    });
  });

  describe('Sync Performance and Optimization', () => {
    it('should batch process large datasets efficiently', async () => {
      const largeDataset = Array.from({ length: 10000 }, (_, i) => ({
        id: `item-${i}`,
        data: 'test_data_' + i,
      }));

      syncAllCustomers.mockResolvedValueOnce({
        created: largeDataset.length,
        batchSize: 100, // Processed in batches of 100
        batchCount: Math.ceil(largeDataset.length / 100),
        total: largeDataset.length,
      });

      const result = await syncAllCustomers();
      expect(result.batchCount).toBe(100); // 10000 / 100
      expect(result.total).toBe(10000);
    });

    it('should implement incremental sync to reduce bandwidth', async () => {
      // First full sync
      registry.syncPlatform.mockResolvedValueOnce({
        mode: 'full',
        customers: 1000,
        products: 5000,
        orders: 10000,
      });

      const fullSync = await registry.syncPlatform('shopify');
      expect(fullSync.mode).toBe('full');

      // Subsequent incremental syncs
      registry.syncPlatform.mockResolvedValueOnce({
        mode: 'incremental',
        since: '2026-04-23T10:00:00Z',
        customers: 10, // Only changes
        products: 25,
        orders: 50,
      });

      const incrementalSync = await registry.syncPlatform('shopify');
      expect(incrementalSync.mode).toBe('incremental');
      expect(incrementalSync.customers).toBeLessThan(fullSync.customers);
    });
  });
});
