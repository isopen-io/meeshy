import { useState, useEffect } from 'react';

/**
 * Extended Navigator interface with memory and connection APIs.
 * These APIs are not part of the standard Navigator interface but are
 * available in modern browsers.
 */
interface NavigatorWithMemory extends Navigator {
  /** Device memory in GB (Chrome/Edge) */
  deviceMemory?: number;
  /** Network information API */
  connection?: {
    effectiveType?: '4g' | '3g' | '2g' | 'slow-2g';
  };
}

export type PerformanceProfile = 'high' | 'medium' | 'low';

// Performance thresholds
const PERFORMANCE_THRESHOLDS = {
  /** Minimum cores for high-end devices */
  HIGH_END_CORES: 4,
  /** Minimum memory (GB) for high-end devices */
  HIGH_END_MEMORY: 4,
  /** Minimum cores for mid-range devices */
  MID_RANGE_CORES: 2,
  /** Minimum memory (GB) for mid-range devices */
  MID_RANGE_MEMORY: 2,
  /** Frame duration (ms) threshold for smooth performance (60fps = 16ms) */
  SMOOTH_FRAME_MS: 16,
  /** Frame duration (ms) threshold for acceptable performance (30fps = 32ms) */
  ACCEPTABLE_FRAME_MS: 32,
  /** Default cores if API unavailable */
  DEFAULT_CORES: 4,
  /** Default memory (GB) if API unavailable */
  DEFAULT_MEMORY: 4,
} as const;

/**
 * Hook to detect device performance profile based on hardware capabilities
 * and runtime performance tests.
 *
 * Detection strategy:
 * 1. Analyzes hardware specs (CPU cores, RAM)
 * 2. Checks network connection quality
 * 3. Performs runtime frame timing test
 * 4. Combines all metrics to determine final profile
 *
 * @returns {'high' | 'medium' | 'low'} - Device performance profile
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const profile = usePerformanceProfile();
 *   return <div>{profile === 'low' ? 'Simplified UI' : 'Full UI'}</div>;
 * }
 * ```
 */
export const usePerformanceProfile = (): PerformanceProfile => {
  const [profile, setProfile] = useState<PerformanceProfile>('high');

  useEffect(() => {
    const detectProfile = () => {
      // Safely access extended navigator APIs
      const nav = navigator as NavigatorWithMemory;

      const cores = nav.hardwareConcurrency || PERFORMANCE_THRESHOLDS.DEFAULT_CORES;
      const memory = nav.deviceMemory || PERFORMANCE_THRESHOLDS.DEFAULT_MEMORY;
      const connection = nav.connection;
      const isSlowConnection =
        connection?.effectiveType === '2g' ||
        connection?.effectiveType === 'slow-2g';

      // Hardware score: 0 = low, 1 = medium, 2 = high
      let hardwareScore =
        cores >= PERFORMANCE_THRESHOLDS.HIGH_END_CORES &&
        memory >= PERFORMANCE_THRESHOLDS.HIGH_END_MEMORY
          ? 2
          : cores >= PERFORMANCE_THRESHOLDS.MID_RANGE_CORES &&
            memory >= PERFORMANCE_THRESHOLDS.MID_RANGE_MEMORY
            ? 1
            : 0;

      // Slow connection forces low profile regardless of hardware
      if (isSlowConnection) {
        hardwareScore = 0;
      }

      // Runtime performance test
      const startTime = performance.now();
      requestAnimationFrame(() => {
        const frameDuration = performance.now() - startTime;

        // Runtime score based on frame timing
        const runtimeScore =
          frameDuration > PERFORMANCE_THRESHOLDS.ACCEPTABLE_FRAME_MS
            ? 0
            : frameDuration > PERFORMANCE_THRESHOLDS.SMOOTH_FRAME_MS
              ? 1
              : 2;

        // Final profile is the minimum of hardware and runtime scores
        // This prevents overestimating performance
        const finalScore = Math.min(hardwareScore, runtimeScore);

        const detectedProfile: PerformanceProfile =
          finalScore === 0
            ? 'low'
            : finalScore === 1
              ? 'medium'
              : 'high';

        setProfile(detectedProfile);
      });
    };

    detectProfile();
  }, []);

  return profile;
};
