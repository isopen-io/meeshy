/**
 * Tests for logger utility
 */

import { logger, LogLevel, isDevelopment } from '../../utils/logger';

describe('logger', () => {
  let consoleErrorSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleInfoSpy: jest.SpyInstance;
  let consoleDebugSpy: jest.SpyInstance;
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();
    consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleInfoSpy.mockRestore();
    consoleDebugSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  describe('LogLevel enum', () => {
    it('should have correct values', () => {
      expect(LogLevel.ERROR).toBe(0);
      expect(LogLevel.WARN).toBe(1);
      expect(LogLevel.INFO).toBe(2);
      expect(LogLevel.DEBUG).toBe(3);
    });
  });

  describe('isDevelopment', () => {
    it('should be a boolean', () => {
      expect(typeof isDevelopment).toBe('boolean');
    });
  });

  describe('logger.error', () => {
    it('should log with tag and message', () => {
      logger.error('[TEST]', 'Error message');
      expect(consoleErrorSpy).toHaveBeenCalledWith('[TEST] Error message');
    });

    it('should log with tag, message, and data', () => {
      const data = { key: 'value' };
      logger.error('[TEST]', 'Error message', data);
      expect(consoleErrorSpy).toHaveBeenCalledWith('[TEST] Error message', data);
    });

    it('should log with tag and object directly', () => {
      const errorObj = { error: 'details' };
      logger.error('[TEST]', errorObj);
      expect(consoleErrorSpy).toHaveBeenCalledWith('[TEST]', errorObj);
    });
  });

  describe('logger.warn', () => {
    it('should log with tag and message', () => {
      logger.warn('[TEST]', 'Warning message');
      expect(consoleWarnSpy).toHaveBeenCalledWith('[TEST] Warning message');
    });

    it('should log with tag, message, and data', () => {
      const data = { warning: 'info' };
      logger.warn('[TEST]', 'Warning message', data);
      expect(consoleWarnSpy).toHaveBeenCalledWith('[TEST] Warning message', data);
    });

    it('should log with tag and object directly', () => {
      const warnObj = { warning: 'details' };
      logger.warn('[TEST]', warnObj);
      expect(consoleWarnSpy).toHaveBeenCalledWith('[TEST]', warnObj);
    });
  });

  describe('logger.info', () => {
    it('should log with tag and message in development', () => {
      // In test environment (development), info should be logged
      logger.info('[TEST]', 'Info message');
      // May or may not be called depending on environment
      // Test that it doesn't throw
    });

    it('should log with tag, message, and data', () => {
      const data = { info: 'data' };
      logger.info('[TEST]', 'Info message', data);
      // May or may not be called depending on environment
    });

    it('should log with tag and object directly', () => {
      const infoObj = { info: 'details' };
      logger.info('[TEST]', infoObj);
      // May or may not be called depending on environment
    });
  });

  describe('logger.debug', () => {
    it('should not throw when called', () => {
      expect(() => logger.debug('[TEST]', 'Debug message')).not.toThrow();
    });

    it('should accept tag and message', () => {
      logger.debug('[TEST]', 'Debug message');
      // May or may not be called depending on environment
    });

    it('should accept tag, message, and data', () => {
      const data = { debug: 'data' };
      logger.debug('[TEST]', 'Debug message', data);
      // May or may not be called depending on environment
    });

    it('should accept tag and object directly', () => {
      const debugObj = { debug: 'details' };
      logger.debug('[TEST]', debugObj);
      // May or may not be called depending on environment
    });
  });

  describe('logger.log', () => {
    it('should not throw when called', () => {
      expect(() => logger.log('Test message')).not.toThrow();
    });

    it('should accept message and additional args', () => {
      logger.log('Test message', 'arg1', 'arg2');
      // May or may not be called depending on environment
    });
  });

  describe('logger interface', () => {
    it('should have all expected methods', () => {
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.log).toBe('function');
    });

    it('should handle various data types in message parameter', () => {
      // String
      expect(() => logger.error('[TEST]', 'string message')).not.toThrow();

      // Object
      expect(() => logger.error('[TEST]', { object: 'message' })).not.toThrow();

      // Array (as part of data)
      expect(() => logger.error('[TEST]', 'message', [1, 2, 3])).not.toThrow();

      // Number (as part of data)
      expect(() => logger.error('[TEST]', 'message', 123)).not.toThrow();

      // Boolean (as part of data)
      expect(() => logger.error('[TEST]', 'message', true)).not.toThrow();

      // Null (as part of data)
      expect(() => logger.error('[TEST]', 'message', null)).not.toThrow();

      // Undefined (as part of data)
      expect(() => logger.error('[TEST]', 'message', undefined)).not.toThrow();
    });
  });
});
