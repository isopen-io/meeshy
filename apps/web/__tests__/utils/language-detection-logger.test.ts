/**
 * Tests for utils/language-detection-logger.ts
 */

import {
  logLanguageDetectionInfo,
  logLanguageDetectionSummary,
  testLanguageDetection,
} from '@/utils/language-detection-logger';

let consoleGroup: jest.SpyInstance;
let consoleGroupEnd: jest.SpyInstance;
let consoleError: jest.SpyInstance;

beforeEach(() => {
  consoleGroup = jest.spyOn(console, 'group').mockImplementation(() => {});
  consoleGroupEnd = jest.spyOn(console, 'groupEnd').mockImplementation(() => {});
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  delete (process.env as Record<string, string | undefined>).NODE_ENV;
  (process.env as Record<string, string>).NODE_ENV = 'test';
});

// ─── non-development guard ────────────────────────────────────────────────────

describe('non-development guard (NODE_ENV=test)', () => {
  it('logLanguageDetectionInfo does nothing', () => {
    logLanguageDetectionInfo();
    expect(consoleGroup).not.toHaveBeenCalled();
    expect(consoleGroupEnd).not.toHaveBeenCalled();
  });

  it('logLanguageDetectionSummary does nothing', () => {
    logLanguageDetectionSummary();
    expect(consoleGroup).not.toHaveBeenCalled();
  });

  it('testLanguageDetection does nothing', () => {
    testLanguageDetection();
    expect(consoleGroup).not.toHaveBeenCalled();
    expect(consoleGroupEnd).not.toHaveBeenCalled();
  });
});

// ─── development mode ─────────────────────────────────────────────────────────

describe('development mode (NODE_ENV=development)', () => {
  beforeEach(() => {
    (process.env as Record<string, string>).NODE_ENV = 'development';

    Object.defineProperty(navigator, 'languages', {
      writable: true,
      configurable: true,
      value: ['fr-FR', 'en-US'],
    });
    Object.defineProperty(navigator, 'language', {
      writable: true,
      configurable: true,
      value: 'fr-FR',
    });

    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: jest.fn(() => null),
        setItem: jest.fn(),
        removeItem: jest.fn(),
        clear: jest.fn(),
      },
      writable: true,
      configurable: true,
    });
  });

  describe('logLanguageDetectionInfo', () => {
    it('calls console.group and console.groupEnd', () => {
      logLanguageDetectionInfo();
      expect(consoleGroup).toHaveBeenCalled();
      expect(consoleGroupEnd).toHaveBeenCalled();
    });

    it('reads from localStorage', () => {
      logLanguageDetectionInfo();
      expect(localStorage.getItem).toHaveBeenCalled();
    });

    it('handles errors gracefully and still calls groupEnd', () => {
      Object.defineProperty(navigator, 'languages', {
        get: () => { throw new Error('permission denied'); },
        configurable: true,
      });
      logLanguageDetectionInfo();
      expect(consoleError).toHaveBeenCalled();
      expect(consoleGroupEnd).toHaveBeenCalled();
    });
  });

  describe('logLanguageDetectionSummary', () => {
    it('runs without error using navigator.languages', () => {
      expect(() => logLanguageDetectionSummary()).not.toThrow();
    });

    it('falls back to navigator.language when languages is empty', () => {
      Object.defineProperty(navigator, 'languages', {
        writable: true,
        configurable: true,
        value: [],
      });
      expect(() => logLanguageDetectionSummary()).not.toThrow();
    });
  });

  describe('testLanguageDetection', () => {
    it('calls console.group and console.groupEnd', () => {
      testLanguageDetection();
      expect(consoleGroup).toHaveBeenCalled();
      expect(consoleGroupEnd).toHaveBeenCalled();
    });

    it('runs without error', () => {
      expect(() => testLanguageDetection()).not.toThrow();
    });
  });
});
