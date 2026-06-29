import { describe, it, expect, beforeAll, beforeEach, afterEach } from '@jest/globals';

const stdoutWrites: string[] = [];

beforeAll(() => {
  jest.spyOn(process.stdout, 'write').mockImplementation((chunk: any) => {
    stdoutWrites.push(typeof chunk === 'string' ? chunk : chunk.toString());
    return true;
  });
});

beforeEach(() => {
  stdoutWrites.length = 0;
});

import {
  performanceLogger,
  enhancedLogger,
  securityLogger,
  gwLog,
} from '../../utils/logger-enhanced';

// ---------------------------------------------------------------------------
// enhancedLogger top-level methods
// ---------------------------------------------------------------------------

describe('enhancedLogger methods', () => {
  it('trace() executes without throwing', () => {
    expect(() => enhancedLogger.trace('trace message')).not.toThrow();
    expect(() => enhancedLogger.trace('with context', { key: 'val' })).not.toThrow();
  });

  it('debug() executes without throwing', () => {
    expect(() => enhancedLogger.debug('debug message')).not.toThrow();
    expect(() => enhancedLogger.debug('with context', { key: 'val' })).not.toThrow();
  });

  it('warn() writes to stdout', () => {
    enhancedLogger.warn('warning message', { module: 'test' });
    expect(stdoutWrites.some(l => l.includes('warning message'))).toBe(true);
  });

  it('error() with Error instance writes structured error context', () => {
    const err = new Error('something broke');
    enhancedLogger.error('error occurred', err, { requestId: 'req_001' });
    const combined = stdoutWrites.join('');
    expect(combined).toContain('error occurred');
  });

  it('error() with non-Error value passes it directly', () => {
    enhancedLogger.error('error with string', 'raw error string');
    expect(stdoutWrites.some(l => l.includes('error with string'))).toBe(true);
  });

  it('fatal() with Error instance executes without throwing', () => {
    const err = new Error('fatal error');
    expect(() => enhancedLogger.fatal('fatal occurred', err)).not.toThrow();
  });

  it('fatal() with non-Error value executes without throwing', () => {
    expect(() => enhancedLogger.fatal('fatal plain', 'cause')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// enhancedLogger.child() methods
// ---------------------------------------------------------------------------

describe('enhancedLogger.child() methods', () => {
  it('child trace() executes without throwing', () => {
    const child = enhancedLogger.child({ module: 'ChildMod' });
    expect(() => child.trace('child trace')).not.toThrow();
    expect(() => child.trace('child trace ctx', { x: 1 })).not.toThrow();
  });

  it('child debug() executes without throwing', () => {
    const child = enhancedLogger.child({ module: 'ChildMod' });
    expect(() => child.debug('child debug')).not.toThrow();
  });

  it('child warn() writes to stdout', () => {
    const child = enhancedLogger.child({ module: 'ChildMod' });
    child.warn('child warning');
    expect(stdoutWrites.some(l => l.includes('child warning'))).toBe(true);
  });

  it('child error() with Error instance executes without throwing', () => {
    const child = enhancedLogger.child({ module: 'ChildMod' });
    expect(() => child.error('child error', new Error('boom'))).not.toThrow();
  });

  it('child error() with non-Error value executes without throwing', () => {
    const child = enhancedLogger.child({ module: 'ChildMod' });
    expect(() => child.error('child error plain', 'string cause')).not.toThrow();
  });

  it('child fatal() with Error instance executes without throwing', () => {
    const child = enhancedLogger.child({ module: 'ChildMod' });
    expect(() => child.fatal('child fatal', new Error('fatal'))).not.toThrow();
  });

  it('child fatal() with non-Error value executes without throwing', () => {
    const child = enhancedLogger.child({ module: 'ChildMod' });
    expect(() => child.fatal('child fatal plain', 'cause')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// securityLogger
// ---------------------------------------------------------------------------

describe('securityLogger', () => {
  it('logAttempt() writes SECURITY_ATTEMPT to stdout', () => {
    securityLogger.logAttempt('login', { userId: 'user_001', ip: '1.2.3.4' });
    const combined = stdoutWrites.join('');
    expect(combined).toContain('login');
  });

  it('logViolation() writes SECURITY_VIOLATION to stdout', () => {
    securityLogger.logViolation('brute-force', { userId: 'user_001', attempts: 10 });
    const combined = stdoutWrites.join('');
    expect(combined).toContain('brute-force');
  });

  it('logSuccess() writes SECURITY_SUCCESS to stdout', () => {
    securityLogger.logSuccess('login', { userId: 'user_001' });
    const combined = stdoutWrites.join('');
    expect(combined).toContain('login');
  });
});

// ---------------------------------------------------------------------------
// performanceLogger.start()
// ---------------------------------------------------------------------------

describe('performanceLogger.start', () => {
  it('returns an object with end() method', () => {
    const timer = performanceLogger.start('my-operation');
    expect(typeof timer.end).toBe('function');
  });

  it('end() writes operation name and durationMs to stdout', async () => {
    const timer = performanceLogger.start('slow-op');
    await new Promise(r => setTimeout(r, 5));
    timer.end({ context: 'extra' });
    const combined = stdoutWrites.join('');
    expect(combined).toContain('slow-op');
    expect(combined).toMatch(/"durationMs":\d+/);
  });

  it('end() without context executes without throwing', () => {
    const timer = performanceLogger.start('quick-op');
    expect(() => timer.end()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// gwLog
// ---------------------------------------------------------------------------

describe('gwLog', () => {
  let consoleSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('calls console.log with level, module and message', () => {
    gwLog('info', 'TestModule', 'Hello World');
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const output = consoleSpy.mock.calls[0][0] as string;
    expect(output).toContain('[INFO]');
    expect(output).toContain('[GWY]');
    expect(output).toContain('[TestModule]');
    expect(output).toContain('Hello World');
  });

  it('includes context data when provided', () => {
    gwLog('warn', 'Mod', 'msg', { userId: 'u1' });
    const output = consoleSpy.mock.calls[0][0] as string;
    expect(output).toContain('userId');
  });

  it('formats each log level correctly', () => {
    for (const level of ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const) {
      consoleSpy.mockClear();
      gwLog(level, 'Mod', `${level} message`);
      const output = consoleSpy.mock.calls[0][0] as string;
      expect(output).toContain(`[${level.toUpperCase()}]`);
    }
  });

  it('omits data block when no context passed', () => {
    gwLog('info', 'Mod', 'clean message');
    const output = consoleSpy.mock.calls[0][0] as string;
    expect(output).not.toContain('data=');
  });
});

// ---------------------------------------------------------------------------
// performanceLogger.withTiming
// ---------------------------------------------------------------------------

describe('performanceLogger.withTiming', () => {
  it('emits a start log, awaits the inner fn, emits an end log with durationMs and returns the inner value', async () => {
    const result = await performanceLogger.withTiming(
      'test.step',
      async () => {
        await new Promise((r) => setTimeout(r, 10));
        return 'inner-value';
      },
      { clientMessageId: 'cid_test' }
    );

    expect(result).toBe('inner-value');

    const startLog = stdoutWrites.find(
      (l) => l.includes('"step":"test.step"') && l.includes('"phase":"start"')
    );
    const endLog = stdoutWrites.find(
      (l) => l.includes('"step":"test.step"') && l.includes('"phase":"end"')
    );

    expect(startLog).toBeDefined();
    expect(endLog).toBeDefined();
    expect(endLog).toMatch(/"durationMs":\s*\d+/);
    expect(endLog).toContain('"clientMessageId":"cid_test"');
  });

  it('emits an end log with error=true when the inner fn throws, and rethrows', async () => {
    await expect(
      performanceLogger.withTiming('test.step.fail', async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');

    const endLog = stdoutWrites.find(
      (l) => l.includes('"step":"test.step.fail"') && l.includes('"phase":"end"')
    );

    expect(endLog).toBeDefined();
    expect(endLog).toContain('"error":true');
  });
});
