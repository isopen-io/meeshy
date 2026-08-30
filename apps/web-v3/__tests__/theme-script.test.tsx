import { renderToStaticMarkup } from 'react-dom/server';

import RootLayout from '../app/layout';

jest.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => ({ get: () => null }),
}));

const V3_KEY = 'meeshy-theme';
const LEGACY_V2_KEY = 'gp-theme-mode';
const LEGACY_STORE_KEY = 'meeshy-app';

const shellMarkup = async (): Promise<string> =>
  renderToStaticMarkup(await RootLayout({ children: <p>contenu</p> }));

const inlineScripts = (markup: string): readonly string[] =>
  [...markup.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(
    (match) => match[1] ?? '',
  );

const stubMatchMedia = (osPrefersDark: boolean): void => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({ matches: osPrefersDark && query.includes('dark'), media: query }),
  });
};

const runThemeScript = async (options: {
  readonly stored?: Readonly<Record<string, string>>;
  readonly osPrefersDark: boolean;
}): Promise<void> => {
  window.localStorage.clear();
  Object.entries(options.stored ?? {}).forEach(([key, value]) => {
    window.localStorage.setItem(key, value);
  });
  stubMatchMedia(options.osPrefersDark);
  document.documentElement.className = '';
  document.documentElement.removeAttribute('style');
  new Function(inlineScripts(await shellMarkup())[0] ?? '')();
};

const appliedScheme = (): { readonly classes: readonly string[]; readonly colorScheme: string } => ({
  classes: [...document.documentElement.classList],
  colorScheme: document.documentElement.style.colorScheme,
});

describe('la coquille racine de la zone v3', () => {
  it('ne porte que le script de theme, en ligne et avant le premier pixel', async () => {
    const markup = await shellMarkup();

    expect(inlineScripts(markup)).toHaveLength(1);
    expect(markup).not.toContain('<script src');
    expect(markup.indexOf('<script')).toBeLessThan(markup.indexOf('<body'));
  });

  it('tient le script de theme sous 400 octets', async () => {
    const script = inlineScripts(await shellMarkup())[0] ?? '';

    expect(Buffer.byteLength(script, 'utf8')).toBeLessThanOrEqual(400);
  });
});

describe('la resolution du theme avant le premier pixel', () => {
  it('honore une preference explicite sombre sur un systeme clair', async () => {
    await runThemeScript({ stored: { [V3_KEY]: 'dark' }, osPrefersDark: false });

    expect(appliedScheme()).toEqual({ classes: ['dark'], colorScheme: 'dark' });
  });

  it('honore une preference explicite claire sur un systeme sombre', async () => {
    await runThemeScript({ stored: { [V3_KEY]: 'light' }, osPrefersDark: true });

    expect(appliedScheme()).toEqual({ classes: ['light'], colorScheme: 'light' });
  });

  it('suit le systeme sombre quand aucune preference n est stockee', async () => {
    await runThemeScript({ osPrefersDark: true });

    expect(appliedScheme()).toEqual({ classes: ['dark'], colorScheme: 'dark' });
  });

  it('suit le systeme clair quand aucune preference n est stockee', async () => {
    await runThemeScript({ osPrefersDark: false });

    expect(appliedScheme()).toEqual({ classes: ['light'], colorScheme: 'light' });
  });

  it('resout la preference system en classe concrete, jamais en classe system', async () => {
    await runThemeScript({ stored: { [V3_KEY]: 'system' }, osPrefersDark: true });

    expect(appliedScheme()).toEqual({ classes: ['dark'], colorScheme: 'dark' });
  });

  it('ignore une valeur stockee inconnue et retombe sur le systeme', async () => {
    await runThemeScript({ stored: { [V3_KEY]: 'aubergine' }, osPrefersDark: true });

    expect(appliedScheme()).toEqual({ classes: ['dark'], colorScheme: 'dark' });
  });

  it('applique quand meme le systeme si le stockage local est interdit', async () => {
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get: () => {
        throw new Error('storage denied');
      },
    });
    stubMatchMedia(true);
    document.documentElement.className = '';
    document.documentElement.removeAttribute('style');

    try {
      const script = inlineScripts(await shellMarkup())[0] ?? '';
      expect(() => new Function(script)()).not.toThrow();
      expect(appliedScheme()).toEqual({ classes: ['dark'], colorScheme: 'dark' });
    } finally {
      if (original) {
        Object.defineProperty(window, 'localStorage', original);
      }
    }
  });
});

describe('le franchissement de la frontiere de zone (§ 4.9)', () => {
  it('honore le choix CLAIR fait dans le legacy v2 sur un systeme sombre', async () => {
    await runThemeScript({ stored: { [LEGACY_V2_KEY]: 'light' }, osPrefersDark: true });

    expect(appliedScheme()).toEqual({ classes: ['light'], colorScheme: 'light' });
  });

  it('honore le choix SOMBRE fait dans le store legacy sur un systeme clair', async () => {
    await runThemeScript({
      stored: { [LEGACY_STORE_KEY]: JSON.stringify({ state: { theme: 'dark' }, version: 0 }) },
      osPrefersDark: false,
    });

    expect(appliedScheme()).toEqual({ classes: ['dark'], colorScheme: 'dark' });
  });

  it('laisse le auto du store legacy retomber sur le systeme', async () => {
    await runThemeScript({
      stored: { [LEGACY_STORE_KEY]: JSON.stringify({ state: { theme: 'auto' }, version: 0 }) },
      osPrefersDark: true,
    });

    expect(appliedScheme()).toEqual({ classes: ['dark'], colorScheme: 'dark' });
  });

  it('fait gagner la cle de la v3 sur les deux cles de migration', async () => {
    await runThemeScript({
      stored: {
        [V3_KEY]: 'dark',
        [LEGACY_V2_KEY]: 'light',
        [LEGACY_STORE_KEY]: JSON.stringify({ state: { theme: 'light' } }),
      },
      osPrefersDark: false,
    });

    expect(appliedScheme()).toEqual({ classes: ['dark'], colorScheme: 'dark' });
  });

  it('descend jusqu au store legacy quand les deux cles au dessus sont absentes', async () => {
    await runThemeScript({
      stored: { [LEGACY_STORE_KEY]: JSON.stringify({ state: { theme: 'light' } }) },
      osPrefersDark: true,
    });

    expect(appliedScheme()).toEqual({ classes: ['light'], colorScheme: 'light' });
  });

  it('arrete la descente a la premiere cle PRESENTE, meme si sa valeur est inconnue', async () => {
    await runThemeScript({
      stored: {
        [LEGACY_V2_KEY]: 'aubergine',
        [LEGACY_STORE_KEY]: JSON.stringify({ state: { theme: 'light' } }),
      },
      osPrefersDark: true,
    });

    expect(appliedScheme()).toEqual({ classes: ['dark'], colorScheme: 'dark' });
  });

  it('survit a un store legacy illisible sans perdre la cle de la v3', async () => {
    await runThemeScript({
      stored: { [V3_KEY]: 'light', [LEGACY_STORE_KEY]: '{ pas du json' },
      osPrefersDark: true,
    });

    expect(appliedScheme()).toEqual({ classes: ['light'], colorScheme: 'light' });
  });

  it('n ecrit jamais dans les cles de migration', async () => {
    await runThemeScript({ stored: { [LEGACY_V2_KEY]: 'light' }, osPrefersDark: true });

    expect(window.localStorage.getItem(LEGACY_V2_KEY)).toBe('light');
    expect(window.localStorage.getItem(LEGACY_STORE_KEY)).toBeNull();
    expect(window.localStorage.getItem(V3_KEY)).toBeNull();
  });
});
