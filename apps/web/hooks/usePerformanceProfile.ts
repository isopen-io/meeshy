import { useState, useEffect } from 'react';

export type PerformanceProfile = 'high' | 'medium' | 'low';

export const usePerformanceProfile = (): PerformanceProfile => {
  const [profile, setProfile] = useState<PerformanceProfile>('high');

  useEffect(() => {
    const cores = navigator.hardwareConcurrency || 4;
    const memory = (navigator as any).deviceMemory || 4;
    const connection = (navigator as any).connection;
    const isSlowConnection = connection?.effectiveType === '2g' ||
                             connection?.effectiveType === 'slow-2g';

    if (cores <= 2 || memory <= 2 || isSlowConnection) {
      setProfile('low');
    } else if (cores <= 4 || memory <= 4) {
      setProfile('medium');
    }

    // Performance test
    const startTime = performance.now();
    requestAnimationFrame(() => {
      const frameDuration = performance.now() - startTime;
      if (frameDuration > 32) {
        setProfile('low');
      }
    });
  }, []);

  return profile;
};
