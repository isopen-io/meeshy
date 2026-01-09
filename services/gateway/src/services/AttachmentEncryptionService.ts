/**
 * Attachment Encryption Service
 *
 * Implements the industry-standard "encrypt-then-upload" pattern used by
 * WhatsApp, iMessage, and Signal for secure file transfers.
 *
 * Encryption Flow:
 * 1. Generate random AES-256 key per attachment
 * 2. Encrypt file with AES-256-GCM
 * 3. Compute HMAC-SHA256 for integrity
 * 4. Upload encrypted blob to storage
 * 5. Send (blob_url + key) via E2EE message channel
 *
 * Encryption Modes:
 * - 'e2ee': Full E2E encryption - server cannot decrypt
 * - 'server': Server-side encryption - server can decrypt for translation
 * - 'hybrid': Double encryption - E2EE + server copy for audio translation
 */

import * as crypto from 'crypto';
import { PrismaClient } from '@meeshy/shared/prisma/client';

// Local type definitions (avoid Buffer type issues with shared package)
type EncryptionMode = 'e2ee' | 'server' | 'hybrid';

/**
 * Encrypted attachment metadata (local definition)
 */
interface EncryptedAttachmentMetadata {
  mode: EncryptionMode;
  algorithm: 'aes-256-gcm';
  encryptionKey: string;
  iv: string;
  authTag: string;
  hmac: string;
  originalSize: number;
  encryptedSize: number;
  mimeType: string;
  originalHash: string;
  encryptedHash: string;
}

// =====================================================
// CONSTANTS
// =====================================================

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 12; // 96 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

// =====================================================
// TYPES
// =====================================================

export interface EncryptAttachmentOptions {
  /** File buffer to encrypt */
  fileBuffer: Buffer;
  /** Original filename */
  filename: string;
  /** MIME type */
  mimeType: string;
  /** Encryption mode */
  mode: EncryptionMode;
  /** Optional: thumbnail buffer to encrypt */
  thumbnailBuffer?: Buffer;
  /** Conversation ID - required for server/hybrid mode to reuse per-conversation key */
  conversationId?: string;
}

export interface EncryptAttachmentResult {
  /** Encrypted file buffer */
  encryptedBuffer: Buffer;
  /** Encryption metadata */
  metadata: EncryptedAttachmentMetadata;
  /** Encrypted thumbnail (if provided) */
  encryptedThumbnail?: {
    buffer: Buffer;
    iv: string;
    authTag: string;
  };
  /** Server-side encrypted copy (for hybrid mode audio) */
  serverCopy?: {
    encryptedBuffer: Buffer;
    keyId: string;
    iv: string;
    authTag: string;
  };
}

export interface DecryptAttachmentOptions {
  /** Encrypted file buffer */
  encryptedBuffer: Buffer;
  /** AES-256 key (base64) */
  encryptionKey: string;
  /** IV (base64) */
  iv: string;
  /** Auth tag (base64) */
  authTag: string;
  /** Expected original hash (optional, for verification) */
  expectedHash?: string;
}

export interface DecryptAttachmentResult {
  /** Decrypted file buffer */
  decryptedBuffer: Buffer;
  /** Whether hash verification passed */
  hashVerified: boolean;
  /** Computed hash of decrypted file */
  computedHash: string;
}

// =====================================================
// SERVER KEY VAULT (for server/hybrid mode)
// With in-memory cache + MongoDB persistence
// Uses envelope encryption: data keys are encrypted with master key
// =====================================================

/**
 * Master key configuration
 * The master key encrypts data keys before storing in MongoDB
 */
function getMasterKey(): Buffer {
  let masterKeyB64 = process.env.ATTACHMENT_MASTER_KEY;

  // Use a deterministic test key in test environment
  if (!masterKeyB64 && process.env.NODE_ENV === 'test') {
    // Test key - DO NOT USE IN PRODUCTION
    masterKeyB64 = 'dGVzdGtleWZvcmNpY2R0ZXN0aW5nb25seTMyYnl0ZXM='; // "testkeyforcicdtestingonly32bytes" in base64
  }

  if (!masterKeyB64) {
    throw new Error(
      'ATTACHMENT_MASTER_KEY environment variable is required. ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"'
    );
  }

  const masterKey = Buffer.from(masterKeyB64, 'base64');
  if (masterKey.length !== KEY_LENGTH) {
    throw new Error(
      `ATTACHMENT_MASTER_KEY must be ${KEY_LENGTH} bytes (256 bits) when decoded from base64. ` +
      `Current length: ${masterKey.length} bytes`
    );
  }

  return masterKey;
}

/**
 * Encrypt a data key using the master key (envelope encryption)
 */
function encryptDataKey(dataKey: Buffer, masterKey: Buffer): { encryptedKey: string; iv: string; authTag: string } {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, masterKey, iv);
  const encryptedKey = Buffer.concat([cipher.update(dataKey), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    encryptedKey: encryptedKey.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  };
}

/**
 * Decrypt a data key using the master key
 */
function decryptDataKey(encryptedKey: string, iv: string, authTag: string, masterKey: Buffer): Buffer {
  const ivBuffer = Buffer.from(iv, 'base64');
  const authTagBuffer = Buffer.from(authTag, 'base64');
  const encryptedKeyBuffer = Buffer.from(encryptedKey, 'base64');

  const decipher = crypto.createDecipheriv(ALGORITHM, masterKey, ivBuffer);
  decipher.setAuthTag(authTagBuffer);

  return Buffer.concat([decipher.update(encryptedKeyBuffer), decipher.final()]);
}

/**
 * Cache entry with TTL tracking
 */
interface CacheEntry {
  key: Buffer;
  cachedAt: number;
}

/**
 * AttachmentKeyVault - Manages server-side encryption keys
 *
 * Architecture:
 * - In-memory cache for fast access to recent keys
 * - MongoDB persistence for durability across restarts
 * - Envelope encryption: data keys encrypted with master key before storage
 * - LRU-style eviction when cache is full
 */
class AttachmentKeyVault {
  private cache: Map<string, CacheEntry> = new Map();
  private prisma: PrismaClient;
  private masterKey: Buffer;

  // Cache configuration
  private readonly MAX_CACHE_SIZE = 1000;
  private readonly CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.masterKey = getMasterKey();
  }

  /**
   * Generate a new encryption key for a conversation
   * Stores in both cache and MongoDB
   */
  async generateKey(options?: { conversationId?: string; userId?: string }): Promise<{ keyId: string; key: Buffer }> {
    const keyId = crypto.randomUUID();
    const key = crypto.randomBytes(KEY_LENGTH);

    // Encrypt key with master key for storage
    const encrypted = encryptDataKey(key, this.masterKey);

    // Store in MongoDB
    try {
      await this.prisma.serverEncryptionKey.create({
        data: {
          id: keyId,
          encryptedKey: encrypted.encryptedKey,
          iv: encrypted.iv,
          authTag: encrypted.authTag,
          algorithm: ALGORITHM,
          purpose: 'attachment',
          conversationId: options?.conversationId,
          userId: options?.userId,
          createdAt: new Date(),
          lastAccessedAt: new Date(),
          isActive: true,
        },
      });
    } catch (error) {
      console.error('[AttachmentKeyVault] Failed to persist key to MongoDB:', error);
      // Still cache the key for this session even if DB fails
    }

    // Store in cache
    this.cacheKey(keyId, key);

    return { keyId, key };
  }

  /**
   * Get a key by ID
   * Checks cache first, then MongoDB
   */
  async getKey(keyId: string): Promise<Buffer | undefined> {
    // Check cache first
    const cached = this.cache.get(keyId);
    if (cached) {
      // Check TTL
      if (Date.now() - cached.cachedAt < this.CACHE_TTL_MS) {
        return cached.key;
      }
      // Expired, remove from cache
      this.cache.delete(keyId);
    }

    // Try to load from MongoDB
    try {
      const record = await this.prisma.serverEncryptionKey.findUnique({
        where: { id: keyId },
      });

      if (!record || !record.isActive) {
        return undefined;
      }

      // Check expiration
      if (record.expiresAt && record.expiresAt < new Date()) {
        console.warn(`[AttachmentKeyVault] Key ${keyId} has expired`);
        return undefined;
      }

      // Decrypt the key
      const key = decryptDataKey(record.encryptedKey, record.iv, record.authTag, this.masterKey);

      // Update last accessed time (fire and forget)
      this.prisma.serverEncryptionKey.update({
        where: { id: keyId },
        data: { lastAccessedAt: new Date() },
      }).catch(() => {});

      // Cache the decrypted key
      this.cacheKey(keyId, key);

      return key;
    } catch (error) {
      console.error(`[AttachmentKeyVault] Failed to load key ${keyId} from MongoDB:`, error);
      return undefined;
    }
  }

  /**
   * Synchronous get from cache only (for backward compatibility)
   * Use getKey() for full cache + DB lookup
   */
  getKeyFromCache(keyId: string): Buffer | undefined {
    const cached = this.cache.get(keyId);
    if (cached && Date.now() - cached.cachedAt < this.CACHE_TTL_MS) {
      return cached.key;
    }
    return undefined;
  }

  /**
   * Delete a key from cache and MongoDB
   */
  async deleteKey(keyId: string): Promise<boolean> {
    // Remove from cache
    this.cache.delete(keyId);

    // Soft delete in MongoDB (keep for audit trail)
    try {
      await this.prisma.serverEncryptionKey.update({
        where: { id: keyId },
        data: { isActive: false },
      });
      return true;
    } catch (error) {
      console.error(`[AttachmentKeyVault] Failed to delete key ${keyId}:`, error);
      return false;
    }
  }

  /**
   * Check if a key exists (cache or DB)
   */
  async hasKey(keyId: string): Promise<boolean> {
    // Check cache first
    if (this.cache.has(keyId)) {
      return true;
    }

    // Check MongoDB
    try {
      const count = await this.prisma.serverEncryptionKey.count({
        where: { id: keyId, isActive: true },
      });
      return count > 0;
    } catch {
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): { cacheSize: number; maxCacheSize: number } {
    return {
      cacheSize: this.cache.size,
      maxCacheSize: this.MAX_CACHE_SIZE,
    };
  }

  /**
   * Cache a key with LRU-style eviction
   */
  private cacheKey(keyId: string, key: Buffer): void {
    // Evict oldest entries if cache is full
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      this.evictOldestEntries(Math.floor(this.MAX_CACHE_SIZE * 0.2)); // Evict 20%
    }

    this.cache.set(keyId, {
      key,
      cachedAt: Date.now(),
    });
  }

  /**
   * Evict oldest entries from cache
   */
  private evictOldestEntries(count: number): void {
    const entries = Array.from(this.cache.entries())
      .sort((a, b) => a[1].cachedAt - b[1].cachedAt)
      .slice(0, count);

    for (const [keyId] of entries) {
      this.cache.delete(keyId);
    }
  }

  /**
   * Clean up expired keys from MongoDB (call periodically)
   */
  async cleanupExpiredKeys(): Promise<number> {
    try {
      const result = await this.prisma.serverEncryptionKey.updateMany({
        where: {
          expiresAt: { lt: new Date() },
          isActive: true,
        },
        data: { isActive: false },
      });
      return result.count;
    } catch (error) {
      console.error('[AttachmentKeyVault] Failed to cleanup expired keys:', error);
      return 0;
    }
  }
}

// =====================================================
// SERVICE
// =====================================================

export class AttachmentEncryptionService {
  private prisma: PrismaClient;
  private keyVault: AttachmentKeyVault;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.keyVault = new AttachmentKeyVault(prisma);
  }

  /**
   * Encrypt an attachment file
   *
   * @param options Encryption options
   * @returns Encrypted buffer and metadata
   * @throws Error if file buffer is empty or exceeds size limits
   */
  async encryptAttachment(options: EncryptAttachmentOptions): Promise<EncryptAttachmentResult> {
    const { fileBuffer, filename, mimeType, mode, thumbnailBuffer, conversationId } = options;

    // Validate inputs
    if (!fileBuffer || fileBuffer.length === 0) {
      throw new Error('File buffer is empty');
    }

    // Max file size: 2GB (to prevent memory issues)
    const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024;
    if (fileBuffer.length > MAX_FILE_SIZE) {
      throw new Error(`File size ${fileBuffer.length} exceeds maximum allowed size of ${MAX_FILE_SIZE} bytes`);
    }

    if (!mode || !['e2ee', 'server', 'hybrid'].includes(mode)) {
      throw new Error(`Invalid encryption mode: ${mode}. Must be 'e2ee', 'server', or 'hybrid'`);
    }

    // Generate per-attachment encryption key
    const encryptionKey = crypto.randomBytes(KEY_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);

    // Compute original file hash
    const originalHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    // Encrypt the file
    const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey, iv);
    const encryptedBuffer = Buffer.concat([
      cipher.update(fileBuffer),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    // Compute HMAC for integrity
    const hmacKey = crypto.createHash('sha256').update(encryptionKey).digest();
    const hmac = crypto.createHmac('sha256', hmacKey).update(encryptedBuffer).digest();

    // Compute encrypted file hash
    const encryptedHash = crypto.createHash('sha256').update(encryptedBuffer).digest('hex');

    // Build metadata
    const metadata: EncryptedAttachmentMetadata = {
      mode,
      algorithm: 'aes-256-gcm',
      encryptionKey: encryptionKey.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      hmac: hmac.toString('base64'),
      originalSize: fileBuffer.length,
      encryptedSize: encryptedBuffer.length,
      mimeType,
      originalHash,
      encryptedHash,
    };

    const result: EncryptAttachmentResult = {
      encryptedBuffer,
      metadata,
    };

    // Encrypt thumbnail if provided
    if (thumbnailBuffer) {
      const thumbIv = crypto.randomBytes(IV_LENGTH);
      const thumbCipher = crypto.createCipheriv(ALGORITHM, encryptionKey, thumbIv);
      const encryptedThumb = Buffer.concat([
        thumbCipher.update(thumbnailBuffer),
        thumbCipher.final(),
      ]);
      const thumbAuthTag = thumbCipher.getAuthTag();

      result.encryptedThumbnail = {
        buffer: encryptedThumb,
        iv: thumbIv.toString('base64'),
        authTag: thumbAuthTag.toString('base64'),
      };
    }

    // For hybrid/server mode: create server-accessible copy using per-conversation key
    if (mode === 'hybrid' || mode === 'server') {
      if (!conversationId) {
        throw new Error('conversationId is required for server/hybrid encryption mode');
      }

      let keyId: string;
      let key: Buffer;

      // Look up conversation's existing server encryption key
      const conversation = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { serverEncryptionKeyId: true },
      });

      if (!conversation) {
        throw new Error(`Conversation ${conversationId} not found`);
      }

      if (conversation.serverEncryptionKeyId) {
        // Reuse existing per-conversation key
        const existingKey = await this.keyVault.getKey(conversation.serverEncryptionKeyId);
        if (existingKey) {
          keyId = conversation.serverEncryptionKeyId;
          key = existingKey;
        } else {
          // Key was deleted or expired - generate new one and update conversation
          console.warn(`[AttachmentEncryptionService] Conversation key ${conversation.serverEncryptionKeyId} not found, generating new key`);
          const generated = await this.keyVault.generateKey({ conversationId });
          keyId = generated.keyId;
          key = generated.key;

          // Update conversation with new key
          await this.prisma.conversation.update({
            where: { id: conversationId },
            data: { serverEncryptionKeyId: keyId },
          });
        }
      } else {
        // No key exists for conversation - generate new one
        const generated = await this.keyVault.generateKey({ conversationId });
        keyId = generated.keyId;
        key = generated.key;

        // Store key ID on conversation for future reuse
        await this.prisma.conversation.update({
          where: { id: conversationId },
          data: { serverEncryptionKeyId: keyId },
        });
      }

      const serverIv = crypto.randomBytes(IV_LENGTH);
      const serverCipher = crypto.createCipheriv(ALGORITHM, key, serverIv);
      const serverEncrypted = Buffer.concat([
        serverCipher.update(fileBuffer),
        serverCipher.final(),
      ]);
      const serverAuthTag = serverCipher.getAuthTag();

      result.serverCopy = {
        encryptedBuffer: serverEncrypted,
        keyId,
        iv: serverIv.toString('base64'),
        authTag: serverAuthTag.toString('base64'),
      };
    }

    return result;
  }

  /**
   * Decrypt an attachment file
   *
   * @param options Decryption options
   * @returns Decrypted buffer
   * @throws Error if decryption parameters are invalid or decryption fails
   */
  async decryptAttachment(options: DecryptAttachmentOptions): Promise<DecryptAttachmentResult> {
    const { encryptedBuffer, encryptionKey, iv, authTag, expectedHash } = options;

    // Validate inputs
    if (!encryptedBuffer || encryptedBuffer.length === 0) {
      throw new Error('Encrypted buffer is empty');
    }

    // Parse and validate key
    let key: Buffer;
    try {
      key = Buffer.from(encryptionKey, 'base64');
    } catch {
      throw new Error('Invalid encryption key: not valid base64');
    }
    if (key.length !== KEY_LENGTH) {
      throw new Error(`Invalid encryption key length: expected ${KEY_LENGTH} bytes, got ${key.length}`);
    }

    // Parse and validate IV
    let ivBuffer: Buffer;
    try {
      ivBuffer = Buffer.from(iv, 'base64');
    } catch {
      throw new Error('Invalid IV: not valid base64');
    }
    if (ivBuffer.length !== IV_LENGTH) {
      throw new Error(`Invalid IV length: expected ${IV_LENGTH} bytes, got ${ivBuffer.length}`);
    }

    // Parse and validate auth tag
    let authTagBuffer: Buffer;
    try {
      authTagBuffer = Buffer.from(authTag, 'base64');
    } catch {
      throw new Error('Invalid auth tag: not valid base64');
    }
    if (authTagBuffer.length !== AUTH_TAG_LENGTH) {
      throw new Error(`Invalid auth tag length: expected ${AUTH_TAG_LENGTH} bytes, got ${authTagBuffer.length}`);
    }

    // Decrypt
    const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuffer);
    decipher.setAuthTag(authTagBuffer);

    const decryptedBuffer = Buffer.concat([
      decipher.update(encryptedBuffer),
      decipher.final(),
    ]);

    // Compute hash of decrypted file
    const computedHash = crypto.createHash('sha256').update(decryptedBuffer).digest('hex');

    // Verify hash if expected hash provided
    const hashVerified = expectedHash ? computedHash === expectedHash : true;

    return {
      decryptedBuffer,
      hashVerified,
      computedHash,
    };
  }

  /**
   * Decrypt server-side encrypted attachment (for translation)
   *
   * @param encryptedBuffer Encrypted buffer
   * @param keyId Server key ID
   * @param iv IV (base64)
   * @param authTag Auth tag (base64)
   * @returns Decrypted buffer
   */
  async decryptServerAttachment(
    encryptedBuffer: Buffer,
    keyId: string,
    iv: string,
    authTag: string
  ): Promise<Buffer> {
    // Get key from cache or MongoDB
    const key = await this.keyVault.getKey(keyId);
    if (!key) {
      throw new Error(`Server key not found: ${keyId}`);
    }

    const ivBuffer = Buffer.from(iv, 'base64');
    const authTagBuffer = Buffer.from(authTag, 'base64');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuffer);
    decipher.setAuthTag(authTagBuffer);

    return Buffer.concat([
      decipher.update(encryptedBuffer),
      decipher.final(),
    ]);
  }

  /**
   * Verify HMAC of encrypted attachment
   *
   * Uses constant-time comparison to prevent timing attacks.
   *
   * @param encryptedBuffer Encrypted buffer
   * @param encryptionKey Encryption key (base64)
   * @param expectedHmac Expected HMAC (base64)
   * @returns Whether HMAC is valid
   */
  verifyHmac(encryptedBuffer: Buffer, encryptionKey: string, expectedHmac: string): boolean {
    try {
      const key = Buffer.from(encryptionKey, 'base64');
      const hmacKey = crypto.createHash('sha256').update(key).digest();
      const computedHmac = crypto.createHmac('sha256', hmacKey).update(encryptedBuffer).digest();

      // Safely decode expected HMAC
      let expectedHmacBuffer: Buffer;
      try {
        expectedHmacBuffer = Buffer.from(expectedHmac, 'base64');
      } catch {
        // Invalid base64 - compare against dummy value to maintain constant time
        expectedHmacBuffer = Buffer.alloc(computedHmac.length);
      }

      // Ensure same length before comparison (timingSafeEqual requires equal length)
      if (computedHmac.length !== expectedHmacBuffer.length) {
        // Still do a timing-safe comparison against dummy data to prevent timing leak
        const dummy = Buffer.alloc(computedHmac.length);
        crypto.timingSafeEqual(computedHmac, dummy);
        return false;
      }

      return crypto.timingSafeEqual(computedHmac, expectedHmacBuffer);
    } catch (error) {
      // Log error but don't expose details
      console.error('[AttachmentEncryptionService] HMAC verification error');
      return false;
    }
  }

  /**
   * Generate a new server-side key for hybrid mode
   *
   * @param options Optional metadata for the key
   * @returns Key ID
   */
  async generateServerKey(options?: { attachmentId?: string; userId?: string }): Promise<string> {
    const { keyId } = await this.keyVault.generateKey(options);
    return keyId;
  }

  /**
   * Check if server key exists (checks cache and MongoDB)
   *
   * @param keyId Key ID
   * @returns Whether key exists
   */
  async hasServerKey(keyId: string): Promise<boolean> {
    return this.keyVault.hasKey(keyId);
  }

  /**
   * Delete a server key (soft delete - keeps for audit trail)
   *
   * @param keyId Key ID
   * @returns Whether deletion was successful
   */
  async deleteServerKey(keyId: string): Promise<boolean> {
    return this.keyVault.deleteKey(keyId);
  }

  /**
   * Clean up expired keys from storage
   * Call this periodically (e.g., daily cron job)
   *
   * @returns Number of keys cleaned up
   */
  async cleanupExpiredKeys(): Promise<number> {
    return this.keyVault.cleanupExpiredKeys();
  }

  /**
   * Encrypt attachment metadata (filename, etc.) for secure transmission
   *
   * @param metadata Metadata object
   * @param encryptionKey Encryption key (base64)
   * @returns Encrypted metadata (base64)
   */
  encryptMetadata(metadata: Record<string, unknown>, encryptionKey: string): string {
    const key = Buffer.from(encryptionKey, 'base64');
    const iv = crypto.randomBytes(IV_LENGTH);
    const plaintext = JSON.stringify(metadata);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    // Format: iv:authTag:ciphertext (all base64)
    return `${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext.toString('base64')}`;
  }

  /**
   * Decrypt attachment metadata
   *
   * @param encryptedMetadata Encrypted metadata string
   * @param encryptionKey Encryption key (base64)
   * @returns Decrypted metadata object
   */
  decryptMetadata(encryptedMetadata: string, encryptionKey: string): Record<string, unknown> {
    const [ivB64, authTagB64, ciphertextB64] = encryptedMetadata.split(':');
    if (!ivB64 || !authTagB64 || !ciphertextB64) {
      throw new Error('Invalid encrypted metadata format');
    }

    const key = Buffer.from(encryptionKey, 'base64');
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(authTagB64, 'base64');
    const ciphertext = Buffer.from(ciphertextB64, 'base64');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf8');

    return JSON.parse(plaintext);
  }

  /**
   * Get encryption statistics
   */
  getStats(): { cacheSize: number; maxCacheSize: number } {
    return this.keyVault.getStats();
  }
}

// Export singleton factory
let instance: AttachmentEncryptionService | null = null;

export function getAttachmentEncryptionService(prisma: PrismaClient): AttachmentEncryptionService {
  if (!instance) {
    instance = new AttachmentEncryptionService(prisma);
  }
  return instance;
}
