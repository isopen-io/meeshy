import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import SignupScreen from '@/routes/signup';
import { PASSWORD_MIN } from '@/lib/signup-form';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

/**
 * L'INSCRIPTION SE DÉPLIE EN DEUX TEMPS, JUSQU'AU PIXEL (#6582, directive
 * porteur 2026-09-14).
 *
 * `signup-rungs.test.ts` prouve la LOI ; celui-ci prouve qu'elle gouverne
 * l'écran — la question que ce dépôt pose à tout résolveur : « qui AFFICHE ce
 * qu'il décide ? » (CLAUDE.md § Prisme, cycle 122).
 *
 * **`onInput`, et c'est ce témoin qui l'a exigé** : sous `happy-dom`, React ne
 * voit pas un `input.value = X` suivi d'un événement `input` quand le champ
 * pose `onChange` (leçon 603). Le témoin dispatche les DEUX événements : il
 * reste vrai quel que soit le gestionnaire, plutôt que de dépendre d'un détail
 * que l'écran est libre de changer.
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
const text = (el: HTMLDivElement) => (el.textContent ?? '').replace(/\s+/gu, ' ');

describe('à l’ouverture : le CONTACT en entier', () => {
  test('l’adresse ET le numéro sont là dès la première seconde', () => {
    const el = mount();
    expect(has(el, '#signup-email')).toBe(true);
    expect(has(el, 'input[type="tel"]')).toBe(true);
  });

  test('rien de l’identité — ni bloc dérivé, ni mot de passe, ni bouton', () => {
    const el = mount();
    expect(has(el, '[data-derived-identity]')).toBe(false);
    expect(has(el, '#signup-password')).toBe(false);
    expect(text(el)).not.toContain('Créer mon compte');
  });

  /**
   * « PAS D'ÉTAPE 1 SUR N » — la jauge de #6405 et son compte sont retirés :
   * ce qu'on ne compte plus, on n'a plus à l'annoncer.
   */
  test('aucune jauge, aucun compte d’étapes', () => {
    const el = mount();
    expect(text(el)).not.toContain('Étape');
    expect(has(el, '[data-signup-step]')).toBe(false);
  });

  /** Il n'y a plus rien à passer : le numéro est visible, donc facultatif à l'œil. */
  test('plus de bouton « Je continue sans numéro »', () => {
    expect(has(mount(), '[data-signup-skip-phone]')).toBe(false);
  });
});

describe('l’adresse valide ouvre l’identité, DIRECTEMENT', () => {
  test('une adresse INCOMPLÈTE n’ouvre rien', () => {
    const el = mount();
    type(el, '#signup-email', 'ada@');
    expect(has(el, '[data-derived-identity]')).toBe(false);
  });

  test('une adresse valide suffit — aucun geste sur le numéro n’est demandé', () => {
    const el = mount();
    type(el, '#signup-email', 'ada@meeshy.example');
    expect(has(el, '[data-derived-identity]')).toBe(true);
    expect(has(el, '#signup-password')).toBe(true);
    expect(text(el)).toContain('Créer mon compte');
  });

  /**
   * LE TÉMOIN DU MOT DE PASSE A PERDU SON SUJET, ET C'EST VOLONTAIRE (fusion
   * 2026-09-15).
   *
   * #6626 tenait sa règle — `aria-invalid` suit le REFUS, jamais la seule
   * présence d'un `aria-describedby` — par DEUX témoins : l'adresse
   * (`signup-identity.test.tsx`) et le mot de passe, ici. Le second exigeait
   * que le mot de passe CITE une note, ce qu'il faisait par son (i) de #6441.
   *
   * #6583 a remplacé ce (i) par une CONSÉQUENCE visible
   * (`[data-signup-password-effect]`, témoin plus bas) : le champ ne cite plus
   * rien tant qu'on ne le refuse pas. Réécrit sur ce champ, le témoin serait
   * VIDE — sans note citée, `describedBy` est indéfini, donc la déduction
   * fautive rendrait « false » elle aussi, et le témoin resterait vert sur la
   * régression même qu'il surveille (leçon 611).
   *
   * La règle reste donc tenue par le témoin de l'ADRESSE, qui garde son (i) et
   * où la déduction fautive rougirait. La règle elle-même est intacte dans
   * `signup.tsx` : `aria-invalid={feedback.fieldErrors.password !== undefined}`.
   */

  const valeur = (el: HTMLDivElement, selector: string) => (el.querySelector(selector) as HTMLInputElement | null)?.value;

  test('l’identité dérivée montre ce qui PARTIRA, dès qu’elle paraît — déjà en saisie (#7897)', () => {
    const el = mount();
    type(el, '#signup-email', 'ada.lovelace@meeshy.example');
    expect(valeur(el, '#signup-first-name')).toBe('Ada');
    expect(valeur(el, '#signup-last-name')).toBe('Lovelace');
    expect(valeur(el, '#signup-display-name')).toBe('Ada Lovelace');
    expect(valeur(el, '#signup-username')).toBe('ada-lovelace');
  });

  test('tout se met à jour EN DIRECT : le prénom touché recompose le nom affiché (#7897)', () => {
    const el = mount();
    type(el, '#signup-email', 'ada.lovelace@meeshy.example');
    type(el, '#signup-first-name', 'Augusta');
    expect(valeur(el, '#signup-display-name')).toBe('Augusta Lovelace');
    type(el, '#signup-email', 'ada.byron@meeshy.example');
    expect(valeur(el, '#signup-first-name')).toBe('Augusta');
    expect(valeur(el, '#signup-last-name')).toBe('Byron');
    expect(valeur(el, '#signup-display-name')).toBe('Augusta Byron');
    expect(valeur(el, '#signup-username')).toBe('ada-byron');
  });

  test('un champ paru ne se REFERME jamais — corriger son adresse ne fait pas s’effondrer le formulaire', () => {
    const el = mount();
    type(el, '#signup-email', 'ada@meeshy.example');
    type(el, '#signup-email', 'ada@');
    expect(has(el, '[data-derived-identity]')).toBe(true);
    expect(has(el, '#signup-password')).toBe(true);
  });

  /**
   * CE QUI VIVAIT AU FOND DU FORMULAIRE — la pastille de langue, les deux
   * pages légales, « Déjà un compte ? » — paraît AVEC le second barreau.
   */
  test('le second barreau porte la langue, les pages légales et le retour vers la connexion', () => {
    const el = mount();
    type(el, '#signup-email', 'ada@meeshy.example');
    expect(text(el)).toContain('Vous lirez Meeshy en');
    expect(el.querySelector('span[lang]')).not.toBeNull();
    expect(has(el, 'a[href="/terms"]')).toBe(true);
    expect(has(el, 'a[href="/privacy"]')).toBe(true);
    expect(el.querySelectorAll('a[href="/login"]').length).toBe(2);
  });
});

/**
 * LE MOT DE PASSE (#6582) — « sans le (facultatif) : le fait que le bouton
 * créer mon compte fonctionne est suffisant pour dire qu'on peut créer le
 * compte sans mot de passe ».
 */
describe('le mot de passe ne s’annonce pas facultatif — il se PROUVE', () => {
  function openIdentity(): HTMLDivElement {
    const el = mount();
    type(el, '#signup-email', 'ada@meeshy.example');
    return el;
  }

  test('le libellé ne porte plus « (facultatif) »', () => {
    expect(text(openIdentity())).not.toContain('facultatif');
  });

  test('le bouton est ACTIF sans mot de passe — c’est lui qui le dit', () => {
    const el = openIdentity();
    const bouton = el.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(bouton.disabled).toBe(false);
  });

  test('un mot de passe TROP COURT n’est pas « valide » — le champ ne verdit pas', () => {
    const el = openIdentity();
    type(el, '#signup-password', 'a'.repeat(PASSWORD_MIN - 1));
    expect(has(el, '[data-field-state="valid"]')).toBe(false);
  });

  test('un mot de passe qui TIENT la borne entoure le champ en vert, et dit ce que ça change', () => {
    const el = openIdentity();
    type(el, '#signup-password', 'a'.repeat(PASSWORD_MIN));
    const verdi = el.querySelector('[data-field-state="valid"]');
    expect(verdi).not.toBeNull();
    expect(el.querySelector('#signup-password')?.closest('[data-field-state="valid"]')).toBe(verdi);
    expect(text(el)).toContain('actif');
  });

  test('sans mot de passe, l’écran dit que le compte restera à configurer', () => {
    expect(text(openIdentity())).toContain('à configurer');
  });
});
