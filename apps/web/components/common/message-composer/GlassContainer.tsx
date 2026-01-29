import React from 'react';
import { useAnimationConfig } from '@/hooks/composer/useAnimationConfig';
import styles from './GlassContainer.module.css';

interface GlassContainerProps {
  children: React.ReactNode;
  className?: string;
  theme?: 'light' | 'dark';
  performanceProfile?: 'high' | 'medium' | 'low';
}

export const GlassContainer: React.FC<GlassContainerProps> = ({
  children,
  className = '',
  theme = 'light',
  performanceProfile,
}) => {
  const config = useAnimationConfig();

  // Utiliser performanceProfile prop ou fallback sur config
  const effectiveProfile = performanceProfile ||
    (config.enableBlur ? (config.enableShimmer ? 'high' : 'medium') : 'low');

  const containerClasses = [
    styles.glassContainer,
    config.enableShimmer && styles.shimmer,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={containerClasses}
      data-theme={theme}
      data-performance={effectiveProfile}
      data-testid="glass-container"
    >
      <div className={styles.content}>{children}</div>
    </div>
  );
};
