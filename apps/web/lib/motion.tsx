/**
 * Lazy loading optimisé pour Framer Motion
 * Charge les animations uniquement quand nécessaire
 */

import { lazy } from 'react';

// Lazy load des composants Framer Motion
export const LazyMotion = lazy(() => 
  import('framer-motion').then(module => ({ default: module.LazyMotion }))
);

export const LazyMotionDiv = lazy(() =>
  import('framer-motion').then(module => ({ default: module.motion.div }))
);

export const LazyAnimatePresence = lazy(() =>
  import('framer-motion').then(module => ({ default: module.AnimatePresence }))
);

// Presets d'animations optimisés (sans import complet)
export const animationPresets = {
  // Animations de base (CSS uniquement)
  fadeIn: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.2 }
  },
  
  slideUp: {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 },
    transition: { duration: 0.3 }
  },
  
  slideDown: {
    initial: { opacity: 0, y: -20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 20 },
    transition: { duration: 0.3 }
  },
  
  scale: {
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.95 },
    transition: { duration: 0.2 }
  },
  
  // Animation de message (la plus utilisée)
  messageAppear: {
    initial: { opacity: 0, y: 10, scale: 0.98 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: -10, scale: 0.98 },
    transition: { 
      duration: 0.3,
      ease: [0.4, 0.0, 0.2, 1] // ease-out cubic-bezier
    }
  }
};

// Hook pour détecter si les animations sont supportées/désirées
export function useReducedMotion() {
  if (typeof window === 'undefined') return false;
  
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Composant wrapper optimisé pour les animations conditionnelles
interface AnimatedWrapperProps {
  children: React.ReactNode;
  animation?: keyof typeof animationPresets;
  condition?: boolean;
  className?: string;
}

export function AnimatedWrapper({ 
  children, 
  animation = 'fadeIn', 
  condition = true,
  className 
}: AnimatedWrapperProps) {
  const shouldAnimate = condition && !useReducedMotion();
  
  if (!shouldAnimate) {
    return <div className={className}>{children}</div>;
  }
  
  // Utiliser CSS animations au lieu de Framer Motion pour les cas simples
  const preset = animationPresets[animation];
  
  return (
    <div 
      className={`animate-in ${className}`}
      style={{
        '--animate-duration': `${preset.transition.duration}s`,
      } as React.CSSProperties}
    >
      {children}
    </div>
  );
}

// Feature flags pour activer/désactiver les animations lourdes
export const motionFeatures = {
  // Animations de base (toujours actives)
  basic: true,
  
  // Animations avancées (lazy loaded)
  advanced: false,
  
  // Animations de layout (très lourdes)
  layout: false,
  
  // Gestures (pan, drag, etc.)
  gestures: false,
};

// Fonction pour activer les features avancées à la demande
export async function enableAdvancedMotion() {
  if (motionFeatures.advanced) return;
  
  // Preload Framer Motion
  const { motion, AnimatePresence } = await import('framer-motion');
  motionFeatures.advanced = true;
  
  return { motion, AnimatePresence };
}

// Composant de fallback pour les animations lourdes
export function MotionFallback({ children }: { children: React.ReactNode }) {
  return <div className="motion-fallback">{children}</div>;
}
