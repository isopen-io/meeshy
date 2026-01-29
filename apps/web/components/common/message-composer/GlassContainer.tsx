import React from 'react';
import { useAnimationConfig } from '@/hooks/composer/useAnimationConfig';
import styles from './GlassContainer.module.css';

interface GlassContainerProps {
  children: React.ReactNode;
  className?: string;
  enableShimmer?: boolean;
  blurAmount?: number;
}

export const GlassContainer: React.FC<GlassContainerProps> = ({
  children,
  className = '',
  enableShimmer = false,
  blurAmount = 20,
}) => {
  const config = useAnimationConfig();

  const containerClasses = [
    styles.glassContainer,
    !config.enableBlur && styles.blurDisabled,
    enableShimmer && config.enableShimmer && styles.shimmer,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const style = config.enableBlur
    ? { '--glass-blur': `${blurAmount}px` } as React.CSSProperties
    : undefined;

  return (
    <div className={containerClasses} style={style}>
      <div className={styles.content}>{children}</div>
    </div>
  );
};
