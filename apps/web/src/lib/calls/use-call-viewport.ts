import { useSyncExternalStore } from 'react';

import { callViewport } from './call-self-tile';
import type { TileSize } from './call-self-tile';

/**
 * **L'ÉCRAN DE L'APPEL, SUIVI** (#17429) — ma vignette et les rails du duo se
 * mesurent sur lui : tourner le téléphone ou redimensionner la fenêtre les
 * replace ensemble, jamais l'un sans l'autre. Hors navigateur, l'écran de la
 * planche ({@link callViewport}).
 */

let last: TileSize = callViewport();

const snapshot = (): TileSize => {
  const next = callViewport();
  if (next.width !== last.width || next.height !== last.height) last = next;
  return last;
};

const subscribe = (notify: () => void): (() => void) => {
  window.addEventListener('resize', notify);
  return () => window.removeEventListener('resize', notify);
};

const SERVER: TileSize = { width: 390, height: 844 };

export function useCallViewport(): TileSize {
  return useSyncExternalStore(subscribe, snapshot, () => SERVER);
}
