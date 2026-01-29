import React from 'react';
import { motion } from 'framer-motion';
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
    <motion.div
      className={containerClasses}
      data-theme={theme}
      data-performance={effectiveProfile}
      data-testid="glass-container"
      initial={{ opacity: 0, scale: 0.95, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={config.spring}
    >
      <div className={styles.content}>{children}</div>
    </motion.div>
  );
};
