import { afterEach, describe, expect, test } from 'bun:test';

import { SCHEME_KEY } from './inline-scheme-bootstrap.js';
import { currentThemePreference, followSystem, setThemePreference } from './scheme';

/**
 * LA PRÉFÉRENCE DE THÈME — clair, sombre ou système (#5563), miroir
 * `ThemePreference` (iOS, `SettingsView.appearanceSection`).
 *
 * Le schéma PEINT (`light`/`dark`) et la PRÉFÉRENCE (`light`/`dark`/`system`)
 * sont deux choses : « système » n'est pas un schéma, c'est l'ABSENCE de choix
 * stocké. Ces témoins prouvent que la bascule prend À CHAUD (la classe change
 * sans rechargement), qu'elle PERSISTE, et que revenir à « système » rend la
 * main au suivi de `prefers-color-scheme` — sans quoi le prochain changement du
 * système serait ignoré pour toujours.
 */

type Listener = (event: MediaQueryListEvent) => void;

const environmentOf = (options: { readonly systemLight: boolean; readonly storageDenied?: boolean }) => {
  const listeners = new Set<Listener>();
  const media = {
    matches: options.systemLight,
    addEventListener: (_type: 'change', listener: Listener) => listeners.add(listener),
    removeEventListener: (_type: 'change', listener: Listener) => listeners.delete(listener),
  };
  const classes = new Set<string>();
  const classList = {
    contains: (name: string) => classes.has(name),
    toggle: (name: string, force?: boolean) => {
      const on = force ?? !classes.has(name);
      if (on) classes.add(name);
      else classes.delete(name);
      return on;
    },
  };
  const stored = new Map<string, string>();
  const deny = () => {
    if (options.storageDenied === true) throw new Error('SecurityError: stockage refusé');
  };
  const storage = {
    getItem: (key: string) => {
      deny();
      return stored.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      deny();
      stored.set(key, value);
    },
    removeItem: (key: string) => {
      deny();
      stored.delete(key);
    },
  };
  const scope = globalThis as { window?: unknown; document?: unknown; localStorage?: unknown };
  const saved = { window: scope.window, document: scope.document, localStorage: scope.localStorage };
  scope.window = { matchMedia: () => media };
  scope.document = { documentElement: { classList } };
  scope.localStorage = storage;
  return {
    classes,
    stored,
    fireSystem: (light: boolean) => {
      media.matches = light;
      listeners.forEach((listener) => listener({ matches: light } as MediaQueryListEvent));
    },
    restore: () => {
      scope.window = saved.window;
      scope.document = saved.document;
      scope.localStorage = saved.localStorage;
    },
  };
};

let restore: (() => void) | null = null;
afterEach(() => {
  restore?.();
  restore = null;
});

const install = (options: Parameters<typeof environmentOf>[0]) => {
  const env = environmentOf(options);
  restore = env.restore;
  return env;
};

describe('currentThemePreference — ce que l’utilisateur a CHOISI, pas ce qui est peint', () => {
  test('rien de stocké ⇒ « système »', () => {
    install({ systemLight: true });
    expect(currentThemePreference()).toBe('system');
  });

  test('un choix stocké se relit tel quel', () => {
    const env = install({ systemLight: true });
    env.stored.set(SCHEME_KEY, 'dark');
    expect(currentThemePreference()).toBe('dark');
  });

  test('une valeur stockée inconnue n’est pas un choix ⇒ « système »', () => {
    const env = install({ systemLight: false });
    env.stored.set(SCHEME_KEY, 'sepia');
    expect(currentThemePreference()).toBe('system');
  });

  test('stockage refusé ⇒ « système », sans lever', () => {
    install({ systemLight: false, storageDenied: true });
    expect(currentThemePreference()).toBe('system');
  });
});

describe('setThemePreference — à chaud, persisté, et « système » rend la main au système', () => {
  test('« clair » peint le schéma clair et le persiste', () => {
    const env = install({ systemLight: false });
    setThemePreference('light');
    expect(env.classes.has('light')).toBe(true);
    expect(env.classes.has('dark')).toBe(false);
    expect(env.stored.get(SCHEME_KEY)).toBe('light');
  });

  test('« sombre » peint le schéma sombre et le persiste', () => {
    const env = install({ systemLight: true });
    setThemePreference('dark');
    expect(env.classes.has('dark')).toBe(true);
    expect(env.classes.has('light')).toBe(false);
    expect(env.stored.get(SCHEME_KEY)).toBe('dark');
  });

  test('« système » retire le choix stocké et peint le schéma du système', () => {
    const env = install({ systemLight: true });
    setThemePreference('dark');
    setThemePreference('system');
    expect(env.stored.has(SCHEME_KEY)).toBe(false);
    expect(env.classes.has('light')).toBe(true);
    expect(currentThemePreference()).toBe('system');
  });

  test('après « système », le prochain changement du système est suivi', () => {
    const env = install({ systemLight: true });
    followSystem();
    setThemePreference('light');
    env.fireSystem(false);
    expect(env.classes.has('light')).toBe(true);

    setThemePreference('system');
    env.fireSystem(false);
    expect(env.classes.has('dark')).toBe(true);
  });

  test('stockage refusé : le schéma se peint quand même pour la session', () => {
    const env = install({ systemLight: false, storageDenied: true });
    setThemePreference('light');
    expect(env.classes.has('light')).toBe(true);
    setThemePreference('system');
    expect(env.classes.has('dark')).toBe(true);
  });
});
