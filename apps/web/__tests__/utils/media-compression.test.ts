/**
 * Tests for media-compression utility
 * Note: This is a simplified test file since FFmpeg operations are heavy
 */

// Mock the ffmpeg modules before importing
jest.mock('@ffmpeg/ffmpeg', () => ({
  FFmpeg: jest.fn().mockImplementation(() => ({
    load: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    writeFile: jest.fn().mockResolvedValue(undefined),
    exec: jest.fn().mockResolvedValue(undefined),
    readFile: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
    deleteFile: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('@ffmpeg/util', () => ({
  fetchFile: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
  toBlobURL: jest.fn().mockResolvedValue('blob:test-url'),
}));

jest.mock('browser-image-compression', () => {
  return jest.fn().mockImplementation((file) => {
    return Promise.resolve(new Blob(['compressed'], { type: file.type }));
  });
});

import { needsCompression } from '../../utils/media-compression';

describe('media-compression', () => {
  describe('needsCompression', () => {
    // Helper to create a mock file
    const createMockFile = (size: number, type: string): File => {
      // Create a minimal mock file
      const mockFile = {
        name: 'test.file',
        size,
        type,
        lastModified: Date.now(),
        slice: jest.fn(),
        arrayBuffer: jest.fn(),
        text: jest.fn(),
        stream: jest.fn(),
      } as unknown as File;
      return mockFile;
    };

    it('should return true for files larger than 100MB', () => {
      const largeFile = createMockFile(150 * 1024 * 1024, 'video/mp4');
      expect(needsCompression(largeFile)).toBe(true);
    });

    it('should return false for files smaller than 100MB', () => {
      const smallFile = createMockFile(50 * 1024 * 1024, 'video/mp4');
      expect(needsCompression(smallFile)).toBe(false);
    });

    it('should return false for files exactly at 100MB threshold', () => {
      const exactFile = createMockFile(100 * 1024 * 1024, 'video/mp4');
      expect(needsCompression(exactFile)).toBe(false);
    });

    it('should return true for file just over 100MB', () => {
      const overThreshold = createMockFile(100 * 1024 * 1024 + 1, 'image/jpeg');
      expect(needsCompression(overThreshold)).toBe(true);
    });

    it('should return false for empty file', () => {
      const emptyFile = createMockFile(0, 'video/mp4');
      expect(needsCompression(emptyFile)).toBe(false);
    });

    it('should work with image files', () => {
      const smallImage = createMockFile(5 * 1024 * 1024, 'image/jpeg');
      expect(needsCompression(smallImage)).toBe(false);

      const largeImage = createMockFile(200 * 1024 * 1024, 'image/png');
      expect(needsCompression(largeImage)).toBe(true);
    });

    it('should work with video files', () => {
      const smallVideo = createMockFile(10 * 1024 * 1024, 'video/mp4');
      expect(needsCompression(smallVideo)).toBe(false);

      const largeVideo = createMockFile(500 * 1024 * 1024, 'video/mp4');
      expect(needsCompression(largeVideo)).toBe(true);
    });
  });
});
