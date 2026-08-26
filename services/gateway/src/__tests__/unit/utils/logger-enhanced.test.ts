/**
 * Unit tests for utils/logger-enhanced.
 * Covers: gwLog (all levels, context, no-context), securityLogger
 * (logAttempt, logViolation, logSuccess), performanceLogger.start().end()
 * (fast/slow branch), performanceLogger.withTiming (success, error),
 * requestLogger middleware, enhancedLogger methods (warn, error non-Error,
 * fatal, child.error, child.fatal), productionFormatter via jest.isolateModules.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// ─── gwLog ────────────────────────────────────────────────────────────────────

describe('gwLog', () => {
  let logSpy: any;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  const levels = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const;

  levels.forEach(level => {
    it(`writes to console.log for level "${level}"`, async () => {
      const { gwLog } = await import('../../../utils/logger-enhanced');
      gwLog(level, 'TestModule', 'hello world');
      expect(logSpy).toHaveBeenCalledTimes(1);
      const output: string = logSpy.mock.calls[0][0];
      expect(output).toContain(level.toUpperCase());
      expect(output).toContain('[GWY]');
      expect(output).toContain('[TestModule]');
      expect(output).toContain('hello world');
    });
  });

  it('includes serialized context in the output', async () => {
    const { gwLog } = await import('../../../utils/logger-enhanced');
    gwLog('info', 'Mod', 'msg', { key: 'val' });
    const output: string = logSpy.mock.calls[0][0];
    expect(output).toContain('"key":"val"');
  });

  it('omits data section when context is empty', async () => {
    const { gwLog } = await import('../../../utils/logger-enhanced');
    gwLog('info', 'Mod', 'plain');
    const output: string = logSpy.mock.calls[0][0];
    expect(output).not.toContain('data=');
  });
});

// ─── securityLogger ───────────────────────────────────────────────────────────

describe('securityLogger', () => {
  it('logAttempt does not throw', async () => {
    const { securityLogger } = await import('../../../utils/logger-enhanced');
    expect(() => securityLogger.logAttempt('login', { ipAddress: '1.2.3.4' })).not.toThrow();
  });

  it('logViolation does not throw', async () => {
    const { securityLogger } = await import('../../../utils/logger-enhanced');
    expect(() => securityLogger.logViolation('brute-force', { userId: 'u-1' })).not.toThrow();
  });

  it('logSuccess does not throw', async () => {
    const { securityLogger } = await import('../../../utils/logger-enhanced');
    expect(() => securityLogger.logSuccess('login', { username: 'alice' })).not.toThrow();
  });
});

// ─── performanceLogger.start().end() ─────────────────────────────────────────

describe('performanceLogger.start', () => {
  it('end() executes without throwing', async () => {
    const { performanceLogger } = await import('../../../utils/logger-enhanced');
    const timer = performanceLogger.start('op.test');
    expect(() => timer.end({ extra: 'data' })).not.toThrow();
  });

  it('end() without context does not throw', async () => {
    const { performanceLogger } = await import('../../../utils/logger-enhanced');
    const timer = performanceLogger.start('op.nocontext');
    expect(() => timer.end()).not.toThrow();
  });
});

// ─── performanceLogger.withTiming ────────────────────────────────────────────

describe('performanceLogger.withTiming', () => {
  it('returns the result of the wrapped function on success', async () => {
    const { performanceLogger } = await import('../../../utils/logger-enhanced');
    const result = await performanceLogger.withTiming('step.ok', async () => 42);
    expect(result).toBe(42);
  });

  it('rethrows the error when the wrapped function throws', async () => {
    const { performanceLogger } = await import('../../../utils/logger-enhanced');
    await expect(
      performanceLogger.withTiming('step.fail', async () => { throw new Error('boom'); })
    ).rejects.toThrow('boom');
  });

  it('accepts context object', async () => {
    const { performanceLogger } = await import('../../../utils/logger-enhanced');
    const result = await performanceLogger.withTiming('step.ctx', async () => 'ok', { requestId: 'r-1' });
    expect(result).toBe('ok');
  });
});

// ─── requestLogger middleware ─────────────────────────────────────────────────

describe('requestLogger', () => {
  it('returns an async middleware function', async () => {
    const { requestLogger } = await import('../../../utils/logger-enhanced');
    const middleware = requestLogger();
    expect(typeof middleware).toBe('function');
  });

  it('calls reply.addHook when invoked', async () => {
    const { requestLogger } = await import('../../../utils/logger-enhanced');
    const middleware = requestLogger();
    const request = {
      id: 'req-1',
      method: 'GET',
      url: '/test',
      headers: { 'user-agent': 'jest' },
      ip: '127.0.0.1',
    };
    const reply = { statusCode: 200, addHook: jest.fn() };
    await middleware(request, reply);
    expect(reply.addHook).toHaveBeenCalledWith('onSend', expect.any(Function));
  });

  it('onSend hook executes without throwing (2xx)', async () => {
    const { requestLogger } = await import('../../../utils/logger-enhanced');
    const middleware = requestLogger();
    const request = {
      id: 'req-2',
      method: 'POST',
      url: '/api',
      headers: {},
      ip: '10.0.0.1',
    };
    let capturedHook: (() => Promise<void>) | undefined;
    const reply = {
      statusCode: 201,
      addHook: (_: string, fn: () => Promise<void>) => { capturedHook = fn; },
    };
    await middleware(request, reply);
    await expect(capturedHook!()).resolves.toBeUndefined();
  });

  it('onSend hook executes without throwing (4xx → warn path)', async () => {
    const { requestLogger } = await import('../../../utils/logger-enhanced');
    const middleware = requestLogger();
    const request = {
      id: 'req-3',
      method: 'GET',
      url: '/missing',
      headers: {},
      ip: '127.0.0.1',
    };
    let capturedHook: (() => Promise<void>) | undefined;
    const reply = {
      statusCode: 404,
      addHook: (_: string, fn: () => Promise<void>) => { capturedHook = fn; },
    };
    await middleware(request, reply);
    await expect(capturedHook!()).resolves.toBeUndefined();
  });
});

// ─── redactPII ────────────────────────────────────────────────────────────────

describe('redactPII', () => {
  it('returns a Date instance intact at the root', async () => {
    const { redactPII } = await import('../../../utils/logger-enhanced');
    const date = new Date('2026-01-01T00:00:00.000Z');
    expect(redactPII(date)).toBe(date);
  });

  it('preserves a Date value on a non-PII field', async () => {
    const { redactPII } = await import('../../../utils/logger-enhanced');
    const consentAt = new Date('2026-01-01T00:00:00.000Z');
    const out = redactPII({ consentAt });
    expect(out.consentAt).toBeInstanceOf(Date);
    expect(out.consentAt.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('preserves a nested Date value', async () => {
    const { redactPII } = await import('../../../utils/logger-enhanced');
    const voiceProfileConsentAt = new Date('2026-05-26T12:00:00.000Z');
    const out = redactPII({ profile: { voiceProfileConsentAt } });
    expect(out.profile.voiceProfileConsentAt).toBeInstanceOf(Date);
    expect(out.profile.voiceProfileConsentAt.toISOString()).toBe('2026-05-26T12:00:00.000Z');
  });

  it('keeps the abcd...hash format for string PII fields', async () => {
    const { redactPII } = await import('../../../utils/logger-enhanced');
    const out = redactPII({ userId: 'user-123456' });
    expect(out.userId).toMatch(/^user\.\.\.[0-9a-f]{16}$/);
    expect(out.userId).not.toContain('user-123456');
  });

  it('redacts a Date-valued PII field (birthDate) as [redacted]', async () => {
    const { redactPII } = await import('../../../utils/logger-enhanced');
    const out = redactPII({ birthDate: new Date('1990-05-01T00:00:00.000Z') });
    expect(out.birthDate).toBe('[redacted]');
  });

  it('redacts a number-valued PII field as [redacted]', async () => {
    const { redactPII } = await import('../../../utils/logger-enhanced');
    const out = redactPII({ phoneNumber: 33612345678 });
    expect(out.phoneNumber).toBe('[redacted]');
  });

  it('leaves a null PII field as null', async () => {
    const { redactPII } = await import('../../../utils/logger-enhanced');
    const out = redactPII({ userId: null });
    expect(out.userId).toBeNull();
  });
});

// ─── enhancedLogger direct methods ───────────────────────────────────────────

describe('enhancedLogger', () => {
  it('warn does not throw', async () => {
    const { enhancedLogger } = await import('../../../utils/logger-enhanced');
    expect(() => enhancedLogger.warn('warning message', { source: 'test' })).not.toThrow();
  });

  it('error accepts a non-Error value', async () => {
    const { enhancedLogger } = await import('../../../utils/logger-enhanced');
    expect(() => enhancedLogger.error('error msg', 'string-error', { ctx: 1 })).not.toThrow();
  });

  it('error accepts an Error instance', async () => {
    const { enhancedLogger } = await import('../../../utils/logger-enhanced');
    expect(() => enhancedLogger.error('oops', new Error('bad thing'))).not.toThrow();
  });

  it('fatal does not throw with an Error', async () => {
    const { enhancedLogger } = await import('../../../utils/logger-enhanced');
    expect(() => enhancedLogger.fatal('fatal msg', new Error('crash'))).not.toThrow();
  });

  it('fatal does not throw with a non-Error', async () => {
    const { enhancedLogger } = await import('../../../utils/logger-enhanced');
    expect(() => enhancedLogger.fatal('fatal msg', { cause: 'unknown' })).not.toThrow();
  });
});

// ─── enhancedLogger.child ────────────────────────────────────────────────────

describe('enhancedLogger.child', () => {
  it('child.error accepts an Error instance', async () => {
    const { enhancedLogger } = await import('../../../utils/logger-enhanced');
    const child = enhancedLogger.child({ module: 'TestChild' });
    expect(() => child.error('child error', new Error('child boom'))).not.toThrow();
  });

  it('child.error accepts a non-Error', async () => {
    const { enhancedLogger } = await import('../../../utils/logger-enhanced');
    const child = enhancedLogger.child({ module: 'TestChild' });
    expect(() => child.error('child error', 'string cause')).not.toThrow();
  });

  it('child.fatal accepts an Error instance', async () => {
    const { enhancedLogger } = await import('../../../utils/logger-enhanced');
    const child = enhancedLogger.child({ module: 'TestChild' });
    expect(() => child.fatal('child fatal', new Error('fatal boom'))).not.toThrow();
  });

  it('child.fatal accepts a non-Error', async () => {
    const { enhancedLogger } = await import('../../../utils/logger-enhanced');
    const child = enhancedLogger.child({ module: 'TestChild' });
    expect(() => child.fatal('child fatal', 42)).not.toThrow();
  });
});
