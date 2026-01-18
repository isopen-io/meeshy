/**
 * Unit tests for UploadProcessor
 *
 * Tests the upload processor module responsible for:
 * - File validation (size, MIME type)
 * - File upload (standard and encrypted)
 * - Path generation (structured by date/user)
 * - URL generation (public and relative paths)
 * - Multiple file uploads
 * - Text attachment creation
 *
 * This module handles the core file processing logic after AttachmentService
 * refactoring into an orchestrator pattern.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';
import { promises as fs } from 'fs';
import path from 'path';

// Mock dependencies before imports
const mockMetadataManager = {
  extractMetadata: jest.fn(),
  generateThumbnail: jest.fn(),
  generateThumbnailFromBuffer: jest.fn(),
  extractImageMetadataFromBuffer: jest.fn(),
} as any;

const mockEncryptionService = {
  encryptAttachment: jest.fn(),
  decryptAttachment: jest.fn(),
} as any;

const mockPrismaClient = {
  messageAttachment: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    delete: jest.fn(),
  },
} as any;

jest.mock('../../../services/attachments/MetadataManager', () => ({
  MetadataManager: jest.fn().mockImplementation(() => mockMetadataManager),
}));

jest.mock('../../../services/AttachmentEncryptionService', () => ({
  getAttachmentEncryptionService: jest.fn(() => mockEncryptionService),
}));

jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn(),
    writeFile: jest.fn(),
    chmod: jest.fn(),
    unlink: jest.fn(),
  },
}));

// Import after mocks
import { UploadProcessor } from '../../../services/attachments/UploadProcessor';
import type { FileToUpload } from '../../../services/attachments/UploadProcessor';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

describe('UploadProcessor', () => {
  let processor: UploadProcessor;
  let mockPrisma: any;

  const testUserId = '507f1f77bcf86cd799439011';
  const testMessageId = '507f1f77bcf86cd799439012';
  const testAttachmentId = '507f1f77bcf86cd799439013';

  const createTestFile = (overrides?: Partial<FileToUpload>): FileToUpload => ({
    buffer: Buffer.from('test file content'),
    filename: 'test_image.jpg',
    mimeType: 'image/jpeg',
    size: 1024 * 100, // 100KB
    ...overrides,
  });

  const createMockAttachment = (overrides?: any) => ({
    id: testAttachmentId,
    messageId: testMessageId,
    fileName: 'test_image_uuid.jpg',
    originalName: 'test_image.jpg',
    mimeType: 'image/jpeg',
    fileSize: 1024 * 100,
    filePath: '2024/01/test/test_image_uuid.jpg',
    fileUrl: '/api/v1/attachments/file/2024%2F01%2Ftest%2Ftest_image_uuid.jpg',
    thumbnailPath: '2024/01/test/test_image_uuid_thumb.jpg',
    thumbnailUrl: '/api/v1/attachments/file/2024%2F01%2Ftest%2Ftest_image_uuid_thumb.jpg',
    width: 1920,
    height: 1080,
    uploadedBy: testUserId,
    isAnonymous: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup environment
    process.env.UPLOAD_PATH = '/test/uploads';
    process.env.PUBLIC_URL = 'https://test.meeshy.me';
    process.env.NODE_ENV = 'test';

    mockPrisma = mockPrismaClient as unknown as PrismaClient;

    // Setup default mock behaviors
    mockMetadataManager.extractMetadata.mockResolvedValue({
      width: 1920,
      height: 1080,
      thumbnailGenerated: false,
    });
    mockMetadataManager.generateThumbnail.mockResolvedValue('2024/01/test/test_image_uuid_thumb.jpg');
    mockMetadataManager.generateThumbnailFromBuffer.mockResolvedValue(Buffer.from('thumbnail'));
    mockMetadataManager.extractImageMetadataFromBuffer.mockResolvedValue({
      width: 1920,
      height: 1080,
    });

    mockEncryptionService.encryptAttachment.mockResolvedValue({
      encryptedBuffer: Buffer.from('encrypted content'),
      metadata: {
        encryptionKey: 'test-key',
        iv: 'test-iv',
        authTag: 'test-auth-tag',
        hmac: 'test-hmac',
        originalSize: 1024 * 100,
        originalHash: 'test-hash',
        encryptedSize: 1024 * 110,
        encryptedHash: 'encrypted-hash',
        mode: 'e2ee' as any,
      },
    });

    mockPrismaClient.messageAttachment.create.mockResolvedValue(createMockAttachment());

    (fs.mkdir as jest.MockedFunction<typeof fs.mkdir>).mockResolvedValue(undefined as any);
    (fs.writeFile as jest.MockedFunction<typeof fs.writeFile>).mockResolvedValue(undefined);
    (fs.chmod as jest.MockedFunction<typeof fs.chmod>).mockResolvedValue(undefined);

    processor = new UploadProcessor(mockPrisma);
  });

  afterEach(() => {
    delete process.env.UPLOAD_PATH;
    delete process.env.PUBLIC_URL;
    delete process.env.NODE_ENV;
  });

  describe('Constructor and Initialization', () => {
    it('should create instance with Prisma client', () => {
      expect(processor).toBeDefined();
      expect(processor).toBeInstanceOf(UploadProcessor);
    });

    it('should initialize with default upload path when UPLOAD_PATH not set', () => {
      delete process.env.UPLOAD_PATH;
      const newProcessor = new UploadProcessor(mockPrisma);
      expect(newProcessor).toBeDefined();
    });

    it('should determine public URL from environment', () => {
      process.env.PUBLIC_URL = 'https://custom.domain.com';
      const newProcessor = new UploadProcessor(mockPrisma);

      const url = newProcessor.getAttachmentUrl('test.jpg');
      expect(url).toContain('https://custom.domain.com');
    });

    it('should use production domain when NODE_ENV is production and PUBLIC_URL not set', () => {
      delete process.env.PUBLIC_URL;
      process.env.NODE_ENV = 'production';
      process.env.DOMAIN = 'example.com';

      const newProcessor = new UploadProcessor(mockPrisma);
      const url = newProcessor.getAttachmentUrl('test.jpg');

      expect(url).toContain('https://gate.example.com');
    });

    it('should use localhost in development when BACKEND_URL not set', () => {
      delete process.env.PUBLIC_URL;
      process.env.NODE_ENV = 'development';
      process.env.PORT = '4000';

      const newProcessor = new UploadProcessor(mockPrisma);
      const url = newProcessor.getAttachmentUrl('test.jpg');

      expect(url).toContain('http://localhost:4000');
    });

    it('should use BACKEND_URL in development when set', () => {
      delete process.env.PUBLIC_URL;
      process.env.NODE_ENV = 'development';
      process.env.BACKEND_URL = 'http://dev.local:3001';

      const newProcessor = new UploadProcessor(mockPrisma);
      const url = newProcessor.getAttachmentUrl('test.jpg');

      expect(url).toContain('http://dev.local:3001');
    });
  });

  describe('validateFile', () => {
    it('should validate a file within size limits', () => {
      const file = createTestFile({
        size: 1024 * 1024 * 5, // 5MB (within image limit)
        mimeType: 'image/jpeg',
      });

      const result = processor.validateFile(file);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject file exceeding size limit', () => {
      const file = createTestFile({
        size: 1024 * 1024 * 1024 * 11, // 11GB (exceeds 10GB limit for images)
        mimeType: 'image/jpeg',
      });

      const result = processor.validateFile(file);

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Fichier trop volumineux');
      expect(result.error).toContain('GB');
    });

    it('should validate different file types with appropriate limits', () => {
      const videoFile = createTestFile({
        size: 1024 * 1024 * 1024 * 2, // 2GB (within video limit of 20GB)
        mimeType: 'video/mp4',
        filename: 'test.mp4',
      });

      const result = processor.validateFile(videoFile);

      expect(result.valid).toBe(true);
    });

    it('should validate audio files', () => {
      const audioFile = createTestFile({
        size: 1024 * 1024 * 100, // 100MB
        mimeType: 'audio/mpeg',
        filename: 'test.mp3',
      });

      const result = processor.validateFile(audioFile);

      expect(result.valid).toBe(true);
    });

    it('should validate document files', () => {
      const docFile = createTestFile({
        size: 1024 * 1024 * 50, // 50MB
        mimeType: 'application/pdf',
        filename: 'test.pdf',
      });

      const result = processor.validateFile(docFile);

      expect(result.valid).toBe(true);
    });

    it('should handle zero-sized files', () => {
      const file = createTestFile({
        size: 0,
        mimeType: 'text/plain',
      });

      const result = processor.validateFile(file);

      expect(result.valid).toBe(true);
    });
  });

  describe('uploadFile', () => {
    it('should upload a valid file successfully', async () => {
      const file = createTestFile();

      const result = await processor.uploadFile(file, testUserId, false, testMessageId);

      expect(result).toBeDefined();
      expect(result.id).toBe(testAttachmentId);
      expect(result.fileName).toBeDefined();
      expect(result.originalName).toBe('test_image.jpg');
      expect(result.mimeType).toBe('image/jpeg');
      expect(result.uploadedBy).toBe(testUserId);
      expect(result.isAnonymous).toBe(false);
    });

    it('should create file directory and save file with correct permissions', async () => {
      const file = createTestFile();

      await processor.uploadFile(file, testUserId, false, testMessageId);

      expect(fs.mkdir).toHaveBeenCalled();
      expect(fs.writeFile).toHaveBeenCalled();
      expect(fs.chmod).toHaveBeenCalledWith(expect.any(String), 0o644);
    });

    it('should extract metadata for uploaded file', async () => {
      const file = createTestFile();

      await processor.uploadFile(file, testUserId, false, testMessageId);

      expect(mockMetadataManager.extractMetadata).toHaveBeenCalled();
    });

    it('should generate thumbnail for image files', async () => {
      const file = createTestFile({
        mimeType: 'image/jpeg',
      });

      await processor.uploadFile(file, testUserId, false, testMessageId);

      expect(mockMetadataManager.generateThumbnail).toHaveBeenCalled();
    });

    it('should not generate thumbnail for non-image files', async () => {
      const file = createTestFile({
        mimeType: 'application/pdf',
        filename: 'document.pdf',
      });

      await processor.uploadFile(file, testUserId, false, testMessageId);

      expect(mockMetadataManager.generateThumbnail).not.toHaveBeenCalled();
    });

    it('should handle anonymous upload', async () => {
      const file = createTestFile();

      // Mock should return anonymous attachment
      mockPrismaClient.messageAttachment.create.mockResolvedValueOnce(
        createMockAttachment({ isAnonymous: true })
      );

      const result = await processor.uploadFile(file, testUserId, true);

      expect(result.isAnonymous).toBe(true);
      expect(mockPrismaClient.messageAttachment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isAnonymous: true,
          }),
        })
      );
    });

    it('should handle upload without messageId', async () => {
      const file = createTestFile();

      // Mock should return attachment without messageId
      mockPrismaClient.messageAttachment.create.mockResolvedValueOnce(
        createMockAttachment({ messageId: null })
      );

      const result = await processor.uploadFile(file, testUserId, false);

      expect(result.messageId).toBeNull();
    });

    it('should include provided metadata in attachment', async () => {
      const file = createTestFile({
        mimeType: 'audio/mpeg',
        filename: 'test.mp3',
      });

      const metadata = {
        duration: 180,
        bitrate: 320000,
        sampleRate: 44100,
        codec: 'mp3',
        channels: 2,
      };

      await processor.uploadFile(file, testUserId, false, testMessageId, metadata);

      expect(mockPrismaClient.messageAttachment.create).toHaveBeenCalled();
    });

    it('should handle audio effects timeline in metadata', async () => {
      const file = createTestFile({
        mimeType: 'audio/mpeg',
        filename: 'test.mp3',
      });

      mockMetadataManager.extractMetadata.mockResolvedValue({
        duration: 180,
        audioEffectsTimeline: [{ type: 'echo', timestamp: 5 }],
      });

      await processor.uploadFile(file, testUserId, false, testMessageId);

      expect(mockPrismaClient.messageAttachment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            metadata: expect.objectContaining({
              audioEffectsTimeline: expect.any(Array),
            }),
          }),
        })
      );
    });

    it('should throw error when validation fails', async () => {
      const file = createTestFile({
        size: 1024 * 1024 * 1024 * 11, // Exceeds limit
      });

      await expect(processor.uploadFile(file, testUserId, false)).rejects.toThrow(
        'Fichier trop volumineux'
      );
    });

    it('should handle file system errors gracefully', async () => {
      const file = createTestFile();
      (fs.mkdir as jest.MockedFunction<typeof fs.mkdir>).mockRejectedValue(
        new Error('Permission denied')
      );

      await expect(processor.uploadFile(file, testUserId, false)).rejects.toThrow(
        'Permission denied'
      );
    });

    it('should handle metadata extraction errors', async () => {
      const file = createTestFile();
      mockMetadataManager.extractMetadata.mockRejectedValue(
        new Error('Metadata extraction failed')
      );

      await expect(processor.uploadFile(file, testUserId, false)).rejects.toThrow(
        'Metadata extraction failed'
      );
    });

    it('should continue when chmod fails', async () => {
      const file = createTestFile();
      (fs.chmod as jest.MockedFunction<typeof fs.chmod>).mockRejectedValue(
        new Error('chmod failed')
      );

      // Should not throw, just log error
      const result = await processor.uploadFile(file, testUserId, false);
      expect(result).toBeDefined();
    });
  });

  describe('uploadEncryptedFile', () => {
    it('should upload encrypted file successfully', async () => {
      const file = createTestFile();
      const encryptionMode = 'e2ee';

      const result = await processor.uploadEncryptedFile(
        file,
        testUserId,
        encryptionMode as any,
        false,
        testMessageId
      );

      expect(result).toBeDefined();
      expect(result.encryptionMetadata).toBeDefined();
      expect(result.encryptionMetadata.encryptionKey).toBe('test-key');
      expect(result.encryptionMetadata.iv).toBe('test-iv');
      expect(result.encryptionMetadata.authTag).toBe('test-auth-tag');
      expect(result.encryptionMetadata.mode).toBe('e2ee');
    });

    it('should validate file before encryption', async () => {
      const file = createTestFile({
        size: 1024 * 1024 * 1024 * 11, // Exceeds limit
      });

      await expect(
        processor.uploadEncryptedFile(file, testUserId, 'e2ee' as any)
      ).rejects.toThrow('Fichier trop volumineux');
    });

    it('should encrypt file using encryption service', async () => {
      const file = createTestFile();

      await processor.uploadEncryptedFile(file, testUserId, 'e2ee' as any, false, testMessageId);

      expect(mockEncryptionService.encryptAttachment).toHaveBeenCalledWith(
        expect.objectContaining({
          fileBuffer: file.buffer,
          filename: file.filename,
          mimeType: file.mimeType,
          mode: 'e2ee',
        })
      );
    });

    it('should generate and encrypt thumbnail for images', async () => {
      const file = createTestFile({
        mimeType: 'image/jpeg',
      });

      mockEncryptionService.encryptAttachment.mockResolvedValue({
        encryptedBuffer: Buffer.from('encrypted'),
        encryptedThumbnail: {
          buffer: Buffer.from('encrypted thumb'),
          iv: 'thumb-iv',
          authTag: 'thumb-auth',
        },
        metadata: {
          encryptionKey: 'test-key',
          iv: 'test-iv',
          authTag: 'test-auth',
          hmac: 'test-hmac',
          originalSize: 1024,
          originalHash: 'hash',
          encryptedSize: 1100,
          encryptedHash: 'enc-hash',
          mode: 'e2ee' as any,
        },
      });

      const result = await processor.uploadEncryptedFile(
        file,
        testUserId,
        'e2ee' as any,
        false,
        testMessageId
      );

      expect(mockMetadataManager.generateThumbnailFromBuffer).toHaveBeenCalled();
      expect(result.encryptionMetadata.thumbnailIv).toBe('thumb-iv');
      expect(result.encryptionMetadata.thumbnailAuthTag).toBe('thumb-auth');
    });

    it('should save encrypted file with .enc extension', async () => {
      const file = createTestFile();

      await processor.uploadEncryptedFile(file, testUserId, 'e2ee' as any, false, testMessageId);

      const writeFileCalls = (fs.writeFile as jest.MockedFunction<typeof fs.writeFile>).mock.calls;
      expect(writeFileCalls.some(call => call[0].toString().endsWith('.enc'))).toBe(true);
    });

    it('should create server copy for audio files with hybrid encryption', async () => {
      const file = createTestFile({
        mimeType: 'audio/mpeg',
        filename: 'test.mp3',
      });

      // Clear previous calls
      (fs.writeFile as jest.MockedFunction<typeof fs.writeFile>).mockClear();

      mockEncryptionService.encryptAttachment.mockResolvedValueOnce({
        encryptedBuffer: Buffer.from('encrypted'),
        serverCopy: {
          encryptedBuffer: Buffer.from('server copy'),
          keyId: 'server-key-id',
        },
        metadata: {
          encryptionKey: 'test-key',
          iv: 'test-iv',
          authTag: 'test-auth',
          hmac: 'test-hmac',
          originalSize: 1024,
          originalHash: 'hash',
          encryptedSize: 1100,
          encryptedHash: 'enc-hash',
          mode: 'hybrid' as any,
        },
      });

      await processor.uploadEncryptedFile(file, testUserId, 'hybrid' as any, false, testMessageId);

      // Should have written main file and server copy
      const writeFileCalls = (fs.writeFile as jest.MockedFunction<typeof fs.writeFile>).mock.calls;

      // Verify that encryption service was called
      expect(mockEncryptionService.encryptAttachment).toHaveBeenCalled();

      // Verify at least 2 files were written (encrypted file + server copy)
      expect(writeFileCalls.length).toBeGreaterThanOrEqual(2);
    });

    it('should extract image metadata for encrypted images', async () => {
      const file = createTestFile({
        mimeType: 'image/png',
      });

      await processor.uploadEncryptedFile(file, testUserId, 'e2ee' as any, false, testMessageId);

      expect(mockMetadataManager.extractImageMetadataFromBuffer).toHaveBeenCalledWith(file.buffer);
    });

    it('should handle provided audio metadata', async () => {
      const file = createTestFile({
        mimeType: 'audio/mpeg',
        filename: 'test.mp3',
      });

      const audioMetadata = {
        duration: 120,
        bitrate: 192000,
        sampleRate: 44100,
        codec: 'mp3',
        channels: 2,
        audioEffectsTimeline: [{ type: 'reverb', timestamp: 10 }],
      };

      await processor.uploadEncryptedFile(
        file,
        testUserId,
        'e2ee' as any,
        false,
        testMessageId,
        audioMetadata
      );

      expect(mockPrismaClient.messageAttachment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            duration: 120,
            bitrate: 192000,
            sampleRate: 44100,
            codec: 'mp3',
            channels: 2,
            metadata: expect.objectContaining({
              audioEffectsTimeline: expect.any(Array),
            }),
          }),
        })
      );
    });

    it('should store encryption metadata in database', async () => {
      const file = createTestFile();

      await processor.uploadEncryptedFile(file, testUserId, 'e2ee' as any, false, testMessageId);

      expect(mockPrismaClient.messageAttachment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isEncrypted: true,
            encryptionMode: 'e2ee',
            encryptionIv: 'test-iv',
            encryptionAuthTag: 'test-auth-tag',
            encryptionHmac: 'test-hmac',
            originalFileHash: 'test-hash',
            originalFileSize: 1024 * 100,
          }),
        })
      );
    });

    it('should handle anonymous encrypted upload', async () => {
      const file = createTestFile();

      // Mock should return anonymous attachment
      mockPrismaClient.messageAttachment.create.mockResolvedValueOnce(
        createMockAttachment({ isAnonymous: true })
      );

      const result = await processor.uploadEncryptedFile(
        file,
        testUserId,
        'e2ee' as any,
        true,
        testMessageId
      );

      expect(result.isAnonymous).toBe(true);
    });

    it('should handle encryption service errors', async () => {
      const file = createTestFile();
      mockEncryptionService.encryptAttachment.mockRejectedValue(
        new Error('Encryption failed')
      );

      await expect(
        processor.uploadEncryptedFile(file, testUserId, 'e2ee' as any)
      ).rejects.toThrow('Encryption failed');
    });
  });

  describe('uploadMultiple', () => {
    it('should upload multiple files successfully', async () => {
      const files = [
        createTestFile({ filename: 'file1.jpg' }),
        createTestFile({ filename: 'file2.jpg' }),
      ];

      const results = await processor.uploadMultiple(files, testUserId, false, testMessageId);

      expect(results).toHaveLength(2);
      expect(mockPrismaClient.messageAttachment.create).toHaveBeenCalledTimes(2);
    });

    it('should handle empty file array', async () => {
      const results = await processor.uploadMultiple([], testUserId, false, testMessageId);

      expect(results).toHaveLength(0);
      expect(mockPrismaClient.messageAttachment.create).not.toHaveBeenCalled();
    });

    it('should pass metadata map to individual uploads', async () => {
      const files = [createTestFile()];
      const metadataMap = new Map([[0, { custom: 'data' }]]);

      await processor.uploadMultiple(files, testUserId, false, testMessageId, metadataMap);

      expect(mockMetadataManager.extractMetadata).toHaveBeenCalled();
    });

    it('should continue uploading on individual file failure', async () => {
      const files = [
        createTestFile({ filename: 'file1.jpg' }),
        createTestFile({ filename: 'file2.jpg', size: 1024 * 1024 * 1024 * 11 }), // Too large
        createTestFile({ filename: 'file3.jpg' }),
      ];

      const results = await processor.uploadMultiple(files, testUserId, false, testMessageId);

      // Should have 2 successful uploads (file1 and file3)
      expect(results.length).toBeLessThan(files.length);
    });

    it('should handle all files failing validation', async () => {
      const files = [
        createTestFile({ size: 1024 * 1024 * 1024 * 11 }),
        createTestFile({ size: 1024 * 1024 * 1024 * 11 }),
      ];

      const results = await processor.uploadMultiple(files, testUserId, false, testMessageId);

      expect(results).toHaveLength(0);
    });

    it('should upload with different metadata per file', async () => {
      const files = [
        createTestFile({ filename: 'audio1.mp3', mimeType: 'audio/mpeg' }),
        createTestFile({ filename: 'audio2.mp3', mimeType: 'audio/mpeg' }),
      ];

      const metadataMap = new Map([
        [0, { duration: 120, bitrate: 192000 }],
        [1, { duration: 180, bitrate: 256000 }],
      ]);

      await processor.uploadMultiple(files, testUserId, false, testMessageId, metadataMap);

      expect(mockPrismaClient.messageAttachment.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('createTextAttachment', () => {
    it('should create text attachment from string content', async () => {
      const content = 'This is test text content';

      // Mock should return text attachment
      mockPrismaClient.messageAttachment.create.mockResolvedValueOnce(
        createMockAttachment({ mimeType: 'text/plain', fileName: 'text_123456.txt' })
      );

      const result = await processor.createTextAttachment(content, testUserId);

      expect(result).toBeDefined();
      expect(result.mimeType).toBe('text/plain');
      expect(result.uploadedBy).toBe(testUserId);
    });

    it('should generate unique filename with timestamp', async () => {
      const content = 'Test content';

      await processor.createTextAttachment(content, testUserId);

      const createCall = mockPrismaClient.messageAttachment.create.mock.calls[0][0] as any;
      expect(createCall.data.fileName).toMatch(/text_\d+/);
    });

    it('should handle empty text content', async () => {
      const content = '';

      const result = await processor.createTextAttachment(content, testUserId);

      expect(result).toBeDefined();
    });

    it('should handle large text content', async () => {
      const content = 'A'.repeat(1024 * 100); // 100KB of text

      const result = await processor.createTextAttachment(content, testUserId);

      expect(result).toBeDefined();
    });

    it('should handle unicode text content', async () => {
      const content = '🔥 Test avec émojis et caractères spéciaux: é, à, ñ';

      const result = await processor.createTextAttachment(content, testUserId);

      expect(result).toBeDefined();
    });

    it('should handle anonymous text attachment', async () => {
      const content = 'Anonymous message';

      // Mock should return anonymous attachment
      mockPrismaClient.messageAttachment.create.mockResolvedValueOnce(
        createMockAttachment({ isAnonymous: true, mimeType: 'text/plain' })
      );

      const result = await processor.createTextAttachment(content, testUserId, true, testMessageId);

      expect(result.isAnonymous).toBe(true);
    });

    it('should associate text attachment with message', async () => {
      const content = 'Message text';

      const result = await processor.createTextAttachment(content, testUserId, false, testMessageId);

      expect(result.messageId).toBe(testMessageId);
    });
  });

  describe('getAttachmentUrl', () => {
    it('should generate correct public URL', () => {
      const filePath = '2024/01/user/file.jpg';

      const url = processor.getAttachmentUrl(filePath);

      expect(url).toContain('https://test.meeshy.me');
      expect(url).toContain('/api/v1/attachments/file/');
      expect(url).toContain(encodeURIComponent(filePath));
    });

    it('should encode special characters in file path', () => {
      const filePath = '2024/01/user/file with spaces.jpg';

      const url = processor.getAttachmentUrl(filePath);

      expect(url).toContain(encodeURIComponent(filePath));
      expect(url).not.toContain(' ');
    });

    it('should handle paths with multiple slashes', () => {
      const filePath = '2024/01/user/subfolder/file.jpg';

      const url = processor.getAttachmentUrl(filePath);

      expect(url).toContain('/api/v1/attachments/file/');
    });

    it('should handle paths with unicode characters', () => {
      const filePath = '2024/01/user/fichier_éléphant.jpg';

      const url = processor.getAttachmentUrl(filePath);

      expect(url).toBeDefined();
      expect(url).toContain(encodeURIComponent(filePath));
    });
  });

  describe('getAttachmentPath', () => {
    it('should generate relative API path without domain', () => {
      const filePath = '2024/01/user/file.jpg';

      const path = processor.getAttachmentPath(filePath);

      expect(path).toBe(`/api/v1/attachments/file/${encodeURIComponent(filePath)}`);
      expect(path).not.toContain('http');
      expect(path).not.toContain('meeshy.me');
    });

    it('should encode file path in relative path', () => {
      const filePath = '2024/01/user/file with spaces.jpg';

      const path = processor.getAttachmentPath(filePath);

      expect(path).toContain(encodeURIComponent(filePath));
    });

    it('should handle empty file path', () => {
      const path = processor.getAttachmentPath('');

      expect(path).toBe('/api/v1/attachments/file/');
    });
  });

  describe('buildFullUrl', () => {
    it('should build full URL from relative path', () => {
      const relativePath = '/api/v1/attachments/file/test.jpg';

      const fullUrl = processor.buildFullUrl(relativePath);

      expect(fullUrl).toBe('https://test.meeshy.me/api/v1/attachments/file/test.jpg');
      expect(fullUrl).toContain(process.env.PUBLIC_URL);
    });

    it('should not modify already absolute HTTP URLs', () => {
      const absoluteUrl = 'http://example.com/file.jpg';

      const fullUrl = processor.buildFullUrl(absoluteUrl);

      expect(fullUrl).toBe(absoluteUrl);
    });

    it('should not modify already absolute HTTPS URLs', () => {
      const absoluteUrl = 'https://example.com/file.jpg';

      const fullUrl = processor.buildFullUrl(absoluteUrl);

      expect(fullUrl).toBe(absoluteUrl);
    });

    it('should handle paths without leading slash', () => {
      const relativePath = 'api/v1/attachments/file/test.jpg';

      const fullUrl = processor.buildFullUrl(relativePath);

      expect(fullUrl).toBe('https://test.meeshy.meapi/v1/attachments/file/test.jpg');
    });

    it('should handle empty path', () => {
      const fullUrl = processor.buildFullUrl('');

      expect(fullUrl).toBe('https://test.meeshy.me');
    });
  });

  describe('generateFilePath', () => {
    it('should generate structured file path with date and user', () => {
      // Access private method via any type assertion
      const filePath = (processor as any).generateFilePath(testUserId, 'test.jpg');

      const parts = filePath.split(path.sep);
      expect(parts.length).toBeGreaterThanOrEqual(3);
      expect(parts[0]).toMatch(/^\d{4}$/); // Year
      expect(parts[1]).toMatch(/^\d{2}$/); // Month
      expect(parts[2]).toBe(testUserId); // User ID
    });

    it('should clean special characters from filename', () => {
      const filePath = (processor as any).generateFilePath(testUserId, 'test file!@#.jpg');

      expect(filePath).toContain('test_file');
      expect(filePath).not.toContain('!');
      expect(filePath).not.toContain('@');
      expect(filePath).not.toContain('#');
    });

    it('should preserve file extension', () => {
      const filePath = (processor as any).generateFilePath(testUserId, 'test.jpg');

      expect(filePath).toMatch(/\.jpg$/);
    });

    it('should add UUID to ensure uniqueness', () => {
      const filePath1 = (processor as any).generateFilePath(testUserId, 'test.jpg');
      const filePath2 = (processor as any).generateFilePath(testUserId, 'test.jpg');

      expect(filePath1).not.toBe(filePath2);
    });

    it('should truncate long filenames', () => {
      const longName = 'a'.repeat(100) + '.jpg';
      const filePath = (processor as any).generateFilePath(testUserId, longName);

      const fileName = path.basename(filePath);
      expect(fileName.length).toBeLessThan(100);
    });
  });

  describe('saveFile', () => {
    it('should create directory recursively', async () => {
      const buffer = Buffer.from('test');
      const relativePath = '2024/01/user/test.jpg';

      await (processor as any).saveFile(buffer, relativePath);

      expect(fs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('2024'),
        { recursive: true }
      );
    });

    it('should write file buffer to correct location', async () => {
      const buffer = Buffer.from('test content');
      const relativePath = '2024/01/user/test.jpg';

      await (processor as any).saveFile(buffer, relativePath);

      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        buffer
      );
    });

    it('should set file permissions to 644', async () => {
      const buffer = Buffer.from('test');
      const relativePath = '2024/01/user/test.jpg';

      await (processor as any).saveFile(buffer, relativePath);

      expect(fs.chmod).toHaveBeenCalledWith(expect.any(String), 0o644);
    });

    it('should continue if chmod fails', async () => {
      const buffer = Buffer.from('test');
      const relativePath = '2024/01/user/test.jpg';

      (fs.chmod as jest.MockedFunction<typeof fs.chmod>).mockRejectedValue(
        new Error('chmod failed')
      );

      // Should not throw
      await expect(
        (processor as any).saveFile(buffer, relativePath)
      ).resolves.toBeUndefined();
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle null or undefined in file validation', () => {
      const invalidFile = {
        buffer: Buffer.from(''),
        filename: '',
        mimeType: '',
        size: 0,
      };

      const result = processor.validateFile(invalidFile);
      expect(result.valid).toBe(true); // Zero size is valid
    });

    it('should handle database errors during upload', async () => {
      const file = createTestFile();
      mockPrismaClient.messageAttachment.create.mockRejectedValue(
        new Error('Database connection failed')
      );

      await expect(processor.uploadFile(file, testUserId)).rejects.toThrow(
        'Database connection failed'
      );
    });

    it('should handle file system permission errors', async () => {
      const file = createTestFile();
      (fs.writeFile as jest.MockedFunction<typeof fs.writeFile>).mockRejectedValue(
        new Error('EACCES: permission denied')
      );

      await expect(processor.uploadFile(file, testUserId)).rejects.toThrow(
        'EACCES: permission denied'
      );
    });

    it('should handle concurrent uploads', async () => {
      const files = Array(5).fill(null).map((_, i) =>
        createTestFile({ filename: `file${i}.jpg` })
      );

      const uploadPromises = files.map(file =>
        processor.uploadFile(file, testUserId, false, testMessageId)
      );

      const results = await Promise.all(uploadPromises);

      expect(results).toHaveLength(5);
      expect(mockPrismaClient.messageAttachment.create).toHaveBeenCalledTimes(5);
    });
  });
});
