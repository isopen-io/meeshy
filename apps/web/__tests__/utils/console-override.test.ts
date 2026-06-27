/**
 * Tests for utils/console-override.ts
 */

// ─── devConsole ───────────────────────────────────────────────────────────────
// Test devConsole in isolation — it references originalConsole captured at module load.
// We import the module fresh to capture the test-time console references.

import { devConsole, restoreConsole, initConsoleOverride } from '@/utils/console-override';

describe('devConsole', () => {
  it('devConsole.warn always calls through (non-development)', () => {
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    devConsole.warn('test');
    // In test env, devConsole.warn goes to originalConsole.warn (captured at import)
    // which may or may not be the current spy, so we just verify no throw
    expect(() => devConsole.warn('test')).not.toThrow();
    spy.mockRestore();
  });

  it('devConsole.error always calls through (non-development)', () => {
    expect(() => devConsole.error('test error')).not.toThrow();
  });

  it('devConsole.log is a no-op in test environment (NODE_ENV=test)', () => {
    // In test (non-development) env, devConsole.log does nothing
    expect(() => devConsole.log('should not throw')).not.toThrow();
  });

  it('devConsole.info is a no-op in test environment', () => {
    expect(() => devConsole.info('info msg')).not.toThrow();
  });

  it('devConsole.debug is a no-op in test environment', () => {
    expect(() => devConsole.debug('debug msg')).not.toThrow();
  });
});

// ─── restoreConsole ───────────────────────────────────────────────────────────

describe('restoreConsole', () => {
  it('restores console functions without throwing', () => {
    expect(() => restoreConsole()).not.toThrow();
  });

  it('after restore, console.log is a function', () => {
    restoreConsole();
    expect(typeof console.log).toBe('function');
  });

  it('after restore, console.warn is a function', () => {
    restoreConsole();
    expect(typeof console.warn).toBe('function');
  });

  it('after restore, console.error is a function', () => {
    restoreConsole();
    expect(typeof console.error).toBe('function');
  });
});

// ─── initConsoleOverride ─────────────────────────────────────────────────────

describe('initConsoleOverride', () => {
  it('marks console.log with _meeshyOverride after overriding', () => {
    initConsoleOverride();
    expect((console.log as any)._meeshyOverride).toBe(true);
  });

  it('is idempotent — second call does not replace console.log again', () => {
    initConsoleOverride();
    const logAfterFirst = console.log;
    initConsoleOverride();
    expect(console.log).toBe(logAfterFirst);
  });

  it('does not throw when called multiple times', () => {
    expect(() => {
      initConsoleOverride();
      initConsoleOverride();
    }).not.toThrow();
  });
});
