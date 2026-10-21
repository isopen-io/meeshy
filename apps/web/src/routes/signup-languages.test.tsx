import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import SignupScreen from '@/routes/signup';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { sessionStore } from '@/lib/api/session';
import { forgetPendingVerification } from '@/lib/pending-verification';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

/**
 * L'INSCRIPTION SE LIT DANS LES SEPT LANGUES (#8348) — les libellés hérités
 * de l'écran (titre, téléphone, adresse, identité, mot de passe, parrainage,
 * pastille de langue, mentions légales, « Déjà un compte ? ») passent par le
 * catalogue, comme ceux qu'#8288 avait ajoutés. Témoin : l'écran ENTIER,
 * déplié jusqu'au parrainage, ne rend aucun libellé français — ni dans son
 * texte, ni dans un `placeholder`, un `aria-label` ou un `title`.
 */

const FRENCH = [
  'Créer votre compte',
  'Vous lirez tout le monde',
  'Téléphone',
  'Numéro de téléphone',
  'Il vous permettra',
  'Pays',
  'Adresse e-mail',
  'vous@exemple.com',
  'Pourquoi un lien',
  'Nom affiché',
  'Pseudo',
  'Mot de passe',
  'caractères',
  'Pourquoi mettre',
  'Vous pouvez activer',
  'parrainage',
  'Le code reçu',
  'Vous pouvez laisser',
  'Vous lirez Meeshy',
  'Changer',
  'En continuant',
  'Conditions d’utilisation',
  'Politique de confidentialité',
  'Déjà un compte',
  'Se connecter',
] as const;

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/signup' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await Promise.all((['en', 'es', 'pt', 'de', 'it', 'ar'] as const).map((language) => loadInterfaceCatalog(language)));
});

afterAll(async () => {
  document.documentElement.lang = 'fr';
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => {
    root.unmount();
    sessionStore.getState().clearSession();
  });
  container.remove();
  forgetPendingVerification();
  document.documentElement.lang = 'fr';
});

function type(el: HTMLElement, selector: string, value: string) {
  const input = el.querySelector(selector) as HTMLInputElement;
  act(() => {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function unfolded(language: InterfaceLanguage): HTMLElement {
  document.documentElement.lang = language;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<SignupScreen register={async () => ({ ok: false, status: 0, error: 'jamais appelé' })} />);
  });
  type(container, '#signup-phone', '0612345678');
  type(container, '#signup-email', 'ada.lovelace@meeshy.example');
  type(container, '#signup-username', 'a');
  act(() => {
    (container.querySelector('[data-signup-referral-toggle]') as HTMLElement).click();
  });
  return container;
}

function everythingRead(el: HTMLElement): string {
  const attributes = [...el.querySelectorAll('*')].flatMap((node) =>
    ['placeholder', 'aria-label', 'title'].map((name) => node.getAttribute(name) ?? ''),
  );
  return [el.textContent ?? '', ...attributes].join('\n');
}

describe('l’inscription dépliée ne rend aucun libellé français hors du français (#8348)', () => {
  for (const language of ['en', 'es', 'pt', 'de', 'it', 'ar'] as const) {
    test(language, () => {
      const el = unfolded(language);
      expect(el.querySelector('#signup-password')).not.toBeNull();
      expect(el.querySelector('#signup-referral')).not.toBeNull();
      const read = everythingRead(el);
      expect(FRENCH.filter((label) => read.includes(label))).toEqual([]);
    });
  }

  test('en allemand, les mots sont ceux d’iOS', () => {
    const el = unfolded('de');
    expect(el.querySelector('h1')?.textContent).toBe('Erstelle dein Konto');
    expect(el.querySelector('label[for="signup-phone"]')?.textContent).toBe('Telefon');
    expect(el.querySelector('label[for="signup-username"]')?.textContent).toBe('Benutzername');
    expect(el.querySelector('#signup-username-error')?.textContent).toBe('Mindestens 2 Zeichen.');
    expect(el.textContent).toContain('Schon ein Konto?');
  });

  test('en français, l’écran garde ses mots', () => {
    const el = unfolded('fr');
    expect(el.querySelector('h1')?.textContent).toBe('Créer votre compte');
    expect(el.querySelector('#signup-phone')?.getAttribute('placeholder')).toBe('Numéro de téléphone');
    expect(el.textContent).toContain('Vous lirez Meeshy en');
  });
});
