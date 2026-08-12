import { renderHook, act } from '@testing-library/react';
import { useResolvedTheme } from '@/hooks/use-resolved-theme';
import { useAppStore } from '@/stores/app-store';

type MediaListener = (event: { matches: boolean }) => void;

function mockSystemPreference(initiallyDark: boolean) {
  const listeners: MediaListener[] = [];
  const mediaQueryList = {
    matches: initiallyDark,
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_event: string, listener: MediaListener) => {
      listeners.push(listener);
    },
    removeEventListener: (_event: string, listener: MediaListener) => {
      const index = listeners.indexOf(listener);
      if (index >= 0) listeners.splice(index, 1);
    },
  };
  window.matchMedia = jest.fn().mockReturnValue(mediaQueryList) as unknown as typeof window.matchMedia;
  return {
    setDark: (dark: boolean) => {
      mediaQueryList.matches = dark;
      listeners.forEach(listener => listener({ matches: dark }));
    },
    listenerCount: () => listeners.length,
  };
}

describe('useResolvedTheme', () => {
  afterEach(() => {
    act(() => {
      useAppStore.getState().setTheme('auto');
    });
  });

  it('returns dark when the stored theme is dark', () => {
    mockSystemPreference(false);
    act(() => {
      useAppStore.getState().setTheme('dark');
    });

    const { result } = renderHook(() => useResolvedTheme());

    expect(result.current).toBe('dark');
  });

  it('returns light when the stored theme is light', () => {
    mockSystemPreference(true);
    act(() => {
      useAppStore.getState().setTheme('light');
    });

    const { result } = renderHook(() => useResolvedTheme());

    expect(result.current).toBe('light');
  });

  it('follows the system preference when the stored theme is auto', () => {
    mockSystemPreference(true);
    act(() => {
      useAppStore.getState().setTheme('auto');
    });

    const { result } = renderHook(() => useResolvedTheme());

    expect(result.current).toBe('dark');
  });

  it('reacts to system preference changes while in auto mode', () => {
    const system = mockSystemPreference(false);
    act(() => {
      useAppStore.getState().setTheme('auto');
    });

    const { result } = renderHook(() => useResolvedTheme());
    expect(result.current).toBe('light');

    act(() => {
      system.setDark(true);
    });

    expect(result.current).toBe('dark');
  });

  it('reacts to store theme changes after mount', () => {
    mockSystemPreference(false);
    act(() => {
      useAppStore.getState().setTheme('light');
    });

    const { result } = renderHook(() => useResolvedTheme());
    expect(result.current).toBe('light');

    act(() => {
      useAppStore.getState().setTheme('dark');
    });

    expect(result.current).toBe('dark');
  });

  it('removes the media listener on unmount', () => {
    const system = mockSystemPreference(false);
    act(() => {
      useAppStore.getState().setTheme('auto');
    });

    const { unmount } = renderHook(() => useResolvedTheme());
    expect(system.listenerCount()).toBeGreaterThan(0);

    unmount();

    expect(system.listenerCount()).toBe(0);
  });

  it('reacts to system preference changing from dark to light', () => {
    const system = mockSystemPreference(true);
    act(() => {
      useAppStore.getState().setTheme('auto');
    });

    const { result } = renderHook(() => useResolvedTheme());
    expect(result.current).toBe('dark');

    act(() => {
      system.setDark(false);
    });

    expect(result.current).toBe('light');
  });

});
