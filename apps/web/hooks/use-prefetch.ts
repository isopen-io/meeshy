/**
 * usePrefetch - Hook pour précharger les composants et données au hover
 *
 * Optimisation: Précharge les modales et données avant que l'utilisateur ne clique,
 * améliore la perception de rapidité de l'application.
 *
 * Pattern: "Prefetch on hover, load on click"
 * - Au hover: Commencer à charger le code/data
 * - Au click: Tout est déjà chargé = instant
 *
 * @see Vercel Best Practice: bundle-preload
 */

'use client';

import { useCallback, useRef } from 'react';

/**
 * Options de configuration pour le prefetch
 */
interface PrefetchOptions {
  /** Délai avant de commencer le prefetch (ms) - évite les hovers accidentels */
  delay?: number;
  /** Précharger les données en plus du code */
  prefetchData?: boolean;
  /** URL de l'API à précharger */
  dataUrl?: string;
}

/**
 * Hook pour précharger un composant dynamique au hover
 *
 * @example
 * ```tsx
 * const { onMouseEnter, onMouseLeave } = usePrefetch({
 *   loader: () => import('./HeavyModal'),
 *   delay: 100
 * });
 *
 * <button onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
 *   Ouvrir Modal
 * </button>
 * ```
 */
export function usePrefetch(
  loader: () => Promise<any>,
  options: PrefetchOptions = {}
) {
  const { delay = 100, prefetchData = false, dataUrl } = options;
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const loadedRef = useRef(false);
  const dataLoadedRef = useRef(false);

  const prefetchComponent = useCallback(() => {
    if (loadedRef.current) return;

    // Précharger le composant
    loader()
      .then(() => {
        loadedRef.current = true;
        console.log('[Prefetch] Component loaded successfully');
      })
      .catch(err => {
        console.error('[Prefetch] Failed to load component:', err);
      });
  }, [loader]);

  const prefetchDataFn = useCallback(() => {
    if (!prefetchData || !dataUrl || dataLoadedRef.current) return;

    // Précharger les données via fetch avec cache
    fetch(dataUrl, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    })
      .then(res => {
        if (res.ok) {
          dataLoadedRef.current = true;
          console.log('[Prefetch] Data loaded successfully:', dataUrl);
        }
      })
      .catch(err => {
        console.error('[Prefetch] Failed to load data:', err);
      });
  }, [prefetchData, dataUrl]);

  const onMouseEnter = useCallback(() => {
    // Annuler tout timeout précédent
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Démarrer le prefetch après le délai
    timeoutRef.current = setTimeout(() => {
      prefetchComponent();
      prefetchDataFn();
    }, delay);
  }, [delay, prefetchComponent, prefetchDataFn]);

  const onMouseLeave = useCallback(() => {
    // Annuler le prefetch si l'utilisateur quitte avant le délai
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const onFocus = useCallback(() => {
    // Au focus clavier, précharger immédiatement (accessibilité)
    prefetchComponent();
    prefetchDataFn();
  }, [prefetchComponent, prefetchDataFn]);

  return {
    onMouseEnter,
    onMouseLeave,
    onFocus,
  };
}

/**
 * Hook pour précharger une route Next.js au hover d'un lien
 *
 * @example
 * ```tsx
 * const prefetchProps = usePrefetchRoute('/dashboard', {
 *   delay: 150
 * });
 *
 * <Link href="/dashboard" {...prefetchProps}>
 *   Dashboard
 * </Link>
 * ```
 */
export function usePrefetchRoute(href: string, options: PrefetchOptions = {}) {
  const { delay = 150 } = options;
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const onMouseEnter = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      // Next.js Link utilise déjà le prefetch, on force juste un peu plus tôt
      const link = document.querySelector<HTMLAnchorElement>(`a[href="${href}"]`);
      if (link) {
        // Trigger le prefetch natif de Next.js
        link.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      }
    }, delay);
  }, [href, delay]);

  const onMouseLeave = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  return {
    onMouseEnter,
    onMouseLeave,
  };
}

/**
 * Hook pour précharger des images au hover
 *
 * Utile pour les avatars, previews, etc.
 *
 * @example
 * ```tsx
 * const prefetchProps = usePrefetchImage([
 *   '/avatars/large-1.jpg',
 *   '/avatars/large-2.jpg'
 * ]);
 *
 * <div {...prefetchProps}>
 *   <img src="/avatars/small-1.jpg" />
 * </div>
 * ```
 */
export function usePrefetchImage(imageUrls: string[], delay = 100) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const loadedRef = useRef(new Set<string>());

  const prefetchImages = useCallback(() => {
    imageUrls.forEach(url => {
      if (loadedRef.current.has(url)) return;

      const img = new Image();
      img.src = url;
      img.onload = () => {
        loadedRef.current.add(url);
        console.log('[Prefetch] Image loaded:', url);
      };
    });
  }, [imageUrls]);

  const onMouseEnter = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(prefetchImages, delay);
  }, [delay, prefetchImages]);

  const onMouseLeave = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  return {
    onMouseEnter,
    onMouseLeave,
  };
}
