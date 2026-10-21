import { useSyncExternalStore } from 'react';

import { currentScheme, type ColorScheme } from '@/lib/scheme';

/**
 * LE SCHÉMA PEINT, SUIVI (#10663) — UN seul observateur de `:root` pour tous les
 * abonnés (une ligne de liste par conversation ne monte pas N observateurs).
 * Un hôte qui résout au rendu une couleur dépendante du schéma (l'accent
 * personnel, `personalAccentPalette`) s'abonne ici : le basculement clair/sombre,
 * choisi ou automatique, le refait rendre au lieu d'attendre son prochain rendu.
 */
const listeners = new Set<() => void>();
let observer: MutationObserver | null = null;

const subscribe = (listener: () => void): (() => void) => {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return () => undefined;
  listeners.add(listener);
  if (observer === null) {
    observer = new MutationObserver(() => {
      for (const notify of listeners) notify();
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      observer?.disconnect();
      observer = null;
    }
  };
};

const snapshot = (): ColorScheme => currentScheme();
const serverSnapshot = (): ColorScheme => 'dark';

export const useColorScheme = (): ColorScheme => useSyncExternalStore(subscribe, snapshot, serverSnapshot);
