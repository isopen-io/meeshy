import { useSyncExternalStore } from 'react';

import type { ElementDetail } from './game-detail';

/**
 * LA MODALE OUVERTE (#9563, amendement n° 2) — UNE par page : un badge au fond
 * d'une liste, une pastille d'un héros, le blason de l'en-tête ouvrent tous la
 * même modale, sans se passer de fonction de main en main. Le bouton touché y
 * dépose ses précisions ; l'hôte de la page (`GameDetailHost`) les rend.
 *
 * `opener` est l'élément touché : la modale lui RENDRA le focus en se fermant.
 */
export type OpenDetail = { readonly detail: ElementDetail; readonly opener: HTMLElement | null };

type Listener = () => void;

function createDetailStore() {
  let current: OpenDetail | null = null;
  const listeners = new Set<Listener>();
  const emit = (): void => {
    for (const listener of listeners) listener();
  };
  return {
    get: (): OpenDetail | null => current,
    open: (detail: ElementDetail, opener: HTMLElement | null = null): void => {
      current = { detail, opener };
      emit();
    },
    close: (): void => {
      if (current === null) return;
      current = null;
      emit();
    },
    subscribe: (listener: Listener): (() => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

/** L'UNIQUE instance que l'application partage. */
export const detailStore = createDetailStore();

export function useOpenDetail(): OpenDetail | null {
  return useSyncExternalStore(detailStore.subscribe, detailStore.get, detailStore.get);
}
