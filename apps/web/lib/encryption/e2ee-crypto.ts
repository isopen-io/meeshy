/**
 * E2EE Crypto Bridge
 *
 * Bridges the SharedEncryptionService (which uses Web Crypto API via WebCryptoAdapter)
 * with the SocketIO EncryptionHandlers interface. Provides real AES-256-GCM encryption
 * for E2EE conversations.
 *
 * Key derivation: ECDH (P-256) via WebCryptoAdapter.deriveSharedSecret()
 * Symmetric encryption: AES-256-GCM with 96-bit random IV
 * Key storage: IndexedDB via IndexedDBKeyStorageAdapter
 */

import { SharedEncryptionService } from '@meeshy/shared/encryption';
import type { EncryptedPayload, EncryptionMode } from '@meeshy/shared/types/encryption';
import { webCryptoAdapter } from './adapters/web-crypto-adapter';
import { indexedDBKeyStorageAdapter } from './adapters/indexeddb-key-storage-adapter';
import type { EncryptionHandlers } from '@/services/socketio/types';

let serviceInstance: SharedEncryptionService | null = null;
let initializedUserId: string | null = null;

function getService(): SharedEncryptionService {
  if (!serviceInstance) {
    serviceInstance = new SharedEncryptionService({
      cryptoAdapter: webCryptoAdapter,
      keyStorage: indexedDBKeyStorageAdapter,
    });
  }
  return serviceInstance;
}

/**
 * Initialize E2EE for a user. Must be called after authentication.
 * Idempotent — safe to call multiple times for the same userId.
 */
async function initializeForUser(userId: string): Promise<void> {
  if (initializedUserId === userId) {
    return;
  }
  const service = getService();
  await service.initialize(userId);
  initializedUserId = userId;
}

/**
 * Encrypt content for a conversation.
 * Returns EncryptedPayload if the conversation has an encryption mode set,
 * or null if the conversation is plaintext.
 */
async function encrypt(content: string, conversationId: string): Promise<EncryptedPayload | null> {
  const service = getService();
  const mode = await service.getConversationMode(conversationId);
  if (!mode) {
    return null;
  }

  try {
    return await service.encryptMessage(content, conversationId, mode);
  } catch (error) {
    console.error('[E2EECrypto] Encryption failed:', error);
    return null;
  }
}

/**
 * Decrypt an encrypted payload.
 * Returns the plaintext content, or throws on failure.
 */
async function decrypt(payload: EncryptedPayload, senderUserId?: string): Promise<string> {
  const service = getService();
  return service.decryptMessage(payload, senderUserId);
}

/**
 * Get the encryption mode for a conversation.
 * Returns null for plaintext conversations.
 */
async function getConversationMode(conversationId: string): Promise<EncryptionMode | null> {
  const service = getService();
  return service.getConversationMode(conversationId);
}

/**
 * Clear all encryption state (call on logout).
 */
async function clearKeys(): Promise<void> {
  const service = getService();
  await service.clearKeys();
  initializedUserId = null;
}

/**
 * Build EncryptionHandlers for the SocketIO MessagingService.
 * These handlers use real AES-256-GCM encryption via the SharedEncryptionService.
 */
function createEncryptionHandlers(): EncryptionHandlers {
  return {
    encrypt,
    decrypt,
    getConversationMode,
  };
}

export const e2eeCrypto = {
  initializeForUser,
  encrypt,
  decrypt,
  getConversationMode,
  clearKeys,
  createEncryptionHandlers,
  getService,
};
