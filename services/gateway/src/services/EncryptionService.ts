/**
 * Gateway Encryption Service
 *
 * Backend encryption service for server-side encryption (AES-256-GCM)
 * and Signal Protocol pre-key bundle management.
 */

import { PrismaClient } from '@meeshy/shared/prisma/client';
import * as crypto from 'crypto';

/**
 * Encryption mode types
 * - 'e2ee': End-to-end encryption only (client-side Signal Protocol)
 * - 'server': Server-side encryption only (AES-256-GCM)
 * - 'hybrid': Double encryption - E2EE + server layer (allows server translation)
 */
type EncryptionMode = 'e2ee' | 'server' | 'hybrid';

/**
 * Encrypted payload structure
 */
interface EncryptedPayload {
  ciphertext: string;
  metadata: {
    mode: EncryptionMode;
    protocol: string;
    keyId: string;
    iv: string;
    authTag: string;
    messageType?: number;
    registrationId?: number;
  };
}

/**
 * Hybrid encrypted payload structure
 * Double encryption: E2EE envelope + Server-accessible content
 */
interface HybridEncryptedPayload {
  /** E2EE layer - only sender/recipient can decrypt (client-side Signal Protocol) */
  e2ee: {
    ciphertext: string; // Base64-encoded Signal Protocol ciphertext
    type: number; // Signal message type (PreKey=1, Whisper=2, SenderKey=3)
    senderRegistrationId: number;
    recipientRegistrationId: number;
  };
  /** Server layer - server can decrypt for translation (AES-256-GCM) */
  server: {
    ciphertext: string; // Base64-encoded AES ciphertext
    iv: string; // Base64-encoded IV
    authTag: string; // Base64-encoded auth tag
    keyId: string; // Key identifier
  };
  /** Mode indicator */
  mode: 'hybrid';
  /** Whether translation is available */
  canTranslate: boolean;
  /** Timestamp */
  timestamp: number;
}

/**
 * Pre-Key Bundle interface (compatible with Signal Protocol)
 */
interface PreKeyBundle {
  identityKey: Uint8Array;
  registrationId: number;
  deviceId: number;
  preKeyId: number | null;
  preKeyPublic: Uint8Array | null;
  signedPreKeyId: number;
  signedPreKeyPublic: Uint8Array;
  signedPreKeySignature: Uint8Array;
  kyberPreKeyId: number | null;
  kyberPreKeyPublic: Uint8Array | null;
  kyberPreKeySignature: Uint8Array | null;
}

/**
 * In-memory key vault for server-side encryption keys
 * In production, this should be replaced with a secure key management service (KMS)
 */
class ServerKeyVault {
  private keys: Map<string, Buffer> = new Map();
  private conversationKeys: Map<string, string> = new Map();

  generateKey(): { keyId: string; key: Buffer } {
    const keyId = crypto.randomUUID();
    const key = crypto.randomBytes(32); // AES-256
    this.keys.set(keyId, key);
    return { keyId, key };
  }

  getKey(keyId: string): Buffer | undefined {
    return this.keys.get(keyId);
  }

  setConversationKey(conversationId: string, keyId: string): void {
    this.conversationKeys.set(conversationId, keyId);
  }

  getConversationKeyId(conversationId: string): string | undefined {
    return this.conversationKeys.get(conversationId);
  }
}

/**
 * Gateway Encryption Service
 *
 * Provides encryption functionality for the backend:
 * - Server-side encryption (AES-256-GCM) for messages
 * - Key management for conversations
 * - Signal Protocol pre-key bundle generation
 */
export class EncryptionService {
  private prisma: PrismaClient;
  private keyVault: ServerKeyVault;
  private signalService: any = null; // Will be initialized when @signalapp/libsignal-client is available

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.keyVault = new ServerKeyVault();
  }

  /**
   * Get or create encryption key for a conversation (server mode)
   */
  async getOrCreateConversationKey(): Promise<string> {
    const { keyId } = this.keyVault.generateKey();
    return keyId;
  }

  /**
   * Encrypt message content (server mode)
   */
  async encryptMessage(
    plaintext: string,
    mode: EncryptionMode,
    conversationId?: string
  ): Promise<EncryptedPayload> {
    if (mode === 'e2ee') {
      throw new Error('E2EE messages must be encrypted client-side');
    }

    // Get or create key for conversation
    let keyId: string;
    if (conversationId) {
      const existingKeyId = this.keyVault.getConversationKeyId(conversationId);
      if (existingKeyId) {
        keyId = existingKeyId;
      } else {
        const { keyId: newKeyId } = this.keyVault.generateKey();
        this.keyVault.setConversationKey(conversationId, newKeyId);
        keyId = newKeyId;
      }
    } else {
      const { keyId: newKeyId } = this.keyVault.generateKey();
      keyId = newKeyId;
    }

    const key = this.keyVault.getKey(keyId);
    if (!key) {
      throw new Error('Encryption key not found');
    }

    // Generate IV
    const iv = crypto.randomBytes(12);

    // Encrypt using AES-256-GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return {
      ciphertext: ciphertext.toString('base64'),
      metadata: {
        mode: 'server',
        protocol: 'aes-256-gcm',
        keyId,
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
      },
    };
  }

  /**
   * Decrypt message content (server mode only)
   */
  async decryptMessage(payload: EncryptedPayload): Promise<string> {
    const { metadata } = payload;

    if (metadata.mode === 'e2ee') {
      throw new Error('Cannot decrypt E2EE messages on server');
    }

    const key = this.keyVault.getKey(metadata.keyId);
    if (!key) {
      throw new Error(`Decryption key not found: ${metadata.keyId}`);
    }

    const iv = Buffer.from(metadata.iv, 'base64');
    const authTag = Buffer.from(metadata.authTag, 'base64');
    const ciphertext = Buffer.from(payload.ciphertext, 'base64');

    // Decrypt using AES-256-GCM
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return plaintext.toString('utf8');
  }

  /**
   * Decrypt, translate, and re-encrypt message (server mode)
   * Used for auto-translation in server-encrypted conversations
   */
  async translateAndReEncrypt(
    payload: EncryptedPayload,
    translatedContent: string
  ): Promise<EncryptedPayload> {
    const { metadata } = payload;

    if (metadata.mode === 'e2ee') {
      throw new Error('Cannot translate E2EE messages');
    }

    // Re-encrypt the translated content with the same key
    const key = this.keyVault.getKey(metadata.keyId);
    if (!key) {
      throw new Error(`Encryption key not found: ${metadata.keyId}`);
    }

    // Generate new IV for the re-encrypted content
    const iv = crypto.randomBytes(12);

    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(translatedContent, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return {
      ciphertext: ciphertext.toString('base64'),
      metadata: {
        ...metadata,
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
      },
    };
  }

  /**
   * Encrypt the server layer of a hybrid message
   *
   * This creates the server-accessible encryption layer that allows
   * the server to decrypt for translation while keeping the E2EE layer intact.
   *
   * @param plaintext The plaintext content to encrypt
   * @param conversationId Optional conversation ID for key reuse
   * @returns Server layer encryption data
   */
  async encryptHybridServerLayer(
    plaintext: string,
    conversationId?: string
  ): Promise<HybridEncryptedPayload['server']> {
    // Get or create key for conversation
    let keyId: string;
    if (conversationId) {
      const existingKeyId = this.keyVault.getConversationKeyId(conversationId);
      if (existingKeyId) {
        keyId = existingKeyId;
      } else {
        const { keyId: newKeyId } = this.keyVault.generateKey();
        this.keyVault.setConversationKey(conversationId, newKeyId);
        keyId = newKeyId;
      }
    } else {
      const { keyId: newKeyId } = this.keyVault.generateKey();
      keyId = newKeyId;
    }

    const key = this.keyVault.getKey(keyId);
    if (!key) {
      throw new Error('Encryption key not found');
    }

    // Generate IV
    const iv = crypto.randomBytes(12);

    // Encrypt using AES-256-GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return {
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      keyId,
    };
  }

  /**
   * Decrypt the server layer of a hybrid message
   *
   * This decrypts only the server-accessible layer. The E2EE layer
   * remains encrypted and must be decrypted client-side.
   *
   * @param serverLayer The server encryption layer data
   * @returns Decrypted plaintext content
   */
  async decryptHybridServerLayer(
    serverLayer: HybridEncryptedPayload['server']
  ): Promise<string> {
    const key = this.keyVault.getKey(serverLayer.keyId);
    if (!key) {
      throw new Error(`Decryption key not found: ${serverLayer.keyId}`);
    }

    const iv = Buffer.from(serverLayer.iv, 'base64');
    const authTag = Buffer.from(serverLayer.authTag, 'base64');
    const ciphertext = Buffer.from(serverLayer.ciphertext, 'base64');

    // Decrypt using AES-256-GCM
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return plaintext.toString('utf8');
  }

  /**
   * Translate a hybrid encrypted message
   *
   * This decrypts the server layer, replaces it with translated content,
   * and re-encrypts while preserving the E2EE layer.
   *
   * @param payload The hybrid encrypted payload
   * @param translatedContent The translated content to encrypt
   * @returns New hybrid payload with translated server layer
   */
  async translateHybridMessage(
    payload: HybridEncryptedPayload,
    translatedContent: string
  ): Promise<HybridEncryptedPayload> {
    if (payload.mode !== 'hybrid' || !payload.canTranslate) {
      throw new Error('Message does not support server-side translation');
    }

    // Get the key for re-encryption
    const key = this.keyVault.getKey(payload.server.keyId);
    if (!key) {
      throw new Error(`Encryption key not found: ${payload.server.keyId}`);
    }

    // Generate new IV for the translated content
    const iv = crypto.randomBytes(12);

    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(translatedContent, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return {
      // E2EE layer remains unchanged - only client can decrypt
      e2ee: payload.e2ee,
      // Server layer updated with translated content
      server: {
        ciphertext: ciphertext.toString('base64'),
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
        keyId: payload.server.keyId,
      },
      mode: 'hybrid',
      canTranslate: true,
      timestamp: Date.now(),
    };
  }

  /**
   * Create a hybrid encrypted payload
   *
   * This is called by the client after encrypting with Signal Protocol.
   * The server adds its own encryption layer on top.
   *
   * @param e2eeData The E2EE layer data from client
   * @param plaintext The plaintext for server layer
   * @param conversationId Optional conversation ID
   * @returns Complete hybrid encrypted payload
   */
  async createHybridPayload(
    e2eeData: HybridEncryptedPayload['e2ee'],
    plaintext: string,
    conversationId?: string
  ): Promise<HybridEncryptedPayload> {
    const serverLayer = await this.encryptHybridServerLayer(plaintext, conversationId);

    return {
      e2ee: e2eeData,
      server: serverLayer,
      mode: 'hybrid',
      canTranslate: true,
      timestamp: Date.now(),
    };
  }

  /**
   * Validate a hybrid encrypted payload structure
   */
  isValidHybridPayload(payload: unknown): payload is HybridEncryptedPayload {
    if (!payload || typeof payload !== 'object') return false;
    const p = payload as Record<string, unknown>;

    return (
      p.mode === 'hybrid' &&
      typeof p.canTranslate === 'boolean' &&
      typeof p.timestamp === 'number' &&
      p.e2ee !== null &&
      typeof p.e2ee === 'object' &&
      p.server !== null &&
      typeof p.server === 'object'
    );
  }

  /**
   * Generate Signal Protocol pre-key bundle
   */
  async generatePreKeyBundle(): Promise<PreKeyBundle> {
    // Generate random keys (placeholder implementation)
    const identityKey = crypto.randomBytes(32);
    const registrationId = crypto.randomInt(1, 16380);
    const deviceId = 1;
    const preKeyId = crypto.randomInt(1, 16777215);
    const preKeyPublic = crypto.randomBytes(32);
    const signedPreKeyId = crypto.randomInt(1, 16777215);
    const signedPreKeyPublic = crypto.randomBytes(32);
    const signedPreKeySignature = crypto.randomBytes(64);

    return {
      identityKey: new Uint8Array(identityKey),
      registrationId,
      deviceId,
      preKeyId,
      preKeyPublic: new Uint8Array(preKeyPublic),
      signedPreKeyId,
      signedPreKeyPublic: new Uint8Array(signedPreKeyPublic),
      signedPreKeySignature: new Uint8Array(signedPreKeySignature),
      kyberPreKeyId: null,
      kyberPreKeyPublic: null,
      kyberPreKeySignature: null,
    };
  }

  /**
   * Get Signal Protocol service (for routes)
   */
  getSignalService(): any {
    return this.signalService;
  }

  /**
   * Check if Signal Protocol is available
   */
  isSignalProtocolAvailable(): boolean {
    return this.signalService !== null;
  }

  /**
   * Prepare encrypted payload for database storage
   */
  prepareForStorage(payload: EncryptedPayload): {
    encryptedContent: string;
    encryptionMetadata: Record<string, any>;
    encryptionMode: string;
    isEncrypted: boolean;
  } {
    return {
      encryptedContent: payload.ciphertext,
      encryptionMetadata: payload.metadata,
      encryptionMode: payload.metadata.mode,
      isEncrypted: true,
    };
  }

  /**
   * Reconstruct encrypted payload from storage
   */
  reconstructPayload(
    encryptedContent: string,
    encryptionMetadata: Record<string, any>
  ): EncryptedPayload {
    return {
      ciphertext: encryptedContent,
      metadata: encryptionMetadata as EncryptedPayload['metadata'],
    };
  }
}

// Singleton instance (initialized with Prisma client)
let encryptionServiceInstance: EncryptionService | null = null;

/**
 * Get or create the encryption service singleton
 */
export function getEncryptionService(prisma: PrismaClient): EncryptionService {
  if (!encryptionServiceInstance) {
    encryptionServiceInstance = new EncryptionService(prisma);
  }
  return encryptionServiceInstance;
}

/**
 * Export singleton for routes (requires initialization)
 */
export const encryptionService = {
  getOrCreateConversationKey: async () => {
    if (!encryptionServiceInstance) {
      throw new Error('Encryption service not initialized. Call getEncryptionService(prisma) first.');
    }
    return encryptionServiceInstance.getOrCreateConversationKey();
  },
  generatePreKeyBundle: async () => {
    if (!encryptionServiceInstance) {
      throw new Error('Encryption service not initialized. Call getEncryptionService(prisma) first.');
    }
    return encryptionServiceInstance.generatePreKeyBundle();
  },
  getSignalService: () => {
    if (!encryptionServiceInstance) {
      return null;
    }
    return encryptionServiceInstance.getSignalService();
  },
};

// Export types for external use
export type { EncryptionMode, EncryptedPayload, HybridEncryptedPayload, PreKeyBundle };
