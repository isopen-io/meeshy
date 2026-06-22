'use client';

import { MotionConfig } from 'framer-motion';

/**
 * MotionProvider — fait respecter `prefers-reduced-motion` à TOUTES les animations
 * Framer Motion de l'application, en un seul point.
 *
 * Le bloc `@media (prefers-reduced-motion: reduce)` de `globals.css` neutralise déjà les
 * animations/transitions CSS, mais Framer Motion pilote ses animations en JavaScript
 * (Web Animations API / styles inline) — elles échappent donc entièrement à ce bloc CSS.
 *
 * `reducedMotion="user"` lit la même media query système : lorsque l'utilisateur a activé
 * la réduction des animations, Framer Motion désactive automatiquement les animations de
 * transform/layout (x, y, scale, rotate) tout en conservant les fondus d'opacité — sûrs
 * pour les troubles vestibulaires (WCAG 2.3.3 — Animation from Interactions). Aucune
 * modification par composant n'est nécessaire : le contexte couvre tous les `motion.*`.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
