import { usePerformanceProfile } from '../usePerformanceProfile';

export interface AnimationConfig {
  staggerDelay: number;
  duration: number;
  enableBlur: boolean;
  enableShimmer: boolean;
  enableRotation: boolean;
  blurAmount: number;
  spring: {
    type: 'spring' | 'tween';
    stiffness?: number;
    damping?: number;
    duration?: number;
  };
}

export const useAnimationConfig = (): AnimationConfig => {
  const profile = usePerformanceProfile();

  if (profile === 'high') {
    return {
      staggerDelay: 0.05,
      duration: 0.4,
      enableBlur: true,
      enableShimmer: true,
      enableRotation: true,
      blurAmount: 20,
      spring: {
        type: 'spring',
        stiffness: 400,
        damping: 25,
      },
    };
  }

  if (profile === 'medium') {
    return {
      staggerDelay: 0.08,
      duration: 0.3,
      enableBlur: true,
      enableShimmer: false,
      enableRotation: false,
      blurAmount: 16,
      spring: {
        type: 'tween',
        duration: 0.3,
      },
    };
  }

  // low profile
  return {
    staggerDelay: 0,
    duration: 0.2,
    enableBlur: true,
    enableShimmer: false,
    enableRotation: false,
    blurAmount: 8,
    spring: {
      type: 'tween',
      duration: 0.2,
    },
  };
};
