import { describe, expect, test } from 'bun:test';

import type { SafeStorage } from '@/lib/storage';

import { createGamePrefsStore } from './preferences';

/**
 * LES RÉGLAGES DU JEU SUR L’APPAREIL (#9481) — « Jeu masqué » et « célébrations
 * de Mee et Meo ». Des commodités PAR APPAREIL : elles ne portent aucune donnée
 * de jeu, rien qui doive survivre à un changement d’appareil ni être lu par un
 * autre. Tout se lit et s’écrit sous `try/catch` ; une valeur illisible vaut le
 * défaut (jeu visible, célébrations permises).
 */
const store = (initial: Record<string, string> = {}): SafeStorage & { readonly data: Record<string, string> } => {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
    removeItem: (key) => {
      delete data[key];
    },
  };
};

describe('les défauts', () => {
  test('le jeu est visible, les célébrations sont permises', () => {
    expect(createGamePrefsStore({ storage: store() }).get()).toEqual({ hidden: false, celebrations: true });
  });

  test('une valeur corrompue vaut le défaut', () => {
    expect(createGamePrefsStore({ storage: store({ 'meeshy.game.prefs': '{pas du json' }) }).get()).toEqual({ hidden: false, celebrations: true });
    expect(createGamePrefsStore({ storage: store({ 'meeshy.game.prefs': '{"hidden":"oui"}' }) }).get()).toEqual({ hidden: false, celebrations: true });
  });
});

describe('poser un réglage', () => {
  test('se relit au prochain démarrage', () => {
    const storage = store();
    createGamePrefsStore({ storage }).set({ hidden: true });
    expect(createGamePrefsStore({ storage }).get()).toEqual({ hidden: true, celebrations: true });
  });

  test('ne touche pas à l’autre réglage', () => {
    const prefs = createGamePrefsStore({ storage: store() });
    prefs.set({ celebrations: false });
    prefs.set({ hidden: true });
    expect(prefs.get()).toEqual({ hidden: true, celebrations: false });
  });

  test('les abonnés sont prévenus, et se désabonnent', () => {
    const prefs = createGamePrefsStore({ storage: store() });
    const seen: boolean[] = [];
    const off = prefs.subscribe(() => seen.push(prefs.get().hidden));
    prefs.set({ hidden: true });
    off();
    prefs.set({ hidden: false });
    expect(seen).toEqual([true]);
  });

  test('un poser identique ne réveille personne', () => {
    const prefs = createGamePrefsStore({ storage: store() });
    let calls = 0;
    prefs.subscribe(() => (calls += 1));
    prefs.set({ hidden: false });
    expect(calls).toBe(0);
  });

  test('un stockage qui refuse : la valeur reste valable pour la séance, rien ne casse', () => {
    const refusing: SafeStorage = {
      getItem: () => {
        throw new Error('refusé');
      },
      setItem: () => {
        throw new Error('refusé');
      },
      removeItem: () => {
        throw new Error('refusé');
      },
    };
    const prefs = createGamePrefsStore({ storage: refusing });
    expect(() => prefs.set({ hidden: true })).not.toThrow();
    expect(prefs.get().hidden).toBe(true);
  });
});
