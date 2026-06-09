import { renderHook, act } from '@testing-library/react';
import { useCallDuration, formatCallDuration } from '@/hooks/use-call-duration';

describe('formatCallDuration', () => {
  it.each([
    [0, '0:00'],
    [5, '0:05'],
    [65, '1:05'],
    [600, '10:00'],
    [3661, '1:01:01'],
    [-10, '0:00'],
  ])('formats %i seconds as %s', (input, expected) => {
    expect(formatCallDuration(input)).toBe(expected);
  });
});

describe('useCallDuration', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('returns 0 when there is no start time', () => {
    const { result } = renderHook(() => useCallDuration(null));
    expect(result.current.seconds).toBe(0);
    expect(result.current.label).toBe('0:00');
  });

  it('ticks the elapsed time forward from the start', () => {
    const start = new Date(Date.now() - 3000); // started 3s ago
    const { result } = renderHook(() => useCallDuration(start));
    expect(result.current.seconds).toBe(3);

    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(result.current.seconds).toBe(5);
    expect(result.current.label).toBe('0:05');
  });

  it('resets to 0 when the start time is cleared', () => {
    const { result, rerender } = renderHook(({ s }) => useCallDuration(s), {
      initialProps: { s: new Date(Date.now() - 10000) as Date | null },
    });
    expect(result.current.seconds).toBe(10);

    rerender({ s: null });
    expect(result.current.seconds).toBe(0);
  });
});
