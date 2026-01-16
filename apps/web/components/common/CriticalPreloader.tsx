'use client';

import { useEffect } from 'react';
import { preloadCriticalComponents } from '@/lib/lazy-components';

/**
 * Client Component that preloads critical components after initial render
 * This runs on the client side where window is available
 */
export function CriticalPreloader() {
  useEffect(() => {
    // Preload critical components after the initial paint
    const timeoutId = setTimeout(preloadCriticalComponents, 0);
    return () => clearTimeout(timeoutId);
  }, []);

  // This component renders nothing
  return null;
}
