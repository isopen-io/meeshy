/**
 * Helpers de chiffrement pour les traductions
 * Gère le chiffrement/déchiffrement des traductions en mode server/hybrid
 */

import * as crypto from 'crypto';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { enhancedLogger } from '../../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'EncryptionHelper' });

export interface TranslationEncryptionData {
  isEncrypted: boolean;
  encryptionKeyId: string | null;
  encryptionIv: string | null;
  encryptionAuthTag: string | null;
}

export class EncryptionHelper {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Get the encryption key for a conversation from ServerEncryptionKey table
   * Returns the decrypted key for use in translation encryption
   */
  async getConversationEncryptionKey(conversationId: string): Promise<{ keyId: string; key: Buffer } | null> {
    try {
      const conversation = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
        select: {
          serverEncryptionKeyId: true,
          encryptionMode: true,
          serverEncryptionKey: true
        }
      });

      if (!conversation?.serverEncryptionKeyId || !conversation.serverEncryptionKey) {
        return null;
      }

      const keyRecord = conversation.serverEncryptionKey;

      // Decrypt the key using master key
      const masterKeyB64 = process.env.ENCRYPTION_MASTER_KEY;
      if (!masterKeyB64) {
        logger.warn('ENCRYPTION_MASTER_KEY not set, cannot decrypt conversation key');
        return null;
      }

      const masterKey = Buffer.from(masterKeyB64, 'base64');
      const encryptedKey = Buffer.from(keyRecord.encryptedKey, 'base64');
      const iv = Buffer.from(keyRecord.iv, 'base64');
      const authTag = Buffer.from(keyRecord.authTag, 'base64');

      const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, iv);
      decipher.setAuthTag(authTag);
      const key = Buffer.concat([decipher.update(encryptedKey), decipher.final()]);

      return { keyId: conversation.serverEncryptionKeyId, key };
    } catch (error) {
      logger.error('Failed to get conversation encryption key', { conversationId, error });
      return null;
    }
  }

  /**
   * Encrypt translation content using conversation's encryption key
   */
  async encryptTranslation(
    plaintext: string,
    conversationId: string
  ): Promise<TranslationEncryptionData & { encryptedContent: string }> {
    const keyData = await this.getConversationEncryptionKey(conversationId);

    if (!keyData) {
      return {
        encryptedContent: plaintext,
        isEncrypted: false,
        encryptionKeyId: null,
        encryptionIv: null,
        encryptionAuthTag: null
      };
    }

    // Generate IV (12 bytes for AES-GCM)
    const iv = crypto.randomBytes(12);

    // Encrypt using AES-256-GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', keyData.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final()
    ]);
    const authTag = cipher.getAuthTag();

    logger.debug('Translation encrypted', { conversationId, keyId: keyData.keyId });

    return {
      encryptedContent: ciphertext.toString('base64'),
      isEncrypted: true,
      encryptionKeyId: keyData.keyId,
      encryptionIv: iv.toString('base64'),
      encryptionAuthTag: authTag.toString('base64')
    };
  }

  /**
   * Decrypt translation content
   */
  async decryptTranslation(
    encryptedContent: string,
    encryptionKeyId: string,
    encryptionIv: string,
    encryptionAuthTag: string
  ): Promise<string> {
    try {
      // Get the encryption key
      const keyRecord = await this.prisma.serverEncryptionKey.findUnique({
        where: { id: encryptionKeyId }
      });

      if (!keyRecord) {
        throw new Error(`Encryption key not found: ${encryptionKeyId}`);
      }

      // Decrypt the key using master key
      const masterKeyB64 = process.env.ENCRYPTION_MASTER_KEY;
      if (!masterKeyB64) {
        throw new Error('ENCRYPTION_MASTER_KEY not set');
      }

      const masterKey = Buffer.from(masterKeyB64, 'base64');
      const encryptedKey = Buffer.from(keyRecord.encryptedKey, 'base64');
      const keyIv = Buffer.from(keyRecord.iv, 'base64');
      const keyAuthTag = Buffer.from(keyRecord.authTag, 'base64');

      const keyDecipher = crypto.createDecipheriv('aes-256-gcm', masterKey, keyIv);
      keyDecipher.setAuthTag(keyAuthTag);
      const key = Buffer.concat([keyDecipher.update(encryptedKey), keyDecipher.final()]);

      // Decrypt the translation
      const iv = Buffer.from(encryptionIv, 'base64');
      const authTag = Buffer.from(encryptionAuthTag, 'base64');
      const ciphertext = Buffer.from(encryptedContent, 'base64');

      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);
      const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

      return plaintext.toString('utf8');
    } catch (error) {
      logger.error('Failed to decrypt translation', { encryptionKeyId, error });
      throw error;
    }
  }

  /**
   * Check if a message requires encrypted translation storage
   */
  async shouldEncryptTranslation(messageId: string): Promise<{ shouldEncrypt: boolean; conversationId: string | null }> {
    try {
      const message = await this.prisma.message.findUnique({
        where: { id: messageId },
        select: {
          conversationId: true,
          encryptionMode: true,
          isEncrypted: true
        }
      });

      if (!message) {
        return { shouldEncrypt: false, conversationId: null };
      }

      // E2EE messages should NOT have translations (they should be skipped entirely)
      // Server and Hybrid mode messages should have encrypted translations
      const shouldEncrypt = message.encryptionMode === 'server' || message.encryptionMode === 'hybrid';

      return { shouldEncrypt, conversationId: message.conversationId };
    } catch (error) {
      logger.error('Failed to check encryption requirement', { messageId, error });
      return { shouldEncrypt: false, conversationId: null };
    }
  }
}
