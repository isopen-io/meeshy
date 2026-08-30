import { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToStaticMarkup, renderToString } from 'react-dom/server';

import { DOCUMENT_LANGUAGE } from '../app/document-language';
import RootLayout from '../app/layout';
import { THEME_PAR_DEFAUT, themeScriptSource } from '../app/theme-script';

const markup = (): string => renderToStaticMarkup(<RootLayout>{null}</RootLayout>);

const runThemeScript = (): void => {
  new Function(themeScriptSource)();
};

const preferDark = (dark: boolean): void => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (media: string) => ({ media, matches: media.includes('dark') ? dark : !dark }),
  });
};

describe('la coquille racine de la v3', () => {
  it('déclare la langue du document servie par sa source unique', () => {
    expect(markup()).toContain(`<html lang="${DOCUMENT_LANGUAGE}"`);
  });

  it('déclare une langue non vide — un lecteur d\'écran ne retombe jamais sur celle de l\'agent', () => {
    expect(DOCUMENT_LANGUAGE.length).toBeGreaterThan(0);
    expect(markup()).toMatch(/<html lang="[a-z]{2}(-[A-Za-z]+)?"/);
  });

  it('pose le script de thème avant le premier pixel', () => {
    const html = markup();
    const scriptIndex = html.indexOf(themeScriptSource);
    const bodyIndex = html.indexOf('<body');

    expect(scriptIndex).toBeGreaterThan(-1);
    expect(bodyIndex).toBeGreaterThan(-1);
    expect(scriptIndex).toBeLessThan(bodyIndex);
  });

  it('rend le contenu de la page dans un body', () => {
    expect(renderToStaticMarkup(<RootLayout><p>bonjour</p></RootLayout>)).toContain(
      '<p>bonjour</p>',
    );
  });

  it('rend la classe de thème par DÉFAUT côté serveur — sans JS, Tailwind reste gouverné', () => {
    expect(markup()).toContain(`<html lang="${DOCUMENT_LANGUAGE}" class="${THEME_PAR_DEFAUT}"`);
  });

  it('ne charge aucun script externe dans la coquille', () => {
    expect(markup()).not.toContain('<script src=');
  });
});

describe("la coquille racine face à l'hydratation", () => {
  const hydrateOverServerMarkup = (): readonly string[] => {
    const errors: string[] = [];
    const consoleError = jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args.map(String).join(' '));
    });

    document.open();
    document.write(renderToString(<RootLayout><p>bonjour</p></RootLayout>));
    document.close();

    preferDark(true);
    runThemeScript();

    act(() => {
      hydrateRoot(document, <RootLayout><p>bonjour</p></RootLayout>);
    });

    consoleError.mockRestore();
    return errors;
  };

  it('garde la classe posée par le ThemeScript — le thème ne clignote pas à l\'hydratation', () => {
    hydrateOverServerMarkup();

    expect(Array.from(document.documentElement.classList)).toContain('dark');
    expect(document.documentElement.getAttribute('style')).toBeNull();
  });

  it("n'avertit d'aucune divergence sur la racine que le ThemeScript vient de muter", () => {
    const errors = hydrateOverServerMarkup();

    expect(errors.filter((message) => /hydrat/i.test(message))).toEqual([]);
  });
});
