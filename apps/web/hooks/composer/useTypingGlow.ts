import { useState, useEffect, useRef } from 'react';

interface TypingGlowState {
  isTyping: boolean;
  glowIntensity: number;
  lastTypedTimestamp: number;
  glowColor: string;
}

interface UseTypingGlowOptions {
  cooldownMs?: number;
  intensityDecayRate?: number;
}

const getGlowColor = (intensity: number): string => {
  if (intensity <= 33) {
    return `rgb(59, 130, 246)`;
  } else if (intensity <= 66) {
    const t = (intensity - 33) / 33;
    const r = Math.round(59 + (147 - 59) * t);
    const g = Math.round(130 + (51 - 130) * t);
    const b = Math.round(246 + (234 - 246) * t);
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    const t = (intensity - 66) / 34;
    const r = Math.round(147 + (236 - 147) * t);
    const g = Math.round(51 + (72 - 51) * t);
    const b = Math.round(234 + (153 - 234) * t);
    return `rgb(${r}, ${g}, ${b})`;
  }
};

export const useTypingGlow = (
  text: string,
  options?: UseTypingGlowOptions
): TypingGlowState => {
  const cooldownMs = options?.cooldownMs ?? 2000;
  const intensityDecayRate = options?.intensityDecayRate ?? 5;

  const [isTyping, setIsTyping] = useState(false);
  const [glowIntensity, setGlowIntensity] = useState(0);
  const [lastTypedTimestamp, setLastTypedTimestamp] = useState(0);
  const prevTextRef = useRef('');
  const cooldownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const decayTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (text !== prevTextRef.current) {
      prevTextRef.current = text;
      const now = Date.now();

      setIsTyping(true);
      setLastTypedTimestamp(now);
      setGlowIntensity((prev) => Math.min(100, prev + 10));

      if (cooldownTimerRef.current) {
        clearTimeout(cooldownTimerRef.current);
      }

      cooldownTimerRef.current = setTimeout(() => {
        setIsTyping(false);

        decayTimerRef.current = setInterval(() => {
          setGlowIntensity((prev) => {
            const newIntensity = Math.max(0, prev - intensityDecayRate);
            if (newIntensity === 0 && decayTimerRef.current) {
              clearInterval(decayTimerRef.current);
            }
            return newIntensity;
          });
        }, 100);
      }, cooldownMs);
    }

    return () => {
      if (cooldownTimerRef.current) {
        clearTimeout(cooldownTimerRef.current);
      }
      if (decayTimerRef.current) {
        clearInterval(decayTimerRef.current);
      }
    };
  }, [text, cooldownMs, intensityDecayRate]);

  const glowColor = getGlowColor(glowIntensity);

  return {
    isTyping,
    glowIntensity,
    lastTypedTimestamp,
    glowColor,
  };
};
