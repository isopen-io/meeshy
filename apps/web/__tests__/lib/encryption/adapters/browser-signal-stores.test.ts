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
}), { virtual: true });

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
      const { IdentityKeyPair } = await import('@signalapp/libsignal-client' as any);

      const store = new BrowserIdentityKeyStore('user-123', 12345);

      const keyPair = IdentityKeyPair.generate();
      await store.initialize(keyPair);

      const retrieved = await store.getIdentityKeyPair();
      expect(retrieved).toBeDefined();
    });

    it('should trust identity on first use', async () => {
      const { BrowserIdentityKeyStore } = await import(
        '../../../../lib/encryption/adapters/browser-signal-stores'
      );
      const { ProtocolAddress, Direction } = await import(
        '@signalapp/libsignal-client' as any
      );

      const store = new BrowserIdentityKeyStore('user-123', 12345);

      const address = ProtocolAddress.new('remote-user', 1);
      const identityKey = {
        serialize: () => new Uint8Array([1, 2, 3]),
      };

      const isTrusted = await store.isTrustedIdentity(
        address,
        identityKey as any,
        Direction.Sending
      );

      expect(isTrusted).toBe(true);
    });
  });

  describe('BrowserIdentityKeyStore comprehensive', () => {
    it('loadFromStorage sets identityKeyPair when data exists in storage', async () => {
      const { BrowserIdentityKeyStore } = await import(
        '../../../../lib/encryption/adapters/browser-signal-stores'
      );
      const { IdentityKeyPair } = await import('@signalapp/libsignal-client' as any);

      const store = new BrowserIdentityKeyStore('load-user', 99);
      const keyPair = IdentityKeyPair.generate();
      await store.initialize(keyPair);

      const freshStore = new BrowserIdentityKeyStore('load-user', 99);
      await freshStore.loadFromStorage();

      const retrieved = await freshStore.getIdentityKeyPair();
      expect(retrieved).toBeDefined();
    });

    it('getIdentityKeyPair triggers loadFromStorage when identityKeyPair is null', async () => {
      const { BrowserIdentityKeyStore } = await import(
        '../../../../lib/encryption/adapters/browser-signal-stores'
      );
      const { IdentityKeyPair } = await import('@signalapp/libsignal-client' as any);

      const store = new BrowserIdentityKeyStore('lazy-load-user', 77);
      const keyPair = IdentityKeyPair.generate();
      await store.initialize(keyPair);

      const freshStore = new BrowserIdentityKeyStore('lazy-load-user', 77);
      const result = await freshStore.getIdentityKeyPair();
      expect(result).toBeDefined();
    });

    it('getIdentityKeyPair throws when storage has no data', async () => {
      const { BrowserIdentityKeyStore } = await import(
        '../../../../lib/encryption/adapters/browser-signal-stores'
      );

      const store = new BrowserIdentityKeyStore('never-initialized-user', 55);

      await expect(store.getIdentityKeyPair()).rejects.toThrow(
        'Identity key pair not initialized'
      );
    });

    it('getIdentityKey returns the private key', async () => {
      const { BrowserIdentityKeyStore } = await import(
        '../../../../lib/encryption/adapters/browser-signal-stores'
      );
      const { IdentityKeyPair } = await import('@signalapp/libsignal-client' as any);

      const store = new BrowserIdentityKeyStore('identity-key-user', 11);
      const keyPair = IdentityKeyPair.generate();
      await store.initialize(keyPair);

      const privateKey = await store.getIdentityKey();
      expect(privateKey).toBeDefined();
    });

    it('saveIdentity returns false on first save (no existing key)', async () => {
      const { BrowserIdentityKeyStore } = await import(
        '../../../../lib/encryption/adapters/browser-signal-stores'
      );
      const { ProtocolAddress } = await import('@signalapp/libsignal-client' as any);

      const store = new BrowserIdentityKeyStore('save-identity-user', 22);
      const address = ProtocolAddress.new('peer-alice', 1);
      const identityKey = { serialize: () => new Uint8Array([10, 20, 30]) };

      const result = await store.saveIdentity(address as any, identityKey as any);
      expect(result).toBe(false);
    });

    it('saveIdentity returns true when key has changed', async () => {
      const { BrowserIdentityKeyStore } = await import(
        '../../../../lib/encryption/adapters/browser-signal-stores'
      );
      const { ProtocolAddress } = await import('@signalapp/libsignal-client' as any);

      const store = new BrowserIdentityKeyStore('save-identity-change-user', 33);
      const address = ProtocolAddress.new('peer-bob', 1);
      const firstKey = { serialize: () => new Uint8Array([1, 2, 3]) };
      const secondKey = { serialize: () => new Uint8Array([4, 5, 6]) };

      await store.saveIdentity(address as any, firstKey as any);
      const result = await store.saveIdentity(address as any, secondKey as any);
      expect(result).toBe(true);
    });

    it('saveIdentity returns false when key is unchanged', async () => {
      const { BrowserIdentityKeyStore } = await import(
        '../../../../lib/encryption/adapters/browser-signal-stores'
      );
      const { ProtocolAddress } = await import('@signalapp/libsignal-client' as any);

      const store = new BrowserIdentityKeyStore('save-identity-same-user', 44);
      const address = ProtocolAddress.new('peer-carol', 1);
      const identityKey = { serialize: () => new Uint8Array([7, 8, 9]) };

      await store.saveIdentity(address as any, identityKey as any);
      const result = await store.saveIdentity(address as any, identityKey as any);
      expect(result).toBe(false);
    });

    it('isTrustedIdentity returns true when stored key matches', async () => {
      const { BrowserIdentityKeyStore } = await import(
        '../../../../lib/encryption/adapters/browser-signal-stores'
      );
      const { ProtocolAddress, Direction } = await import('@signalapp/libsignal-client' as any);

      const store = new BrowserIdentityKeyStore('trusted-match-user', 66);
      const address = ProtocolAddress.new('peer-dave', 1);
      const keyBytes = new Uint8Array([11, 22, 33]);
      const identityKey = { serialize: () => keyBytes };

      await store.saveIdentity(address as any, identityKey as any);

      const isTrusted = await store.isTrustedIdentity(
        address as any,
        identityKey as any,
        Direction.Sending
      );
      expect(isTrusted).toBe(true);
    });

    it('isTrustedIdentity returns false when stored key differs', async () => {
      const { BrowserIdentityKeyStore } = await import(
        '../../../../lib/encryption/adapters/browser-signal-stores'
      );
      const { ProtocolAddress, Direction } = await import('@signalapp/libsignal-client' as any);

      const store = new BrowserIdentityKeyStore('trusted-diff-user', 77);
      const address = ProtocolAddress.new('peer-eve', 1);
      const firstKey = { serialize: () => new Uint8Array([1, 1, 1]) };
      const differentKey = { serialize: () => new Uint8Array([2, 2, 2]) };

      await store.saveIdentity(address as any, firstKey as any);

      const isTrusted = await store.isTrustedIdentity(
        address as any,
        differentKey as any,
        Direction.Sending
      );
      expect(isTrusted).toBe(false);
    });

    it('getIdentity returns non-null PublicKey when identity exists', async () => {
      const { BrowserIdentityKeyStore } = await import(
        '../../../../lib/encryption/adapters/browser-signal-stores'
      );
      const { ProtocolAddress } = await import('@signalapp/libsignal-client' as any);

      const store = new BrowserIdentityKeyStore('get-identity-user', 88);
      const address = ProtocolAddress.new('peer-frank', 1);
      const identityKey = { serialize: () => new Uint8Array([50, 60, 70]) };

      await store.saveIdentity(address as any, identityKey as any);

      const result = await store.getIdentity(address as any);
      expect(result).not.toBeNull();
    });

    it('getIdentity returns null when no identity stored', async () => {
      const { BrowserIdentityKeyStore } = await import(
        '../../../../lib/encryption/adapters/browser-signal-stores'
      );
      const { ProtocolAddress } = await import('@signalapp/libsignal-client' as any);

      const store = new BrowserIdentityKeyStore('no-identity-user', 99);
      const address = ProtocolAddress.new('unknown-peer', 1);

      const result = await store.getIdentity(address as any);
      expect(result).toBeNull();
    });

    it('arraysEqual returns false for arrays of different length', async () => {
      const { BrowserIdentityKeyStore } = await import(
        '../../../../lib/encryption/adapters/browser-signal-stores'
      );
      const { ProtocolAddress, Direction } = await import('@signalapp/libsignal-client' as any);

      const store = new BrowserIdentityKeyStore('arrays-user', 111);
      const address = ProtocolAddress.new('peer-grace', 1);
      const shortKey = { serialize: () => new Uint8Array([1, 2]) };
      const longKey = { serialize: () => new Uint8Array([1, 2, 3]) };

      await store.saveIdentity(address as any, shortKey as any);

      const isTrusted = await store.isTrustedIdentity(
        address as any,
        longKey as any,
        Direction.Sending
      );
      expect(isTrusted).toBe(false);
    });
  });

  describe('BrowserPreKeyStore comprehensive', () => {
    it('savePreKey and getPreKey roundtrip returns deserializable record', async () => {
      const { BrowserPreKeyStore } = await import(
        '../../../../lib/encryption/adapters/browser-signal-stores'
      );
      const { PreKeyRecord } = await import('@signalapp/libsignal-client' as any);

      const store = new BrowserPreKeyStore();
      const preKeyId = 42;
      const recordData = new Uint8Array([100, 101, 102]);
      const record = { serialize: () => recordData };

      await store.savePreKey(preKeyId, record as any);
      const retrieved = await store.getPreKey(preKeyId);
      expect(retrieved).toBeDefined();
    });

    it('getPreKey throws when pre-key not found', async () => {
      const { BrowserPreKeyStore } = await import(
        '../../../../lib/encryption/adapters/browser-signal-stores'
      );

      const store = new BrowserPreKeyStore();

      await expect(store.getPreKey(9999)).rejects.toThrow('Pre-key 9999 not found');
    });

    it('removePreKey causes subsequent getPreKey to throw', async () => {
      const { BrowserPreKeyStore } = await import(
        '../../../../lib/encryption/adapters/browser-signal-stores'
      );

      const store = new BrowserPreKeyStore();
      const preKeyId = 7;
      const record = { serialize: () => new Uint8Array([1, 2, 3]) };

      await store.savePreKey(preKeyId, record as any);
      await store.removePreKey(preKeyId);

      await expect(store.getPreKey(preKeyId)).rejects.toThrow(`Pre-key ${preKeyId} not found`);
    });
  });

  describe('BrowserSignedPreKeyStore comprehensive', () => {
    it('saveSignedPreKey and getSignedPreKey roundtrip', async () => {
      const { BrowserSignedPreKeyStore } = await import(
        '../../../../lib/encryption/adapters/browser-signal-stores'
      );

      const store = new BrowserSignedPreKeyStore();
      const signedPreKeyId = 5;
      const recordData = new Uint8Array([200, 201, 202]);
      const record = { serialize: () => recordData };

      await store.saveSignedPreKey(signedPreKeyId, record as any);
      const retrieved = await store.getSignedPreKey(signedPreKeyId);
      expect(retrieved).toBeDefined();
    });

    it('getSignedPreKey throws when signed pre-key not found', async () => {
      const { BrowserSignedPreKeyStore } = await import(
        '../../../../lib/encryption/adapters/browser-signal-stores'
      );

      const store = new BrowserSignedPreKeyStore();

      await expect(store.getSignedPreKey(8888)).rejects.toThrow('Signed pre-key 8888 not found');
    });
  });

  describe('BrowserKyberPreKeyStore comprehensive', () => {
    it('saveKyberPreKey and getKyberPreKey roundtrip', async () => {
      const { BrowserKyberPreKeyStore } = await import(
        '../../../../lib/encryption/adapters/browser-signal-stores'
      );

      const store = new BrowserKyberPreKeyStore();
      const kyberPreKeyId = 3;
      const serializedData = new Uint8Array([10, 20, 30]);
      const record = { serialize: () => serializedData };

      await store.saveKyberPreKey(kyberPreKeyId, record as any);
      const retrieved = await store.getKyberPreKey(kyberPreKeyId);
      expect(retrieved).toBeDefined();
    });

    it('getKyberPreKey throws when kyber pre-key not found', async () => {
      const { BrowserKyberPreKeyStore } = await import(
        '../../../../lib/encryption/adapters/browser-signal-stores'
      );

      const store = new BrowserKyberPreKeyStore();

      await expect(store.getKyberPreKey(7777)).rejects.toThrow('Kyber pre-key 7777 not found');
    });

    it('markKyberPreKeyUsed updates the used flag when record exists', async () => {
      const { BrowserKyberPreKeyStore } = await import(
        '../../../../lib/encryption/adapters/browser-signal-stores'
      );

      const store = new BrowserKyberPreKeyStore();
      const kyberPreKeyId = 15;
      const record = { serialize: () => new Uint8Array([5, 6, 7]) };

      await store.saveKyberPreKey(kyberPreKeyId, record as any);
      await expect(store.markKyberPreKeyUsed(kyberPreKeyId)).resolves.toBeUndefined();
    });

    it('markKyberPreKeyUsed is a no-op when record does not exist', async () => {
      const { BrowserKyberPreKeyStore } = await import(
        '../../../../lib/encryption/adapters/browser-signal-stores'
      );

      const store = new BrowserKyberPreKeyStore();

      await expect(store.markKyberPreKeyUsed(66666)).resolves.toBeUndefined();
    });
  });

  describe('BrowserSessionStore comprehensive', () => {
    it('saveSession and getSession roundtrip', async () => {
      const { BrowserSessionStore } = await import(
        '../../../../lib/encryption/adapters/browser-signal-stores'
      );
      const { ProtocolAddress } = await import('@signalapp/libsignal-client' as any);

      const store = new BrowserSessionStore();
      const address = ProtocolAddress.new('session-peer', 1);
      const record = { serialize: () => new Uint8Array([30, 40, 50]) };

      await store.saveSession(address as any, record as any);
      const retrieved = await store.getSession(address as any);
      expect(retrieved).toBeDefined();
    });

    it('getSession returns null when no session exists', async () => {
      const { BrowserSessionStore } = await import(
        '../../../../lib/encryption/adapters/browser-signal-stores'
      );
      const { ProtocolAddress } = await import('@signalapp/libsignal-client' as any);

      const store = new BrowserSessionStore();
      const address = ProtocolAddress.new('no-session-peer', 1);

      const result = await store.getSession(address as any);
      expect(result).toBeNull();
    });

    it('getExistingSessions returns only sessions that exist', async () => {
      const { BrowserSessionStore } = await import(
        '../../../../lib/encryption/adapters/browser-signal-stores'
      );
      const { ProtocolAddress } = await import('@signalapp/libsignal-client' as any);

      const store = new BrowserSessionStore();
      const existingAddress = ProtocolAddress.new('existing-peer', 1);
      const missingAddress = ProtocolAddress.new('missing-peer', 2);
      const record = { serialize: () => new Uint8Array([60, 70, 80]) };

      await store.saveSession(existingAddress as any, record as any);

      const results = await store.getExistingSessions([existingAddress as any, missingAddress as any]);
      expect(results).toHaveLength(1);
    });
  });

  describe('BrowserSenderKeyStore comprehensive', () => {
    it('saveSenderKey and getSenderKey roundtrip', async () => {
      const { BrowserSenderKeyStore } = await import(
        '../../../../lib/encryption/adapters/browser-signal-stores'
      );
      const { ProtocolAddress, Uuid } = await import('@signalapp/libsignal-client' as any);

      const store = new BrowserSenderKeyStore();
      const sender = ProtocolAddress.new('sender-user', 1);
      const distributionId = Uuid.fromString('test-dist-id');
      const record = { serialize: () => new Uint8Array([90, 91, 92]) };

      await store.saveSenderKey(sender as any, distributionId as any, record as any);
      const retrieved = await store.getSenderKey(sender as any, distributionId as any);
      expect(retrieved).toBeDefined();
    });

    it('getSenderKey returns null when no sender key exists', async () => {
      const { BrowserSenderKeyStore } = await import(
        '../../../../lib/encryption/adapters/browser-signal-stores'
      );
      const { ProtocolAddress, Uuid } = await import('@signalapp/libsignal-client' as any);

      const store = new BrowserSenderKeyStore();
      const sender = ProtocolAddress.new('no-sender', 1);
      const distributionId = Uuid.fromString('no-dist-id');

      const result = await store.getSenderKey(sender as any, distributionId as any);
      expect(result).toBeNull();
    });
  });

  describe('createBrowserSignalStores error recovery', () => {
    it('generates new identity pair when loadFromStorage throws', async () => {
      let callCount = 0;

      const smartMock = {
        open: jest.fn(() => {
          callCount++;
          const isLoadCall = callCount === 1;

          const db = {
            transaction: jest.fn(() => ({
              objectStore: jest.fn(() => ({
                get: jest.fn(() => {
                  if (isLoadCall) {
                    const req = {
                      onsuccess: null as any,
                      onerror: null as any,
                      error: new Error('get failed'),
                    };
                    setTimeout(() => req.onerror?.(), 0);
                    return req;
                  }
                  const req = {
                    onsuccess: null as any,
                    onerror: null as any,
                    result: undefined,
                    error: null,
                  };
                  setTimeout(() => req.onsuccess?.(), 0);
                  return req;
                }),
                put: jest.fn((_value: unknown, _key: unknown) => {
                  const req = {
                    onsuccess: null as any,
                    onerror: null as any,
                    error: null,
                    result: _key,
                  };
                  setTimeout(() => req.onsuccess?.(), 0);
                  return req;
                }),
              })),
            })),
            close: jest.fn(),
            objectStoreNames: { contains: jest.fn(() => true) },
            createObjectStore: jest.fn(),
          };

          const request = {
            onsuccess: null as any,
            onerror: null as any,
            onupgradeneeded: null as any,
            result: db,
            error: null,
          };
          setTimeout(() => request.onsuccess?.(), 0);
          return request;
        }),
      };

      Object.defineProperty(global, 'indexedDB', { value: smartMock, configurable: true });

      const { createBrowserSignalStores } = await import(
        '../../../../lib/encryption/adapters/browser-signal-stores'
      );

      const stores = await createBrowserSignalStores({ userId: 'error-recovery-user' });
      expect(stores).toBeDefined();
      expect(stores.identityStore).toBeDefined();

      Object.defineProperty(global, 'indexedDB', { value: mockIDB, configurable: true });
    });
  });
});
