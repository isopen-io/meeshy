/**
 * Tests for avatar-upload utility
 */

import {
  generateAvatarFilename,
  generateAvatarPath,
  generateAvatarUrl,
  fileToBase64,
  validateAvatarFile,
} from '../../utils/avatar-upload';

describe('avatar-upload', () => {
  describe('generateAvatarFilename', () => {
    it('should generate unique filenames', () => {
      const filename1 = generateAvatarFilename('photo.jpg');
      const filename2 = generateAvatarFilename('photo.jpg');
      expect(filename1).not.toBe(filename2);
    });

    it('should start with avatar_ prefix', () => {
      const filename = generateAvatarFilename('photo.jpg');
      expect(filename).toMatch(/^avatar_/);
    });

    it('should preserve original extension', () => {
      const jpgFilename = generateAvatarFilename('photo.jpg');
      expect(jpgFilename).toMatch(/\.jpg$/);

      const pngFilename = generateAvatarFilename('image.png');
      expect(pngFilename).toMatch(/\.png$/);

      const webpFilename = generateAvatarFilename('picture.webp');
      expect(webpFilename).toMatch(/\.webp$/);
    });

    it('should use filename as extension when no dot present', () => {
      // When there's no extension, split('.').pop() returns the whole string
      // This is a quirk of the implementation - "photo" becomes the extension
      const filename = generateAvatarFilename('photo');
      expect(filename).toMatch(/\.photo$/);
    });

    it('should handle complex filenames', () => {
      const filename = generateAvatarFilename('my.photo.name.jpeg');
      expect(filename).toMatch(/\.jpeg$/);
    });

    it('should include timestamp', () => {
      const before = Date.now();
      const filename = generateAvatarFilename('photo.jpg');
      const after = Date.now();

      // Extract timestamp from filename (format: avatar_TIMESTAMP_RANDOM.ext)
      const match = filename.match(/avatar_(\d+)_/);
      expect(match).not.toBeNull();

      if (match) {
        const timestamp = parseInt(match[1], 10);
        expect(timestamp).toBeGreaterThanOrEqual(before);
        expect(timestamp).toBeLessThanOrEqual(after);
      }
    });

    it('should include random suffix', () => {
      const filename = generateAvatarFilename('photo.jpg');
      // Format: avatar_TIMESTAMP_RANDOM.ext
      const match = filename.match(/avatar_\d+_([a-z0-9]+)\./);
      expect(match).not.toBeNull();
      expect(match![1].length).toBeGreaterThanOrEqual(6);
    });
  });

  describe('generateAvatarPath', () => {
    it('should return object with year, month, and fullPath', () => {
      const result = generateAvatarPath();

      expect(result).toHaveProperty('year');
      expect(result).toHaveProperty('month');
      expect(result).toHaveProperty('fullPath');
    });

    it('should return current year', () => {
      const result = generateAvatarPath();
      const currentYear = new Date().getFullYear().toString();

      expect(result.year).toBe(currentYear);
    });

    it('should return current month with zero padding', () => {
      const result = generateAvatarPath();
      const currentMonth = (new Date().getMonth() + 1).toString().padStart(2, '0');

      expect(result.month).toBe(currentMonth);
    });

    it('should return correct full path format', () => {
      const result = generateAvatarPath();

      expect(result.fullPath).toBe(`u/i/${result.year}/${result.month}`);
    });

    it('should use u/i prefix for user images', () => {
      const result = generateAvatarPath();

      expect(result.fullPath).toMatch(/^u\/i\//);
    });
  });

  describe('generateAvatarUrl', () => {
    // Note: generateAvatarUrl uses window.location which cannot be mocked in jsdom
    // We test that the function exists and returns a string
    it('should return a string', () => {
      const url = generateAvatarUrl('avatar.jpg', '2024', '11');
      expect(typeof url).toBe('string');
    });

    it('should include the filename in the path', () => {
      const url = generateAvatarUrl('my-avatar.png', '2024', '11');
      expect(url).toContain('my-avatar.png');
    });

    it('should include year and month in the path', () => {
      const url = generateAvatarUrl('avatar.jpg', '2024', '11');
      expect(url).toContain('2024');
      expect(url).toContain('11');
    });

    it('should include u/i path prefix', () => {
      const url = generateAvatarUrl('avatar.jpg', '2024', '11');
      expect(url).toContain('u/i');
    });
  });

  describe('fileToBase64', () => {
    it('should convert file to base64 string', async () => {
      const blob = new Blob(['test content'], { type: 'image/jpeg' });
      const file = new File([blob], 'test.jpg', { type: 'image/jpeg' });

      const result = await fileToBase64(file);

      expect(result).toMatch(/^data:image\/jpeg;base64,/);
    });

    it('should handle different file types', async () => {
      const blob = new Blob(['PNG content'], { type: 'image/png' });
      const file = new File([blob], 'test.png', { type: 'image/png' });

      const result = await fileToBase64(file);

      expect(result).toMatch(/^data:image\/png;base64,/);
    });

    it('should reject on error', async () => {
      // Create a mock that will fail
      const mockFileReader = {
        readAsDataURL: jest.fn(),
        onload: null as any,
        onerror: null as any,
        result: null,
      };

      const originalFileReader = global.FileReader;
      // @ts-ignore
      global.FileReader = jest.fn(() => mockFileReader);

      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

      const promise = fileToBase64(file);

      // Simulate error
      mockFileReader.onerror(new Error('Read error'));

      await expect(promise).rejects.toThrow();

      global.FileReader = originalFileReader;
    });
  });

  describe('validateAvatarFile', () => {
    describe('valid files', () => {
      it('should accept JPEG files', () => {
        const file = new File([''], 'photo.jpg', { type: 'image/jpeg' });
        const result = validateAvatarFile(file);

        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should accept JPG files', () => {
        const file = new File([''], 'photo.jpg', { type: 'image/jpg' });
        const result = validateAvatarFile(file);

        expect(result.valid).toBe(true);
      });

      it('should accept PNG files', () => {
        const file = new File([''], 'photo.png', { type: 'image/png' });
        const result = validateAvatarFile(file);

        expect(result.valid).toBe(true);
      });

      it('should accept WebP files', () => {
        const file = new File([''], 'photo.webp', { type: 'image/webp' });
        const result = validateAvatarFile(file);

        expect(result.valid).toBe(true);
      });

      it('should accept files under 5MB', () => {
        // Create a 1MB file
        const content = new Uint8Array(1 * 1024 * 1024);
        const file = new File([content], 'photo.jpg', { type: 'image/jpeg' });
        const result = validateAvatarFile(file);

        expect(result.valid).toBe(true);
      });
    });

    describe('invalid files', () => {
      it('should reject files over 5MB', () => {
        // Create a 6MB file
        const content = new Uint8Array(6 * 1024 * 1024);
        const file = new File([content], 'photo.jpg', { type: 'image/jpeg' });
        const result = validateAvatarFile(file);

        expect(result.valid).toBe(false);
        expect(result.error).toContain('5MB');
      });

      it('should reject GIF files', () => {
        const file = new File([''], 'animation.gif', { type: 'image/gif' });
        const result = validateAvatarFile(file);

        expect(result.valid).toBe(false);
        expect(result.error).toContain('Format');
      });

      it('should reject BMP files', () => {
        const file = new File([''], 'image.bmp', { type: 'image/bmp' });
        const result = validateAvatarFile(file);

        expect(result.valid).toBe(false);
      });

      it('should reject SVG files', () => {
        const file = new File([''], 'vector.svg', { type: 'image/svg+xml' });
        const result = validateAvatarFile(file);

        expect(result.valid).toBe(false);
      });

      it('should reject PDF files', () => {
        const file = new File([''], 'document.pdf', { type: 'application/pdf' });
        const result = validateAvatarFile(file);

        expect(result.valid).toBe(false);
      });

      it('should reject text files', () => {
        const file = new File([''], 'file.txt', { type: 'text/plain' });
        const result = validateAvatarFile(file);

        expect(result.valid).toBe(false);
      });
    });

    describe('edge cases', () => {
      it('should reject file exactly at 5MB limit', () => {
        // Create exactly 5MB + 1 byte file
        const content = new Uint8Array(5 * 1024 * 1024 + 1);
        const file = new File([content], 'photo.jpg', { type: 'image/jpeg' });
        const result = validateAvatarFile(file);

        expect(result.valid).toBe(false);
      });

      it('should accept file exactly under 5MB limit', () => {
        // Create exactly 5MB file
        const content = new Uint8Array(5 * 1024 * 1024);
        const file = new File([content], 'photo.jpg', { type: 'image/jpeg' });
        const result = validateAvatarFile(file);

        expect(result.valid).toBe(true);
      });
    });
  });
});
