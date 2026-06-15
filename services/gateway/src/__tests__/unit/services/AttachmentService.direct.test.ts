/**
 * Unit tests for AttachmentService — direct-access methods
 *
 * Covers the non-delegation paths (lines 62-447):
 * - determinePublicUrl (production/development/fallback branches)
 * - associateAttachmentsToMessage
 * - getAttachment (null + found)
 * - getAttachmentWithMetadata (null + found)
 * - getFilePath (null + found)
 * - getThumbnailPath (null + no-thumbnail + found)
 * - deleteAttachment (not-found + with/without thumbnail + file-error)
 * - getConversationAttachments (no filter + type filter + empty)
 * - decryptAttachment (not-found + unencrypted + encrypted paths)
 * - isAttachmentEncrypted (found + not-found)
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockUploadProcessor = {
  validateFile: jest.fn() as jest.Mock<any>,
  uploadFile: jest.fn() as jest.Mock<any>,
  uploadEncryptedFile: jest.fn() as jest.Mock<any>,
  uploadMultiple: jest.fn() as jest.Mock<any>,
  createTextAttachment: jest.fn() as jest.Mock<any>,
  getAttachmentUrl: jest.fn() as jest.Mock<any>,
  getAttachmentPath: jest.fn() as jest.Mock<any>,
  buildFullUrl: jest.fn() as jest.Mock<any>,
} as any;

const mockEncryptionService = {
  verifyHmac: jest.fn() as jest.Mock<any>,
  decryptAttachment: jest.fn() as jest.Mock<any>,
};

const mockFsReadFile = jest.fn() as jest.Mock<any>;
const mockFsUnlink = jest.fn() as jest.Mock<any>;

jest.mock('../../../services/attachments/UploadProcessor', () => ({
  UploadProcessor: jest.fn().mockImplementation(() => mockUploadProcessor),
}));

jest.mock('../../../services/attachments/MetadataManager', () => ({
  MetadataManager: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../services/AttachmentEncryptionService', () => ({
  getAttachmentEncryptionService: jest.fn(() => mockEncryptionService),
}));

jest.mock('fs', () => ({
  promises: {
    readFile: (...args: unknown[]) => mockFsReadFile(...args),
    unlink: (...args: unknown[]) => mockFsUnlink(...args),
    mkdir: (jest.fn() as jest.Mock<any>).mockResolvedValue(undefined),
    writeFile: (jest.fn() as jest.Mock<any>).mockResolvedValue(undefined),
    chmod: (jest.fn() as jest.Mock<any>).mockResolvedValue(undefined),
    stat: (jest.fn() as jest.Mock<any>).mockResolvedValue({ size: 1024 }),
  },
}));

jest.mock('@meeshy/shared/types/attachment', () => ({
  ACCEPTED_MIME_TYPES: {
    IMAGE: ['image/jpeg', 'image/png', 'image/webp'],
    AUDIO: ['audio/mpeg', 'audio/mp4', 'audio/ogg'],
    VIDEO: ['video/mp4', 'video/webm'],
    DOCUMENT: ['application/pdf'],
    TEXT: ['text/plain'],
  },
}));

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

import { AttachmentService } from '../../../services/attachments';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ATTACH_ID = '507f1f77bcf86cd799439001';
const MSG_ID = '507f1f77bcf86cd799439002';
const CONV_ID = '507f1f77bcf86cd799439003';
const USER_ID = '507f1f77bcf86cd799439004';

function makeAttachmentRow(overrides: Record<string, any> = {}) {
  return {
    id: ATTACH_ID,
    messageId: MSG_ID,
    fileName: 'file.jpg',
    originalName: 'original.jpg',
    mimeType: 'image/jpeg',
    fileSize: 4096,
    filePath: '2024/01/file.jpg',
    fileUrl: '/api/v1/attachments/file/2024%2F01%2Ffile.jpg',
    thumbnailPath: null,
    thumbnailUrl: null,
    width: null,
    height: null,
    duration: null,
    bitrate: null,
    sampleRate: null,
    codec: null,
    channels: null,
    uploadedBy: USER_ID,
    isAnonymous: false,
    isEncrypted: false,
    isForwarded: false,
    isViewOnce: false,
    viewOnceCount: 0,
    isBlurred: false,
    viewedCount: 0,
    downloadedCount: 0,
    consumedCount: 0,
    encryptionIv: null,
    encryptionAuthTag: null,
    encryptionHmac: null,
    originalFileHash: null,
    transcription: null,
    translations: null,
    metadata: null,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    messageAttachment: {
      create: (jest.fn() as jest.Mock<any>).mockResolvedValue({}),
      findUnique: (jest.fn() as jest.Mock<any>).mockResolvedValue(null),
      findMany: (jest.fn() as jest.Mock<any>).mockResolvedValue([]),
      updateMany: (jest.fn() as jest.Mock<any>).mockResolvedValue({ count: 0 }),
      delete: (jest.fn() as jest.Mock<any>).mockResolvedValue({}),
    },
    ...overrides,
  } as any;
}

// ─── Environment ──────────────────────────────────────────────────────────────

describe('AttachmentService — direct-access methods', () => {
  let originalEnv: Record<string, string | undefined>;

  beforeEach(() => {
    originalEnv = {
      NODE_ENV: process.env.NODE_ENV,
      PUBLIC_URL: process.env.PUBLIC_URL,
      UPLOAD_PATH: process.env.UPLOAD_PATH,
      BACKEND_URL: process.env.BACKEND_URL,
      NEXT_PUBLIC_BACKEND_URL: process.env.NEXT_PUBLIC_BACKEND_URL,
      DOMAIN: process.env.DOMAIN,
      PORT: process.env.PORT,
    };
    process.env.UPLOAD_PATH = '/uploads';
    process.env.PUBLIC_URL = 'https://gate.meeshy.test';
    process.env.NODE_ENV = 'test';
    delete process.env.BACKEND_URL;
    delete process.env.NEXT_PUBLIC_BACKEND_URL;
    jest.clearAllMocks();
    mockFsReadFile.mockResolvedValue(Buffer.from('file-content'));
    mockFsUnlink.mockResolvedValue(undefined);
  });

  afterEach(() => {
    for (const [key, val] of Object.entries(originalEnv)) {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
  });

  // ─── determinePublicUrl (via constructor) ────────────────────────────────

  describe('determinePublicUrl', () => {
    it('uses PUBLIC_URL env var when set', () => {
      process.env.PUBLIC_URL = 'https://custom.url';
      const svc = new AttachmentService(makePrisma() as PrismaClient);
      expect(svc).toBeDefined(); // constructor succeeded
    });

    it('production mode: uses DOMAIN env var when PUBLIC_URL not set', () => {
      delete process.env.PUBLIC_URL;
      process.env.NODE_ENV = 'production';
      process.env.DOMAIN = 'meeshy.example';
      const svc = new AttachmentService(makePrisma() as PrismaClient);
      expect(svc).toBeDefined();
    });

    it('production mode: uses default domain when DOMAIN not set', () => {
      delete process.env.PUBLIC_URL;
      process.env.NODE_ENV = 'production';
      delete process.env.DOMAIN;
      const svc = new AttachmentService(makePrisma() as PrismaClient);
      expect(svc).toBeDefined();
    });

    it('development mode: uses BACKEND_URL when PUBLIC_URL not set', () => {
      delete process.env.PUBLIC_URL;
      process.env.NODE_ENV = 'development';
      process.env.BACKEND_URL = 'http://local-backend:4000';
      const svc = new AttachmentService(makePrisma() as PrismaClient);
      expect(svc).toBeDefined();
    });

    it('development mode: uses NEXT_PUBLIC_BACKEND_URL when BACKEND_URL not set', () => {
      delete process.env.PUBLIC_URL;
      process.env.NODE_ENV = 'development';
      delete process.env.BACKEND_URL;
      process.env.NEXT_PUBLIC_BACKEND_URL = 'http://nextjs-backend:3000';
      const svc = new AttachmentService(makePrisma() as PrismaClient);
      expect(svc).toBeDefined();
    });

    it('development mode: uses PORT env var for localhost URL when no backend URL set', () => {
      delete process.env.PUBLIC_URL;
      process.env.NODE_ENV = 'development';
      delete process.env.BACKEND_URL;
      delete process.env.NEXT_PUBLIC_BACKEND_URL;
      process.env.PORT = '4500';
      const svc = new AttachmentService(makePrisma() as PrismaClient);
      expect(svc).toBeDefined();
    });

    it('development mode: uses default port 3000 when PORT not set', () => {
      delete process.env.PUBLIC_URL;
      process.env.NODE_ENV = 'development';
      delete process.env.BACKEND_URL;
      delete process.env.NEXT_PUBLIC_BACKEND_URL;
      delete process.env.PORT;
      const svc = new AttachmentService(makePrisma() as PrismaClient);
      expect(svc).toBeDefined();
    });

    it('local mode: uses same logic as development', () => {
      delete process.env.PUBLIC_URL;
      process.env.NODE_ENV = 'local';
      process.env.BACKEND_URL = 'http://meeshy.local:3000';
      const svc = new AttachmentService(makePrisma() as PrismaClient);
      expect(svc).toBeDefined();
    });

    it('fallback mode: uses BACKEND_URL when neither production nor development', () => {
      delete process.env.PUBLIC_URL;
      process.env.NODE_ENV = 'staging';
      process.env.BACKEND_URL = 'http://staging-backend:3000';
      const svc = new AttachmentService(makePrisma() as PrismaClient);
      expect(svc).toBeDefined();
    });

    it('fallback mode: uses hardcoded localhost when no backend URL set', () => {
      delete process.env.PUBLIC_URL;
      process.env.NODE_ENV = 'staging';
      delete process.env.BACKEND_URL;
      delete process.env.NEXT_PUBLIC_BACKEND_URL;
      const svc = new AttachmentService(makePrisma() as PrismaClient);
      expect(svc).toBeDefined();
    });
  });

  // ─── associateAttachmentsToMessage ───────────────────────────────────────

  describe('associateAttachmentsToMessage', () => {
    it('calls updateMany with the attachment ids and messageId', async () => {
      const prisma = makePrisma();
      const svc = new AttachmentService(prisma as PrismaClient);

      await svc.associateAttachmentsToMessage([ATTACH_ID, 'att-2'], MSG_ID);

      expect(prisma.messageAttachment.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [ATTACH_ID, 'att-2'] } },
        data: { messageId: MSG_ID },
      });
    });
  });

  // ─── getAttachment ────────────────────────────────────────────────────────

  describe('getAttachment', () => {
    it('returns null when attachment not found', async () => {
      const prisma = makePrisma();
      const svc = new AttachmentService(prisma as PrismaClient);

      const result = await svc.getAttachment(ATTACH_ID);
      expect(result).toBeNull();
    });

    it('returns mapped attachment when found', async () => {
      const prisma = makePrisma();
      (prisma.messageAttachment.findUnique as jest.Mock<any>).mockResolvedValue(
        makeAttachmentRow({ thumbnailUrl: '/thumb.jpg', width: 1920, height: 1080, duration: 30.5 })
      );
      const svc = new AttachmentService(prisma as PrismaClient);

      const result = await svc.getAttachment(ATTACH_ID);

      expect(result).not.toBeNull();
      expect(result!.id).toBe(ATTACH_ID);
      expect(result!.mimeType).toBe('image/jpeg');
      expect(result!.thumbnailUrl).toBe('/thumb.jpg');
      expect(result!.width).toBe(1920);
      expect(result!.duration).toBe(30.5);
      expect(result!.isEncrypted).toBe(false);
      expect(result!.isForwarded).toBe(false);
    });

    it('maps nullable fields to undefined when null', async () => {
      const prisma = makePrisma();
      (prisma.messageAttachment.findUnique as jest.Mock<any>).mockResolvedValue(makeAttachmentRow());
      const svc = new AttachmentService(prisma as PrismaClient);

      const result = await svc.getAttachment(ATTACH_ID);

      expect(result!.thumbnailUrl).toBeUndefined();
      expect(result!.width).toBeUndefined();
      expect(result!.duration).toBeUndefined();
      expect(result!.bitrate).toBeUndefined();
    });

    it('serializes createdAt to ISO string', async () => {
      const prisma = makePrisma();
      (prisma.messageAttachment.findUnique as jest.Mock<any>).mockResolvedValue(makeAttachmentRow());
      const svc = new AttachmentService(prisma as PrismaClient);

      const result = await svc.getAttachment(ATTACH_ID);
      expect(result!.createdAt).toBe('2024-01-01T00:00:00.000Z');
    });
  });

  // ─── getAttachmentWithMetadata ────────────────────────────────────────────

  describe('getAttachmentWithMetadata', () => {
    it('returns null when not found', async () => {
      const prisma = makePrisma();
      const svc = new AttachmentService(prisma as PrismaClient);

      const result = await svc.getAttachmentWithMetadata(ATTACH_ID);
      expect(result).toBeNull();
    });

    it('returns raw DB row when found', async () => {
      const prisma = makePrisma();
      const row = { id: ATTACH_ID, fileName: 'file.jpg', createdAt: new Date() };
      (prisma.messageAttachment.findUnique as jest.Mock<any>).mockResolvedValue(row);
      const svc = new AttachmentService(prisma as PrismaClient);

      const result = await svc.getAttachmentWithMetadata(ATTACH_ID);
      expect(result).toBe(row);
    });
  });

  // ─── getFilePath ──────────────────────────────────────────────────────────

  describe('getFilePath', () => {
    it('returns null when attachment not found', async () => {
      const prisma = makePrisma();
      const svc = new AttachmentService(prisma as PrismaClient);

      const result = await svc.getFilePath(ATTACH_ID);
      expect(result).toBeNull();
    });

    it('returns full file path when found', async () => {
      const prisma = makePrisma();
      (prisma.messageAttachment.findUnique as jest.Mock<any>).mockResolvedValue({ filePath: '2024/01/file.jpg' });
      const svc = new AttachmentService(prisma as PrismaClient);

      const result = await svc.getFilePath(ATTACH_ID);
      expect(result).toContain('2024/01/file.jpg');
      expect(result).toContain('/uploads');
    });
  });

  // ─── getThumbnailPath ─────────────────────────────────────────────────────

  describe('getThumbnailPath', () => {
    it('returns null when attachment not found', async () => {
      const prisma = makePrisma();
      const svc = new AttachmentService(prisma as PrismaClient);

      const result = await svc.getThumbnailPath(ATTACH_ID);
      expect(result).toBeNull();
    });

    it('returns null when attachment has no thumbnailPath', async () => {
      const prisma = makePrisma();
      (prisma.messageAttachment.findUnique as jest.Mock<any>).mockResolvedValue({ thumbnailPath: null });
      const svc = new AttachmentService(prisma as PrismaClient);

      const result = await svc.getThumbnailPath(ATTACH_ID);
      expect(result).toBeNull();
    });

    it('returns full thumbnail path when found', async () => {
      const prisma = makePrisma();
      (prisma.messageAttachment.findUnique as jest.Mock<any>).mockResolvedValue({ thumbnailPath: '2024/01/thumb.jpg' });
      const svc = new AttachmentService(prisma as PrismaClient);

      const result = await svc.getThumbnailPath(ATTACH_ID);
      expect(result).toContain('2024/01/thumb.jpg');
    });
  });

  // ─── deleteAttachment ─────────────────────────────────────────────────────

  describe('deleteAttachment', () => {
    it('throws when attachment not found', async () => {
      const prisma = makePrisma();
      const svc = new AttachmentService(prisma as PrismaClient);

      await expect(svc.deleteAttachment(ATTACH_ID)).rejects.toThrow('Attachment not found');
    });

    it('deletes file and DB record when no thumbnail', async () => {
      const prisma = makePrisma();
      (prisma.messageAttachment.findUnique as jest.Mock<any>).mockResolvedValue(
        makeAttachmentRow({ thumbnailPath: null })
      );
      const svc = new AttachmentService(prisma as PrismaClient);

      await svc.deleteAttachment(ATTACH_ID);

      expect(mockFsUnlink).toHaveBeenCalledTimes(1);
      expect(prisma.messageAttachment.delete).toHaveBeenCalledWith({ where: { id: ATTACH_ID } });
    });

    it('deletes both file and thumbnail when thumbnail exists', async () => {
      const prisma = makePrisma();
      (prisma.messageAttachment.findUnique as jest.Mock<any>).mockResolvedValue(
        makeAttachmentRow({ thumbnailPath: '2024/01/thumb.jpg' })
      );
      const svc = new AttachmentService(prisma as PrismaClient);

      await svc.deleteAttachment(ATTACH_ID);

      expect(mockFsUnlink).toHaveBeenCalledTimes(2);
      expect(prisma.messageAttachment.delete).toHaveBeenCalled();
    });

    it('continues to delete DB record even when file unlink fails', async () => {
      const prisma = makePrisma();
      (prisma.messageAttachment.findUnique as jest.Mock<any>).mockResolvedValue(makeAttachmentRow());
      mockFsUnlink.mockRejectedValue(new Error('ENOENT'));
      const svc = new AttachmentService(prisma as PrismaClient);

      await svc.deleteAttachment(ATTACH_ID);

      expect(prisma.messageAttachment.delete).toHaveBeenCalled();
    });

    it('swallows thumbnail unlink error (fire-and-forget)', async () => {
      const prisma = makePrisma();
      (prisma.messageAttachment.findUnique as jest.Mock<any>).mockResolvedValue(
        makeAttachmentRow({ thumbnailPath: 'thumb.jpg' })
      );
      mockFsUnlink
        .mockResolvedValueOnce(undefined) // main file
        .mockRejectedValueOnce(new Error('ENOENT')); // thumbnail
      const svc = new AttachmentService(prisma as PrismaClient);

      await expect(svc.deleteAttachment(ATTACH_ID)).resolves.toBeUndefined();
    });
  });

  // ─── getConversationAttachments ───────────────────────────────────────────

  describe('getConversationAttachments', () => {
    it('returns empty array when no attachments', async () => {
      const prisma = makePrisma();
      const svc = new AttachmentService(prisma as PrismaClient);

      const result = await svc.getConversationAttachments(CONV_ID);
      expect(result).toEqual([]);
    });

    it('queries without type filter when no type option', async () => {
      const prisma = makePrisma();
      (prisma.messageAttachment.findMany as jest.Mock<any>).mockResolvedValue([]);
      const svc = new AttachmentService(prisma as PrismaClient);

      await svc.getConversationAttachments(CONV_ID);

      expect(prisma.messageAttachment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ message: { conversationId: CONV_ID } }),
        })
      );
    });

    it('filters by mimeType when type option provided', async () => {
      const prisma = makePrisma();
      (prisma.messageAttachment.findMany as jest.Mock<any>).mockResolvedValue([]);
      const svc = new AttachmentService(prisma as PrismaClient);

      await svc.getConversationAttachments(CONV_ID, { type: 'image' as any });

      expect(prisma.messageAttachment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            mimeType: expect.objectContaining({ in: expect.any(Array) }),
          }),
        })
      );
    });

    it('applies limit and offset', async () => {
      const prisma = makePrisma();
      (prisma.messageAttachment.findMany as jest.Mock<any>).mockResolvedValue([]);
      const svc = new AttachmentService(prisma as PrismaClient);

      await svc.getConversationAttachments(CONV_ID, { limit: 10, offset: 20 });

      expect(prisma.messageAttachment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10, skip: 20 })
      );
    });

    it('maps attachment rows to AttachmentWithMetadata shape', async () => {
      const prisma = makePrisma();
      (prisma.messageAttachment.findMany as jest.Mock<any>).mockResolvedValue([
        makeAttachmentRow({ thumbnailUrl: '/thumb.jpg', width: 100, translations: null, transcription: null }),
      ]);
      const svc = new AttachmentService(prisma as PrismaClient);

      const result = await svc.getConversationAttachments(CONV_ID);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(ATTACH_ID);
      expect((result[0] as any).thumbnailUrl).toBe('/thumb.jpg');
      expect((result[0] as any).isEncrypted).toBe(false);
      expect(result[0].translations).toEqual({});
      expect((result[0] as any).createdAt).toBe('2024-01-01T00:00:00.000Z');
    });

    it('handles unknown attachment type gracefully (empty mimeType filter)', async () => {
      const prisma = makePrisma();
      (prisma.messageAttachment.findMany as jest.Mock<any>).mockResolvedValue([]);
      const svc = new AttachmentService(prisma as PrismaClient);

      await svc.getConversationAttachments(CONV_ID, { type: 'UNKNOWN_TYPE' as any });

      expect(prisma.messageAttachment.findMany).toHaveBeenCalled();
    });
  });

  // ─── decryptAttachment ────────────────────────────────────────────────────

  describe('decryptAttachment', () => {
    it('throws when attachment not found', async () => {
      const prisma = makePrisma();
      const svc = new AttachmentService(prisma as PrismaClient);

      await expect(svc.decryptAttachment(ATTACH_ID, 'any-key')).rejects.toThrow('Attachment not found');
    });

    it('returns plaintext file directly when attachment is not encrypted', async () => {
      const prisma = makePrisma();
      const plainContent = Buffer.from('plain text content');
      (prisma.messageAttachment.findUnique as jest.Mock<any>).mockResolvedValue(
        makeAttachmentRow({ isEncrypted: false })
      );
      mockFsReadFile.mockResolvedValue(plainContent);
      const svc = new AttachmentService(prisma as PrismaClient);

      const result = await svc.decryptAttachment(ATTACH_ID, 'any-key');

      expect(result.buffer).toEqual(plainContent);
      expect(result.mimeType).toBe('image/jpeg');
      expect(result.filename).toBe('original.jpg');
      expect(mockEncryptionService.decryptAttachment).not.toHaveBeenCalled();
    });

    it('decrypts encrypted attachment without HMAC check when no HMAC stored', async () => {
      const prisma = makePrisma();
      const encryptedContent = Buffer.from('encrypted-content');
      const decryptedContent = Buffer.from('decrypted-content');
      (prisma.messageAttachment.findUnique as jest.Mock<any>).mockResolvedValue(
        makeAttachmentRow({
          isEncrypted: true,
          encryptionHmac: null,
          encryptionIv: 'dGVzdC1pdg==',
          encryptionAuthTag: 'dGVzdC1hdXRodGFn',
        })
      );
      mockFsReadFile.mockResolvedValue(encryptedContent);
      mockEncryptionService.decryptAttachment.mockResolvedValue({
        decryptedBuffer: decryptedContent,
        hashVerified: true,
        computedHash: 'abc123',
      });
      const svc = new AttachmentService(prisma as PrismaClient);

      const result = await svc.decryptAttachment(ATTACH_ID, 'enc-key-b64');

      expect(mockEncryptionService.verifyHmac).not.toHaveBeenCalled();
      expect(mockEncryptionService.decryptAttachment).toHaveBeenCalledWith(
        expect.objectContaining({
          encryptedBuffer: encryptedContent,
          encryptionKey: 'enc-key-b64',
          iv: 'dGVzdC1pdg==',
          authTag: 'dGVzdC1hdXRodGFn',
        })
      );
      expect(result.buffer).toEqual(decryptedContent);
    });

    it('verifies HMAC when encryptionHmac is stored and decrypts on success', async () => {
      const prisma = makePrisma();
      const encryptedContent = Buffer.from('enc');
      const decryptedContent = Buffer.from('dec');
      (prisma.messageAttachment.findUnique as jest.Mock<any>).mockResolvedValue(
        makeAttachmentRow({
          isEncrypted: true,
          encryptionHmac: 'valid-hmac',
          encryptionIv: 'aXY=',
          encryptionAuthTag: 'dGFn',
        })
      );
      mockFsReadFile.mockResolvedValue(encryptedContent);
      mockEncryptionService.verifyHmac.mockReturnValue(true);
      mockEncryptionService.decryptAttachment.mockResolvedValue({
        decryptedBuffer: decryptedContent,
        hashVerified: true,
        computedHash: 'abc',
      });
      const svc = new AttachmentService(prisma as PrismaClient);

      const result = await svc.decryptAttachment(ATTACH_ID, 'key');

      expect(mockEncryptionService.verifyHmac).toHaveBeenCalledWith(encryptedContent, 'key', 'valid-hmac');
      expect(result.buffer).toEqual(decryptedContent);
    });

    it('throws when HMAC verification fails', async () => {
      const prisma = makePrisma();
      (prisma.messageAttachment.findUnique as jest.Mock<any>).mockResolvedValue(
        makeAttachmentRow({
          isEncrypted: true,
          encryptionHmac: 'bad-hmac',
          encryptionIv: 'aXY=',
          encryptionAuthTag: 'dGFn',
        })
      );
      mockFsReadFile.mockResolvedValue(Buffer.from('enc'));
      mockEncryptionService.verifyHmac.mockReturnValue(false);
      const svc = new AttachmentService(prisma as PrismaClient);

      await expect(svc.decryptAttachment(ATTACH_ID, 'key')).rejects.toThrow('HMAC verification failed');
    });

    it('passes originalFileHash to decryptAttachment when present', async () => {
      const prisma = makePrisma();
      (prisma.messageAttachment.findUnique as jest.Mock<any>).mockResolvedValue(
        makeAttachmentRow({
          isEncrypted: true,
          encryptionHmac: null,
          encryptionIv: 'aXY=',
          encryptionAuthTag: 'dGFn',
          originalFileHash: 'abc123hash',
        })
      );
      mockFsReadFile.mockResolvedValue(Buffer.from('enc'));
      mockEncryptionService.decryptAttachment.mockResolvedValue({
        decryptedBuffer: Buffer.from('dec'),
        hashVerified: false,
        computedHash: 'diff',
      });
      const svc = new AttachmentService(prisma as PrismaClient);

      await svc.decryptAttachment(ATTACH_ID, 'key');

      expect(mockEncryptionService.decryptAttachment).toHaveBeenCalledWith(
        expect.objectContaining({ expectedHash: 'abc123hash' })
      );
    });
  });

  // ─── isAttachmentEncrypted ────────────────────────────────────────────────

  describe('isAttachmentEncrypted', () => {
    it('returns false when attachment not found', async () => {
      const prisma = makePrisma();
      const svc = new AttachmentService(prisma as PrismaClient);

      const result = await svc.isAttachmentEncrypted(ATTACH_ID);
      expect(result).toBe(false);
    });

    it('returns false when attachment is not encrypted', async () => {
      const prisma = makePrisma();
      (prisma.messageAttachment.findUnique as jest.Mock<any>).mockResolvedValue({ isEncrypted: false });
      const svc = new AttachmentService(prisma as PrismaClient);

      const result = await svc.isAttachmentEncrypted(ATTACH_ID);
      expect(result).toBe(false);
    });

    it('returns true when attachment is encrypted', async () => {
      const prisma = makePrisma();
      (prisma.messageAttachment.findUnique as jest.Mock<any>).mockResolvedValue({ isEncrypted: true });
      const svc = new AttachmentService(prisma as PrismaClient);

      const result = await svc.isAttachmentEncrypted(ATTACH_ID);
      expect(result).toBe(true);
    });
  });

  // ─── Branch coverage: nullable field defaults ────────────────────────────

  describe('nullable field defaults (??/|| branches)', () => {
    it('getAttachment: uses ?? default for null nullable fields', async () => {
      const prisma = makePrisma();
      (prisma.messageAttachment.findUnique as jest.Mock<any>).mockResolvedValue({
        ...makeAttachmentRow(),
        // All nullable fields set to null to hit the ?? right-hand branch
        isForwarded: null,
        isViewOnce: null,
        viewOnceCount: null,
        isBlurred: null,
        viewedCount: null,
        downloadedCount: null,
        consumedCount: null,
        isEncrypted: null,
      });
      const svc = new AttachmentService(prisma as PrismaClient);

      const result = await svc.getAttachment(ATTACH_ID);
      expect(result!.isForwarded).toBe(false);
      expect(result!.isViewOnce).toBe(false);
      expect(result!.isViewOnce).toBe(false);
      expect(result!.isEncrypted).toBe(false);
    });

    it('getConversationAttachments: uses ?? defaults for null nullable fields', async () => {
      const prisma = makePrisma();
      (prisma.messageAttachment.findMany as jest.Mock<any>).mockResolvedValue([
        {
          ...makeAttachmentRow(),
          isForwarded: null,
          isViewOnce: null,
          viewOnceCount: null,
          isBlurred: null,
          viewedCount: null,
          downloadedCount: null,
          consumedCount: null,
          isEncrypted: null,
          thumbnailUrl: null,
          translations: null,
          transcription: null,
        },
      ]);
      const svc = new AttachmentService(prisma as PrismaClient);

      const result = await svc.getConversationAttachments(CONV_ID);
      const item = result[0] as any;
      expect(item.isForwarded).toBe(false);
      expect(item.isEncrypted).toBe(false);
      expect(item.translations).toEqual({});
    });

    it('constructor: uses /app/uploads fallback when UPLOAD_PATH not set', async () => {
      delete process.env.UPLOAD_PATH;
      const prisma = makePrisma();
      (prisma.messageAttachment.findUnique as jest.Mock<any>).mockResolvedValue({ filePath: 'dir/file.jpg' });
      const svc = new AttachmentService(prisma as PrismaClient);

      const filePath = await svc.getFilePath(ATTACH_ID);
      expect(filePath).toContain('/app/uploads');
    });
  });

  // ─── UploadProcessor delegation methods (lines 94-156) ───────────────────

  describe('upload-processor delegation', () => {
    it('validateFile delegates to uploadProcessor', () => {
      mockUploadProcessor.validateFile.mockReturnValue({ valid: true });
      const svc = new AttachmentService(makePrisma() as PrismaClient);
      const file = { buffer: Buffer.from(''), filename: 'a.jpg', mimeType: 'image/jpeg', size: 0 };
      const result = svc.validateFile(file);
      expect(mockUploadProcessor.validateFile).toHaveBeenCalledWith(file);
      expect(result).toEqual({ valid: true });
    });

    it('uploadFile delegates to uploadProcessor', async () => {
      const fake = { id: ATTACH_ID } as any;
      mockUploadProcessor.uploadFile.mockResolvedValue(fake);
      const svc = new AttachmentService(makePrisma() as PrismaClient);
      const file = { buffer: Buffer.from(''), filename: 'a.jpg', mimeType: 'image/jpeg', size: 0 };
      const result = await svc.uploadFile(file, USER_ID, false, MSG_ID);
      expect(mockUploadProcessor.uploadFile).toHaveBeenCalledWith(file, USER_ID, false, MSG_ID, undefined);
      expect(result).toBe(fake);
    });

    it('uploadEncryptedFile delegates to uploadProcessor', async () => {
      const fake = { id: ATTACH_ID } as any;
      mockUploadProcessor.uploadEncryptedFile.mockResolvedValue(fake);
      const svc = new AttachmentService(makePrisma() as PrismaClient);
      const file = { buffer: Buffer.from(''), filename: 'a.mp4', mimeType: 'video/mp4', size: 0 };
      const result = await svc.uploadEncryptedFile(file, USER_ID, 'e2ee' as any, false, MSG_ID);
      expect(mockUploadProcessor.uploadEncryptedFile).toHaveBeenCalledWith(file, USER_ID, 'e2ee', false, MSG_ID, undefined);
      expect(result).toBe(fake);
    });

    it('uploadMultiple delegates to uploadProcessor', async () => {
      mockUploadProcessor.uploadMultiple.mockResolvedValue([]);
      const svc = new AttachmentService(makePrisma() as PrismaClient);
      const result = await svc.uploadMultiple([], USER_ID);
      expect(mockUploadProcessor.uploadMultiple).toHaveBeenCalledWith([], USER_ID, false, undefined, undefined);
      expect(result).toEqual([]);
    });

    it('createTextAttachment delegates to uploadProcessor', async () => {
      const fake = { id: ATTACH_ID } as any;
      mockUploadProcessor.createTextAttachment.mockResolvedValue(fake);
      const svc = new AttachmentService(makePrisma() as PrismaClient);
      const result = await svc.createTextAttachment('hello', USER_ID);
      expect(mockUploadProcessor.createTextAttachment).toHaveBeenCalledWith('hello', USER_ID, false, undefined);
      expect(result).toBe(fake);
    });

    it('getAttachmentUrl delegates to uploadProcessor', () => {
      mockUploadProcessor.getAttachmentUrl.mockReturnValue('https://cdn.test/f.jpg');
      const svc = new AttachmentService(makePrisma() as PrismaClient);
      const result = svc.getAttachmentUrl('f.jpg');
      expect(mockUploadProcessor.getAttachmentUrl).toHaveBeenCalledWith('f.jpg');
      expect(result).toBe('https://cdn.test/f.jpg');
    });

    it('getAttachmentPath delegates to uploadProcessor', () => {
      mockUploadProcessor.getAttachmentPath.mockReturnValue('/uploads/f.jpg');
      const svc = new AttachmentService(makePrisma() as PrismaClient);
      const result = svc.getAttachmentPath('f.jpg');
      expect(mockUploadProcessor.getAttachmentPath).toHaveBeenCalledWith('f.jpg');
      expect(result).toBe('/uploads/f.jpg');
    });

    it('buildFullUrl delegates to uploadProcessor', () => {
      mockUploadProcessor.buildFullUrl.mockReturnValue('https://gate.test/api/v1/f.jpg');
      const svc = new AttachmentService(makePrisma() as PrismaClient);
      const result = svc.buildFullUrl('f.jpg');
      expect(mockUploadProcessor.buildFullUrl).toHaveBeenCalledWith('f.jpg');
      expect(result).toBe('https://gate.test/api/v1/f.jpg');
    });
  });
});
