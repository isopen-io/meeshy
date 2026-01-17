/**
 * Tests for error-context-collector utility
 */

import {
  collectErrorContext,
  sendErrorContext,
  ErrorContext,
} from '../../utils/error-context-collector';

// Mock fetch
global.fetch = jest.fn();

describe('error-context-collector', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('collectErrorContext', () => {
    const createTestError = (message = 'Test error', digest?: string) => {
      const error = new Error(message) as Error & { digest?: string };
      if (digest) error.digest = digest;
      return error;
    };

    it('should collect basic error information', () => {
      const error = createTestError('Something went wrong');
      const context = collectErrorContext(error);

      expect(context.message).toBe('Something went wrong');
      expect(context.stack).toBeDefined();
      expect(context.timestamp).toBeDefined();
      expect(context.url).toBeDefined();
    });

    it('should collect error digest when present', () => {
      const error = createTestError('Error', 'digest-123');
      const context = collectErrorContext(error);

      expect(context.digest).toBe('digest-123');
    });

    it('should collect user agent information', () => {
      const error = createTestError();
      const context = collectErrorContext(error);

      expect(context.userAgent).toBeDefined();
      expect(context.platform).toBeDefined();
      expect(context.language).toBeDefined();
      expect(context.languages).toBeDefined();
    });

    it('should detect device type', () => {
      const error = createTestError();
      const context = collectErrorContext(error);

      expect(context.device).toBeDefined();
      expect(context.device.type).toBeDefined();
      expect(['mobile', 'tablet', 'desktop', 'unknown']).toContain(context.device.type);
    });

    it('should collect screen information', () => {
      const error = createTestError();
      const context = collectErrorContext(error);

      expect(context.screen).toBeDefined();
      expect(typeof context.screen.width).toBe('number');
      expect(typeof context.screen.height).toBe('number');
      expect(typeof context.screen.colorDepth).toBe('number');
      expect(typeof context.screen.pixelRatio).toBe('number');
      expect(['portrait', 'landscape', 'unknown']).toContain(context.screen.orientation);
    });

    it('should collect network information', () => {
      const error = createTestError();
      const context = collectErrorContext(error);

      expect(context.network).toBeDefined();
      expect(typeof context.network.online).toBe('boolean');
    });

    it('should collect user preferences', () => {
      const error = createTestError();
      const context = collectErrorContext(error);

      expect(context.preferences).toBeDefined();
      expect(typeof context.preferences.cookiesEnabled).toBe('boolean');
      expect(context.preferences.storageAvailable).toBeDefined();
    });

    it('should collect location/timezone information', () => {
      const error = createTestError();
      const context = collectErrorContext(error);

      expect(context.location).toBeDefined();
      expect(context.location.timezone).toBeDefined();
      expect(context.location.locale).toBeDefined();
      expect(typeof context.location.timezoneOffset).toBe('number');
    });

    it('should merge additional context', () => {
      const error = createTestError();
      const additionalContext = {
        customField: 'custom value',
      };

      const context = collectErrorContext(error, additionalContext as any);

      expect((context as any).customField).toBe('custom value');
    });

    it('should have device info structure', () => {
      const error = createTestError();
      const context = collectErrorContext(error);

      expect(context.device).toHaveProperty('type');
      expect(context.device).toHaveProperty('os');
      expect(context.device).toHaveProperty('osVersion');
      expect(context.device).toHaveProperty('browser');
      expect(context.device).toHaveProperty('browserVersion');
      expect(context.device).toHaveProperty('vendor');
      expect(context.device).toHaveProperty('isTouchDevice');
    });

    it('should return valid timestamp in ISO format', () => {
      const error = createTestError();
      const context = collectErrorContext(error);

      const parsedDate = new Date(context.timestamp);
      expect(parsedDate.toString()).not.toBe('Invalid Date');
    });
  });

  describe('sendErrorContext', () => {
    it('should send error context to API', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true });

      const mockContext: ErrorContext = {
        timestamp: new Date().toISOString(),
        url: 'https://example.com',
        message: 'Test error',
        userAgent: 'Test UA',
        platform: 'Test',
        language: 'en',
        languages: ['en'],
        device: {
          type: 'desktop',
          os: 'macOS',
          osVersion: '10.15',
          browser: 'Chrome',
          browserVersion: '120',
          vendor: 'Google',
          isTouchDevice: false,
        },
        screen: {
          width: 1920,
          height: 1080,
          availWidth: 1920,
          availHeight: 1040,
          colorDepth: 24,
          pixelRatio: 2,
          orientation: 'landscape',
        },
        network: { online: true },
        performance: {},
        preferences: {
          cookiesEnabled: true,
          doNotTrack: null,
          storageAvailable: {
            localStorage: true,
            sessionStorage: true,
            indexedDB: true,
          },
        },
        location: {
          timezone: 'America/New_York',
          timezoneOffset: 300,
          locale: 'en-US',
        },
      };

      const result = await sendErrorContext(mockContext);

      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith('/api/client-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mockContext),
      });
    });

    it('should return false on fetch error', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      const mockContext = {} as ErrorContext;
      const result = await sendErrorContext(mockContext);

      expect(result).toBe(false);
    });

    it('should return false for non-ok response', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false });

      const mockContext = {} as ErrorContext;
      const result = await sendErrorContext(mockContext);

      expect(result).toBe(false);
    });
  });
});
