/**
 * Tests for clipboard module
 * Tests clipboard operations with browser API mocking
 */

import { copyToClipboard, isClipboardSupported } from '../../lib/clipboard';

describe('Clipboard Module', () => {
  // Save original implementations
  const originalClipboard = navigator.clipboard;
  const originalExecCommand = document.execCommand;
  let mockWriteText: jest.Mock;

  beforeEach(() => {
    mockWriteText = jest.fn().mockResolvedValue(undefined);

    // Reset mocks before each test
    jest.clearAllMocks();

    // Mock secure context
    Object.defineProperty(window, 'isSecureContext', {
      value: true,
      writable: true,
    });
  });

  afterEach(() => {
    // Restore original implementations
    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      configurable: true,
    });
    document.execCommand = originalExecCommand;
  });

  describe('isClipboardSupported', () => {
    it('should return true when clipboard API is available in secure context', () => {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: mockWriteText },
        configurable: true,
      });
      Object.defineProperty(window, 'isSecureContext', {
        value: true,
        writable: true,
      });

      expect(isClipboardSupported()).toBe(true);
    });

    it('should return false when clipboard API is not available', () => {
      Object.defineProperty(navigator, 'clipboard', {
        value: undefined,
        configurable: true,
      });

      expect(isClipboardSupported()).toBe(false);
    });

    it('should return false when not in secure context', () => {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: mockWriteText },
        configurable: true,
      });
      Object.defineProperty(window, 'isSecureContext', {
        value: false,
        writable: true,
      });

      expect(isClipboardSupported()).toBe(false);
    });
  });

  describe('copyToClipboard', () => {
    describe('Modern Clipboard API', () => {
      beforeEach(() => {
        Object.defineProperty(navigator, 'clipboard', {
          value: { writeText: mockWriteText },
          configurable: true,
        });
        Object.defineProperty(window, 'isSecureContext', {
          value: true,
          writable: true,
        });
      });

      it('should copy text using modern Clipboard API', async () => {
        const result = await copyToClipboard('test text');

        expect(mockWriteText).toHaveBeenCalledWith('test text');
        expect(result.success).toBe(true);
        expect(result.message).toContain('presse-papiers');
      });

      it('should handle Clipboard API success', async () => {
        mockWriteText.mockResolvedValueOnce(undefined);

        const result = await copyToClipboard('Hello World');

        expect(result.success).toBe(true);
      });

      it('should return error when Clipboard API fails', async () => {
        mockWriteText.mockRejectedValueOnce(new Error('API error'));

        const result = await copyToClipboard('test text');

        // When Clipboard API is available but fails, returns error (no fallback)
        expect(result.success).toBe(false);
        expect(result.message).toContain('Erreur');
      });
    });

    describe('Fallback with execCommand', () => {
      beforeEach(() => {
        // Disable modern Clipboard API
        Object.defineProperty(navigator, 'clipboard', {
          value: undefined,
          configurable: true,
        });
      });

      it('should use textarea fallback when Clipboard API unavailable', async () => {
        document.execCommand = jest.fn().mockReturnValue(true);

        const result = await copyToClipboard('fallback text');

        expect(document.execCommand).toHaveBeenCalledWith('copy');
        expect(result.success).toBe(true);
      });

      it('should handle execCommand failure', async () => {
        document.execCommand = jest.fn().mockReturnValue(false);

        const result = await copyToClipboard('fallback text');

        expect(result.success).toBe(false);
      });

      it('should handle execCommand throwing error', async () => {
        document.execCommand = jest.fn().mockImplementation(() => {
          throw new Error('execCommand error');
        });

        const result = await copyToClipboard('fallback text');

        expect(result.success).toBe(false);
      });

      it('should create and remove textarea element', async () => {
        document.execCommand = jest.fn().mockReturnValue(true);
        const appendChildSpy = jest.spyOn(document.body, 'appendChild');
        const removeChildSpy = jest.spyOn(document.body, 'removeChild');

        await copyToClipboard('test');

        expect(appendChildSpy).toHaveBeenCalled();
        expect(removeChildSpy).toHaveBeenCalled();

        appendChildSpy.mockRestore();
        removeChildSpy.mockRestore();
      });
    });

    describe('Input selector fallback', () => {
      beforeEach(() => {
        Object.defineProperty(navigator, 'clipboard', {
          value: undefined,
          configurable: true,
        });
        document.execCommand = jest.fn().mockReturnValue(false);
      });

      it('should use input selector as last fallback', async () => {
        // Create a test input
        const input = document.createElement('input');
        input.id = 'test-input';
        document.body.appendChild(input);

        const result = await copyToClipboard('test text', '#test-input');

        expect(input.value).toBe('test text');
        expect(result.success).toBe(false);
        expect(result.message).toContain('Ctrl+C');

        document.body.removeChild(input);
      });

      it('should return error when input selector not found', async () => {
        const result = await copyToClipboard('test text', '#non-existent');

        expect(result.success).toBe(false);
        expect(result.message).toContain('non disponible');
      });
    });

    describe('Error handling', () => {
      it('should catch and handle unexpected errors', async () => {
        Object.defineProperty(navigator, 'clipboard', {
          value: {
            writeText: jest.fn().mockRejectedValue(new Error('Unexpected')),
          },
          configurable: true,
        });
        Object.defineProperty(window, 'isSecureContext', {
          value: true,
          writable: true,
        });
        document.execCommand = jest.fn().mockImplementation(() => {
          throw new Error('execCommand error');
        });

        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

        const result = await copyToClipboard('test');

        expect(result.success).toBe(false);
        expect(result.message).toContain('Erreur');

        consoleSpy.mockRestore();
      });
    });

    describe('Special characters and edge cases', () => {
      beforeEach(() => {
        Object.defineProperty(navigator, 'clipboard', {
          value: { writeText: mockWriteText },
          configurable: true,
        });
        Object.defineProperty(window, 'isSecureContext', {
          value: true,
          writable: true,
        });
      });

      it('should handle empty string', async () => {
        const result = await copyToClipboard('');

        expect(mockWriteText).toHaveBeenCalledWith('');
        expect(result.success).toBe(true);
      });

      it('should handle special characters', async () => {
        const specialText = '<script>alert("xss")</script>';

        const result = await copyToClipboard(specialText);

        expect(mockWriteText).toHaveBeenCalledWith(specialText);
        expect(result.success).toBe(true);
      });

      it('should handle unicode characters', async () => {
        const unicodeText = 'Hello World!';

        const result = await copyToClipboard(unicodeText);

        expect(mockWriteText).toHaveBeenCalledWith(unicodeText);
        expect(result.success).toBe(true);
      });

      it('should handle very long text', async () => {
        const longText = 'a'.repeat(10000);

        const result = await copyToClipboard(longText);

        expect(mockWriteText).toHaveBeenCalledWith(longText);
        expect(result.success).toBe(true);
      });

      it('should handle newlines and tabs', async () => {
        const textWithWhitespace = 'Line 1\nLine 2\tTabbed';

        const result = await copyToClipboard(textWithWhitespace);

        expect(mockWriteText).toHaveBeenCalledWith(textWithWhitespace);
        expect(result.success).toBe(true);
      });
    });
  });
});
