/**
 * Tests for Encryption Utilities
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  encryptContent,
  decryptContent,
  generateKeyId,
  generateSignalKeyPair,
  performKeyAgreement,
  generateRegistrationId,
  exportKeyToString,
  importKeyFromString,
  deriveKeyFromPassword,
  validateMetadata,
  prepareForStorage,
  reconstructPayload,
} from '../encryption/encryption-utils';
import type { CryptoAdapter, CryptoKey, EncryptionResult } from '../encryption/crypto-adapter';
import type { EncryptedPayload, EncryptionMetadata } from '../types/encryption';

// Mock CryptoAdapter
function createMockCryptoAdapter(overrides: Partial<CryptoAdapter> = {}): CryptoAdapter {
  return {
    generateEncryptionKey: vi.fn().mockResolvedValue({ type: 'secret', algorithm: 'AES-GCM', extractable: true, usages: ['encrypt', 'decrypt'] }),
    generateRandomBytes: vi.fn((length: number) => new Uint8Array(length).fill(1)),
    encrypt: vi.fn().mockResolvedValue({
      ciphertext: new Uint8Array([1, 2, 3, 4]),
      iv: new Uint8Array([5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]),
      authTag: new Uint8Array([17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32]),
    } as EncryptionResult),
    decrypt: vi.fn().mockResolvedValue(new Uint8Array([72, 101, 108, 108, 111])), // "Hello"
    exportKey: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])),
    importKey: vi.fn().mockResolvedValue({ type: 'secret', algorithm: 'AES-GCM', extractable: true, usages: ['encrypt', 'decrypt'] }),
    generateECDHKeyPair: vi.fn().mockResolvedValue({
      publicKey: { type: 'public', algorithm: 'ECDH', extractable: true, usages: [] },
      privateKey: { type: 'private', algorithm: 'ECDH', extractable: true, usages: [] },
    }),
    exportPublicKey: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4])),
    exportPrivateKey: vi.fn().mockResolvedValue(new Uint8Array([5, 6, 7, 8])),
    importPublicKey: vi.fn().mockResolvedValue({ type: 'public', algorithm: 'ECDH', extractable: true, usages: [] }),
    importPrivateKey: vi.fn().mockResolvedValue({ type: 'private', algorithm: 'ECDH', extractable: true, usages: [] }),
    deriveSharedSecret: vi.fn().mockResolvedValue({ type: 'secret', algorithm: 'AES-GCM', extractable: true, usages: ['encrypt', 'decrypt'] }),
    deriveKeyFromPassword: vi.fn().mockResolvedValue({ type: 'secret', algorithm: 'AES-GCM', extractable: true, usages: ['encrypt', 'decrypt'] }),
    ...overrides,
  };
}

describe('encryptContent', () => {
  it('should encrypt plaintext and return payload', async () => {
    const adapter = createMockCryptoAdapter();
    const mockKey: CryptoKey = { type: 'secret', algorithm: 'AES-GCM', extractable: true, usages: ['encrypt'] };

    const result = await encryptContent('Hello World', mockKey, 'key-123', adapter);

    expect(result).toHaveProperty('ciphertext');
    expect(result).toHaveProperty('metadata');
    expect(result.metadata.keyId).toBe('key-123');
    expect(result.metadata.protocol).toBe('aes-256-gcm');
    expect(result.metadata.mode).toBe('server');
    expect(adapter.generateRandomBytes).toHaveBeenCalledWith(12); // IV length
    expect(adapter.encrypt).toHaveBeenCalled();
  });

  it('should generate unique IV for each encryption', async () => {
    const adapter = createMockCryptoAdapter();
    const mockKey: CryptoKey = { type: 'secret', algorithm: 'AES-GCM', extractable: true, usages: ['encrypt'] };

    await encryptContent('Test 1', mockKey, 'key-1', adapter);
    await encryptContent('Test 2', mockKey, 'key-2', adapter);

    expect(adapter.generateRandomBytes).toHaveBeenCalledTimes(2);
  });
});

describe('decryptContent', () => {
  it('should decrypt payload and return plaintext', async () => {
    const adapter = createMockCryptoAdapter();
    const mockKey: CryptoKey = { type: 'secret', algorithm: 'AES-GCM', extractable: true, usages: ['decrypt'] };
    const payload: EncryptedPayload = {
      ciphertext: 'AQIDBA==', // base64 of [1,2,3,4]
      metadata: {
        mode: 'server',
        protocol: 'aes-256-gcm',
        keyId: 'key-123',
        iv: 'BQYHCAkKCwwNDg8Q', // base64
        authTag: 'ERITFBUWFxgZGhscHR4fIA==', // base64
      },
    };

    const result = await decryptContent(payload, mockKey, adapter);

    expect(result).toBe('Hello');
    expect(adapter.decrypt).toHaveBeenCalled();
  });

  it('should throw error on decryption failure', async () => {
    const adapter = createMockCryptoAdapter({
      decrypt: vi.fn().mockRejectedValue(new Error('Decryption failed')),
    });
    const mockKey: CryptoKey = { type: 'secret', algorithm: 'AES-GCM', extractable: true, usages: ['decrypt'] };
    const payload: EncryptedPayload = {
      ciphertext: 'AQIDBA==',
      metadata: {
        mode: 'server',
        protocol: 'aes-256-gcm',
        keyId: 'key-123',
        iv: 'BQYHCAkKCwwNDg8Q',
        authTag: 'ERITFBUWFxgZGhscHR4fIA==',
      },
    };

    await expect(decryptContent(payload, mockKey, adapter)).rejects.toThrow('Failed to decrypt message');
  });
});

describe('generateKeyId', () => {
  it('should generate base64 key ID', () => {
    const adapter = createMockCryptoAdapter();
    const keyId = generateKeyId(adapter);

    expect(typeof keyId).toBe('string');
    expect(keyId.length).toBeGreaterThan(0);
    expect(adapter.generateRandomBytes).toHaveBeenCalledWith(16);
  });
});

describe('generateSignalKeyPair', () => {
  it('should generate public and private keys', async () => {
    const adapter = createMockCryptoAdapter();
    const result = await generateSignalKeyPair(adapter);

    expect(result).toHaveProperty('publicKey');
    expect(result).toHaveProperty('privateKey');
    expect(typeof result.publicKey).toBe('string');
    expect(typeof result.privateKey).toBe('string');
    expect(adapter.generateECDHKeyPair).toHaveBeenCalled();
    expect(adapter.exportPublicKey).toHaveBeenCalled();
    expect(adapter.exportPrivateKey).toHaveBeenCalled();
  });
});

describe('performKeyAgreement', () => {
  it('should derive shared secret from key pair', async () => {
    const adapter = createMockCryptoAdapter();
    const privateKeyBase64 = 'AQIDBA==';
    const publicKeyBase64 = 'BQYHCAkKCwwNDg8Q';

    const result = await performKeyAgreement(privateKeyBase64, publicKeyBase64, adapter);

    expect(result).toBeDefined();
    expect(adapter.importPrivateKey).toHaveBeenCalled();
    expect(adapter.importPublicKey).toHaveBeenCalled();
    expect(adapter.deriveSharedSecret).toHaveBeenCalled();
  });
});

describe('generateRegistrationId', () => {
  it('should generate 14-bit registration ID', () => {
    const adapter = createMockCryptoAdapter({
      generateRandomBytes: vi.fn().mockReturnValue(new Uint8Array([0xFF, 0xFF, 0xFF, 0xFF])),
    });

    const registrationId = generateRegistrationId(adapter);

    expect(registrationId).toBeGreaterThanOrEqual(0);
    expect(registrationId).toBeLessThanOrEqual(16383); // 2^14 - 1
    expect(adapter.generateRandomBytes).toHaveBeenCalledWith(4);
  });

  it('should generate different IDs for different random bytes', () => {
    const adapter1 = createMockCryptoAdapter({
      generateRandomBytes: vi.fn().mockReturnValue(new Uint8Array([0x00, 0x00, 0x00, 0x01])),
    });
    const adapter2 = createMockCryptoAdapter({
      generateRandomBytes: vi.fn().mockReturnValue(new Uint8Array([0x00, 0x00, 0x00, 0x02])),
    });

    const id1 = generateRegistrationId(adapter1);
    const id2 = generateRegistrationId(adapter2);

    expect(id1).not.toBe(id2);
  });
});

describe('exportKeyToString', () => {
  it('should export key to base64 string', async () => {
    const adapter = createMockCryptoAdapter();
    const mockKey: CryptoKey = { type: 'secret', algorithm: 'AES-GCM', extractable: true, usages: ['encrypt'] };

    const result = await exportKeyToString(mockKey, adapter);

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    expect(adapter.exportKey).toHaveBeenCalledWith(mockKey);
  });
});

describe('importKeyFromString', () => {
  it('should import key from base64 string', async () => {
    const adapter = createMockCryptoAdapter();
    const keyData = 'AQIDBAUGBwg='; // base64

    const result = await importKeyFromString(keyData, adapter);

    expect(result).toBeDefined();
    expect(result.type).toBe('secret');
    expect(adapter.importKey).toHaveBeenCalled();
  });
});

describe('deriveKeyFromPassword', () => {
  it('should derive key from password', async () => {
    const adapter = createMockCryptoAdapter();
    const salt = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

    const result = await deriveKeyFromPassword('password123', salt, 100000, adapter);

    expect(result).toBeDefined();
    expect(adapter.deriveKeyFromPassword).toHaveBeenCalledWith('password123', salt, 100000);
  });
});

describe('validateMetadata', () => {
  it('should return true for valid e2ee metadata', () => {
    const metadata: EncryptionMetadata = {
      mode: 'e2ee',
      protocol: 'signal_v3',
      keyId: 'key-123',
      iv: 'abc123',
      authTag: 'def456',
    };

    expect(validateMetadata(metadata)).toBe(true);
  });

  it('should return true for valid server metadata', () => {
    const metadata: EncryptionMetadata = {
      mode: 'server',
      protocol: 'aes-256-gcm',
      keyId: 'key-456',
      iv: 'xyz789',
      authTag: 'uvw012',
    };

    expect(validateMetadata(metadata)).toBe(true);
  });

  it('should return false for null', () => {
    expect(validateMetadata(null)).toBeFalsy();
  });

  it('should return false for undefined', () => {
    expect(validateMetadata(undefined)).toBeFalsy();
  });

  it('should return false for invalid mode', () => {
    const metadata = {
      mode: 'invalid',
      protocol: 'aes-256-gcm',
      keyId: 'key-123',
      iv: 'abc',
      authTag: 'def',
    };

    expect(validateMetadata(metadata)).toBe(false);
  });

  it('should return false for invalid protocol', () => {
    const metadata = {
      mode: 'server',
      protocol: 'invalid',
      keyId: 'key-123',
      iv: 'abc',
      authTag: 'def',
    };

    expect(validateMetadata(metadata)).toBe(false);
  });

  it('should return false for missing keyId', () => {
    const metadata = {
      mode: 'server',
      protocol: 'aes-256-gcm',
      iv: 'abc',
      authTag: 'def',
    };

    expect(validateMetadata(metadata)).toBe(false);
  });

  it('should return false for missing iv', () => {
    const metadata = {
      mode: 'server',
      protocol: 'aes-256-gcm',
      keyId: 'key-123',
      authTag: 'def',
    };

    expect(validateMetadata(metadata)).toBe(false);
  });

  it('should return false for missing authTag', () => {
    const metadata = {
      mode: 'server',
      protocol: 'aes-256-gcm',
      keyId: 'key-123',
      iv: 'abc',
    };

    expect(validateMetadata(metadata)).toBe(false);
  });

  it('should return false for non-object', () => {
    expect(validateMetadata('string')).toBe(false);
    expect(validateMetadata(123)).toBe(false);
    expect(validateMetadata([])).toBe(false);
  });
});

describe('prepareForStorage', () => {
  it('should separate ciphertext and metadata', () => {
    const payload: EncryptedPayload = {
      ciphertext: 'encrypted-content-base64',
      metadata: {
        mode: 'server',
        protocol: 'aes-256-gcm',
        keyId: 'key-123',
        iv: 'iv-base64',
        authTag: 'tag-base64',
      },
    };

    const result = prepareForStorage(payload);

    expect(result.encryptedContent).toBe('encrypted-content-base64');
    expect(result.encryptionMetadata).toEqual(payload.metadata);
  });
});

describe('reconstructPayload', () => {
  it('should reconstruct payload from storage', () => {
    const encryptedContent = 'encrypted-content-base64';
    const metadata: EncryptionMetadata = {
      mode: 'server',
      protocol: 'aes-256-gcm',
      keyId: 'key-123',
      iv: 'iv-base64',
      authTag: 'tag-base64',
    };

    const result = reconstructPayload(encryptedContent, metadata);

    expect(result.ciphertext).toBe(encryptedContent);
    expect(result.metadata).toEqual(metadata);
  });

  it('should throw error for invalid metadata', () => {
    const encryptedContent = 'encrypted-content';
    const invalidMetadata = { mode: 'invalid' };

    expect(() => reconstructPayload(encryptedContent, invalidMetadata)).toThrow('Invalid encryption metadata');
  });
});

describe('roundtrip storage', () => {
  it('should roundtrip through prepareForStorage and reconstructPayload', () => {
    const original: EncryptedPayload = {
      ciphertext: 'test-ciphertext',
      metadata: {
        mode: 'e2ee',
        protocol: 'signal_v3',
        keyId: 'key-abc',
        iv: 'iv-xyz',
        authTag: 'tag-123',
      },
    };

    const stored = prepareForStorage(original);
    const reconstructed = reconstructPayload(stored.encryptedContent, stored.encryptionMetadata);

    expect(reconstructed).toEqual(original);
  });
});
