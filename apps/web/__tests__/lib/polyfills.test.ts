/**
 * Tests for lib/polyfills.ts
 *
 * Strategy: delete browser globals to trigger each polyfill branch,
 * then re-import the module via jest.resetModules() to execute fresh.
 */

// Suppress the expected console.info on polyfills load
const originalConsoleInfo = console.info;
const originalConsoleWarn = console.warn;

beforeEach(() => {
  jest.resetModules();
  console.info = jest.fn();
  console.warn = jest.fn();
});

afterEach(() => {
  console.info = originalConsoleInfo;
  console.warn = originalConsoleWarn;
});

// ─── Promise.allSettled polyfill ──────────────────────────────────────────────

describe('Promise.allSettled polyfill', () => {
  it('does not override Promise.allSettled when already available', async () => {
    const original = Promise.allSettled;
    await import('@/lib/polyfills');
    expect(Promise.allSettled).toBe(original);
  });

  it('installs Promise.allSettled when missing', async () => {
    const saved = Promise.allSettled;
    // @ts-expect-error — deliberately removing native method
    delete Promise.allSettled;
    expect(Promise.allSettled).toBeUndefined();
    await import('@/lib/polyfills');
    expect(typeof Promise.allSettled).toBe('function');
    // Restore
    Promise.allSettled = saved;
  });

  it('polyfilled Promise.allSettled resolves fulfilled promises', async () => {
    const saved = Promise.allSettled;
    // @ts-expect-error
    delete Promise.allSettled;
    await import('@/lib/polyfills');
    const results = await Promise.allSettled([Promise.resolve(1), Promise.resolve(2)]);
    expect(results).toEqual([
      { status: 'fulfilled', value: 1 },
      { status: 'fulfilled', value: 2 },
    ]);
    Promise.allSettled = saved;
  });

  it('polyfilled Promise.allSettled handles rejected promises', async () => {
    const saved = Promise.allSettled;
    // @ts-expect-error
    delete Promise.allSettled;
    await import('@/lib/polyfills');
    const results = await Promise.allSettled([Promise.resolve(1), Promise.reject('err')]);
    expect(results).toEqual([
      { status: 'fulfilled', value: 1 },
      { status: 'rejected', reason: 'err' },
    ]);
    Promise.allSettled = saved;
  });
});

// ─── structuredClone polyfill ─────────────────────────────────────────────────

describe('structuredClone polyfill', () => {
  it('does not override structuredClone when already available', async () => {
    const original = globalThis.structuredClone;
    await import('@/lib/polyfills');
    expect(globalThis.structuredClone).toBe(original);
  });

  it('installs structuredClone when missing', async () => {
    const saved = globalThis.structuredClone;
    // @ts-expect-error
    delete globalThis.structuredClone;
    expect(globalThis.structuredClone).toBeUndefined();
    await import('@/lib/polyfills');
    expect(typeof globalThis.structuredClone).toBe('function');
    globalThis.structuredClone = saved;
  });

  it('polyfilled structuredClone deep-clones an object', async () => {
    const saved = globalThis.structuredClone;
    // @ts-expect-error
    delete globalThis.structuredClone;
    await import('@/lib/polyfills');
    const original = { a: 1, b: { c: 2 } };
    const clone = globalThis.structuredClone(original);
    expect(clone).toEqual(original);
    expect(clone).not.toBe(original);
    expect(clone.b).not.toBe(original.b);
    globalThis.structuredClone = saved;
  });
});

// ─── queueMicrotask polyfill ──────────────────────────────────────────────────

describe('queueMicrotask polyfill', () => {
  it('does not override queueMicrotask when already available', async () => {
    const original = globalThis.queueMicrotask;
    await import('@/lib/polyfills');
    expect(globalThis.queueMicrotask).toBe(original);
  });

  it('installs queueMicrotask when missing', async () => {
    const saved = globalThis.queueMicrotask;
    // @ts-expect-error
    delete globalThis.queueMicrotask;
    expect(globalThis.queueMicrotask).toBeUndefined();
    await import('@/lib/polyfills');
    expect(typeof globalThis.queueMicrotask).toBe('function');
    globalThis.queueMicrotask = saved;
  });

  it('polyfilled queueMicrotask executes the callback', async () => {
    const saved = globalThis.queueMicrotask;
    // @ts-expect-error
    delete globalThis.queueMicrotask;
    await import('@/lib/polyfills');
    const callback = jest.fn();
    globalThis.queueMicrotask(callback);
    await Promise.resolve(); // flush microtask queue
    expect(callback).toHaveBeenCalled();
    globalThis.queueMicrotask = saved;
  });
});

// ─── Module import doesn't throw ─────────────────────────────────────────────

describe('module import', () => {
  it('imports without throwing', async () => {
    await expect(import('@/lib/polyfills')).resolves.toBeDefined();
  });

  it('logs a success message on load', async () => {
    await import('@/lib/polyfills');
    expect(console.info).toHaveBeenCalledWith('[Polyfills] Polyfills loaded successfully');
  });
});
