import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { EncryptionHelper } from '../../../services/message-translation/EncryptionHelper';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import * as crypto from 'crypto';

// Mock modules
jest.mock('@meeshy/shared/prisma/client');
jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    }))
  }
}));

describe('EncryptionHelper', () => {
  let encryptionHelper: EncryptionHelper;
  let mockPrisma: jest.Mocked<PrismaClient>;
  let originalEnv: NodeJS.ProcessEnv;

  // Test data
  const conversationId = 'conv-123';
  const messageId = 'msg-123';
  const plaintext = 'Hello, world!';
  const masterKey = crypto.randomBytes(32);
  const conversationKey = crypto.randomBytes(32);

  beforeEach(() => {
    // Save original env
    originalEnv = { ...process.env };

    // Set master key
    process.env.ENCRYPTION_MASTER_KEY = masterKey.toString('base64');

    // Create mock Prisma client
    mockPrisma = {
      conversation: {
        findUnique: jest.fn()
      },
      serverEncryptionKey: {
        findUnique: jest.fn()
      },
      message: {
        findUnique: jest.fn()
      }
    } as unknown as jest.Mocked<PrismaClient>;

    encryptionHelper = new EncryptionHelper(mockPrisma);
  });

  afterEach(() => {
    // Restore original env
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  describe('getConversationEncryptionKey', () => {
    it('should retrieve and decrypt conversation encryption key', async () => {
      // Encrypt the conversation key with master key
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);
      const encryptedKey = Buffer.concat([
        cipher.update(conversationKey),
        cipher.final()
      ]);
      const authTag = cipher.getAuthTag();

      const keyId = 'key-123';
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: conversationId,
        serverEncryptionKeyId: keyId,
        encryptionMode: 'server',
        serverEncryptionKey: {
          id: keyId,
          encryptedKey: encryptedKey.toString('base64'),
          iv: iv.toString('base64'),
          authTag: authTag.toString('base64')
        }
      } as any);

      const result = await encryptionHelper.getConversationEncryptionKey(conversationId);

      expect(result).not.toBeNull();
      expect(result?.keyId).toBe(keyId);
      expect(result?.key).toBeInstanceOf(Buffer);
      expect(result?.key.toString('hex')).toBe(conversationKey.toString('hex'));
    });

    it('should return null when conversation has no encryption key', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: conversationId,
        serverEncryptionKeyId: null,
        encryptionMode: 'e2ee',
        serverEncryptionKey: null
      } as any);

      const result = await encryptionHelper.getConversationEncryptionKey(conversationId);
      expect(result).toBeNull();
    });

    it('should return null when conversation is not found', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue(null);

      const result = await encryptionHelper.getConversationEncryptionKey(conversationId);
      expect(result).toBeNull();
    });

    it('should return null when ENCRYPTION_MASTER_KEY is not set', async () => {
      delete process.env.ENCRYPTION_MASTER_KEY;

      const keyId = 'key-123';
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: conversationId,
        serverEncryptionKeyId: keyId,
        encryptionMode: 'server',
        serverEncryptionKey: {
          id: keyId,
          encryptedKey: 'encrypted',
          iv: 'iv',
          authTag: 'authTag'
        }
      } as any);

      const result = await encryptionHelper.getConversationEncryptionKey(conversationId);
      expect(result).toBeNull();
    });

    it('should return null when decryption fails', async () => {
      const keyId = 'key-123';
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: conversationId,
        serverEncryptionKeyId: keyId,
        encryptionMode: 'server',
        serverEncryptionKey: {
          id: keyId,
          encryptedKey: 'invalid-base64',
          iv: 'invalid-base64',
          authTag: 'invalid-base64'
        }
      } as any);

      const result = await encryptionHelper.getConversationEncryptionKey(conversationId);
      expect(result).toBeNull();
    });

    it('should handle database errors gracefully', async () => {
      mockPrisma.conversation.findUnique.mockRejectedValue(new Error('Database error'));

      const result = await encryptionHelper.getConversationEncryptionKey(conversationId);
      expect(result).toBeNull();
    });
  });

  describe('encryptTranslation', () => {
    it('should encrypt translation with conversation encryption key', async () => {
      // Setup encrypted conversation key
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);
      const encryptedKey = Buffer.concat([
        cipher.update(conversationKey),
        cipher.final()
      ]);
      const authTag = cipher.getAuthTag();

      const keyId = 'key-123';
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: conversationId,
        serverEncryptionKeyId: keyId,
        encryptionMode: 'server',
        serverEncryptionKey: {
          id: keyId,
          encryptedKey: encryptedKey.toString('base64'),
          iv: iv.toString('base64'),
          authTag: authTag.toString('base64')
        }
      } as any);

      const result = await encryptionHelper.encryptTranslation(plaintext, conversationId);

      expect(result.isEncrypted).toBe(true);
      expect(result.encryptionKeyId).toBe(keyId);
      expect(result.encryptionIv).toBeTruthy();
      expect(result.encryptionAuthTag).toBeTruthy();
      expect(result.encryptedContent).toBeTruthy();
      expect(result.encryptedContent).not.toBe(plaintext);

      // Verify we can decrypt it
      const encryptedBuffer = Buffer.from(result.encryptedContent, 'base64');
      const ivBuffer = Buffer.from(result.encryptionIv!, 'base64');
      const authTagBuffer = Buffer.from(result.encryptionAuthTag!, 'base64');

      const decipher = crypto.createDecipheriv('aes-256-gcm', conversationKey, ivBuffer);
      decipher.setAuthTag(authTagBuffer);
      const decrypted = Buffer.concat([decipher.update(encryptedBuffer), decipher.final()]);

      expect(decrypted.toString('utf8')).toBe(plaintext);
    });

    it('should return unencrypted content when encryption key is not available', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue(null);

      const result = await encryptionHelper.encryptTranslation(plaintext, conversationId);

      expect(result.isEncrypted).toBe(false);
      expect(result.encryptionKeyId).toBeNull();
      expect(result.encryptionIv).toBeNull();
      expect(result.encryptionAuthTag).toBeNull();
      expect(result.encryptedContent).toBe(plaintext);
    });

    it('should handle empty plaintext', async () => {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);
      const encryptedKey = Buffer.concat([
        cipher.update(conversationKey),
        cipher.final()
      ]);
      const authTag = cipher.getAuthTag();

      const keyId = 'key-123';
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: conversationId,
        serverEncryptionKeyId: keyId,
        encryptionMode: 'server',
        serverEncryptionKey: {
          id: keyId,
          encryptedKey: encryptedKey.toString('base64'),
          iv: iv.toString('base64'),
          authTag: authTag.toString('base64')
        }
      } as any);

      const result = await encryptionHelper.encryptTranslation('', conversationId);

      expect(result.isEncrypted).toBe(true);
      // Empty plaintext can produce empty encrypted content
      expect(typeof result.encryptedContent).toBe('string');
    });

    it('should handle long plaintext', async () => {
      const longText = 'A'.repeat(10000);

      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);
      const encryptedKey = Buffer.concat([
        cipher.update(conversationKey),
        cipher.final()
      ]);
      const authTag = cipher.getAuthTag();

      const keyId = 'key-123';
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: conversationId,
        serverEncryptionKeyId: keyId,
        encryptionMode: 'server',
        serverEncryptionKey: {
          id: keyId,
          encryptedKey: encryptedKey.toString('base64'),
          iv: iv.toString('base64'),
          authTag: authTag.toString('base64')
        }
      } as any);

      const result = await encryptionHelper.encryptTranslation(longText, conversationId);

      expect(result.isEncrypted).toBe(true);
      expect(result.encryptedContent).toBeTruthy();
    });

    it('should handle special characters and unicode', async () => {
      const specialText = '你好 🌍 Привет €£¥';

      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);
      const encryptedKey = Buffer.concat([
        cipher.update(conversationKey),
        cipher.final()
      ]);
      const authTag = cipher.getAuthTag();

      const keyId = 'key-123';
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: conversationId,
        serverEncryptionKeyId: keyId,
        encryptionMode: 'server',
        serverEncryptionKey: {
          id: keyId,
          encryptedKey: encryptedKey.toString('base64'),
          iv: iv.toString('base64'),
          authTag: authTag.toString('base64')
        }
      } as any);

      const result = await encryptionHelper.encryptTranslation(specialText, conversationId);

      expect(result.isEncrypted).toBe(true);

      // Verify decryption
      const encryptedBuffer = Buffer.from(result.encryptedContent, 'base64');
      const ivBuffer = Buffer.from(result.encryptionIv!, 'base64');
      const authTagBuffer = Buffer.from(result.encryptionAuthTag!, 'base64');

      const decipher = crypto.createDecipheriv('aes-256-gcm', conversationKey, ivBuffer);
      decipher.setAuthTag(authTagBuffer);
      const decrypted = Buffer.concat([decipher.update(encryptedBuffer), decipher.final()]);

      expect(decrypted.toString('utf8')).toBe(specialText);
    });
  });

  describe('decryptTranslation', () => {
    it('should decrypt translation correctly', async () => {
      // Encrypt conversation key with master key
      const keyIv = crypto.randomBytes(12);
      const keyCipher = crypto.createCipheriv('aes-256-gcm', masterKey, keyIv);
      const encryptedKey = Buffer.concat([
        keyCipher.update(conversationKey),
        keyCipher.final()
      ]);
      const keyAuthTag = keyCipher.getAuthTag();

      // Encrypt plaintext with conversation key
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', conversationKey, iv);
      const ciphertext = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final()
      ]);
      const authTag = cipher.getAuthTag();

      const keyId = 'key-123';
      mockPrisma.serverEncryptionKey.findUnique.mockResolvedValue({
        id: keyId,
        encryptedKey: encryptedKey.toString('base64'),
        iv: keyIv.toString('base64'),
        authTag: keyAuthTag.toString('base64')
      } as any);

      const decrypted = await encryptionHelper.decryptTranslation(
        ciphertext.toString('base64'),
        keyId,
        iv.toString('base64'),
        authTag.toString('base64')
      );

      expect(decrypted).toBe(plaintext);
    });

    it('should throw error when encryption key is not found', async () => {
      mockPrisma.serverEncryptionKey.findUnique.mockResolvedValue(null);

      await expect(
        encryptionHelper.decryptTranslation(
          'encrypted-content',
          'non-existent-key',
          'iv',
          'authTag'
        )
      ).rejects.toThrow('Encryption key not found');
    });

    it('should throw error when ENCRYPTION_MASTER_KEY is not set', async () => {
      delete process.env.ENCRYPTION_MASTER_KEY;

      mockPrisma.serverEncryptionKey.findUnique.mockResolvedValue({
        id: 'key-123',
        encryptedKey: 'encrypted',
        iv: 'iv',
        authTag: 'authTag'
      } as any);

      await expect(
        encryptionHelper.decryptTranslation(
          'encrypted-content',
          'key-123',
          'iv',
          'authTag'
        )
      ).rejects.toThrow('ENCRYPTION_MASTER_KEY not set');
    });

    it('should throw error when decryption fails with invalid data', async () => {
      const keyIv = crypto.randomBytes(12);
      const keyCipher = crypto.createCipheriv('aes-256-gcm', masterKey, keyIv);
      const encryptedKey = Buffer.concat([
        keyCipher.update(conversationKey),
        keyCipher.final()
      ]);
      const keyAuthTag = keyCipher.getAuthTag();

      const keyId = 'key-123';
      mockPrisma.serverEncryptionKey.findUnique.mockResolvedValue({
        id: keyId,
        encryptedKey: encryptedKey.toString('base64'),
        iv: keyIv.toString('base64'),
        authTag: keyAuthTag.toString('base64')
      } as any);

      await expect(
        encryptionHelper.decryptTranslation(
          'invalid-encrypted-content',
          keyId,
          'invalid-iv',
          'invalid-authTag'
        )
      ).rejects.toThrow();
    });

    it('should throw error when auth tag verification fails', async () => {
      const keyIv = crypto.randomBytes(12);
      const keyCipher = crypto.createCipheriv('aes-256-gcm', masterKey, keyIv);
      const encryptedKey = Buffer.concat([
        keyCipher.update(conversationKey),
        keyCipher.final()
      ]);
      const keyAuthTag = keyCipher.getAuthTag();

      // Encrypt plaintext
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', conversationKey, iv);
      const ciphertext = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final()
      ]);
      const validAuthTag = cipher.getAuthTag();

      // Use wrong auth tag
      const wrongAuthTag = crypto.randomBytes(16);

      const keyId = 'key-123';
      mockPrisma.serverEncryptionKey.findUnique.mockResolvedValue({
        id: keyId,
        encryptedKey: encryptedKey.toString('base64'),
        iv: keyIv.toString('base64'),
        authTag: keyAuthTag.toString('base64')
      } as any);

      await expect(
        encryptionHelper.decryptTranslation(
          ciphertext.toString('base64'),
          keyId,
          iv.toString('base64'),
          wrongAuthTag.toString('base64')
        )
      ).rejects.toThrow();
    });

    it('should handle database errors gracefully', async () => {
      mockPrisma.serverEncryptionKey.findUnique.mockRejectedValue(
        new Error('Database error')
      );

      await expect(
        encryptionHelper.decryptTranslation(
          'encrypted-content',
          'key-123',
          'iv',
          'authTag'
        )
      ).rejects.toThrow('Database error');
    });
  });

  describe('shouldEncryptTranslation', () => {
    it('should return true for server mode messages', async () => {
      mockPrisma.message.findUnique.mockResolvedValue({
        id: messageId,
        conversationId,
        encryptionMode: 'server',
        isEncrypted: true
      } as any);

      const result = await encryptionHelper.shouldEncryptTranslation(messageId);

      expect(result.shouldEncrypt).toBe(true);
      expect(result.conversationId).toBe(conversationId);
    });

    it('should return true for hybrid mode messages', async () => {
      mockPrisma.message.findUnique.mockResolvedValue({
        id: messageId,
        conversationId,
        encryptionMode: 'hybrid',
        isEncrypted: true
      } as any);

      const result = await encryptionHelper.shouldEncryptTranslation(messageId);

      expect(result.shouldEncrypt).toBe(true);
      expect(result.conversationId).toBe(conversationId);
    });

    it('should return false for e2ee mode messages', async () => {
      mockPrisma.message.findUnique.mockResolvedValue({
        id: messageId,
        conversationId,
        encryptionMode: 'e2ee',
        isEncrypted: true
      } as any);

      const result = await encryptionHelper.shouldEncryptTranslation(messageId);

      expect(result.shouldEncrypt).toBe(false);
      expect(result.conversationId).toBe(conversationId);
    });

    it('should return false when message is not found', async () => {
      mockPrisma.message.findUnique.mockResolvedValue(null);

      const result = await encryptionHelper.shouldEncryptTranslation(messageId);

      expect(result.shouldEncrypt).toBe(false);
      expect(result.conversationId).toBeNull();
    });

    it('should handle database errors gracefully', async () => {
      mockPrisma.message.findUnique.mockRejectedValue(new Error('Database error'));

      const result = await encryptionHelper.shouldEncryptTranslation(messageId);

      expect(result.shouldEncrypt).toBe(false);
      expect(result.conversationId).toBeNull();
    });

    it('should return false for unencrypted messages', async () => {
      mockPrisma.message.findUnique.mockResolvedValue({
        id: messageId,
        conversationId,
        encryptionMode: null,
        isEncrypted: false
      } as any);

      const result = await encryptionHelper.shouldEncryptTranslation(messageId);

      expect(result.shouldEncrypt).toBe(false);
      expect(result.conversationId).toBe(conversationId);
    });
  });

  describe('end-to-end encryption workflow', () => {
    it('should encrypt and decrypt successfully in full workflow', async () => {
      // Setup: encrypt conversation key with master key
      const keyIv = crypto.randomBytes(12);
      const keyCipher = crypto.createCipheriv('aes-256-gcm', masterKey, keyIv);
      const encryptedKey = Buffer.concat([
        keyCipher.update(conversationKey),
        keyCipher.final()
      ]);
      const keyAuthTag = keyCipher.getAuthTag();

      const keyId = 'key-123';

      // Mock for encryption
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: conversationId,
        serverEncryptionKeyId: keyId,
        encryptionMode: 'server',
        serverEncryptionKey: {
          id: keyId,
          encryptedKey: encryptedKey.toString('base64'),
          iv: keyIv.toString('base64'),
          authTag: keyAuthTag.toString('base64')
        }
      } as any);

      // Encrypt
      const encrypted = await encryptionHelper.encryptTranslation(plaintext, conversationId);

      // Mock for decryption
      mockPrisma.serverEncryptionKey.findUnique.mockResolvedValue({
        id: keyId,
        encryptedKey: encryptedKey.toString('base64'),
        iv: keyIv.toString('base64'),
        authTag: keyAuthTag.toString('base64')
      } as any);

      // Decrypt
      const decrypted = await encryptionHelper.decryptTranslation(
        encrypted.encryptedContent,
        encrypted.encryptionKeyId!,
        encrypted.encryptionIv!,
        encrypted.encryptionAuthTag!
      );

      expect(decrypted).toBe(plaintext);
    });
  });
});
