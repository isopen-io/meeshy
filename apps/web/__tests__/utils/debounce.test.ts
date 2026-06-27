/**
 * Tests for utils/debounce.ts
 */

import { debounce, debounceWithCancel } from '@/utils/debounce';

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

// ─── debounce ────────────────────────────────────────────────────────────────

describe('debounce', () => {
  it('does not call the function immediately', () => {
    const fn = jest.fn();
    const debounced = debounce(fn, 300);
    debounced();
    expect(fn).not.toHaveBeenCalled();
  });

  it('calls the function after the wait period', () => {
    const fn = jest.fn();
    const debounced = debounce(fn, 300);
    debounced();
    jest.advanceTimersByTime(300);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('only calls the function once for multiple rapid calls', () => {
    const fn = jest.fn();
    const debounced = debounce(fn, 300);
    debounced();
    debounced();
    debounced();
    jest.advanceTimersByTime(300);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('passes arguments to the function', () => {
    const fn = jest.fn();
    const debounced = debounce(fn, 100);
    debounced('a', 'b');
    jest.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledWith('a', 'b');
  });

  it('uses the last call arguments when called multiple times', () => {
    const fn = jest.fn();
    const debounced = debounce(fn, 100);
    debounced('first');
    debounced('second');
    debounced('third');
    jest.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledWith('third');
  });

  it('resets the timer on each call', () => {
    const fn = jest.fn();
    const debounced = debounce(fn, 300);
    debounced();
    jest.advanceTimersByTime(200);
    debounced();
    jest.advanceTimersByTime(200);
    expect(fn).not.toHaveBeenCalled();
    jest.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

// ─── debounceWithCancel ────────────────────────────────────────────────────────

describe('debounceWithCancel', () => {
  it('does not call the function immediately', () => {
    const fn = jest.fn();
    const { debounced } = debounceWithCancel(fn, 300);
    debounced();
    expect(fn).not.toHaveBeenCalled();
  });

  it('calls the function after the wait period', () => {
    const fn = jest.fn();
    const { debounced } = debounceWithCancel(fn, 300);
    debounced();
    jest.advanceTimersByTime(300);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not call the function after cancel', () => {
    const fn = jest.fn();
    const { debounced, cancel } = debounceWithCancel(fn, 300);
    debounced();
    cancel();
    jest.advanceTimersByTime(300);
    expect(fn).not.toHaveBeenCalled();
  });

  it('can call debounced again after cancel', () => {
    const fn = jest.fn();
    const { debounced, cancel } = debounceWithCancel(fn, 100);
    debounced();
    cancel();
    debounced();
    jest.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('cancel is safe to call with no pending timer', () => {
    const { cancel } = debounceWithCancel(jest.fn(), 100);
    expect(() => cancel()).not.toThrow();
  });
});
