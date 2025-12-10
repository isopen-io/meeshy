/**
 * IndexedDB Key Storage Adapter
 *
 * Implementation of KeyStorageAdapter interface using browser IndexedDB.
 * Provides persistent, secure storage for encryption keys in the browser.
 */

import type { KeyStorageAdapter } from '@meeshy/shared/encryption/encryption-service';
import type { EncryptionMode } from '@meeshy/shared/types/encryption';

const DB_NAME = 'meeshy_encryption';
const DB_VERSION = 1;
const KEYS_STORE = 'encryption_keys';
const CONVERSATIONS_STORE = 'conversation_keys';
const USER_KEYS_STORE = 'user_keys';

interface StoredKey {
  id: string;
  keyData: string; // Base64 encoded key
  algorithm: 'aes-256-gcm' | 'ecdh-p256';
  createdAt: number;
  conversationId?: string;
  userId?: string;
}

interface ConversationKeyMapping {
  conversationId: string;
  keyId: string;
  mode: EncryptionMode;
  createdAt: number;
}

interface UserSignalKeys {
  userId: string;
  publicKey: string;
  privateKey: string; // Encrypted
  registrationId: number;
  identityKey: string;
  preKeyBundleVersion: number;
  createdAt: number;
}

/**
 * IndexedDB Key Storage Adapter
 *
 * Implements KeyStorageAdapter interface for browser-based key storage.
 */
export class IndexedDBKeyStorageAdapter implements KeyStorageAdapter {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize IndexedDB
   */
  private async init(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('Failed to open IndexedDB:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('[IndexedDB] Opened successfully');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create object stores if they don't exist
        if (!db.objectStoreNames.contains(KEYS_STORE)) {
          const keysStore = db.createObjectStore(KEYS_STORE, { keyPath: 'id' });
          keysStore.createIndex('conversationId', 'conversationId', {
            unique: false,
          });
          keysStore.createIndex('userId', 'userId', { unique: false });
        }

        if (!db.objectStoreNames.contains(CONVERSATIONS_STORE)) {
          const convsStore = db.createObjectStore(CONVERSATIONS_STORE, {
            keyPath: 'conversationId',
          });
          convsStore.createIndex('keyId', 'keyId', { unique: false });
        }

        if (!db.objectStoreNames.contains(USER_KEYS_STORE)) {
          db.createObjectStore(USER_KEYS_STORE, { keyPath: 'userId' });
        }

        console.log('[IndexedDB] Schema upgraded');
      };
    });

    return this.initPromise;
  }

  /**
   * Store an encryption key
   */
  async storeKey(
    keyId: string,
    keyData: string,
    conversationId?: string,
    userId?: string
  ): Promise<void> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    const storedKey: StoredKey = {
      id: keyId,
      keyData,
      algorithm: 'aes-256-gcm',
      createdAt: Date.now(),
      conversationId,
      userId,
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([KEYS_STORE], 'readwrite');
      const store = transaction.objectStore(KEYS_STORE);
      const request = store.put(storedKey);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Retrieve an encryption key
   */
  async getKey(keyId: string): Promise<string | null> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([KEYS_STORE], 'readonly');
      const store = transaction.objectStore(KEYS_STORE);
      const request = store.get(keyId);

      request.onsuccess = () => {
        const stored: StoredKey = request.result;
        resolve(stored?.keyData || null);
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Store conversation key mapping
   */
  async storeConversationKey(
    conversationId: string,
    keyId: string,
    mode: EncryptionMode
  ): Promise<void> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    const mapping: ConversationKeyMapping = {
      conversationId,
      keyId,
      mode,
      createdAt: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        [CONVERSATIONS_STORE],
        'readwrite'
      );
      const store = transaction.objectStore(CONVERSATIONS_STORE);
      const request = store.put(mapping);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get conversation key mapping
   */
  async getConversationKey(conversationId: string): Promise<{
    keyId: string;
    mode: EncryptionMode;
    createdAt: number;
  } | null> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        [CONVERSATIONS_STORE],
        'readonly'
      );
      const store = transaction.objectStore(CONVERSATIONS_STORE);
      const request = store.get(conversationId);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Store user Signal Protocol keys
   */
  async storeUserKeys(keys: {
    userId: string;
    publicKey: string;
    privateKey: string;
    registrationId: number;
    identityKey: string;
    preKeyBundleVersion: number;
    createdAt: number;
  }): Promise<void> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([USER_KEYS_STORE], 'readwrite');
      const store = transaction.objectStore(USER_KEYS_STORE);
      const request = store.put(keys);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get user Signal Protocol keys
   */
  async getUserKeys(userId: string): Promise<{
    userId: string;
    publicKey: string;
    privateKey: string;
    registrationId: number;
    identityKey: string;
    preKeyBundleVersion: number;
    createdAt: number;
  } | null> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([USER_KEYS_STORE], 'readonly');
      const store = transaction.objectStore(USER_KEYS_STORE);
      const request = store.get(userId);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clear all keys (for logout)
   */
  async clearAll(): Promise<void> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        [KEYS_STORE, CONVERSATIONS_STORE, USER_KEYS_STORE],
        'readwrite'
      );

      transaction.objectStore(KEYS_STORE).clear();
      transaction.objectStore(CONVERSATIONS_STORE).clear();
      transaction.objectStore(USER_KEYS_STORE).clear();

      transaction.oncomplete = () => {
        console.log('[IndexedDB] All encryption keys cleared');
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    });
  }

  /**
   * Export keys for backup (encrypted with password)
   */
  async exportKeys(password: string): Promise<string> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    // Get all keys
    const transaction = this.db.transaction(
      [KEYS_STORE, CONVERSATIONS_STORE, USER_KEYS_STORE],
      'readonly'
    );

    const keys = await new Promise<StoredKey[]>((resolve, reject) => {
      const request = transaction.objectStore(KEYS_STORE).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const conversations = await new Promise<ConversationKeyMapping[]>(
      (resolve, reject) => {
        const request = transaction.objectStore(CONVERSATIONS_STORE).getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }
    );

    const userKeys = await new Promise<UserSignalKeys[]>((resolve, reject) => {
      const request = transaction.objectStore(USER_KEYS_STORE).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const backup = {
      keys,
      conversations,
      userKeys,
      version: DB_VERSION,
      exportedAt: Date.now(),
    };

    // TODO: Encrypt backup with password using PBKDF2 + AES-GCM
    return btoa(JSON.stringify(backup));
  }

  /**
   * Import keys from backup
   */
  async importKeys(encryptedBackup: string, password: string): Promise<void> {
    // TODO: Decrypt backup with password
    const backup = JSON.parse(atob(encryptedBackup));

    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    const transaction = this.db.transaction(
      [KEYS_STORE, CONVERSATIONS_STORE, USER_KEYS_STORE],
      'readwrite'
    );

    // Import keys
    const keysStore = transaction.objectStore(KEYS_STORE);
    for (const key of backup.keys) {
      keysStore.put(key);
    }

    const convsStore = transaction.objectStore(CONVERSATIONS_STORE);
    for (const conv of backup.conversations) {
      convsStore.put(conv);
    }

    const userKeysStore = transaction.objectStore(USER_KEYS_STORE);
    for (const userKey of backup.userKeys) {
      userKeysStore.put(userKey);
    }

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => {
        console.log('[IndexedDB] Keys imported successfully');
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    });
  }
}

// Export singleton instance
export const indexedDBKeyStorageAdapter = new IndexedDBKeyStorageAdapter();
