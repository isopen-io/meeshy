import { renderHook } from '@testing-library/react';
import { useAnimationConfig } from '@/hooks/composer/useAnimationConfig';
import { usePerformanceProfile } from '@/hooks/usePerformanceProfile';

jest.mock('@/hooks/usePerformanceProfile');

describe('useAnimationConfig', () => {
  it('should return high-performance config when profile is high', () => {
    (usePerformanceProfile as jest.Mock).mockReturnValue('high');

    const { result } = renderHook(() => useAnimationConfig());

    expect(result.current.staggerDelay).toBe(0.05);
    expect(result.current.duration).toBe(0.4);
    expect(result.current.enableBlur).toBe(true);
    expect(result.current.enableShimmer).toBe(true);
    expect(result.current.enableRotation).toBe(true);
    expect(result.current.blurAmount).toBe(20);
    expect(result.current.spring).toEqual({
      type: 'spring',
      stiffness: 400,
      damping: 25,
    });
  });

  it('should return medium-performance config when profile is medium', () => {
    (usePerformanceProfile as jest.Mock).mockReturnValue('medium');

    const { result } = renderHook(() => useAnimationConfig());

    expect(result.current.staggerDelay).toBe(0.08);
    expect(result.current.duration).toBe(0.3);
    expect(result.current.enableBlur).toBe(false);
    expect(result.current.enableShimmer).toBe(false);
    expect(result.current.enableRotation).toBe(false);
    expect(result.current.blurAmount).toBe(16);
    expect(result.current.spring).toEqual({
      type: 'tween',
      duration: 0.3,
    });
  });

  it('should return low-performance config when profile is low', () => {
    (usePerformanceProfile as jest.Mock).mockReturnValue('low');

    const { result } = renderHook(() => useAnimationConfig());

    expect(result.current.staggerDelay).toBe(0);
    expect(result.current.duration).toBe(0.2);
    expect(result.current.enableBlur).toBe(false);
    expect(result.current.enableShimmer).toBe(false);
    expect(result.current.enableRotation).toBe(false);
    expect(result.current.blurAmount).toBe(8);
    expect(result.current.spring).toEqual({
      type: 'tween',
      duration: 0.2,
    });
  });

  it('should use spring type for high performance', () => {
    (usePerformanceProfile as jest.Mock).mockReturnValue('high');

    const { result } = renderHook(() => useAnimationConfig());

    expect(result.current.spring.type).toBe('spring');
    expect(result.current.spring.stiffness).toBe(400);
    expect(result.current.spring.damping).toBe(25);
  });

  it('should use tween type for medium and low performance', () => {
    (usePerformanceProfile as jest.Mock).mockReturnValue('medium');
    const { result: mediumResult } = renderHook(() => useAnimationConfig());
    expect(mediumResult.current.spring.type).toBe('tween');

    (usePerformanceProfile as jest.Mock).mockReturnValue('low');
    const { result: lowResult } = renderHook(() => useAnimationConfig());
    expect(lowResult.current.spring.type).toBe('tween');
  });
});
