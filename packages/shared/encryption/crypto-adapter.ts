/**
 * Platform-Agnostic Crypto Adapter Interface
 *
 * Defines the interface that both Node.js and Web Crypto implementations must follow.
 * This allows sharing encryption logic between backend and frontend.
 */

export interface CryptoKey {
  // Platform-agnostic key representation
  readonly type: 'secret' | 'public' | 'private';
  readonly algorithm: string;
  readonly extractable: boolean;
  readonly usages: readonly string[];
}

export interface EncryptionResult {
  ciphertext: Uint8Array;
  iv: Uint8Array;
  authTag: Uint8Array;
}

export interface DecryptionParams {
  ciphertext: Uint8Array;
  iv: Uint8Array;
  authTag: Uint8Array;
}

export interface KeyPair {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}

/**
 * Crypto Adapter Interface
 *
 * Platform-specific implementations (Node.js crypto, Web Crypto API) must implement this interface.
 */
export interface CryptoAdapter {
  /**
   * Generate a random AES-256-GCM key
   */
  generateEncryptionKey(): Promise<CryptoKey>;

  /**
   * Generate random bytes (for IV, salt, etc.)
   */
  generateRandomBytes(length: number): Uint8Array;

  /**
   * Encrypt data using AES-256-GCM
   */
  encrypt(
    plaintext: Uint8Array,
    key: CryptoKey,
    iv: Uint8Array
  ): Promise<EncryptionResult>;

  /**
   * Decrypt data using AES-256-GCM
   */
  decrypt(
    params: DecryptionParams,
    key: CryptoKey
  ): Promise<Uint8Array>;

  /**
   * Export key to raw bytes
   */
  exportKey(key: CryptoKey): Promise<Uint8Array>;

  /**
   * Import key from raw bytes
   */
  importKey(keyData: Uint8Array): Promise<CryptoKey>;

  /**
   * Generate ECDH key pair for Signal Protocol
   */
  generateECDHKeyPair(): Promise<KeyPair>;

  /**
   * Export public key to bytes (SPKI format)
   */
  exportPublicKey(key: CryptoKey): Promise<Uint8Array>;

  /**
   * Export private key to bytes (PKCS8 format)
   */
  exportPrivateKey(key: CryptoKey): Promise<Uint8Array>;

  /**
   * Import public key from bytes (SPKI format)
   */
  importPublicKey(keyData: Uint8Array): Promise<CryptoKey>;

  /**
   * Import private key from bytes (PKCS8 format)
   */
  importPrivateKey(keyData: Uint8Array): Promise<CryptoKey>;

  /**
   * Perform ECDH key agreement to derive shared secret
   */
  deriveSharedSecret(
    privateKey: CryptoKey,
    publicKey: CryptoKey
  ): Promise<CryptoKey>;

  /**
   * Derive key from password using PBKDF2
   */
  deriveKeyFromPassword(
    password: string,
    salt: Uint8Array,
    iterations: number
  ): Promise<CryptoKey>;
}

/**
 * Helper: Convert Uint8Array to Base64
 */
export function uint8ArrayToBase64(buffer: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < buffer.byteLength; i++) {
    const byte = buffer[i];
    if (byte !== undefined) {
      binary += String.fromCharCode(byte);
    }
  }
  return btoa(binary);
}

/**
 * Helper: Convert Base64 to Uint8Array
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Helper: Convert string to Uint8Array
 */
export function stringToUint8Array(str: string): Uint8Array {
  const encoder = new TextEncoder();
  return encoder.encode(str);
}

/**
 * Helper: Convert Uint8Array to string
 */
export function uint8ArrayToString(buffer: Uint8Array): string {
  const decoder = new TextDecoder();
  return decoder.decode(buffer);
}
