import React from 'react';
import { useTypingGlow } from '@/hooks/composer/useTypingGlow';
import styles from './DynamicGlow.module.css';

interface DynamicGlowProps {
  currentLength: number;
  maxLength: number;
  isTyping: boolean;
  className?: string;
}

export const DynamicGlow: React.FC<DynamicGlowProps> = ({
  currentLength,
  maxLength,
  isTyping,
  className = '',
}) => {
  const { glowColor, glowIntensity, shouldGlow, isNearLimit } = useTypingGlow({
    currentLength,
    maxLength,
    isTyping,
  });

  const containerClasses = [
    styles.glowContainer,
    shouldGlow && styles.active,
    isNearLimit && styles.warning,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const style = {
    '--glow-color': glowColor,
    '--glow-intensity': glowIntensity,
  } as React.CSSProperties;

  return <div className={containerClasses} style={style} />;
};
