import { describe, expect, test } from 'bun:test';

import { createRecentKeys, createRecentMap } from './recent-keys';

describe('createRecentKeys — ce que la session a déjà fait, sans grossir', () => {
  test('retient ce qu’on lui confie', () => {
    const keys = createRecentKeys(3);
    expect(keys.has('a')).toBe(false);
    keys.add('a');
    expect(keys.has('a')).toBe(true);
    expect(keys.has('b')).toBe(false);
  });

  test('au-delà de la borne, la plus ancienne sort la première', () => {
    const keys = createRecentKeys(3);
    for (const key of ['a', 'b', 'c', 'd']) keys.add(key);
    expect(['a', 'b', 'c', 'd'].map((key) => keys.has(key))).toEqual([false, true, true, true]);
  });

  test('rejouer une clé la rafraîchit : ce n’est plus elle qui sort', () => {
    const keys = createRecentKeys(3);
    for (const key of ['a', 'b', 'c']) keys.add(key);
    keys.add('a');
    keys.add('d');
    expect(['a', 'b', 'c', 'd'].map((key) => keys.has(key))).toEqual([true, false, true, true]);
  });

  test('rejouer la même clé ne la compte qu’une fois', () => {
    const keys = createRecentKeys(2);
    for (const key of ['a', 'a', 'a', 'b']) keys.add(key);
    expect(keys.has('a')).toBe(true);
    expect(keys.has('b')).toBe(true);
  });

  test('une clé retirée se refait', () => {
    const keys = createRecentKeys(3);
    keys.add('a');
    keys.delete('a');
    keys.delete('inconnue');
    expect(keys.has('a')).toBe(false);
  });
});

describe('createRecentMap — ce que la session a déjà ouvert, sans grossir', () => {
  test('rend ce qu’on lui confie, et rien d’autre', () => {
    const entries = createRecentMap<number>(3);
    entries.set('a', 1);
    expect(entries.get('a')).toBe(1);
    expect(entries.has('a')).toBe(true);
    expect(entries.get('b')).toBeUndefined();
    expect(entries.has('b')).toBe(false);
  });

  test('au-delà de la borne, la plus ancienne sort ; relire ne rafraîchit pas, réécrire si', () => {
    const entries = createRecentMap<number>(2);
    entries.set('a', 1);
    entries.set('b', 2);
    entries.set('a', 3);
    entries.set('c', 4);
    expect([entries.get('a'), entries.get('b'), entries.get('c')]).toEqual([3, undefined, 4]);
  });

  test('une entrée retirée se refait', () => {
    const entries = createRecentMap<number>(2);
    entries.set('a', 1);
    entries.delete('a');
    expect(entries.has('a')).toBe(false);
  });
});
