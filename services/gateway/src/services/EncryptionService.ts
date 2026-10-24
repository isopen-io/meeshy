/**
 * Gateway Encryption Service
 *
 * Backend encryption service for server-side encryption (AES-256-GCM)
 * and Signal Protocol pre-key bundle management.
 *
 * Encryption Modes:
 * - 'e2ee': End-to-end encryption only (client-side Signal Protocol) - NO translation
 * - 'server': Server-side encryption only (AES-256-GCM) - translation supported
 * - 'hybrid': Double encryption - E2EE + server layer - translation supported
 */

import { PrismaClient } from '@meeshy/shared/prisma/client';
import * as crypto from 'crypto';
import { enhancedLogger } from '../utils/logger-enhanced';
import { guardedInterval, guardedTimeout } from '../utils/guarded-timer';
import { AT_REST_AAD_V1, atRestAad, openBytes, sealBytes, ServerAtRestUnavailableError, ServerAtRestUnreadableError, type AtRestEnvelope, type AtRestKeyring } from './messaging/serverAtRest';
import { ServerKeyVault } from './ServerKeyVault';

// Create a child logger for encryption operations
const logger = enhancedLogger.child({ module: 'EncryptionService' });

// Signal Protocol types (loaded dynamically to avoid native module issues)
let SignalLib: {
  IdentityKeyPair: any;
  PrivateKey: any;
  SignedPreKeyRecord: any;
  PreKeyRecord: any;
} | null = null;

// Flag to track if Signal Protocol is available
let signalProtocolAvailable = false;

// Try to load Signal Protocol library
// node-gyp-build resolves the native binary from the package's OWN prebuilds
// directory (node_modules/@signalapp/libsignal-client/prebuilds/<platform>/),
// never from a symlink at the gateway root — measured directly (#4553): the
// module loads correctly with no such symlink present.
try {
  const signalModule = require('@signalapp/libsignal-client');
  SignalLib = {
    IdentityKeyPair: signalModule.IdentityKeyPair,
    PrivateKey: signalModule.PrivateKey,
    SignedPreKeyRecord: signalModule.SignedPreKeyRecord,
    PreKeyRecord: signalModule.PreKeyRecord,
  };
  signalProtocolAvailable = true;
  logger.info('Signal Protocol library loaded successfully');
} catch (error) {
  logger.warn('Signal Protocol library not available - E2EE features will be disabled', {
    error: error instanceof Error ? error.message : 'Unknown error'
  });
}


/** Le chiffré au repos tel que la ligne `Message` le range (`encryptionMetadata`). */
type AtRestSealed = {
  readonly ciphertext: string;
  readonly metadata: {
    readonly protocol: 'aes-256-gcm';
    readonly keyId: string;
    readonly iv: string;
    readonly authTag: string;
    readonly aad: typeof AT_REST_AAD_V1;
  };
};

// Types defined locally to avoid build order issues with shared package
type EncryptionMode = 'e2ee' | 'server' | 'hybrid';

/**
 * Hybrid encrypted payload structure (local definition for build compatibility)
 */
interface HybridEncryptedPayload {
  e2ee: {
    ciphertext: string;
    type: number;
    senderRegistrationId: number;
    recipientRegistrationId: number;
  };
  server: {
    ciphertext: string;
    iv: string;
    authTag: string;
    keyId: string;
  };
  mode: 'hybrid';
  canTranslate: boolean;
  timestamp: number;
}

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
 * Gateway Encryption Service
 *
 * Provides encryption functionality for the backend:
 * - Server-side encryption (AES-256-GCM) for messages
 * - Key management for conversations
 * - Signal Protocol pre-key bundle generation
 */
export class EncryptionService implements AtRestKeyring {
  private keyVault: ServerKeyVault;
  private signalService: any = null; // Will be initialized when @signalapp/libsignal-client is available
  private initialized = false;
  private cacheCleanupInterval?: NodeJS.Timeout;
  // Lock map for atomic key generation - prevents TOCTOU race condition
  private keyGenerationLocks: Map<string, { promise: Promise<string>; resolve: (value: string) => void }> = new Map();

  constructor(prisma: PrismaClient) {
    this.keyVault = new ServerKeyVault(prisma);
  }

  /**
   * Initialize the encryption service
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.debug('EncryptionService already initialized');
      return;
    }

    logger.info('Initializing EncryptionService');

    try {
      await this.keyVault.initialize();

      // Setup periodic cache cleanup (every 5 minutes)
      this.cacheCleanupInterval = guardedInterval({ name: 'encryption-key-cache-cleanup', everyMs: 5 * 60 * 1000, logger, run: () => {
        this.keyVault.cleanupCache();
      } });
      this.cacheCleanupInterval.unref?.();

      this.initialized = true;
      logger.info('EncryptionService initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize EncryptionService', error);
      throw error;
    }
  }

  /**
   * Get or create encryption key for a conversation (server mode)
   * Uses atomic lock pattern to prevent TOCTOU race conditions in concurrent key generation
   */
  async getOrCreateConversationKey(conversationId?: string): Promise<string> {
    // Fast path: check for existing key without locking
    if (conversationId) {
      const existingKeyId = this.keyVault.getConversationKeyId(conversationId);
      if (existingKeyId) {
        logger.debug('Using existing conversation key', { conversationId, keyId: existingKeyId });
        return existingKeyId;
      }

      // ATOMIC: Check if there's already a pending operation for this conversation
      // This check-and-set must be synchronous to prevent race conditions
      const existingLock = this.keyGenerationLocks.get(conversationId);
      if (existingLock) {
        logger.debug('Waiting for pending key generation', { conversationId });
        return existingLock.promise;
      }

      // ATOMIC: Create lock entry SYNCHRONOUSLY before any await
      // This ensures only one caller can start key generation
      let resolveLock: (value: string) => void;
      const lockPromise = new Promise<string>((resolve) => {
        resolveLock = resolve;
      });
      this.keyGenerationLocks.set(conversationId, { promise: lockPromise, resolve: resolveLock! });

      try {
        // Double-check after acquiring lock - race window is now closed
        const existingKeyId = this.keyVault.getConversationKeyId(conversationId);
        if (existingKeyId) {
          logger.debug('Key found after lock acquisition', { conversationId, keyId: existingKeyId });
          resolveLock!(existingKeyId);
          return existingKeyId;
        }

        // Generate the key
        const { keyId } = await this.keyVault.generateKey(conversationId, 'conversation');
        await this.keyVault.setConversationKey(conversationId, keyId);

        logger.debug('Generated new conversation key', { conversationId, keyId });
        resolveLock!(keyId);
        return keyId;
      } catch (error) {
        // On error, reject waiting promises with a new generation attempt
        this.keyGenerationLocks.delete(conversationId);
        throw error;
      } finally {
        // Clean up lock after a small delay to allow late-comers to get the result
        guardedTimeout({ name: 'encryption-key-generation-lock-release', afterMs: 100, logger, run: () => {
          this.keyGenerationLocks.delete(conversationId);
        } });
      }
    }

    // No conversationId - generate a standalone key (no locking needed)
    const { keyId } = await this.keyVault.generateKey(undefined, 'conversation');
    return keyId;
  }

  /**
   * #11381 — chiffre un texte AU REPOS pour sa conversation, lié à elle
   * (`aad`). La clé est celle que la conversation désigne
   * (`serverEncryptionKeyId`) quand elle en a une — la même que ses
   * traductions — sinon la clé de conversation du coffre.
   */
  async sealAtRest(params: {
    readonly plaintext: string;
    readonly conversationId: string;
    readonly preferredKeyId?: string | null;
  }): Promise<AtRestSealed> {
    if (!this.keyVault.masterKeyAvailable) {
      throw new ServerAtRestUnavailableError('missing');
    }
    const keyId = params.preferredKeyId || await this.getOrCreateConversationKey(params.conversationId);
    const key = await this.keyVault.getKey(keyId);
    if (!key) throw new ServerAtRestUnavailableError('key-unavailable');
    const iv = crypto.randomBytes(12);
    const sealed = sealBytes({ key, iv, plaintext: Buffer.from(params.plaintext, 'utf8'), aad: atRestAad(params.conversationId) });
    return {
      ciphertext: sealed.ciphertext.toString('base64'),
      metadata: {
        protocol: 'aes-256-gcm',
        keyId,
        iv: iv.toString('base64'),
        authTag: sealed.authTag.toString('base64'),
        aad: AT_REST_AAD_V1,
      },
    };
  }

  /** Ouvre un chiffré au repos ; tout échec est EXPLICITE (`ServerAtRestUnreadableError`). */
  async openAtRest(envelope: AtRestEnvelope, conversationId: string): Promise<string> {
    if (!this.keyVault.masterKeyAvailable) throw new ServerAtRestUnreadableError('master-key-unavailable');
    const key = await this.keyVault.getKey(envelope.keyId);
    if (!key) throw new ServerAtRestUnreadableError('data-key-unavailable');
    try {
      return openBytes({
        key,
        iv: Buffer.from(envelope.iv, 'base64'),
        ciphertext: Buffer.from(envelope.ciphertext, 'base64'),
        authTag: Buffer.from(envelope.authTag, 'base64'),
        ...(envelope.aad === AT_REST_AAD_V1 ? { aad: atRestAad(conversationId) } : {}),
      }).toString('utf8');
    } catch {
      throw new ServerAtRestUnreadableError('authentication-failed');
    }
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

    logger.debug('Encrypting message', { mode, conversationId, plaintextLength: plaintext.length });

    // Get or create key for conversation
    const keyId = await this.getOrCreateConversationKey(conversationId);

    const key = await this.keyVault.getKey(keyId);
    if (!key) {
      logger.error('Encryption key not found', undefined, { keyId });
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

    logger.debug('Message encrypted successfully', { keyId, ciphertextLength: ciphertext.length });

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

    logger.debug('Decrypting message', { keyId: metadata.keyId });

    const key = await this.keyVault.getKey(metadata.keyId);
    if (!key) {
      logger.error('Decryption key not found', undefined, { keyId: metadata.keyId });
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

    logger.debug('Message decrypted successfully', { plaintextLength: plaintext.length });

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

    logger.debug('Re-encrypting translated message', { keyId: metadata.keyId });

    // Re-encrypt the translated content with the same key
    const key = await this.keyVault.getKey(metadata.keyId);
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
    const keyId = await this.getOrCreateConversationKey(conversationId);

    const key = await this.keyVault.getKey(keyId);
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
    const key = await this.keyVault.getKey(serverLayer.keyId);
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
    const key = await this.keyVault.getKey(payload.server.keyId);
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
    if (!signalProtocolAvailable || !SignalLib) {
      throw new Error('Signal Protocol is not available on this platform. E2EE features are disabled.');
    }

    logger.debug('Generating Signal Protocol pre-key bundle using libsignal-client');

    // Generate identity key pair using Signal library
    const identityKeyPair = SignalLib.IdentityKeyPair.generate();
    const identityPublicKey = identityKeyPair.publicKey;

    // Generate registration ID (1-16380 as per Signal spec)
    const registrationId = crypto.randomInt(1, 16380);
    const deviceId = 1;

    // Generate pre-key (one-time key)
    const preKeyId = crypto.randomInt(1, 16777215);
    const preKeyPrivate = SignalLib.PrivateKey.generate();
    const preKeyPublic = preKeyPrivate.getPublicKey();
    const preKeyRecord = SignalLib.PreKeyRecord.new(preKeyId, preKeyPublic, preKeyPrivate);

    // Generate signed pre-key (medium-term key, signed by identity key)
    const signedPreKeyId = crypto.randomInt(1, 16777215);
    const signedPreKeyPrivate = SignalLib.PrivateKey.generate();
    const signedPreKeyPublic = signedPreKeyPrivate.getPublicKey();

    // Sign the signed pre-key with identity private key
    const signedPreKeySignature = identityKeyPair.privateKey.sign(
      signedPreKeyPublic.serialize()
    );

    const timestamp = Date.now();
    const signedPreKeyRecord = SignalLib.SignedPreKeyRecord.new(
      signedPreKeyId,
      timestamp,
      signedPreKeyPublic,
      signedPreKeyPrivate,
      signedPreKeySignature
    );

    logger.debug('Generated pre-key bundle with proper Signal keys', {
      registrationId,
      preKeyId,
      signedPreKeyId,
    });

    return {
      identityKey: new Uint8Array(identityPublicKey.getPublicKeyBytes()),
      registrationId,
      deviceId,
      preKeyId,
      preKeyPublic: new Uint8Array(preKeyRecord.publicKey().getPublicKeyBytes()),
      signedPreKeyId,
      signedPreKeyPublic: new Uint8Array(signedPreKeyRecord.publicKey().getPublicKeyBytes()),
      signedPreKeySignature: new Uint8Array(signedPreKeyRecord.signature()),
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
    return signalProtocolAvailable;
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

  /**
   * Securely shutdown encryption service
   *
   * SECURITY: This method clears all sensitive cryptographic material from memory
   * Should be called during graceful server shutdown
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down encryption service - clearing sensitive data');

    // Clear cache cleanup interval
    if (this.cacheCleanupInterval) {
      clearInterval(this.cacheCleanupInterval);
      this.cacheCleanupInterval = undefined;
    }

    // Clear Signal Protocol sensitive data
    if (this.signalService && typeof this.signalService.clearAllSensitiveData === 'function') {
      this.signalService.clearAllSensitiveData();
      logger.info('Signal Protocol sensitive data cleared');
    }

    // Clear key vault
    if (this.keyVault && typeof this.keyVault.clearAllKeys === 'function') {
      this.keyVault.clearAllKeys();
      logger.info('Key vault cleared');
    }

    this.initialized = false;
    logger.info('Encryption service shutdown complete');
  }
}

// Singleton instance (initialized with Prisma client)
let encryptionServiceInstance: EncryptionService | null = null;

/**
 * Get or create the encryption service singleton
 */
export async function getEncryptionService(prisma: PrismaClient): Promise<EncryptionService> {
  if (!encryptionServiceInstance) {
    encryptionServiceInstance = new EncryptionService(prisma);
    await encryptionServiceInstance.initialize();
  }
  return encryptionServiceInstance;
}

/**
 * Get the encryption service instance (sync version, throws if not initialized)
 */
export function getEncryptionServiceSync(): EncryptionService {
  if (!encryptionServiceInstance) {
    throw new Error('Encryption service not initialized. Call getEncryptionService(prisma) first.');
  }
  return encryptionServiceInstance;
}

/**
 * Export singleton for routes (requires initialization)
 */
export const encryptionService = {
  getOrCreateConversationKey: async (conversationId?: string) => {
    if (!encryptionServiceInstance) {
      throw new Error('Encryption service not initialized. Call getEncryptionService(prisma) first.');
    }
    return encryptionServiceInstance.getOrCreateConversationKey(conversationId);
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

/**
 * Shutdown the encryption service singleton
 * SECURITY: Call this during graceful server shutdown to clear sensitive data
 */
export async function shutdownEncryptionService(): Promise<void> {
  if (encryptionServiceInstance) {
    await encryptionServiceInstance.shutdown();
    encryptionServiceInstance = null;
  }
}

// Export types for external use
export type { EncryptionMode, EncryptedPayload, HybridEncryptedPayload, PreKeyBundle };
