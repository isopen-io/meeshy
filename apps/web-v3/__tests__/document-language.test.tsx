import { renderToStaticMarkup } from 'react-dom/server';

import RootLayout from '../app/layout';
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE_NAME,
  RTL_LOCALES,
  documentDir,
  parseAcceptLanguage,
  resolveDocumentLocale,
} from '../lib/a11y/lang-attr';

const request = { cookie: null as string | null, acceptLanguage: null as string | null };

jest.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'meeshy-interface-language' && requestState().cookie !== null
        ? { name, value: requestState().cookie as string }
        : undefined,
  }),
  headers: async () => ({
    get: (name: string) =>
      name.toLowerCase() === 'accept-language' ? requestState().acceptLanguage : null,
  }),
}));

function requestState(): typeof request {
  return request;
}

const serve = async (signals: {
  readonly cookie?: string | null;
  readonly acceptLanguage?: string | null;
}): Promise<string> => {
  request.cookie = signals.cookie ?? null;
  request.acceptLanguage = signals.acceptLanguage ?? null;
  return renderToStaticMarkup(await RootLayout({ children: <p>contenu</p> }));
};

const htmlAttributes = (markup: string): string => markup.slice(0, markup.indexOf('>') + 1);

describe('le HTML SERVI par la coquille racine', () => {
  it('annonce la langue negociee par le navigateur, pas une langue en dur', async () => {
    expect(htmlAttributes(await serve({ acceptLanguage: 'en-GB,en;q=0.9' }))).toContain('lang="en"');
  });

  it('annonce le francais quand le navigateur le demande', async () => {
    expect(htmlAttributes(await serve({ acceptLanguage: 'fr-CA,fr;q=0.9,en;q=0.5' }))).toContain(
      'lang="fr"',
    );
  });

  it('fait gagner le choix persiste sur la negociation du navigateur', async () => {
    const markup = await serve({ cookie: 'es', acceptLanguage: 'de,en;q=0.9' });

    expect(htmlAttributes(markup)).toContain('lang="es"');
  });

  it('retombe sur la langue par defaut quand aucun signal n est lisible', async () => {
    expect(htmlAttributes(await serve({}))).toContain(`lang="${DEFAULT_LOCALE}"`);
  });

  it('pose toujours une direction d ecriture explicite', async () => {
    expect(htmlAttributes(await serve({ acceptLanguage: 'fr' }))).toContain('dir="ltr"');
  });
});

describe('la resolution de la langue du document', () => {
  it('ignore un cookie qui ne nomme pas une langue servie', () => {
    expect(resolveDocumentLocale({ cookie: 'kl', acceptLanguage: 'pt-BR' })).toBe('pt');
  });

  it('honore les poids de qualite de Accept-Language', () => {
    expect(parseAcceptLanguage('de;q=0.2,it;q=0.9')).toBe('it');
  });

  it('ne rend rien quand aucune langue demandee n est servie', () => {
    expect(parseAcceptLanguage('ja,ko;q=0.8')).toBeNull();
  });

  it('lit le meme cookie que la zone legacy, pour que le choix suive la frontiere', () => {
    expect(LOCALE_COOKIE_NAME).toBe('meeshy-interface-language');
  });
});

describe('la direction d ecriture', () => {
  it('rend rtl pour les locales RTL, des maintenant', () => {
    expect(documentDir('ar')).toBe('rtl');
    expect(RTL_LOCALES.has('ar')).toBe(true);
  });

  it('rend ltr pour toute locale servie aujourd hui', () => {
    expect(documentDir('fr')).toBe('ltr');
    expect(documentDir('en')).toBe('ltr');
  });
});
