'use client';

import { useEffect } from 'react';
import { useTheme, useAppActions } from '@/stores';
import { useFixRadixZIndex } from '@/hooks/use-fix-z-index';
import { logger } from '@/utils/logger';

/**
 * ThemeProvider - Applique le thème immédiatement au chargement
 * Utilise le store Zustand pour gérer le thème de manière centralisée
 * Applique aussi les fixes de z-index globalement
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  const { setTheme } = useAppActions();
  
  // Appliquer le fix de z-index globalement
  useFixRadixZIndex();

  // Appliquer le thème au montage et à chaque changement
  useEffect(() => {
    const applyTheme = () => {
      if (typeof window === 'undefined') return;

      const root = document.documentElement;
      root.classList.remove('light', 'dark');

      if (theme === 'auto') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        root.classList.add(prefersDark ? 'dark' : 'light');
      } else {
        root.classList.add(theme);
      }
    };

    // Appliquer immédiatement
    applyTheme();

    // Écouter les changements de préférence système si mode auto
    if (theme === 'auto') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => {
        logger.debug('[ThemeProvider]', 'Préférence système changée');
        applyTheme();
      };

      // Moderne: addEventListenerméthode
      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
      } else {
        // Fallback pour anciens navigateurs
        mediaQuery.addListener(handleChange);
        return () => mediaQuery.removeListener(handleChange);
      }
    }
  }, [theme]);

  return <>{children}</>;
}

