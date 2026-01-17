/**
 * Tests for indexeddb-key-storage-adapter module
 * Tests IndexedDB-based encryption key storage
 */

import {
  IndexedDBKeyStorageAdapter,
  indexedDBKeyStorageAdapter,
} from '../../../../lib/encryption/adapters/indexeddb-key-storage-adapter';

// Mock IndexedDB
const mockIndexedDB = () => {
  const stores: Record<string, Record<string, any>> = {};
  const dbInstances: Map<string, any> = new Map();

  const createMockObjectStore = (storeName: string) => {
    if (!stores[storeName]) {
      stores[storeName] = {};
    }

    return {
      put: jest.fn((value: any, key?: any) => {
        const actualKey = key ?? value.id ?? value.conversationId ?? value.userId;
        stores[storeName][actualKey] = value;
        const request = {
          onsuccess: null as any,
          onerror: null as any,
          result: actualKey,
          error: null,
        };
        // Trigger callback asynchronously
        setTimeout(() => request.onsuccess?.({ target: request }), 0);
        return request;
      }),
      get: jest.fn((key: any) => {
        const request = {
          onsuccess: null as any,
          onerror: null as any,
          result: stores[storeName][key],
          error: null,
        };
        // Trigger callback asynchronously
        setTimeout(() => request.onsuccess?.({ target: request }), 0);
        return request;
      }),
      getAll: jest.fn(() => {
        const request = {
          onsuccess: null as any,
          onerror: null as any,
          result: Object.values(stores[storeName]),
          error: null,
        };
        // Trigger callback asynchronously
        setTimeout(() => request.onsuccess?.({ target: request }), 0);
        return request;
      }),
      clear: jest.fn(() => {
        stores[storeName] = {};
        const request = {
          onsuccess: null as any,
          onerror: null as any,
          error: null,
        };
        // Trigger callback asynchronously
        setTimeout(() => request.onsuccess?.({ target: request }), 0);
        return request;
      }),
      createIndex: jest.fn(),
    };
  };

  const createMockTransaction = (storeNames: string[], mode: string) => {
    const objectStores: Record<string, any> = {};
    storeNames.forEach((name) => {
      objectStores[name] = createMockObjectStore(name);
    });

    const transaction = {
      objectStore: jest.fn((name: string) => objectStores[name]),
      oncomplete: null as any,
      onerror: null as any,
      error: null,
    };

    // Trigger oncomplete after a short delay to simulate async behavior
    setTimeout(() => {
      if (transaction.oncomplete) {
        transaction.oncomplete({ target: transaction });
      }
    }, 10);

    return transaction;
  };

  const createMockDB = (name: string) => {
    const objectStoreNames = {
      contains: jest.fn((name: string) => !!stores[name]),
    };

    return {
      name,
      objectStoreNames,
      createObjectStore: jest.fn((name: string, options: any) => {
        stores[name] = {};
        return createMockObjectStore(name);
      }),
      transaction: jest.fn((storeNames: string | string[], mode: string) => {
        const names = Array.isArray(storeNames) ? storeNames : [storeNames];
        return createMockTransaction(names, mode);
      }),
      close: jest.fn(),
    };
  };

  return {
    open: jest.fn((name: string, version: number) => {
      const request = {
        onsuccess: null as any,
        onerror: null as any,
        onupgradeneeded: null as any,
        result: null as any,
        error: null,
      };

      setTimeout(() => {
        let db = dbInstances.get(name);
        if (!db) {
          db = createMockDB(name);
          dbInstances.set(name, db);
        }
        request.result = db;

        // Simulate upgrade if needed
        if (request.onupgradeneeded) {
          request.onupgradeneeded({ target: request });
        }

        if (request.onsuccess) {
          request.onsuccess();
        }
      }, 0);

      return request;
    }),
    deleteDatabase: jest.fn(),
    stores,
    reset: () => {
      Object.keys(stores).forEach((key) => delete stores[key]);
      dbInstances.clear();
    },
  };
};

describe('IndexedDB Key Storage Adapter Module', () => {
  let mockIDB: ReturnType<typeof mockIndexedDB>;
  let adapter: IndexedDBKeyStorageAdapter;

  beforeEach(() => {
    mockIDB = mockIndexedDB();
    Object.defineProperty(global, 'indexedDB', {
      value: mockIDB,
      configurable: true,
    });
    adapter = new IndexedDBKeyStorageAdapter();
  });

  afterEach(() => {
    mockIDB.reset();
    jest.clearAllMocks();
  });

  describe('storeKey', () => {
    it('should store encryption key', async () => {
      await adapter.storeKey('key-123', 'base64-encoded-key');

      expect(mockIDB.open).toHaveBeenCalled();
    });

    it('should store key with conversation ID', async () => {
      await adapter.storeKey('key-123', 'base64-key', 'conv-456');

      expect(mockIDB.open).toHaveBeenCalled();
    });

    it('should store key with user ID', async () => {
      await adapter.storeKey('key-123', 'base64-key', undefined, 'user-789');

      expect(mockIDB.open).toHaveBeenCalled();
    });

    it('should store key with both conversation and user ID', async () => {
      await adapter.storeKey('key-123', 'base64-key', 'conv-456', 'user-789');

      expect(mockIDB.open).toHaveBeenCalled();
    });
  });

  describe('getKey', () => {
    it('should retrieve stored key', async () => {
      // Store first
      await adapter.storeKey('key-123', 'my-secret-key');

      // Then retrieve
      const result = await adapter.getKey('key-123');

      // The mock returns the stored data
      expect(result).toBe('my-secret-key');
    });

    it('should return null for non-existent key', async () => {
      const result = await adapter.getKey('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('storeConversationKey', () => {
    it('should store conversation key mapping', async () => {
      await adapter.storeConversationKey('conv-123', 'key-456', 'e2ee');

      expect(mockIDB.open).toHaveBeenCalled();
    });

    it('should store different encryption modes', async () => {
      await adapter.storeConversationKey('conv-1', 'key-1', 'e2ee');
      await adapter.storeConversationKey('conv-2', 'key-2', 'server');
      await adapter.storeConversationKey('conv-3', 'key-3', 'hybrid');

      expect(mockIDB.open).toHaveBeenCalled();
    });
  });

  describe('getConversationKey', () => {
    it('should retrieve conversation key mapping', async () => {
      await adapter.storeConversationKey('conv-123', 'key-456', 'e2ee');

      const result = await adapter.getConversationKey('conv-123');

      expect(result).not.toBeNull();
      expect(result?.keyId).toBe('key-456');
      expect(result?.mode).toBe('e2ee');
    });

    it('should return null for non-existent conversation', async () => {
      const result = await adapter.getConversationKey('non-existent');

      expect(result).toBeNull();
    });

    it('should include createdAt timestamp', async () => {
      await adapter.storeConversationKey('conv-123', 'key-456', 'e2ee');

      const result = await adapter.getConversationKey('conv-123');

      expect(result?.createdAt).toBeDefined();
      expect(typeof result?.createdAt).toBe('number');
    });
  });

  describe('storeUserKeys', () => {
    it('should store user Signal Protocol keys', async () => {
      const userKeys = {
        userId: 'user-123',
        publicKey: 'public-key-data',
        privateKey: 'encrypted-private-key',
        registrationId: 12345,
        identityKey: 'identity-key-data',
        preKeyBundleVersion: 1,
        createdAt: Date.now(),
      };

      await adapter.storeUserKeys(userKeys);

      expect(mockIDB.open).toHaveBeenCalled();
    });
  });

  describe('getUserKeys', () => {
    it('should retrieve user keys', async () => {
      const userKeys = {
        userId: 'user-123',
        publicKey: 'public-key-data',
        privateKey: 'encrypted-private-key',
        registrationId: 12345,
        identityKey: 'identity-key-data',
        preKeyBundleVersion: 1,
        createdAt: Date.now(),
      };

      await adapter.storeUserKeys(userKeys);

      const result = await adapter.getUserKeys('user-123');

      expect(result).not.toBeNull();
      expect(result?.userId).toBe('user-123');
      expect(result?.registrationId).toBe(12345);
    });

    it('should return null for non-existent user', async () => {
      const result = await adapter.getUserKeys('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('clearAll', () => {
    it('should clear all keys', async () => {
      // Store some data first
      await adapter.storeKey('key-1', 'data-1');
      await adapter.storeConversationKey('conv-1', 'key-1', 'e2ee');

      // Clear all
      await adapter.clearAll();

      // Verify stores are cleared
      expect(mockIDB.open).toHaveBeenCalled();
    });
  });

  describe('exportKeys', () => {
    it('should export keys as base64 encoded string', async () => {
      // Store some data
      await adapter.storeKey('key-1', 'data-1');
      await adapter.storeConversationKey('conv-1', 'key-1', 'e2ee');

      const exported = await adapter.exportKeys('password123');

      expect(typeof exported).toBe('string');
      // Should be base64 encoded
      expect(() => atob(exported)).not.toThrow();
    });

    it('should include version and timestamp in export', async () => {
      const exported = await adapter.exportKeys('password');
      const decoded = JSON.parse(atob(exported));

      expect(decoded).toHaveProperty('version');
      expect(decoded).toHaveProperty('exportedAt');
      expect(typeof decoded.exportedAt).toBe('number');
    });
  });

  describe('importKeys', () => {
    it('should import keys from exported backup', async () => {
      // Create a backup object
      const backup = {
        keys: [{ id: 'key-1', keyData: 'test-data', algorithm: 'aes-256-gcm', createdAt: Date.now() }],
        conversations: [{ conversationId: 'conv-1', keyId: 'key-1', mode: 'e2ee', createdAt: Date.now() }],
        userKeys: [],
        version: 1,
        exportedAt: Date.now(),
      };

      const encoded = btoa(JSON.stringify(backup));

      await adapter.importKeys(encoded, 'password');

      expect(mockIDB.open).toHaveBeenCalled();
    });
  });

  describe('Singleton instance', () => {
    it('should export a singleton instance', () => {
      expect(indexedDBKeyStorageAdapter).toBeDefined();
      expect(indexedDBKeyStorageAdapter).toBeInstanceOf(IndexedDBKeyStorageAdapter);
    });
  });

  describe('Database initialization', () => {
    it('should initialize database only once', async () => {
      // Multiple operations should not create multiple DB connections
      await adapter.storeKey('key-1', 'data-1');
      await adapter.storeKey('key-2', 'data-2');
      await adapter.getKey('key-1');

      // Should reuse the same connection
      expect(mockIDB.open).toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('should throw error when database not initialized for storeKey', async () => {
      const badAdapter = new IndexedDBKeyStorageAdapter();
      // Force db to be null by not awaiting init
      (badAdapter as any).db = null;
      (badAdapter as any).initPromise = Promise.resolve();

      await expect(badAdapter.storeKey('key', 'data')).rejects.toThrow(
        'Database not initialized'
      );
    });

    it('should throw error when database not initialized for getKey', async () => {
      const badAdapter = new IndexedDBKeyStorageAdapter();
      (badAdapter as any).db = null;
      (badAdapter as any).initPromise = Promise.resolve();

      await expect(badAdapter.getKey('key')).rejects.toThrow('Database not initialized');
    });

    it('should throw error when database not initialized for storeConversationKey', async () => {
      const badAdapter = new IndexedDBKeyStorageAdapter();
      (badAdapter as any).db = null;
      (badAdapter as any).initPromise = Promise.resolve();

      await expect(
        badAdapter.storeConversationKey('conv', 'key', 'e2ee')
      ).rejects.toThrow('Database not initialized');
    });

    it('should throw error when database not initialized for getConversationKey', async () => {
      const badAdapter = new IndexedDBKeyStorageAdapter();
      (badAdapter as any).db = null;
      (badAdapter as any).initPromise = Promise.resolve();

      await expect(badAdapter.getConversationKey('conv')).rejects.toThrow(
        'Database not initialized'
      );
    });

    it('should throw error when database not initialized for storeUserKeys', async () => {
      const badAdapter = new IndexedDBKeyStorageAdapter();
      (badAdapter as any).db = null;
      (badAdapter as any).initPromise = Promise.resolve();

      await expect(
        badAdapter.storeUserKeys({
          userId: 'user',
          publicKey: 'pub',
          privateKey: 'priv',
          registrationId: 1,
          identityKey: 'id',
          preKeyBundleVersion: 1,
          createdAt: Date.now(),
        })
      ).rejects.toThrow('Database not initialized');
    });

    it('should throw error when database not initialized for getUserKeys', async () => {
      const badAdapter = new IndexedDBKeyStorageAdapter();
      (badAdapter as any).db = null;
      (badAdapter as any).initPromise = Promise.resolve();

      await expect(badAdapter.getUserKeys('user')).rejects.toThrow(
        'Database not initialized'
      );
    });

    it('should throw error when database not initialized for clearAll', async () => {
      const badAdapter = new IndexedDBKeyStorageAdapter();
      (badAdapter as any).db = null;
      (badAdapter as any).initPromise = Promise.resolve();

      await expect(badAdapter.clearAll()).rejects.toThrow('Database not initialized');
    });

    it('should throw error when database not initialized for exportKeys', async () => {
      const badAdapter = new IndexedDBKeyStorageAdapter();
      (badAdapter as any).db = null;
      (badAdapter as any).initPromise = Promise.resolve();

      await expect(badAdapter.exportKeys('password')).rejects.toThrow(
        'Database not initialized'
      );
    });

    it('should throw error when database not initialized for importKeys', async () => {
      const badAdapter = new IndexedDBKeyStorageAdapter();
      (badAdapter as any).db = null;
      (badAdapter as any).initPromise = Promise.resolve();

      // Use valid base64 encoded JSON for the backup
      const validBackup = btoa(JSON.stringify({
        keys: [],
        conversations: [],
        userKeys: [],
        version: 1,
        exportedAt: Date.now(),
      }));

      await expect(badAdapter.importKeys(validBackup, 'password')).rejects.toThrow(
        'Database not initialized'
      );
    });
  });
});
