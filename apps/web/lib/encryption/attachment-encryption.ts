/**
 * Attachment Encryption Utilities
 *
 * Client-side attachment encryption following the WhatsApp/Signal "encrypt-then-upload" pattern.
 * Uses Web Crypto API for AES-256-GCM encryption.
 *
 * Flow:
 * 1. Generate random AES-256 key per attachment
 * 2. Encrypt file with AES-256-GCM
 * 3. Compute SHA-256 hash for integrity
 * 4. Upload encrypted blob to storage
 * 5. Send (blob_url + key) via E2EE message channel
 */

import { webCryptoAdapter } from './adapters/web-crypto-adapter';
import type { EncryptionMode } from '@meeshy/shared/types/encryption';

// Constants
const IV_LENGTH = 12; // 96 bits for GCM

/**
 * Encrypted attachment metadata
 */
export interface ClientEncryptedAttachmentMetadata {
  mode: EncryptionMode;
  algorithm: 'aes-256-gcm';
  encryptionKey: string; // Base64 encoded
  iv: string; // Base64 encoded
  authTag: string; // Base64 encoded
  originalSize: number;
  encryptedSize: number;
  mimeType: string;
  originalHash: string; // SHA-256 hex
  encryptedHash: string; // SHA-256 hex
}

/**
 * Result of encrypting an attachment
 */
export interface EncryptAttachmentResult {
  encryptedBlob: Blob;
  metadata: ClientEncryptedAttachmentMetadata;
  encryptedThumbnail?: {
    blob: Blob;
    iv: string;
    authTag: string;
  };
}

/**
 * Result of decrypting an attachment
 */
export interface DecryptAttachmentResult {
  decryptedBlob: Blob;
  hashVerified: boolean;
  computedHash: string;
}

/**
 * Convert Uint8Array to base64 string
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert base64 string to Uint8Array
 */
function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Compute SHA-256 hash of a buffer
 */
async function computeHash(data: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Encrypt an attachment file (client-side)
 *
 * @param file The file to encrypt
 * @param mode The encryption mode (e2ee, server, hybrid)
 * @param thumbnailFile Optional thumbnail to encrypt with the same key
 * @returns Encrypted blob and metadata
 */
export async function encryptAttachment(
  file: File | Blob,
  mode: EncryptionMode,
  thumbnailFile?: File | Blob
): Promise<EncryptAttachmentResult> {
  // Read file as ArrayBuffer
  const fileBuffer = await file.arrayBuffer();
  const fileData = new Uint8Array(fileBuffer);

  // Generate random encryption key
  const key = await webCryptoAdapter.generateEncryptionKey();

  // Generate random IV
  const iv = webCryptoAdapter.generateRandomBytes(IV_LENGTH);

  // Compute original file hash
  const originalHash = await computeHash(fileBuffer);

  // Encrypt the file
  const encryptResult = await webCryptoAdapter.encrypt(fileData, key, iv);

  // Export key for metadata
  const keyData = await webCryptoAdapter.exportKey(key);

  // Create encrypted blob
  const encryptedBuffer = encryptResult.ciphertext;
  const encryptedBlob = new Blob([new Uint8Array(encryptedBuffer)], { type: 'application/octet-stream' });

  // Compute encrypted file hash
  const encryptedHash = await computeHash(new Uint8Array(encryptedBuffer).buffer as ArrayBuffer);

  // Determine MIME type
  const mimeType = file instanceof File ? file.type : 'application/octet-stream';

  // Build metadata
  const metadata: ClientEncryptedAttachmentMetadata = {
    mode,
    algorithm: 'aes-256-gcm',
    encryptionKey: uint8ArrayToBase64(keyData),
    iv: uint8ArrayToBase64(encryptResult.iv),
    authTag: uint8ArrayToBase64(encryptResult.authTag),
    originalSize: fileData.byteLength,
    encryptedSize: encryptedBuffer.byteLength,
    mimeType,
    originalHash,
    encryptedHash,
  };

  const result: EncryptAttachmentResult = {
    encryptedBlob,
    metadata,
  };

  // Encrypt thumbnail if provided
  if (thumbnailFile) {
    const thumbBuffer = await thumbnailFile.arrayBuffer();
    const thumbData = new Uint8Array(thumbBuffer);

    // Use same key but different IV
    const thumbIv = webCryptoAdapter.generateRandomBytes(IV_LENGTH);
    const thumbEncryptResult = await webCryptoAdapter.encrypt(thumbData, key, thumbIv);

    result.encryptedThumbnail = {
      blob: new Blob([new Uint8Array(thumbEncryptResult.ciphertext)], { type: 'application/octet-stream' }),
      iv: uint8ArrayToBase64(thumbEncryptResult.iv),
      authTag: uint8ArrayToBase64(thumbEncryptResult.authTag),
    };
  }

  return result;
}

/**
 * Decrypt an attachment file (client-side)
 *
 * @param encryptedBlob The encrypted blob to decrypt
 * @param encryptionKey Base64-encoded AES key
 * @param iv Base64-encoded IV
 * @param authTag Base64-encoded auth tag
 * @param expectedHash Optional expected hash for verification
 * @param mimeType Optional MIME type for the decrypted blob
 * @returns Decrypted blob and verification status
 */
export async function decryptAttachment(
  encryptedBlob: Blob,
  encryptionKey: string,
  iv: string,
  authTag: string,
  expectedHash?: string,
  mimeType?: string
): Promise<DecryptAttachmentResult> {
  // Read encrypted blob
  const encryptedBuffer = await encryptedBlob.arrayBuffer();
  const encryptedData = new Uint8Array(encryptedBuffer);

  // Import key
  const keyData = base64ToUint8Array(encryptionKey);
  const key = await webCryptoAdapter.importKey(keyData);

  // Parse IV and auth tag
  const ivData = base64ToUint8Array(iv);
  const authTagData = base64ToUint8Array(authTag);

  // Decrypt
  const decryptedData = await webCryptoAdapter.decrypt(
    {
      ciphertext: encryptedData,
      iv: ivData,
      authTag: authTagData,
    },
    key
  );

  // Compute hash of decrypted file
  const computedHash = await computeHash(new Uint8Array(decryptedData).buffer as ArrayBuffer);

  // Verify hash if expected hash provided
  const hashVerified = expectedHash ? computedHash === expectedHash : true;

  // Create decrypted blob
  const decryptedBlob = new Blob([new Uint8Array(decryptedData)], {
    type: mimeType || 'application/octet-stream',
  });

  return {
    decryptedBlob,
    hashVerified,
    computedHash,
  };
}

/**
 * Decrypt a thumbnail using the main attachment key
 *
 * @param encryptedThumbBlob The encrypted thumbnail blob
 * @param encryptionKey Base64-encoded AES key (same as main attachment)
 * @param iv Base64-encoded IV for the thumbnail
 * @param authTag Base64-encoded auth tag for the thumbnail
 * @returns Decrypted thumbnail blob
 */
export async function decryptThumbnail(
  encryptedThumbBlob: Blob,
  encryptionKey: string,
  iv: string,
  authTag: string
): Promise<Blob> {
  const result = await decryptAttachment(
    encryptedThumbBlob,
    encryptionKey,
    iv,
    authTag,
    undefined,
    'image/jpeg'
  );
  return result.decryptedBlob;
}

/**
 * Download and decrypt an attachment from a URL
 *
 * @param encryptedBlobUrl URL to the encrypted blob
 * @param encryptionKey Base64-encoded AES key
 * @param iv Base64-encoded IV
 * @param authTag Base64-encoded auth tag
 * @param expectedHash Optional expected hash for verification
 * @param mimeType Optional MIME type for the decrypted blob
 * @returns Decrypted blob and verification status
 */
export async function downloadAndDecryptAttachment(
  encryptedBlobUrl: string,
  encryptionKey: string,
  iv: string,
  authTag: string,
  expectedHash?: string,
  mimeType?: string
): Promise<DecryptAttachmentResult> {
  // Fetch encrypted blob
  const response = await fetch(encryptedBlobUrl);
  if (!response.ok) {
    throw new Error(`Failed to download encrypted attachment: ${response.status}`);
  }

  const encryptedBlob = await response.blob();

  // Decrypt and return
  return decryptAttachment(
    encryptedBlob,
    encryptionKey,
    iv,
    authTag,
    expectedHash,
    mimeType
  );
}

/**
 * Create an object URL for a decrypted blob
 * Remember to call URL.revokeObjectURL when done!
 *
 * @param blob The decrypted blob
 * @returns Object URL for the blob
 */
export function createBlobUrl(blob: Blob): string {
  return URL.createObjectURL(blob);
}

/**
 * Revoke an object URL created with createBlobUrl
 *
 * @param url The object URL to revoke
 */
export function revokeBlobUrl(url: string): void {
  URL.revokeObjectURL(url);
}

/**
 * Check if the browser supports the required encryption APIs
 *
 * @returns True if encryption is supported
 */
export function isEncryptionSupported(): boolean {
  return (
    typeof crypto !== 'undefined' &&
    typeof crypto.subtle !== 'undefined' &&
    typeof crypto.getRandomValues === 'function'
  );
}

/**
 * Prepare metadata for transmission over E2EE channel
 * Strips sensitive data that should only be sent via secure channel
 *
 * @param metadata Full metadata including encryption key
 * @returns Metadata without encryption key (for storage), and key separately
 */
export function prepareMetadataForTransmission(metadata: ClientEncryptedAttachmentMetadata): {
  storageMetadata: Omit<ClientEncryptedAttachmentMetadata, 'encryptionKey'>;
  encryptionKey: string;
} {
  const { encryptionKey, ...storageMetadata } = metadata;
  return {
    storageMetadata,
    encryptionKey,
  };
}
