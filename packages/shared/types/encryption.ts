/**
 * Encryption Types - Shared between Gateway and Frontend
 *
 * Supports two encryption modes:
 * - E2EE: True end-to-end encryption (Signal Protocol)
 * - Server: Server-encrypted with translation support
 */

export type EncryptionMode = 'e2ee' | 'server';
export type EncryptionProtocol = 'signal_v3' | 'aes-256-gcm';
export type EncryptionPreference = 'disabled' | 'optional' | 'always';

/**
 * Encryption metadata stored with each message
 */
export interface EncryptionMetadata {
  mode: EncryptionMode;
  protocol: EncryptionProtocol;
  keyId: string;
  iv: string;
  authTag: string;
  messageNumber?: number;      // For Signal Protocol ratcheting
  preKeyId?: number;           // For Signal Protocol key agreement
  messageType?: number;        // Signal Protocol message type (PreKey=3, Message=2)
  registrationId?: number;     // Signal Protocol registration ID
}

/**
 * Encrypted message payload
 */
export interface EncryptedPayload {
  ciphertext: string;      // Base64 encoded encrypted content
  metadata: EncryptionMetadata;
}

/**
 * Server encryption key (stored in vault)
 */
export interface ServerEncryptionKey {
  id: string;
  algorithm: 'aes-256-gcm';
  publicKey: string;       // Base64 encoded
  privateKey: string;      // Base64 encoded (only on server)
  createdAt: Date;
  rotatedAt?: Date;
  expiresAt?: Date;
}

/**
 * Signal Protocol key bundle (for E2EE mode)
 */
export interface SignalKeyBundle {
  identityKey: string;     // Base64 encoded public identity key
  signedPreKey: {
    keyId: number;
    publicKey: string;
    signature: string;
  };
  preKey?: {
    keyId: number;
    publicKey: string;
  };
  registrationId: number;
}

/**
 * Check if message is encrypted based on conversation and message type
 */
export function isMessageEncrypted(
  message: { messageType: string; createdAt: Date },
  conversation: { encryptionEnabledAt: Date | null }
): boolean {
  // System messages are NEVER encrypted
  if (message.messageType === 'system') {
    return false;
  }

  // Check conversation encryption
  if (!conversation.encryptionEnabledAt) {
    return false;
  }

  // Check if message was sent after encryption was enabled
  if (message.createdAt < conversation.encryptionEnabledAt) {
    return false;
  }

  return true;
}

/**
 * Check if conversation supports auto-translation
 */
export function canAutoTranslate(conversation: {
  encryptionEnabledAt: Date | null;
  encryptionMode: EncryptionMode | null;
}): boolean {
  // Plaintext conversations support translation
  if (!conversation.encryptionEnabledAt) {
    return true;
  }

  // Server-encrypted mode supports translation
  if (conversation.encryptionMode === 'server') {
    return true;
  }

  // E2EE mode does NOT support translation
  return false;
}

/**
 * Encryption status for display
 */
export interface EncryptionStatus {
  isEncrypted: boolean;
  mode: EncryptionMode | null;
  canTranslate: boolean;
  enabledAt: Date | null;
  enabledBy: string | null;
}

/**
 * Get encryption status for a conversation
 */
export function getEncryptionStatus(conversation: {
  encryptionEnabledAt: Date | null;
  encryptionMode: EncryptionMode | null;
  encryptionEnabledBy: string | null;
}): EncryptionStatus {
  return {
    isEncrypted: !!conversation.encryptionEnabledAt,
    mode: conversation.encryptionMode,
    canTranslate: canAutoTranslate(conversation),
    enabledAt: conversation.encryptionEnabledAt,
    enabledBy: conversation.encryptionEnabledBy,
  };
}
