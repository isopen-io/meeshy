import { describe, expect, test } from 'bun:test';

import type { SafeStorage } from '@/lib/storage';

import type { GuideSnapshot } from './events-v2';
import { forgetSnapshot, recallSnapshot, rememberSnapshot } from './memory';

/**
 * LA MÉMOIRE DU GUIDE (#9481) — l'instantané que l'appareil garde entre deux
 * ouvertures pour raconter ce qui est arrivé PENDANT l’absence (une montée de
 * ligue tombe le dimanche soir). C’est une commodité par appareil : elle ne
 * porte aucun état de jeu qui doive survivre, et tout se lit sous `try/catch`.
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

const snapshot: GuideSnapshot = {
  prestige: 1,
  league: { weekKey: '2026-11-02', current: { league: 'jade', rank: 8, pointsToPromotion: 9 } },
  season: { number: 1, themeKey: 'language:fr', steps: 14, completed: false },
  trophies: ['trophy.flame.100'],
  atlas: { total: 83, languages: ['fr', 'es'] },
};

describe('la mémoire du guide', () => {
  test('ce qui est gardé se relit à l’identique', () => {
    const storage = store();
    rememberSnapshot(storage, 'user-1', snapshot);
    expect(recallSnapshot(storage, 'user-1')).toEqual(snapshot);
  });

  test('un autre compte sur le même appareil ne lit PAS cette mémoire', () => {
    const storage = store();
    rememberSnapshot(storage, 'user-1', snapshot);
    expect(recallSnapshot(storage, 'user-2')).toBeNull();
  });

  test('une valeur corrompue se tait : null, jamais une exception', () => {
    expect(recallSnapshot(store({ 'meeshy.game.guide-memory.user-1': '{pas du json' }), 'user-1')).toBeNull();
    expect(recallSnapshot(store({ 'meeshy.game.guide-memory.user-1': '{"prestige":"x"}' }), 'user-1')).toBeNull();
    expect(recallSnapshot(store({ 'meeshy.game.guide-memory.user-1': '[]' }), 'user-1')).toBeNull();
  });

  test('un stockage qui refuse (mode privé) ne casse rien', () => {
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
    expect(() => rememberSnapshot(refusing, 'user-1', snapshot)).not.toThrow();
    expect(recallSnapshot(refusing, 'user-1')).toBeNull();
    expect(() => forgetSnapshot(refusing, 'user-1')).not.toThrow();
  });

  test('oublier efface la mémoire de ce compte seulement', () => {
    const storage = store();
    rememberSnapshot(storage, 'user-1', snapshot);
    rememberSnapshot(storage, 'user-2', snapshot);
    forgetSnapshot(storage, 'user-1');
    expect(recallSnapshot(storage, 'user-1')).toBeNull();
    expect(recallSnapshot(storage, 'user-2')).toEqual(snapshot);
  });

  test('une ligue d’un nom inconnu tombe seule : le reste se relit', () => {
    const storage = store({
      'meeshy.game.guide-memory.user-1': JSON.stringify({ ...snapshot, league: { weekKey: '2026-11-02', current: { league: 'zinc', rank: 1, pointsToPromotion: null } } }),
    });
    const read = recallSnapshot(storage, 'user-1');
    expect(read?.league).toBeUndefined();
    expect(read?.trophies).toEqual(['trophy.flame.100']);
  });
});
