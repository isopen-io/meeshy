import { describe, expect, test } from 'bun:test';

import { createReadingModeStore, readingModeStore, type StorageLike } from './store';

/** Un `StorageLike` en mémoire, pour observer précisément ce que le magasin écrit. */
function fakeStorage(): StorageLike & { readonly data: Map<string, string> } {
  const data = new Map<string, string>();
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
}

describe('la persistance — rien d’écrit ⇒ null (⇒ auto)', () => {
  test('une conversation jamais touchée rend null', () => {
    const store = createReadingModeStore(fakeStorage());
    expect(store.getPreference('local', 'c-1')).toBeNull();
  });
});

describe('la persistance — écrire puis lire', () => {
  test('round-trip par (scope, conversationId)', () => {
    const store = createReadingModeStore(fakeStorage());
    store.setPreference('local', 'c-1', 'script');
    expect(store.getPreference('local', 'c-1')).toBe('script');
  });

  test('deux scopes, même conversation ⇒ deux valeurs indépendantes (anti-fuite multi-comptes)', () => {
    const store = createReadingModeStore(fakeStorage());
    store.setPreference('user-a', 'c-1', 'script');
    store.setPreference('user-b', 'c-1', 'bubbles');
    expect(store.getPreference('user-a', 'c-1')).toBe('script');
    expect(store.getPreference('user-b', 'c-1')).toBe('bubbles');
  });
});

describe('la persistance — effacer', () => {
  test('setPreference(null) efface (retour auto)', () => {
    const backend = fakeStorage();
    const store = createReadingModeStore(backend);
    store.setPreference('local', 'c-1', 'script');
    store.setPreference('local', 'c-1', null);
    expect(store.getPreference('local', 'c-1')).toBeNull();
    expect(backend.data.has('meeshy.reading-mode.local.c-1')).toBe(false);
  });
});

describe('lastOpenedAt / noteOpened', () => {
  test('round-trip, à la milliseconde', () => {
    const store = createReadingModeStore(fakeStorage());
    const at = new Date('2026-09-07T10:00:00.000Z');
    store.noteOpened('local', 'c-1', at);
    expect(store.lastOpenedAt('local', 'c-1')).toEqual(at);
  });

  test('jamais ouvert ⇒ null, JAMAIS l’epoch', () => {
    const store = createReadingModeStore(fakeStorage());
    expect(store.lastOpenedAt('local', 'c-1')).toBeNull();
  });
});

describe('un backend qui LANCE (quota, navigation privée)', () => {
  const throwingStorage: StorageLike = {
    getItem: () => {
      throw new Error('quota');
    },
    setItem: () => {
      throw new Error('quota');
    },
    removeItem: () => {
      throw new Error('quota');
    },
  };

  test('le magasin tient en mémoire pour la session, aucune exception ne fuit', () => {
    const store = createReadingModeStore(throwingStorage);
    expect(() => store.setPreference('local', 'c-1', 'focal')).not.toThrow();
    expect(store.getPreference('local', 'c-1')).toBe('focal');
    expect(() => store.noteOpened('local', 'c-1', new Date())).not.toThrow();
    expect(() => store.setPreference('local', 'c-1', null)).not.toThrow();
  });

  test('le magasin par défaut de l’application (localStorage réel absent dans ce runtime) ne lance jamais', () => {
    expect(() => readingModeStore.setPreference('local', 'c-probe', 'script')).not.toThrow();
    expect(readingModeStore.getPreference('local', 'c-probe')).toBe('script');
  });
});

describe('une valeur CORROMPUE en storage', () => {
  test('une chaîne hors énumération rend null, jamais un crash', () => {
    const backend = fakeStorage();
    backend.data.set('meeshy.reading-mode.local.c-1', 'garbage');
    const store = createReadingModeStore(backend);
    expect(store.getPreference('local', 'c-1')).toBeNull();
  });
});
