/**
 * Tests for SharedEncryptionService
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SharedEncryptionService, type KeyStorageAdapter } from '../encryption/encryption-service';
import type { CryptoAdapter, CryptoKey } from '../encryption/crypto-adapter';
import type { EncryptionMode } from '../types/encryption';

// Mock CryptoAdapter
function createMockCryptoAdapter(): CryptoAdapter {
  return {
    generateEncryptionKey: vi.fn().mockResolvedValue({
      type: 'secret',
      algorithm: 'AES-GCM',
      extractable: true,
      usages: ['encrypt', 'decrypt'],
    }),
    generateRandomBytes: vi.fn((length: number) => {
      const bytes = new Uint8Array(length);
      for (let i = 0; i < length; i++) {
        bytes[i] = Math.floor(Math.random() * 256);
      }
      return bytes;
    }),
    encrypt: vi.fn().mockResolvedValue({
      ciphertext: new Uint8Array([1, 2, 3, 4]),
      iv: new Uint8Array(12).fill(5),
      authTag: new Uint8Array(16).fill(6),
    }),
    decrypt: vi.fn().mockResolvedValue(new TextEncoder().encode('Decrypted message')),
    exportKey: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])),
    importKey: vi.fn().mockResolvedValue({
      type: 'secret',
      algorithm: 'AES-GCM',
      extractable: true,
      usages: ['encrypt', 'decrypt'],
    }),
    generateECDHKeyPair: vi.fn().mockResolvedValue({
      publicKey: { type: 'public', algorithm: 'ECDH', extractable: true, usages: [] },
      privateKey: { type: 'private', algorithm: 'ECDH', extractable: true, usages: [] },
    }),
    exportPublicKey: vi.fn().mockResolvedValue(new Uint8Array([10, 20, 30, 40])),
    exportPrivateKey: vi.fn().mockResolvedValue(new Uint8Array([50, 60, 70, 80])),
    importPublicKey: vi.fn().mockResolvedValue({ type: 'public', algorithm: 'ECDH', extractable: true, usages: [] }),
    importPrivateKey: vi.fn().mockResolvedValue({ type: 'private', algorithm: 'ECDH', extractable: true, usages: [] }),
    deriveSharedSecret: vi.fn().mockResolvedValue({
      type: 'secret',
      algorithm: 'AES-GCM',
      extractable: true,
      usages: ['encrypt', 'decrypt'],
    }),
    deriveKeyFromPassword: vi.fn().mockResolvedValue({
      type: 'secret',
      algorithm: 'AES-GCM',
      extractable: true,
      usages: ['encrypt', 'decrypt'],
    }),
  };
}

// Mock KeyStorageAdapter
function createMockKeyStorage(): KeyStorageAdapter {
  const keys = new Map<string, string>();
  const conversationKeys = new Map<string, { keyId: string; mode: EncryptionMode; createdAt: number }>();
  const userKeys = new Map<string, any>();

  return {
    storeKey: vi.fn(async (keyId: string, keyData: string) => {
      keys.set(keyId, keyData);
    }),
    getKey: vi.fn(async (keyId: string) => keys.get(keyId) || null),
    storeConversationKey: vi.fn(async (conversationId: string, keyId: string, mode: EncryptionMode) => {
      conversationKeys.set(conversationId, { keyId, mode, createdAt: Date.now() });
    }),
    getConversationKey: vi.fn(async (conversationId: string) => conversationKeys.get(conversationId) || null),
    storeUserKeys: vi.fn(async (data: any) => {
      userKeys.set(data.userId, data);
    }),
    getUserKeys: vi.fn(async (userId: string) => userKeys.get(userId) || null),
    clearAll: vi.fn(async () => {
      keys.clear();
      conversationKeys.clear();
      userKeys.clear();
    }),
    exportKeys: vi.fn().mockResolvedValue('encrypted-backup'),
    importKeys: vi.fn().mockResolvedValue(undefined),
  };
}

describe('SharedEncryptionService', () => {
  let service: SharedEncryptionService;
  let cryptoAdapter: CryptoAdapter;
  let keyStorage: KeyStorageAdapter;

  beforeEach(() => {
    cryptoAdapter = createMockCryptoAdapter();
    keyStorage = createMockKeyStorage();
    service = new SharedEncryptionService({
      cryptoAdapter,
      keyStorage,
    });
  });

  describe('constructor', () => {
    it('should create service with adapters', () => {
      expect(service).toBeInstanceOf(SharedEncryptionService);
    });
  });

  describe('initialize', () => {
    it('should initialize service for user', async () => {
      await service.initialize('user-123');

      const status = service.getStatus();
      expect(status.isInitialized).toBe(true);
      expect(status.userId).toBe('user-123');
    });

    it('should not reinitialize for same user', async () => {
      await service.initialize('user-123');
      await service.initialize('user-123');

      expect(keyStorage.getUserKeys).toHaveBeenCalledTimes(1);
    });

    it('should reinitialize for different user', async () => {
      await service.initialize('user-123');
      await service.initialize('user-456');

      expect(keyStorage.getUserKeys).toHaveBeenCalledTimes(2);
      expect(service.getStatus().userId).toBe('user-456');
    });
  });

  describe('generateUserKeys', () => {
    it('should throw if not initialized', async () => {
      await expect(service.generateUserKeys()).rejects.toThrow('Encryption service not initialized');
    });

    it('should generate keys for initialized user', async () => {
      await service.initialize('user-123');

      const bundle = await service.generateUserKeys();

      expect(bundle).toHaveProperty('identityKey');
      expect(bundle).toHaveProperty('signedPreKey');
      expect(bundle).toHaveProperty('registrationId');
      expect(keyStorage.storeUserKeys).toHaveBeenCalled();
    });
  });

  describe('getUserKeyBundle', () => {
    it('should return null for non-existent user', async () => {
      await service.initialize('user-123');

      const bundle = await service.getUserKeyBundle('non-existent');

      expect(bundle).toBeNull();
    });

    it('should return bundle for user with keys', async () => {
      await service.initialize('user-123');
      await service.generateUserKeys();

      const bundle = await service.getUserKeyBundle('user-123');

      expect(bundle).not.toBeNull();
      expect(bundle?.identityKey).toBeDefined();
    });

    it('should return current user bundle when no userId provided', async () => {
      await service.initialize('user-123');
      await service.generateUserKeys();

      const bundle = await service.getUserKeyBundle();

      expect(bundle).not.toBeNull();
    });

    it('should return null when no user initialized', async () => {
      const bundle = await service.getUserKeyBundle();
      expect(bundle).toBeNull();
    });
  });

  describe('encryptMessage', () => {
    it('should throw if not initialized', async () => {
      await expect(service.encryptMessage('Hello', 'conv-1', 'server')).rejects.toThrow(
        'Encryption service not initialized'
      );
    });

    it('should encrypt message with server mode', async () => {
      await service.initialize('user-123');

      const payload = await service.encryptMessage('Hello World', 'conv-1', 'server');

      expect(payload).toHaveProperty('ciphertext');
      expect(payload).toHaveProperty('metadata');
      expect(payload.metadata.mode).toBe('server');
    });

    it('should reuse conversation key', async () => {
      await service.initialize('user-123');

      await service.encryptMessage('Message 1', 'conv-1', 'server');
      await service.encryptMessage('Message 2', 'conv-1', 'server');

      // Should only generate one key
      expect(cryptoAdapter.generateEncryptionKey).toHaveBeenCalledTimes(1);
    });

    it('should generate different keys for different conversations', async () => {
      await service.initialize('user-123');

      await service.encryptMessage('Message 1', 'conv-1', 'server');
      await service.encryptMessage('Message 2', 'conv-2', 'server');

      expect(cryptoAdapter.generateEncryptionKey).toHaveBeenCalledTimes(2);
    });
  });

  describe('decryptMessage', () => {
    it('should throw if not initialized', async () => {
      const payload = {
        ciphertext: 'test',
        metadata: {
          mode: 'server' as EncryptionMode,
          protocol: 'aes-256-gcm' as const,
          keyId: 'key-1',
          iv: 'iv',
          authTag: 'tag',
        },
      };

      await expect(service.decryptMessage(payload)).rejects.toThrow('Encryption service not initialized');
    });

    it('should decrypt server-encrypted message', async () => {
      await service.initialize('user-123');

      // First encrypt a message
      const encrypted = await service.encryptMessage('Secret message', 'conv-1', 'server');

      // Then decrypt it
      const decrypted = await service.decryptMessage(encrypted);

      expect(decrypted).toBe('Decrypted message'); // From mock
    });

    it('should throw for missing key', async () => {
      await service.initialize('user-123');

      const payload = {
        ciphertext: 'test',
        metadata: {
          mode: 'server' as EncryptionMode,
          protocol: 'aes-256-gcm' as const,
          keyId: 'non-existent-key',
          iv: 'iv',
          authTag: 'tag',
        },
      };

      await expect(service.decryptMessage(payload)).rejects.toThrow('Decryption key not found');
    });

    it('should throw for e2ee message without Signal service', async () => {
      await service.initialize('user-123');

      const payload = {
        ciphertext: 'test',
        metadata: {
          mode: 'e2ee' as EncryptionMode,
          protocol: 'signal_v3' as const,
          keyId: 'key-1',
          iv: 'iv',
          authTag: 'tag',
        },
      };

      await expect(service.decryptMessage(payload)).rejects.toThrow('Signal Protocol not available');
    });

    it('should throw for e2ee message without sender', async () => {
      // Create service with mock signal service
      const mockSignalService = {
        decryptMessage: vi.fn().mockResolvedValue('Decrypted'),
      };

      const serviceWithSignal = new SharedEncryptionService({
        cryptoAdapter,
        keyStorage,
        signalProtocolService: mockSignalService as any,
      });

      await serviceWithSignal.initialize('user-123');

      const payload = {
        ciphertext: 'test',
        metadata: {
          mode: 'e2ee' as EncryptionMode,
          protocol: 'signal_v3' as const,
          keyId: 'key-1',
          iv: 'iv',
          authTag: 'tag',
        },
      };

      await expect(serviceWithSignal.decryptMessage(payload)).rejects.toThrow('Sender user ID required');
    });
  });

  describe('hasConversationKey', () => {
    it('should return false for new conversation', async () => {
      await service.initialize('user-123');

      const hasKey = await service.hasConversationKey('conv-new');

      expect(hasKey).toBe(false);
    });

    it('should return true after encryption', async () => {
      await service.initialize('user-123');
      await service.encryptMessage('Test', 'conv-1', 'server');

      const hasKey = await service.hasConversationKey('conv-1');

      expect(hasKey).toBe(true);
    });
  });

  describe('getConversationMode', () => {
    it('should return null for non-encrypted conversation', async () => {
      await service.initialize('user-123');

      const mode = await service.getConversationMode('conv-new');

      expect(mode).toBeNull();
    });

    it('should return mode after encryption', async () => {
      await service.initialize('user-123');
      await service.encryptMessage('Test', 'conv-1', 'server');

      const mode = await service.getConversationMode('conv-1');

      expect(mode).toBe('server');
    });
  });

  describe('prepareMessage', () => {
    it('should return plaintext for non-encrypted conversation', async () => {
      await service.initialize('user-123');

      const result = await service.prepareMessage('Hello', 'conv-new');

      expect(result.content).toBe('Hello');
      expect(result.encryptedPayload).toBeUndefined();
    });

    it('should encrypt when mode specified', async () => {
      await service.initialize('user-123');

      const result = await service.prepareMessage('Hello', 'conv-1', 'server');

      expect(result.content).toBe('Hello'); // Server mode keeps original
      expect(result.encryptedPayload).toBeDefined();
    });
  });

  describe('processReceivedMessage', () => {
    it('should return content for non-encrypted message', async () => {
      await service.initialize('user-123');

      const result = await service.processReceivedMessage({
        content: 'Plain message',
      });

      expect(result).toBe('Plain message');
    });

    it('should decrypt encrypted message', async () => {
      await service.initialize('user-123');

      // First encrypt to create the key
      const encrypted = await service.encryptMessage('Secret', 'conv-1', 'server');

      const result = await service.processReceivedMessage({
        content: '[Encrypted]',
        encryptedContent: encrypted.ciphertext,
        encryptionMetadata: encrypted.metadata,
      });

      expect(result).toBe('Decrypted message'); // From mock
    });

    it('should return error message on decryption failure', async () => {
      await service.initialize('user-123');

      const result = await service.processReceivedMessage({
        content: '[Encrypted]',
        encryptedContent: 'invalid',
        encryptionMetadata: {
          mode: 'server',
          protocol: 'aes-256-gcm',
          keyId: 'non-existent',
          iv: 'iv',
          authTag: 'tag',
        },
      });

      expect(result).toContain('Unable to decrypt');
    });
  });

  describe('prepareForStorage', () => {
    it('should separate ciphertext and metadata', async () => {
      await service.initialize('user-123');
      const encrypted = await service.encryptMessage('Test', 'conv-1', 'server');

      const stored = service.prepareForStorage(encrypted);

      expect(stored.encryptedContent).toBe(encrypted.ciphertext);
      expect(stored.encryptionMetadata).toEqual(encrypted.metadata);
    });
  });

  describe('clearKeys', () => {
    it('should clear all keys and reset state', async () => {
      await service.initialize('user-123');

      await service.clearKeys();

      const status = service.getStatus();
      expect(status.isInitialized).toBe(false);
      expect(status.userId).toBeNull();
      expect(keyStorage.clearAll).toHaveBeenCalled();
    });
  });

  describe('exportKeys', () => {
    it('should export keys with password', async () => {
      await service.initialize('user-123');

      const backup = await service.exportKeys('password123');

      expect(backup).toBe('encrypted-backup');
      expect(keyStorage.exportKeys).toHaveBeenCalledWith('password123');
    });
  });

  describe('importKeys', () => {
    it('should import keys from backup', async () => {
      await service.initialize('user-123');

      await service.importKeys('backup-data', 'password123');

      expect(keyStorage.importKeys).toHaveBeenCalledWith('backup-data', 'password123');
    });
  });

  describe('isAvailable', () => {
    it('should return true', () => {
      expect(service.isAvailable()).toBe(true);
    });
  });

  describe('getStatus', () => {
    it('should return initial status', () => {
      const status = service.getStatus();

      expect(status.isInitialized).toBe(false);
      expect(status.userId).toBeNull();
      expect(status.isAvailable).toBe(true);
    });

    it('should return initialized status', async () => {
      await service.initialize('user-123');

      const status = service.getStatus();

      expect(status.isInitialized).toBe(true);
      expect(status.userId).toBe('user-123');
      expect(status.isAvailable).toBe(true);
    });
  });
});
