import { renderHook, act } from '@testing-library/react';
import { useTypingGlow } from '@/hooks/composer/useTypingGlow';

jest.useFakeTimers();

describe('useTypingGlow', () => {
  afterEach(() => {
    jest.clearAllTimers();
  });

  it('should return initial state when not typing', () => {
    const { result } = renderHook(() => useTypingGlow(''));

    expect(result.current.isTyping).toBe(false);
    expect(result.current.glowIntensity).toBe(0);
    expect(result.current.glowColor).toBe('rgb(59, 130, 246)'); // Blue
    expect(result.current.lastTypedTimestamp).toBe(0);
  });

  it('should detect typing when text changes', () => {
    const { result, rerender } = renderHook(
      ({ text }) => useTypingGlow(text),
      { initialProps: { text: '' } }
    );

    expect(result.current.isTyping).toBe(false);

    act(() => {
      rerender({ text: 'H' });
    });

    expect(result.current.isTyping).toBe(true);
    expect(result.current.lastTypedTimestamp).toBeGreaterThan(0);
  });

  it('should increase intensity progressively during typing', () => {
    const { result, rerender } = renderHook(
      ({ text }) => useTypingGlow(text),
      { initialProps: { text: '' } }
    );

    act(() => {
      rerender({ text: 'Hello' });
    });

    const firstIntensity = result.current.glowIntensity;
    expect(firstIntensity).toBeGreaterThan(0);

    act(() => {
      rerender({ text: 'Hello World' });
    });

    expect(result.current.glowIntensity).toBeGreaterThan(firstIntensity);
  });

  it('should progress color from blue to violet to pink', () => {
    const { result, rerender } = renderHook(
      ({ text }) => useTypingGlow(text),
      { initialProps: { text: '' } }
    );

    // Initial: Blue
    expect(result.current.glowColor).toBe('rgb(59, 130, 246)');

    // Type to increase intensity to ~10% (blue range, 0-33%)
    act(() => {
      rerender({ text: 'H' });
    });
    expect(result.current.glowIntensity).toBe(10);
    expect(result.current.glowColor).toBe('rgb(59, 130, 246)'); // Still blue

    // Type more to reach violet range (34-66%) - need 3 more keystrokes to reach 40%
    act(() => {
      rerender({ text: 'He' });
    });
    expect(result.current.glowIntensity).toBe(20);

    act(() => {
      rerender({ text: 'Hel' });
    });
    expect(result.current.glowIntensity).toBe(30);

    act(() => {
      rerender({ text: 'Hell' });
    });
    expect(result.current.glowIntensity).toBe(40);
    const violetColor = result.current.glowColor;
    expect(violetColor).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
    // Should not be pure blue anymore (40% is in violet range)
    expect(violetColor).not.toBe('rgb(59, 130, 246)');

    // Type more to reach pink range (67-100%)
    act(() => {
      rerender({ text: 'Hello' });
    });
    expect(result.current.glowIntensity).toBe(50);

    act(() => {
      rerender({ text: 'Hello ' });
    });
    expect(result.current.glowIntensity).toBe(60);

    act(() => {
      rerender({ text: 'Hello W' });
    });
    expect(result.current.glowIntensity).toBe(70);
    const pinkColor = result.current.glowColor;
    expect(pinkColor).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
    // Should be different from violet (70% is in pink range)
    expect(pinkColor).not.toBe(violetColor);
  });

  it('should stop typing after cooldown and start decay', async () => {
    const { result, rerender } = renderHook(
      ({ text }) => useTypingGlow(text, { cooldownMs: 1000 }),
      { initialProps: { text: '' } }
    );

    act(() => {
      rerender({ text: 'Test' });
    });

    expect(result.current.isTyping).toBe(true);
    const intensityBeforeCooldown = result.current.glowIntensity;
    expect(intensityBeforeCooldown).toBeGreaterThan(0);

    // Fast-forward past cooldown
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(result.current.isTyping).toBe(false);

    // Fast-forward to allow decay
    act(() => {
      jest.advanceTimersByTime(200); // 2 decay ticks (5% each)
    });

    expect(result.current.glowIntensity).toBeLessThan(intensityBeforeCooldown);
  });
});
