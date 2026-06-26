/**
 * Unit tests for utils/logger.ts
 * Covers: MeeshyLogger (info, error, warn, debug), logError, logWarn
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { logger, logError, logWarn } from '../../../utils/logger';

describe('MeeshyLogger', () => {
  let consoleSpy: {
    log: ReturnType<typeof jest.spyOn>;
    error: ReturnType<typeof jest.spyOn>;
    warn: ReturnType<typeof jest.spyOn>;
    debug: ReturnType<typeof jest.spyOn>;
  };

  beforeEach(() => {
    consoleSpy = {
      log: jest.spyOn(console, 'log').mockImplementation(() => {}),
      error: jest.spyOn(console, 'error').mockImplementation(() => {}),
      warn: jest.spyOn(console, 'warn').mockImplementation(() => {}),
      debug: jest.spyOn(console, 'debug').mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    Object.values(consoleSpy).forEach(spy => spy.mockRestore());
  });

  it('info() calls console.log with formatted message', () => {
    logger.info('hello info');
    expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('hello info'));
    expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('INFO'));
  });

  it('info() with extra args includes them in output', () => {
    logger.info('msg', { key: 'val' });
    expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('msg'));
  });

  it('error() calls console.error with formatted message', () => {
    logger.error('error msg');
    expect(consoleSpy.error).toHaveBeenCalledWith(expect.stringContaining('error msg'));
    expect(consoleSpy.error).toHaveBeenCalledWith(expect.stringContaining('ERROR'));
  });

  it('warn() calls console.warn with formatted message', () => {
    logger.warn('warn msg');
    expect(consoleSpy.warn).toHaveBeenCalledWith(expect.stringContaining('warn msg'));
    expect(consoleSpy.warn).toHaveBeenCalledWith(expect.stringContaining('WARN'));
  });

  it('debug() outputs when NODE_ENV=development', () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      logger.debug('debug msg');
      expect(consoleSpy.debug).toHaveBeenCalledWith(expect.stringContaining('debug msg'));
    } finally {
      process.env.NODE_ENV = original;
    }
  });

  it('debug() is silent when NODE_ENV is not development', () => {
    const originalEnv = process.env.NODE_ENV;
    const originalDebug = process.env.DEBUG;
    process.env.NODE_ENV = 'test';
    delete process.env.DEBUG;
    try {
      logger.debug('silent debug');
      expect(consoleSpy.debug).not.toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = originalEnv;
      if (originalDebug !== undefined) process.env.DEBUG = originalDebug;
    }
  });

  it('debug() outputs when DEBUG=true', () => {
    const original = process.env.DEBUG;
    process.env.DEBUG = 'true';
    try {
      logger.debug('debug-flag msg');
      expect(consoleSpy.debug).toHaveBeenCalledWith(expect.stringContaining('debug-flag msg'));
    } finally {
      if (original !== undefined) process.env.DEBUG = original;
      else delete process.env.DEBUG;
    }
  });
});

// ── logError ───────────────────────────────────────────────────────────────────

describe('logError()', () => {
  let consoleSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('calls logger.error with message and Error instance details', () => {
    const mockLogger = { error: jest.fn(), warn: jest.fn() };
    const err = new Error('test error');
    logError(mockLogger, 'Error occurred', err);

    expect(mockLogger.error).toHaveBeenCalledWith('Error occurred');
    expect(mockLogger.error).toHaveBeenCalledWith(err.message);
  });

  it('calls logger.error with String(error) for non-Error values', () => {
    const mockLogger = { error: jest.fn(), warn: jest.fn() };
    logError(mockLogger, 'Something went wrong', 'string error');

    expect(mockLogger.error).toHaveBeenCalledWith('string error');
  });

  it('falls back to console.error when no logger provided', () => {
    logError(null, 'no logger', new Error('x'));
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('falls back to console.error when logger lacks error method', () => {
    logError({}, 'partial logger', 'error val');
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('catches errors thrown by the logger and falls back to console.error', () => {
    const badLogger = { error: jest.fn().mockImplementation(() => { throw new Error('log failed'); }) };
    logError(badLogger, 'msg', 'error');
    expect(consoleSpy).toHaveBeenCalled();
  });
});

// ── logWarn ───────────────────────────────────────────────────────────────────

describe('logWarn()', () => {
  let consoleSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('calls logger.warn with message and Error instance details', () => {
    const mockLogger = { warn: jest.fn() };
    const err = new Error('warn error');
    logWarn(mockLogger, 'Warning!', err);

    expect(mockLogger.warn).toHaveBeenCalledWith('Warning!');
    expect(mockLogger.warn).toHaveBeenCalledWith(err.message);
  });

  it('calls logger.warn with String(error) for non-Error values', () => {
    const mockLogger = { warn: jest.fn() };
    logWarn(mockLogger, 'Heads up', 42);

    expect(mockLogger.warn).toHaveBeenCalledWith('42');
  });

  it('falls back to console.warn when no logger provided', () => {
    logWarn(null, 'no logger warn', 'err');
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('catches errors thrown by logger.warn and falls back to console.warn', () => {
    const badLogger = { warn: jest.fn().mockImplementation(() => { throw new Error('warn failed'); }) };
    logWarn(badLogger, 'msg', 'val');
    expect(consoleSpy).toHaveBeenCalled();
  });
});
