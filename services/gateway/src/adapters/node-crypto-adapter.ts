/**
 * Node.js Crypto Adapter
 *
 * Implementation of CryptoAdapter interface using Node.js crypto module.
 * Used by backend services.
 */

import * as crypto from 'crypto';
import type {
  CryptoAdapter,
  CryptoKey as SharedCryptoKey,
  EncryptionResult,
  DecryptionParams,
  KeyPair,
} from '@meeshy/shared/encryption/crypto-adapter';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits = 32 bytes
const IV_LENGTH = 12; // 96 bits = 12 bytes
const AUTH_TAG_LENGTH = 16; // 128 bits = 16 bytes

/**
 * Internal Node.js crypto key wrapper
 */
class NodeCryptoKey implements SharedCryptoKey {
  readonly type: 'secret' | 'public' | 'private';
  readonly algorithm: string;
  readonly extractable: boolean;
  readonly usages: readonly string[];

  // Internal Node.js representation
  private keyObject: crypto.KeyObject | Buffer;

  constructor(
    keyObject: crypto.KeyObject | Buffer,
    type: 'secret' | 'public' | 'private',
    algorithm: string,
    usages: string[]
  ) {
    this.keyObject = keyObject;
    this.type = type;
    this.algorithm = algorithm;
    this.extractable = true;
    this.usages = usages;
  }

  getKeyObject(): crypto.KeyObject | Buffer {
    return this.keyObject;
  }
}

/**
 * Node.js Crypto Adapter Implementation
 */
export class NodeCryptoAdapter implements CryptoAdapter {
  /**
   * Generate a random AES-256-GCM key
   */
  async generateEncryptionKey(): Promise<SharedCryptoKey> {
    const keyBuffer = crypto.randomBytes(KEY_LENGTH);
    return new NodeCryptoKey(keyBuffer, 'secret', ALGORITHM, [
      'encrypt',
      'decrypt',
    ]);
  }

  /**
   * Generate random bytes
   */
  generateRandomBytes(length: number): Uint8Array {
    return new Uint8Array(crypto.randomBytes(length));
  }

  /**
   * Encrypt data using AES-256-GCM
   */
  async encrypt(
    plaintext: Uint8Array,
    key: SharedCryptoKey,
    iv: Uint8Array
  ): Promise<EncryptionResult> {
    if (!(key instanceof NodeCryptoKey)) {
      throw new Error('Invalid key type for Node.js crypto adapter');
    }

    const keyBuffer = key.getKeyObject() as Buffer;
    const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });

    const ciphertext = Buffer.concat([
      cipher.update(Buffer.from(plaintext)),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    return {
      ciphertext: new Uint8Array(ciphertext),
      iv: new Uint8Array(iv),
      authTag: new Uint8Array(authTag),
    };
  }

  /**
   * Decrypt data using AES-256-GCM
   */
  async decrypt(
    params: DecryptionParams,
    key: SharedCryptoKey
  ): Promise<Uint8Array> {
    if (!(key instanceof NodeCryptoKey)) {
      throw new Error('Invalid key type for Node.js crypto adapter');
    }

    const keyBuffer = key.getKeyObject() as Buffer;
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      keyBuffer,
      Buffer.from(params.iv),
      {
        authTagLength: AUTH_TAG_LENGTH,
      }
    );

    decipher.setAuthTag(Buffer.from(params.authTag));

    try {
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(params.ciphertext)),
        decipher.final(),
      ]);

      return new Uint8Array(plaintext);
    } catch (error) {
      throw new Error('Decryption failed: ' + (error as Error).message);
    }
  }

  /**
   * Export key to raw bytes
   */
  async exportKey(key: SharedCryptoKey): Promise<Uint8Array> {
    if (!(key instanceof NodeCryptoKey)) {
      throw new Error('Invalid key type for Node.js crypto adapter');
    }

    const keyObject = key.getKeyObject();
    if (Buffer.isBuffer(keyObject)) {
      return new Uint8Array(keyObject);
    }

    // For KeyObject, export to buffer
    if (key.type === 'secret') {
      const exported = keyObject.export();
      return new Uint8Array(exported);
    } else if (key.type === 'public') {
      const exported = keyObject.export({ type: 'spki', format: 'der' });
      return new Uint8Array(exported);
    } else {
      const exported = keyObject.export({ type: 'pkcs8', format: 'der' });
      return new Uint8Array(exported);
    }
  }

  /**
   * Import key from raw bytes
   */
  async importKey(keyData: Uint8Array): Promise<SharedCryptoKey> {
    const keyBuffer = Buffer.from(keyData);
    return new NodeCryptoKey(keyBuffer, 'secret', ALGORITHM, [
      'encrypt',
      'decrypt',
    ]);
  }

  /**
   * Generate ECDH key pair
   */
  async generateECDHKeyPair(): Promise<KeyPair> {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
      namedCurve: 'prime256v1', // P-256 curve
    });

    return {
      publicKey: new NodeCryptoKey(publicKey, 'public', 'ECDH', []),
      privateKey: new NodeCryptoKey(privateKey, 'private', 'ECDH', [
        'deriveKey',
        'deriveBits',
      ]),
    };
  }

  /**
   * Export public key to bytes (SPKI format)
   */
  async exportPublicKey(key: SharedCryptoKey): Promise<Uint8Array> {
    if (!(key instanceof NodeCryptoKey)) {
      throw new Error('Invalid key type for Node.js crypto adapter');
    }

    const keyObject = key.getKeyObject() as crypto.KeyObject;
    const exported = keyObject.export({ type: 'spki', format: 'der' });
    return new Uint8Array(exported);
  }

  /**
   * Export private key to bytes (PKCS8 format)
   */
  async exportPrivateKey(key: SharedCryptoKey): Promise<Uint8Array> {
    if (!(key instanceof NodeCryptoKey)) {
      throw new Error('Invalid key type for Node.js crypto adapter');
    }

    const keyObject = key.getKeyObject() as crypto.KeyObject;
    const exported = keyObject.export({ type: 'pkcs8', format: 'der' });
    return new Uint8Array(exported);
  }

  /**
   * Import public key from bytes (SPKI format)
   */
  async importPublicKey(keyData: Uint8Array): Promise<SharedCryptoKey> {
    const keyObject = crypto.createPublicKey({
      key: Buffer.from(keyData),
      format: 'der',
      type: 'spki',
    });

    return new NodeCryptoKey(keyObject, 'public', 'ECDH', []);
  }

  /**
   * Import private key from bytes (PKCS8 format)
   */
  async importPrivateKey(keyData: Uint8Array): Promise<SharedCryptoKey> {
    const keyObject = crypto.createPrivateKey({
      key: Buffer.from(keyData),
      format: 'der',
      type: 'pkcs8',
    });

    return new NodeCryptoKey(keyObject, 'private', 'ECDH', [
      'deriveKey',
      'deriveBits',
    ]);
  }

  /**
   * Derive shared secret using ECDH
   */
  async deriveSharedSecret(
    privateKey: SharedCryptoKey,
    publicKey: SharedCryptoKey
  ): Promise<SharedCryptoKey> {
    if (
      !(privateKey instanceof NodeCryptoKey) ||
      !(publicKey instanceof NodeCryptoKey)
    ) {
      throw new Error('Invalid key type for Node.js crypto adapter');
    }

    const privateKeyObject = privateKey.getKeyObject() as crypto.KeyObject;
    const publicKeyObject = publicKey.getKeyObject() as crypto.KeyObject;

    // Perform ECDH key agreement
    const ecdh = crypto.createECDH('prime256v1');
    ecdh.setPrivateKey(
      privateKeyObject.export({ type: 'pkcs8', format: 'der' })
    );

    const publicKeyBuffer = publicKeyObject.export({
      type: 'spki',
      format: 'der',
    });

    // Extract raw public key from SPKI format
    // SPKI has a header, we need to extract the actual key data
    // For P-256, the public key is 65 bytes (0x04 + 32 bytes X + 32 bytes Y)
    const publicKeyPoint = publicKeyBuffer.slice(
      publicKeyBuffer.length - 65
    );

    const sharedSecret = ecdh.computeSecret(publicKeyPoint);

    // Derive AES key from shared secret using HKDF
    const aesKey = Buffer.from(
      crypto.hkdfSync(
        'sha256',
        sharedSecret,
        Buffer.alloc(0), // no salt
        Buffer.from('meeshy-e2ee'), // info
        KEY_LENGTH
      )
    );

    return new NodeCryptoKey(aesKey, 'secret', ALGORITHM, [
      'encrypt',
      'decrypt',
    ]);
  }

  /**
   * Derive key from password using PBKDF2
   */
  async deriveKeyFromPassword(
    password: string,
    salt: Uint8Array,
    iterations: number
  ): Promise<SharedCryptoKey> {
    return new Promise((resolve, reject) => {
      crypto.pbkdf2(
        password,
        Buffer.from(salt),
        iterations,
        KEY_LENGTH,
        'sha256',
        (err, derivedKey) => {
          if (err) {
            reject(err);
            return;
          }

          resolve(
            new NodeCryptoKey(derivedKey, 'secret', ALGORITHM, [
              'encrypt',
              'decrypt',
            ])
          );
        }
      );
    });
  }
}

// Export singleton instance
export const nodeCryptoAdapter = new NodeCryptoAdapter();
