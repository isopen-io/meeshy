/**
 * Tests for attachment-url utility
 */

import {
  buildAttachmentUrl,
  buildAttachmentUrls,
  buildAttachmentsUrls,
  isRelativeUrl,
  extractRelativePath,
} from '../../utils/attachment-url';

describe('attachment-url', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    process.env.NEXT_PUBLIC_BACKEND_URL = 'https://gate.meeshy.me';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('buildAttachmentUrl', () => {
    describe('null and undefined handling', () => {
      it('should return null for null input', () => {
        expect(buildAttachmentUrl(null)).toBeNull();
      });

      it('should return null for undefined input', () => {
        expect(buildAttachmentUrl(undefined)).toBeNull();
      });

      it('should return null for empty string', () => {
        expect(buildAttachmentUrl('')).toBeNull();
      });
    });

    describe('relative paths with /api/attachments/file/', () => {
      it('should build full URL from /api/attachments/file/ path', () => {
        const relativePath = '/api/attachments/file/2024/11/userId/photo.jpg';
        const result = buildAttachmentUrl(relativePath);
        expect(result).toBe('https://gate.meeshy.me/api/attachments/file/2024/11/userId/photo.jpg');
      });

      it('should handle /api/v1/attachments/file/ path', () => {
        const relativePath = '/api/v1/attachments/file/2024/11/userId/photo.jpg';
        const result = buildAttachmentUrl(relativePath);
        expect(result).toBe('https://gate.meeshy.me/api/v1/attachments/file/2024/11/userId/photo.jpg');
      });
    });

    describe('relative paths with date pattern', () => {
      it('should add /api/attachments/file prefix to date path starting with /', () => {
        const relativePath = '/2024/11/userId/photo.jpg';
        const result = buildAttachmentUrl(relativePath);
        expect(result).toBe('https://gate.meeshy.me/api/attachments/file/2024/11/userId/photo.jpg');
      });

      it('should add /api/attachments/file/ prefix to date path without /', () => {
        const relativePath = '2024/11/userId/photo.jpg';
        const result = buildAttachmentUrl(relativePath);
        expect(result).toBe('https://gate.meeshy.me/api/attachments/file/2024/11/userId/photo.jpg');
      });
    });

    describe('absolute URLs', () => {
      it('should return correct URL as-is if already properly formatted', () => {
        const absoluteUrl = 'https://gate.meeshy.me/api/attachments/file/2024/11/userId/photo.jpg';
        const result = buildAttachmentUrl(absoluteUrl);
        expect(result).toBe(absoluteUrl);
      });

      it('should fix URLs pointing to wrong domain (meeshy.me instead of gate.meeshy.me)', () => {
        const wrongUrl = 'https://meeshy.me/api/attachments/file/2024/11/userId/photo.jpg';
        const result = buildAttachmentUrl(wrongUrl);
        expect(result).toBe('https://gate.meeshy.me/api/attachments/file/2024/11/userId/photo.jpg');
      });

      it('should fix URLs missing /api/attachments/file/ prefix', () => {
        const wrongUrl = 'https://meeshy.me/2024/11/userId/photo.jpg';
        const result = buildAttachmentUrl(wrongUrl);
        expect(result).toBe('https://gate.meeshy.me/api/attachments/file/2024/11/userId/photo.jpg');
      });

      it('should pass through localhost URLs', () => {
        const localUrl = 'http://localhost:3000/api/attachments/file/2024/11/userId/photo.jpg';
        const result = buildAttachmentUrl(localUrl);
        expect(result).toBe(localUrl);
      });
    });

    describe('fallback backend URL', () => {
      it('should use fallback URL when env vars not set', () => {
        delete process.env.NEXT_PUBLIC_BACKEND_URL;
        delete process.env.NEXT_PUBLIC_API_URL;

        // Need to re-import module to pick up new env
        jest.resetModules();
        const { buildAttachmentUrl: freshBuildAttachmentUrl } = require('../../utils/attachment-url');

        const relativePath = '/api/attachments/file/2024/11/userId/photo.jpg';
        const result = freshBuildAttachmentUrl(relativePath);
        expect(result).toBe('http://localhost:3000/api/attachments/file/2024/11/userId/photo.jpg');
      });
    });

    describe('edge cases', () => {
      it('should handle paths starting with /', () => {
        const path = '/some/other/path';
        const result = buildAttachmentUrl(path);
        expect(result).toBe('https://gate.meeshy.me/some/other/path');
      });

      it('should warn and return unexpected path formats as-is', () => {
        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
        const unexpectedPath = 'no-slash-not-date-pattern';
        const result = buildAttachmentUrl(unexpectedPath);
        expect(result).toBe(unexpectedPath);
        consoleSpy.mockRestore();
      });
    });
  });

  describe('buildAttachmentUrls', () => {
    it('should transform both fileUrl and thumbnailUrl', () => {
      const attachment = {
        fileUrl: '/api/attachments/file/2024/11/userId/photo.jpg',
        thumbnailUrl: '/api/attachments/file/2024/11/userId/thumb.jpg',
      };

      const result = buildAttachmentUrls(attachment);

      expect(result.fileUrl).toBe('https://gate.meeshy.me/api/attachments/file/2024/11/userId/photo.jpg');
      expect(result.thumbnailUrl).toBe('https://gate.meeshy.me/api/attachments/file/2024/11/userId/thumb.jpg');
    });

    it('should preserve other properties', () => {
      const attachment = {
        id: '123',
        fileUrl: '/api/attachments/file/2024/11/userId/photo.jpg',
        thumbnailUrl: null,
        mimeType: 'image/jpeg',
      };

      const result = buildAttachmentUrls(attachment);

      expect(result.id).toBe('123');
      expect(result.mimeType).toBe('image/jpeg');
    });

    it('should handle null URLs', () => {
      const attachment = {
        fileUrl: null,
        thumbnailUrl: null,
      };

      const result = buildAttachmentUrls(attachment);

      expect(result.fileUrl).toBeNull();
      expect(result.thumbnailUrl).toBeNull();
    });

    it('should handle undefined URLs', () => {
      const attachment = {
        fileUrl: undefined,
        thumbnailUrl: undefined,
      };

      const result = buildAttachmentUrls(attachment);

      expect(result.fileUrl).toBeNull();
      expect(result.thumbnailUrl).toBeNull();
    });
  });

  describe('buildAttachmentsUrls', () => {
    it('should transform array of attachments', () => {
      const attachments = [
        { fileUrl: '/api/attachments/file/2024/11/a/1.jpg', thumbnailUrl: null },
        { fileUrl: '/api/attachments/file/2024/11/b/2.jpg', thumbnailUrl: '/api/attachments/file/2024/11/b/2_thumb.jpg' },
      ];

      const result = buildAttachmentsUrls(attachments);

      expect(result).toHaveLength(2);
      expect(result[0].fileUrl).toBe('https://gate.meeshy.me/api/attachments/file/2024/11/a/1.jpg');
      expect(result[1].thumbnailUrl).toBe('https://gate.meeshy.me/api/attachments/file/2024/11/b/2_thumb.jpg');
    });

    it('should handle empty array', () => {
      const result = buildAttachmentsUrls([]);
      expect(result).toHaveLength(0);
    });
  });

  describe('isRelativeUrl', () => {
    it('should return true for paths starting with /', () => {
      expect(isRelativeUrl('/api/attachments/file/photo.jpg')).toBe(true);
    });

    it('should return false for absolute URLs', () => {
      expect(isRelativeUrl('https://example.com/photo.jpg')).toBe(false);
    });

    it('should return false for protocol-relative URLs (//)', () => {
      expect(isRelativeUrl('//example.com/photo.jpg')).toBe(false);
    });

    it('should return false for null', () => {
      expect(isRelativeUrl(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isRelativeUrl(undefined)).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isRelativeUrl('')).toBe(false);
    });

    it('should return false for paths not starting with /', () => {
      expect(isRelativeUrl('photo.jpg')).toBe(false);
    });
  });

  describe('extractRelativePath', () => {
    it('should extract pathname from absolute URL', () => {
      const url = 'https://gate.meeshy.me/api/attachments/file/2024/11/photo.jpg';
      const result = extractRelativePath(url);
      expect(result).toBe('/api/attachments/file/2024/11/photo.jpg');
    });

    it('should return relative path as-is', () => {
      const path = '/api/attachments/file/2024/11/photo.jpg';
      const result = extractRelativePath(path);
      expect(result).toBe(path);
    });

    it('should return null for null input', () => {
      expect(extractRelativePath(null)).toBeNull();
    });

    it('should return null for undefined input', () => {
      expect(extractRelativePath(undefined)).toBeNull();
    });

    it('should handle URLs with query parameters', () => {
      const url = 'https://gate.meeshy.me/api/attachments/file/photo.jpg?v=123';
      const result = extractRelativePath(url);
      expect(result).toBe('/api/attachments/file/photo.jpg');
    });

    it('should return invalid URL string as-is with warning', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const invalidPath = 'not-a-url-or-path';
      const result = extractRelativePath(invalidPath);
      expect(result).toBe(invalidPath);
      consoleSpy.mockRestore();
    });
  });
});
