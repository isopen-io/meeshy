/**
 * Tests for web-crypto-adapter module
 * Tests Web Crypto API wrapper for encryption operations
 */

// Setup complete Web Crypto API mock before imports
const mockKeyData: Map<CryptoKey, Uint8Array> = new Map();
let keyCounter = 0;

const createMockCryptoKey = (type: string, algorithm: string, extractable: boolean, usages: string[]): CryptoKey => {
  const key = {
    type,
    algorithm: { name: algorithm, length: algorithm === 'AES-GCM' ? 256 : undefined },
    extractable,
    usages,
  } as unknown as CryptoKey;

  // Store unique random data for this key
  const keyData = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    keyData[i] = (keyCounter * 7 + i * 13) % 256;
  }
  keyCounter++;
  mockKeyData.set(key, keyData);

  return key;
};

// Track ECDH key pair relationships
const keyPairRelationships: Map<CryptoKey, CryptoKey> = new Map();

const mockGenerateKey = jest.fn().mockImplementation(async (algorithm: any, extractable: boolean, usages: string[]) => {
  if (algorithm.name === 'AES-GCM') {
    return createMockCryptoKey('secret', 'AES-GCM', extractable, usages);
  } else if (algorithm.name === 'ECDH') {
    const publicKey = createMockCryptoKey('public', 'ECDH', extractable, []);
    const privateKey = createMockCryptoKey('private', 'ECDH', extractable, usages);

    // For ECDH, both keys in a pair should share data for proper shared secret derivation
    // Store relationship so we can compute shared secrets correctly
    keyPairRelationships.set(privateKey, publicKey);
    keyPairRelationships.set(publicKey, privateKey);

    return { publicKey, privateKey };
  }
  throw new Error(`Unsupported algorithm: ${algorithm.name}`);
});

const mockEncrypt = jest.fn().mockImplementation(async (algo: any, key: CryptoKey, data: ArrayBuffer) => {
  const inputArray = new Uint8Array(data);
  const result = new Uint8Array(inputArray.length + 16);
  // XOR with IV to simulate different ciphertext for different IVs
  const iv = new Uint8Array(algo.iv || new ArrayBuffer(12));
  for (let i = 0; i < inputArray.length; i++) {
    result[i] = inputArray[i] ^ iv[i % iv.length];
  }
  for (let i = inputArray.length; i < result.length; i++) {
    result[i] = (i + iv[0]) % 256;
  }
  return result.buffer;
});

const mockDecrypt = jest.fn().mockImplementation(async (algo: any, key: CryptoKey, data: ArrayBuffer) => {
  const inputArray = new Uint8Array(data);
  // Remove auth tag (last 16 bytes)
  const ciphertext = inputArray.slice(0, inputArray.length - 16);
  // XOR with IV to reverse encryption
  const iv = new Uint8Array(algo.iv || new ArrayBuffer(12));
  const result = new Uint8Array(ciphertext.length);
  for (let i = 0; i < ciphertext.length; i++) {
    result[i] = ciphertext[i] ^ iv[i % iv.length];
  }
  return result.buffer;
});

const mockExportKey = jest.fn().mockImplementation(async (format: string, key: CryptoKey) => {
  const keyData = mockKeyData.get(key);
  if (keyData) {
    return keyData.buffer;
  }
  return new Uint8Array(32).buffer;
});

// Store keys by hash for deterministic behavior
const importedKeyCache: Map<string, CryptoKey> = new Map();

const mockImportKey = jest.fn().mockImplementation(async (format: string, keyData: ArrayBuffer | string, algorithm: any, extractable: boolean, usages: string[]) => {
  const algoName = typeof algorithm === 'string' ? algorithm : algorithm.name;
  const type = algoName === 'AES-GCM' ? 'secret' : (format === 'spki' ? 'public' : (algoName === 'PBKDF2' ? 'secret' : 'private'));

  // Create a deterministic cache key based on inputs
  const inputArray = keyData instanceof ArrayBuffer ? new Uint8Array(keyData) : new TextEncoder().encode(keyData);
  const cacheKey = `${format}-${algoName}-${Array.from(inputArray).join(',')}`;

  if (importedKeyCache.has(cacheKey)) {
    return importedKeyCache.get(cacheKey)!;
  }

  const key = createMockCryptoKey(type, algoName, extractable, usages);
  // Store deterministic key data based on input
  const storedData = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    storedData[i] = inputArray[i % inputArray.length] ^ (i * 7);
  }
  mockKeyData.set(key, storedData);
  importedKeyCache.set(cacheKey, key);
  return key;
});

const mockDeriveBits = jest.fn().mockImplementation(async (algorithm: any, baseKey: CryptoKey, length: number) => {
  const result = new Uint8Array(length / 8);
  // For ECDH, combine both keys to get same result regardless of order
  const privateKeyData = mockKeyData.get(baseKey);
  const publicKeyData = algorithm.public ? mockKeyData.get(algorithm.public) : null;

  if (privateKeyData && publicKeyData) {
    // XOR and sort to ensure same result regardless of which key is private/public
    const combined = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      combined[i] = privateKeyData[i] ^ publicKeyData[i];
    }
    for (let i = 0; i < result.length; i++) {
      result[i] = combined[i % combined.length];
    }
  } else if (privateKeyData) {
    for (let i = 0; i < result.length; i++) {
      result[i] = privateKeyData[i % privateKeyData.length];
    }
  }
  return result.buffer;
});

const mockDigest = jest.fn().mockImplementation(async (algorithm: string, data: ArrayBuffer) => {
  const hash = new Uint8Array(32);
  const inputArray = new Uint8Array(data);
  let sum = 0;
  for (let i = 0; i < inputArray.length; i++) {
    sum = (sum + inputArray[i]) % 256;
  }
  for (let i = 0; i < 32; i++) {
    hash[i] = (sum + i) % 256;
  }
  return hash.buffer;
});

// Store derived keys by deterministic hash
const derivedKeyCache: Map<string, CryptoKey> = new Map();

const mockDeriveKey = jest.fn().mockImplementation(async (algorithm: any, baseKey: CryptoKey, derivedKeyAlgorithm: any, extractable: boolean, usages: string[]) => {
  // For ECDH, use key pair public keys for deterministic shared secret
  // The shared secret = f(AlicePrivate, BobPublic) = f(BobPrivate, AlicePublic)
  // We achieve this by using both key pair's public key data

  if (algorithm.name === 'ECDH') {
    // baseKey is the private key, algorithm.public is the other party's public key
    const myPrivateKey = baseKey;
    const theirPublicKey = algorithm.public;

    // Get my public key (the partner of my private key)
    const myPublicKey = keyPairRelationships.get(myPrivateKey);

    // Get key data
    const myPublicKeyData = myPublicKey ? mockKeyData.get(myPublicKey) : null;
    const theirPublicKeyData = mockKeyData.get(theirPublicKey);

    if (myPublicKeyData && theirPublicKeyData) {
      // Sort public key data to ensure same result regardless of which party initiates
      const sortedPublicKeys = [Array.from(myPublicKeyData), Array.from(theirPublicKeyData)].sort((a, b) => {
        for (let i = 0; i < a.length; i++) {
          if (a[i] !== b[i]) return a[i] - b[i];
        }
        return 0;
      });
      const cacheKey = `ECDH-${derivedKeyAlgorithm.name}-${sortedPublicKeys[0].join(',')}-${sortedPublicKeys[1].join(',')}`;

      if (derivedKeyCache.has(cacheKey)) {
        return derivedKeyCache.get(cacheKey)!;
      }

      const key = createMockCryptoKey('secret', derivedKeyAlgorithm.name, extractable, usages);

      // Derive data from both public keys (XOR to ensure same result)
      const derivedData = new Uint8Array(32);
      for (let i = 0; i < 32; i++) {
        derivedData[i] = myPublicKeyData[i] ^ theirPublicKeyData[i];
      }

      mockKeyData.set(key, derivedData);
      derivedKeyCache.set(cacheKey, key);
      return key;
    }
  }

  // For PBKDF2 and other algorithms
  const baseKeyData = mockKeyData.get(baseKey);
  let cacheKey = `${algorithm.name}-${derivedKeyAlgorithm.name}`;
  if (baseKeyData) {
    cacheKey += `-base:${Array.from(baseKeyData).join(',')}`;
  }
  if (algorithm.salt) {
    const saltArray = new Uint8Array(algorithm.salt);
    cacheKey += `-salt:${Array.from(saltArray).join(',')}`;
  }
  if (algorithm.iterations) {
    cacheKey += `-iter:${algorithm.iterations}`;
  }

  if (derivedKeyCache.has(cacheKey)) {
    return derivedKeyCache.get(cacheKey)!;
  }

  const key = createMockCryptoKey('secret', derivedKeyAlgorithm.name, extractable, usages);

  // Store deterministic key data based on inputs
  const derivedData = new Uint8Array(32);
  if (baseKeyData) {
    // For PBKDF2: combine with salt
    const saltArray = algorithm.salt ? new Uint8Array(algorithm.salt) : new Uint8Array(16);
    for (let i = 0; i < 32; i++) {
      derivedData[i] = baseKeyData[i] ^ saltArray[i % saltArray.length];
    }
  } else {
    for (let i = 0; i < 32; i++) {
      derivedData[i] = (keyCounter + i * 7) % 256;
    }
  }

  mockKeyData.set(key, derivedData);
  derivedKeyCache.set(cacheKey, key);
  return key;
});

const mockSubtle = {
  generateKey: mockGenerateKey,
  encrypt: mockEncrypt,
  decrypt: mockDecrypt,
  exportKey: mockExportKey,
  importKey: mockImportKey,
  deriveBits: mockDeriveBits,
  digest: mockDigest,
  deriveKey: mockDeriveKey,
};

const mockGetRandomValues = jest.fn().mockImplementation((array: Uint8Array) => {
  for (let i = 0; i < array.length; i++) {
    array[i] = Math.floor(Math.random() * 256);
  }
  return array;
});

// Store original crypto
const originalCrypto = global.crypto;

// Apply mock before imports
Object.defineProperty(global, 'crypto', {
  value: {
    subtle: mockSubtle,
    getRandomValues: mockGetRandomValues,
  },
  writable: true,
  configurable: true,
});

import { WebCryptoAdapter, webCryptoAdapter } from '../../../../lib/encryption/adapters/web-crypto-adapter';

describe('Web Crypto Adapter Module', () => {
  let adapter: WebCryptoAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    mockKeyData.clear();
    importedKeyCache.clear();
    derivedKeyCache.clear();
    keyPairRelationships.clear();
    keyCounter = 0;
    adapter = new WebCryptoAdapter();
  });

  afterAll(() => {
    Object.defineProperty(global, 'crypto', {
      value: originalCrypto,
      writable: true,
      configurable: true,
    });
  });

  describe('generateEncryptionKey', () => {
    it('should generate a valid encryption key', async () => {
      const key = await adapter.generateEncryptionKey();

      expect(key).toBeDefined();
      expect(key.type).toBe('secret');
      expect(key.algorithm).toBe('AES-GCM');
      expect(key.extractable).toBe(true);
      expect(key.usages).toContain('encrypt');
      expect(key.usages).toContain('decrypt');
    });

    it('should generate unique keys each time', async () => {
      const key1 = await adapter.generateEncryptionKey();
      const key2 = await adapter.generateEncryptionKey();

      const exported1 = await adapter.exportKey(key1);
      const exported2 = await adapter.exportKey(key2);

      expect(exported1).not.toEqual(exported2);
    });
  });

  describe('generateRandomBytes', () => {
    it('should generate random bytes of specified length', () => {
      const bytes = adapter.generateRandomBytes(16);

      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBe(16);
    });

    it('should generate different bytes each call', () => {
      const bytes1 = adapter.generateRandomBytes(16);
      const bytes2 = adapter.generateRandomBytes(16);

      // While technically possible to be equal, extremely unlikely
      expect(bytes1).not.toEqual(bytes2);
    });

    it('should handle various lengths', () => {
      expect(adapter.generateRandomBytes(12).length).toBe(12);
      expect(adapter.generateRandomBytes(32).length).toBe(32);
      expect(adapter.generateRandomBytes(64).length).toBe(64);
    });
  });

  describe('encrypt and decrypt', () => {
    it('should encrypt and decrypt data successfully', async () => {
      const key = await adapter.generateEncryptionKey();
      const iv = adapter.generateRandomBytes(12);
      const plaintext = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

      const encrypted = await adapter.encrypt(plaintext, key, iv);
      const decrypted = await adapter.decrypt(encrypted, key);

      expect(decrypted).toEqual(plaintext);
    });

    it('should return ciphertext, iv, and authTag', async () => {
      const key = await adapter.generateEncryptionKey();
      const iv = adapter.generateRandomBytes(12);
      const plaintext = new Uint8Array([1, 2, 3, 4, 5]);

      const result = await adapter.encrypt(plaintext, key, iv);

      expect(result).toHaveProperty('ciphertext');
      expect(result).toHaveProperty('iv');
      expect(result).toHaveProperty('authTag');
      expect(result.ciphertext).toBeInstanceOf(Uint8Array);
      expect(result.iv).toBeInstanceOf(Uint8Array);
      expect(result.authTag).toBeInstanceOf(Uint8Array);
    });

    it('should produce different ciphertext for same plaintext with different IVs', async () => {
      const key = await adapter.generateEncryptionKey();
      const iv1 = adapter.generateRandomBytes(12);
      const iv2 = adapter.generateRandomBytes(12);
      const plaintext = new Uint8Array([1, 2, 3, 4, 5]);

      const encrypted1 = await adapter.encrypt(plaintext, key, iv1);
      const encrypted2 = await adapter.encrypt(plaintext, key, iv2);

      expect(encrypted1.ciphertext).not.toEqual(encrypted2.ciphertext);
    });

    it('should throw error for invalid key type', async () => {
      const iv = adapter.generateRandomBytes(12);
      const plaintext = new Uint8Array([1, 2, 3]);
      const invalidKey = { type: 'invalid' };

      await expect(adapter.encrypt(plaintext, invalidKey as any, iv)).rejects.toThrow(
        'Invalid key type'
      );
    });

    it('should handle empty plaintext', async () => {
      const key = await adapter.generateEncryptionKey();
      const iv = adapter.generateRandomBytes(12);
      const plaintext = new Uint8Array(0);

      const encrypted = await adapter.encrypt(plaintext, key, iv);
      const decrypted = await adapter.decrypt(encrypted, key);

      expect(decrypted).toEqual(plaintext);
    });

    it('should handle large data', async () => {
      const key = await adapter.generateEncryptionKey();
      const iv = adapter.generateRandomBytes(12);
      const plaintext = adapter.generateRandomBytes(10000);

      const encrypted = await adapter.encrypt(plaintext, key, iv);
      const decrypted = await adapter.decrypt(encrypted, key);

      expect(decrypted).toEqual(plaintext);
    });
  });

  describe('exportKey and importKey', () => {
    it('should export key to raw bytes', async () => {
      const key = await adapter.generateEncryptionKey();
      const exported = await adapter.exportKey(key);

      expect(exported).toBeInstanceOf(Uint8Array);
      expect(exported.length).toBe(32); // 256 bits = 32 bytes
    });

    it('should import key from raw bytes', async () => {
      const key = await adapter.generateEncryptionKey();
      const exported = await adapter.exportKey(key);
      const imported = await adapter.importKey(exported);

      expect(imported).toBeDefined();
      expect(imported.type).toBe('secret');
      expect(imported.algorithm).toBe('AES-GCM');
    });

    it('should be able to use imported key for encryption', async () => {
      const originalKey = await adapter.generateEncryptionKey();
      const exported = await adapter.exportKey(originalKey);
      const importedKey = await adapter.importKey(exported);

      const iv = adapter.generateRandomBytes(12);
      const plaintext = new Uint8Array([1, 2, 3, 4, 5]);

      const encrypted = await adapter.encrypt(plaintext, importedKey, iv);
      const decrypted = await adapter.decrypt(encrypted, importedKey);

      expect(decrypted).toEqual(plaintext);
    });

    it('should throw error for invalid key type in exportKey', async () => {
      const invalidKey = { type: 'invalid' };

      await expect(adapter.exportKey(invalidKey as any)).rejects.toThrow(
        'Invalid key type'
      );
    });
  });

  describe('generateECDHKeyPair', () => {
    it('should generate a valid key pair', async () => {
      const keyPair = await adapter.generateECDHKeyPair();

      expect(keyPair).toHaveProperty('publicKey');
      expect(keyPair).toHaveProperty('privateKey');
      expect(keyPair.publicKey.type).toBe('public');
      expect(keyPair.privateKey.type).toBe('private');
    });
  });

  describe('exportPublicKey and importPublicKey', () => {
    it('should export public key to SPKI format', async () => {
      const keyPair = await adapter.generateECDHKeyPair();
      const exported = await adapter.exportPublicKey(keyPair.publicKey);

      expect(exported).toBeInstanceOf(Uint8Array);
      expect(exported.length).toBeGreaterThan(0);
    });

    it('should import public key from SPKI format', async () => {
      const keyPair = await adapter.generateECDHKeyPair();
      const exported = await adapter.exportPublicKey(keyPair.publicKey);
      const imported = await adapter.importPublicKey(exported);

      expect(imported.type).toBe('public');
    });

    it('should throw error for invalid key type in exportPublicKey', async () => {
      const invalidKey = { type: 'invalid' };

      await expect(adapter.exportPublicKey(invalidKey as any)).rejects.toThrow(
        'Invalid key type'
      );
    });
  });

  describe('exportPrivateKey and importPrivateKey', () => {
    it('should export private key to PKCS8 format', async () => {
      const keyPair = await adapter.generateECDHKeyPair();
      const exported = await adapter.exportPrivateKey(keyPair.privateKey);

      expect(exported).toBeInstanceOf(Uint8Array);
      expect(exported.length).toBeGreaterThan(0);
    });

    it('should import private key from PKCS8 format', async () => {
      const keyPair = await adapter.generateECDHKeyPair();
      const exported = await adapter.exportPrivateKey(keyPair.privateKey);
      const imported = await adapter.importPrivateKey(exported);

      expect(imported.type).toBe('private');
    });

    it('should throw error for invalid key type in exportPrivateKey', async () => {
      const invalidKey = { type: 'invalid' };

      await expect(adapter.exportPrivateKey(invalidKey as any)).rejects.toThrow(
        'Invalid key type'
      );
    });
  });

  describe('deriveSharedSecret', () => {
    it('should derive shared secret from ECDH key exchange', async () => {
      const aliceKeyPair = await adapter.generateECDHKeyPair();
      const bobKeyPair = await adapter.generateECDHKeyPair();

      const aliceShared = await adapter.deriveSharedSecret(
        aliceKeyPair.privateKey,
        bobKeyPair.publicKey
      );
      const bobShared = await adapter.deriveSharedSecret(
        bobKeyPair.privateKey,
        aliceKeyPair.publicKey
      );

      // Both should derive the same shared secret
      const aliceExported = await adapter.exportKey(aliceShared);
      const bobExported = await adapter.exportKey(bobShared);

      expect(aliceExported).toEqual(bobExported);
    });

    it('should produce usable encryption key', async () => {
      const aliceKeyPair = await adapter.generateECDHKeyPair();
      const bobKeyPair = await adapter.generateECDHKeyPair();

      const sharedKey = await adapter.deriveSharedSecret(
        aliceKeyPair.privateKey,
        bobKeyPair.publicKey
      );

      const iv = adapter.generateRandomBytes(12);
      const plaintext = new Uint8Array([1, 2, 3, 4, 5]);

      const encrypted = await adapter.encrypt(plaintext, sharedKey, iv);
      const decrypted = await adapter.decrypt(encrypted, sharedKey);

      expect(decrypted).toEqual(plaintext);
    });

    it('should throw error for invalid key types', async () => {
      const invalidPrivate = { type: 'invalid' };
      const invalidPublic = { type: 'invalid' };

      await expect(
        adapter.deriveSharedSecret(invalidPrivate as any, invalidPublic as any)
      ).rejects.toThrow('Invalid key type');
    });
  });

  describe('deriveKeyFromPassword', () => {
    it('should derive key from password', async () => {
      const password = 'test-password-123';
      const salt = adapter.generateRandomBytes(16);
      const iterations = 100000;

      const key = await adapter.deriveKeyFromPassword(password, salt, iterations);

      expect(key).toBeDefined();
      expect(key.type).toBe('secret');
      expect(key.algorithm).toBe('AES-GCM');
    });

    it('should produce same key for same password and salt', async () => {
      const password = 'test-password';
      const salt = adapter.generateRandomBytes(16);
      const iterations = 10000;

      const key1 = await adapter.deriveKeyFromPassword(password, salt, iterations);
      const key2 = await adapter.deriveKeyFromPassword(password, salt, iterations);

      const exported1 = await adapter.exportKey(key1);
      const exported2 = await adapter.exportKey(key2);

      expect(exported1).toEqual(exported2);
    });

    it('should produce different key for different passwords', async () => {
      const salt = adapter.generateRandomBytes(16);
      const iterations = 10000;

      const key1 = await adapter.deriveKeyFromPassword('password1', salt, iterations);
      const key2 = await adapter.deriveKeyFromPassword('password2', salt, iterations);

      const exported1 = await adapter.exportKey(key1);
      const exported2 = await adapter.exportKey(key2);

      expect(exported1).not.toEqual(exported2);
    });

    it('should produce different key for different salts', async () => {
      const password = 'test-password';
      const salt1 = adapter.generateRandomBytes(16);
      const salt2 = adapter.generateRandomBytes(16);
      const iterations = 10000;

      const key1 = await adapter.deriveKeyFromPassword(password, salt1, iterations);
      const key2 = await adapter.deriveKeyFromPassword(password, salt2, iterations);

      const exported1 = await adapter.exportKey(key1);
      const exported2 = await adapter.exportKey(key2);

      expect(exported1).not.toEqual(exported2);
    });

    it('should produce usable encryption key', async () => {
      const password = 'my-secret-password';
      const salt = adapter.generateRandomBytes(16);
      const key = await adapter.deriveKeyFromPassword(password, salt, 10000);

      const iv = adapter.generateRandomBytes(12);
      const plaintext = new Uint8Array([1, 2, 3, 4, 5]);

      const encrypted = await adapter.encrypt(plaintext, key, iv);
      const decrypted = await adapter.decrypt(encrypted, key);

      expect(decrypted).toEqual(plaintext);
    });
  });

  describe('Singleton instance', () => {
    it('should export a singleton instance', () => {
      expect(webCryptoAdapter).toBeDefined();
      expect(webCryptoAdapter).toBeInstanceOf(WebCryptoAdapter);
    });
  });
});
