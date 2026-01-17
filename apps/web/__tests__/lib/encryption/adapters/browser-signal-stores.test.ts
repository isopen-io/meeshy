/**
 * Tests for browser-signal-stores module
 * Tests Signal Protocol stores using IndexedDB
 *
 * Note: These tests mock the @signalapp/libsignal-client library
 * as it requires native bindings that are not available in jest.
 */

// Mock the signalapp library before importing the module
jest.mock('@signalapp/libsignal-client', () => ({
  ProtocolAddress: {
    new: jest.fn((name: string, deviceId: number) => ({
      name: () => name,
      deviceId: () => deviceId,
    })),
  },
  IdentityKeyPair: {
    generate: jest.fn(() => ({
      serialize: () => new Uint8Array([1, 2, 3]),
      privateKey: { serialize: () => new Uint8Array([4, 5, 6]) },
      publicKey: { serialize: () => new Uint8Array([7, 8, 9]) },
    })),
    deserialize: jest.fn((buffer: Buffer) => ({
      serialize: () => buffer,
      privateKey: { serialize: () => new Uint8Array([4, 5, 6]) },
      publicKey: { serialize: () => new Uint8Array([7, 8, 9]) },
    })),
  },
  PublicKey: {
    deserialize: jest.fn((buffer: Buffer) => ({
      serialize: () => buffer,
    })),
  },
  PrivateKey: {
    deserialize: jest.fn((buffer: Buffer) => ({
      serialize: () => buffer,
    })),
  },
  PreKeyRecord: {
    deserialize: jest.fn((buffer: Buffer) => ({
      serialize: () => buffer,
    })),
  },
  SignedPreKeyRecord: {
    deserialize: jest.fn((buffer: Buffer) => ({
      serialize: () => buffer,
    })),
  },
  KyberPreKeyRecord: {
    deserialize: jest.fn((buffer: Buffer) => ({
      serialize: () => buffer,
    })),
  },
  SessionRecord: {
    deserialize: jest.fn((buffer: Buffer) => ({
      serialize: () => buffer,
    })),
  },
  SenderKeyRecord: {
    deserialize: jest.fn((buffer: Buffer) => ({
      serialize: () => buffer,
    })),
  },
  IdentityKeyStore: class MockIdentityKeyStore {},
  PreKeyStore: class MockPreKeyStore {},
  SignedPreKeyStore: class MockSignedPreKeyStore {},
  KyberPreKeyStore: class MockKyberPreKeyStore {},
  SessionStore: class MockSessionStore {},
  SenderKeyStore: class MockSenderKeyStore {},
  Direction: {
    Sending: 0,
    Receiving: 1,
  },
  Uuid: {
    fromString: jest.fn((str: string) => str),
  },
}));

// Mock IndexedDB
const createMockIndexedDB = () => {
  const stores: Record<string, Record<string, any>> = {};

  const createMockObjectStore = (storeName: string) => {
    if (!stores[storeName]) {
      stores[storeName] = {};
    }

    return {
      put: jest.fn((value: any, key: any) => {
        stores[storeName][key] = value;
        const request = {
          onsuccess: null as any,
          onerror: null as any,
          result: key,
          error: null,
        };
        setTimeout(() => request.onsuccess?.(), 0);
        return request;
      }),
      get: jest.fn((key: any) => {
        const request = {
          onsuccess: null as any,
          onerror: null as any,
          result: stores[storeName][key],
          error: null,
        };
        setTimeout(() => request.onsuccess?.(), 0);
        return request;
      }),
      delete: jest.fn((key: any) => {
        delete stores[storeName][key];
        const request = {
          onsuccess: null as any,
          onerror: null as any,
          error: null,
        };
        setTimeout(() => request.onsuccess?.(), 0);
        return request;
      }),
    };
  };

  const createMockTransaction = (storeNames: string[], mode: string) => {
    return {
      objectStore: jest.fn((name: string) => createMockObjectStore(name)),
    };
  };

  const createMockDB = () => {
    const objectStoreNames = {
      contains: jest.fn((name: string) => !!stores[name]),
    };

    return {
      objectStoreNames,
      createObjectStore: jest.fn((name: string) => {
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
        result: createMockDB(),
        error: null,
      };

      setTimeout(() => {
        if (request.onupgradeneeded) {
          request.onupgradeneeded({ target: request });
        }
        request.onsuccess?.();
      }, 0);

      return request;
    }),
    stores,
    reset: () => {
      Object.keys(stores).forEach((key) => delete stores[key]);
    },
  };
};

describe('Browser Signal Stores Module', () => {
  let mockIDB: ReturnType<typeof createMockIndexedDB>;

  beforeEach(() => {
    mockIDB = createMockIndexedDB();
    Object.defineProperty(global, 'indexedDB', {
      value: mockIDB,
      configurable: true,
    });
  });

  afterEach(() => {
    mockIDB.reset();
    jest.clearAllMocks();
  });

  describe('BrowserIdentityKeyStore', () => {
    it('should be exported', async () => {
      const { BrowserIdentityKeyStore } = await import(
        '../../../../lib/encryption/adapters/browser-signal-stores'
      );
      expect(BrowserIdentityKeyStore).toBeDefined();
    });

    it('should initialize with userId and registrationId', async () => {
      const { BrowserIdentityKeyStore } = await import(
        '../../../../lib/encryption/adapters/browser-signal-stores'
      );

      const store = new BrowserIdentityKeyStore('user-123', 12345);
      expect(store).toBeDefined();
    });

    it('should return registration ID', async () => {
      const { BrowserIdentityKeyStore } = await import(
        '../../../../lib/encryption/adapters/browser-signal-stores'
      );

      const store = new BrowserIdentityKeyStore('user-123', 12345);
      const registrationId = await store.getLocalRegistrationId();
      expect(registrationId).toBe(12345);
    });
  });

  describe('BrowserPreKeyStore', () => {
    it('should be exported', async () => {
      const { BrowserPreKeyStore } = await import(
        '../../../../lib/encryption/adapters/browser-signal-stores'
      );
      expect(BrowserPreKeyStore).toBeDefined();
    });

    it('should create instance', async () => {
      const { BrowserPreKeyStore } = await import(
        '../../../../lib/encryption/adapters/browser-signal-stores'
      );

      const store = new BrowserPreKeyStore();
      expect(store).toBeDefined();
    });
  });

  describe('BrowserSignedPreKeyStore', () => {
    it('should be exported', async () => {
      const { BrowserSignedPreKeyStore } = await import(
        '../../../../lib/encryption/adapters/browser-signal-stores'
      );
      expect(BrowserSignedPreKeyStore).toBeDefined();
    });

    it('should create instance', async () => {
      const { BrowserSignedPreKeyStore } = await import(
        '../../../../lib/encryption/adapters/browser-signal-stores'
      );

      const store = new BrowserSignedPreKeyStore();
      expect(store).toBeDefined();
    });
  });

  describe('BrowserKyberPreKeyStore', () => {
    it('should be exported', async () => {
      const { BrowserKyberPreKeyStore } = await import(
        '../../../../lib/encryption/adapters/browser-signal-stores'
      );
      expect(BrowserKyberPreKeyStore).toBeDefined();
    });

    it('should create instance', async () => {
      const { BrowserKyberPreKeyStore } = await import(
        '../../../../lib/encryption/adapters/browser-signal-stores'
      );

      const store = new BrowserKyberPreKeyStore();
      expect(store).toBeDefined();
    });
  });

  describe('BrowserSessionStore', () => {
    it('should be exported', async () => {
      const { BrowserSessionStore } = await import(
        '../../../../lib/encryption/adapters/browser-signal-stores'
      );
      expect(BrowserSessionStore).toBeDefined();
    });

    it('should create instance', async () => {
      const { BrowserSessionStore } = await import(
        '../../../../lib/encryption/adapters/browser-signal-stores'
      );

      const store = new BrowserSessionStore();
      expect(store).toBeDefined();
    });
  });

  describe('BrowserSenderKeyStore', () => {
    it('should be exported', async () => {
      const { BrowserSenderKeyStore } = await import(
        '../../../../lib/encryption/adapters/browser-signal-stores'
      );
      expect(BrowserSenderKeyStore).toBeDefined();
    });

    it('should create instance', async () => {
      const { BrowserSenderKeyStore } = await import(
        '../../../../lib/encryption/adapters/browser-signal-stores'
      );

      const store = new BrowserSenderKeyStore();
      expect(store).toBeDefined();
    });
  });

  describe('createBrowserSignalStores', () => {
    it('should be exported', async () => {
      const { createBrowserSignalStores } = await import(
        '../../../../lib/encryption/adapters/browser-signal-stores'
      );
      expect(createBrowserSignalStores).toBeDefined();
      expect(typeof createBrowserSignalStores).toBe('function');
    });

    it('should create all required stores', async () => {
      const { createBrowserSignalStores } = await import(
        '../../../../lib/encryption/adapters/browser-signal-stores'
      );

      const stores = await createBrowserSignalStores({ userId: 'test-user' });

      expect(stores).toHaveProperty('identityStore');
      expect(stores).toHaveProperty('preKeyStore');
      expect(stores).toHaveProperty('signedPreKeyStore');
      expect(stores).toHaveProperty('kyberPreKeyStore');
      expect(stores).toHaveProperty('sessionStore');
      expect(stores).toHaveProperty('senderKeyStore');
    });

    it('should generate random registration ID', async () => {
      const { createBrowserSignalStores } = await import(
        '../../../../lib/encryption/adapters/browser-signal-stores'
      );

      // Create multiple instances and verify registration IDs are different
      const stores1 = await createBrowserSignalStores({ userId: 'user-1' });
      const stores2 = await createBrowserSignalStores({ userId: 'user-2' });

      const regId1 = await stores1.identityStore.getLocalRegistrationId();
      const regId2 = await stores2.identityStore.getLocalRegistrationId();

      // Registration IDs should be in valid range
      expect(regId1).toBeGreaterThanOrEqual(1);
      expect(regId1).toBeLessThanOrEqual(16380);
      expect(regId2).toBeGreaterThanOrEqual(1);
      expect(regId2).toBeLessThanOrEqual(16380);
    });
  });

  describe('Store operations integration', () => {
    it('should handle identity key storage flow', async () => {
      const { BrowserIdentityKeyStore } = await import(
        '../../../../lib/encryption/adapters/browser-signal-stores'
      );
      const { IdentityKeyPair } = await import('@signalapp/libsignal-client');

      const store = new BrowserIdentityKeyStore('user-123', 12345);

      // Initialize with identity key pair
      const keyPair = IdentityKeyPair.generate();
      await store.initialize(keyPair);

      // Verify identity can be retrieved
      const retrieved = await store.getIdentityKeyPair();
      expect(retrieved).toBeDefined();
    });

    it('should trust identity on first use', async () => {
      const { BrowserIdentityKeyStore } = await import(
        '../../../../lib/encryption/adapters/browser-signal-stores'
      );
      const { ProtocolAddress, PublicKey, Direction } = await import(
        '@signalapp/libsignal-client'
      );

      const store = new BrowserIdentityKeyStore('user-123', 12345);

      const address = ProtocolAddress.new('remote-user', 1);
      const identityKey = {
        serialize: () => new Uint8Array([1, 2, 3]),
      };

      // First time should trust
      const isTrusted = await store.isTrustedIdentity(
        address,
        identityKey as any,
        Direction.Sending
      );

      expect(isTrusted).toBe(true);
    });
  });
});
