import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { LoginDoors, loginMethodFromSearch } from '@/routes/login';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { controlledBy, perceivableText as perceivable } from '@/test-support/perceivable-text';

/**
 * LES DEUX PORTES DE `/login` (#6404) — directive porteur 2026-09-13 :
 * « connexion par magic link comme connexion par défaut pour le moment »,
 * « proposer l'option se connecter avec identifiant (e-mail, téléphone,
 * pseudo) et mot de passe ».
 *
 * Le choix vit dans l'ADRESSE (`?methode=password` depuis #6583 ; `motdepasse`
 * reste LU, voir le témoin du bas), jamais dans un état
 * local : le retour arrière le rend, un lien le partage, et une recette ouvre
 * directement l'une des deux portes. Le témoin monte donc l'écran à une
 * adresse DONNÉE, comme le fait le routeur.
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

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

/** L'écran MOINS la lecture d'adresse — `LoginScreen` n'ajoute que
 * `loginMethodFromSearch(search)`, prouvé à part juste en dessous. Monter le
 * routeur entier (ses chunks paresseux, son préalable de catalogue) pour lire
 * deux `<input>` coûterait cher et ne prouverait rien de plus. */
function mountAt(url: string): HTMLDivElement {
  const search = new URL(url, 'http://localhost').searchParams;
  window.history.replaceState({}, '', url);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<LoginDoors method={loginMethodFromSearch(search.get('methode'))} />);
  });
  return container;
}

const text = (el: HTMLElement) => (el.textContent ?? '').replace(/\s+/gu, ' ');

describe('/login — la porte PAR DÉFAUT est la connexion par e-mail (#6626)', () => {
  test('sans paramètre : le champ e-mail et « Recevoir le lien », jamais un champ mot de passe', () => {
    const el = mountAt('/login');
    expect(el.querySelector('#magic-link-email')).not.toBeNull();
    expect(text(el)).toContain('Votre adresse e-mail');
    expect(text(el)).toContain('Recevoir le lien');
    expect(el.querySelector('#login-password')).toBeNull();
  });

  test('le mode de fonctionnement est derrière un (i) « Comment ça marche », replié par défaut', () => {
    const el = mountAt('/login');
    const info = el.querySelector('button[aria-label="Comment ça marche"]') as HTMLButtonElement | null;
    expect(info).not.toBeNull();
    expect(info?.getAttribute('aria-expanded')).toBe('false');
    const note = controlledBy(info);
    expect(note?.textContent).toBe('Pas de mot de passe à retenir : nous vous envoyons un lien par e-mail. Ouvrez-le et vous êtes connecté.');
    expect(note?.classList.contains('sr-only')).toBe(true);

    act(() => {
      info?.click();
    });
    expect(info?.getAttribute('aria-expanded')).toBe('true');
    expect(note?.classList.contains('sr-only')).toBe(false);
  });

  test('aucun libellé perçu ne dit « magique » — la baguette reste, le mot part', () => {
    const el = mountAt('/login');
    expect(perceivable(el)).not.toMatch(/magi(que|c)/iu);
    expect(el.querySelector('form svg')).not.toBeNull();
  });

  test('l’autre porte est NOMMÉE, et mène à l’adresse qui la porte', () => {
    const el = mountAt('/login');
    const lien = [...el.querySelectorAll('a')].find((a) => (a.textContent ?? '').includes('identifiant'));
    expect(lien).toBeDefined();
    expect(lien?.getAttribute('href')).toBe('/login?methode=password');
  });

  /**
   * « LA PAGE SANS TITRE SAUF LA BAGUETTE » (#6583, directive porteur
   * 2026-09-14) — c'est le BLASON qui part : la marque et son mot, répétés à
   * qui vient de cliquer « Se connecter ». « Votre adresse e-mail » reste : ce
   * titre de CHAMP est ce que #6626 a raccourci le lendemain, au nom de la
   * même exigence de sobriété.
   */
  test('aucun blason de marque — le glyphe des trois traits ne paraît pas', () => {
    const el = mountAt('/login');
    expect(el.querySelectorAll('line')).toHaveLength(0);
    expect(el.querySelector('h1')).toBeNull();
  });

  test('la porte du mot de passe, elle, GARDE son blason — elle n’a pas de baguette', () => {
    const el = mountAt('/login?methode=password');
    expect(el.querySelectorAll('line')).toHaveLength(3);
  });
});

describe('/login?methode=password — l’identifiant et le mot de passe', () => {
  test('les deux champs, et l’identifiant DIT ce qu’il accepte', () => {
    const el = mountAt('/login?methode=password');
    const identifiant = el.querySelector('#login-username') as HTMLInputElement | null;
    expect(identifiant).not.toBeNull();
    expect(el.querySelector('#login-password')).not.toBeNull();
    expect(el.querySelector('#magic-link-email')).toBeNull();
    // Le libellé et le gabarit nomment les TROIS formes que
    // `AuthService.authenticate` accepte réellement (`AuthService.ts:155-158`).
    const rendu = text(el);
    expect(rendu).toContain('E-mail, téléphone ou pseudo');
    expect(identifiant?.getAttribute('autocomplete')).toBe('username');
  });

  test('le retour vers la porte par défaut dit « Se connecter par e-mail », baguette en tête, et mène à /login', () => {
    const el = mountAt('/login?methode=password');
    const retour = [...el.querySelectorAll('a')].find((a) => text(a).trim() === 'Se connecter par e-mail');
    expect(retour?.getAttribute('href')).toBe('/login');
    expect(retour?.firstElementChild?.tagName.toLowerCase()).toBe('svg');
  });

  test('aucun libellé perçu ne dit « magique »', () => {
    const el = mountAt('/login?methode=password');
    expect(perceivable(el)).not.toMatch(/magi(que|c)/iu);
  });

  test('un paramètre inconnu retombe sur la porte par défaut — jamais un écran vide', () => {
    const el = mountAt('/login?methode=nimportequoi');
    expect(el.querySelector('#magic-link-email')).not.toBeNull();
  });

  /**
   * L'ANCIENNE VALEUR RESTE LUE (#6583) — `motdepasse` a été l'adresse de
   * cette porte pendant toute la vie de #6404 : elle est dans des signets, des
   * liens partagés et la recette. Elle n'est plus jamais ÉMISE (le témoin de
   * l'autre porte, plus haut, exige `?methode=password`), mais la retirer du
   * vocabulaire de LECTURE renverrait ces adresses sur la connexion par
   * e-mail — un écran qui n'est pas celui qu'on a demandé.
   */
  test('`?methode=motdepasse`, l’ancienne adresse, ouvre toujours cette porte', () => {
    const el = mountAt('/login?methode=motdepasse');
    expect(el.querySelector('#login-password')).not.toBeNull();
  });
});

describe('/login — « Créer un compte » reste atteignable des DEUX portes', () => {
  test('sur la porte par défaut comme sur celle du mot de passe', () => {
    const lien = mountAt('/login');
    expect([...lien.querySelectorAll('a')].some((a) => a.getAttribute('href') === '/signup')).toBe(true);
    act(() => {
      root.unmount();
    });
    container.remove();

    const motdepasse = mountAt('/login?methode=password');
    expect([...motdepasse.querySelectorAll('a')].some((a) => a.getAttribute('href') === '/signup')).toBe(true);
  });
});
