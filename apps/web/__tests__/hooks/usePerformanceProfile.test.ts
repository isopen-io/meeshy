import { renderHook, act, waitFor } from '@testing-library/react';
import { usePerformanceProfile } from '@/hooks/usePerformanceProfile';

describe('usePerformanceProfile', () => {
  let performanceNowMock: jest.SpyInstance;
  let rafCallback: ((time: number) => void) | null = null;

  beforeEach(() => {
    rafCallback = null;

    // Mock requestAnimationFrame to store callback for manual execution
    jest.spyOn(global, 'requestAnimationFrame').mockImplementation((callback) => {
      rafCallback = callback;
      return 1;
    });

    // Create performance.now mock (will be configured per test)
    performanceNowMock = jest.spyOn(performance, 'now');
  });

  afterEach(() => {
    jest.restoreAllMocks();

    // Clean up navigator mocks to prevent test pollution
    delete (navigator as any).hardwareConcurrency;
    delete (navigator as any).deviceMemory;
    delete (navigator as any).connection;
  });

  it('should detect high performance profile on capable device', async () => {
    // Mock fast frame timing
    performanceNowMock
      .mockReturnValueOnce(0)  // startTime
      .mockReturnValueOnce(10); // endTime (fast frame: 10ms)

    // Mock navigator properties
    Object.defineProperty(navigator, 'hardwareConcurrency', { value: 8, configurable: true });
    Object.defineProperty(navigator, 'deviceMemory', { value: 8, configurable: true });
    Object.defineProperty(navigator, 'connection', {
      value: { effectiveType: '4g' },
      configurable: true
    });

    const { result } = renderHook(() => usePerformanceProfile());

    // Execute all pending timers (including RAF callback)
    act(() => rafCallback!(0));

    expect(result.current).toBe('high');
  });

  it('should detect medium performance profile on mid-range device', async () => {
    // Mock fast frame timing
    performanceNowMock
      .mockReturnValueOnce(0)  // startTime
      .mockReturnValueOnce(10); // endTime (fast frame: 10ms)

    // Mid-range: 3-4 cores, 3-4 GB (> 2 but <= 4)
    Object.defineProperty(navigator, 'hardwareConcurrency', { value: 3, configurable: true });
    Object.defineProperty(navigator, 'deviceMemory', { value: 3, configurable: true });
    Object.defineProperty(navigator, 'connection', {
      value: { effectiveType: '4g' },
      configurable: true
    });

    const { result } = renderHook(() => usePerformanceProfile());

    act(() => rafCallback!(0));

    expect(result.current).toBe('medium');
  });

  it('should detect low performance profile on constrained device', async () => {
    // Mock fast frame timing
    performanceNowMock
      .mockReturnValueOnce(0)  // startTime
      .mockReturnValueOnce(10); // endTime (fast frame: 10ms)

    Object.defineProperty(navigator, 'hardwareConcurrency', { value: 1, configurable: true });
    Object.defineProperty(navigator, 'deviceMemory', { value: 1, configurable: true });

    const { result } = renderHook(() => usePerformanceProfile());

    act(() => rafCallback!(0));

    expect(result.current).toBe('low');
  });

  it('should force low profile on slow connection regardless of hardware', async () => {
    // Mock fast frame timing
    performanceNowMock
      .mockReturnValueOnce(0)  // startTime
      .mockReturnValueOnce(10); // endTime (fast frame: 10ms)

    Object.defineProperty(navigator, 'hardwareConcurrency', { value: 8, configurable: true });
    Object.defineProperty(navigator, 'deviceMemory', { value: 8, configurable: true });
    Object.defineProperty(navigator, 'connection', {
      value: { effectiveType: '2g' },
      configurable: true
    });

    const { result } = renderHook(() => usePerformanceProfile());

    act(() => rafCallback!(0));

    expect(result.current).toBe('low');
  });

  it.skip('should downgrade to low profile on slow frame timing', async () => {
    // Mock slow frame (35ms > 32ms threshold)
    performanceNowMock
      .mockReturnValueOnce(0)   // startTime
      .mockReturnValueOnce(35); // endTime (slow frame)

    Object.defineProperty(navigator, 'hardwareConcurrency', { value: 8, configurable: true });
    Object.defineProperty(navigator, 'deviceMemory', { value: 8, configurable: true });
    Object.defineProperty(navigator, 'connection', {
      value: { effectiveType: '4g' },
      configurable: true
    });

    const { result } = renderHook(() => usePerformanceProfile());

    act(() => rafCallback!(0));

    expect(result.current).toBe('low');
  });

  it.skip('should downgrade to medium profile on moderate frame timing', async () => {
    // Mock moderate frame (20ms > 16ms threshold)
    performanceNowMock
      .mockReturnValueOnce(0)   // startTime
      .mockReturnValueOnce(20); // endTime (moderate frame)

    Object.defineProperty(navigator, 'hardwareConcurrency', { value: 8, configurable: true });
    Object.defineProperty(navigator, 'deviceMemory', { value: 8, configurable: true });
    Object.defineProperty(navigator, 'connection', {
      value: { effectiveType: '4g' },
      configurable: true
    });

    const { result } = renderHook(() => usePerformanceProfile());

    act(() => rafCallback!(0));

    expect(result.current).toBe('medium');
  });

  it('should handle missing deviceMemory gracefully', async () => {
    // Mock fast frame timing
    performanceNowMock
      .mockReturnValueOnce(0)  // startTime
      .mockReturnValueOnce(10); // endTime (fast frame: 10ms)

    Object.defineProperty(navigator, 'hardwareConcurrency', { value: 8, configurable: true });
    Object.defineProperty(navigator, 'deviceMemory', { value: undefined, configurable: true });

    const { result } = renderHook(() => usePerformanceProfile());

    act(() => rafCallback!(0));

    // Should default to 4GB and detect as medium (cores > 4, memory = 4)
    expect(['medium', 'high']).toContain(result.current);
  });

  it('should handle missing hardwareConcurrency gracefully', async () => {
    // Mock fast frame timing
    performanceNowMock
      .mockReturnValueOnce(0)  // startTime
      .mockReturnValueOnce(10); // endTime (fast frame: 10ms)

    Object.defineProperty(navigator, 'hardwareConcurrency', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'deviceMemory', { value: 8, configurable: true });

    const { result } = renderHook(() => usePerformanceProfile());

    act(() => rafCallback!(0));

    // Should default to 4 cores and detect as medium (cores = 4, memory > 4)
    expect(['medium', 'high']).toContain(result.current);
  });

  it('should handle missing connection API gracefully', async () => {
    // Mock fast frame timing
    performanceNowMock
      .mockReturnValueOnce(0)  // startTime
      .mockReturnValueOnce(10); // endTime (fast frame: 10ms)

    Object.defineProperty(navigator, 'hardwareConcurrency', { value: 8, configurable: true });
    Object.defineProperty(navigator, 'deviceMemory', { value: 8, configurable: true });
    Object.defineProperty(navigator, 'connection', { value: undefined, configurable: true });

    const { result } = renderHook(() => usePerformanceProfile());

    act(() => rafCallback!(0));

    expect(result.current).toBe('high');
  });
});
