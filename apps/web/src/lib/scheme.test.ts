import { afterEach, describe, expect, test } from 'bun:test';

import { followSystem, holdMediaSystemBars, setThemePreference } from './scheme';

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

const THEME_COLORS = { dark: '#0b0c14', light: '#f1f3f9' } as const;

function fakeThemeColorMetas() {
  return (['dark', 'light'] as const).map((scheme) => ({
    media: `(prefers-color-scheme: ${scheme})`,
    getAttribute: (name: string) =>
      name === 'data-scheme' ? scheme : name === 'content' ? THEME_COLORS[scheme] : null,
  }));
}

function installEnvironment() {
  const media = fakeMatchMedia();
  const classList = fakeClassList();
  const storage = fakeStorage();
  const metas = fakeThemeColorMetas();

  const originalWindow = (globalThis as { window?: unknown }).window;
  const originalDocument = (globalThis as { document?: unknown }).document;
  const originalLocalStorage = (globalThis as { localStorage?: unknown }).localStorage;
  const originalCapacitor = (globalThis as { Capacitor?: unknown }).Capacitor;

  (globalThis as { window: unknown }).window = {
    matchMedia: (query: string) => {
      expect(query).toBe('(prefers-color-scheme: light)');
      return media;
    },
  };
  (globalThis as { document: unknown }).document = {
    documentElement: { classList },
    querySelectorAll: (selector: string) => {
      expect(selector).toBe('meta[name="theme-color"][data-scheme]');
      return metas;
    },
  };
  (globalThis as { localStorage: unknown }).localStorage = storage;

  return {
    media,
    classList,
    storage,
    metas,
    restore() {
      (globalThis as { window?: unknown }).window = originalWindow;
      (globalThis as { document?: unknown }).document = originalDocument;
      (globalThis as { localStorage?: unknown }).localStorage = originalLocalStorage;
      (globalThis as { Capacitor?: unknown }).Capacitor = originalCapacitor;
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

/**
 * LA BARRE D'ÉTAT DE LA COQUE (#7731) — `SystemBars` (Capacitor 8) règle ses
 * icônes sur le thème du SYSTÈME ; l'application peint le thème CHOISI dans
 * Réglages. Sombre dans l'app sur un téléphone clair : icônes sombres sur fond
 * sombre, l'heure et la batterie disparaissent. Le schéma peint est donc
 * poussé à la coque — `DARK` = icônes claires, `LIGHT` = icônes sombres.
 */
describe('la barre d’état de la coque suit le schéma PEINT, pas le système (#7731)', () => {
  function installShell(plugins: ReadonlyArray<string> = ['SystemBars']) {
    const styles: unknown[] = [];
    (globalThis as { Capacitor?: unknown }).Capacitor = {
      PluginHeaders: plugins.map((name) => ({ name })),
      nativePromise: async (plugin: string, methode: string, options: unknown) => {
        styles.push({ plugin, methode, options });
        return {};
      },
    };
    return styles;
  }

  test('au démarrage, un choix sombre stocké sur un système clair pose des icônes CLAIRES', () => {
    const env = installEnvironment();
    cleanup = env.restore;
    const styles = installShell();
    env.storage.setItem('meeshy.scheme', 'dark');
    env.classList.toggle('dark', true);

    followSystem();

    expect(styles).toEqual([{ plugin: 'SystemBars', methode: 'setStyle', options: { style: 'DARK' } }]);
  });

  test('choisir « clair » dans Réglages pose des icônes SOMBRES', () => {
    const env = installEnvironment();
    cleanup = env.restore;
    const styles = installShell();

    setThemePreference('light');

    expect(styles).toEqual([{ plugin: 'SystemBars', methode: 'setStyle', options: { style: 'LIGHT' } }]);
  });

  test('en suivi du système, la bascule du téléphone suit jusqu’à la barre d’état', () => {
    const env = installEnvironment();
    cleanup = env.restore;
    const styles = installShell();
    env.classList.toggle('dark', true);

    followSystem();
    env.media.fire(true);

    expect(styles.map((s) => (s as { options: { style: string } }).options.style)).toEqual(['DARK', 'LIGHT']);
  });

  test('une coque sans SystemBars ne reçoit aucun appel', () => {
    const env = installEnvironment();
    cleanup = env.restore;
    const styles = installShell([]);

    setThemePreference('dark');

    expect(styles).toEqual([]);
  });

  test('un refus de la coque ne casse pas la bascule du thème', () => {
    const env = installEnvironment();
    cleanup = env.restore;
    (globalThis as { Capacitor?: unknown }).Capacitor = {
      PluginHeaders: [{ name: 'SystemBars' }],
      nativePromise: () => Promise.reject(new Error('indisponible')),
    };

    setThemePreference('light');

    expect(env.classList.contains('light')).toBe(true);
  });
});

/**
 * LE FOND DES BARRES SYSTÈME (#9533) — sous Android 15, la coque n'est pas
 * bord à bord et le thème natif peint les barres selon le SYSTÈME. Le pont
 * `MeeshySystemBars` reçoit la couleur `theme-color` du schéma PEINT, celle
 * que Chrome donne à sa barre : la meta reste la seule source de la couleur.
 */
describe('le fond des barres de la coque prend la couleur theme-color du schéma PEINT (#9533)', () => {
  function installShell(plugins: ReadonlyArray<string>) {
    const appels: Array<{ plugin: string; methode: string; options: unknown }> = [];
    (globalThis as { Capacitor?: unknown }).Capacitor = {
      PluginHeaders: plugins.map((name) => ({ name })),
      nativePromise: async (plugin: string, methode: string, options: unknown) => {
        appels.push({ plugin, methode, options });
        return {};
      },
    };
    return () => appels.filter((appel) => appel.plugin === 'MeeshySystemBars');
  }

  test('choisir « clair » peint les barres de la couleur claire de la page', () => {
    const env = installEnvironment();
    cleanup = env.restore;
    const peintures = installShell(['SystemBars', 'MeeshySystemBars']);

    setThemePreference('light');

    expect(peintures()).toEqual([{ plugin: 'MeeshySystemBars', methode: 'paint', options: { color: '#f1f3f9' } }]);
  });

  test('un choix sombre stocké sur un système clair peint les barres en sombre dès le démarrage', () => {
    const env = installEnvironment();
    cleanup = env.restore;
    const peintures = installShell(['SystemBars', 'MeeshySystemBars']);
    env.storage.setItem('meeshy.scheme', 'dark');
    env.classList.toggle('dark', true);

    followSystem();

    expect(peintures()).toEqual([{ plugin: 'MeeshySystemBars', methode: 'paint', options: { color: '#0b0c14' } }]);
  });

  test('une coque construite avant le pont ne reçoit aucune peinture', () => {
    const env = installEnvironment();
    cleanup = env.restore;
    const peintures = installShell(['SystemBars']);

    setThemePreference('light');

    expect(peintures()).toEqual([]);
  });

  test('un refus du pont ne casse pas la bascule du thème', () => {
    const env = installEnvironment();
    cleanup = env.restore;
    (globalThis as { Capacitor?: unknown }).Capacitor = {
      PluginHeaders: [{ name: 'MeeshySystemBars' }],
      nativePromise: () => Promise.reject(new Error('indisponible')),
    };

    setThemePreference('light');

    expect(env.classList.contains('light')).toBe(true);
  });
});

describe('la barre du navigateur suit le schéma PEINT, pas le système (#7776)', () => {
  const barre = (env: ReturnType<typeof installEnvironment>) =>
    Object.fromEntries(env.metas.map((meta) => [meta.getAttribute('data-scheme'), meta.media]));

  test('au démarrage, un choix sombre stocké sur un système clair peint la barre en sombre', () => {
    const env = installEnvironment();
    cleanup = env.restore;
    env.storage.setItem('meeshy.scheme', 'dark');
    env.classList.toggle('dark', true);

    followSystem();

    expect(barre(env)).toEqual({ dark: 'all', light: 'not all' });
  });

  test('choisir « clair » dans Réglages peint la barre en clair', () => {
    const env = installEnvironment();
    cleanup = env.restore;

    setThemePreference('light');

    expect(barre(env)).toEqual({ dark: 'not all', light: 'all' });
  });

  test('en suivi du système, la bascule du téléphone suit jusqu’à la barre', () => {
    const env = installEnvironment();
    cleanup = env.restore;
    env.classList.toggle('dark', true);

    followSystem();
    env.media.fire(true);

    expect(barre(env)).toEqual({ dark: 'not all', light: 'all' });
  });
});

/**
 * UN PLEIN ÉCRAN SOMBRE GARDE L'HEURE LISIBLE (#10917, #10797). Sous Android
 * 15 et plus, la page de la coque passe sous la barre d'état : en thème clair,
 * des icônes SOMBRES se posaient sur le noir de la visionneuse, d'une story ou
 * d'un appel. Le navigateur, lui, garde sa barre `theme-color`. Tant qu'une
 * telle surface est montée, la barre prend le style et la couleur du schéma
 * sombre ; la dernière fermée, elle revient au schéma peint.
 */
describe('un plein écran sombre pose des icônes claires sur la barre de la coque (#10917)', () => {
  function installShell() {
    const appels: Array<{ plugin: string; methode: string; options: unknown }> = [];
    (globalThis as { Capacitor?: unknown }).Capacitor = {
      PluginHeaders: [{ name: 'SystemBars' }, { name: 'MeeshySystemBars' }],
      nativePromise: async (plugin: string, methode: string, options: unknown) => {
        appels.push({ plugin, methode, options });
        return {};
      },
    };
    return appels;
  }

  test('en thème clair, ouvrir la surface pose des icônes claires sur une barre sombre, la fermer rend le thème', () => {
    const env = installEnvironment();
    cleanup = env.restore;
    setThemePreference('light');
    const appels = installShell();

    const relacher = holdMediaSystemBars();
    const ouverte = [...appels];
    relacher();

    expect(ouverte).toEqual([
      { plugin: 'MeeshySystemBars', methode: 'paint', options: { color: THEME_COLORS.dark } },
      { plugin: 'SystemBars', methode: 'setStyle', options: { style: 'DARK' } },
    ]);
    expect(appels.slice(ouverte.length)).toEqual([
      { plugin: 'MeeshySystemBars', methode: 'paint', options: { color: THEME_COLORS.light } },
      { plugin: 'SystemBars', methode: 'setStyle', options: { style: 'LIGHT' } },
    ]);
  });

  test('deux surfaces empilées : la barre reste sombre jusqu’à la fermeture de la dernière, et relâcher deux fois ne compte qu’une', () => {
    const env = installEnvironment();
    cleanup = env.restore;
    setThemePreference('light');
    const appels = installShell();
    const styles = () => appels.filter((a) => a.plugin === 'SystemBars').map((a) => (a.options as { style: string }).style);

    const visionneuse = holdMediaSystemBars();
    const appel = holdMediaSystemBars();
    visionneuse();
    visionneuse();
    expect(styles()).toEqual(['DARK']);

    appel();
    expect(styles()).toEqual(['DARK', 'LIGHT']);
  });

  test('changer de thème pendant que la surface est ouverte ne rallume pas les icônes sombres', () => {
    const env = installEnvironment();
    cleanup = env.restore;
    const appels = installShell();
    const relacher = holdMediaSystemBars();

    setThemePreference('light');

    expect(appels.filter((a) => a.plugin === 'SystemBars').map((a) => (a.options as { style: string }).style)).toEqual(['DARK', 'DARK']);
    expect(env.classList.contains('light')).toBe(true);
    relacher();
  });

  test('hors coque, ouvrir et fermer la surface ne touche à rien', () => {
    const env = installEnvironment();
    cleanup = env.restore;
    delete (globalThis as { Capacitor?: unknown }).Capacitor;

    expect(() => holdMediaSystemBars()()).not.toThrow();
  });
});

/**
 * ET LE NAVIGATEUR SUIT LA COQUE (#10922). La PWA installée prend sa barre
 * d'état de `theme-color`, et Chrome Android sa barre d'outils : en thème
 * clair, une bande BLANCHE restait au-dessus du noir de la visionneuse, d'une
 * story ou d'un appel, pendant que la coque passait en sombre (#10917).
 */
describe('un plein écran sombre passe aussi la barre du navigateur en sombre (#10922)', () => {
  const barre = (env: ReturnType<typeof installEnvironment>) =>
    Object.fromEntries(env.metas.map((meta) => [meta.getAttribute('data-scheme'), meta.media]));

  test('en thème clair, ouvrir la surface active la barre sombre, la fermer rend la barre claire', () => {
    const env = installEnvironment();
    cleanup = env.restore;
    setThemePreference('light');

    const relacher = holdMediaSystemBars();
    const ouverte = barre(env);
    relacher();

    expect(ouverte).toEqual({ dark: 'all', light: 'not all' });
    expect(barre(env)).toEqual({ dark: 'not all', light: 'all' });
  });

  test('changer de thème pendant que la surface est ouverte garde la barre sombre', () => {
    const env = installEnvironment();
    cleanup = env.restore;
    const relacher = holdMediaSystemBars();

    setThemePreference('light');

    expect(barre(env)).toEqual({ dark: 'all', light: 'not all' });
    relacher();
    expect(barre(env)).toEqual({ dark: 'not all', light: 'all' });
  });
});
