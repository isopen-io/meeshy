/**
 * Tests for debounce utility
 */

import { debounce, debounceWithCancel } from '../../utils/debounce';

describe('debounce', () => {
  beforeEach(() => {
    // Use real timers for async operations (promises, setTimeout, etc.)
    jest.useRealTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('debounce function', () => {
    it('should delay function execution', () => {
      const mockFn = jest.fn();
      const debouncedFn = debounce(mockFn, 100);

      debouncedFn();
      expect(mockFn).not.toHaveBeenCalled();

      jest.advanceTimersByTime(100);
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should cancel previous calls when called multiple times', () => {
      const mockFn = jest.fn();
      const debouncedFn = debounce(mockFn, 100);

      debouncedFn();
      debouncedFn();
      debouncedFn();

      jest.advanceTimersByTime(100);
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should pass arguments to the debounced function', () => {
      const mockFn = jest.fn();
      const debouncedFn = debounce(mockFn, 100);

      debouncedFn('arg1', 'arg2');

      jest.advanceTimersByTime(100);
      expect(mockFn).toHaveBeenCalledWith('arg1', 'arg2');
    });

    it('should use the last call arguments', () => {
      const mockFn = jest.fn();
      const debouncedFn = debounce(mockFn, 100);

      debouncedFn('first');
      debouncedFn('second');
      debouncedFn('third');

      jest.advanceTimersByTime(100);
      expect(mockFn).toHaveBeenCalledWith('third');
    });

    it('should allow multiple executions over time', () => {
      const mockFn = jest.fn();
      const debouncedFn = debounce(mockFn, 100);

      debouncedFn();
      jest.advanceTimersByTime(100);
      expect(mockFn).toHaveBeenCalledTimes(1);

      debouncedFn();
      jest.advanceTimersByTime(100);
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('should work with zero wait time', () => {
      const mockFn = jest.fn();
      const debouncedFn = debounce(mockFn, 0);

      debouncedFn();
      jest.advanceTimersByTime(0);
      expect(mockFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('debounceWithCancel function', () => {
    it('should delay function execution', () => {
      const mockFn = jest.fn();
      const { debounced } = debounceWithCancel(mockFn, 100);

      debounced();
      expect(mockFn).not.toHaveBeenCalled();

      jest.advanceTimersByTime(100);
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should cancel pending execution', () => {
      const mockFn = jest.fn();
      const { debounced, cancel } = debounceWithCancel(mockFn, 100);

      debounced();
      cancel();

      jest.advanceTimersByTime(100);
      expect(mockFn).not.toHaveBeenCalled();
    });

    it('should allow calling debounced again after cancel', () => {
      const mockFn = jest.fn();
      const { debounced, cancel } = debounceWithCancel(mockFn, 100);

      debounced();
      cancel();

      debounced();
      jest.advanceTimersByTime(100);
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should cancel safely when no pending execution', () => {
      const mockFn = jest.fn();
      const { cancel } = debounceWithCancel(mockFn, 100);

      // Should not throw
      expect(() => cancel()).not.toThrow();
    });

    it('should pass arguments correctly', () => {
      const mockFn = jest.fn();
      const { debounced } = debounceWithCancel(mockFn, 100);

      debounced('test', 123);

      jest.advanceTimersByTime(100);
      expect(mockFn).toHaveBeenCalledWith('test', 123);
    });

    it('should handle multiple cancel calls', () => {
      const mockFn = jest.fn();
      const { debounced, cancel } = debounceWithCancel(mockFn, 100);

      debounced();
      cancel();
      cancel();
      cancel();

      jest.advanceTimersByTime(100);
      expect(mockFn).not.toHaveBeenCalled();
    });
  });
});
