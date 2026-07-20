'use client';

import { useEffect, useState } from 'react';
import { useTheme } from '@/stores/app-store';

export type ResolvedTheme = 'light' | 'dark';

const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)';

const getSystemTheme = (): ResolvedTheme => {
  /* istanbul ignore next -- SSR guard: window is always defined in jsdom */
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia(DARK_SCHEME_QUERY).matches ? 'dark' : 'light';
};

/**
 * Résout le thème effectif ('light' | 'dark') depuis le store applicatif.
 * Source unique pour le theming programmatique (charts, syntax highlighting,
 * mermaid, sonner) — le styling Tailwind passe par la classe `dark` sur <html>.
 */
export function useResolvedTheme(): ResolvedTheme {
  const theme = useTheme();
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getSystemTheme);

  useEffect(() => {
    if (theme !== 'auto' || typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia(DARK_SCHEME_QUERY);
    setSystemTheme(mediaQuery.matches ? 'dark' : 'light');

    const handleChange = (event: { matches: boolean }) => {
      setSystemTheme(event.matches ? 'dark' : 'light');
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  return theme === 'auto' ? systemTheme : theme;
}
