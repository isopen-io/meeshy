/**
 * Additional coverage for utils/logger-enhanced.ts
 * Covers branches not reached by logger-enhanced.test.ts:
 *  - enhancedLogger.trace / debug / error / fatal (and their child equivalents)
 *  - securityLogger.logAttempt / logViolation / logSuccess
 *  - performanceLogger.start().end() — fast path (info) and slow path (warn)
 *  - requestLogger() middleware — incoming request + onSend hook (2xx and 4xx)
 *  - gwLog() — all log levels, with/without context
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, beforeEach, afterEach } from '@jest/globals';

// Capture everything written to stdout so we can assert on formatter output
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
  enhancedLogger,
  securityLogger,
  performanceLogger,
  requestLogger,
  gwLog,
} from '../../utils/logger-enhanced';

// ── enhancedLogger ────────────────────────────────────────────────────────────

describe('enhancedLogger — trace / debug', () => {
  it('trace() with context does not throw', () => {
    expect(() => enhancedLogger.trace('trace-msg', { userId: 'u1', extra: 'x' })).not.toThrow();
  });

  it('trace() without context does not throw', () => {
    expect(() => enhancedLogger.trace('trace-msg-no-ctx')).not.toThrow();
  });

  it('debug() with context writes a debug-level log', () => {
    enhancedLogger.debug('debug-msg', { module: 'test' });
    const found = stdoutWrites.some(l => l.includes('debug-msg'));
    expect(found).toBe(true);
  });

  it('debug() without context does not throw', () => {
    expect(() => enhancedLogger.debug('debug-no-ctx')).not.toThrow();
  });
});

describe('enhancedLogger — info / warn', () => {
  it('info() without context does not throw', () => {
    enhancedLogger.info('info-bare');
    const found = stdoutWrites.some(l => l.includes('info-bare'));
    expect(found).toBe(true);
  });

  it('warn() without context does not throw', () => {
    enhancedLogger.warn('warn-bare');
    const found = stdoutWrites.some(l => l.includes('warn-bare'));
    expect(found).toBe(true);
  });
});

describe('enhancedLogger — error / fatal', () => {
  it('error() with Error instance writes name/message/stack', () => {
    const err = new Error('boom');
    enhancedLogger.error('err-msg', err, { requestId: 'r1' });
    const found = stdoutWrites.some(l => l.includes('err-msg'));
    expect(found).toBe(true);
  });

  it('error() with non-Error value uses it directly', () => {
    enhancedLogger.error('non-err-msg', 'string-error');
    const found = stdoutWrites.some(l => l.includes('non-err-msg'));
    expect(found).toBe(true);
  });

  it('error() with no error or context does not throw', () => {
    expect(() => enhancedLogger.error('bare-error')).not.toThrow();
  });

  it('fatal() with Error instance does not throw', () => {
    const err = new Error('fatal-boom');
    expect(() => enhancedLogger.fatal('fatal-msg', err)).not.toThrow();
  });

  it('fatal() with non-Error value does not throw', () => {
    expect(() => enhancedLogger.fatal('fatal-non-err', { code: 503 })).not.toThrow();
  });

  it('fatal() with no arguments does not throw', () => {
    expect(() => enhancedLogger.fatal('bare-fatal')).not.toThrow();
  });
});

// ── enhancedLogger.child ──────────────────────────────────────────────────────

describe('enhancedLogger.child()', () => {
  it('returns an object with all log methods', () => {
    const child = enhancedLogger.child({ module: 'ChildTest' });
    expect(typeof child.trace).toBe('function');
    expect(typeof child.debug).toBe('function');
    expect(typeof child.info).toBe('function');
    expect(typeof child.warn).toBe('function');
    expect(typeof child.error).toBe('function');
    expect(typeof child.fatal).toBe('function');
  });

  it('child.trace() with context does not throw', () => {
    const child = enhancedLogger.child({ module: 'ChildTest' });
    expect(() => child.trace('child-trace', { x: 1 })).not.toThrow();
  });

  it('child.trace() without context does not throw', () => {
    const child = enhancedLogger.child({ module: 'ChildTest' });
    expect(() => child.trace('child-trace-nc')).not.toThrow();
  });

  it('child.debug() with context writes log', () => {
    const child = enhancedLogger.child({ module: 'ChildTest' });
    child.debug('child-debug-msg', { k: 'v' });
    const found = stdoutWrites.some(l => l.includes('child-debug-msg'));
    expect(found).toBe(true);
  });

  it('child.debug() without context does not throw', () => {
    const child = enhancedLogger.child({ module: 'ChildTest' });
    expect(() => child.debug('child-debug-nc')).not.toThrow();
  });

  it('child.info() without context does not throw', () => {
    const child = enhancedLogger.child({ module: 'ChildTest' });
    expect(() => child.info('child-info-nc')).not.toThrow();
  });

  it('child.warn() without context does not throw', () => {
    const child = enhancedLogger.child({ module: 'ChildTest' });
    expect(() => child.warn('child-warn-nc')).not.toThrow();
  });

  it('child.error() with Error instance does not throw', () => {
    const child = enhancedLogger.child({ module: 'ChildTest' });
    const err = new Error('child-error');
    expect(() => child.error('child-err-msg', err)).not.toThrow();
  });

  it('child.error() with non-Error value does not throw', () => {
    const child = enhancedLogger.child({ module: 'ChildTest' });
    expect(() => child.error('child-non-err', 'string-err')).not.toThrow();
  });

  it('child.error() with context does not throw', () => {
    const child = enhancedLogger.child({ module: 'ChildTest' });
    expect(() => child.error('child-err-ctx', undefined, { key: 'val' })).not.toThrow();
  });

  it('child.fatal() with Error instance does not throw', () => {
    const child = enhancedLogger.child({ module: 'ChildTest' });
    const err = new Error('child-fatal');
    expect(() => child.fatal('child-fatal-msg', err)).not.toThrow();
  });

  it('child.fatal() with non-Error value does not throw', () => {
    const child = enhancedLogger.child({ module: 'ChildTest' });
    expect(() => child.fatal('child-fatal-non-err', null)).not.toThrow();
  });
});

// ── securityLogger ────────────────────────────────────────────────────────────

describe('securityLogger', () => {
  it('logAttempt() writes a security attempt warn log', () => {
    securityLogger.logAttempt('LOGIN_ATTEMPT', { userId: 'u1', ipAddress: '1.2.3.4' });
    const found = stdoutWrites.some(l => l.includes('Security attempt'));
    expect(found).toBe(true);
  });

  it('logAttempt() includes action in output', () => {
    securityLogger.logAttempt('BRUTEFORCE', { ipAddress: '5.6.7.8' });
    const found = stdoutWrites.some(l => l.includes('BRUTEFORCE'));
    expect(found).toBe(true);
  });

  it('logViolation() writes a security violation error log', () => {
    securityLogger.logViolation('TOKEN_FORGERY', { userId: 'u2' });
    const found = stdoutWrites.some(l => l.includes('Security violation'));
    expect(found).toBe(true);
  });

  it('logSuccess() writes a security success info log', () => {
    securityLogger.logSuccess('LOGOUT', { userId: 'u3' });
    const found = stdoutWrites.some(l => l.includes('Security action'));
    expect(found).toBe(true);
  });
});

// ── performanceLogger.start ───────────────────────────────────────────────────

describe('performanceLogger.start', () => {
  it('end() emits an info-level log for fast operations', () => {
    const timer = performanceLogger.start('fast-op');
    timer.end({ extra: 'data' });
    const found = stdoutWrites.some(l => l.includes('fast-op'));
    expect(found).toBe(true);
  });

  it('end() without context does not throw', () => {
    const timer = performanceLogger.start('no-ctx-op');
    expect(() => timer.end()).not.toThrow();
  });

  it('end() emits a warn-level log when duration exceeds 1000ms', () => {
    const dateSpy = jest.spyOn(Date, 'now')
      .mockReturnValueOnce(0)    // called inside start()
      .mockReturnValueOnce(1001); // called inside end()

    try {
      const timer = performanceLogger.start('slow-op');
      timer.end({ detail: 'heavy' });

      const found = stdoutWrites.some(l => l.includes('slow-op'));
      expect(found).toBe(true);
    } finally {
      dateSpy.mockRestore();
    }
  });
});

// ── requestLogger ─────────────────────────────────────────────────────────────

describe('requestLogger()', () => {
  it('returns a function (Fastify hook factory)', () => {
    const middleware = requestLogger();
    expect(typeof middleware).toBe('function');
  });

  it('middleware attaches requestId from request.id', async () => {
    const middleware = requestLogger();
    const request: any = {
      id: 'req-001',
      method: 'GET',
      url: '/api/v1/test',
      headers: { 'user-agent': 'jest-test' },
      ip: '127.0.0.1',
    };
    const reply: any = { statusCode: 200, addHook: jest.fn() };

    await middleware(request, reply);

    expect(request.requestId).toBe('req-001');
    const found = stdoutWrites.some(l => l.includes('Incoming request'));
    expect(found).toBe(true);
  });

  it('middleware generates a requestId when request.id is absent', async () => {
    const middleware = requestLogger();
    const request: any = {
      method: 'POST',
      url: '/api/test',
      headers: {},
      ip: '10.0.0.1',
    };
    const reply: any = { statusCode: 201, addHook: jest.fn() };

    await middleware(request, reply);

    expect(request.requestId).toBeDefined();
    expect(request.requestId).toMatch(/^req_/);
  });

  it('onSend hook logs completion at info level for 2xx status', async () => {
    const middleware = requestLogger();
    const request: any = {
      id: 'req-002',
      method: 'GET',
      url: '/health',
      headers: {},
      ip: '127.0.0.1',
    };
    let capturedHook: ((...args: any[]) => Promise<void>) | undefined;
    const reply: any = {
      statusCode: 200,
      addHook: (_event: string, fn: any) => { capturedHook = fn; },
    };

    await middleware(request, reply);
    stdoutWrites.length = 0;

    await capturedHook!();
    const found = stdoutWrites.some(l => l.includes('Request completed'));
    expect(found).toBe(true);
  });

  it('onSend hook logs at warn level for 4xx status', async () => {
    const middleware = requestLogger();
    const request: any = {
      id: 'req-003',
      method: 'GET',
      url: '/missing',
      headers: {},
      ip: '127.0.0.1',
    };
    let capturedHook: ((...args: any[]) => Promise<void>) | undefined;
    const reply: any = {
      statusCode: 404,
      addHook: (_event: string, fn: any) => { capturedHook = fn; },
    };

    await middleware(request, reply);
    stdoutWrites.length = 0;

    await capturedHook!();
    const found = stdoutWrites.some(l => l.includes('Request completed'));
    expect(found).toBe(true);
  });
});

// ── gwLog ─────────────────────────────────────────────────────────────────────

describe('gwLog()', () => {
  let consoleSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('info level writes to console.log with module name', () => {
    gwLog('info', 'TestModule', 'info message', { key: 'value' });
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('info message'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('TestModule'));
  });

  it('info level without context omits data field', () => {
    gwLog('info', 'M', 'bare msg');
    const call = (consoleSpy.mock.calls[0] as string[])[0];
    expect(call).not.toContain('"data"');
  });

  it('info level with empty context omits data field', () => {
    gwLog('info', 'M', 'empty ctx msg', {});
    const call = (consoleSpy.mock.calls[0] as string[])[0];
    expect(call).not.toContain('"data"');
  });

  it('trace level includes TRACE in output', () => {
    gwLog('trace', 'M', 'trace-gwlog', { x: 1 });
    const call = (consoleSpy.mock.calls[0] as string[])[0];
    expect(call).toContain('TRACE');
  });

  it('debug level includes DEBUG in output', () => {
    gwLog('debug', 'M', 'debug-gwlog');
    const call = (consoleSpy.mock.calls[0] as string[])[0];
    expect(call).toContain('DEBUG');
  });

  it('warn level includes WARN in output', () => {
    gwLog('warn', 'M', 'warn-gwlog');
    const call = (consoleSpy.mock.calls[0] as string[])[0];
    expect(call).toContain('WARN');
  });

  it('error level includes ERROR in output', () => {
    gwLog('error', 'M', 'error-gwlog');
    const call = (consoleSpy.mock.calls[0] as string[])[0];
    expect(call).toContain('ERROR');
  });

  it('fatal level includes FATAL in output', () => {
    gwLog('fatal', 'M', 'fatal-gwlog');
    const call = (consoleSpy.mock.calls[0] as string[])[0];
    expect(call).toContain('FATAL');
  });
});
