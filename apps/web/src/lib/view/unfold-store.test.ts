import { describe, expect, test } from 'bun:test';

import { createUnfoldStore } from './unfold-store';

/**
 * LES MESSAGES LONGS DÉPLIÉS DU FIL (#16464, jumelle iOS #16463) — un toucher
 * déplie, rien ne replie, plusieurs restent dépliés ensemble, et un fil
 * rouvert (une nouvelle instance) les rend tous repliés.
 */
describe('createUnfoldStore', () => {
  test('rien n’est déplié au départ', () => {
    const store = createUnfoldStore();
    expect(store.isUnfolded('m-1')).toBe(false);
  });

  test('déplier deux messages : les deux restent dépliés', () => {
    const store = createUnfoldStore();
    store.unfold('m-1');
    store.unfold('m-2');
    expect(store.isUnfolded('m-1')).toBe(true);
    expect(store.isUnfolded('m-2')).toBe(true);
  });

  test('déplier un message déjà déplié ne le replie pas, et ne prévient personne', () => {
    const store = createUnfoldStore();
    const seen: boolean[] = [];
    store.unfold('m-1');
    const unsubscribe = store.subscribe(() => seen.push(store.isUnfolded('m-1')));
    store.unfold('m-1');
    unsubscribe();
    expect(store.isUnfolded('m-1')).toBe(true);
    expect(seen).toEqual([]);
  });

  test('une nouvelle instance du fil repart repliée', () => {
    const first = createUnfoldStore();
    first.unfold('m-1');
    expect(createUnfoldStore().isUnfolded('m-1')).toBe(false);
  });

  test('chaque dépliage prévient les abonnés, et eux seuls tant qu’ils le restent', () => {
    const store = createUnfoldStore();
    const seen: string[] = [];
    const unsubscribe = store.subscribe(() => seen.push('notified'));
    store.unfold('m-1');
    unsubscribe();
    store.unfold('m-2');
    expect(seen).toEqual(['notified']);
  });

  test('le haut d’un message qu’on vient de déplier est tenu UNE fois — à la mesure qui suit le dépliage', () => {
    const store = createUnfoldStore();
    expect(store.releasesTopHold('m-1')).toBe(false);
    store.unfold('m-1');
    expect(store.releasesTopHold('m-1')).toBe(true);
    expect(store.releasesTopHold('m-1')).toBe(false);
  });
});
