import { afterEach, describe, expect, test } from 'bun:test';

import { followSystem } from './scheme';

/**
 * `followSystem — la preference systeme est suivie a chaud` (T1, #5604).
 *
 * Defaut 3c constate au recette 2026-09-07 : la bascule clair/sombre du
 * systeme ne prenait qu'au relancement, `main.tsx` n'appelant jamais
 * `followSystem()`. Ce temoin prouve le COMPORTEMENT de la fonction par son
 * API publique — la preuve qu'elle est bien APPELEE au demarrage est la
 * seconde moitie, en recette simulateur (R4), hors de la portee de bun test
 * (`main.tsx` est un bootstrap a effets DOM).
 *
 * Bouchons minimaux, sans DOM (meme motif que `avatar.test.tsx`) : un
 * `matchMedia` qui capture l'ecouteur `change`, une `classList` qui journalise
 * ses appels, un `localStorage` en memoire.
 */

type FakeMediaQueryList = {
  matches: boolean;
  addEventListener: (type: 'change', listener: (e: MediaQueryListEvent) => void) => void;
  removeEventListener: (type: 'change', listener: (e: MediaQueryListEvent) => void) => void;
  fire: (matches: boolean) => void;
};

function fakeMatchMedia(): FakeMediaQueryList {
  let listener: ((e: MediaQueryListEvent) => void) | null = null;
  return {
    matches: false,
    addEventListener: (_type, l) => {
      listener = l;
    },
    removeEventListener: (_type, l) => {
      if (listener === l) listener = null;
    },
    fire(matches) {
      listener?.({ matches } as MediaQueryListEvent);
    },
  };
}

function fakeClassList() {
  const classes = new Set<string>();
  return {
    classes,
    contains: (name: string) => classes.has(name),
    toggle: (name: string, force?: boolean) => {
      const on = force ?? !classes.has(name);
      if (on) classes.add(name);
      else classes.delete(name);
      return on;
    },
  };
}

function fakeStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
}

function installEnvironment() {
  const media = fakeMatchMedia();
  const classList = fakeClassList();
  const storage = fakeStorage();

  const originalWindow = (globalThis as { window?: unknown }).window;
  const originalDocument = (globalThis as { document?: unknown }).document;
  const originalLocalStorage = (globalThis as { localStorage?: unknown }).localStorage;

  (globalThis as { window: unknown }).window = {
    matchMedia: (query: string) => {
      expect(query).toBe('(prefers-color-scheme: light)');
      return media;
    },
  };
  (globalThis as { document: unknown }).document = {
    documentElement: { classList },
  };
  (globalThis as { localStorage: unknown }).localStorage = storage;

  return {
    media,
    classList,
    storage,
    restore() {
      (globalThis as { window?: unknown }).window = originalWindow;
      (globalThis as { document?: unknown }).document = originalDocument;
      (globalThis as { localStorage?: unknown }).localStorage = originalLocalStorage;
    },
  };
}

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
});

describe('followSystem — la préférence système est suivie à chaud', () => {
  test('sans choix stocké, un événement change bascule la classe de documentElement', () => {
    const env = installEnvironment();
    cleanup = env.restore;

    followSystem();
    env.media.fire(true);
    expect(env.classList.contains('light')).toBe(true);
    expect(env.classList.contains('dark')).toBe(false);

    env.media.fire(false);
    expect(env.classList.contains('light')).toBe(false);
    expect(env.classList.contains('dark')).toBe(true);
  });

  test('avec un choix stocké, l’événement change est ignoré', () => {
    const env = installEnvironment();
    cleanup = env.restore;
    env.storage.setItem('meeshy.scheme', 'dark');
    env.classList.toggle('dark', true);

    followSystem();
    env.media.fire(true);

    expect(env.classList.contains('light')).toBe(false);
    expect(env.classList.contains('dark')).toBe(true);
  });

  test('la fonction rendue désabonne l’écouteur', () => {
    const env = installEnvironment();
    cleanup = env.restore;

    const unsubscribe = followSystem();
    unsubscribe();
    env.media.fire(true);

    expect(env.classList.contains('light')).toBe(false);
  });
});
