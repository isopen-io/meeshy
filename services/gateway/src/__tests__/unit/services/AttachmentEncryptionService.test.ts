/**
 * Unit tests for AttachmentEncryptionService
 *
 * Covers:
 * - getMasterKey: env var, NODE_ENV=test fallback, missing key, wrong length
 * - encryptAttachment: all modes (e2ee/server/hybrid), validations, thumbnail
 * - decryptAttachment: round-trip, validation errors, hash verification
 * - decryptServerAttachment: key lookup success and missing key
 * - verifyHmac: valid, invalid, bad base64, length mismatch
 * - encryptMetadata / decryptMetadata: round-trip, invalid format
 * - generateServerKey / hasServerKey / deleteServerKey / cleanupExpiredKeys
 * - getStats
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: {
    child: () => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  },
}));

// ─── Imports ─────────────────────────────────────────────────────────────────

import { AttachmentEncryptionService, getAttachmentEncryptionService } from '../../../services/AttachmentEncryptionService';

// ─── Test master key (same as the code's test fallback) ─────────────────────
// "testkeyforcicdtestingonly32bytes" encoded as base64
const TEST_MASTER_KEY_B64 = 'dGVzdGtleWZvcmNpY2R0ZXN0aW5nb25seTMyYnl0ZXM=';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    serverEncryptionKey: {
      create: (jest.fn() as jest.Mock<any>).mockResolvedValue({}),
      findUnique: (jest.fn() as jest.Mock<any>).mockResolvedValue(null),
      update: (jest.fn() as jest.Mock<any>).mockResolvedValue({}),
      updateMany: (jest.fn() as jest.Mock<any>).mockResolvedValue({ count: 0 }),
      count: (jest.fn() as jest.Mock<any>).mockResolvedValue(0),
    },
    conversation: {
      findUnique: (jest.fn() as jest.Mock<any>).mockResolvedValue(null),
      update: (jest.fn() as jest.Mock<any>).mockResolvedValue({}),
    },
    ...overrides,
  } as any;
}

function makeFileBuffer(size = 1024): Buffer {
  const buf = Buffer.alloc(size);
  for (let i = 0; i < size; i++) buf[i] = i % 256;
  return buf;
}

// ─── Environment setup ────────────────────────────────────────────────────────

describe('AttachmentEncryptionService', () => {
  let originalNodeEnv: string | undefined;
  let originalMasterKey: string | undefined;

  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV;
    originalMasterKey = process.env.ATTACHMENT_MASTER_KEY;
    // Use NODE_ENV=test so getMasterKey uses the built-in test key
    process.env.NODE_ENV = 'test';
    delete process.env.ATTACHMENT_MASTER_KEY;
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (originalNodeEnv !== undefined) {
      process.env.NODE_ENV = originalNodeEnv;
    } else {
      delete process.env.NODE_ENV;
    }
    if (originalMasterKey !== undefined) {
      process.env.ATTACHMENT_MASTER_KEY = originalMasterKey;
    } else {
      delete process.env.ATTACHMENT_MASTER_KEY;
    }
  });

  // ─── encryptAttachment ────────────────────────────────────────────────────

  describe('encryptAttachment', () => {
    it('throws when fileBuffer is empty', async () => {
      const svc = new AttachmentEncryptionService(makePrisma());
      await expect(
        svc.encryptAttachment({ fileBuffer: Buffer.alloc(0), filename: 'f.bin', mimeType: 'application/octet-stream', mode: 'e2ee' })
      ).rejects.toThrow('File buffer is empty');
    });

    it('throws when fileBuffer is null-ish', async () => {
      const svc = new AttachmentEncryptionService(makePrisma());
      await expect(
        svc.encryptAttachment({ fileBuffer: null as unknown as Buffer, filename: 'f.bin', mimeType: 'application/octet-stream', mode: 'e2ee' })
      ).rejects.toThrow('File buffer is empty');
    });

    it('throws when mode is invalid', async () => {
      const svc = new AttachmentEncryptionService(makePrisma());
      await expect(
        svc.encryptAttachment({ fileBuffer: makeFileBuffer(), filename: 'f.bin', mimeType: 'application/octet-stream', mode: 'bad' as any })
      ).rejects.toThrow('Invalid encryption mode');
    });

    it('encrypts successfully in e2ee mode', async () => {
      const svc = new AttachmentEncryptionService(makePrisma());
      const fileBuffer = makeFileBuffer(512);

      const result = await svc.encryptAttachment({
        fileBuffer,
        filename: 'test.txt',
        mimeType: 'text/plain',
        mode: 'e2ee',
      });

      expect(result.encryptedBuffer).toBeInstanceOf(Buffer);
      expect(result.encryptedBuffer.length).toBeGreaterThan(0);
      expect(result.metadata.mode).toBe('e2ee');
      expect(result.metadata.algorithm).toBe('aes-256-gcm');
      expect(result.metadata.encryptionKey).toBeTruthy();
      expect(result.metadata.iv).toBeTruthy();
      expect(result.metadata.authTag).toBeTruthy();
      expect(result.metadata.hmac).toBeTruthy();
      expect(result.metadata.originalSize).toBe(512);
      expect(result.serverCopy).toBeUndefined();
      expect(result.encryptedThumbnail).toBeUndefined();
    });

    it('encrypts thumbnail when provided in e2ee mode', async () => {
      const svc = new AttachmentEncryptionService(makePrisma());
      const fileBuffer = makeFileBuffer(256);
      const thumbnailBuffer = makeFileBuffer(64);

      const result = await svc.encryptAttachment({
        fileBuffer,
        filename: 'img.jpg',
        mimeType: 'image/jpeg',
        mode: 'e2ee',
        thumbnailBuffer,
      });

      expect(result.encryptedThumbnail).toBeDefined();
      expect(result.encryptedThumbnail!.buffer).toBeInstanceOf(Buffer);
      expect(result.encryptedThumbnail!.iv).toBeTruthy();
      expect(result.encryptedThumbnail!.authTag).toBeTruthy();
    });

    it('throws when server mode used without conversationId', async () => {
      const svc = new AttachmentEncryptionService(makePrisma());
      await expect(
        svc.encryptAttachment({ fileBuffer: makeFileBuffer(), filename: 'f.bin', mimeType: 'application/octet-stream', mode: 'server' })
      ).rejects.toThrow('conversationId is required');
    });

    it('throws when hybrid mode used without conversationId', async () => {
      const svc = new AttachmentEncryptionService(makePrisma());
      await expect(
        svc.encryptAttachment({ fileBuffer: makeFileBuffer(), filename: 'f.bin', mimeType: 'application/octet-stream', mode: 'hybrid' })
      ).rejects.toThrow('conversationId is required');
    });

    it('throws when conversation not found in server mode', async () => {
      const prisma = makePrisma();
      (prisma.conversation.findUnique as jest.Mock<any>).mockResolvedValue(null);
      const svc = new AttachmentEncryptionService(prisma);

      await expect(
        svc.encryptAttachment({
          fileBuffer: makeFileBuffer(),
          filename: 'f.bin',
          mimeType: 'application/octet-stream',
          mode: 'server',
          conversationId: 'conv-000',
        })
      ).rejects.toThrow('Conversation conv-000 not found');
    });

    it('generates new server key when conversation has no existing key', async () => {
      const conversationId = 'conv-001';
      const prisma = makePrisma({
        conversation: {
          findUnique: (jest.fn() as jest.Mock<any>).mockResolvedValue({ serverEncryptionKeyId: null }),
          update: (jest.fn() as jest.Mock<any>).mockResolvedValue({}),
        },
      });
      const svc = new AttachmentEncryptionService(prisma);

      const result = await svc.encryptAttachment({
        fileBuffer: makeFileBuffer(128),
        filename: 'audio.mp3',
        mimeType: 'audio/mpeg',
        mode: 'hybrid',
        conversationId,
      });

      expect(result.serverCopy).toBeDefined();
      expect(result.serverCopy!.keyId).toBeTruthy();
      expect(result.serverCopy!.encryptedBuffer).toBeInstanceOf(Buffer);
      expect(prisma.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: conversationId } })
      );
    });

    it('reuses existing conversation key when found in vault', async () => {
      const conversationId = 'conv-002';

      const prisma = makePrisma({
        conversation: {
          findUnique: (jest.fn() as jest.Mock<any>).mockResolvedValue({ serverEncryptionKeyId: null }),
          update: (jest.fn() as jest.Mock<any>).mockResolvedValue({}),
        },
      });

      const svc = new AttachmentEncryptionService(prisma);

      // First call: creates the conversation key
      const firstResult = await svc.encryptAttachment({
        fileBuffer: makeFileBuffer(64),
        filename: 'audio.mp3',
        mimeType: 'audio/mpeg',
        mode: 'server',
        conversationId,
      });
      const firstKeyId = firstResult.serverCopy!.keyId;

      // Update mock so subsequent calls use the same key ID (simulating DB-persisted key)
      (prisma.conversation.findUnique as jest.Mock<any>).mockResolvedValue({ serverEncryptionKeyId: firstKeyId });

      // Second call: should find the key in cache and reuse it
      const secondResult = await svc.encryptAttachment({
        fileBuffer: makeFileBuffer(64),
        filename: 'audio2.mp3',
        mimeType: 'audio/mpeg',
        mode: 'server',
        conversationId,
      });

      expect(secondResult.serverCopy).toBeDefined();
      expect(secondResult.serverCopy!.keyId).toBe(firstKeyId);
    });

    it('generates new key when existing conversation key is not found in vault', async () => {
      const conversationId = 'conv-003';
      const missingKeyId = 'key-missing';

      const prisma = makePrisma({
        conversation: {
          findUnique: (jest.fn() as jest.Mock<any>).mockResolvedValue({ serverEncryptionKeyId: missingKeyId }),
          update: (jest.fn() as jest.Mock<any>).mockResolvedValue({}),
        },
        serverEncryptionKey: {
          create: (jest.fn() as jest.Mock<any>).mockResolvedValue({}),
          findUnique: (jest.fn() as jest.Mock<any>).mockResolvedValue(null), // key not found in DB either
          update: (jest.fn() as jest.Mock<any>).mockResolvedValue({}),
          updateMany: (jest.fn() as jest.Mock<any>).mockResolvedValue({ count: 0 }),
          count: (jest.fn() as jest.Mock<any>).mockResolvedValue(0),
        },
      });

      const svc = new AttachmentEncryptionService(prisma);
      const result = await svc.encryptAttachment({
        fileBuffer: makeFileBuffer(64),
        filename: 'f.bin',
        mimeType: 'application/octet-stream',
        mode: 'server',
        conversationId,
      });

      expect(result.serverCopy).toBeDefined();
      // A new key was generated and conversation was updated
      expect(prisma.conversation.update).toHaveBeenCalled();
    });

    it('records originalHash and encryptedHash in metadata', async () => {
      const svc = new AttachmentEncryptionService(makePrisma());
      const fileBuffer = Buffer.from('hello world');

      const result = await svc.encryptAttachment({
        fileBuffer,
        filename: 'hello.txt',
        mimeType: 'text/plain',
        mode: 'e2ee',
      });

      expect(result.metadata.originalHash).toMatch(/^[0-9a-f]{64}$/);
      expect(result.metadata.encryptedHash).toMatch(/^[0-9a-f]{64}$/);
      expect(result.metadata.originalHash).not.toBe(result.metadata.encryptedHash);
    });
  });

  // ─── decryptAttachment ────────────────────────────────────────────────────

  describe('decryptAttachment', () => {
    it('throws when encryptedBuffer is empty', async () => {
      const svc = new AttachmentEncryptionService(makePrisma());
      await expect(
        svc.decryptAttachment({
          encryptedBuffer: Buffer.alloc(0),
          encryptionKey: Buffer.from('a'.repeat(32)).toString('base64'),
          iv: Buffer.alloc(12).toString('base64'),
          authTag: Buffer.alloc(16).toString('base64'),
        })
      ).rejects.toThrow('Encrypted buffer is empty');
    });

    it('throws when encryption key is wrong length', async () => {
      const svc = new AttachmentEncryptionService(makePrisma());
      await expect(
        svc.decryptAttachment({
          encryptedBuffer: Buffer.from('data'),
          encryptionKey: Buffer.from('short').toString('base64'), // only 5 bytes
          iv: Buffer.alloc(12).toString('base64'),
          authTag: Buffer.alloc(16).toString('base64'),
        })
      ).rejects.toThrow('Invalid encryption key length');
    });

    it('throws when IV is wrong length', async () => {
      const svc = new AttachmentEncryptionService(makePrisma());
      await expect(
        svc.decryptAttachment({
          encryptedBuffer: Buffer.from('data'),
          encryptionKey: Buffer.alloc(32).toString('base64'),
          iv: Buffer.alloc(8).toString('base64'), // should be 12
          authTag: Buffer.alloc(16).toString('base64'),
        })
      ).rejects.toThrow('Invalid IV length');
    });

    it('throws when auth tag is wrong length', async () => {
      const svc = new AttachmentEncryptionService(makePrisma());
      await expect(
        svc.decryptAttachment({
          encryptedBuffer: Buffer.from('data'),
          encryptionKey: Buffer.alloc(32).toString('base64'),
          iv: Buffer.alloc(12).toString('base64'),
          authTag: Buffer.alloc(8).toString('base64'), // should be 16
        })
      ).rejects.toThrow('Invalid auth tag length');
    });

    it('successfully decrypts data encrypted by encryptAttachment (round-trip)', async () => {
      const svc = new AttachmentEncryptionService(makePrisma());
      const originalData = Buffer.from('Hello, secure world! 🔐');

      const { encryptedBuffer, metadata } = await svc.encryptAttachment({
        fileBuffer: originalData,
        filename: 'test.txt',
        mimeType: 'text/plain',
        mode: 'e2ee',
      });

      const { decryptedBuffer, hashVerified, computedHash } = await svc.decryptAttachment({
        encryptedBuffer,
        encryptionKey: metadata.encryptionKey,
        iv: metadata.iv,
        authTag: metadata.authTag,
        expectedHash: metadata.originalHash,
      });

      expect(decryptedBuffer).toEqual(originalData);
      expect(hashVerified).toBe(true);
      expect(computedHash).toBe(metadata.originalHash);
    });

    it('returns hashVerified=false when expected hash does not match', async () => {
      const svc = new AttachmentEncryptionService(makePrisma());
      const originalData = Buffer.from('some data');

      const { encryptedBuffer, metadata } = await svc.encryptAttachment({
        fileBuffer: originalData,
        filename: 'test.txt',
        mimeType: 'text/plain',
        mode: 'e2ee',
      });

      const { hashVerified } = await svc.decryptAttachment({
        encryptedBuffer,
        encryptionKey: metadata.encryptionKey,
        iv: metadata.iv,
        authTag: metadata.authTag,
        expectedHash: 'wrong-hash',
      });

      expect(hashVerified).toBe(false);
    });

    it('returns hashVerified=true when no expectedHash provided', async () => {
      const svc = new AttachmentEncryptionService(makePrisma());
      const originalData = Buffer.from('test');

      const { encryptedBuffer, metadata } = await svc.encryptAttachment({
        fileBuffer: originalData,
        filename: 'test.txt',
        mimeType: 'text/plain',
        mode: 'e2ee',
      });

      const { hashVerified } = await svc.decryptAttachment({
        encryptedBuffer,
        encryptionKey: metadata.encryptionKey,
        iv: metadata.iv,
        authTag: metadata.authTag,
      });

      expect(hashVerified).toBe(true);
    });
  });

  // ─── decryptServerAttachment ──────────────────────────────────────────────

  describe('decryptServerAttachment', () => {
    it('throws when server key is not found', async () => {
      const prisma = makePrisma();
      const svc = new AttachmentEncryptionService(prisma);

      await expect(
        svc.decryptServerAttachment(Buffer.from('data'), 'nonexistent-key', Buffer.alloc(12).toString('base64'), Buffer.alloc(16).toString('base64'))
      ).rejects.toThrow('Server key not found');
    });

    it('decrypts server-side encrypted data using stored key', async () => {
      const prisma = makePrisma({
        conversation: {
          findUnique: (jest.fn() as jest.Mock<any>).mockResolvedValue({ serverEncryptionKeyId: null }),
          update: (jest.fn() as jest.Mock<any>).mockResolvedValue({}),
        },
      });
      const svc = new AttachmentEncryptionService(prisma);
      const plaintext = Buffer.from('server encrypted attachment');

      // Encrypt in server mode to get a serverCopy
      const { serverCopy } = await svc.encryptAttachment({
        fileBuffer: plaintext,
        filename: 'audio.mp3',
        mimeType: 'audio/mpeg',
        mode: 'server',
        conversationId: 'conv-svr',
      });

      expect(serverCopy).toBeDefined();
      const decrypted = await svc.decryptServerAttachment(
        serverCopy!.encryptedBuffer,
        serverCopy!.keyId,
        serverCopy!.iv,
        serverCopy!.authTag
      );

      expect(decrypted).toEqual(plaintext);
    });
  });

  // ─── verifyHmac ──────────────────────────────────────────────────────────

  describe('verifyHmac', () => {
    it('returns true for a valid HMAC produced during encryption', async () => {
      const svc = new AttachmentEncryptionService(makePrisma());
      const fileBuffer = makeFileBuffer(256);

      const { encryptedBuffer, metadata } = await svc.encryptAttachment({
        fileBuffer,
        filename: 'f.bin',
        mimeType: 'application/octet-stream',
        mode: 'e2ee',
      });

      const valid = svc.verifyHmac(encryptedBuffer, metadata.encryptionKey, metadata.hmac);
      expect(valid).toBe(true);
    });

    it('returns false for a tampered HMAC', async () => {
      const svc = new AttachmentEncryptionService(makePrisma());
      const fileBuffer = makeFileBuffer(64);

      const { encryptedBuffer, metadata } = await svc.encryptAttachment({
        fileBuffer,
        filename: 'f.bin',
        mimeType: 'application/octet-stream',
        mode: 'e2ee',
      });

      const tampered = Buffer.alloc(32).toString('base64');
      const valid = svc.verifyHmac(encryptedBuffer, metadata.encryptionKey, tampered);
      expect(valid).toBe(false);
    });

    it('returns false for HMAC of wrong length', async () => {
      const svc = new AttachmentEncryptionService(makePrisma());
      const fileBuffer = makeFileBuffer(32);

      const { encryptedBuffer, metadata } = await svc.encryptAttachment({
        fileBuffer,
        filename: 'f.bin',
        mimeType: 'application/octet-stream',
        mode: 'e2ee',
      });

      const shortHmac = Buffer.alloc(8).toString('base64'); // wrong length
      const valid = svc.verifyHmac(encryptedBuffer, metadata.encryptionKey, shortHmac);
      expect(valid).toBe(false);
    });

    it('returns false for invalid base64 HMAC without throwing', async () => {
      const svc = new AttachmentEncryptionService(makePrisma());
      const fileBuffer = makeFileBuffer(32);

      const { encryptedBuffer, metadata } = await svc.encryptAttachment({
        fileBuffer,
        filename: 'f.bin',
        mimeType: 'application/octet-stream',
        mode: 'e2ee',
      });

      // Note: Buffer.from(str, 'base64') doesn't actually throw for invalid base64,
      // it just returns whatever it can parse. The length mismatch path covers this.
      const valid = svc.verifyHmac(encryptedBuffer, metadata.encryptionKey, 'not-base64!!!###');
      expect(valid).toBe(false);
    });

    it('returns false for a tampered encrypted buffer', async () => {
      const svc = new AttachmentEncryptionService(makePrisma());
      const fileBuffer = makeFileBuffer(64);

      const { encryptedBuffer, metadata } = await svc.encryptAttachment({
        fileBuffer,
        filename: 'f.bin',
        mimeType: 'application/octet-stream',
        mode: 'e2ee',
      });

      const tampered = Buffer.from(encryptedBuffer);
      tampered[0] ^= 0xff; // flip first byte

      const valid = svc.verifyHmac(tampered, metadata.encryptionKey, metadata.hmac);
      expect(valid).toBe(false);
    });
  });

  // ─── encryptMetadata / decryptMetadata ───────────────────────────────────

  describe('encryptMetadata / decryptMetadata', () => {
    it('round-trips metadata correctly', () => {
      const svc = new AttachmentEncryptionService(makePrisma());
      const encryptionKey = Buffer.alloc(32, 0xab).toString('base64');
      const metadata = { filename: 'secret.pdf', size: 12345, owner: 'alice' };

      const encrypted = svc.encryptMetadata(metadata, encryptionKey);
      expect(typeof encrypted).toBe('string');
      expect(encrypted.split(':').length).toBe(3); // iv:authTag:ciphertext

      const decrypted = svc.decryptMetadata(encrypted, encryptionKey);
      expect(decrypted).toEqual(metadata);
    });

    it('throws when decrypting invalid metadata format (wrong number of colons)', () => {
      const svc = new AttachmentEncryptionService(makePrisma());
      const encryptionKey = Buffer.alloc(32).toString('base64');

      expect(() => svc.decryptMetadata('only-two-parts:here', encryptionKey)).toThrow(
        'Invalid encrypted metadata format'
      );
    });

    it('throws on decryptMetadata with wrong key', () => {
      const svc = new AttachmentEncryptionService(makePrisma());
      const key1 = Buffer.alloc(32, 0x01).toString('base64');
      const key2 = Buffer.alloc(32, 0x02).toString('base64');

      const encrypted = svc.encryptMetadata({ test: true }, key1);
      expect(() => svc.decryptMetadata(encrypted, key2)).toThrow();
    });

    it('produces different ciphertext each time (random IV)', () => {
      const svc = new AttachmentEncryptionService(makePrisma());
      const key = Buffer.alloc(32, 0x55).toString('base64');
      const metadata = { data: 'same' };

      const enc1 = svc.encryptMetadata(metadata, key);
      const enc2 = svc.encryptMetadata(metadata, key);
      expect(enc1).not.toBe(enc2); // different IV each call
    });
  });

  // ─── generateServerKey ────────────────────────────────────────────────────

  describe('generateServerKey', () => {
    it('returns a key ID string', async () => {
      const svc = new AttachmentEncryptionService(makePrisma());
      const keyId = await svc.generateServerKey();
      expect(typeof keyId).toBe('string');
      expect(keyId.length).toBeGreaterThan(0);
    });

    it('persists key to MongoDB via prisma.serverEncryptionKey.create', async () => {
      const prisma = makePrisma();
      const svc = new AttachmentEncryptionService(prisma);

      await svc.generateServerKey({ attachmentId: 'att-1', userId: 'user-1' });

      expect(prisma.serverEncryptionKey.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            algorithm: 'aes-256-gcm',
            purpose: 'attachment',
            isActive: true,
          }),
        })
      );
    });

    it('still returns key ID even when DB persistence fails', async () => {
      const prisma = makePrisma({
        serverEncryptionKey: {
          create: (jest.fn() as jest.Mock<any>).mockRejectedValue(new Error('DB error')),
          findUnique: jest.fn(),
          update: jest.fn(),
          updateMany: jest.fn(),
          count: jest.fn(),
        },
      });
      const svc = new AttachmentEncryptionService(prisma);

      // Should not throw even when DB fails
      const keyId = await svc.generateServerKey();
      expect(typeof keyId).toBe('string');
    });
  });

  // ─── hasServerKey ─────────────────────────────────────────────────────────

  describe('hasServerKey', () => {
    it('returns true for a key that was just generated (cache hit)', async () => {
      const svc = new AttachmentEncryptionService(makePrisma());
      const keyId = await svc.generateServerKey();

      const has = await svc.hasServerKey(keyId);
      expect(has).toBe(true);
    });

    it('returns false for a key that does not exist', async () => {
      const prisma = makePrisma({
        serverEncryptionKey: {
          create: jest.fn(),
          findUnique: jest.fn(),
          update: jest.fn(),
          updateMany: jest.fn(),
          count: (jest.fn() as jest.Mock<any>).mockResolvedValue(0),
        },
      });
      const svc = new AttachmentEncryptionService(prisma);

      const has = await svc.hasServerKey('nonexistent');
      expect(has).toBe(false);
    });

    it('returns true when key exists in DB (not in cache)', async () => {
      const prisma = makePrisma({
        serverEncryptionKey: {
          create: jest.fn(),
          findUnique: jest.fn(),
          update: jest.fn(),
          updateMany: jest.fn(),
          count: (jest.fn() as jest.Mock<any>).mockResolvedValue(1),
        },
      });
      const svc = new AttachmentEncryptionService(prisma);

      const has = await svc.hasServerKey('key-in-db');
      expect(has).toBe(true);
    });

    it('returns false when DB throws', async () => {
      const prisma = makePrisma({
        serverEncryptionKey: {
          create: jest.fn(),
          findUnique: jest.fn(),
          update: jest.fn(),
          updateMany: jest.fn(),
          count: (jest.fn() as jest.Mock<any>).mockRejectedValue(new Error('DB error')),
        },
      });
      const svc = new AttachmentEncryptionService(prisma);

      const has = await svc.hasServerKey('any-key');
      expect(has).toBe(false);
    });
  });

  // ─── deleteServerKey ──────────────────────────────────────────────────────

  describe('deleteServerKey', () => {
    it('returns true on successful soft-delete', async () => {
      const svc = new AttachmentEncryptionService(makePrisma());
      const keyId = await svc.generateServerKey();

      const deleted = await svc.deleteServerKey(keyId);
      expect(deleted).toBe(true);
    });

    it('returns false when DB update throws', async () => {
      const prisma = makePrisma({
        serverEncryptionKey: {
          create: (jest.fn() as jest.Mock<any>).mockResolvedValue({}),
          findUnique: jest.fn(),
          update: (jest.fn() as jest.Mock<any>).mockRejectedValue(new Error('DB error')),
          updateMany: jest.fn(),
          count: jest.fn(),
        },
      });
      const svc = new AttachmentEncryptionService(prisma);
      const keyId = await svc.generateServerKey();

      const deleted = await svc.deleteServerKey(keyId);
      expect(deleted).toBe(false);
    });
  });

  // ─── cleanupExpiredKeys ───────────────────────────────────────────────────

  describe('cleanupExpiredKeys', () => {
    it('returns count of cleaned up keys', async () => {
      const prisma = makePrisma({
        serverEncryptionKey: {
          create: jest.fn(),
          findUnique: jest.fn(),
          update: jest.fn(),
          updateMany: (jest.fn() as jest.Mock<any>).mockResolvedValue({ count: 3 }),
          count: jest.fn(),
        },
      });
      const svc = new AttachmentEncryptionService(prisma);

      const count = await svc.cleanupExpiredKeys();
      expect(count).toBe(3);
    });

    it('returns 0 when DB throws', async () => {
      const prisma = makePrisma({
        serverEncryptionKey: {
          create: jest.fn(),
          findUnique: jest.fn(),
          update: jest.fn(),
          updateMany: (jest.fn() as jest.Mock<any>).mockRejectedValue(new Error('DB error')),
          count: jest.fn(),
        },
      });
      const svc = new AttachmentEncryptionService(prisma);

      const count = await svc.cleanupExpiredKeys();
      expect(count).toBe(0);
    });

    it('calls updateMany with isActive: false for expired keys', async () => {
      const prisma = makePrisma();
      const svc = new AttachmentEncryptionService(prisma);

      await svc.cleanupExpiredKeys();

      expect(prisma.serverEncryptionKey.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isActive: true }),
          data: { isActive: false },
        })
      );
    });
  });

  // ─── getStats ─────────────────────────────────────────────────────────────

  describe('getStats', () => {
    it('returns cacheSize and maxCacheSize', () => {
      const svc = new AttachmentEncryptionService(makePrisma());
      const stats = svc.getStats();

      expect(stats).toHaveProperty('cacheSize');
      expect(stats).toHaveProperty('maxCacheSize');
      expect(typeof stats.cacheSize).toBe('number');
      expect(typeof stats.maxCacheSize).toBe('number');
    });

    it('cacheSize increases after generating keys', async () => {
      const svc = new AttachmentEncryptionService(makePrisma());
      const before = svc.getStats().cacheSize;

      await svc.generateServerKey();
      const after = svc.getStats().cacheSize;

      expect(after).toBe(before + 1);
    });
  });

  // ─── getMasterKey (via constructor) ───────────────────────────────────────

  describe('getMasterKey environment handling', () => {
    it('uses ATTACHMENT_MASTER_KEY env var when set', () => {
      process.env.ATTACHMENT_MASTER_KEY = TEST_MASTER_KEY_B64;
      expect(() => new AttachmentEncryptionService(makePrisma())).not.toThrow();
    });

    it('throws when ATTACHMENT_MASTER_KEY missing and not in test env', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.ATTACHMENT_MASTER_KEY;

      expect(() => new AttachmentEncryptionService(makePrisma())).toThrow(
        'ATTACHMENT_MASTER_KEY environment variable is required'
      );
    });

    it('throws when key is wrong byte length', () => {
      // Base64 of 16 bytes (128 bits) instead of 32 bytes (256 bits)
      process.env.ATTACHMENT_MASTER_KEY = Buffer.alloc(16).toString('base64');

      expect(() => new AttachmentEncryptionService(makePrisma())).toThrow(
        'must be 32 bytes'
      );
    });
  });

  // ─── getAttachmentEncryptionService singleton ─────────────────────────────

  describe('getAttachmentEncryptionService', () => {
    it('returns same instance on repeated calls', () => {
      const prisma = makePrisma();
      const svc1 = getAttachmentEncryptionService(prisma);
      const svc2 = getAttachmentEncryptionService(prisma);
      expect(svc1).toBe(svc2);
    });
  });

  // ─── DB key lookup path (covers lines 173-180, 280-313) ──────────────────

  describe('DB key lookup path (getKey loads from MongoDB)', () => {
    function buildEncryptedKeyRecord() {
      const crypto = require('crypto');
      const masterKey = Buffer.from(TEST_MASTER_KEY_B64, 'base64');
      const dataKey = crypto.randomBytes(32);
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);
      const encryptedKey = Buffer.concat([cipher.update(dataKey), cipher.final()]);
      const authTag = cipher.getAuthTag();
      return {
        record: {
          encryptedKey: encryptedKey.toString('base64'),
          iv: iv.toString('base64'),
          authTag: authTag.toString('base64'),
          isActive: true,
          expiresAt: null,
        },
        plainKey: dataKey,
      };
    }

    it('loads key from DB and uses it for decryption when not in cache', async () => {
      const { record, plainKey } = buildEncryptedKeyRecord();
      const keyId = 'db-only-key';

      // Encrypt something with the plain key to have valid data
      const crypto = require('crypto');
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', plainKey, iv);
      const plaintext = Buffer.from('test data for db path');
      const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      const authTag = cipher.getAuthTag();

      const prisma = makePrisma({
        serverEncryptionKey: {
          create: (jest.fn() as jest.Mock<any>).mockResolvedValue({}),
          findUnique: (jest.fn() as jest.Mock<any>).mockResolvedValue(record),
          update: (jest.fn() as jest.Mock<any>).mockResolvedValue({}),
          updateMany: (jest.fn() as jest.Mock<any>).mockResolvedValue({ count: 0 }),
          count: (jest.fn() as jest.Mock<any>).mockResolvedValue(0),
        },
      });
      // Fresh service instance — no key in cache
      const svc = new AttachmentEncryptionService(prisma);

      const decrypted = await svc.decryptServerAttachment(
        encrypted,
        keyId,
        iv.toString('base64'),
        authTag.toString('base64')
      );

      expect(decrypted).toEqual(plaintext);
      // Key should now be cached — second call doesn't hit DB again
      expect(prisma.serverEncryptionKey.findUnique).toHaveBeenCalledTimes(1);
    });

    it('returns undefined when DB record is inactive', async () => {
      const keyId = 'inactive-key';
      const prisma = makePrisma({
        serverEncryptionKey: {
          create: jest.fn(),
          findUnique: (jest.fn() as jest.Mock<any>).mockResolvedValue({ isActive: false }),
          update: jest.fn(),
          updateMany: jest.fn(),
          count: jest.fn(),
        },
      });
      const svc = new AttachmentEncryptionService(prisma);

      await expect(svc.decryptServerAttachment(Buffer.from('data'), keyId, Buffer.alloc(12).toString('base64'), Buffer.alloc(16).toString('base64'))).rejects.toThrow('Server key not found');
    });

    it('returns undefined for expired key in DB', async () => {
      const keyId = 'expired-db-key';
      const prisma = makePrisma({
        serverEncryptionKey: {
          create: jest.fn(),
          findUnique: (jest.fn() as jest.Mock<any>).mockResolvedValue({
            isActive: true,
            expiresAt: new Date(Date.now() - 1000), // already expired
          }),
          update: jest.fn(),
          updateMany: jest.fn(),
          count: jest.fn(),
        },
      });
      const svc = new AttachmentEncryptionService(prisma);

      await expect(svc.decryptServerAttachment(Buffer.from('data'), keyId, Buffer.alloc(12).toString('base64'), Buffer.alloc(16).toString('base64'))).rejects.toThrow('Server key not found');
    });

    it('returns undefined when DB throws (error handling path)', async () => {
      const keyId = 'error-key';
      const prisma = makePrisma({
        serverEncryptionKey: {
          create: jest.fn(),
          findUnique: (jest.fn() as jest.Mock<any>).mockRejectedValue(new Error('DB connection lost')),
          update: jest.fn(),
          updateMany: jest.fn(),
          count: jest.fn(),
        },
      });
      const svc = new AttachmentEncryptionService(prisma);

      await expect(svc.decryptServerAttachment(Buffer.from('data'), keyId, Buffer.alloc(12).toString('base64'), Buffer.alloc(16).toString('base64'))).rejects.toThrow('Server key not found');
    });
  });

  // ─── Cache TTL expiry path (covers line 266) ─────────────────────────────

  describe('cache TTL expiry', () => {
    it('evicts expired key from cache and tries DB (getKey TTL path)', async () => {
      jest.useFakeTimers();

      const prisma = makePrisma({
        serverEncryptionKey: {
          create: (jest.fn() as jest.Mock<any>).mockResolvedValue({}),
          findUnique: (jest.fn() as jest.Mock<any>).mockResolvedValue(null), // not in DB
          update: (jest.fn() as jest.Mock<any>).mockResolvedValue({}),
          updateMany: (jest.fn() as jest.Mock<any>).mockResolvedValue({ count: 0 }),
          count: (jest.fn() as jest.Mock<any>).mockResolvedValue(0),
        },
      });
      const svc = new AttachmentEncryptionService(prisma);

      // Generate a key — it gets cached
      const keyId = await svc.generateServerKey();

      // Advance time past the cache TTL (30 minutes)
      jest.advanceTimersByTime(31 * 60 * 1000);

      // getKey is called via decryptServerAttachment:
      // cache hit → TTL expired → cache.delete (line 266) → DB lookup → null → undefined → throw
      await expect(
        svc.decryptServerAttachment(
          Buffer.from('some data'),
          keyId,
          Buffer.alloc(12).toString('base64'),
          Buffer.alloc(16).toString('base64')
        )
      ).rejects.toThrow('Server key not found');

      // Verify DB was queried (cache eviction triggered DB fallback)
      expect(prisma.serverEncryptionKey.findUnique).toHaveBeenCalledWith({ where: { id: keyId } });

      jest.useRealTimers();
    });
  });
});
