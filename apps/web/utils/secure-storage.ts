/**
 * Secure Storage Utility
 * Provides encrypted localStorage/sessionStorage with automatic TTL
 *
 * Security Features:
 * - AES-256-GCM encryption using Web Crypto API
 * - Session-based encryption keys (auto-invalidated on logout)
 * - Automatic TTL (24h max)
 * - Zero plaintext storage of sensitive data
 *
 * @author Meeshy Security Team
 * @version 1.0.0
 */

/**
 * Storage item with metadata
 */
interface SecureStorageItem<T> {
  data: T;
  timestamp: number;
  ttl: number; // milliseconds
  version: number;
}

/**
 * Configuration
 */
const STORAGE_CONFIG = {
  DEFAULT_TTL: 24 * 60 * 60 * 1000, // 24 hours
  ENCRYPTION_VERSION: 1,
  SESSION_KEY_NAME: 'meeshy-session-id'
};

/**
 * Secure Storage Manager
 * Uses Web Crypto API for AES-256-GCM encryption
 */
export class SecureStorage {
  /**
   * Get or generate session-specific encryption key
   * Key is derived from session ID stored in sessionStorage
   * Automatically invalidated when browser tab closes or on logout
   */
  private static async getEncryptionKey(): Promise<CryptoKey> {
    // Get or create session ID
    let sessionId = sessionStorage.getItem(STORAGE_CONFIG.SESSION_KEY_NAME);

    if (!sessionId) {
      // Generate new session ID
      sessionId = this.generateSecureId();
      sessionStorage.setItem(STORAGE_CONFIG.SESSION_KEY_NAME, sessionId);
    }

    // Derive encryption key from session ID using PBKDF2
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(sessionId),
      { name: 'PBKDF2' },
      false,
      ['deriveBits', 'deriveKey']
    );

    // Derive AES-GCM key
    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: encoder.encode('meeshy-notification-salt-v1'),
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Generate cryptographically secure random ID
   */
  private static generateSecureId(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Encrypt data with AES-256-GCM
   */
  private static async encrypt(data: string): Promise<string> {
    const key = await this.getEncryptionKey();
    const encoder = new TextEncoder();
    const dataBytes = encoder.encode(data);

    // Generate random IV (initialization vector)
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // Encrypt
    const encryptedBytes = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      dataBytes
    );

    // Combine IV + encrypted data
    const combined = new Uint8Array(iv.length + encryptedBytes.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encryptedBytes), iv.length);

    // Convert to base64
    return btoa(String.fromCharCode(...combined));
  }

  /**
   * Decrypt data with AES-256-GCM
   */
  private static async decrypt(encryptedData: string): Promise<string> {
    try {
      const key = await this.getEncryptionKey();

      // Decode from base64
      const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));

      // Extract IV and encrypted data
      const iv = combined.slice(0, 12);
      const data = combined.slice(12);

      // Decrypt
      const decryptedBytes = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        data
      );

      // Convert to string
      const decoder = new TextDecoder();
      return decoder.decode(decryptedBytes);
    } catch (error) {
      console.error('[SecureStorage] Decryption failed:', error);
      throw new Error('Decryption failed - key mismatch or corrupted data');
    }
  }

  /**
   * Set item in secure storage
   * Data is encrypted before storing
   *
   * @param key - Storage key
   * @param value - Data to store (will be serialized to JSON)
   * @param ttl - Time to live in milliseconds (default: 24h)
   * @param useSessionStorage - Use sessionStorage instead of localStorage (default: false)
   */
  static async setSecure<T>(
    key: string,
    value: T,
    ttl: number = STORAGE_CONFIG.DEFAULT_TTL,
    useSessionStorage: boolean = false
  ): Promise<void> {
    try {
      const item: SecureStorageItem<T> = {
        data: value,
        timestamp: Date.now(),
        ttl,
        version: STORAGE_CONFIG.ENCRYPTION_VERSION
      };

      const serialized = JSON.stringify(item);
      const encrypted = await this.encrypt(serialized);

      const storage = useSessionStorage ? sessionStorage : localStorage;
      storage.setItem(key, encrypted);
    } catch (error) {
      console.error('[SecureStorage] Failed to set item:', error);
      throw error;
    }
  }

  /**
   * Get item from secure storage
   * Automatically validates TTL and version
   *
   * @param key - Storage key
   * @param useSessionStorage - Use sessionStorage instead of localStorage (default: false)
   * @returns Decrypted data or null if not found/expired/invalid
   */
  static async getSecure<T>(
    key: string,
    useSessionStorage: boolean = false
  ): Promise<T | null> {
    try {
      const storage = useSessionStorage ? sessionStorage : localStorage;
      const encrypted = storage.getItem(key);

      if (!encrypted) {
        return null;
      }

      const decrypted = await this.decrypt(encrypted);
      const item: SecureStorageItem<T> = JSON.parse(decrypted);

      // Validate version
      if (item.version !== STORAGE_CONFIG.ENCRYPTION_VERSION) {
        console.warn('[SecureStorage] Version mismatch, removing old data');
        this.removeSecure(key, useSessionStorage);
        return null;
      }

      // Validate TTL
      const age = Date.now() - item.timestamp;
      if (age > item.ttl) {
        console.warn('[SecureStorage] Item expired, removing');
        this.removeSecure(key, useSessionStorage);
        return null;
      }

      return item.data;
    } catch (error) {
      console.error('[SecureStorage] Failed to get item:', error);
      // Remove corrupted data
      this.removeSecure(key, useSessionStorage);
      return null;
    }
  }

  /**
   * Remove item from secure storage
   */
  static removeSecure(key: string, useSessionStorage: boolean = false): void {
    const storage = useSessionStorage ? sessionStorage : localStorage;
    storage.removeItem(key);
  }

  /**
   * Clear all secure storage
   * Also removes session encryption key
   */
  static clearAll(): void {
    localStorage.clear();
    sessionStorage.clear();
  }

  /**
   * Get storage size in bytes (approximate)
   */
  static getStorageSize(): { localStorage: number; sessionStorage: number } {
    let localSize = 0;
    let sessionSize = 0;

    // Calculate localStorage size
    for (let key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        localSize += localStorage[key].length + key.length;
      }
    }

    // Calculate sessionStorage size
    for (let key in sessionStorage) {
      if (sessionStorage.hasOwnProperty(key)) {
        sessionSize += sessionStorage[key].length + key.length;
      }
    }

    return {
      localStorage: localSize,
      sessionStorage: sessionSize
    };
  }
}

/**
 * Sanitize notification for storage
 * Remove sensitive content, keep only IDs and metadata
 *
 * This prevents storing:
 * - Message content (PII)
 * - Sender information (PII)
 * - Conversation details (sensitive)
 */
export function sanitizeNotificationForStorage(notification: any): any {
  if (!notification) return null;

  return {
    id: notification.id,
    type: notification.type,
    isRead: notification.isRead,
    priority: notification.priority,
    createdAt: notification.createdAt,

    // Only store IDs for reference
    context: notification.context ? {
      conversationId: notification.context.conversationId,
      messageId: notification.context.messageId,
      userId: notification.context.userId
    } : undefined,

    // Remove ALL sensitive fields:
    // - title (may contain private info)
    // - content (contains message content)
    // - messagePreview (contains message content)
    // - sender info (PII)
    // - attachments (file info)
  };
}

/**
 * Sanitize array of notifications for storage
 */
export function sanitizeNotificationsForStorage(notifications: any[]): any[] {
  return notifications
    .filter(n => n != null)
    .map(sanitizeNotificationForStorage)
    .filter(n => n != null);
}
