/**
 * withTimeout Unit Tests
 *
 * Verifies the shared timeout helper:
 * - resolves/rejects transparently when the operation settles in time
 * - rejects with a timeout Error (custom + default message) when it does not
 * - ALWAYS clears the underlying timer once the operation settles, so a
 *   winning operation never leaves a pending timer alive on the event loop
 *   (the defect the bare `Promise.race([op, setTimeout-reject])` idiom had)
 *
 * @jest-environment node
 */

import { withTimeout } from '../with-timeout';

describe('withTimeout', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('resolves with the operation value when it settles before the timeout', async () => {
    const result = await withTimeout(Promise.resolve('ok'), 5000);
    expect(result).toBe('ok');
  });

  it('rejects with the operation error when it rejects before the timeout', async () => {
    await expect(
      withTimeout(Promise.reject(new Error('boom')), 5000)
    ).rejects.toThrow('boom');
  });

  it('rejects with the default timeout message when the operation exceeds timeoutMs', async () => {
    const pending = new Promise<string>(() => {});
    const raced = withTimeout(pending, 5000);
    const assertion = expect(raced).rejects.toThrow('Operation timed out after 5000ms');
    await jest.advanceTimersByTimeAsync(5000);
    await assertion;
  });

  it('rejects with a custom message when provided', async () => {
    const pending = new Promise<string>(() => {});
    const raced = withTimeout(pending, 5000, 'ZMQ send timeout');
    const assertion = expect(raced).rejects.toThrow('ZMQ send timeout');
    await jest.advanceTimersByTimeAsync(5000);
    await assertion;
  });

  it('clears the pending timer once the operation resolves (no leaked timer)', async () => {
    await withTimeout(Promise.resolve('ok'), 5000);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('clears the pending timer once the operation rejects (no leaked timer)', async () => {
    await expect(
      withTimeout(Promise.reject(new Error('boom')), 5000)
    ).rejects.toThrow('boom');
    expect(jest.getTimerCount()).toBe(0);
  });

  it('clears the timer after a timeout so nothing lingers on the event loop', async () => {
    const pending = new Promise<string>(() => {});
    const raced = withTimeout(pending, 5000);
    const assertion = expect(raced).rejects.toThrow(/timed out/);
    await jest.advanceTimersByTimeAsync(5000);
    await assertion;
    expect(jest.getTimerCount()).toBe(0);
  });
});
