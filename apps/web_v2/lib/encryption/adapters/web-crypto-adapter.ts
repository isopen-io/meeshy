/**
 * Web Crypto Adapter
 *
 * Implementation of CryptoAdapter interface using Web Crypto API (SubtleCrypto).
 * Used by frontend/browser applications.
 */

import type {
  CryptoAdapter,
  CryptoKey as SharedCryptoKey,
  EncryptionResult,
  DecryptionParams,
  KeyPair,
} from '@meeshy/shared/encryption/crypto-adapter';

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256; // bits
const IV_LENGTH = 12; // bytes (96 bits)
const TAG_LENGTH = 128; // bits

/**
 * Web Crypto Key Wrapper
 */
class WebCryptoKey implements SharedCryptoKey {
  readonly type: 'secret' | 'public' | 'private';
  readonly algorithm: string;
  readonly extractable: boolean;
  readonly usages: readonly string[];

  // Internal Web Crypto API key
  private nativeKey: globalThis.CryptoKey;

  constructor(nativeKey: globalThis.CryptoKey) {
    this.nativeKey = nativeKey;
    this.type = nativeKey.type as 'secret' | 'public' | 'private';
    this.algorithm = typeof nativeKey.algorithm === 'object'
      ? (nativeKey.algorithm as any).name
      : nativeKey.algorithm;
    this.extractable = nativeKey.extractable;
    this.usages = nativeKey.usages;
  }

  getNativeKey(): globalThis.CryptoKey {
    return this.nativeKey;
  }
}

/**
 * Web Crypto Adapter Implementation
 */
export class WebCryptoAdapter implements CryptoAdapter {
  /**
   * Generate a random AES-256-GCM key
   */
  async generateEncryptionKey(): Promise<SharedCryptoKey> {
    const nativeKey = await crypto.subtle.generateKey(
      {
        name: ALGORITHM,
        length: KEY_LENGTH,
      },
      true, // extractable
      ['encrypt', 'decrypt']
    );

    return new WebCryptoKey(nativeKey);
  }

  /**
   * Generate random bytes
   */
  generateRandomBytes(length: number): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(length));
  }

  /**
   * Encrypt data using AES-256-GCM
   */
  async encrypt(
    plaintext: Uint8Array,
    key: SharedCryptoKey,
    iv: Uint8Array
  ): Promise<EncryptionResult> {
    if (!(key instanceof WebCryptoKey)) {
      throw new Error('Invalid key type for Web Crypto adapter');
    }

    const encrypted = await crypto.subtle.encrypt(
      {
        name: ALGORITHM,
        iv: iv as BufferSource,
        tagLength: TAG_LENGTH,
      },
      key.getNativeKey(),
      plaintext as BufferSource
    );

    // Web Crypto API returns ciphertext + auth tag concatenated
    const encryptedArray = new Uint8Array(encrypted);
    const tagLengthBytes = TAG_LENGTH / 8;
    const ciphertextLength = encryptedArray.length - tagLengthBytes;
    const ciphertext = encryptedArray.slice(0, ciphertextLength);
    const authTag = encryptedArray.slice(ciphertextLength);

    return {
      ciphertext,
      iv: new Uint8Array(iv),
      authTag,
    };
  }

  /**
   * Decrypt data using AES-256-GCM
   */
  async decrypt(
    params: DecryptionParams,
    key: SharedCryptoKey
  ): Promise<Uint8Array> {
    if (!(key instanceof WebCryptoKey)) {
      throw new Error('Invalid key type for Web Crypto adapter');
    }

    // Combine ciphertext and auth tag for Web Crypto API
    const encrypted = new Uint8Array(
      params.ciphertext.byteLength + params.authTag.byteLength
    );
    encrypted.set(params.ciphertext, 0);
    encrypted.set(params.authTag, params.ciphertext.byteLength);

    try {
      const decrypted = await crypto.subtle.decrypt(
        {
          name: ALGORITHM,
          iv: params.iv as BufferSource,
          tagLength: TAG_LENGTH,
        },
        key.getNativeKey(),
        encrypted as BufferSource
      );

      return new Uint8Array(decrypted);
    } catch (error) {
      throw new Error('Decryption failed: ' + (error as Error).message);
    }
  }

  /**
   * Export key to raw bytes
   */
  async exportKey(key: SharedCryptoKey): Promise<Uint8Array> {
    if (!(key instanceof WebCryptoKey)) {
      throw new Error('Invalid key type for Web Crypto adapter');
    }

    const exported = await crypto.subtle.exportKey('raw', key.getNativeKey());
    return new Uint8Array(exported);
  }

  /**
   * Import key from raw bytes
   */
  async importKey(keyData: Uint8Array): Promise<SharedCryptoKey> {
    const nativeKey = await crypto.subtle.importKey(
      'raw',
      keyData as BufferSource,
      {
        name: ALGORITHM,
        length: KEY_LENGTH,
      },
      true,
      ['encrypt', 'decrypt']
    );

    return new WebCryptoKey(nativeKey);
  }

  /**
   * Generate ECDH key pair
   */
  async generateECDHKeyPair(): Promise<KeyPair> {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'ECDH',
        namedCurve: 'P-256',
      },
      true,
      ['deriveKey', 'deriveBits']
    );

    return {
      publicKey: new WebCryptoKey(keyPair.publicKey),
      privateKey: new WebCryptoKey(keyPair.privateKey),
    };
  }

  /**
   * Export public key to bytes (SPKI format)
   */
  async exportPublicKey(key: SharedCryptoKey): Promise<Uint8Array> {
    if (!(key instanceof WebCryptoKey)) {
      throw new Error('Invalid key type for Web Crypto adapter');
    }

    const exported = await crypto.subtle.exportKey('spki', key.getNativeKey());
    return new Uint8Array(exported);
  }

  /**
   * Export private key to bytes (PKCS8 format)
   */
  async exportPrivateKey(key: SharedCryptoKey): Promise<Uint8Array> {
    if (!(key instanceof WebCryptoKey)) {
      throw new Error('Invalid key type for Web Crypto adapter');
    }

    const exported = await crypto.subtle.exportKey('pkcs8', key.getNativeKey());
    return new Uint8Array(exported);
  }

  /**
   * Import public key from bytes (SPKI format)
   */
  async importPublicKey(keyData: Uint8Array): Promise<SharedCryptoKey> {
    const nativeKey = await crypto.subtle.importKey(
      'spki',
      keyData as BufferSource,
      {
        name: 'ECDH',
        namedCurve: 'P-256',
      },
      true,
      []
    );

    return new WebCryptoKey(nativeKey);
  }

  /**
   * Import private key from bytes (PKCS8 format)
   */
  async importPrivateKey(keyData: Uint8Array): Promise<SharedCryptoKey> {
    const nativeKey = await crypto.subtle.importKey(
      'pkcs8',
      keyData as BufferSource,
      {
        name: 'ECDH',
        namedCurve: 'P-256',
      },
      true,
      ['deriveKey', 'deriveBits']
    );

    return new WebCryptoKey(nativeKey);
  }

  /**
   * Derive shared secret using ECDH
   */
  async deriveSharedSecret(
    privateKey: SharedCryptoKey,
    publicKey: SharedCryptoKey
  ): Promise<SharedCryptoKey> {
    if (
      !(privateKey instanceof WebCryptoKey) ||
      !(publicKey instanceof WebCryptoKey)
    ) {
      throw new Error('Invalid key type for Web Crypto adapter');
    }

    const sharedKey = await crypto.subtle.deriveKey(
      {
        name: 'ECDH',
        public: publicKey.getNativeKey(),
      },
      privateKey.getNativeKey(),
      {
        name: ALGORITHM,
        length: KEY_LENGTH,
      },
      true,
      ['encrypt', 'decrypt']
    );

    return new WebCryptoKey(sharedKey);
  }

  /**
   * Derive key from password using PBKDF2
   */
  async deriveKeyFromPassword(
    password: string,
    salt: Uint8Array,
    iterations: number
  ): Promise<SharedCryptoKey> {
    const encoder = new TextEncoder();
    const passwordBuffer = encoder.encode(password);

    // Import password as key material
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      passwordBuffer,
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    );

    // Derive actual encryption key
    const derivedKey = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt as BufferSource,
        iterations: iterations,
        hash: 'SHA-256',
      },
      keyMaterial,
      {
        name: ALGORITHM,
        length: KEY_LENGTH,
      },
      true,
      ['encrypt', 'decrypt']
    );

    return new WebCryptoKey(derivedKey);
  }
}

// Export singleton instance
export const webCryptoAdapter = new WebCryptoAdapter();
