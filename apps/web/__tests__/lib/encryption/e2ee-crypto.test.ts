/**
 * Tests for E2EE Crypto Bridge
 * Tests the public API of e2eeCrypto which bridges SharedEncryptionService
 * with the SocketIO EncryptionHandlers interface.
 *
 * Strategy: mock the crypto/storage adapters so the real SharedEncryptionService
 * can function, then test e2eeCrypto's observable behavior via adapter mock calls.
 */

import type { EncryptedPayload, EncryptionMode } from '@meeshy/shared/types/encryption';

jest.mock('@/lib/encryption/adapters/indexeddb-key-storage-adapter', () => ({
  indexedDBKeyStorageAdapter: {
    getUserKeys: jest.fn().mockResolvedValue(null),
    storeUserKeys: jest.fn().mockResolvedValue(undefined),
    getConversationKey: jest.fn().mockResolvedValue(null),
    storeConversationKey: jest.fn().mockResolvedValue(undefined),
    getKey: jest.fn().mockResolvedValue(null),
    storeKey: jest.fn().mockResolvedValue(undefined),
    clearAll: jest.fn().mockResolvedValue(undefined),
    exportKeys: jest.fn().mockResolvedValue('{}'),
    importKeys: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('@/lib/encryption/adapters/web-crypto-adapter', () => ({
  webCryptoAdapter: {
    generateEncryptionKey: jest.fn().mockResolvedValue({
      type: 'secret',
      algorithm: 'AES-GCM',
      extractable: true,
      usages: ['encrypt', 'decrypt'],
    }),
    generateRandomBytes: jest.fn().mockReturnValue(new Uint8Array(12)),
    encrypt: jest.fn(),
    decrypt: jest.fn(),
    exportKey: jest.fn().mockResolvedValue(new Uint8Array(32)),
    importKey: jest.fn(),
    generateECDHKeyPair: jest.fn(),
    exportPublicKey: jest.fn(),
    exportPrivateKey: jest.fn(),
    importPublicKey: jest.fn(),
    importPrivateKey: jest.fn(),
    deriveSharedSecret: jest.fn(),
    deriveKeyFromPassword: jest.fn(),
  },
}));

jest.mock('@/services/socketio/types', () => ({}));

// Import after mocks
import { e2eeCrypto } from '@/lib/encryption/e2ee-crypto';
import { indexedDBKeyStorageAdapter } from '@/lib/encryption/adapters/indexeddb-key-storage-adapter';

// Helper to get typed mock methods
function ks() {
  return indexedDBKeyStorageAdapter as unknown as Record<string, jest.Mock>;
}

describe('E2EECrypto', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Restore default mock return values after clearAllMocks removes them
    ks().getUserKeys.mockResolvedValue(null);
    ks().storeUserKeys.mockResolvedValue(undefined);
    ks().getConversationKey.mockResolvedValue(null);
    ks().storeConversationKey.mockResolvedValue(undefined);
    ks().getKey.mockResolvedValue(null);
    ks().storeKey.mockResolvedValue(undefined);
    ks().clearAll.mockResolvedValue(undefined);
  });

  describe('initializeForUser', () => {
    it('calls service.initialize with userId', async () => {
      await e2eeCrypto.initializeForUser('user-123');

      expect(ks().getUserKeys).toHaveBeenCalledWith('user-123');
    });

    it('is idempotent for the same userId', async () => {
      await e2eeCrypto.initializeForUser('user-same');
      await e2eeCrypto.initializeForUser('user-same');

      expect(ks().getUserKeys).toHaveBeenCalledTimes(1);
    });

    it('re-initializes for a different userId', async () => {
      await e2eeCrypto.initializeForUser('user-a');
      await e2eeCrypto.initializeForUser('user-b');

      expect(ks().getUserKeys).toHaveBeenCalledTimes(2);
      expect(ks().getUserKeys).toHaveBeenNthCalledWith(1, 'user-a');
      expect(ks().getUserKeys).toHaveBeenNthCalledWith(2, 'user-b');
    });
  });

  describe('encrypt', () => {
    it('returns null for a plaintext conversation (no stored key)', async () => {
      ks().getConversationKey.mockResolvedValue(null);

      const result = await e2eeCrypto.encrypt('hello', 'conv-plain');

      expect(result).toBeNull();
    });

    it('returns null when encryption fails', async () => {
      ks().getConversationKey.mockResolvedValue({ keyId: 'key-1', mode: 'AES_GCM' });
      ks().getKey.mockRejectedValue(new Error('Key not found'));

      const result = await e2eeCrypto.encrypt('hello', 'conv-fail');

      expect(result).toBeNull();
    });
  });

  describe('decrypt', () => {
    const fakePayload: EncryptedPayload = {
      ciphertext: 'encrypted-data',
      metadata: {
        mode: 'e2ee' as EncryptionMode,
        protocol: 'aes-256-gcm' as const,
        keyId: 'key-1',
        iv: 'random-iv',
        authTag: 'auth-tag',
      },
    };

    it('throws on decryption failure', async () => {
      ks().getKey.mockRejectedValue(new Error('Invalid key'));

      await expect(e2eeCrypto.decrypt(fakePayload)).rejects.toThrow();
    });
  });

  describe('getConversationMode', () => {
    it('returns null for a conversation with no stored key', async () => {
      ks().getConversationKey.mockResolvedValue(null);

      const result = await e2eeCrypto.getConversationMode('conv-plain');

      expect(result).toBeNull();
    });

    it('returns the mode for a conversation with a stored key', async () => {
      ks().getConversationKey.mockResolvedValue({ keyId: 'key-1', mode: 'AES_GCM' });

      const result = await e2eeCrypto.getConversationMode('conv-encrypted');

      expect(result).toBe('AES_GCM');
    });
  });

  describe('clearKeys', () => {
    it('calls storage clearAll and resets initialized state', async () => {
      await e2eeCrypto.initializeForUser('user-clear');
      ks().getUserKeys.mockClear();
      ks().getUserKeys.mockResolvedValue(null);

      await e2eeCrypto.clearKeys();

      expect(ks().clearAll).toHaveBeenCalled();

      await e2eeCrypto.initializeForUser('user-clear');
      expect(ks().getUserKeys).toHaveBeenCalledWith('user-clear');
    });
  });

  describe('createEncryptionHandlers', () => {
    it('returns an object with encrypt, decrypt, and getConversationMode', () => {
      const handlers = e2eeCrypto.createEncryptionHandlers();

      expect(handlers).toHaveProperty('encrypt');
      expect(handlers).toHaveProperty('decrypt');
      expect(handlers).toHaveProperty('getConversationMode');
      expect(typeof handlers.encrypt).toBe('function');
      expect(typeof handlers.decrypt).toBe('function');
      expect(typeof handlers.getConversationMode).toBe('function');
    });

    it('handlers delegate to the e2eeCrypto methods', async () => {
      ks().getConversationKey.mockResolvedValue(null);

      const handlers = e2eeCrypto.createEncryptionHandlers();
      const result = await handlers.encrypt('test-content', 'conv-handler');

      expect(result).toBeNull();
      expect(ks().getConversationKey).toHaveBeenCalledWith('conv-handler');
    });
  });

  describe('getService', () => {
    it('returns a SharedEncryptionService instance', () => {
      const service = e2eeCrypto.getService();

      expect(service).toBeDefined();
      expect(service).toHaveProperty('initialize');
      expect(service).toHaveProperty('encryptMessage');
    });

    it('returns the same instance on subsequent calls (singleton)', () => {
      const service1 = e2eeCrypto.getService();
      const service2 = e2eeCrypto.getService();

      expect(service1).toBe(service2);
    });
  });
});
