/**
 * Frontend Encryption Module
 *
 * Uses shared encryption logic with browser-specific adapters (Web Crypto API + IndexedDB).
 */

import { SharedEncryptionService } from '@meeshy/shared/encryption';
import { webCryptoAdapter } from './adapters/web-crypto-adapter';
import { indexedDBKeyStorageAdapter } from './adapters/indexeddb-key-storage-adapter';

// Create frontend encryption service with browser adapters
const frontendEncryptionService = new SharedEncryptionService({
  cryptoAdapter: webCryptoAdapter,
  keyStorage: indexedDBKeyStorageAdapter,
});

// Export the configured service
export const encryptionService = frontendEncryptionService;
export { SharedEncryptionService as EncryptionService };

// Re-export adapters for advanced usage
export { webCryptoAdapter, indexedDBKeyStorageAdapter };

// Re-export shared types and utilities
export type {
  EncryptionMode,
  EncryptionProtocol,
  EncryptionPreference,
  EncryptedPayload,
  EncryptionMetadata,
  SignalKeyBundle,
  ServerEncryptionKey,
  EncryptionStatus,
} from '@meeshy/shared/types/encryption';

export {
  isMessageEncrypted,
  canAutoTranslate,
  getEncryptionStatus,
} from '@meeshy/shared/types/encryption';

export {
  prepareForStorage,
  reconstructPayload,
  validateMetadata,
} from '@meeshy/shared/encryption';
