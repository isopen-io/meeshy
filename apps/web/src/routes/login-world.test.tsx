import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { sessionStore } from '@/lib/api/session';
import { INTERFACE_LANGUAGE_KEY } from '@/lib/inline-interface-language-bootstrap.js';
import { setInterfaceLanguage } from '@/lib/interface-language';
import { LoginDoors } from '@/routes/login';
import SignupScreen from '@/routes/signup';
import { href } from '@/routes/route-table';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

/**
 * LA CONNEXION S'OUVRE SUR LA CONNEXION, ET L'EN-TÊTE PUBLIC CHANGE LA
 * LANGUE (#10007, planche « Login »).
 *
 * La carte « Entrer dans World Wide — sans compte » qui la précédait est
 * retirée (#10784, directive porteur du 2026-10-16) : l'entrée anonyme ne
 * passe plus que par le QR de meeshy.me, qui mène à `/world`. L'en-tête porte
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

describe('/login ne propose plus World Wide (#10784)', () => {
  for (const method of ['lien', 'password'] as const) {
    test(`porte « ${method} » : ni carte World Wide, ni séparateur, ni lien vers /world — l’écran s’ouvre sur la connexion`, async () => {
      const el = await mount(<LoginDoors method={method} />);
      expect(el.querySelector('[data-login-world]')).toBeNull();
      expect(el.querySelector('[data-login-world-separator]')).toBeNull();
      expect(el.querySelector(`a[href="${href('world')}"]`)).toBeNull();
      expect(text(el)).not.toContain('World Wide');
      expect(el.querySelector(method === 'lien' ? '#magic-link-email' : '#login-username')).not.toBeNull();
    });
  }
});

describe('l’en-tête public change la langue d’interface (#10007)', () => {
  test('la connexion porte le sélecteur des sept langues, chacune dans sa propre langue — et pas l’icône d’application', async () => {
    const el = await mount(<LoginDoors method="lien" />);
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
    const el = await mount(<LoginDoors method="lien" />);
    const select = el.querySelector('select[data-interface-language]') as HTMLSelectElement;
    await choose(select, 'en');

    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem(INTERFACE_LANGUAGE_KEY)).toBe('en');
    expect(text(el)).toContain('Your email address');
    expect(text(el)).not.toContain('Votre adresse e-mail');
    expect((el.querySelector('select[data-interface-language]') as HTMLSelectElement).value).toBe('en');
  });

  test('le sélecteur montre le choix TOUT DE SUITE, pendant que le catalogue de la langue se charge', async () => {
    const el = await mount(<LoginDoors method="lien" />);
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
    const el = await mount(<LoginDoors method="password" />);
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

  test('à 667 px de haut, le blason cède la place aux champs', async () => {
    await withViewportHeight(667, async () => {
      const el = await mount(<LoginDoors method="password" />);
      expect(el.querySelector('h1')).toBeNull();
      expect(el.querySelector('#login-username')).not.toBeNull();
    });
  });

  test('à 844 px de haut, le blason reste', async () => {
    await withViewportHeight(844, async () => {
      const el = await mount(<LoginDoors method="password" />);
      expect(text(el.querySelector('h1'))).toBe('Meeshy');
    });
  });

  test('le second facteur garde le blason, même court : il dit de qui vient la demande de code', async () => {
    sessionStore.getState().beginTwoFactor({
      user: { id: 'u1', username: 'ada', email: 'ada@example.com', firstName: 'Ada', lastName: 'L', displayName: 'Ada', avatar: '' },
      twoFactorToken: 'jeton-2fa',
    });
    await withViewportHeight(667, async () => {
      const el = await mount(<LoginDoors method="password" />);
      expect(text(el.querySelector('h1'))).toBe('Meeshy');
    });
  });
});
