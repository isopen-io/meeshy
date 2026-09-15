import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import SignupScreen from '@/routes/signup';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

/**
 * « LES CHAMPS APPARAISSENT UNIQUEMENT AU FUR ET À MESURE », JUSQU'AU PIXEL
 * (#6405, directive porteur 2026-09-14).
 *
 * `signup-rungs.test.ts` prouve la LOI ; celui-ci prouve qu'elle gouverne
 * l'écran — la question que ce dépôt pose à tout résolveur : « qui AFFICHE ce
 * qu'il décide ? » (CLAUDE.md § Prisme, cycle 122).
 *
 * **`onInput`, et c'est ce témoin qui l'a exigé** : sous `happy-dom`, React ne
 * voit pas un `input.value = X` suivi d'un événement `input` quand le champ
 * pose `onChange` (leçon 603, qui prévoyait exactement ce jour : « le jour où
 * il gagne un témoin interactif, il tombera dans le même panneau »). Les trois
 * champs de l'inscription et la saisie de `DerivedIdentity` sont passés à
 * `onInput`. Le témoin dispatche les DEUX événements : il reste vrai quel que
 * soit le gestionnaire, plutôt que de dépendre d'un détail que l'écran est
 * libre de changer.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/signup' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

function mount(): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<SignupScreen />);
  });
  return container;
}

function type(el: HTMLDivElement, selector: string, value: string) {
  const input = el.querySelector(selector) as HTMLInputElement;
  act(() => {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

const has = (el: HTMLDivElement, selector: string) => el.querySelector(selector) !== null;

describe('l’inscription se déplie', () => {
  test('à l’ouverture : l’adresse seule', () => {
    const el = mount();
    expect(has(el, '#signup-email')).toBe(true);
    expect(has(el, 'input[type="tel"]')).toBe(false);
    expect(has(el, '[data-derived-identity]')).toBe(false);
    expect(has(el, '#signup-password')).toBe(false);
  });

  test('une adresse INCOMPLÈTE n’ouvre rien', () => {
    const el = mount();
    type(el, '#signup-email', 'ada@');
    expect(has(el, 'input[type="tel"]')).toBe(false);
  });

  test('une adresse valide ouvre le NUMÉRO, et lui seul', () => {
    const el = mount();
    type(el, '#signup-email', 'ada@meeshy.example');
    expect(has(el, 'input[type="tel"]')).toBe(true);
    expect(has(el, '[data-derived-identity]')).toBe(false);
    expect(has(el, '#signup-password')).toBe(false);
  });

  test('taper un numéro ouvre le reste — identité dérivée, mot de passe, bouton', () => {
    const el = mount();
    type(el, '#signup-email', 'ada@meeshy.example');
    type(el, 'input[type="tel"]', '612345678');
    expect(has(el, '[data-derived-identity]')).toBe(true);
    expect(has(el, '#signup-password')).toBe(true);
    expect((el.textContent ?? '')).toContain('Créer mon compte');
  });

  test('« Je continue sans numéro » ouvre le reste SANS chiffres — le numéro reste facultatif', () => {
    const el = mount();
    type(el, '#signup-email', 'ada@meeshy.example');
    const passer = el.querySelector('[data-signup-skip-phone]') as HTMLButtonElement;
    expect(passer).not.toBeNull();
    act(() => {
      passer.click();
    });
    expect(has(el, '[data-derived-identity]')).toBe(true);
    expect((el.querySelector('input[type="tel"]') as HTMLInputElement).value).toBe('');
  });

  test('un champ paru ne se REFERME jamais — corriger son adresse ne fait pas s’effondrer le formulaire', () => {
    const el = mount();
    type(el, '#signup-email', 'ada@meeshy.example');
    type(el, 'input[type="tel"]', '612345678');
    type(el, '#signup-email', 'ada@');
    expect(has(el, 'input[type="tel"]')).toBe(true);
    expect(has(el, '[data-derived-identity]')).toBe(true);
    expect(has(el, '#signup-password')).toBe(true);
  });

  /**
   * CE QUI VIVAIT AU FOND DU FORMULAIRE — la pastille de langue, les deux pages
   * légales, « Déjà un compte ? » — paraît AVEC le troisième barreau. Ces
   * témoins venaient de `auth-screens.test.tsx`, où l'état initial les rendait
   * ; ils les suivent ici plutôt que de disparaître avec la refonte.
   */
  /** Le (i) du mot de passe fait citer sa note par `aria-describedby` : en
   * déduire `aria-invalid` annonçait « invalide » un champ facultatif que
   * personne n'avait touché (#6626, relevé en posant le (i) de l'adresse). */
  test('le mot de passe paru, vide, ne s’annonce pas invalide', () => {
    const el = mount();
    type(el, '#signup-email', 'ada@meeshy.example');
    type(el, 'input[type="tel"]', '612345678');
    const motDePasse = el.querySelector('#signup-password');
    expect(motDePasse?.getAttribute('aria-describedby')).not.toBeNull();
    expect(motDePasse?.getAttribute('aria-invalid')).toBe('false');
  });

  test('le troisième barreau porte la langue, les pages légales et le retour vers la connexion', () => {
    const el = mount();
    type(el, '#signup-email', 'ada@meeshy.example');
    type(el, 'input[type="tel"]', '612345678');
    const rendu = el.textContent ?? '';
    expect(rendu).toContain('Vous lirez Meeshy en');
    expect(el.querySelector('span[lang]')).not.toBeNull();
    expect(has(el, 'a[href="/terms"]')).toBe(true);
    expect(has(el, 'a[href="/privacy"]')).toBe(true);
    expect(el.querySelectorAll('a[href="/login"]').length).toBe(2);
  });

  test('l’identité dérivée montre ce qui PARTIRA, dès qu’elle paraît', () => {
    const el = mount();
    type(el, '#signup-email', 'ada.lovelace@meeshy.example');
    type(el, 'input[type="tel"]', '612345678');
    const identite = el.querySelector('[data-derived-identity]');
    expect((identite?.textContent ?? '').toLowerCase()).toContain('ada');
  });
});
