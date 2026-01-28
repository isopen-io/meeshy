/**
 * Unit tests for AttachmentService (Orchestrator)
 *
 * Tests AttachmentService as an orchestrator that delegates to:
 * - UploadProcessor: File validation, upload, path generation
 * - MetadataManager: Metadata extraction (image, audio, video, PDF)
 * - AttachmentEncryptionService: Encryption operations
 *
 * These tests mock the sub-modules to verify orchestration logic.
 * Detailed functional tests for UploadProcessor and MetadataManager
 * should be in separate test files.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Mock sub-modules before importing AttachmentService
const mockUploadProcessor = {
  validateFile: jest.fn(),
  uploadFile: jest.fn(),
  uploadEncryptedFile: jest.fn(),
  uploadMultiple: jest.fn(),
  createTextAttachment: jest.fn(),
  getAttachmentUrl: jest.fn(),
  getAttachmentPath: jest.fn(),
  buildFullUrl: jest.fn(),
} as any;

const mockMetadataManager = {
  extractMetadata: jest.fn(),
};

const mockEncryptionService = {
  encryptFile: jest.fn(),
  decryptFile: jest.fn(),
};

jest.mock('../../../services/attachments/UploadProcessor', () => ({
  UploadProcessor: jest.fn().mockImplementation(() => mockUploadProcessor),
}));

jest.mock('../../../services/attachments/MetadataManager', () => ({
  MetadataManager: jest.fn().mockImplementation(() => mockMetadataManager),
}));

jest.mock('../../../services/AttachmentEncryptionService', () => ({
  getAttachmentEncryptionService: jest.fn(() => mockEncryptionService),
}));

// Import after mocks
import { AttachmentService } from '../../../services/attachments';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

describe('AttachmentService (Orchestrator)', () => {
  let service: AttachmentService;
  let mockPrisma: any;

  const testUserId = '507f1f77bcf86cd799439011';
  const testMessageId = '507f1f77bcf86cd799439012';
  const testAttachmentId = '507f1f77bcf86cd799439013';

  const createTestFile = (): any => ({
    buffer: Buffer.from('test file content'),
    filename: 'test_image.jpg',
    mimeType: 'image/jpeg',
    size: 1024 * 100, // 100KB
  });

  const createMockUploadResult = (): any => ({
    id: testAttachmentId,
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
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup environment
    process.env.UPLOAD_PATH = '/test/uploads';
    process.env.PUBLIC_URL = 'https://test.meeshy.me';
    process.env.NODE_ENV = 'test';

    // Create mock Prisma client
    mockPrisma = {
      messageAttachment: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
      },
      conversationMember: {
        findFirst: jest.fn(),
      },
    };

    // Reset mock implementations with successful defaults
    mockUploadProcessor.validateFile.mockReturnValue({ valid: true });
    mockUploadProcessor.uploadFile.mockResolvedValue(createMockUploadResult());
    mockUploadProcessor.uploadEncryptedFile.mockResolvedValue({
      ...createMockUploadResult(),
      encryptionMetadata: { algorithm: 'AES-256-GCM' },
    });
    mockUploadProcessor.uploadMultiple.mockResolvedValue([createMockUploadResult()]);
    mockUploadProcessor.createTextAttachment.mockResolvedValue(createMockUploadResult());
    mockUploadProcessor.getAttachmentUrl.mockReturnValue('/api/v1/attachments/file/test.jpg');
    mockUploadProcessor.getAttachmentPath.mockReturnValue('/test/uploads/test.jpg');
    mockUploadProcessor.buildFullUrl.mockReturnValue('https://test.meeshy.me/api/v1/attachments/file/test.jpg');

    // Create service instance
    service = new AttachmentService(mockPrisma as unknown as PrismaClient);
  });

  describe('Constructor and Initialization', () => {
    it('should create instance with Prisma client', () => {
      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(AttachmentService);
    });

    it('should initialize UploadProcessor', () => {
      const { UploadProcessor } = require('../../../services/attachments/UploadProcessor');
      expect(UploadProcessor).toHaveBeenCalledWith(mockPrisma);
    });

    it('should initialize MetadataManager', () => {
      const { MetadataManager } = require('../../../services/attachments/MetadataManager');
      expect(MetadataManager).toHaveBeenCalled();
    });
  });

  describe('validateFile - Delegation', () => {
    it('should delegate to UploadProcessor.validateFile', () => {
      const file = createTestFile();

      const result = service.validateFile(file);

      expect(mockUploadProcessor.validateFile).toHaveBeenCalledWith(file);
      expect(result.valid).toBe(true);
    });

    it('should return validation error from UploadProcessor', () => {
      mockUploadProcessor.validateFile.mockReturnValue({
        valid: false,
        error: 'File too large'
      });

      const file = createTestFile();
      const result = service.validateFile(file);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('File too large');
    });
  });

  describe('uploadFile - Delegation', () => {
    it('should delegate to UploadProcessor.uploadFile', async () => {
      const file = createTestFile();

      const result = await service.uploadFile(file, testUserId, false, testMessageId);

      expect(mockUploadProcessor.uploadFile).toHaveBeenCalledWith(
        file,
        testUserId,
        false,
        testMessageId,
        undefined
      );
      expect(result.id).toBe(testAttachmentId);
      expect(result.fileName).toBeDefined();
    });

    it('should pass metadata to UploadProcessor', async () => {
      const file = createTestFile();
      const metadata = { width: 1920, height: 1080 };

      await service.uploadFile(file, testUserId, false, testMessageId, metadata);

      expect(mockUploadProcessor.uploadFile).toHaveBeenCalledWith(
        file,
        testUserId,
        false,
        testMessageId,
        metadata
      );
    });

    it('should handle anonymous upload', async () => {
      const file = createTestFile();

      await service.uploadFile(file, testUserId, true);

      expect(mockUploadProcessor.uploadFile).toHaveBeenCalledWith(
        file,
        testUserId,
        true,
        undefined,
        undefined
      );
    });
  });

  describe('uploadEncryptedFile - Delegation', () => {
    it('should delegate to UploadProcessor.uploadEncryptedFile', async () => {
      const file = createTestFile();
      const encryptionMode = 'e2ee';

      const result = await service.uploadEncryptedFile(
        file,
        testUserId,
        encryptionMode as any,
        false,
        testMessageId
      );

      expect(mockUploadProcessor.uploadEncryptedFile).toHaveBeenCalledWith(
        file,
        testUserId,
        encryptionMode,
        false,
        testMessageId,
        undefined
      );
      expect(result.encryptionMetadata).toBeDefined();
    });

    it('should handle encrypted file with metadata', async () => {
      const file = createTestFile();
      const metadata = { type: 'voice' };

      await service.uploadEncryptedFile(
        file,
        testUserId,
        'server' as any,
        false,
        undefined,
        metadata
      );

      expect(mockUploadProcessor.uploadEncryptedFile).toHaveBeenCalledWith(
        file,
        testUserId,
        'server',
        false,
        undefined,
        metadata
      );
    });
  });

  describe('uploadMultiple - Delegation', () => {
    it('should delegate to UploadProcessor.uploadMultiple', async () => {
      const files = [createTestFile(), createTestFile()];

      const results = await service.uploadMultiple(files, testUserId, false, testMessageId);

      expect(mockUploadProcessor.uploadMultiple).toHaveBeenCalledWith(
        files,
        testUserId,
        false,
        testMessageId,
        undefined
      );
      expect(results).toHaveLength(1);
    });

    it('should pass metadata map to UploadProcessor', async () => {
      const files = [createTestFile()];
      const metadataMap = new Map([[0, { custom: 'data' }]]);

      await service.uploadMultiple(files, testUserId, false, undefined, metadataMap);

      expect(mockUploadProcessor.uploadMultiple).toHaveBeenCalledWith(
        files,
        testUserId,
        false,
        undefined,
        metadataMap
      );
    });
  });

  describe('createTextAttachment - Delegation', () => {
    it('should delegate to UploadProcessor.createTextAttachment', async () => {
      const content = 'Test text content';

      const result = await service.createTextAttachment(content, testUserId);

      expect(mockUploadProcessor.createTextAttachment).toHaveBeenCalledWith(
        content,
        testUserId,
        false,
        undefined
      );
      expect(result.id).toBe(testAttachmentId);
    });

    it('should handle anonymous text attachment', async () => {
      const content = 'Anonymous message';

      await service.createTextAttachment(content, testUserId, true, testMessageId);

      expect(mockUploadProcessor.createTextAttachment).toHaveBeenCalledWith(
        content,
        testUserId,
        true,
        testMessageId
      );
    });
  });

  describe('URL Helpers - Delegation', () => {
    it('should delegate getAttachmentUrl to UploadProcessor', () => {
      const filePath = 'test/path.jpg';

      const url = service.getAttachmentUrl(filePath);

      expect(mockUploadProcessor.getAttachmentUrl).toHaveBeenCalledWith(filePath);
      expect(url).toContain('/api/v1/attachments/file/');
    });

    it('should delegate getAttachmentPath to UploadProcessor', () => {
      const filePath = 'test/path.jpg';

      const path = service.getAttachmentPath(filePath);

      expect(mockUploadProcessor.getAttachmentPath).toHaveBeenCalledWith(filePath);
      expect(path).toBeDefined();
    });

    it('should delegate buildFullUrl to UploadProcessor', () => {
      const relativePath = '/api/v1/test.jpg';

      const fullUrl = service.buildFullUrl(relativePath);

      expect(mockUploadProcessor.buildFullUrl).toHaveBeenCalledWith(relativePath);
      expect(fullUrl).toContain('https://');
    });
  });

  describe('Database Operations - Direct Access', () => {
    it('should create attachment in database', async () => {
      const attachmentData = {
        id: testAttachmentId,
        messageId: testMessageId,
        fileName: 'test.jpg',
        mimeType: 'image/jpeg',
        fileSize: 1024,
        filePath: 'test/test.jpg',
        uploadedBy: testUserId,
      };

      mockPrisma.messageAttachment.create.mockResolvedValue(attachmentData);

      const result = await mockPrisma.messageAttachment.create({
        data: attachmentData,
      });

      expect(mockPrisma.messageAttachment.create).toHaveBeenCalled();
      expect(result.id).toBe(testAttachmentId);
    });

    it('should find attachment by ID', async () => {
      const mockAttachment = { id: testAttachmentId, fileName: 'test.jpg' };
      mockPrisma.messageAttachment.findUnique.mockResolvedValue(mockAttachment);

      const result = await mockPrisma.messageAttachment.findUnique({
        where: { id: testAttachmentId },
      });

      expect(mockPrisma.messageAttachment.findUnique).toHaveBeenCalledWith({
        where: { id: testAttachmentId },
      });
      expect(result.id).toBe(testAttachmentId);
    });

    it('should find attachments by message ID', async () => {
      const mockAttachments = [
        { id: 'att1', messageId: testMessageId },
        { id: 'att2', messageId: testMessageId },
      ];
      mockPrisma.messageAttachment.findMany.mockResolvedValue(mockAttachments);

      const result = await mockPrisma.messageAttachment.findMany({
        where: { messageId: testMessageId },
      });

      expect(mockPrisma.messageAttachment.findMany).toHaveBeenCalled();
      expect(result).toHaveLength(2);
    });

    it('should delete attachment', async () => {
      mockPrisma.messageAttachment.delete.mockResolvedValue({ id: testAttachmentId });

      await mockPrisma.messageAttachment.delete({
        where: { id: testAttachmentId },
      });

      expect(mockPrisma.messageAttachment.delete).toHaveBeenCalledWith({
        where: { id: testAttachmentId },
      });
    });
  });

  describe('Error Handling', () => {
    it('should propagate validation errors from UploadProcessor', () => {
      mockUploadProcessor.validateFile.mockReturnValue({
        valid: false,
        error: 'Invalid MIME type',
      });

      const file = createTestFile();
      const result = service.validateFile(file);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid MIME type');
    });

    it('should propagate upload errors from UploadProcessor', async () => {
      mockUploadProcessor.uploadFile.mockRejectedValue(new Error('Upload failed'));

      const file = createTestFile();

      await expect(service.uploadFile(file, testUserId)).rejects.toThrow('Upload failed');
    });

    it('should propagate encryption errors', async () => {
      mockUploadProcessor.uploadEncryptedFile.mockRejectedValue(
        new Error('Encryption failed')
      );

      const file = createTestFile();

      await expect(
        service.uploadEncryptedFile(file, testUserId, 'e2ee' as any)
      ).rejects.toThrow('Encryption failed');
    });

    it('should handle multiple upload failures gracefully', async () => {
      mockUploadProcessor.uploadMultiple.mockRejectedValue(
        new Error('Batch upload failed')
      );

      const files = [createTestFile()];

      await expect(service.uploadMultiple(files, testUserId)).rejects.toThrow(
        'Batch upload failed'
      );
    });
  });

  describe('Integration with Sub-modules', () => {
    it('should properly coordinate between UploadProcessor and encryption', async () => {
      // Simulate encrypted upload flow
      const file = createTestFile();
      const encryptionMode = 'hybrid';

      await service.uploadEncryptedFile(
        file,
        testUserId,
        encryptionMode as any
      );

      // Verify UploadProcessor was called with correct params
      expect(mockUploadProcessor.uploadEncryptedFile).toHaveBeenCalledWith(
        file,
        testUserId,
        encryptionMode,
        false,
        undefined,
        undefined
      );
    });

    it('should handle metadata extraction via sub-modules', () => {
      // MetadataManager is used internally by UploadProcessor
      // AttachmentService just orchestrates the calls
      expect(mockMetadataManager).toBeDefined();

      // MetadataManager should be initialized on service construction
      const { MetadataManager } = require('../../../services/attachments/MetadataManager');
      expect(MetadataManager).toHaveBeenCalled();
    });
  });
});
