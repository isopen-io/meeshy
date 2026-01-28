import { renderHook } from '@testing-library/react';
import { usePerformanceProfile } from '@/hooks/usePerformanceProfile';

describe('usePerformanceProfile', () => {
  it('should detect high performance profile on capable device', () => {
    // Mock navigator properties
    Object.defineProperty(navigator, 'hardwareConcurrency', { value: 8, configurable: true });
    Object.defineProperty(navigator, 'deviceMemory', { value: 8, configurable: true });

    const { result } = renderHook(() => usePerformanceProfile());

    expect(result.current).toBe('high');
  });

  it('should detect low performance profile on constrained device', () => {
    Object.defineProperty(navigator, 'hardwareConcurrency', { value: 2, configurable: true });
    Object.defineProperty(navigator, 'deviceMemory', { value: 2, configurable: true });

    const { result } = renderHook(() => usePerformanceProfile());

    expect(result.current).toBe('low');
  });
});
