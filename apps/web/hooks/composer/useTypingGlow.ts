interface UseTypingGlowProps {
  currentLength: number;
  maxLength: number;
  isTyping: boolean;
}

interface UseTypingGlowReturn {
  glowColor: string;
  glowIntensity: number;
  shouldGlow: boolean;
  isNearLimit: boolean;
}

export const useTypingGlow = ({
  currentLength,
  maxLength,
  isTyping,
}: UseTypingGlowProps): UseTypingGlowReturn => {
  const percentage = (currentLength / maxLength) * 100;

  const getGlowColor = (): string => {
    if (percentage < 50) {
      return 'rgba(59, 130, 246, 0.4)'; // Blue
    }
    if (percentage < 90) {
      return 'rgba(139, 92, 246, 0.4)'; // Violet
    }
    if (percentage < 100) {
      return 'rgba(236, 72, 153, 0.4)'; // Pink
    }
    return 'rgba(239, 68, 68, 0.5)'; // Red
  };

  const getGlowIntensity = (): number => {
    return Math.min(percentage / 100, 1);
  };

  return {
    glowColor: getGlowColor(),
    glowIntensity: getGlowIntensity(),
    shouldGlow: isTyping && currentLength > 0,
    isNearLimit: percentage >= 90,
  };
};
