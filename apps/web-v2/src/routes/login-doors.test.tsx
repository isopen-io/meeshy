import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { LoginDoors, loginMethodFromSearch } from '@/routes/login';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

/**
 * LES DEUX PORTES DE `/login` (#6404) — directive porteur 2026-09-13 :
 * « connexion par magic link comme connexion par défaut pour le moment »,
 * « proposer l'option se connecter avec identifiant (e-mail, téléphone,
 * pseudo) et mot de passe ».
 *
 * Le choix vit dans l'ADRESSE (`?methode=motdepasse`), jamais dans un état
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

describe('/login — la porte PAR DÉFAUT est le lien magique', () => {
  test('sans paramètre : le champ e-mail et « Envoyer le lien magique », jamais un champ mot de passe', () => {
    const el = mountAt('/login');
    expect(el.querySelector('#magic-link-email')).not.toBeNull();
    expect(text(el)).toContain('Envoyer le lien magique');
    expect(el.querySelector('#login-password')).toBeNull();
  });

  test('l’autre porte est NOMMÉE, et mène à l’adresse qui la porte', () => {
    const el = mountAt('/login');
    const lien = [...el.querySelectorAll('a')].find((a) => (a.textContent ?? '').includes('identifiant'));
    expect(lien).toBeDefined();
    expect(lien?.getAttribute('href')).toBe('/login?methode=motdepasse');
  });
});

describe('/login?methode=motdepasse — l’identifiant et le mot de passe', () => {
  test('les deux champs, et l’identifiant DIT ce qu’il accepte', () => {
    const el = mountAt('/login?methode=motdepasse');
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

  test('le retour vers le lien magique est un LIEN vers l’adresse par défaut', () => {
    const el = mountAt('/login?methode=motdepasse');
    const retour = [...el.querySelectorAll('a')].find((a) => (a.textContent ?? '').includes('lien'));
    expect(retour?.getAttribute('href')).toBe('/login');
  });

  test('un paramètre inconnu retombe sur la porte par défaut — jamais un écran vide', () => {
    const el = mountAt('/login?methode=nimportequoi');
    expect(el.querySelector('#magic-link-email')).not.toBeNull();
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

    const motdepasse = mountAt('/login?methode=motdepasse');
    expect([...motdepasse.querySelectorAll('a')].some((a) => a.getAttribute('href') === '/signup')).toBe(true);
  });
});
