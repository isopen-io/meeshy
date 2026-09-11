import { describe, expect, test } from 'bun:test';

import { createWelcomeStore } from './welcome';

/**
 * L'ACCUEIL EST SOLDÉ UNE FOIS PAR APPAREIL (#5816, T7) — miroir
 * `@AppStorage("hasCompletedOnboarding")` (`MeeshyApp.swift:18`).
 */

function fakeStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
    values,
  };
}

describe('createWelcomeStore', () => {
  test('storage absent : non soldé', () => {
    const store = createWelcomeStore({ storage: fakeStorage() });
    expect(store.isCompleted()).toBe(false);
  });

  test('markCompleted() écrit la clé et solde immédiatement', () => {
    const storage = fakeStorage();
    const store = createWelcomeStore({ storage });
    store.markCompleted();
    expect(store.isCompleted()).toBe(true);
    expect(storage.values.get('meeshy.welcome-completed')).toBe('1');
  });

  test('valeur corrompue : non soldé', () => {
    const store = createWelcomeStore({ storage: fakeStorage({ 'meeshy.welcome-completed': 'x' }) });
    expect(store.isCompleted()).toBe(false);
  });

  test('un storage qui lève ne fait jamais planter — non soldé', () => {
    const throwing = {
      getItem: () => {
        throw new Error('nope');
      },
      setItem: () => {
        throw new Error('nope');
      },
      removeItem: () => {
        throw new Error('nope');
      },
    };
    const store = createWelcomeStore({ storage: throwing });
    expect(store.isCompleted()).toBe(false);
    expect(() => store.markCompleted()).not.toThrow();
  });

  test('valeur déjà "1" persistée : soldé dès la lecture', () => {
    const store = createWelcomeStore({ storage: fakeStorage({ 'meeshy.welcome-completed': '1' }) });
    expect(store.isCompleted()).toBe(true);
  });
});
