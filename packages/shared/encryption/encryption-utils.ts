/**
 * Shared Encryption Utilities
 *
 * Platform-agnostic encryption logic that works on both backend and frontend.
 * Uses CryptoAdapter for platform-specific operations.
 */

import type {
  EncryptedPayload,
  EncryptionMetadata,
} from '../types/encryption';
import type { CryptoAdapter, CryptoKey } from './crypto-adapter';
import {
  uint8ArrayToBase64,
  base64ToUint8Array,
  stringToUint8Array,
  uint8ArrayToString,
} from './crypto-adapter';

const IV_LENGTH = 12; // bytes (96 bits)
// TAG_LENGTH = 16 bytes (128 bits) - handled by crypto adapter

/**
 * Encrypt content using AES-256-GCM
 */
export async function encryptContent(
  plaintext: string,
  key: CryptoKey,
  keyId: string,
  adapter: CryptoAdapter
): Promise<EncryptedPayload> {
  const iv = adapter.generateRandomBytes(IV_LENGTH);
  const plaintextBytes = stringToUint8Array(plaintext);

  const result = await adapter.encrypt(plaintextBytes, key, iv);

  const metadata: EncryptionMetadata = {
    mode: 'server', // Will be set correctly by caller
    protocol: 'aes-256-gcm',
    keyId,
    iv: uint8ArrayToBase64(result.iv),
    authTag: uint8ArrayToBase64(result.authTag),
  };

  return {
    ciphertext: uint8ArrayToBase64(result.ciphertext),
    metadata,
  };
}

/**
 * Decrypt content using AES-256-GCM
 */
export async function decryptContent(
  payload: EncryptedPayload,
  key: CryptoKey,
  adapter: CryptoAdapter
): Promise<string> {
  const { ciphertext, metadata } = payload;

  const ciphertextBytes = base64ToUint8Array(ciphertext);
  const authTagBytes = base64ToUint8Array(metadata.authTag);
  const ivBytes = base64ToUint8Array(metadata.iv);

  try {
    const decrypted = await adapter.decrypt(
      {
        ciphertext: ciphertextBytes,
        iv: ivBytes,
        authTag: authTagBytes,
      },
      key
    );

    return uint8ArrayToString(decrypted);
  } catch (error) {
    console.error('Decryption failed:', error);
    throw new Error(
      'Failed to decrypt message. The message may be corrupted or encrypted with a different key.'
    );
  }
}

/**
 * Generate a key ID
 */
export function generateKeyId(adapter: CryptoAdapter): string {
  const randomBytes = adapter.generateRandomBytes(16);
  return uint8ArrayToBase64(randomBytes);
}

/**
 * Generate Signal Protocol-style key pair (using ECDH)
 */
export async function generateSignalKeyPair(
  adapter: CryptoAdapter
): Promise<{
  publicKey: string;
  privateKey: string;
}> {
  const keyPair = await adapter.generateECDHKeyPair();

  const publicKeyBytes = await adapter.exportPublicKey(keyPair.publicKey);
  const privateKeyBytes = await adapter.exportPrivateKey(keyPair.privateKey);

  return {
    publicKey: uint8ArrayToBase64(publicKeyBytes),
    privateKey: uint8ArrayToBase64(privateKeyBytes),
  };
}

/**
 * Perform ECDH key agreement (simplified Signal Protocol)
 */
export async function performKeyAgreement(
  privateKeyData: string,
  publicKeyData: string,
  adapter: CryptoAdapter
): Promise<CryptoKey> {
  const privateKeyBytes = base64ToUint8Array(privateKeyData);
  const publicKeyBytes = base64ToUint8Array(publicKeyData);

  const privateKey = await adapter.importPrivateKey(privateKeyBytes);
  const publicKey = await adapter.importPublicKey(publicKeyBytes);

  return await adapter.deriveSharedSecret(privateKey, publicKey);
}

/**
 * Generate random registration ID for Signal Protocol
 */
export function generateRegistrationId(adapter: CryptoAdapter): number {
  const randomBytes = adapter.generateRandomBytes(4);
  const view = new DataView(randomBytes.buffer);
  return view.getUint32(0, false) & 0x3fff; // 14-bit number (0-16383)
}

/**
 * Export key to base64 string for storage
 */
export async function exportKeyToString(
  key: CryptoKey,
  adapter: CryptoAdapter
): Promise<string> {
  const keyBytes = await adapter.exportKey(key);
  return uint8ArrayToBase64(keyBytes);
}

/**
 * Import key from base64 string
 */
export async function importKeyFromString(
  keyData: string,
  adapter: CryptoAdapter
): Promise<CryptoKey> {
  const keyBytes = base64ToUint8Array(keyData);
  return await adapter.importKey(keyBytes);
}

/**
 * Derive a key from password using PBKDF2
 */
export async function deriveKeyFromPassword(
  password: string,
  salt: Uint8Array,
  iterations: number,
  adapter: CryptoAdapter
): Promise<CryptoKey> {
  return await adapter.deriveKeyFromPassword(password, salt, iterations);
}

/**
 * Validate encryption metadata
 */
export function validateMetadata(metadata: any): metadata is EncryptionMetadata {
  return (
    metadata &&
    typeof metadata === 'object' &&
    ['e2ee', 'server'].includes(metadata.mode) &&
    ['signal_v3', 'aes-256-gcm'].includes(metadata.protocol) &&
    typeof metadata.keyId === 'string' &&
    typeof metadata.iv === 'string' &&
    typeof metadata.authTag === 'string'
  );
}

/**
 * Prepare encrypted payload for storage
 * Separates ciphertext and metadata for database storage
 */
export function prepareForStorage(payload: EncryptedPayload): {
  encryptedContent: string;
  encryptionMetadata: Record<string, any>;
} {
  return {
    encryptedContent: payload.ciphertext,
    encryptionMetadata: payload.metadata,
  };
}

/**
 * Reconstruct encrypted payload from storage
 * Combines ciphertext and metadata from database
 */
export function reconstructPayload(
  encryptedContent: string,
  encryptionMetadata: any
): EncryptedPayload {
  if (!validateMetadata(encryptionMetadata)) {
    throw new Error('Invalid encryption metadata');
  }

  return {
    ciphertext: encryptedContent,
    metadata: encryptionMetadata,
  };
}
