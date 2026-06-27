/**
 * Tests for hooks/use-resolved-theme.ts
 */

const mockUseTheme = jest.fn(() => 'light' as 'light' | 'dark' | 'auto');
jest.mock('@/stores/app-store', () => ({
  useTheme: () => mockUseTheme(),
}));

import { renderHook, act } from '@testing-library/react';
import { useResolvedTheme } from '@/hooks/use-resolved-theme';

beforeEach(() => {
  jest.clearAllMocks();
  mockUseTheme.mockReturnValue('light');

  // Reset matchMedia mock (from jest.setup.js it defaults to matches: false = light)
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });
});

// ─── explicit themes ──────────────────────────────────────────────────────────

describe('explicit themes', () => {
  it('returns "light" when theme is "light"', () => {
    mockUseTheme.mockReturnValue('light');
    const { result } = renderHook(() => useResolvedTheme());
    expect(result.current).toBe('light');
  });

  it('returns "dark" when theme is "dark"', () => {
    mockUseTheme.mockReturnValue('dark');
    const { result } = renderHook(() => useResolvedTheme());
    expect(result.current).toBe('dark');
  });
});

// ─── auto theme — system preference ──────────────────────────────────────────

describe('auto theme', () => {
  it('returns "light" when theme is "auto" and system prefers light', () => {
    mockUseTheme.mockReturnValue('auto');
    // matchMedia returns matches: false (light)
    const { result } = renderHook(() => useResolvedTheme());
    expect(result.current).toBe('light');
  });

  it('returns "dark" when theme is "auto" and system prefers dark', () => {
    mockUseTheme.mockReturnValue('auto');
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation(query => ({
        matches: query === '(prefers-color-scheme: dark)',
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });
    const { result } = renderHook(() => useResolvedTheme());
    expect(result.current).toBe('dark');
  });

  it('listens for system theme changes when in auto mode', () => {
    mockUseTheme.mockReturnValue('auto');
    const addEventListenerMock = jest.fn();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation(() => ({
        matches: false,
        addEventListener: addEventListenerMock,
        removeEventListener: jest.fn(),
      })),
    });
    renderHook(() => useResolvedTheme());
    expect(addEventListenerMock).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('removes listener on unmount when in auto mode', () => {
    mockUseTheme.mockReturnValue('auto');
    const removeEventListenerMock = jest.fn();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation(() => ({
        matches: false,
        addEventListener: jest.fn(),
        removeEventListener: removeEventListenerMock,
      })),
    });
    const { unmount } = renderHook(() => useResolvedTheme());
    unmount();
    expect(removeEventListenerMock).toHaveBeenCalled();
  });
});
