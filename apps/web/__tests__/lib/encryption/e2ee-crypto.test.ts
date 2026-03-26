/**
 * Tests for E2EE Crypto Bridge
 * Tests the public API of e2eeCrypto which bridges SharedEncryptionService
 * with the SocketIO EncryptionHandlers interface.
 */

import type { EncryptedPayload, EncryptionMode } from '@meeshy/shared/types/encryption';

// Mock SharedEncryptionService before importing the module
const mockInitialize = jest.fn().mockResolvedValue(undefined);
const mockEncryptMessage = jest.fn();
const mockDecryptMessage = jest.fn();
const mockGetConversationMode = jest.fn();
const mockClearKeys = jest.fn().mockResolvedValue(undefined);

jest.mock('@meeshy/shared/encryption', () => ({
  SharedEncryptionService: jest.fn().mockImplementation(() => ({
    initialize: mockInitialize,
    encryptMessage: mockEncryptMessage,
    decryptMessage: mockDecryptMessage,
    getConversationMode: mockGetConversationMode,
    clearKeys: mockClearKeys,
  })),
}));

jest.mock('@/lib/encryption/adapters/web-crypto-adapter', () => ({
  webCryptoAdapter: {},
}));

jest.mock('@/lib/encryption/adapters/indexeddb-key-storage-adapter', () => ({
  indexedDBKeyStorageAdapter: {},
}));

jest.mock('@/services/socketio/types', () => ({}));

// Import after mocks
import { e2eeCrypto } from '@/lib/encryption/e2ee-crypto';

describe('E2EECrypto', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initializeForUser', () => {
    it('calls service.initialize with userId', async () => {
      await e2eeCrypto.initializeForUser('user-123');

      expect(mockInitialize).toHaveBeenCalledWith('user-123');
    });

    it('is idempotent for the same userId', async () => {
      await e2eeCrypto.initializeForUser('user-same');
      await e2eeCrypto.initializeForUser('user-same');

      expect(mockInitialize).toHaveBeenCalledTimes(1);
    });

    it('re-initializes for a different userId', async () => {
      await e2eeCrypto.initializeForUser('user-a');
      await e2eeCrypto.initializeForUser('user-b');

      expect(mockInitialize).toHaveBeenCalledTimes(2);
      expect(mockInitialize).toHaveBeenNthCalledWith(1, 'user-a');
      expect(mockInitialize).toHaveBeenNthCalledWith(2, 'user-b');
    });
  });

  describe('encrypt', () => {
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

    it('returns encrypted payload for an encrypted conversation', async () => {
      mockGetConversationMode.mockResolvedValue('AES_GCM');
      mockEncryptMessage.mockResolvedValue(fakePayload);

      const result = await e2eeCrypto.encrypt('hello', 'conv-1');

      expect(result).toEqual(fakePayload);
      expect(mockEncryptMessage).toHaveBeenCalledWith('hello', 'conv-1', 'AES_GCM');
    });

    it('returns null for a plaintext conversation (no mode)', async () => {
      mockGetConversationMode.mockResolvedValue(null);

      const result = await e2eeCrypto.encrypt('hello', 'conv-plain');

      expect(result).toBeNull();
      expect(mockEncryptMessage).not.toHaveBeenCalled();
    });

    it('returns null when encryption fails', async () => {
      mockGetConversationMode.mockResolvedValue('AES_GCM');
      mockEncryptMessage.mockRejectedValue(new Error('Key not found'));

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

    it('returns decrypted content', async () => {
      mockDecryptMessage.mockResolvedValue('decrypted-hello');

      const result = await e2eeCrypto.decrypt(fakePayload, 'sender-1');

      expect(result).toBe('decrypted-hello');
      expect(mockDecryptMessage).toHaveBeenCalledWith(fakePayload, 'sender-1');
    });

    it('throws on decryption failure', async () => {
      mockDecryptMessage.mockRejectedValue(new Error('Invalid key'));

      await expect(e2eeCrypto.decrypt(fakePayload)).rejects.toThrow('Invalid key');
    });
  });

  describe('getConversationMode', () => {
    it('returns the mode for an encrypted conversation', async () => {
      mockGetConversationMode.mockResolvedValue('AES_GCM');

      const result = await e2eeCrypto.getConversationMode('conv-encrypted');

      expect(result).toBe('AES_GCM');
    });

    it('returns null for a plaintext conversation', async () => {
      mockGetConversationMode.mockResolvedValue(null);

      const result = await e2eeCrypto.getConversationMode('conv-plain');

      expect(result).toBeNull();
    });
  });

  describe('clearKeys', () => {
    it('calls service.clearKeys and resets initialized state', async () => {
      await e2eeCrypto.initializeForUser('user-clear');
      mockInitialize.mockClear();

      await e2eeCrypto.clearKeys();

      expect(mockClearKeys).toHaveBeenCalled();

      // After clearing, re-initializing should call service.initialize again
      await e2eeCrypto.initializeForUser('user-clear');
      expect(mockInitialize).toHaveBeenCalledWith('user-clear');
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
      mockGetConversationMode.mockResolvedValue('AES_GCM');
      mockEncryptMessage.mockResolvedValue({ ciphertext: 'test' });

      const handlers = e2eeCrypto.createEncryptionHandlers();
      await handlers.encrypt('test-content', 'conv-handler');

      expect(mockGetConversationMode).toHaveBeenCalledWith('conv-handler');
      expect(mockEncryptMessage).toHaveBeenCalled();
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
