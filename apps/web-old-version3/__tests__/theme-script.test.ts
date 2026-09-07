import { COOKIE_DE_THEME } from '../lib/api/cookies';
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

const poseLeCookie = (valeur: string): void => {
  document.cookie = `${COOKIE_DE_THEME}=${valeur}`;
};

const effaceLesCookies = (): void => {
  document.cookie
    .split(';')
    .map((morceau) => morceau.trim().split('=')[0])
    .filter((nom) => nom !== '')
    .forEach((nom) => {
      document.cookie = `${nom}=;max-age=0`;
    });
};

beforeEach(() => {
  document.documentElement.className = '';
  document.documentElement.removeAttribute('style');
  window.localStorage.clear();
  effaceLesCookies();
});

describe('le script de thème inline', () => {
  it('applique la préférence explicite sombre même si le système est clair', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    withColorScheme(false);

    runThemeScript();

    expect(rootClasses()).toContain('dark');
    expect(rootClasses()).not.toContain('light');
  });

  it('applique la préférence explicite claire même si le système est sombre', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light');
    withColorScheme(true);

    runThemeScript();

    expect(rootClasses()).toContain('light');
    expect(rootClasses()).not.toContain('dark');
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

  it('ne pose PLUS color-scheme en style inline — la table le porte, donc sans JS aussi', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light');
    withColorScheme(true);

    runThemeScript();

    expect(document.documentElement.getAttribute('style')).toBeNull();
    expect(themeScriptSource).not.toContain('colorScheme');
  });

  /**
   * LE COOKIE EST LE MAGASIN QUE `/settings/application` PEUT ÉCRIRE, et c'est
   * la raison de sa priorité. Ces quatre témoins tiennent chacun une moitié de
   * la règle : sans le premier, un choix fait à l'écran serait perdu au
   * rechargement (le contrôle n'aurait pas d'effet) ; sans le second, un
   * lecteur venu du legacy perdrait le sien ; sans le troisième, le legacy ne
   * suivrait jamais un choix fait ici ; sans le quatrième, un cookie forgé
   * poserait sur `<html>` une classe que la table de jetons ne connaît pas.
   */
  it('le cookie l’emporte sur localStorage — sinon le choix serait perdu au rechargement', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    poseLeCookie('light');
    withColorScheme(true);

    runThemeScript();

    expect(rootClasses()).toContain('light');
    expect(rootClasses()).not.toContain('dark');
  });

  it('retombe sur localStorage quand aucun cookie n’est posé — le choix fait dans le legacy survit', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light');
    withColorScheme(true);

    runThemeScript();

    expect(rootClasses()).toContain('light');
  });

  it('MIROITE le cookie dans localStorage — c’est ce qui fait suivre le legacy', () => {
    poseLeCookie('light');
    withColorScheme(true);

    runThemeScript();

    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });

  /**
   * LE DÉFAUT QUE LE TÉMOIN NAVIGATEUR A TROUVÉ, fixé ici en jsdom une fois
   * qu'on sait où regarder : un lecteur qui avait choisi « Clair », puis
   * « comme mon système », restait clair — le miroir de `localStorage` gardait
   * l'aliment du repli.
   */
  it('« system » l’emporte sur ce que le miroir a laissé dans localStorage', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light');
    poseLeCookie('system');
    withColorScheme(true);

    runThemeScript();

    expect(rootClasses()).toContain('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('system');
  });

  it('ignore un cookie qui ne vaut ni light ni dark, et n’écrit rien', () => {
    poseLeCookie('fuchsia');
    withColorScheme(true);

    runThemeScript();

    expect(rootClasses()).toEqual(['dark']);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it('tient dans le budget de 400 octets inline', () => {
    expect(Buffer.byteLength(themeScriptSource, 'utf8')).toBeLessThanOrEqual(INLINE_BYTE_BUDGET);
  });
});
