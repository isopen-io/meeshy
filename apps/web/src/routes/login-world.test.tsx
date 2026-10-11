import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import type { WorldEntry } from '@meeshy/shared/types/world';

import type { ApiResult } from '@/lib/api/http';
import { sessionStore } from '@/lib/api/session';
import { INTERFACE_LANGUAGE_KEY } from '@/lib/inline-interface-language-bootstrap.js';
import { setInterfaceLanguage } from '@/lib/interface-language';
import { LoginDoors } from '@/routes/login';
import SignupScreen from '@/routes/signup';
import { href } from '@/routes/route-table';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

/**
 * LA CONNEXION PROPOSE WORLD WIDE EN PREMIER, ET L'EN-TÊTE PUBLIC CHANGE LA
 * LANGUE (#10007, planche « Login »).
 *
 * Au-dessus de « ou avec votre compte », une carte « Entrer dans World Wide —
 * sans compte » mène au parcours invité de #10003 (`/world`). Elle ne paraît
 * plus quand `GET /world` dit qu'aucune entrée n'est ouverte. L'en-tête porte
 * le logo et le sélecteur des sept langues d'interface : choisir une langue la
 * RETIENT et l'APPLIQUE sans rechargement — l'écran se relit dans la langue
 * choisie.
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

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(async () => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
  sessionStore.getState().clearSession();
  await setInterfaceLanguage('fr');
  localStorage.removeItem(INTERFACE_LANGUAGE_KEY);
});

const servedEntry = (): WorldEntry => ({
  identifier: 'world',
  title: 'World Wide',
  shareLinkIdentifier: 'mshy_world',
  memberCount: 12,
});

const open = (): Promise<ApiResult<WorldEntry>> => Promise.resolve({ ok: true, data: servedEntry() });

const closed = (): Promise<ApiResult<WorldEntry>> =>
  Promise.resolve({ ok: false, status: 404, error: 'Aucune entrée ouverte', code: 'WORLD_UNAVAILABLE' });

const never = (): Promise<ApiResult<WorldEntry>> => new Promise(() => undefined);

async function mount(node: ReactNode): Promise<HTMLDivElement> {
  window.history.replaceState({}, '', '/login');
  const host = document.createElement('div');
  document.body.appendChild(host);
  container = host;
  root = createRoot(host);
  await act(async () => {
    root?.render(node);
  });
  return host;
}

const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/gu, ' ').trim();

/** Le catalogue de la langue choisie se charge (`import()`) AVANT qu'elle ne
 * soit posée : on attend qu'elle le soit, sans présumer d'un délai. */
async function choose(select: HTMLSelectElement, language: string): Promise<void> {
  await act(async () => {
    select.value = language;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    for (let tries = 0; tries < 200 && document.documentElement.lang !== language; tries += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  });
}

const precedes = (first: Element, second: Element) =>
  (first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

describe('/login — World Wide en premier (#10007)', () => {
  test('la carte « Entrer dans World Wide — sans compte » mène à /world, AVANT « ou avec votre compte » et le champ e-mail', async () => {
    const el = await mount(<LoginDoors method="lien" world={{ load: open }} />);
    const card = el.querySelector('a[data-login-world]');
    expect(card).not.toBeNull();
    expect(card?.getAttribute('href')).toBe(href('world'));
    expect(text(card)).toContain('Entrer dans World Wide');
    expect(text(card)).toContain('Sans compte · votre nom et votre langue');

    const separator = el.querySelector('[data-login-world-separator]');
    expect(text(separator)).toBe('ou avec votre compte');

    const email = el.querySelector('#magic-link-email');
    expect(email).not.toBeNull();
    if (card === null || separator === null || email === null) return;
    expect(precedes(card, separator)).toBe(true);
    expect(precedes(separator, email)).toBe(true);
  });

  test('la carte paraît SANS attendre le réseau : la lecture de GET /world ne la retient pas', async () => {
    const el = await mount(<LoginDoors method="lien" world={{ load: never }} />);
    expect(el.querySelector('a[data-login-world]')).not.toBeNull();
  });

  test('la porte du mot de passe la propose aussi, en tête', async () => {
    const el = await mount(<LoginDoors method="password" world={{ load: open }} />);
    const card = el.querySelector('a[data-login-world]');
    const username = el.querySelector('#login-username');
    expect(card).not.toBeNull();
    if (card === null || username === null) throw new Error('carte ou identifiant absent');
    expect(precedes(card, username)).toBe(true);
  });

  test('GET /world répond WORLD_UNAVAILABLE : ni carte, ni séparateur', async () => {
    const el = await mount(<LoginDoors method="lien" world={{ load: closed }} />);
    expect(el.querySelector('a[data-login-world]')).toBeNull();
    expect(el.querySelector('[data-login-world-separator]')).toBeNull();
    expect(el.querySelector('#magic-link-email')).not.toBeNull();
  });

  test('pendant le second facteur, la carte se tait : l’écran ne propose que le code', async () => {
    sessionStore.getState().beginTwoFactor({
      user: { id: 'u1', username: 'ada', email: 'ada@example.com', firstName: 'Ada', lastName: 'L', displayName: 'Ada', avatar: '' },
      twoFactorToken: 'jeton-2fa',
    });
    const el = await mount(<LoginDoors method="lien" world={{ load: open }} />);
    expect(el.querySelector('#login-2fa-code')).not.toBeNull();
    expect(el.querySelector('a[data-login-world]')).toBeNull();
    expect(el.querySelector('[data-login-world-separator]')).toBeNull();
  });
});

describe('l’en-tête public change la langue d’interface (#10007)', () => {
  test('la connexion porte le sélecteur des sept langues, chacune dans sa propre langue — et pas l’icône d’application', async () => {
    const el = await mount(<LoginDoors method="lien" world={{ load: open }} />);
    const header = el.querySelector('[data-public-header]');
    expect(header).not.toBeNull();
    expect(el.innerHTML).not.toContain('/brand/logo.png');

    const select = header?.querySelector('select[data-interface-language]') as HTMLSelectElement | null;
    expect(select).not.toBeNull();
    expect(select?.value).toBe('fr');
    const options = Array.from(select?.options ?? []).map((option) => [option.value, option.textContent, option.lang]);
    expect(options).toEqual([
      ['fr', 'Français', 'fr'],
      ['en', 'English', 'en'],
      ['es', 'Español', 'es'],
      ['pt', 'Português', 'pt'],
      ['de', 'Deutsch', 'de'],
      ['it', 'Italiano', 'it'],
      ['ar', 'العربية', 'ar'],
    ]);
    expect(select?.getAttribute('aria-label') ?? text(select?.closest('label') ?? null)).toContain('Langue');
  });

  test('choisir « English » retient le choix et relit l’écran en anglais, sans rechargement', async () => {
    const el = await mount(<LoginDoors method="lien" world={{ load: open }} />);
    const select = el.querySelector('select[data-interface-language]') as HTMLSelectElement;
    await choose(select, 'en');

    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem(INTERFACE_LANGUAGE_KEY)).toBe('en');
    expect(text(el.querySelector('a[data-login-world]'))).toContain('Enter World Wide');
    expect(text(el.querySelector('[data-login-world-separator]'))).toBe('or with your account');
    expect(text(el)).toContain('Your email address');
    expect(text(el)).not.toContain('Votre adresse e-mail');
    expect((el.querySelector('select[data-interface-language]') as HTMLSelectElement).value).toBe('en');
  });

  test('le sélecteur montre le choix TOUT DE SUITE, pendant que le catalogue de la langue se charge', async () => {
    const el = await mount(<LoginDoors method="lien" world={{ load: open }} />);
    const select = el.querySelector('select[data-interface-language]') as HTMLSelectElement;
    act(() => {
      select.value = 'de';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(document.documentElement.lang).toBe('fr');
    expect((el.querySelector('select[data-interface-language]') as HTMLSelectElement).value).toBe('de');

    await choose(select, 'de');
    expect((el.querySelector('select[data-interface-language]') as HTMLSelectElement).value).toBe('de');
  });

  test('l’arabe retourne la page : `dir="rtl"` posé avec la langue', async () => {
    const el = await mount(<LoginDoors method="password" world={{ load: open }} />);
    const select = el.querySelector('select[data-interface-language]') as HTMLSelectElement;
    await choose(select, 'ar');
    expect(document.documentElement.lang).toBe('ar');
    expect(document.documentElement.dir).toBe('rtl');
    expect(text(el)).not.toContain('Mot de passe oublié');
  });

  test('l’inscription porte le même en-tête — sa croix vers la connexion, la marque vers l’accueil et la langue', async () => {
    const el = await mount(
      <SignupScreen referralDeps={{ validate: async () => ({ ok: false, status: 0, error: 'hors sujet' }) }} />,
    );
    const header = el.querySelector('[data-public-header]');
    expect(header).not.toBeNull();
    expect(header?.querySelector('select[data-interface-language]')).not.toBeNull();
    const home = header?.querySelector('a[data-public-home]');
    expect(home?.getAttribute('href')).toBe('/');
    expect(home?.querySelectorAll('line')).toHaveLength(3);
    expect(header?.querySelector('a[aria-label="Fermer"]')?.getAttribute('href')).toBe(href('login'));
  });
});

describe('sur un téléphone court, la porte du mot de passe tient dans la vue (#10007)', () => {
  const withViewportHeight = async (height: number, body: () => Promise<void>) => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => {
      const bound = /max-height:\s*(\d+)px/u.exec(query);
      const matches = bound !== null && height <= Number(bound[1]);
      return {
        matches,
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      };
    }) as typeof window.matchMedia;
    try {
      await body();
    } finally {
      window.matchMedia = original;
    }
  };

  test('à 667 px de haut, le blason cède la place à World Wide', async () => {
    await withViewportHeight(667, async () => {
      const el = await mount(<LoginDoors method="password" world={{ load: open }} />);
      expect(el.querySelector('h1')).toBeNull();
      expect(el.querySelector('a[data-login-world]')).not.toBeNull();
      expect(el.querySelector('#login-username')).not.toBeNull();
    });
  });

  test('à 844 px de haut, le blason reste', async () => {
    await withViewportHeight(844, async () => {
      const el = await mount(<LoginDoors method="password" world={{ load: open }} />);
      expect(text(el.querySelector('h1'))).toBe('Meeshy');
    });
  });

  test('le second facteur garde le blason, même court : il dit de qui vient la demande de code', async () => {
    sessionStore.getState().beginTwoFactor({
      user: { id: 'u1', username: 'ada', email: 'ada@example.com', firstName: 'Ada', lastName: 'L', displayName: 'Ada', avatar: '' },
      twoFactorToken: 'jeton-2fa',
    });
    await withViewportHeight(667, async () => {
      const el = await mount(<LoginDoors method="password" world={{ load: open }} />);
      expect(text(el.querySelector('h1'))).toBe('Meeshy');
    });
  });
});
