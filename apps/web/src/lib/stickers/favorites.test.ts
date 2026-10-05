import { describe, expect, test } from 'bun:test';

import type { SafeStorage } from '@/lib/storage';

import { STICKER_FAVORITES_KEY, isFavorite, parseFavorites, readFavorites, toggleFavorite, writeFavorites } from './favorites';
import type { StickerFavorite } from './favorites';

/**
 * LES FAVORIS DE LA FEUILLE DE STICKERS (#9070) — la jumelle de
 * `StickerUsageStore` d'iOS : un favori est un RENVOI (nature + identifiant),
 * jamais une copie ; le plus récemment épinglé passe en tête.
 */

const memory = (initial: Record<string, string> = {}): SafeStorage & { readonly data: Map<string, string> } => {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
};

const mee: StickerFavorite = { kind: 'mee', value: 'mee-coucou' };
const mine: StickerFavorite = { kind: 'library', value: 's1' };

describe('les favoris de stickers', () => {
  test('épingler place en tête ; ré-épingler retire', () => {
    const once = toggleFavorite([], mee);
    expect(once).toEqual([mee]);
    const twice = toggleFavorite(once, mine);
    expect(twice).toEqual([mine, mee]);
    expect(isFavorite(twice, { kind: 'mee', value: 'mee-coucou' })).toBe(true);
    expect(toggleFavorite(twice, { kind: 'mee', value: 'mee-coucou' })).toEqual([mine]);
  });

  test('deux natures ne se confondent pas, même identifiant', () => {
    const list = toggleFavorite([], { kind: 'mee', value: 'x' });
    expect(isFavorite(list, { kind: 'library', value: 'x' })).toBe(false);
  });

  test('une valeur stockée illisible ou étrangère ne casse rien : elle rend une liste vide ou filtrée', () => {
    expect(parseFavorites(null)).toEqual([]);
    expect(parseFavorites('{pas du json')).toEqual([]);
    expect(parseFavorites('{"kind":"mee"}')).toEqual([]);
    expect(parseFavorites(JSON.stringify([mee, { kind: 'autre', value: 'z' }, { kind: 'library' }, mine]))).toEqual([mee, mine]);
  });

  test('ce qui est écrit se relit, sous la clé dédiée', () => {
    const storage = memory();
    writeFavorites([mine, mee], storage);
    expect(storage.data.has(STICKER_FAVORITES_KEY)).toBe(true);
    expect(readFavorites(storage)).toEqual([mine, mee]);
  });
});
