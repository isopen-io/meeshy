/**
 * Unit Tests for Shared Encryption Service
 *
 * Tests the SharedEncryptionService using mock adapters to verify business logic.
 */

import { SharedEncryptionService } from '../../../../shared/encryption/encryption-service';
import type {
  CryptoAdapter,
  CryptoKey,
  EncryptionResult,
  DecryptionParams,
  KeyPair,
} from '../../../../shared/encryption/crypto-adapter';
import type { KeyStorageAdapter } from '../../../../shared/encryption/encryption-service';
import type { EncryptionMode } from '../../../../shared/types/encryption';

// Mock CryptoKey implementation
class MockCryptoKey implements CryptoKey {
  constructor(
    public readonly type: 'secret' | 'public' | 'private',
    public readonly algorithm: string,
    public readonly extractable: boolean,
    public readonly usages: readonly string[],
    public readonly keyData: string = 'mock-key-data'
  ) {}
}

// Mock CryptoAdapter
class MockCryptoAdapter implements CryptoAdapter {
  async generateEncryptionKey(): Promise<CryptoKey> {
    return new MockCryptoKey('secret', 'aes-256-gcm', true, [
      'encrypt',
      'decrypt',
    ]);
  }

  generateRandomBytes(length: number): Uint8Array {
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
    return bytes;
  }

  async encrypt(
    plaintext: Uint8Array,
    key: CryptoKey,
    iv: Uint8Array
  ): Promise<EncryptionResult> {
    // Simple XOR encryption for testing
    const ciphertext = new Uint8Array(plaintext.length);
    for (let i = 0; i < plaintext.length; i++) {
      ciphertext[i] = plaintext[i] ^ 0xAB;
    }

    return {
      ciphertext,
      iv,
      authTag: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]),
    };
  }

  async decrypt(
    params: DecryptionParams,
    key: CryptoKey
  ): Promise<Uint8Array> {
    // Simple XOR decryption for testing
    const plaintext = new Uint8Array(params.ciphertext.length);
    for (let i = 0; i < params.ciphertext.length; i++) {
      plaintext[i] = params.ciphertext[i] ^ 0xAB;
    }
    return plaintext;
  }

  async exportKey(key: CryptoKey): Promise<Uint8Array> {
    const mockKey = key as MockCryptoKey;
    const encoder = new TextEncoder();
    return encoder.encode(mockKey.keyData);
  }

  async importKey(keyData: Uint8Array): Promise<CryptoKey> {
    const decoder = new TextDecoder();
    const keyDataStr = decoder.decode(keyData);
    return new MockCryptoKey('secret', 'aes-256-gcm', true, ['encrypt', 'decrypt'], keyDataStr);
  }

  async generateECDHKeyPair(): Promise<KeyPair> {
    return {
      publicKey: new MockCryptoKey('public', 'ecdh', true, []),
      privateKey: new MockCryptoKey('private', 'ecdh', true, ['deriveKey']),
    };
  }

  async exportPublicKey(key: CryptoKey): Promise<Uint8Array> {
    return new TextEncoder().encode('mock-public-key');
  }

  async exportPrivateKey(key: CryptoKey): Promise<Uint8Array> {
    return new TextEncoder().encode('mock-private-key');
  }

  async importPublicKey(keyData: Uint8Array): Promise<CryptoKey> {
    return new MockCryptoKey('public', 'ecdh', true, []);
  }

  async importPrivateKey(keyData: Uint8Array): Promise<CryptoKey> {
    return new MockCryptoKey('private', 'ecdh', true, ['deriveKey']);
  }

  async deriveSharedSecret(
    privateKey: CryptoKey,
    publicKey: CryptoKey
  ): Promise<CryptoKey> {
    return new MockCryptoKey('secret', 'aes-256-gcm', true, [
      'encrypt',
      'decrypt',
    ], 'derived-shared-secret');
  }

  async deriveKeyFromPassword(
    password: string,
    salt: Uint8Array,
    iterations: number
  ): Promise<CryptoKey> {
    return new MockCryptoKey('secret', 'aes-256-gcm', true, [
      'encrypt',
      'decrypt',
    ], `derived-from-${password}`);
  }
}

// Mock KeyStorageAdapter
class MockKeyStorageAdapter implements KeyStorageAdapter {
  private keys: Map<string, string> = new Map();
  private conversationKeys: Map<string, { keyId: string; mode: EncryptionMode; createdAt: number }> = new Map();
  private userKeys: Map<string, any> = new Map();

  async storeKey(
    keyId: string,
    keyData: string,
    conversationId?: string,
    userId?: string
  ): Promise<void> {
    this.keys.set(keyId, keyData);
  }

  async getKey(keyId: string): Promise<string | null> {
    return this.keys.get(keyId) || null;
  }

  async storeConversationKey(
    conversationId: string,
    keyId: string,
    mode: EncryptionMode
  ): Promise<void> {
    this.conversationKeys.set(conversationId, {
      keyId,
      mode,
      createdAt: Date.now(),
    });
  }

  async getConversationKey(conversationId: string): Promise<{
    keyId: string;
    mode: EncryptionMode;
    createdAt: number;
  } | null> {
    return this.conversationKeys.get(conversationId) || null;
  }

  async storeUserKeys(keys: any): Promise<void> {
    this.userKeys.set(keys.userId, keys);
  }

  async getUserKeys(userId: string): Promise<any> {
    return this.userKeys.get(userId) || null;
  }

  async clearAll(): Promise<void> {
    this.keys.clear();
    this.conversationKeys.clear();
    this.userKeys.clear();
  }

  async exportKeys(password: string): Promise<string> {
    return JSON.stringify({
      keys: Array.from(this.keys.entries()),
      conversationKeys: Array.from(this.conversationKeys.entries()),
      userKeys: Array.from(this.userKeys.entries()),
    });
  }

  async importKeys(backup: string, password: string): Promise<void> {
    const data = JSON.parse(backup);
    this.keys = new Map(data.keys);
    this.conversationKeys = new Map(data.conversationKeys);
    this.userKeys = new Map(data.userKeys);
  }
}

describe('SharedEncryptionService', () => {
  let service: SharedEncryptionService;
  let mockCryptoAdapter: MockCryptoAdapter;
  let mockKeyStorage: MockKeyStorageAdapter;

  beforeEach(() => {
    mockCryptoAdapter = new MockCryptoAdapter();
    mockKeyStorage = new MockKeyStorageAdapter();
    service = new SharedEncryptionService({
      cryptoAdapter: mockCryptoAdapter,
      keyStorage: mockKeyStorage,
    });
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      await service.initialize('user-123');

      const status = service.getStatus();
      expect(status.isInitialized).toBe(true);
      expect(status.userId).toBe('user-123');
      expect(status.isAvailable).toBe(true);
    });

    it('should not re-initialize if already initialized for same user', async () => {
      await service.initialize('user-123');
      await service.initialize('user-123'); // Should not throw

      const status = service.getStatus();
      expect(status.isInitialized).toBe(true);
      expect(status.userId).toBe('user-123');
    });

    it('should fail operations before initialization', async () => {
      await expect(
        service.encryptMessage('test', 'conv-1', 'server')
      ).rejects.toThrow('not initialized');
    });
  });

  describe('User Key Generation', () => {
    beforeEach(async () => {
      await service.initialize('user-123');
    });

    it('should generate Signal Protocol keys for user', async () => {
      const keyBundle = await service.generateUserKeys();

      expect(keyBundle).toBeDefined();
      expect(keyBundle.identityKey).toBeDefined();
      expect(keyBundle.signedPreKey).toBeDefined();
      expect(keyBundle.registrationId).toBeDefined();
      expect(typeof keyBundle.registrationId).toBe('number');
    });

    it('should store generated keys', async () => {
      await service.generateUserKeys();

      const keyBundle = await service.getUserKeyBundle();
      expect(keyBundle).toBeDefined();
      expect(keyBundle?.identityKey).toBeDefined();
    });

    it('should retrieve key bundle for current user', async () => {
      await service.generateUserKeys();

      const keyBundle = await service.getUserKeyBundle();
      expect(keyBundle).toBeDefined();
    });

    it('should return null for user without keys', async () => {
      const keyBundle = await service.getUserKeyBundle();
      expect(keyBundle).toBeNull();
    });
  });

  describe('Message Encryption/Decryption', () => {
    beforeEach(async () => {
      await service.initialize('user-123');
    });

    it('should encrypt message in server mode', async () => {
      const plaintext = 'Hello, this is a secret message!';
      const conversationId = 'conv-123';

      const encrypted = await service.encryptMessage(
        plaintext,
        conversationId,
        'server'
      );

      expect(encrypted).toBeDefined();
      expect(encrypted.ciphertext).toBeDefined();
      expect(encrypted.metadata).toBeDefined();
      expect(encrypted.metadata.mode).toBe('server');
      expect(encrypted.metadata.protocol).toBe('aes-256-gcm');
      expect(encrypted.metadata.keyId).toBeDefined();
      expect(encrypted.metadata.iv).toBeDefined();
      expect(encrypted.metadata.authTag).toBeDefined();
    });

    it('should encrypt and decrypt message successfully', async () => {
      const plaintext = 'Hello, this is a secret message!';
      const conversationId = 'conv-123';

      const encrypted = await service.encryptMessage(
        plaintext,
        conversationId,
        'server'
      );

      const decrypted = await service.decryptMessage(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should reuse conversation key for same conversation', async () => {
      const plaintext1 = 'Message 1';
      const plaintext2 = 'Message 2';
      const conversationId = 'conv-123';

      const encrypted1 = await service.encryptMessage(
        plaintext1,
        conversationId,
        'server'
      );

      const encrypted2 = await service.encryptMessage(
        plaintext2,
        conversationId,
        'server'
      );

      // Should use same key ID
      expect(encrypted1.metadata.keyId).toBe(encrypted2.metadata.keyId);

      // But different IVs
      expect(encrypted1.metadata.iv).not.toBe(encrypted2.metadata.iv);
    });

    it('should use different keys for different conversations', async () => {
      const plaintext = 'Test message';

      const encrypted1 = await service.encryptMessage(
        plaintext,
        'conv-1',
        'server'
      );

      const encrypted2 = await service.encryptMessage(
        plaintext,
        'conv-2',
        'server'
      );

      expect(encrypted1.metadata.keyId).not.toBe(encrypted2.metadata.keyId);
    });

    it('should throw error when trying to decrypt E2EE message on server', async () => {
      const e2eePayload = {
        ciphertext: 'encrypted-by-client',
        metadata: {
          mode: 'e2ee' as const,
          protocol: 'signal_v3' as const,
          keyId: 'key-123',
          iv: 'iv-data',
          authTag: 'auth-tag',
        },
      };

      await expect(service.decryptMessage(e2eePayload)).rejects.toThrow(
        'Cannot decrypt E2EE messages'
      );
    });

    it('should encrypt empty string', async () => {
      const encrypted = await service.encryptMessage('', 'conv-123', 'server');
      const decrypted = await service.decryptMessage(encrypted);
      expect(decrypted).toBe('');
    });

    it('should encrypt unicode characters', async () => {
      const plaintext = '🔐 Hello 世界 مرحبا';
      const encrypted = await service.encryptMessage(plaintext, 'conv-123', 'server');
      const decrypted = await service.decryptMessage(encrypted);
      expect(decrypted).toBe(plaintext);
    });
  });

  describe('Conversation Key Management', () => {
    beforeEach(async () => {
      await service.initialize('user-123');
    });

    it('should check if conversation has encryption key', async () => {
      const conversationId = 'conv-123';

      let hasKey = await service.hasConversationKey(conversationId);
      expect(hasKey).toBe(false);

      await service.encryptMessage('test', conversationId, 'server');

      hasKey = await service.hasConversationKey(conversationId);
      expect(hasKey).toBe(true);
    });

    it('should get conversation encryption mode', async () => {
      const conversationId = 'conv-123';

      let mode = await service.getConversationMode(conversationId);
      expect(mode).toBeNull();

      await service.encryptMessage('test', conversationId, 'server');

      mode = await service.getConversationMode(conversationId);
      expect(mode).toBe('server');
    });
  });

  describe('Message Preparation and Processing', () => {
    beforeEach(async () => {
      await service.initialize('user-123');
    });

    it('should prepare plaintext message', async () => {
      const result = await service.prepareMessage('Hello', 'conv-123');

      expect(result.content).toBe('Hello');
      expect(result.encryptedPayload).toBeUndefined();
    });

    it('should prepare encrypted message in server mode', async () => {
      const conversationId = 'conv-123';

      // Enable encryption for conversation
      await service.encryptMessage('test', conversationId, 'server');

      const result = await service.prepareMessage('Hello', conversationId);

      expect(result.content).toBe('Hello');
      expect(result.encryptedPayload).toBeDefined();
      expect(result.encryptedPayload?.metadata.mode).toBe('server');
    });

    it('should prepare encrypted message in E2EE mode', async () => {
      const conversationId = 'conv-123';

      // Enable encryption for conversation
      await service.encryptMessage('test', conversationId, 'e2ee');

      const result = await service.prepareMessage('Hello', conversationId);

      expect(result.content).toBe('[Encrypted]');
      expect(result.encryptedPayload).toBeDefined();
      expect(result.encryptedPayload?.metadata.mode).toBe('e2ee');
    });

    it('should process plaintext received message', async () => {
      const message = {
        content: 'Hello',
        encryptedContent: null,
        encryptionMetadata: null,
      };

      const processed = await service.processReceivedMessage(message);
      expect(processed).toBe('Hello');
    });

    it('should process encrypted received message', async () => {
      const conversationId = 'conv-123';
      const plaintext = 'Secret message';

      // Encrypt a message
      const encrypted = await service.encryptMessage(
        plaintext,
        conversationId,
        'server'
      );

      // Simulate received message format
      const message = {
        content: '[Encrypted]',
        encryptedContent: encrypted.ciphertext,
        encryptionMetadata: encrypted.metadata,
      };

      const processed = await service.processReceivedMessage(message);
      expect(processed).toBe(plaintext);
    });

    it('should handle decryption failure gracefully', async () => {
      const message = {
        content: '[Encrypted]',
        encryptedContent: 'invalid-ciphertext',
        encryptionMetadata: {
          mode: 'server' as const,
          protocol: 'aes-256-gcm' as const,
          keyId: 'non-existent-key',
          iv: 'iv',
          authTag: 'tag',
        },
      };

      const processed = await service.processReceivedMessage(message);
      expect(processed).toBe('[Encrypted message - Unable to decrypt]');
    });
  });

  describe('E2EE Session Establishment', () => {
    beforeEach(async () => {
      await service.initialize('user-123');
    });

    it('should establish E2EE session between users', async () => {
      // Generate keys for both users
      await service.generateUserKeys();

      await service.initialize('user-456');
      await service.generateUserKeys();

      await service.initialize('user-123');

      // Establish session
      const keyId = await service.establishE2EESession('conv-123', 'user-456');

      expect(keyId).toBeDefined();
      expect(typeof keyId).toBe('string');

      // Verify conversation key was stored
      const hasKey = await service.hasConversationKey('conv-123');
      expect(hasKey).toBe(true);

      const mode = await service.getConversationMode('conv-123');
      expect(mode).toBe('e2ee');
    });

    it('should fail to establish E2EE session without keys', async () => {
      await expect(
        service.establishE2EESession('conv-123', 'user-456')
      ).rejects.toThrow('no encryption keys');
    });
  });

  describe('Key Backup and Restore', () => {
    beforeEach(async () => {
      await service.initialize('user-123');
    });

    it('should export keys', async () => {
      await service.encryptMessage('test', 'conv-123', 'server');

      const backup = await service.exportKeys('my-password');

      expect(backup).toBeDefined();
      expect(typeof backup).toBe('string');
    });

    it('should import keys', async () => {
      await service.encryptMessage('test', 'conv-123', 'server');

      const backup = await service.exportKeys('my-password');

      await service.clearKeys();

      await service.initialize('user-123');
      await service.importKeys(backup, 'my-password');

      // Verify keys were restored
      const hasKey = await service.hasConversationKey('conv-123');
      expect(hasKey).toBe(true);
    });
  });

  describe('Key Clearing', () => {
    beforeEach(async () => {
      await service.initialize('user-123');
    });

    it('should clear all keys', async () => {
      await service.encryptMessage('test', 'conv-123', 'server');
      await service.generateUserKeys();

      await service.clearKeys();

      const status = service.getStatus();
      expect(status.isInitialized).toBe(false);
      expect(status.userId).toBeNull();

      const hasKey = await service.hasConversationKey('conv-123');
      expect(hasKey).toBe(false);
    });
  });
});
