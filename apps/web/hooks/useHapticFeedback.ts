/**
 * Hook pour gérer le feedback haptique sur mobile
 * Utilise l'API Vibration du navigateur
 */

export type HapticPattern = 'light' | 'medium' | 'heavy' | 'success' | 'error' | 'warning';

interface HapticPatterns {
  [key: string]: number | number[];
}

const patterns: HapticPatterns = {
  light: 10,
  medium: 20,
  heavy: 40,
  success: [10, 50, 10],
  error: [20, 100, 20, 100, 20],
  warning: [30, 50, 30],
};

export const useHapticFeedback = () => {
  const vibrate = (pattern: HapticPattern) => {
    // Vérifier si l'API Vibration est disponible
    if (!navigator.vibrate) {
      return;
    }

    const vibrationPattern = patterns[pattern];

    try {
      navigator.vibrate(vibrationPattern);
    } catch (error) {
      console.warn('Haptic feedback not supported:', error);
    }
  };

  const vibrateCustom = (duration: number | number[]) => {
    if (!navigator.vibrate) {
      return;
    }

    try {
      navigator.vibrate(duration);
    } catch (error) {
      console.warn('Haptic feedback not supported:', error);
    }
  };

  const cancel = () => {
    if (!navigator.vibrate) {
      return;
    }

    try {
      navigator.vibrate(0);
    } catch (error) {
      console.warn('Haptic feedback not supported:', error);
    }
  };

  return {
    vibrate,
    vibrateCustom,
    cancel,
  };
};
