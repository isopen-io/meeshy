import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { loadInterfaceCatalog, translate } from '@/lib/i18n-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from '@/lib/inline-interface-language-bootstrap.js';
import { setInterfaceLanguage } from '@/lib/interface-language';
import { APP_STORE_URL, GOOGLE_PLAY_URL } from '@/lib/store-links';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { AuthHeader } from './auth-header';
import { AuthSiteFooter, googlePlayBadgeSrc } from './auth-site-footer';
import { EmailSentNotice, SpamFolderHint } from './email-sent-notice';
import { SignupIdentityCard } from './signup-identity-card';

/**
 * UN EN-TÊTE POUR TOUTES LES PAGES D'ACCÈS, LES INDÉSIRABLES DITS EN CLAIR, ET
 * LES APPLIS PROPOSÉES SUR LE WEB SEULEMENT (#16452).
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/login' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(async () => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  await setInterfaceLanguage('fr');
});

async function mount(node: ReactNode): Promise<HTMLDivElement> {
  const el = document.createElement('div');
  document.body.appendChild(el);
  host = el;
  root = createRoot(el);
  await act(async () => root?.render(node));
  return el;
}

describe('AuthHeader — retour, marque puis langue, dans cet ordre', () => {
  test('le retour `<` referme vers l’écran désigné, nommé « Retour », avec le chevron retourné en RTL', async () => {
    const el = await mount(<AuthHeader back="login" backSearch={{ email: 'ada@meeshy.example' }} />);
    const back = el.querySelector<HTMLAnchorElement>('[data-auth-header] a[data-auth-back]');
    expect(back?.getAttribute('href')).toBe('/login?email=ada%40meeshy.example');
    expect(back?.getAttribute('aria-label')).toBe('Retour');
    expect(back?.querySelector('svg')?.getAttribute('class')).toContain('rtl:-scale-x-100');
    expect(el.querySelector('a[aria-label="Fermer"]')).toBeNull();
  });

  test('le logo SUIVI du nom « Meeshy » est UN lien vers `/`', async () => {
    const el = await mount(<AuthHeader back="login" />);
    const home = el.querySelector<HTMLAnchorElement>('a[data-auth-home]');
    expect(home?.getAttribute('href')).toBe('/');
    expect(home?.querySelectorAll('line')).toHaveLength(3);
    expect(home?.textContent?.trim()).toBe('Meeshy');
    expect(home?.getAttribute('aria-label')).toContain('Meeshy');
  });

  test('ordre : retour, marque, sélecteur de langue — puis le titre, qui ouvre le contenu', async () => {
    const el = await mount(<AuthHeader back="login" title="Connexion par e-mail" />);
    const header = el.querySelector('[data-auth-header]');
    const order = [...(header?.querySelectorAll('[data-auth-back], [data-auth-home], select[data-interface-language]') ?? [])].map((node) =>
      node.hasAttribute('data-auth-back') ? 'back' : node.hasAttribute('data-auth-home') ? 'home' : 'language',
    );
    expect(order).toEqual(['back', 'home', 'language']);
    expect(header?.nextElementSibling?.tagName).toBe('H1');
    expect(header?.nextElementSibling?.textContent).toBe('Connexion par e-mail');
  });

  test('choisir une langue relit l’en-tête dans cette langue', async () => {
    const el = await mount(<AuthHeader back="login" />);
    const select = el.querySelector<HTMLSelectElement>('select[data-interface-language]');
    await act(async () => {
      if (select === null) return;
      select.value = 'en';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      for (let tries = 0; tries < 200 && document.documentElement.lang !== 'en'; tries += 1) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    });
    expect(el.querySelector('a[data-auth-back]')?.getAttribute('aria-label')).toBe('Back');
  });

  test('la coque tait le sélecteur, garde le retour et la marque', () => {
    const html = renderToStaticMarkup(<AuthHeader back="login" languageChoice={false} />);
    expect(html).toContain('data-auth-back');
    expect(html).toContain('data-auth-home');
    expect(html).not.toContain('data-interface-language');
  });

  test('chaque cible fait 44 px au moins', async () => {
    const el = await mount(<AuthHeader back="login" />);
    for (const target of el.querySelectorAll<HTMLElement>('[data-auth-back], [data-auth-home]')) {
      expect(target.style.minHeight).toBe('44px');
    }
  });
});

describe('les indésirables, dits EN CLAIR dès qu’un e-mail part', () => {
  test('« E-mail envoyé » le dit, visible, sans (i) à ouvrir', async () => {
    const el = await mount(<EmailSentNotice email="ada@meeshy.example" />);
    const hint = el.querySelector('[data-spam-hint]');
    expect(hint?.textContent).toBe('Rien reçu ? Regardez aussi dans vos spams ou courriers indésirables.');
    expect(hint?.closest('.sr-only')).toBeNull();
    expect(el.querySelector('button[aria-expanded]')).toBeNull();
  });

  test('le code envoyé pendant l’inscription le dit aussi', async () => {
    const el = await mount(
      <SignupIdentityCard
        language="fr"
        verification={{ kind: 'awaiting-code', email: 'ada@meeshy.example', pendingSessionToken: null, signedIn: false }}
        identity={null}
        refusals={null}
        extra={null}
        canValidate={false}
        isValidating={false}
        onValidateNow={() => undefined}
        onVerified={() => undefined}
        codeDeps={{
          verifyEmail: async () => ({ ok: false, status: 0, error: 'hors sujet' }),
          verificationStatus: async () => ({ ok: false, status: 0, error: 'hors sujet' }),
        }}
      />,
    );
    expect(el.querySelector('[data-signup-code] [data-spam-hint]')?.textContent).toBe(
      'Rien reçu ? Regardez aussi dans vos spams ou courriers indésirables.',
    );
  });

  test('la phrase existe, traduite et distincte, dans chaque langue d’interface', async () => {
    const texts = await Promise.all(
      SUPPORTED_INTERFACE_LANGUAGES.map(async (language) => {
        await loadInterfaceCatalog(language);
        return renderToStaticMarkup(<SpamFolderHint language={language} />);
      }),
    );
    expect(new Set(texts).size).toBe(SUPPORTED_INTERFACE_LANGUAGES.length);
  });
});

describe('AuthSiteFooter — les applis et les pages du site, sur le WEB seulement', () => {
  test('la coque Capacitor ne rend RIEN', () => {
    expect(renderToStaticMarkup(<AuthSiteFooter shell />)).toBe('');
  });

  test('le web montre les deux badges officiels, vers les vraies fiches, au texte alternatif traduit', async () => {
    const el = await mount(<AuthSiteFooter shell={false} />);
    const appStore = el.querySelector<HTMLAnchorElement>('a[data-store="app-store"]');
    const play = el.querySelector<HTMLAnchorElement>('a[data-store="google-play"]');
    expect(appStore?.getAttribute('href')).toBe(APP_STORE_URL);
    expect(play?.getAttribute('href')).toBe(GOOGLE_PLAY_URL);
    expect(GOOGLE_PLAY_URL).toContain('id=me.meeshy.app');
    expect(appStore?.querySelector('img')?.getAttribute('alt')).toBe('Télécharger dans l’App Store');
    expect(play?.querySelector('img')?.getAttribute('alt')).toBe('Disponible sur Google Play');
    expect(play?.querySelector('img')?.getAttribute('src')).toBe('/store-badges/google-play-fr.png');
    for (const link of [appStore, play]) {
      expect(link?.getAttribute('target')).toBe('_blank');
      expect(link?.getAttribute('rel')).toContain('noopener');
    }
  });

  test('le badge Google Play suit la langue d’interface', async () => {
    await setInterfaceLanguage('de');
    const el = await mount(<AuthSiteFooter shell={false} />);
    expect(el.querySelector('a[data-store="google-play"] img')?.getAttribute('src')).toBe('/store-badges/google-play-de.png');
    expect(el.querySelector('a[data-store="google-play"] img')?.getAttribute('alt')).toBe('Jetzt bei Google Play');
  });

  test('les cinq pages du site, dans cet ordre, en cibles de 44 px', async () => {
    const el = await mount(<AuthSiteFooter shell={false} />);
    const nav = el.querySelector('footer nav');
    expect(nav?.getAttribute('aria-label')).toBe('Informations');
    const links = [...(nav?.querySelectorAll<HTMLAnchorElement>('a') ?? [])];
    expect(links.map((a) => [a.getAttribute('href'), a.textContent])).toEqual([
      ['/terms', 'Conditions d’utilisation'],
      ['/privacy', 'Politique de confidentialité'],
      ['/contact', 'Contact'],
      ['/help', 'Aide'],
      ['/about', 'À propos'],
    ]);
    for (const link of links) expect(link.style.minHeight).toBe('44px');
  });

  test('un badge Google Play existe pour chaque langue d’interface', async () => {
    const { existsSync } = await import('node:fs');
    const publicDir = new URL('../../public', import.meta.url).pathname;
    for (const language of SUPPORTED_INTERFACE_LANGUAGES) {
      expect(existsSync(`${publicDir}${googlePlayBadgeSrc(language)}`)).toBe(true);
    }
    expect(existsSync(`${publicDir}/store-badges/app-store-en.svg`)).toBe(true);
  });

  test('chaque libellé du pied est traduit dans chaque langue, jamais recopié du français', async () => {
    const keys = ['authFooter.apps', 'authFooter.links', 'authFooter.terms', 'authFooter.privacy', 'authFooter.help', 'authFooter.about'] as const;
    await Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map((language) => loadInterfaceCatalog(language)));
    for (const key of keys) {
      const values = SUPPORTED_INTERFACE_LANGUAGES.map((language) => translate(language, key));
      expect(new Set(values).size).toBe(SUPPORTED_INTERFACE_LANGUAGES.length);
    }
  });
});
