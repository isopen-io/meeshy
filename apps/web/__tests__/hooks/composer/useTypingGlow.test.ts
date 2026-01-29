import { renderHook } from '@testing-library/react';
import { useTypingGlow } from '@/hooks/composer/useTypingGlow';

describe('useTypingGlow', () => {
  it('should return blue color when below 50% capacity', () => {
    const { result } = renderHook(() =>
      useTypingGlow({
        currentLength: 40,
        maxLength: 100,
        isTyping: true,
      })
    );

    expect(result.current.glowColor).toBe('rgba(59, 130, 246, 0.4)');
    expect(result.current.glowIntensity).toBe(0.4);
    expect(result.current.shouldGlow).toBe(true);
    expect(result.current.isNearLimit).toBe(false);
  });

  it('should return violet color when between 50% and 90%', () => {
    const { result } = renderHook(() =>
      useTypingGlow({
        currentLength: 70,
        maxLength: 100,
        isTyping: true,
      })
    );

    expect(result.current.glowColor).toBe('rgba(139, 92, 246, 0.4)');
    expect(result.current.glowIntensity).toBe(0.7);
    expect(result.current.shouldGlow).toBe(true);
    expect(result.current.isNearLimit).toBe(false);
  });

  it('should return pink color when between 90% and 100%', () => {
    const { result } = renderHook(() =>
      useTypingGlow({
        currentLength: 95,
        maxLength: 100,
        isTyping: true,
      })
    );

    expect(result.current.glowColor).toBe('rgba(236, 72, 153, 0.4)');
    expect(result.current.glowIntensity).toBe(0.95);
    expect(result.current.shouldGlow).toBe(true);
    expect(result.current.isNearLimit).toBe(true);
  });

  it('should return red color when at or above 100%', () => {
    const { result } = renderHook(() =>
      useTypingGlow({
        currentLength: 110,
        maxLength: 100,
        isTyping: true,
      })
    );

    expect(result.current.glowColor).toBe('rgba(239, 68, 68, 0.5)');
    expect(result.current.glowIntensity).toBe(1); // Capped at 1
    expect(result.current.shouldGlow).toBe(true);
    expect(result.current.isNearLimit).toBe(true);
  });

  it('should not glow when not typing', () => {
    const { result } = renderHook(() =>
      useTypingGlow({
        currentLength: 50,
        maxLength: 100,
        isTyping: false,
      })
    );

    expect(result.current.shouldGlow).toBe(false);
  });

  it('should set isNearLimit when at or above 90%', () => {
    const { result: result90 } = renderHook(() =>
      useTypingGlow({
        currentLength: 90,
        maxLength: 100,
        isTyping: true,
      })
    );

    expect(result90.current.isNearLimit).toBe(true);

    const { result: result89 } = renderHook(() =>
      useTypingGlow({
        currentLength: 89,
        maxLength: 100,
        isTyping: true,
      })
    );

    expect(result89.current.isNearLimit).toBe(false);
  });
});
