import { useSyncExternalStore } from 'react';

/**
 * UN ÉCRAN COURT — moins de 700 px de haut (iPhone SE : 667). Lu par
 * `matchMedia` plutôt que par une classe à variante de média : la règle CSS
 * entrerait dans la feuille de la PREMIÈRE PEINTURE (`budgets.json` ›
 * `first_paint.kb`), quand seule la connexion la lit. `false` hors navigateur
 * et sans `matchMedia`.
 */
const SHORT_VIEWPORT = '(max-height: 700px)';

const query = (): MediaQueryList | null =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(SHORT_VIEWPORT) : null;

const subscribe = (notify: () => void): (() => void) => {
  const list = query();
  list?.addEventListener('change', notify);
  return () => list?.removeEventListener('change', notify);
};

const snapshot = (): boolean => query()?.matches ?? false;

export function useShortViewport(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
