'use client';

import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { getThemeColors, theme } from './theme';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  resolvedTheme: 'light' | 'dark';
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
  isDark: boolean;
  colors: ReturnType<typeof getThemeColors>;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = 'gp-theme-mode';

/**
 * Script to inject before hydration to prevent flash
 * This is a static script with no user input - safe for inline use
 */
const themeInitScript = `
(function() {
  try {
    var stored = localStorage.getItem('gp-theme-mode');
    var mode = stored || 'system';
    var isDark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    var meta = document.querySelector('meta[name="theme-color"]');
    var color = isDark ? '#0D0D0F' : '#FFF8F3';
    if (meta) {
      meta.setAttribute('content', color);
    }
  } catch (e) {}
})();
`;

/**
 * Component to inject theme script before hydration
 * Uses static script content - no XSS risk as there's no user input
 */
export function ThemeScript() {
  return (
    <script
      // Static script content, no user input - safe for inline use
      dangerouslySetInnerHTML={{ __html: themeInitScript }}
      suppressHydrationWarning
    />
  );
}

interface ThemeProviderProps {
  children: ReactNode;
  defaultTheme?: ThemeMode;
}

/**
 * Global Theme Provider for V2 Design System
 */
export function V2ThemeProvider({ children, defaultTheme = 'system' }: ThemeProviderProps) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(defaultTheme);
  const [systemPreference, setSystemPreference] = useState<'light' | 'dark'>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemPreference(mediaQuery.matches ? 'dark' : 'light');

    const stored = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
    if (stored && ['light', 'dark', 'system'].includes(stored)) {
      setThemeModeState(stored);
    }

    setMounted(true);

    const handler = (e: MediaQueryListEvent) => {
      setSystemPreference(e.matches ? 'dark' : 'light');
    };

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  const resolvedTheme = useMemo(() => {
    if (!mounted) return 'light';
    return themeMode === 'system' ? systemPreference : themeMode;
  }, [themeMode, systemPreference, mounted]);

  const isDark = resolvedTheme === 'dark';

  useEffect(() => {
    if (!mounted) return;

    const root = document.documentElement;
    root.setAttribute('data-theme', resolvedTheme);

    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

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

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
    localStorage.setItem(STORAGE_KEY, mode);
  }, []);

  const toggleTheme = useCallback(() => {
    const newMode = isDark ? 'light' : 'dark';
    setThemeMode(newMode);
  }, [isDark, setThemeMode]);

  const colors = useMemo(() => getThemeColors(isDark), [isDark]);

  const value = useMemo(() => ({
    resolvedTheme,
    themeMode,
    setThemeMode,
    toggleTheme,
    isDark,
    colors,
  }), [resolvedTheme, themeMode, setThemeMode, toggleTheme, isDark, colors]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

/**
 * Hook to access theme context - must be used within V2ThemeProvider
 */
export function useThemeContext(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemeContext must be used within V2ThemeProvider');
  }
  return context;
}

/**
 * Hook that works both with and without provider
 */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);

  if (context) {
    return context;
  }

  // Fallback for components outside provider
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');
  const [systemPreference, setSystemPreference] = useState<'light' | 'dark'>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
    if (stored && ['light', 'dark', 'system'].includes(stored)) {
      setThemeModeState(stored);
    }
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemPreference(mediaQuery.matches ? 'dark' : 'light');
    const handler = (e: MediaQueryListEvent) => setSystemPreference(e.matches ? 'dark' : 'light');
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  const resolvedTheme = mounted ? (themeMode === 'system' ? systemPreference : themeMode) : 'light';
  const isDark = resolvedTheme === 'dark';

  useEffect(() => {
    if (!mounted) return;
    const root = document.documentElement;
    root.setAttribute('data-theme', resolvedTheme);
    if (isDark) root.classList.add('dark');
    else root.classList.remove('dark');
  }, [resolvedTheme, isDark, mounted]);

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
    localStorage.setItem(STORAGE_KEY, mode);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeMode(isDark ? 'light' : 'dark');
  }, [isDark, setThemeMode]);

  const colors = useMemo(() => getThemeColors(isDark), [isDark]);

  return { resolvedTheme, themeMode, setThemeMode, toggleTheme, isDark, colors };
}
