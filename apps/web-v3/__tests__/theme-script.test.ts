import { THEME_STORAGE_KEY, themeScriptSource } from '../app/theme-script';

const INLINE_BYTE_BUDGET = 400;

type MediaQueryStub = { matches: boolean; media: string };

const withColorScheme = (prefersDark: boolean): void => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (media: string): MediaQueryStub => ({
      media,
      matches: media.includes('dark') ? prefersDark : !prefersDark,
    }),
  });
};

const runThemeScript = (): void => {
  new Function(themeScriptSource)();
};

const rootClasses = (): readonly string[] => Array.from(document.documentElement.classList);

beforeEach(() => {
  document.documentElement.className = '';
  document.documentElement.removeAttribute('style');
  window.localStorage.clear();
});

describe('le script de thème inline', () => {
  it('applique la préférence explicite sombre même si le système est clair', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    withColorScheme(false);

    runThemeScript();

    expect(rootClasses()).toContain('dark');
    expect(rootClasses()).not.toContain('light');
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });

  it('applique la préférence explicite claire même si le système est sombre', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light');
    withColorScheme(true);

    runThemeScript();

    expect(rootClasses()).toContain('light');
    expect(rootClasses()).not.toContain('dark');
    expect(document.documentElement.style.colorScheme).toBe('light');
  });

  it('suit le système quand aucune préférence n\'est enregistrée', () => {
    withColorScheme(true);

    runThemeScript();

    expect(rootClasses()).toContain('dark');
  });

  it('suit le système quand la préférence enregistrée est « system »', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'system');
    withColorScheme(false);

    runThemeScript();

    expect(rootClasses()).toContain('light');
    expect(document.documentElement.style.colorScheme).toBe('light');
  });

  it('ne lit aucune des deux clés divergentes du legacy', () => {
    window.localStorage.setItem('meeshy-app', 'dark');
    window.localStorage.setItem('gp-theme-mode', 'dark');
    withColorScheme(false);

    runThemeScript();

    expect(rootClasses()).toContain('light');
  });

  it('retombe sur le système quand le stockage local est inaccessible', () => {
    const getItem = window.Storage.prototype.getItem;
    window.Storage.prototype.getItem = (): string => {
      throw new Error('storage disabled');
    };
    withColorScheme(true);

    expect(() => runThemeScript()).not.toThrow();
    expect(rootClasses()).toContain('dark');

    window.Storage.prototype.getItem = getItem;
  });

  it('tient dans le budget de 400 octets inline', () => {
    expect(Buffer.byteLength(themeScriptSource, 'utf8')).toBeLessThanOrEqual(INLINE_BYTE_BUDGET);
  });
});
