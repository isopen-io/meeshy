'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { getThemeColors, theme } from './theme';

export type ThemeMode = 'light' | 'dark' | 'system';

interface UseThemeReturn {
  /** Current resolved theme ('light' or 'dark') */
  resolvedTheme: 'light' | 'dark';
  /** User's theme preference ('light', 'dark', or 'system') */
  themeMode: ThemeMode;
  /** Set the theme mode */
  setThemeMode: (mode: ThemeMode) => void;
  /** Toggle between light and dark */
  toggleTheme: () => void;
  /** Whether dark mode is active */
  isDark: boolean;
  /** Current theme colors based on mode */
  colors: typeof theme.colors;
}

const STORAGE_KEY = 'gp-theme-mode';

/**
 * Hook to manage theme mode (light/dark/system)
 *
 * Features:
 * - Persists preference to localStorage
 * - Respects system preference when set to 'system'
 * - Updates document with data-theme attribute
 * - Provides colors object for current theme
 *
 * Usage:
 * ```tsx
 * const { isDark, toggleTheme, colors } = useTheme();
 * ```
 */
export function useTheme(): UseThemeReturn {
  // Initialize with system preference or stored value
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');
  const [systemPreference, setSystemPreference] = useState<'light' | 'dark'>('light');
  const [mounted, setMounted] = useState(false);

  // Detect system preference
  useEffect(() => {
    setMounted(true);

    // Read stored preference
    const stored = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
    if (stored && ['light', 'dark', 'system'].includes(stored)) {
      setThemeModeState(stored);
    }

    // Detect system preference
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemPreference(mediaQuery.matches ? 'dark' : 'light');

    // Listen for system preference changes
    const handler = (e: MediaQueryListEvent) => {
      setSystemPreference(e.matches ? 'dark' : 'light');
    };

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // Resolve the actual theme
  const resolvedTheme = useMemo(() => {
    if (!mounted) return 'light';
    return themeMode === 'system' ? systemPreference : themeMode;
  }, [themeMode, systemPreference, mounted]);

  const isDark = resolvedTheme === 'dark';

  // Apply theme to document
  useEffect(() => {
    if (!mounted) return;

    const root = document.documentElement;

    // Set data-theme attribute for CSS
    root.setAttribute('data-theme', resolvedTheme);

    // Add/remove dark class for Tailwind
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    // Update theme-color meta tag for browser UI
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    const themeColor = isDark ? '#0D0D0F' : '#FFF8F3';

    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', themeColor);
    } else {
      const meta = document.createElement('meta');
      meta.name = 'theme-color';
      meta.content = themeColor;
      document.head.appendChild(meta);
    }
  }, [resolvedTheme, isDark, mounted]);

  // Set theme mode and persist
  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
    localStorage.setItem(STORAGE_KEY, mode);
  }, []);

  // Toggle between light and dark
  const toggleTheme = useCallback(() => {
    const newMode = isDark ? 'light' : 'dark';
    setThemeMode(newMode);
  }, [isDark, setThemeMode]);

  // Get colors for current theme
  const colors = useMemo(() => getThemeColors(isDark), [isDark]);

  return {
    resolvedTheme,
    themeMode,
    setThemeMode,
    toggleTheme,
    isDark,
    colors,
  };
}

/**
 * Theme context for sharing theme state across components
 */
export { useTheme as default };
