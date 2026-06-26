/**
 * logger.ts — unit tests
 *
 * Covers: MeeshyLogger methods (info, error, warn, debug),
 * logError and logWarn utility functions (all branches).
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { logger, logError, logWarn } from '../../../utils/logger';

// ─── console spies ────────────────────────────────────────────────────────────

let spyLog: ReturnType<typeof jest.spyOn>;
let spyError: ReturnType<typeof jest.spyOn>;
let spyWarn: ReturnType<typeof jest.spyOn>;
let spyDebug: ReturnType<typeof jest.spyOn>;

beforeEach(() => {
  spyLog = jest.spyOn(console, 'log').mockImplementation(() => {});
  spyError = jest.spyOn(console, 'error').mockImplementation(() => {});
  spyWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  spyDebug = jest.spyOn(console, 'debug').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env['DEBUG'];
});

// ─── MeeshyLogger.info ────────────────────────────────────────────────────────

describe('logger.info', () => {
  it('writes to console.log with INFO prefix', () => {
    logger.info('hello world');
    expect(spyLog).toHaveBeenCalledTimes(1);
    const msg = spyLog.mock.calls[0][0] as string;
    expect(msg).toContain('INFO');
    expect(msg).toContain('hello world');
  });

  it('formats extra args inline', () => {
    logger.info('msg', { key: 'val' });
    const msg = spyLog.mock.calls[0][0] as string;
    expect(msg).toContain('"key":"val"');
  });
});

// ─── MeeshyLogger.error ───────────────────────────────────────────────────────

describe('logger.error', () => {
  it('writes to console.error with ERROR prefix', () => {
    logger.error('something broke');
    expect(spyError).toHaveBeenCalledTimes(1);
    const msg = spyError.mock.calls[0][0] as string;
    expect(msg).toContain('ERROR');
    expect(msg).toContain('something broke');
  });

  it('includes string args verbatim', () => {
    logger.error('oops', 'detail');
    const msg = spyError.mock.calls[0][0] as string;
    expect(msg).toContain('detail');
  });
});

// ─── MeeshyLogger.warn ────────────────────────────────────────────────────────

describe('logger.warn', () => {
  it('writes to console.warn with WARN prefix', () => {
    logger.warn('watch out');
    expect(spyWarn).toHaveBeenCalledTimes(1);
    const msg = spyWarn.mock.calls[0][0] as string;
    expect(msg).toContain('WARN');
    expect(msg).toContain('watch out');
  });
});

// ─── MeeshyLogger.debug ───────────────────────────────────────────────────────

describe('logger.debug', () => {
  it('writes to console.debug when DEBUG=true', () => {
    process.env['DEBUG'] = 'true';
    logger.debug('trace info');
    expect(spyDebug).toHaveBeenCalledTimes(1);
    const msg = spyDebug.mock.calls[0][0] as string;
    expect(msg).toContain('DEBUG');
    expect(msg).toContain('trace info');
  });

  it('writes to console.debug when NODE_ENV=development', () => {
    const original = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'development';
    logger.debug('dev trace');
    expect(spyDebug).toHaveBeenCalledTimes(1);
    process.env['NODE_ENV'] = original;
  });

  it('does NOT write to console.debug in production', () => {
    const original = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'production';
    delete process.env['DEBUG'];
    logger.debug('should be silent');
    expect(spyDebug).not.toHaveBeenCalled();
    process.env['NODE_ENV'] = original;
  });
});

// ─── logError ─────────────────────────────────────────────────────────────────

describe('logError', () => {
  it('calls logger.error with message and Error details when logger has error method', () => {
    const mockLogger = { error: jest.fn() };
    const err = new Error('boom');
    logError(mockLogger, 'Something failed', err);
    expect(mockLogger.error).toHaveBeenCalledWith('Something failed');
    expect(mockLogger.error).toHaveBeenCalledWith(err.message);
    expect(mockLogger.error).toHaveBeenCalledWith(err.stack);
  });

  it('calls logger.error with String(error) for non-Error values', () => {
    const mockLogger = { error: jest.fn() };
    logError(mockLogger, 'Oops', 'raw string error');
    expect(mockLogger.error).toHaveBeenCalledWith('raw string error');
  });

  it('falls back to console.error when logger has no error method', () => {
    logError(null, 'fallback', new Error('fallback err'));
    expect(spyError).toHaveBeenCalled();
  });

  it('falls back to console.error when logger.error throws', () => {
    const badLogger = {
      error: jest.fn(() => { throw new Error('logger itself broken'); }),
    };
    logError(badLogger, 'msg', 'data');
    expect(spyError).toHaveBeenCalled();
  });
});

// ─── logWarn ──────────────────────────────────────────────────────────────────

describe('logWarn', () => {
  it('calls logger.warn with message and Error message when logger has warn', () => {
    const mockLogger = { warn: jest.fn() };
    const err = new Error('warning');
    logWarn(mockLogger, 'Watch out', err);
    expect(mockLogger.warn).toHaveBeenCalledWith('Watch out');
    expect(mockLogger.warn).toHaveBeenCalledWith(err.message);
  });

  it('calls logger.warn with String(error) for non-Error values', () => {
    const mockLogger = { warn: jest.fn() };
    logWarn(mockLogger, 'Oops', 42);
    expect(mockLogger.warn).toHaveBeenCalledWith('42');
  });

  it('falls back to console.warn when logger has no warn method', () => {
    logWarn(null, 'fallback warn', 'details');
    expect(spyWarn).toHaveBeenCalled();
  });

  it('falls back to console.warn when logger.warn throws', () => {
    const badLogger = {
      warn: jest.fn(() => { throw new Error('logger broken'); }),
    };
    logWarn(badLogger, 'msg', 'data');
    expect(spyWarn).toHaveBeenCalled();
  });
});
