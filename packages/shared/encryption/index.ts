/**
 * Shared Encryption Module
 *
 * Platform-agnostic encryption utilities that work on both backend and frontend.
 */

// Export core service and interfaces
export { SharedEncryptionService } from './encryption-service';
export type {
  EncryptionServiceConfig,
  KeyStorageAdapter,
} from './encryption-service';

// Export crypto adapter interface
export type {
  CryptoAdapter,
  CryptoKey,
  EncryptionResult,
  DecryptionParams,
  KeyPair,
} from './crypto-adapter';

// Export utility functions
export {
  encryptContent,
  decryptContent,
  generateSignalKeyPair,
  performKeyAgreement,
  generateKeyId,
  generateRegistrationId,
  exportKeyToString,
  importKeyFromString,
  deriveKeyFromPassword,
  validateMetadata,
  prepareForStorage,
  reconstructPayload,
} from './encryption-utils';

// Export helper functions
export {
  uint8ArrayToBase64,
  base64ToUint8Array,
  stringToUint8Array,
  uint8ArrayToString,
} from './crypto-adapter';

// Re-export types from shared types
export type {
  EncryptionMode,
  EncryptionProtocol,
  EncryptionPreference,
  EncryptedPayload,
  EncryptionMetadata,
  SignalKeyBundle,
  ServerEncryptionKey,
  EncryptionStatus,
} from '../types/encryption';

export {
  isMessageEncrypted,
  canAutoTranslate,
  getEncryptionStatus,
} from '../types/encryption';
