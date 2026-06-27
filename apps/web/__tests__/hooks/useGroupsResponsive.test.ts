import { renderHook, act } from '@testing-library/react';
import { useGroupsResponsive } from '@/hooks/use-groups-responsive';

beforeEach(() => {
  jest.resetAllMocks();
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: 1024,
  });
});

describe('useGroupsResponsive', () => {
  it('showGroupsList starts true on desktop', () => {
    const { result } = renderHook(() => useGroupsResponsive(null));

    expect(result.current.showGroupsList).toBe(true);
  });

  it('isMobile is false when innerWidth >= 768', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 });

    const { result } = renderHook(() => useGroupsResponsive(null));

    expect(result.current.isMobile).toBe(false);
  });

  it('isMobile is true when innerWidth < 768', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 375 });

    const { result } = renderHook(() => useGroupsResponsive(null));

    expect(result.current.isMobile).toBe(true);
  });

  it('on mobile with a selected group, showGroupsList is false', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 375 });

    const { result } = renderHook(() => useGroupsResponsive({ id: '1' }));

    expect(result.current.showGroupsList).toBe(false);
  });

  it('on mobile with no selected group, showGroupsList is true', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 375 });

    const { result } = renderHook(() => useGroupsResponsive(null));

    expect(result.current.showGroupsList).toBe(true);
  });

  it('on desktop with selected group, showGroupsList is still true', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 });

    const { result } = renderHook(() => useGroupsResponsive({ id: '1' }));

    expect(result.current.showGroupsList).toBe(true);
  });

  it('resize event updates isMobile', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 });

    const { result } = renderHook(() => useGroupsResponsive(null));

    expect(result.current.isMobile).toBe(false);

    act(() => {
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 375 });
      window.dispatchEvent(new Event('resize'));
    });

    expect(result.current.isMobile).toBe(true);
  });

  it('setShowGroupsList allows manual override', () => {
    const { result } = renderHook(() => useGroupsResponsive(null));

    act(() => {
      result.current.setShowGroupsList(false);
    });

    expect(result.current.showGroupsList).toBe(false);
  });

  it('unmount removes the resize event listener', () => {
    const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');

    const { unmount } = renderHook(() => useGroupsResponsive(null));

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function));

    removeEventListenerSpy.mockRestore();
  });
});
