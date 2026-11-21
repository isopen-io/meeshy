import { beforeAll, describe, expect, test } from 'bun:test';

import type { ActAdvance } from '@meeshy/shared/utils/game/act-advance';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';

import { actAdvanceLabel, watchActAdvance } from './act-advance';

/**
 * L'ACTE QUI AVANCE (#17367) — armé par un envoi, le guet compare les lectures successives du bloc `game` en cache et
 * dit quel acte vient d'avancer. Aucune requête ne part pour lui.
 */
const block = (medium: number, dayKey = '2026-11-18') => ({
  game: {
    missions: {
      dayKey,
      unlocked: true,
      items: [
        { id: 'a', difficulty: 'easy', progress: 1, target: 1, completedAt: '2026-11-18T08:00:00.000Z' },
        { id: 'b', difficulty: 'medium', progress: medium, target: 5, completedAt: null },
      ],
    },
  },
});

const fakeCache = (initial: unknown) => {
  let data = initial;
  const listeners = new Set<() => void>();
  return {
    read: () => data,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    write: (next: unknown) => {
      data = next;
      listeners.forEach((listener) => listener());
    },
    listeners,
  };
};

describe('watchActAdvance', () => {
  test('un acte qui avance dans le cache est dit, une fois', () => {
    const cache = fakeCache(block(2));
    const seen: ActAdvance[] = [];
    const stop = watchActAdvance({ ...cache, hidden: () => false, onAdvance: (advance) => seen.push(advance) });
    cache.write(block(3));
    cache.write(block(3));
    expect(seen).toEqual([{ difficulty: 'medium', progress: 3, target: 5 }]);
    stop();
    expect(cache.listeners.size).toBe(0);
  });

  test('« Jeu masqué » : rien', () => {
    const cache = fakeCache(block(2));
    const seen: ActAdvance[] = [];
    watchActAdvance({ ...cache, hidden: () => true, onAdvance: (advance) => seen.push(advance) });
    cache.write(block(3));
    expect(seen).toEqual([]);
  });

  test('un cache vide, puis un premier bloc : rien — il n’y a pas d’avant', () => {
    const cache = fakeCache(undefined);
    const seen: ActAdvance[] = [];
    watchActAdvance({ ...cache, hidden: () => false, onAdvance: (advance) => seen.push(advance) });
    cache.write(block(3));
    expect(seen).toEqual([]);
  });

  test('un bloc d’ancien serveur sans actes lisibles ne lève jamais', () => {
    const cache = fakeCache(block(2));
    const seen: ActAdvance[] = [];
    watchActAdvance({ ...cache, hidden: () => false, onAdvance: (advance) => seen.push(advance) });
    cache.write({ game: { missions: { unlocked: true } } });
    cache.write({ nothing: true });
    expect(seen).toEqual([]);
  });
});

describe('actAdvanceLabel — « Acte II · 3 sur 5 », dans les sept langues', () => {
  beforeAll(async () => {
    await Promise.all((['fr', 'en', 'es', 'pt', 'it', 'de', 'ar'] as const).map((language) => loadInterfaceCatalog(language)));
  });

  const advance: ActAdvance = { difficulty: 'medium', progress: 3, target: 5 };
  const expected = [
    ['fr', 'Acte II · 3 sur 5'],
    ['en', 'Act II · 3 of 5'],
    ['es', 'Acto II · 3 de 5'],
    ['pt', 'Ato II · 3 de 5'],
    ['it', 'Atto II · 3 su 5'],
    ['de', 'Akt II · 3 von 5'],
  ] as const;
  for (const [language, label] of expected) {
    test(language, () => {
      expect(actAdvanceLabel(advance, language)).toBe(label);
    });
  }

  test('ar — les chiffres isolés dans la phrase de droite à gauche', () => {
    expect(actAdvanceLabel(advance, 'ar')).toBe('الفصل الثاني · ⁦3⁩ من ⁦5⁩');
  });

  test('l’Acte d’or a son nom', () => {
    expect(actAdvanceLabel({ difficulty: 'gold', progress: 1, target: 2 }, 'fr')).toBe('Acte d’or · 1 sur 2');
  });
});
