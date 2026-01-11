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
// Note: A symlink to prebuilds should exist in the gateway directory for node-gyp-build to work
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
 * Server Key Vault - Manages encryption keys with database persistence
 *
 * Keys are persisted to MongoDB using the ServerEncryptionKey model.
 * Uses envelope encryption: data keys are encrypted with a master key before storage.
 * Includes in-memory LRU cache for performance.
 */
class ServerKeyVault {
  private prisma: PrismaClient;
  private masterKey: Buffer;
  private keyCache: Map<string, { key: Buffer; lastAccessed: number }> = new Map();
  private conversationKeyMap: Map<string, string> = new Map();
  private readonly CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
  private readonly MAX_CACHE_SIZE = 500;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    // Load master key from environment (required for production)
    const masterKeyB64 = process.env.ENCRYPTION_MASTER_KEY;
    if (!masterKeyB64) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('ENCRYPTION_MASTER_KEY environment variable is required in production');
      }
      // Development fallback - generate ephemeral key (keys will be lost on restart)
      logger.warn('No ENCRYPTION_MASTER_KEY set - using ephemeral key (development only)');
      this.masterKey = crypto.randomBytes(32);
    } else {
      this.masterKey = Buffer.from(masterKeyB64, 'base64');
      if (this.masterKey.length !== 32) {
        throw new Error('ENCRYPTION_MASTER_KEY must be 32 bytes (256 bits) base64 encoded');
      }
    }
  }

  /**
   * Initialize vault - load existing keys from database
   */
  async initialize(): Promise<void> {
    logger.info('Initializing ServerKeyVault');

    try {
      // Load conversation key mappings from database
      const existingKeys = await this.prisma.serverEncryptionKey.findMany({
        where: {
          purpose: 'conversation',
          expiresAt: { equals: null }, // Non-expired keys
        },
        select: {
          id: true,
          conversationId: true,
        },
      });

      for (const key of existingKeys) {
        if (key.conversationId) {
          this.conversationKeyMap.set(key.conversationId, key.id);
        }
      }

      logger.info('ServerKeyVault initialized', {
        conversationKeysLoaded: existingKeys.length,
        cacheSize: this.keyCache.size
      });
    } catch (error) {
      logger.error('Failed to initialize ServerKeyVault', error);
      throw error;
    }
  }

  /**
   * Generate a new encryption key and persist to database
   */
  async generateKey(conversationId?: string, purpose: string = 'message'): Promise<{ keyId: string; key: Buffer }> {
    const keyId = crypto.randomUUID();
    const key = crypto.randomBytes(32); // AES-256

    logger.debug('Generating new encryption key', { keyId, purpose, conversationId });

    // Encrypt the key with master key before storage (envelope encryption)
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.masterKey, iv);
    const encryptedKey = Buffer.concat([cipher.update(key), cipher.final()]);
    const authTag = cipher.getAuthTag();

    try {
      // Persist to database
      await this.prisma.serverEncryptionKey.create({
        data: {
          id: keyId,
          encryptedKey: encryptedKey.toString('base64'),
          iv: iv.toString('base64'),
          authTag: authTag.toString('base64'),
          algorithm: 'aes-256-gcm',
          purpose,
          conversationId: conversationId || null,
          createdAt: new Date(),
        },
      });

      // Cache the key in memory
      this.cacheKey(keyId, key);

      logger.debug('Encryption key generated and persisted', { keyId, purpose });
      return { keyId, key };
    } catch (error) {
      logger.error('Failed to persist encryption key', error, { keyId });
      throw error;
    }
  }

  /**
   * Get a key by ID (from cache or database)
   */
  async getKey(keyId: string): Promise<Buffer | undefined> {
    // Check cache first
    const cached = this.keyCache.get(keyId);
    if (cached) {
      cached.lastAccessed = Date.now();
      logger.trace('Key retrieved from cache', { keyId });
      return cached.key;
    }

    // Load from database
    logger.debug('Loading key from database', { keyId });
    try {
      const keyRecord = await this.prisma.serverEncryptionKey.findUnique({
        where: { id: keyId },
      });

      if (!keyRecord) {
        logger.warn('Key not found in database', { keyId });
        return undefined;
      }

      // Decrypt the key using master key
      const encryptedKey = Buffer.from(keyRecord.encryptedKey, 'base64');
      const iv = Buffer.from(keyRecord.iv, 'base64');
      const authTag = Buffer.from(keyRecord.authTag, 'base64');

      const decipher = crypto.createDecipheriv('aes-256-gcm', this.masterKey, iv);
      decipher.setAuthTag(authTag);
      const key = Buffer.concat([decipher.update(encryptedKey), decipher.final()]);

      // Cache for future use
      this.cacheKey(keyId, key);

      // Update last accessed timestamp (fire-and-forget)
      this.prisma.serverEncryptionKey.update({
        where: { id: keyId },
        data: { lastAccessedAt: new Date() },
      }).catch((err) => {
        logger.warn('Failed to update key lastAccessedAt', { keyId, error: err.message });
      });

      logger.debug('Key loaded from database', { keyId });
      return key;
    } catch (error) {
      logger.error('Failed to load key from database', error, { keyId });
      return undefined;
    }
  }

  /**
   * Set conversation to key mapping
   */
  async setConversationKey(conversationId: string, keyId: string): Promise<void> {
    this.conversationKeyMap.set(conversationId, keyId);

    // Update database record with conversation association
    try {
      await this.prisma.serverEncryptionKey.update({
        where: { id: keyId },
        data: {
          conversationId,
          purpose: 'conversation',
        },
      });
      logger.debug('Conversation key mapping saved', { conversationId, keyId });
    } catch (error) {
      logger.warn('Failed to update conversation key mapping in database', { conversationId, keyId });
    }
  }

  /**
   * Get the key ID for a conversation
   */
  getConversationKeyId(conversationId: string): string | undefined {
    return this.conversationKeyMap.get(conversationId);
  }

  /**
   * Cache a key in memory with LRU eviction
   */
  private cacheKey(keyId: string, key: Buffer): void {
    // Evict oldest entries if cache is full
    if (this.keyCache.size >= this.MAX_CACHE_SIZE) {
      this.evictOldestCacheEntries();
    }

    this.keyCache.set(keyId, { key, lastAccessed: Date.now() });
  }

  /**
   * Evict oldest 10% of cache entries
   */
  private evictOldestCacheEntries(): void {
    const entries = Array.from(this.keyCache.entries());
    entries.sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);

    const toEvict = Math.ceil(entries.length * 0.1);
    for (let i = 0; i < toEvict; i++) {
      this.keyCache.delete(entries[i][0]);
    }

    logger.debug('Evicted cache entries', { evicted: toEvict, remaining: this.keyCache.size });
  }

  /**
   * Clean up expired cache entries
   */
  cleanupCache(): void {
    const now = Date.now();
    let evicted = 0;

    for (const [keyId, entry] of this.keyCache.entries()) {
      if (now - entry.lastAccessed > this.CACHE_TTL_MS) {
        this.keyCache.delete(keyId);
        evicted++;
      }
    }

    if (evicted > 0) {
      logger.debug('Cleaned up expired cache entries', { evicted, remaining: this.keyCache.size });
    }
  }

  /**
   * Securely clear all keys from memory
   *
   * SECURITY: Zeroizes all cached keys and clears mappings
   * Should be called during graceful server shutdown
   */
  clearAllKeys(): void {
    logger.info('Clearing all encryption keys from memory');

    // Zeroize all cached keys
    for (const [keyId, entry] of this.keyCache.entries()) {
      if (entry.key) {
        entry.key.fill(0); // Zeroize key data
      }
    }

    // Clear caches and mappings
    this.keyCache.clear();
    this.conversationKeyMap.clear();

    // Zeroize master key
    if (this.masterKey) {
      this.masterKey.fill(0);
    }

    logger.info('All encryption keys cleared from memory');
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
  private initialized = false;
  private cacheCleanupInterval?: NodeJS.Timeout;
  // Lock map for atomic key generation - prevents TOCTOU race condition
  private keyGenerationLocks: Map<string, { promise: Promise<string>; resolve: (value: string) => void }> = new Map();

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
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
      this.cacheCleanupInterval = setInterval(() => {
        this.keyVault.cleanupCache();
      }, 5 * 60 * 1000);

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
        setTimeout(() => {
          this.keyGenerationLocks.delete(conversationId);
        }, 100);
      }
    }

    // No conversationId - generate a standalone key (no locking needed)
    const { keyId } = await this.keyVault.generateKey(undefined, 'conversation');
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
