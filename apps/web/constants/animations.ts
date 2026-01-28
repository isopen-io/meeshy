import { PerformanceProfile } from '@/hooks/usePerformanceProfile';

export interface AnimationConfig {
  blur: string;
  sendButtonDuration: number;
  enableRotation: boolean;
  enableGradient: boolean;
  enableShimmer: boolean;
  staggerDelay: number;
  dropdownAnimation: 'radial' | 'scale' | 'fade';
}

export const getAnimationConfig = (profile: PerformanceProfile): AnimationConfig => {
  switch (profile) {
    case 'high':
      return {
        blur: 'blur(20px)',
        sendButtonDuration: 400,
        enableRotation: true,
        enableGradient: true,
        enableShimmer: true,
        staggerDelay: 30,
        dropdownAnimation: 'radial',
      };

    case 'medium':
      return {
        blur: 'blur(16px)',
        sendButtonDuration: 300,
        enableRotation: false,
        enableGradient: true,
        enableShimmer: false,
        staggerDelay: 50,
        dropdownAnimation: 'scale',
      };

    case 'low':
      return {
        blur: 'blur(8px)',
        sendButtonDuration: 200,
        enableRotation: false,
        enableGradient: false,
        enableShimmer: false,
        staggerDelay: 0,
        dropdownAnimation: 'fade',
      };
  }
};
