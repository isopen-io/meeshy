/**
 * Unit tests for AttachmentService
 *
 * Comprehensive test suite covering:
 * - File validation (MIME type, size limits)
 * - File path generation
 * - File saving with security permissions
 * - Thumbnail generation for images
 * - Metadata extraction (image, audio, video, PDF, text)
 * - URL generation
 * - File upload (single and multiple)
 * - Attachment association to messages
 * - Attachment retrieval
 * - Attachment deletion
 * - Conversation attachments retrieval
 * - Text attachment creation
 *
 * Coverage target: > 65%
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock @meeshy/shared/types/attachment before any imports
const mockGetAttachmentType = jest.fn();
const mockGetSizeLimit = jest.fn();

jest.mock('@meeshy/shared/types/attachment', () => ({
  getAttachmentType: mockGetAttachmentType,
  getSizeLimit: mockGetSizeLimit,
  UPLOAD_LIMITS: {
    IMAGE: 2147483648, // 2GB
    DOCUMENT: 2147483648,
    AUDIO: 2147483648,
    VIDEO: 2147483648,
    TEXT: 2147483648,
    CODE: 2147483648,
  },
  ACCEPTED_MIME_TYPES: {
    IMAGE: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'],
    DOCUMENT: ['application/pdf', 'text/plain'],
    AUDIO: ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/webm'],
    VIDEO: ['video/mp4', 'video/webm', 'video/ogg'],
    TEXT: ['text/plain'],
    CODE: ['text/javascript', 'text/typescript', 'application/json'],
  },
}));

// Mock dependencies before importing the service
const mockSharp = jest.fn();
const mockSharpInstance = {
  resize: jest.fn().mockReturnThis(),
  jpeg: jest.fn().mockReturnThis(),
  toFile: jest.fn().mockResolvedValue(undefined),
  metadata: jest.fn().mockResolvedValue({ width: 1920, height: 1080 }),
};
mockSharp.mockReturnValue(mockSharpInstance);

jest.mock('sharp', () => mockSharp);

const mockFsPromises = {
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  chmod: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockResolvedValue(Buffer.from('test content')),
};

jest.mock('fs', () => ({
  promises: mockFsPromises,
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-1234'),
}));

const mockParseFile = jest.fn().mockResolvedValue({
  format: {
    duration: 120.5,
    bitrate: 128000,
    sampleRate: 44100,
    codec: 'mp3',
    codecProfile: 'mp3',
    numberOfChannels: 2,
  },
});

jest.mock('music-metadata', () => ({
  parseFile: mockParseFile,
}));

const mockPdfParseInstance = {
  getInfo: jest.fn().mockResolvedValue({ total: 10 }),
  destroy: jest.fn().mockResolvedValue(undefined),
};

const MockPDFParse = jest.fn().mockImplementation(() => mockPdfParseInstance);

jest.mock('pdf-parse', () => ({
  PDFParse: MockPDFParse,
}));

const mockFfprobe = jest.fn();
jest.mock('fluent-ffmpeg', () => ({
  ffprobe: mockFfprobe,
}));

// Import after mocks are set up
import { AttachmentService, FileToUpload, UploadResult } from '../../../services/AttachmentService';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

describe('AttachmentService', () => {
  let service: AttachmentService;
  let mockPrisma: any;

  // Sample test data
  const testUserId = '507f1f77bcf86cd799439011';
  const testMessageId = '507f1f77bcf86cd799439012';
  const testAttachmentId = '507f1f77bcf86cd799439013';
  const testConversationId = '507f1f77bcf86cd799439014';

  const createMockAttachment = (overrides: any = {}): any => ({
    id: testAttachmentId,
    messageId: testMessageId,
    fileName: 'test_image_test-uuid-1234.jpg',
    originalName: 'test_image.jpg',
    mimeType: 'image/jpeg',
    fileSize: 1024 * 100,
    filePath: '2024/01/507f1f77bcf86cd799439011/test_image_test-uuid-1234.jpg',
    fileUrl: '/api/v1/attachments/file/2024%2F01%2F507f1f77bcf86cd799439011%2Ftest_image_test-uuid-1234.jpg',
    thumbnailPath: '2024/01/507f1f77bcf86cd799439011/test_image_test-uuid-1234_thumb.jpg',
    thumbnailUrl: '/api/v1/attachments/file/2024%2F01%2F507f1f77bcf86cd799439011%2Ftest_image_test-uuid-1234_thumb.jpg',
    width: 1920,
    height: 1080,
    duration: null,
    bitrate: null,
    sampleRate: null,
    codec: null,
    channels: null,
    fps: null,
    videoCodec: null,
    pageCount: null,
    lineCount: null,
    metadata: null,
    uploadedBy: testUserId,
    isAnonymous: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  const createTestFile = (overrides: Partial<FileToUpload> = {}): FileToUpload => ({
    buffer: Buffer.from('test file content'),
    filename: 'test_image.jpg',
    mimeType: 'image/jpeg',
    size: 1024 * 100, // 100KB
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset environment variables
    process.env.UPLOAD_PATH = '/test/uploads';
    process.env.PUBLIC_URL = 'https://test.meeshy.me';
    process.env.NODE_ENV = 'test';

    // Setup default mock return values for attachment type utilities
    mockGetAttachmentType.mockImplementation((mimeType: string, filename?: string) => {
      if (mimeType.startsWith('image/')) return 'image';
      if (mimeType.startsWith('audio/')) return 'audio';
      if (mimeType.startsWith('video/')) return 'video';
      if (mimeType === 'application/pdf') return 'document';
      if (mimeType === 'text/plain') return 'text';
      if (mimeType === 'text/typescript' || mimeType === 'text/javascript') return 'code';
      if (filename) {
        const ext = filename.toLowerCase().split('.').pop();
        if (['sh', 'bash', 'ts', 'js', 'py'].includes(ext || '')) return 'code';
        if (['txt', 'log'].includes(ext || '')) return 'text';
      }
      return 'document';
    });

    mockGetSizeLimit.mockImplementation((type: string) => {
      return 2147483648; // 2GB for all types
    });

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

    // Create service instance
    service = new AttachmentService(mockPrisma as unknown as PrismaClient);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Constructor and URL Configuration', () => {
    it('should use PUBLIC_URL when defined', () => {
      process.env.PUBLIC_URL = 'https://custom.domain.com';
      const svc = new AttachmentService(mockPrisma);

      const url = svc.getAttachmentUrl('test/path.jpg');
      expect(url).toContain('https://custom.domain.com');
    });

    it('should use default domain in production when PUBLIC_URL not set', () => {
      delete process.env.PUBLIC_URL;
      process.env.NODE_ENV = 'production';
      process.env.DOMAIN = 'example.com';

      const svc = new AttachmentService(mockPrisma);
      const url = svc.getAttachmentUrl('test/path.jpg');
      expect(url).toContain('gate.example.com');
    });

    it('should use BACKEND_URL in development when PUBLIC_URL not set', () => {
      delete process.env.PUBLIC_URL;
      process.env.NODE_ENV = 'development';
      process.env.BACKEND_URL = 'http://localhost:4000';

      const svc = new AttachmentService(mockPrisma);
      const url = svc.getAttachmentUrl('test/path.jpg');
      expect(url).toContain('http://localhost:4000');
    });

    it('should use NEXT_PUBLIC_BACKEND_URL in development as fallback', () => {
      delete process.env.PUBLIC_URL;
      delete process.env.BACKEND_URL;
      process.env.NODE_ENV = 'development';
      process.env.NEXT_PUBLIC_BACKEND_URL = 'http://localhost:5000';

      const svc = new AttachmentService(mockPrisma);
      const url = svc.getAttachmentUrl('test/path.jpg');
      expect(url).toContain('http://localhost:5000');
    });

    it('should use PORT-based URL in development as final fallback', () => {
      delete process.env.PUBLIC_URL;
      delete process.env.BACKEND_URL;
      delete process.env.NEXT_PUBLIC_BACKEND_URL;
      process.env.NODE_ENV = 'development';
      process.env.PORT = '3001';

      const svc = new AttachmentService(mockPrisma);
      const url = svc.getAttachmentUrl('test/path.jpg');
      expect(url).toContain('http://localhost:3001');
    });

    it('should use default fallback when no environment variables set', () => {
      delete process.env.PUBLIC_URL;
      delete process.env.BACKEND_URL;
      delete process.env.NEXT_PUBLIC_BACKEND_URL;
      delete process.env.NODE_ENV;

      const svc = new AttachmentService(mockPrisma);
      const url = svc.getAttachmentUrl('test/path.jpg');
      expect(url).toContain('localhost:3000');
    });
  });

  describe('validateFile', () => {
    it('should validate a valid image file', () => {
      const file = createTestFile({
        mimeType: 'image/jpeg',
        size: 1024 * 100, // 100KB
      });

      const result = service.validateFile(file);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should validate a valid audio file', () => {
      const file = createTestFile({
        filename: 'audio.mp3',
        mimeType: 'audio/mpeg',
        size: 1024 * 1024 * 50, // 50MB
      });

      const result = service.validateFile(file);
      expect(result.valid).toBe(true);
    });

    it('should validate a valid video file', () => {
      const file = createTestFile({
        filename: 'video.mp4',
        mimeType: 'video/mp4',
        size: 1024 * 1024 * 500, // 500MB
      });

      const result = service.validateFile(file);
      expect(result.valid).toBe(true);
    });

    it('should validate a valid document file', () => {
      const file = createTestFile({
        filename: 'document.pdf',
        mimeType: 'application/pdf',
        size: 1024 * 1024 * 10, // 10MB
      });

      const result = service.validateFile(file);
      expect(result.valid).toBe(true);
    });

    it('should validate a code file by extension', () => {
      const file = createTestFile({
        filename: 'script.sh',
        mimeType: 'application/octet-stream',
        size: 1024, // 1KB
      });

      const result = service.validateFile(file);
      expect(result.valid).toBe(true);
    });

    it('should reject file exceeding size limit', () => {
      const file = createTestFile({
        size: 3 * 1024 * 1024 * 1024, // 3GB (exceeds 2GB limit)
      });

      const result = service.validateFile(file);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('GB');
    });

    it('should accept files at exactly the size limit', () => {
      const file = createTestFile({
        size: 2 * 1024 * 1024 * 1024, // Exactly 2GB
      });

      const result = service.validateFile(file);
      expect(result.valid).toBe(true);
    });

    it('should handle text files', () => {
      const file = createTestFile({
        filename: 'readme.txt',
        mimeType: 'text/plain',
        size: 1024,
      });

      const result = service.validateFile(file);
      expect(result.valid).toBe(true);
    });

    it('should handle unknown MIME types as documents', () => {
      const file = createTestFile({
        filename: 'unknown.xyz',
        mimeType: 'application/unknown',
        size: 1024,
      });

      const result = service.validateFile(file);
      expect(result.valid).toBe(true);
    });
  });

  describe('generateFilePath', () => {
    it('should generate path with correct structure', () => {
      const path = service.generateFilePath(testUserId, 'test_image.jpg');

      expect(path).toContain(testUserId);
      expect(path).toContain('test_image');
      expect(path).toContain('test-uuid-1234');
      expect(path).toContain('.jpg');
    });

    it('should clean special characters from filename', () => {
      const path = service.generateFilePath(testUserId, 'test@#$%image!.jpg');

      expect(path).toContain('test____image_');
      expect(path).not.toContain('@');
      expect(path).not.toContain('#');
    });

    it('should truncate long filenames', () => {
      const longName = 'a'.repeat(100) + '.jpg';
      const path = service.generateFilePath(testUserId, longName);

      // The clean name should be truncated to 50 chars
      const baseName = path.split('/').pop() || '';
      expect(baseName.length).toBeLessThan(100);
    });

    it('should handle files without extension', () => {
      const path = service.generateFilePath(testUserId, 'README');

      expect(path).toContain('README');
      expect(path).toContain('test-uuid-1234');
    });

    it('should include year and month in path', () => {
      const path = service.generateFilePath(testUserId, 'test.jpg');
      const parts = path.split('/');

      // Year should be 4 digits
      expect(parts[0]).toMatch(/^\d{4}$/);
      // Month should be 2 digits
      expect(parts[1]).toMatch(/^\d{2}$/);
    });
  });

  describe('saveFile', () => {
    it('should create directory and save file', async () => {
      const buffer = Buffer.from('test content');
      const relativePath = '2024/01/user123/test.jpg';

      await service.saveFile(buffer, relativePath);

      expect(mockFsPromises.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('2024/01/user123'),
        { recursive: true }
      );
      expect(mockFsPromises.writeFile).toHaveBeenCalled();
    });

    it('should set secure file permissions (644)', async () => {
      const buffer = Buffer.from('test content');
      const relativePath = '2024/01/user123/test.jpg';

      await service.saveFile(buffer, relativePath);

      expect(mockFsPromises.chmod).toHaveBeenCalledWith(
        expect.any(String),
        0o644
      );
    });

    it('should handle chmod errors gracefully', async () => {
      mockFsPromises.chmod.mockRejectedValueOnce(new Error('Permission denied'));

      const buffer = Buffer.from('test content');
      const relativePath = '2024/01/user123/test.jpg';

      // Should not throw
      await expect(service.saveFile(buffer, relativePath)).resolves.toBeUndefined();
    });
  });

  describe('generateThumbnail', () => {
    it('should generate thumbnail for image', async () => {
      const imagePath = '2024/01/user123/image.jpg';

      const result = await service.generateThumbnail(imagePath);

      expect(result).toContain('_thumb');
      expect(mockSharp).toHaveBeenCalled();
      expect(mockSharpInstance.resize).toHaveBeenCalledWith(300, 300, expect.any(Object));
      expect(mockSharpInstance.jpeg).toHaveBeenCalledWith({ quality: 80 });
      expect(mockSharpInstance.toFile).toHaveBeenCalled();
    });

    it('should return null on error', async () => {
      mockSharpInstance.toFile.mockRejectedValueOnce(new Error('Sharp error'));

      const result = await service.generateThumbnail('bad/path.jpg');

      expect(result).toBeNull();
    });
  });

  describe('extractImageMetadata', () => {
    it('should extract width and height', async () => {
      mockSharpInstance.metadata.mockResolvedValueOnce({ width: 1920, height: 1080 });

      const result = await service.extractImageMetadata('test/image.jpg');

      expect(result.width).toBe(1920);
      expect(result.height).toBe(1080);
    });

    it('should return 0 values on error', async () => {
      mockSharpInstance.metadata.mockRejectedValueOnce(new Error('Metadata error'));

      const result = await service.extractImageMetadata('bad/path.jpg');

      expect(result.width).toBe(0);
      expect(result.height).toBe(0);
    });

    it('should handle missing metadata values', async () => {
      mockSharpInstance.metadata.mockResolvedValueOnce({});

      const result = await service.extractImageMetadata('test/image.jpg');

      expect(result.width).toBe(0);
      expect(result.height).toBe(0);
    });
  });

  describe('extractAudioMetadata', () => {
    it('should extract audio metadata', async () => {
      mockParseFile.mockResolvedValueOnce({
        format: {
          duration: 120.7,
          bitrate: 128000,
          sampleRate: 44100,
          codec: 'mp3',
          numberOfChannels: 2,
        },
      });

      const result = await service.extractAudioMetadata('test/audio.mp3');

      expect(result.duration).toBe(121); // Rounded
      expect(result.bitrate).toBe(128000);
      expect(result.sampleRate).toBe(44100);
      expect(result.codec).toBe('mp3');
      expect(result.channels).toBe(2);
    });

    it('should use codecProfile as fallback', async () => {
      mockParseFile.mockResolvedValueOnce({
        format: {
          duration: 60,
          codecProfile: 'aac-lc',
        },
      });

      const result = await service.extractAudioMetadata('test/audio.m4a');

      expect(result.codec).toBe('aac-lc');
    });

    it('should return default values on error', async () => {
      mockParseFile.mockRejectedValueOnce(new Error('Parse error'));

      const result = await service.extractAudioMetadata('bad/audio.mp3');

      expect(result.duration).toBe(0);
      expect(result.bitrate).toBe(0);
      expect(result.sampleRate).toBe(0);
      expect(result.codec).toBe('unknown');
      expect(result.channels).toBe(1);
    });
  });

  describe('extractPdfMetadata', () => {
    it('should extract page count', async () => {
      mockPdfParseInstance.getInfo.mockResolvedValueOnce({ total: 25 });

      const result = await service.extractPdfMetadata('test/doc.pdf');

      expect(result.pageCount).toBe(25);
      expect(mockPdfParseInstance.destroy).toHaveBeenCalled();
    });

    it('should return 0 on error', async () => {
      mockPdfParseInstance.getInfo.mockRejectedValueOnce(new Error('PDF error'));

      const result = await service.extractPdfMetadata('bad/doc.pdf');

      expect(result.pageCount).toBe(0);
    });
  });

  describe('extractVideoMetadata', () => {
    it('should extract video metadata', async () => {
      mockFfprobe.mockImplementation((path: string, callback: Function) => {
        callback(null, {
          format: { duration: 300.5, bit_rate: '5000000' },
          streams: [{
            codec_type: 'video',
            width: 1920,
            height: 1080,
            codec_name: 'h264',
            r_frame_rate: '30/1',
          }],
        });
      });

      const result = await service.extractVideoMetadata('test/video.mp4');

      expect(result.duration).toBe(301); // Rounded
      expect(result.width).toBe(1920);
      expect(result.height).toBe(1080);
      expect(result.fps).toBe(30);
      expect(result.videoCodec).toBe('h264');
      expect(result.bitrate).toBe(5000000);
    });

    it('should handle fractional frame rates', async () => {
      mockFfprobe.mockImplementation((path: string, callback: Function) => {
        callback(null, {
          format: { duration: 60 },
          streams: [{
            codec_type: 'video',
            width: 1920,
            height: 1080,
            codec_name: 'h264',
            r_frame_rate: '24000/1001', // ~23.976 fps
          }],
        });
      });

      const result = await service.extractVideoMetadata('test/video.mp4');

      expect(result.fps).toBeCloseTo(23.98, 1);
    });

    it('should return default values when no video stream found', async () => {
      mockFfprobe.mockImplementation((path: string, callback: Function) => {
        callback(null, {
          format: {},
          streams: [{ codec_type: 'audio' }],
        });
      });

      const result = await service.extractVideoMetadata('test/audio-only.mp4');

      expect(result.duration).toBe(0);
      expect(result.width).toBe(0);
      expect(result.height).toBe(0);
      expect(result.fps).toBe(0);
      expect(result.videoCodec).toBe('unknown');
    });

    it('should reject on ffprobe error', async () => {
      mockFfprobe.mockImplementation((path: string, callback: Function) => {
        callback(new Error('ffprobe not found'), null);
      });

      await expect(service.extractVideoMetadata('test/video.mp4'))
        .rejects.toThrow('ffprobe not found');
    });

    it('should handle timeout', async () => {
      jest.useFakeTimers();

      mockFfprobe.mockImplementation(() => {
        // Never call the callback - simulates hanging
      });

      const promise = service.extractVideoMetadata('test/video.mp4');

      // Fast-forward past timeout
      jest.advanceTimersByTime(31000);

      await expect(promise).rejects.toThrow('timeout');

      jest.useRealTimers();
    });
  });

  describe('extractTextMetadata', () => {
    it('should count lines in text file', async () => {
      mockFsPromises.readFile.mockResolvedValueOnce('line1\nline2\nline3\nline4');

      const result = await service.extractTextMetadata('test/file.txt');

      expect(result.lineCount).toBe(4);
    });

    it('should handle empty files', async () => {
      mockFsPromises.readFile.mockResolvedValueOnce('');

      const result = await service.extractTextMetadata('test/empty.txt');

      expect(result.lineCount).toBe(1); // Empty string split returns one element
    });

    it('should return 0 on error', async () => {
      mockFsPromises.readFile.mockRejectedValueOnce(new Error('Read error'));

      const result = await service.extractTextMetadata('bad/file.txt');

      expect(result.lineCount).toBe(0);
    });
  });

  describe('URL generation methods', () => {
    beforeEach(() => {
      process.env.PUBLIC_URL = 'https://test.meeshy.me';
      service = new AttachmentService(mockPrisma);
    });

    it('getAttachmentUrl should generate full URL', () => {
      const url = service.getAttachmentUrl('2024/01/user/file.jpg');

      expect(url).toBe('https://test.meeshy.me/api/v1/attachments/file/2024%2F01%2Fuser%2Ffile.jpg');
    });

    it('getAttachmentPath should generate relative path', () => {
      const path = service.getAttachmentPath('2024/01/user/file.jpg');

      expect(path).toBe('/api/v1/attachments/file/2024%2F01%2Fuser%2Ffile.jpg');
      expect(path).not.toContain('https://');
    });

    it('buildFullUrl should return existing full URLs unchanged', () => {
      const existingUrl = 'https://old.domain.com/api/v1/attachments/file/path';

      const result = service.buildFullUrl(existingUrl);

      expect(result).toBe(existingUrl);
    });

    it('buildFullUrl should construct full URL from relative path', () => {
      const relativePath = '/api/v1/attachments/file/path';

      const result = service.buildFullUrl(relativePath);

      expect(result).toBe('https://test.meeshy.me/api/v1/attachments/file/path');
    });

    it('buildFullUrl should handle http URLs', () => {
      const httpUrl = 'http://localhost:3000/api/v1/attachments/file/path';

      const result = service.buildFullUrl(httpUrl);

      expect(result).toBe(httpUrl);
    });
  });

  describe('uploadFile', () => {
    beforeEach(() => {
      mockPrisma.messageAttachment.create.mockResolvedValue(createMockAttachment());
    });

    it('should upload image file and extract metadata', async () => {
      const file = createTestFile();
      mockSharpInstance.metadata.mockResolvedValue({ width: 1920, height: 1080 });

      const result = await service.uploadFile(file, testUserId);

      expect(result.id).toBe(testAttachmentId);
      expect(result.originalName).toBe('test_image.jpg');
      expect(result.mimeType).toBe('image/jpeg');
      expect(mockPrisma.messageAttachment.create).toHaveBeenCalled();
    });

    it('should upload audio file with provided metadata', async () => {
      const file = createTestFile({
        filename: 'audio.webm',
        mimeType: 'audio/webm',
      });

      const providedMetadata = {
        duration: 60,
        bitrate: 128000,
        sampleRate: 48000,
        codec: 'opus',
        channels: 2,
        audioEffectsTimeline: {
          events: [{ time: 0, effect: 'reverb' }],
        },
      };

      mockPrisma.messageAttachment.create.mockResolvedValue(createMockAttachment({
        mimeType: 'audio/webm',
        duration: 60,
        bitrate: 128000,
        sampleRate: 48000,
        codec: 'opus',
        channels: 2,
        metadata: { audioEffectsTimeline: providedMetadata.audioEffectsTimeline },
      }));

      const result = await service.uploadFile(file, testUserId, false, undefined, providedMetadata);

      expect(result.duration).toBe(60);
      expect(result.metadata).toBeDefined();
    });

    it('should upload audio file and extract metadata when not provided', async () => {
      const file = createTestFile({
        filename: 'audio.mp3',
        mimeType: 'audio/mpeg',
      });

      mockParseFile.mockResolvedValueOnce({
        format: {
          duration: 180,
          bitrate: 320000,
          sampleRate: 44100,
          codec: 'mp3',
          numberOfChannels: 2,
        },
      });

      mockPrisma.messageAttachment.create.mockResolvedValue(createMockAttachment({
        mimeType: 'audio/mpeg',
        duration: 180,
        bitrate: 320000,
        sampleRate: 44100,
        codec: 'mp3',
        channels: 2,
      }));

      const result = await service.uploadFile(file, testUserId);

      expect(mockParseFile).toHaveBeenCalled();
      expect(result.duration).toBe(180);
    });

    it('should upload video file and extract metadata', async () => {
      const file = createTestFile({
        filename: 'video.mp4',
        mimeType: 'video/mp4',
      });

      mockFfprobe.mockImplementation((path: string, callback: Function) => {
        callback(null, {
          format: { duration: 600, bit_rate: '10000000' },
          streams: [{
            codec_type: 'video',
            width: 3840,
            height: 2160,
            codec_name: 'h265',
            r_frame_rate: '60/1',
          }],
        });
      });

      mockPrisma.messageAttachment.create.mockResolvedValue(createMockAttachment({
        mimeType: 'video/mp4',
        duration: 600,
        width: 3840,
        height: 2160,
        fps: 60,
        videoCodec: 'h265',
        bitrate: 10000000,
      }));

      const result = await service.uploadFile(file, testUserId);

      expect(result.duration).toBe(600);
      expect(result.videoCodec).toBe('h265');
    });

    it('should handle video metadata extraction error gracefully', async () => {
      const file = createTestFile({
        filename: 'video.mp4',
        mimeType: 'video/mp4',
      });

      mockFfprobe.mockImplementation((path: string, callback: Function) => {
        callback(new Error('ffprobe not available'), null);
      });

      mockPrisma.messageAttachment.create.mockResolvedValue(createMockAttachment({
        mimeType: 'video/mp4',
        duration: 0,
        width: 0,
        height: 0,
        fps: 0,
        videoCodec: 'unknown',
        bitrate: 0,
      }));

      const result = await service.uploadFile(file, testUserId);

      // Should succeed despite metadata extraction failure
      expect(result.id).toBe(testAttachmentId);
    });

    it('should upload PDF and extract page count', async () => {
      const file = createTestFile({
        filename: 'document.pdf',
        mimeType: 'application/pdf',
      });

      mockPdfParseInstance.getInfo.mockResolvedValueOnce({ total: 42 });

      mockPrisma.messageAttachment.create.mockResolvedValue(createMockAttachment({
        mimeType: 'application/pdf',
        pageCount: 42,
      }));

      const result = await service.uploadFile(file, testUserId);

      expect(result.pageCount).toBe(42);
    });

    it('should upload text file and count lines', async () => {
      const file = createTestFile({
        filename: 'code.ts',
        mimeType: 'text/typescript',
      });

      mockFsPromises.readFile.mockResolvedValueOnce('line1\nline2\nline3');

      mockPrisma.messageAttachment.create.mockResolvedValue(createMockAttachment({
        mimeType: 'text/typescript',
        lineCount: 3,
      }));

      const result = await service.uploadFile(file, testUserId);

      expect(result.lineCount).toBe(3);
    });

    it('should throw error on invalid file', async () => {
      const file = createTestFile({
        size: 3 * 1024 * 1024 * 1024, // 3GB - exceeds limit
      });

      await expect(service.uploadFile(file, testUserId))
        .rejects.toThrow('GB');
    });

    it('should use provided messageId', async () => {
      const file = createTestFile();

      await service.uploadFile(file, testUserId, false, testMessageId);

      expect(mockPrisma.messageAttachment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            messageId: testMessageId,
          }),
        })
      );
    });

    it('should use null messageId when not provided', async () => {
      const file = createTestFile();

      await service.uploadFile(file, testUserId);

      // messageId is now nullable - null when not provided
      // The attachment will be associated to a message later via associateAttachmentsToMessage()
      expect(mockPrisma.messageAttachment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            messageId: null,
          }),
        })
      );
    });

    it('should handle anonymous uploads', async () => {
      const file = createTestFile();

      mockPrisma.messageAttachment.create.mockResolvedValue(createMockAttachment({
        isAnonymous: true,
      }));

      const result = await service.uploadFile(file, testUserId, true);

      expect(mockPrisma.messageAttachment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isAnonymous: true,
          }),
        })
      );
      expect(result.isAnonymous).toBe(true);
    });
  });

  describe('uploadMultiple', () => {
    it('should upload multiple files', async () => {
      const files = [
        createTestFile({ filename: 'file1.jpg' }),
        createTestFile({ filename: 'file2.jpg' }),
        createTestFile({ filename: 'file3.jpg' }),
      ];

      mockPrisma.messageAttachment.create
        .mockResolvedValueOnce(createMockAttachment({ originalName: 'file1.jpg' }))
        .mockResolvedValueOnce(createMockAttachment({ originalName: 'file2.jpg' }))
        .mockResolvedValueOnce(createMockAttachment({ originalName: 'file3.jpg' }));

      const results = await service.uploadMultiple(files, testUserId);

      expect(results).toHaveLength(3);
      expect(results[0].originalName).toBe('file1.jpg');
      expect(results[1].originalName).toBe('file2.jpg');
      expect(results[2].originalName).toBe('file3.jpg');
    });

    it('should handle partial failures gracefully', async () => {
      const files = [
        createTestFile({ filename: 'file1.jpg' }),
        createTestFile({ filename: 'file2.jpg', size: 3 * 1024 * 1024 * 1024 }), // Too large
        createTestFile({ filename: 'file3.jpg' }),
      ];

      mockPrisma.messageAttachment.create
        .mockResolvedValueOnce(createMockAttachment({ originalName: 'file1.jpg' }))
        .mockResolvedValueOnce(createMockAttachment({ originalName: 'file3.jpg' }));

      const results = await service.uploadMultiple(files, testUserId);

      expect(results).toHaveLength(2);
      expect(results[0].originalName).toBe('file1.jpg');
      expect(results[1].originalName).toBe('file3.jpg');
    });

    it('should pass metadata map to individual uploads', async () => {
      const files = [
        createTestFile({ filename: 'audio1.webm', mimeType: 'audio/webm' }),
        createTestFile({ filename: 'audio2.webm', mimeType: 'audio/webm' }),
      ];

      const metadataMap = new Map<number, any>();
      metadataMap.set(0, { duration: 30 });
      metadataMap.set(1, { duration: 60 });

      mockPrisma.messageAttachment.create
        .mockResolvedValueOnce(createMockAttachment({ duration: 30 }))
        .mockResolvedValueOnce(createMockAttachment({ duration: 60 }));

      const results = await service.uploadMultiple(files, testUserId, false, undefined, metadataMap);

      expect(results).toHaveLength(2);
    });
  });

  describe('associateAttachmentsToMessage', () => {
    it('should update attachment messageIds', async () => {
      const attachmentIds = ['att1', 'att2', 'att3'];

      await service.associateAttachmentsToMessage(attachmentIds, testMessageId);

      expect(mockPrisma.messageAttachment.updateMany).toHaveBeenCalledWith({
        where: {
          id: { in: attachmentIds },
        },
        data: {
          messageId: testMessageId,
        },
      });
    });
  });

  describe('getAttachment', () => {
    it('should return attachment when found', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue(createMockAttachment());

      const result = await service.getAttachment(testAttachmentId);

      expect(result).not.toBeNull();
      expect(result?.id).toBe(testAttachmentId);
    });

    it('should return null when not found', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue(null);

      const result = await service.getAttachment('nonexistent');

      expect(result).toBeNull();
    });

    it('should format createdAt as ISO string', async () => {
      const date = new Date('2024-01-15T10:30:00Z');
      mockPrisma.messageAttachment.findUnique.mockResolvedValue(
        createMockAttachment({ createdAt: date })
      );

      const result = await service.getAttachment(testAttachmentId);

      expect(result?.createdAt).toBe('2024-01-15T10:30:00.000Z');
    });
  });

  describe('getFilePath', () => {
    it('should return full file path', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue({
        filePath: '2024/01/user/file.jpg',
      });

      const result = await service.getFilePath(testAttachmentId);

      expect(result).toContain('/test/uploads/');
      expect(result).toContain('2024/01/user/file.jpg');
    });

    it('should return null when not found', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue(null);

      const result = await service.getFilePath('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getThumbnailPath', () => {
    it('should return full thumbnail path', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue({
        thumbnailPath: '2024/01/user/file_thumb.jpg',
      });

      const result = await service.getThumbnailPath(testAttachmentId);

      expect(result).toContain('/test/uploads/');
      expect(result).toContain('_thumb.jpg');
    });

    it('should return null when attachment not found', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue(null);

      const result = await service.getThumbnailPath('nonexistent');

      expect(result).toBeNull();
    });

    it('should return null when no thumbnail', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue({
        thumbnailPath: null,
      });

      const result = await service.getThumbnailPath(testAttachmentId);

      expect(result).toBeNull();
    });
  });

  describe('deleteAttachment', () => {
    it('should delete files and database record', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue(createMockAttachment());

      await service.deleteAttachment(testAttachmentId);

      expect(mockFsPromises.unlink).toHaveBeenCalledTimes(2); // File + thumbnail
      expect(mockPrisma.messageAttachment.delete).toHaveBeenCalledWith({
        where: { id: testAttachmentId },
      });
    });

    it('should delete only main file when no thumbnail', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue(
        createMockAttachment({ thumbnailPath: null })
      );

      await service.deleteAttachment(testAttachmentId);

      expect(mockFsPromises.unlink).toHaveBeenCalledTimes(1);
    });

    it('should throw error when attachment not found', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue(null);

      await expect(service.deleteAttachment('nonexistent'))
        .rejects.toThrow('Attachment not found');
    });

    it('should handle file deletion errors gracefully', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue(createMockAttachment());
      mockFsPromises.unlink.mockRejectedValueOnce(new Error('File not found'));

      // Should not throw, should still delete from DB
      await service.deleteAttachment(testAttachmentId);

      expect(mockPrisma.messageAttachment.delete).toHaveBeenCalled();
    });
  });

  describe('getConversationAttachments', () => {
    it('should return attachments for conversation', async () => {
      mockPrisma.messageAttachment.findMany.mockResolvedValue([
        createMockAttachment({ id: 'att1' }),
        createMockAttachment({ id: 'att2' }),
      ]);

      const results = await service.getConversationAttachments(testConversationId);

      expect(results).toHaveLength(2);
      expect(mockPrisma.messageAttachment.findMany).toHaveBeenCalledWith({
        where: {
          message: { conversationId: testConversationId },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
        skip: 0,
      });
    });

    it('should filter by type when specified', async () => {
      mockPrisma.messageAttachment.findMany.mockResolvedValue([
        createMockAttachment({ mimeType: 'image/jpeg' }),
      ]);

      await service.getConversationAttachments(testConversationId, { type: 'image' });

      expect(mockPrisma.messageAttachment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            mimeType: { in: expect.any(Array) },
          }),
        })
      );
    });

    it('should apply limit and offset', async () => {
      mockPrisma.messageAttachment.findMany.mockResolvedValue([]);

      await service.getConversationAttachments(testConversationId, {
        limit: 20,
        offset: 10,
      });

      expect(mockPrisma.messageAttachment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 20,
          skip: 10,
        })
      );
    });

    it('should format createdAt as ISO strings', async () => {
      const date = new Date('2024-06-15T12:00:00Z');
      mockPrisma.messageAttachment.findMany.mockResolvedValue([
        createMockAttachment({ createdAt: date }),
      ]);

      const results = await service.getConversationAttachments(testConversationId);

      expect(results[0].createdAt).toBe('2024-06-15T12:00:00.000Z');
    });
  });

  describe('createTextAttachment', () => {
    it('should create attachment from text content', async () => {
      const textContent = 'This is test content for the text attachment.';

      mockPrisma.messageAttachment.create.mockResolvedValue(
        createMockAttachment({
          mimeType: 'text/plain',
          originalName: expect.stringContaining('text_'),
        })
      );

      const result = await service.createTextAttachment(textContent, testUserId);

      expect(result.mimeType).toBe('text/plain');
      expect(mockPrisma.messageAttachment.create).toHaveBeenCalled();
    });

    it('should generate unique filename with timestamp', async () => {
      const textContent = 'Test content';

      mockPrisma.messageAttachment.create.mockImplementation((args: any) => {
        return Promise.resolve(createMockAttachment({
          mimeType: 'text/plain',
          originalName: args.data.originalName,
        }));
      });

      const result = await service.createTextAttachment(textContent, testUserId);

      expect(result.originalName).toMatch(/text_\d+\.txt/);
    });

    it('should pass isAnonymous flag', async () => {
      const textContent = 'Anonymous text';

      mockPrisma.messageAttachment.create.mockResolvedValue(
        createMockAttachment({ isAnonymous: true })
      );

      await service.createTextAttachment(textContent, testUserId, true);

      expect(mockPrisma.messageAttachment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isAnonymous: true,
          }),
        })
      );
    });

    it('should pass messageId when provided', async () => {
      const textContent = 'Text with message';

      mockPrisma.messageAttachment.create.mockResolvedValue(createMockAttachment());

      await service.createTextAttachment(textContent, testUserId, false, testMessageId);

      expect(mockPrisma.messageAttachment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            messageId: testMessageId,
          }),
        })
      );
    });
  });
});
