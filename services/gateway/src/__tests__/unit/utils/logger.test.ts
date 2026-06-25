/**
 * Unit tests for utils/logger.
 * Covers: logger (info, error, warn, debug), logError and logWarn
 * with real-logger, null-logger, Error instance, non-Error, and
 * the internal catch-all fallback.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { logger, logError, logWarn } from '../../../utils/logger';

// ─── logger singleton ─────────────────────────────────────────────────────────

describe('logger', () => {
  let logSpy;
  let errorSpy;
  let warnSpy;
  let debugSpy;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
    debugSpy.mockRestore();
  });

  it('info writes to console.log', () => {
    logger.info('hello info');
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toContain('hello info');
  });

  it('error writes to console.error', () => {
    logger.error('something went wrong');
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toContain('something went wrong');
  });

  it('warn writes to console.warn', () => {
    logger.warn('caution');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('caution');
  });

  it('debug does not write when NODE_ENV is not development', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    delete process.env.DEBUG;
    logger.debug('should be silent');
    expect(debugSpy).not.toHaveBeenCalled();
    process.env.NODE_ENV = prev;
  });

  it('debug writes to console.debug in development mode', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    logger.debug('dev trace');
    expect(debugSpy).toHaveBeenCalledTimes(1);
    process.env.NODE_ENV = prev;
  });

  it('formats extra args as JSON when they are objects', () => {
    logger.info('msg', { foo: 'bar' });
    const call = logSpy.mock.calls[0][0];
    expect(call).toContain('{"foo":"bar"}');
  });
});

// ─── logError ─────────────────────────────────────────────────────────────────

describe('logError', () => {
  let errorSpy;

  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('calls logger.error with the message when an Error is passed', () => {
    const mockLogger = { error: jest.fn() };
    logError(mockLogger, 'oops', new Error('bad'));
    expect(mockLogger.error).toHaveBeenCalledWith('oops');
  });

  it('calls logger.error with the error message when an Error is passed', () => {
    const mockLogger = { error: jest.fn() };
    logError(mockLogger, 'oops', new Error('bad'));
    expect(mockLogger.error).toHaveBeenCalledWith('bad');
  });

  it('calls logger.error with String(error) when a non-Error is passed', () => {
    const mockLogger = { error: jest.fn() };
    logError(mockLogger, 'oops', 'string-error');
    expect(mockLogger.error).toHaveBeenCalledWith('string-error');
  });

  it('falls back to console.error when the logger has no error method', () => {
    logError(null, 'msg', 'err');
    expect(errorSpy).toHaveBeenCalled();
  });

  it('falls back to console.error when the logger.error throws', () => {
    const brokenLogger = {
      error: jest.fn().mockImplementation(() => { throw new Error('logger broken'); }),
    };
    logError(brokenLogger, 'msg', 'err');
    expect(errorSpy).toHaveBeenCalled();
  });
});

// ─── logWarn ──────────────────────────────────────────────────────────────────

describe('logWarn', () => {
  let warnSpy;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('calls logger.warn with the message when an Error is passed', () => {
    const mockLogger = { warn: jest.fn() };
    logWarn(mockLogger, 'attention', new Error('minor'));
    expect(mockLogger.warn).toHaveBeenCalledWith('attention');
  });

  it('calls logger.warn with the error message when an Error is passed', () => {
    const mockLogger = { warn: jest.fn() };
    logWarn(mockLogger, 'attention', new Error('minor'));
    expect(mockLogger.warn).toHaveBeenCalledWith('minor');
  });

  it('calls logger.warn with String(error) for non-Error input', () => {
    const mockLogger = { warn: jest.fn() };
    logWarn(mockLogger, 'heads-up', 42);
    expect(mockLogger.warn).toHaveBeenCalledWith('42');
  });

  it('falls back to console.warn when the logger is null', () => {
    logWarn(null, 'msg', 'w');
    expect(warnSpy).toHaveBeenCalled();
  });

  it('falls back to console.warn when the logger.warn throws', () => {
    const brokenLogger = {
      warn: jest.fn().mockImplementation(() => { throw new Error('broken'); }),
    };
    logWarn(brokenLogger, 'msg', 'w');
    expect(warnSpy).toHaveBeenCalled();
  });
});
