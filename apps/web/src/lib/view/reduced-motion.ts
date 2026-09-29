/** `prefers-reduced-motion: reduce` — lu à l'instant de l'appel ; `false` hors
 * navigateur (rendu serveur, témoins sans `matchMedia`). */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
