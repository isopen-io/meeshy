/**
 * Tests for attachment-encryption module
 * Tests client-side attachment encryption/decryption
 */

// Mock Web Crypto API before imports
const mockCryptoKey = {
  type: 'secret',
  algorithm: { name: 'AES-GCM', length: 256 },
  extractable: true,
  usages: ['encrypt', 'decrypt'],
};

const mockGenerateKey = jest.fn().mockResolvedValue(mockCryptoKey);
const mockEncrypt = jest.fn().mockImplementation(async (algo, key, data) => {
  // Return data with 16 bytes added for auth tag simulation
  const inputArray = new Uint8Array(data);
  const result = new Uint8Array(inputArray.length + 16);
  result.set(inputArray);
  // Add mock auth tag
  for (let i = inputArray.length; i < result.length; i++) {
    result[i] = i % 256;
  }
  return result.buffer;
});
const mockDecrypt = jest.fn().mockImplementation(async (algo, key, data) => {
  // Remove the 16 bytes auth tag to return original data
  const inputArray = new Uint8Array(data);
  return inputArray.slice(0, inputArray.length - 16).buffer;
});
const mockExportKey = jest.fn().mockResolvedValue(new Uint8Array(32).buffer);
const mockImportKey = jest.fn().mockResolvedValue(mockCryptoKey);
const mockDigest = jest.fn().mockImplementation(async (algo, data) => {
  // Return a mock SHA-256 hash (32 bytes)
  const hash = new Uint8Array(32);
  const inputArray = new Uint8Array(data);
  // Simple hash simulation - sum of bytes mod 256 repeated
  let sum = 0;
  for (let i = 0; i < inputArray.length; i++) {
    sum = (sum + inputArray[i]) % 256;
  }
  for (let i = 0; i < 32; i++) {
    hash[i] = (sum + i) % 256;
  }
  return hash.buffer;
});

const mockSubtle = {
  generateKey: mockGenerateKey,
  encrypt: mockEncrypt,
  decrypt: mockDecrypt,
  exportKey: mockExportKey,
  importKey: mockImportKey,
  digest: mockDigest,
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

import {
  encryptAttachment,
  decryptAttachment,
  decryptThumbnail,
  downloadAndDecryptAttachment,
  createBlobUrl,
  revokeBlobUrl,
  isEncryptionSupported,
  prepareMetadataForTransmission,
  type ClientEncryptedAttachmentMetadata,
} from '../../../lib/encryption/attachment-encryption';

// Mock fetch for download tests
global.fetch = jest.fn();

// Mock URL for blob operations
const mockCreateObjectURL = jest.fn((blob) => `blob:mock-${Math.random()}`);
const mockRevokeObjectURL = jest.fn();

Object.defineProperty(global.URL, 'createObjectURL', {
  value: mockCreateObjectURL,
  writable: true,
});
Object.defineProperty(global.URL, 'revokeObjectURL', {
  value: mockRevokeObjectURL,
  writable: true,
});

// Helper to create File with proper arrayBuffer method (jsdom lacks it)
function createMockFile(content: string | Uint8Array, name: string, type: string): File {
  const data = typeof content === 'string' ? new TextEncoder().encode(content) : content;
  const blob = new Blob([data], { type });
  const file = new File([blob], name, { type });

  // Polyfill arrayBuffer for jsdom
  if (!file.arrayBuffer) {
    (file as any).arrayBuffer = () =>
      new Promise<ArrayBuffer>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as ArrayBuffer);
        reader.readAsArrayBuffer(blob);
      });
  }

  return file;
}

// Helper to create Blob with proper arrayBuffer method
function createMockBlob(content: string | Uint8Array, type: string): Blob {
  const data = typeof content === 'string' ? new TextEncoder().encode(content) : content;
  const blob = new Blob([data], { type });

  // Polyfill arrayBuffer for jsdom
  if (!blob.arrayBuffer) {
    (blob as any).arrayBuffer = () =>
      new Promise<ArrayBuffer>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as ArrayBuffer);
        reader.readAsArrayBuffer(blob);
      });
  }

  return blob;
}

// Helper to read any blob's content as ArrayBuffer (for jsdom compatibility)
async function readBlobAsArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

// Helper to read any blob's content as text (for jsdom compatibility)
async function readBlobAsText(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

describe('Attachment Encryption Module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Restore crypto mock for each test
    Object.defineProperty(global, 'crypto', {
      value: {
        subtle: mockSubtle,
        getRandomValues: mockGetRandomValues,
      },
      writable: true,
      configurable: true,
    });
  });

  afterAll(() => {
    // Restore original crypto
    Object.defineProperty(global, 'crypto', {
      value: originalCrypto,
      writable: true,
      configurable: true,
    });
  });

  describe('isEncryptionSupported', () => {
    it('should return true when crypto is available', () => {
      expect(isEncryptionSupported()).toBe(true);
    });

    it('should return false when crypto is undefined', () => {
      const savedCrypto = global.crypto;
      // @ts-ignore
      delete global.crypto;

      expect(isEncryptionSupported()).toBe(false);

      // @ts-ignore
      global.crypto = savedCrypto;
    });

    it('should return false when subtle is undefined', () => {
      const savedSubtle = (global.crypto as any).subtle;
      // @ts-ignore
      delete (global.crypto as any).subtle;

      expect(isEncryptionSupported()).toBe(false);

      // @ts-ignore
      (global.crypto as any).subtle = savedSubtle;
    });
  });

  describe('encryptAttachment', () => {
    it('should encrypt a file', async () => {
      const fileContent = new Uint8Array([1, 2, 3, 4, 5]);
      const file = createMockFile(fileContent, 'test.txt', 'text/plain');

      const result = await encryptAttachment(file, 'e2ee');

      expect(result).toHaveProperty('encryptedBlob');
      expect(result).toHaveProperty('metadata');
      expect(result.encryptedBlob).toBeInstanceOf(Blob);
    });

    it('should include all required metadata', async () => {
      const fileContent = new Uint8Array([1, 2, 3, 4, 5]);
      const file = createMockFile(fileContent, 'test.txt', 'text/plain');

      const result = await encryptAttachment(file, 'e2ee');

      expect(result.metadata).toHaveProperty('mode', 'e2ee');
      expect(result.metadata).toHaveProperty('algorithm', 'aes-256-gcm');
      expect(result.metadata).toHaveProperty('encryptionKey');
      expect(result.metadata).toHaveProperty('iv');
      expect(result.metadata).toHaveProperty('authTag');
      expect(result.metadata).toHaveProperty('originalSize');
      expect(result.metadata).toHaveProperty('encryptedSize');
      expect(result.metadata).toHaveProperty('mimeType');
      expect(result.metadata).toHaveProperty('originalHash');
      expect(result.metadata).toHaveProperty('encryptedHash');
    });

    it('should preserve MIME type in metadata', async () => {
      const file = createMockFile('test', 'test.txt', 'text/plain');

      const result = await encryptAttachment(file, 'e2ee');

      expect(result.metadata.mimeType).toBe('text/plain');
    });

    it('should handle different encryption modes', async () => {
      const file = createMockFile('test', 'test.txt', 'text/plain');

      const e2eeResult = await encryptAttachment(file, 'e2ee');
      const serverResult = await encryptAttachment(file, 'server');
      const hybridResult = await encryptAttachment(file, 'hybrid');

      expect(e2eeResult.metadata.mode).toBe('e2ee');
      expect(serverResult.metadata.mode).toBe('server');
      expect(hybridResult.metadata.mode).toBe('hybrid');
    });

    it('should encrypt thumbnail if provided', async () => {
      const file = createMockFile('test', 'test.jpg', 'image/jpeg');
      const thumbnail = createMockFile('thumb', 'thumb.jpg', 'image/jpeg');

      const result = await encryptAttachment(file, 'e2ee', thumbnail);

      expect(result.encryptedThumbnail).toBeDefined();
      expect(result.encryptedThumbnail?.blob).toBeInstanceOf(Blob);
      expect(result.encryptedThumbnail?.iv).toBeDefined();
      expect(result.encryptedThumbnail?.authTag).toBeDefined();
    });

    it('should use different IV for thumbnail', async () => {
      const file = createMockFile('test', 'test.jpg', 'image/jpeg');
      const thumbnail = createMockFile('thumb', 'thumb.jpg', 'image/jpeg');

      const result = await encryptAttachment(file, 'e2ee', thumbnail);

      expect(result.metadata.iv).not.toBe(result.encryptedThumbnail?.iv);
    });

    it('should handle empty file', async () => {
      const file = createMockFile(new Uint8Array(0), 'empty.txt', 'text/plain');

      const result = await encryptAttachment(file, 'e2ee');

      expect(result.metadata.originalSize).toBe(0);
    });

    it('should handle Blob input', async () => {
      const blob = createMockBlob('test content', 'text/plain');

      const result = await encryptAttachment(blob, 'e2ee');

      expect(result).toHaveProperty('encryptedBlob');
      expect(result.metadata.mimeType).toBe('application/octet-stream');
    });

    it('should compute correct original size', async () => {
      const content = 'Hello World!';
      const file = createMockFile(content, 'test.txt', 'text/plain');

      const result = await encryptAttachment(file, 'e2ee');

      expect(result.metadata.originalSize).toBe(content.length);
    });
  });

  describe('decryptAttachment', () => {
    it('should decrypt an encrypted attachment', async () => {
      const fileContent = new Uint8Array([1, 2, 3, 4, 5]);
      const file = createMockFile(fileContent, 'test.txt', 'text/plain');

      // First encrypt
      const encrypted = await encryptAttachment(file, 'e2ee');

      // Add arrayBuffer to encrypted blob for decryption
      const encryptedBlob = createMockBlob(
        new Uint8Array(await readBlobAsArrayBuffer(encrypted.encryptedBlob)),
        'application/octet-stream'
      );

      // Then decrypt
      const decrypted = await decryptAttachment(
        encryptedBlob,
        encrypted.metadata.encryptionKey,
        encrypted.metadata.iv,
        encrypted.metadata.authTag,
        encrypted.metadata.originalHash,
        'text/plain'
      );

      expect(decrypted.hashVerified).toBe(true);
      expect(decrypted.decryptedBlob).toBeInstanceOf(Blob);
    });

    it('should preserve MIME type', async () => {
      const file = createMockFile('test', 'test.txt', 'text/plain');
      const encrypted = await encryptAttachment(file, 'e2ee');

      const encryptedBlob = createMockBlob(
        new Uint8Array(await readBlobAsArrayBuffer(encrypted.encryptedBlob)),
        'application/octet-stream'
      );

      const decrypted = await decryptAttachment(
        encryptedBlob,
        encrypted.metadata.encryptionKey,
        encrypted.metadata.iv,
        encrypted.metadata.authTag,
        undefined,
        'text/plain'
      );

      expect(decrypted.decryptedBlob.type).toBe('text/plain');
    });

    it('should verify hash when provided', async () => {
      const file = createMockFile('test', 'test.txt', 'text/plain');
      const encrypted = await encryptAttachment(file, 'e2ee');

      const encryptedBlob = createMockBlob(
        new Uint8Array(await readBlobAsArrayBuffer(encrypted.encryptedBlob)),
        'application/octet-stream'
      );

      const decrypted = await decryptAttachment(
        encryptedBlob,
        encrypted.metadata.encryptionKey,
        encrypted.metadata.iv,
        encrypted.metadata.authTag,
        encrypted.metadata.originalHash
      );

      expect(decrypted.hashVerified).toBe(true);
      expect(decrypted.computedHash).toBe(encrypted.metadata.originalHash);
    });

    it('should fail hash verification for wrong hash', async () => {
      const file = createMockFile('test', 'test.txt', 'text/plain');
      const encrypted = await encryptAttachment(file, 'e2ee');

      const encryptedBlob = createMockBlob(
        new Uint8Array(await readBlobAsArrayBuffer(encrypted.encryptedBlob)),
        'application/octet-stream'
      );

      const decrypted = await decryptAttachment(
        encryptedBlob,
        encrypted.metadata.encryptionKey,
        encrypted.metadata.iv,
        encrypted.metadata.authTag,
        'wrong-hash-value'
      );

      expect(decrypted.hashVerified).toBe(false);
    });

    it('should pass verification when no hash provided', async () => {
      const file = createMockFile('test', 'test.txt', 'text/plain');
      const encrypted = await encryptAttachment(file, 'e2ee');

      const encryptedBlob = createMockBlob(
        new Uint8Array(await readBlobAsArrayBuffer(encrypted.encryptedBlob)),
        'application/octet-stream'
      );

      const decrypted = await decryptAttachment(
        encryptedBlob,
        encrypted.metadata.encryptionKey,
        encrypted.metadata.iv,
        encrypted.metadata.authTag
      );

      expect(decrypted.hashVerified).toBe(true);
    });

    it('should use default MIME type when not specified', async () => {
      const file = createMockFile('test', 'test.txt', 'text/plain');
      const encrypted = await encryptAttachment(file, 'e2ee');

      const encryptedBlob = createMockBlob(
        new Uint8Array(await readBlobAsArrayBuffer(encrypted.encryptedBlob)),
        'application/octet-stream'
      );

      const decrypted = await decryptAttachment(
        encryptedBlob,
        encrypted.metadata.encryptionKey,
        encrypted.metadata.iv,
        encrypted.metadata.authTag
      );

      expect(decrypted.decryptedBlob.type).toBe('application/octet-stream');
    });
  });

  describe('decryptThumbnail', () => {
    it('should decrypt a thumbnail', async () => {
      const file = createMockFile('main', 'test.jpg', 'image/jpeg');
      const thumbnail = createMockFile('thumb', 'thumb.jpg', 'image/jpeg');

      const encrypted = await encryptAttachment(file, 'e2ee', thumbnail);

      const encryptedThumbBlob = createMockBlob(
        new Uint8Array(await readBlobAsArrayBuffer(encrypted.encryptedThumbnail!.blob)),
        'application/octet-stream'
      );

      const decryptedThumb = await decryptThumbnail(
        encryptedThumbBlob,
        encrypted.metadata.encryptionKey,
        encrypted.encryptedThumbnail!.iv,
        encrypted.encryptedThumbnail!.authTag
      );

      expect(decryptedThumb).toBeInstanceOf(Blob);
      expect(decryptedThumb.type).toBe('image/jpeg');
    });
  });

  describe('downloadAndDecryptAttachment', () => {
    it('should download and decrypt attachment from URL', async () => {
      const file = createMockFile('test', 'test.txt', 'text/plain');
      const encrypted = await encryptAttachment(file, 'e2ee');

      const encryptedBlob = createMockBlob(
        new Uint8Array(await readBlobAsArrayBuffer(encrypted.encryptedBlob)),
        'application/octet-stream'
      );

      // Mock fetch to return encrypted blob
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(encryptedBlob),
      });

      const result = await downloadAndDecryptAttachment(
        'https://example.com/file.enc',
        encrypted.metadata.encryptionKey,
        encrypted.metadata.iv,
        encrypted.metadata.authTag,
        encrypted.metadata.originalHash,
        'text/plain'
      );

      expect(result.hashVerified).toBe(true);
      expect(result.decryptedBlob).toBeInstanceOf(Blob);
    });

    it('should throw error on failed download', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 404,
      });

      await expect(
        downloadAndDecryptAttachment(
          'https://example.com/file.enc',
          'key',
          'iv',
          'tag'
        )
      ).rejects.toThrow('Failed to download encrypted attachment: 404');
    });

    it('should pass URL to fetch', async () => {
      const file = createMockFile('test', 'test.txt', 'text/plain');
      const encrypted = await encryptAttachment(file, 'e2ee');

      const encryptedBlob = createMockBlob(
        new Uint8Array(await readBlobAsArrayBuffer(encrypted.encryptedBlob)),
        'application/octet-stream'
      );

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(encryptedBlob),
      });

      await downloadAndDecryptAttachment(
        'https://example.com/specific-file.enc',
        encrypted.metadata.encryptionKey,
        encrypted.metadata.iv,
        encrypted.metadata.authTag
      );

      expect(global.fetch).toHaveBeenCalledWith(
        'https://example.com/specific-file.enc'
      );
    });
  });

  describe('createBlobUrl', () => {
    it('should create object URL for blob', () => {
      const blob = new Blob(['test']);

      const url = createBlobUrl(blob);

      expect(mockCreateObjectURL).toHaveBeenCalledWith(blob);
      expect(url).toContain('blob:mock');
    });
  });

  describe('revokeBlobUrl', () => {
    it('should revoke object URL', () => {
      const url = 'blob:mock-123';

      revokeBlobUrl(url);

      expect(mockRevokeObjectURL).toHaveBeenCalledWith(url);
    });
  });

  describe('prepareMetadataForTransmission', () => {
    it('should separate encryption key from storage metadata', () => {
      const metadata: ClientEncryptedAttachmentMetadata = {
        mode: 'e2ee',
        algorithm: 'aes-256-gcm',
        encryptionKey: 'secret-key-base64',
        iv: 'iv-base64',
        authTag: 'tag-base64',
        originalSize: 100,
        encryptedSize: 116,
        mimeType: 'text/plain',
        originalHash: 'hash1',
        encryptedHash: 'hash2',
      };

      const result = prepareMetadataForTransmission(metadata);

      expect(result.encryptionKey).toBe('secret-key-base64');
      expect(result.storageMetadata).not.toHaveProperty('encryptionKey');
      expect(result.storageMetadata.iv).toBe('iv-base64');
      expect(result.storageMetadata.authTag).toBe('tag-base64');
    });

    it('should preserve all other metadata fields', () => {
      const metadata: ClientEncryptedAttachmentMetadata = {
        mode: 'e2ee',
        algorithm: 'aes-256-gcm',
        encryptionKey: 'key',
        iv: 'iv',
        authTag: 'tag',
        originalSize: 100,
        encryptedSize: 116,
        mimeType: 'image/jpeg',
        originalHash: 'hash1',
        encryptedHash: 'hash2',
      };

      const result = prepareMetadataForTransmission(metadata);

      expect(result.storageMetadata.mode).toBe('e2ee');
      expect(result.storageMetadata.algorithm).toBe('aes-256-gcm');
      expect(result.storageMetadata.originalSize).toBe(100);
      expect(result.storageMetadata.encryptedSize).toBe(116);
      expect(result.storageMetadata.mimeType).toBe('image/jpeg');
      expect(result.storageMetadata.originalHash).toBe('hash1');
      expect(result.storageMetadata.encryptedHash).toBe('hash2');
    });
  });

  describe('Round-trip encryption/decryption', () => {
    it('should preserve file content through encryption and decryption', async () => {
      const originalContent = 'Hello, this is a test file content!';
      const file = createMockFile(originalContent, 'test.txt', 'text/plain');

      // Encrypt
      const encrypted = await encryptAttachment(file, 'e2ee');

      const encryptedBlob = createMockBlob(
        new Uint8Array(await readBlobAsArrayBuffer(encrypted.encryptedBlob)),
        'application/octet-stream'
      );

      // Decrypt
      const decrypted = await decryptAttachment(
        encryptedBlob,
        encrypted.metadata.encryptionKey,
        encrypted.metadata.iv,
        encrypted.metadata.authTag,
        encrypted.metadata.originalHash,
        'text/plain'
      );

      // Read decrypted content
      const decryptedText = await readBlobAsText(decrypted.decryptedBlob);

      expect(decryptedText).toBe(originalContent);
      expect(decrypted.hashVerified).toBe(true);
    });

    it('should preserve binary file content', async () => {
      const originalContent = new Uint8Array([0, 1, 2, 3, 255, 254, 253]);
      const file = createMockFile(originalContent, 'test.bin', 'application/octet-stream');

      // Encrypt
      const encrypted = await encryptAttachment(file, 'e2ee');

      const encryptedBlob = createMockBlob(
        new Uint8Array(await readBlobAsArrayBuffer(encrypted.encryptedBlob)),
        'application/octet-stream'
      );

      // Decrypt
      const decrypted = await decryptAttachment(
        encryptedBlob,
        encrypted.metadata.encryptionKey,
        encrypted.metadata.iv,
        encrypted.metadata.authTag,
        encrypted.metadata.originalHash
      );

      // Read decrypted content
      const decryptedBuffer = await readBlobAsArrayBuffer(decrypted.decryptedBlob);
      const decryptedArray = new Uint8Array(decryptedBuffer);

      expect(decryptedArray).toEqual(originalContent);
    });
  });
});
