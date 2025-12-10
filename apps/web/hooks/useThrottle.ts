/**
 * Hook personnalisé pour throttler les valeurs
 * Utile pour limiter les re-rendus lors de la saisie
 */

import { useEffect, useState, useRef } from 'react';

export function useThrottle<T>(value: T, delay: number = 16): T {
  const [throttledValue, setThrottledValue] = useState<T>(value);
  const lastRan = useRef(Date.now());

  useEffect(() => {
    const handler = setTimeout(() => {
      if (Date.now() - lastRan.current >= delay) {
        setThrottledValue(value);
        lastRan.current = Date.now();
      }
    }, delay - (Date.now() - lastRan.current));

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return throttledValue;
}

/**
 * Hook pour throttler les callbacks
 * Limite la fréquence d'exécution d'une fonction
 */
export function useThrottledCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number = 16
): T {
  const lastRan = useRef(Date.now());
  const timeoutRef = useRef<NodeJS.Timeout>();

  return ((...args: Parameters<T>) => {
    const timeSinceLastRun = Date.now() - lastRan.current;

    if (timeSinceLastRun >= delay) {
      callback(...args);
      lastRan.current = Date.now();
    } else {
      // Planifier l'exécution pour plus tard
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      timeoutRef.current = setTimeout(() => {
        callback(...args);
        lastRan.current = Date.now();
      }, delay - timeSinceLastRun);
    }
  }) as T;
}

