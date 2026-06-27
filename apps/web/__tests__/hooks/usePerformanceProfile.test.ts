import { renderHook, act } from '@testing-library/react';
import { usePerformanceProfile } from '@/hooks/usePerformanceProfile';

describe('usePerformanceProfile', () => {
  let rafCallback: ((time: number) => void) | null = null;

  beforeEach(() => {
    rafCallback = null;
    // Fake timers replace performance.now with a controllable clock so that
    // jest.advanceTimersByTime(N) produces a measurable frame duration.
    // jest.spyOn alone does not intercept jsdom's native performance.now (prototype method).
    jest.useFakeTimers();

    // Mock requestAnimationFrame to capture the callback for manual execution
    jest.spyOn(global, 'requestAnimationFrame').mockImplementation((callback) => {
      rafCallback = callback;
      return 1;
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();

    // Clean up navigator mocks to prevent test pollution
    delete (navigator as any).hardwareConcurrency;
    delete (navigator as any).deviceMemory;
    delete (navigator as any).connection;
  });

  it('should detect high performance profile on capable device', async () => {
    Object.defineProperty(navigator, 'hardwareConcurrency', { value: 8, configurable: true });
    Object.defineProperty(navigator, 'deviceMemory', { value: 8, configurable: true });
    Object.defineProperty(navigator, 'connection', {
      value: { effectiveType: '4g' },
      configurable: true
    });

    const { result } = renderHook(() => usePerformanceProfile());

    jest.advanceTimersByTime(10); // 10ms frame → runtimeScore = 2 (below 16ms)
    act(() => rafCallback!(0));

    expect(result.current).toBe('high');
  });

  it('should detect medium performance profile on mid-range device', async () => {
    // Mid-range: 3-4 cores, 3-4 GB (> 2 but < 4)
    Object.defineProperty(navigator, 'hardwareConcurrency', { value: 3, configurable: true });
    Object.defineProperty(navigator, 'deviceMemory', { value: 3, configurable: true });
    Object.defineProperty(navigator, 'connection', {
      value: { effectiveType: '4g' },
      configurable: true
    });

    const { result } = renderHook(() => usePerformanceProfile());

    jest.advanceTimersByTime(10); // 10ms frame → runtimeScore = 2
    act(() => rafCallback!(0));

    expect(result.current).toBe('medium');
  });

  it('should detect low performance profile on constrained device', async () => {
    Object.defineProperty(navigator, 'hardwareConcurrency', { value: 1, configurable: true });
    Object.defineProperty(navigator, 'deviceMemory', { value: 1, configurable: true });

    const { result } = renderHook(() => usePerformanceProfile());

    jest.advanceTimersByTime(10); // 10ms frame → runtimeScore = 2
    act(() => rafCallback!(0));

    expect(result.current).toBe('low');
  });

  it('should force low profile on slow connection regardless of hardware', async () => {
    Object.defineProperty(navigator, 'hardwareConcurrency', { value: 8, configurable: true });
    Object.defineProperty(navigator, 'deviceMemory', { value: 8, configurable: true });
    Object.defineProperty(navigator, 'connection', {
      value: { effectiveType: '2g' },
      configurable: true
    });

    const { result } = renderHook(() => usePerformanceProfile());

    jest.advanceTimersByTime(10); // 10ms frame → runtimeScore = 2
    act(() => rafCallback!(0));

    expect(result.current).toBe('low');
  });

  it('should downgrade to low profile on slow frame timing', async () => {
    Object.defineProperty(navigator, 'hardwareConcurrency', { value: 8, configurable: true });
    Object.defineProperty(navigator, 'deviceMemory', { value: 8, configurable: true });
    Object.defineProperty(navigator, 'connection', {
      value: { effectiveType: '4g' },
      configurable: true
    });

    const { result } = renderHook(() => usePerformanceProfile());

    jest.advanceTimersByTime(35); // 35ms frame > 32ms threshold → runtimeScore = 0
    act(() => rafCallback!(0));

    expect(result.current).toBe('low');
  });

  it('should downgrade to medium profile on moderate frame timing', async () => {
    Object.defineProperty(navigator, 'hardwareConcurrency', { value: 8, configurable: true });
    Object.defineProperty(navigator, 'deviceMemory', { value: 8, configurable: true });
    Object.defineProperty(navigator, 'connection', {
      value: { effectiveType: '4g' },
      configurable: true
    });

    const { result } = renderHook(() => usePerformanceProfile());

    jest.advanceTimersByTime(20); // 20ms frame > 16ms threshold → runtimeScore = 1
    act(() => rafCallback!(0));

    expect(result.current).toBe('medium');
  });

  it('should handle missing deviceMemory gracefully', async () => {
    Object.defineProperty(navigator, 'hardwareConcurrency', { value: 8, configurable: true });
    Object.defineProperty(navigator, 'deviceMemory', { value: undefined, configurable: true });

    const { result } = renderHook(() => usePerformanceProfile());

    jest.advanceTimersByTime(10); // 10ms frame → runtimeScore = 2
    act(() => rafCallback!(0));

    // Should default to 4GB and detect as medium (cores > 4, memory = 4)
    expect(['medium', 'high']).toContain(result.current);
  });

  it('should handle missing hardwareConcurrency gracefully', async () => {
    Object.defineProperty(navigator, 'hardwareConcurrency', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'deviceMemory', { value: 8, configurable: true });

    const { result } = renderHook(() => usePerformanceProfile());

    jest.advanceTimersByTime(10); // 10ms frame → runtimeScore = 2
    act(() => rafCallback!(0));

    // Should default to 4 cores and detect as medium (cores = 4, memory > 4)
    expect(['medium', 'high']).toContain(result.current);
  });

  it('should handle missing connection API gracefully', async () => {
    Object.defineProperty(navigator, 'hardwareConcurrency', { value: 8, configurable: true });
    Object.defineProperty(navigator, 'deviceMemory', { value: 8, configurable: true });
    Object.defineProperty(navigator, 'connection', { value: undefined, configurable: true });

    const { result } = renderHook(() => usePerformanceProfile());

    jest.advanceTimersByTime(10); // 10ms frame → runtimeScore = 2
    act(() => rafCallback!(0));

    expect(result.current).toBe('high');
  });
});
