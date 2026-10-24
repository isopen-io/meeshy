import { PrismaClient } from '@meeshy/shared/prisma/client';
import * as crypto from 'crypto';
import { enhancedLogger } from '../utils/logger-enhanced';
import { readMasterKey, ServerAtRestUnavailableError, type MasterKeyState } from './messaging/serverAtRest';

const logger = enhancedLogger.child({ module: 'EncryptionService' });

let masterKeyAbsenceLogged = false;

/** Dit au démarrage, une fois, que les modes `server`/`hybrid` refuseront tout (#11381). */
function logMasterKeyAbsenceOnce(state: MasterKeyState): void {
  if ('key' in state || masterKeyAbsenceLogged) return;
  masterKeyAbsenceLogged = true;
  logger.error('ENCRYPTION_MASTER_KEY absente ou invalide : les conversations server/hybrid refusent écriture et lecture', {
    reason: state.reason,
  });
}

/**
 * Server Key Vault - Manages encryption keys with database persistence
 *
 * Keys are persisted to MongoDB using the ServerEncryptionKey model.
 * Uses envelope encryption: data keys are encrypted with a master key before storage.
 * Includes in-memory LRU cache for performance.
 */
export class ServerKeyVault {
  private prisma: PrismaClient;
  private masterKeyState: MasterKeyState;
  private keyCache: Map<string, { key: Buffer; lastAccessed: number }> = new Map();
  private conversationKeyMap: Map<string, string> = new Map();
  private readonly CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
  private readonly MAX_CACHE_SIZE = 500;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.masterKeyState = readMasterKey(process.env.ENCRYPTION_MASTER_KEY);
    logMasterKeyAbsenceOnce(this.masterKeyState);
  }

  get masterKeyAvailable(): boolean {
    return this.masterKeyState.available;
  }

  /**
   * #11381 — sans clé maîtresse, la passerelle démarre et REFUSE : plus de
   * clé éphémère de développement, dont les chiffrés mouraient au redémarrage.
   */
  private requireMasterKey(): Buffer {
    const state = this.masterKeyState;
    if ('key' in state) return state.key;
    throw new ServerAtRestUnavailableError(state.reason);
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
    const masterKey = this.requireMasterKey();
    const keyId = crypto.randomUUID();
    const key = crypto.randomBytes(32); // AES-256

    logger.debug('Generating new encryption key', { keyId, purpose, conversationId });

    // Encrypt the key with master key before storage (envelope encryption)
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);
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

    if (!this.masterKeyState.available) return undefined;
    const masterKey = this.masterKeyState.key;

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

      const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, iv);
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
    for (const entry of this.keyCache.values()) {
      if (entry.key) {
        entry.key.fill(0); // Zeroize key data
      }
    }

    // Clear caches and mappings
    this.keyCache.clear();
    this.conversationKeyMap.clear();

    // Zeroize master key
    if (this.masterKeyState.available) {
      this.masterKeyState.key.fill(0);
    }

    logger.info('All encryption keys cleared from memory');
  }
}
