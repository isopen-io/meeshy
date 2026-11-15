import { useSyncExternalStore } from 'react';

import { safeLocalStorage, type SafeStorage } from '@/lib/storage';

/**
 * LES RÉGLAGES DU JEU SUR L'APPAREIL (#9481) — deux commodités, par appareil :
 *
 *  - `hidden` — « Jeu masqué » : le jeu disparaît des écrans de cet appareil
 *    (Progression, profil). Le geste du réglage fait AUSSI ce que le contrat
 *    permet côté serveur (visibilités fermées, ligue publique quittée —
 *    `routes/progression-reglages.tsx`) ; ce drapeau-ci n'en est que la moitié
 *    locale, jamais une garantie de confidentialité à lui seul ;
 *  - `celebrations` — les cartes de Mee et Meo et les propositions de photo.
 *
 * Aucune donnée de jeu ne vit ici (§ stockage navigateur : « une commodité par
 * appareil »). Tout se lit et s'écrit sous `try/catch` ; une valeur illisible
 * vaut le défaut — le jeu visible, les célébrations permises. Un stockage qui
 * refuse laisse le réglage valable pour la séance.
 */
export type GameDevicePrefs = { readonly hidden: boolean; readonly celebrations: boolean };

const STORAGE_KEY = 'meeshy.game.prefs';
const DEFAULTS: GameDevicePrefs = { hidden: false, celebrations: true };

function read(storage: SafeStorage): GameDevicePrefs {
  try {
    const raw: unknown = JSON.parse(storage.getItem(STORAGE_KEY) ?? 'null');
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return DEFAULTS;
    const record = raw as Readonly<Record<string, unknown>>;
    return {
      hidden: typeof record['hidden'] === 'boolean' ? record['hidden'] : DEFAULTS.hidden,
      celebrations: typeof record['celebrations'] === 'boolean' ? record['celebrations'] : DEFAULTS.celebrations,
    };
  } catch {
    return DEFAULTS;
  }
}

export type GamePrefsStore = {
  get(): GameDevicePrefs;
  set(patch: Partial<GameDevicePrefs>): void;
  subscribe(listener: () => void): () => void;
};

export function createGamePrefsStore(options: { readonly storage?: SafeStorage } = {}): GamePrefsStore {
  const storage = options.storage ?? safeLocalStorage();
  let current = read(storage);
  const listeners = new Set<() => void>();

  return {
    get: () => current,
    set: (patch) => {
      const next: GameDevicePrefs = { ...current, ...patch };
      if (next.hidden === current.hidden && next.celebrations === current.celebrations) return;
      current = next;
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* Stockage refusé : le réglage tient pour la séance. */
      }
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

/** L'UNIQUE instance que l'application partage. */
export const gamePrefs = createGamePrefsStore();

export function useGamePrefs(): GameDevicePrefs {
  return useSyncExternalStore(gamePrefs.subscribe, gamePrefs.get, gamePrefs.get);
}
