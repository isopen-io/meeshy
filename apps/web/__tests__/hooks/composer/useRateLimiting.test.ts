import { renderHook, act } from '@testing-library/react';
import { useRateLimiting } from '@/hooks/composer/useRateLimiting';

describe('useRateLimiting', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('should enforce cooldown between sends', async () => {
    const onSend = jest.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useRateLimiting({ cooldownMs: 500, onSend }));

    // First send should work immediately
    await act(async () => {
      await result.current.sendWithRateLimit();
    });

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(result.current.isInCooldown).toBe(true);

    // Second send should be blocked
    await act(async () => {
      await result.current.sendWithRateLimit();
    });

    expect(onSend).toHaveBeenCalledTimes(1); // Still 1

    // After cooldown, should work again
    act(() => {
      jest.advanceTimersByTime(500);
    });

    await act(async () => {
      await result.current.sendWithRateLimit();
    });

    expect(onSend).toHaveBeenCalledTimes(2);
  });

  it('should queue multiple sends when enableQueue is true', async () => {
    const onSend = jest.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useRateLimiting({
      cooldownMs: 500,
      onSend,
      enableQueue: true
    }));

    // Send 3 messages rapidly
    await act(async () => {
      result.current.sendWithRateLimit();
      result.current.sendWithRateLimit();
      result.current.sendWithRateLimit();
    });

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(result.current.queueLength).toBe(2);

    // Process first queued message
    await act(async () => {
      jest.advanceTimersByTime(500);
    });

    expect(onSend).toHaveBeenCalledTimes(2);
    expect(result.current.queueLength).toBe(1);

    // Process second queued message
    await act(async () => {
      jest.advanceTimersByTime(500);
    });

    expect(onSend).toHaveBeenCalledTimes(3);
    expect(result.current.queueLength).toBe(0);
    expect(result.current.isInCooldown).toBe(false);
  });

  it('should not queue when enableQueue is false', async () => {
    const onSend = jest.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useRateLimiting({
      cooldownMs: 500,
      onSend,
      enableQueue: false
    }));

    // Send 3 messages rapidly
    await act(async () => {
      result.current.sendWithRateLimit();
      result.current.sendWithRateLimit();
      result.current.sendWithRateLimit();
    });

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(result.current.queueLength).toBe(0);
  });

  it('should use default cooldown of 500ms', async () => {
    const onSend = jest.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useRateLimiting({ onSend }));

    await act(async () => {
      await result.current.sendWithRateLimit();
    });

    expect(onSend).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.sendWithRateLimit();
    });

    expect(onSend).toHaveBeenCalledTimes(1); // Blocked

    act(() => {
      jest.advanceTimersByTime(500);
    });

    await act(async () => {
      await result.current.sendWithRateLimit();
    });

    expect(onSend).toHaveBeenCalledTimes(2);
  });

  it('should clear cooldown after cooldownMs when no queue', async () => {
    const onSend = jest.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useRateLimiting({ cooldownMs: 500, onSend }));

    await act(async () => {
      await result.current.sendWithRateLimit();
    });

    expect(result.current.isInCooldown).toBe(true);

    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(result.current.isInCooldown).toBe(false);
  });
});
