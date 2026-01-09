/**
 * Encryption Types - Shared between Gateway and Frontend
 *
 * Supports three encryption modes:
 * - E2EE: True end-to-end encryption (Signal Protocol) - NO translation
 * - Server: Server-encrypted with translation support
 * - Hybrid: Double encryption (E2EE + server layer) - translation supported
 */

export type EncryptionMode = 'e2ee' | 'server' | 'hybrid' | null;
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
 * Hybrid encrypted payload structure
 * Double encryption: E2EE envelope + Server-accessible content
 *
 * This allows:
 * - Full E2EE protection (only sender/recipient can decrypt the E2EE layer)
 * - Server-side translation (server can decrypt the server layer)
 */
export interface HybridEncryptedPayload {
  /** E2EE layer - only sender/recipient can decrypt (client-side Signal Protocol) */
  e2ee: {
    ciphertext: string;              // Base64-encoded Signal Protocol ciphertext
    type: number;                    // Signal message type (PreKey=1, Whisper=2, SenderKey=3)
    senderRegistrationId: number;
    recipientRegistrationId: number;
  };
  /** Server layer - server can decrypt for translation (AES-256-GCM) */
  server: {
    ciphertext: string;              // Base64-encoded AES ciphertext
    iv: string;                      // Base64-encoded IV
    authTag: string;                 // Base64-encoded auth tag
    keyId: string;                   // Key identifier
  };
  /** Mode indicator */
  mode: 'hybrid';
  /** Whether translation is available */
  canTranslate: boolean;
  /** Timestamp */
  timestamp: number;
}

/**
 * Check if payload is a hybrid encrypted payload
 */
export function isHybridPayload(payload: unknown): payload is HybridEncryptedPayload {
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

  // Hybrid mode supports translation (server layer is accessible)
  if (conversation.encryptionMode === 'hybrid') {
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

// =====================================================
// ATTACHMENT ENCRYPTION TYPES
// =====================================================

/**
 * Encrypted attachment metadata
 * Following WhatsApp/Signal pattern: encrypt-then-upload
 */
export interface EncryptedAttachmentMetadata {
  /** Encryption mode used */
  mode: EncryptionMode;

  /** Algorithm used (always AES-256-GCM for attachments) */
  algorithm: 'aes-256-gcm';

  /** Base64-encoded AES-256 key (32 bytes) - sent via E2EE message channel */
  encryptionKey: string;

  /** Base64-encoded initialization vector (12 bytes) */
  iv: string;

  /** Base64-encoded authentication tag (16 bytes) */
  authTag: string;

  /** Base64-encoded HMAC-SHA256 for integrity verification */
  hmac: string;

  /** Original file size before encryption */
  originalSize: number;

  /** Encrypted file size */
  encryptedSize: number;

  /** Original MIME type */
  mimeType: string;

  /** SHA-256 hash of original file (for verification) */
  originalHash: string;

  /** SHA-256 hash of encrypted file */
  encryptedHash: string;
}

/**
 * Encrypted attachment payload
 * This is what gets stored in the database and sent to recipients
 */
export interface EncryptedAttachmentPayload {
  /** URL to the encrypted blob on server storage */
  encryptedBlobUrl: string;

  /** Encryption metadata (key is sent via E2EE channel, not stored with blob) */
  metadata: Omit<EncryptedAttachmentMetadata, 'encryptionKey'>;

  /** The encryption key - only included when sending via E2EE message */
  encryptionKey?: string;

  /** Thumbnail (also encrypted with same key if present) */
  encryptedThumbnailUrl?: string;

  /** Original filename (encrypted in metadata, decrypted client-side) */
  encryptedFilename?: string;
}

/**
 * Attachment encryption request
 */
export interface AttachmentEncryptionRequest {
  /** File buffer to encrypt */
  fileBuffer: Buffer;

  /** Original filename */
  filename: string;

  /** MIME type */
  mimeType: string;

  /** Encryption mode */
  mode: EncryptionMode;

  /** Optional: existing key for hybrid mode server layer */
  serverKeyId?: string;
}

/**
 * Attachment encryption result
 */
export interface AttachmentEncryptionResult {
  /** Encrypted file buffer */
  encryptedBuffer: Buffer;

  /** Encryption metadata */
  metadata: EncryptedAttachmentMetadata;

  /** Encrypted thumbnail buffer (if applicable) */
  encryptedThumbnail?: Buffer;
}

/**
 * Attachment decryption request
 */
export interface AttachmentDecryptionRequest {
  /** Encrypted file buffer */
  encryptedBuffer: Buffer;

  /** Encryption metadata including key */
  metadata: EncryptedAttachmentMetadata;
}

/**
 * Attachment decryption result
 */
export interface AttachmentDecryptionResult {
  /** Decrypted file buffer */
  decryptedBuffer: Buffer;

  /** Verified original hash matches */
  hashVerified: boolean;

  /** Original filename */
  filename: string;

  /** Original MIME type */
  mimeType: string;
}

/**
 * Hybrid attachment payload for server-translatable audio/media
 * Used when encryption mode is 'hybrid' and translation is needed
 */
export interface HybridAttachmentPayload {
  /** E2EE encrypted attachment (only sender/recipient can decrypt) */
  e2ee: EncryptedAttachmentPayload;

  /** Server-accessible copy for translation (only for audio/translatable content) */
  server?: {
    /** Server-encrypted audio for translation service */
    encryptedBlobUrl: string;
    /** Server key ID for decryption */
    keyId: string;
    /** IV for server decryption */
    iv: string;
    /** Auth tag for server decryption */
    authTag: string;
    /** Transcription (if audio was transcribed) */
    transcription?: string;
    /** Translations keyed by language code */
    translations?: Record<string, {
      text: string;
      audioUrl?: string;
    }>;
  };

  /** Mode indicator */
  mode: 'hybrid';

  /** Whether translation is available for this attachment */
  canTranslate: boolean;

  /** Attachment type */
  attachmentType: 'audio' | 'image' | 'video' | 'document';
}

/**
 * Check if attachment should be encrypted based on conversation settings
 */
export function shouldEncryptAttachment(conversation: {
  encryptionEnabledAt: Date | null;
  encryptionMode: EncryptionMode | null;
}): boolean {
  return !!conversation.encryptionEnabledAt && conversation.encryptionMode !== null;
}

/**
 * Check if attachment can be translated (audio only in hybrid mode)
 */
export function canTranslateAttachment(
  attachmentType: string,
  conversation: {
    encryptionMode: EncryptionMode | null;
  }
): boolean {
  // Only audio attachments can be translated
  if (attachmentType !== 'audio') {
    return false;
  }

  // E2EE mode: no translation
  if (conversation.encryptionMode === 'e2ee') {
    return false;
  }

  // Server or hybrid mode: translation supported
  return conversation.encryptionMode === 'server' || conversation.encryptionMode === 'hybrid';
}
