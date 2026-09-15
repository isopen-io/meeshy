import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { sessionStore } from '@/lib/api/session';
import { LoginDoors, loginMethodFromSearch } from '@/routes/login';
import { authColumnIn, strayFromAuthColumn } from '@/test-support/auth-column';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { controlledBy, perceivableText as perceivable } from '@/test-support/perceivable-text';

/**
 * LES DEUX PORTES DE `/login` (#6404) — directive porteur 2026-09-13 :
 * « connexion par magic link comme connexion par défaut pour le moment »,
 * « proposer l'option se connecter avec identifiant (e-mail, téléphone,
 * pseudo) et mot de passe ».
 *
 * Le choix vit dans l'ADRESSE (`?methode=password` depuis #6583 — voir plus
 * bas pour l'ancienne valeur, toujours LUE), jamais dans un état local : le
 * retour arrière le rend, un lien le partage, et une recette ouvre directement
 * l'une des deux portes. Le témoin monte donc l'écran à une adresse DONNÉE,
 * comme le fait le routeur.
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
});

/**
 * « LA PAGE DOIT ÊTRE SANS TITRE SAUF LA BAGUETTE MAGIQUE » (#6583, directive
 * porteur 2026-09-14), RÉDUITE AU BLASON par celle du 2026-09-15 (#6626).
 *
 * #6583 retirait DEUX choses de la porte par défaut : le blason « Meeshy » et
 * le titre de section « Entrez votre adresse email », qui disaient deux fois
 * ce que la page EST à quelqu'un qui vient de cliquer « Se connecter ».
 *
 * Le BLASON reste retiré : rien depuis ne l'a redemandé, et c'est lui qui
 * redisait le nom du produit. Le TITRE de section, lui, revient — #6626 en a
 * fait « Votre adresse e-mail », l'ancre du (i) « Comment ça marche » qui
 * porte désormais TOUT le mode de fonctionnement (premier `describe`). Un
 * titre qui héberge la mécanique ne répète plus le champ ; et la directive
 * postérieure a été relue deux fois sur ce titre même (la place du (i), la
 * césure de « e-mail »), donc vue plutôt que subie.
 *
 * La porte du MOT DE PASSE garde son blason : elle n'a pas de baguette, et un
 * écran sans en-tête d'aucune sorte n'aurait plus rien pour se nommer.
 */
describe('/login — la porte par défaut n’a plus de blason', () => {
  test('ni le blason « Meeshy », ni l’ancien titre de #6404', () => {
    const el = mountAt('/login');
    expect(el.querySelector('h1')).toBeNull();
    expect(text(el)).not.toContain('Entrez votre adresse');
  });

  test('la baguette, le titre qui porte le (i), le champ et le bouton', () => {
    const el = mountAt('/login');
    // La baguette est le SEUL tracé d'en-tête restant : le blason de marque
    // rendait trois `<line>`, elle n'en rend aucune.
    expect(el.querySelector('svg')).not.toBeNull();
    expect(el.querySelectorAll('line')).toHaveLength(0);
    expect(text(el)).toContain('Votre adresse e-mail');
    expect(el.querySelector('#magic-link-email')).not.toBeNull();
    expect(text(el)).toContain('Recevoir le lien');
  });

  test('la porte du mot de passe GARDE son blason', () => {
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
    const el = mountAt('/login?methode=motdepasse');
    const retour = [...el.querySelectorAll('a')].find((a) => text(a).trim() === 'Se connecter par e-mail');
    expect(retour?.getAttribute('href')).toBe('/login');
    expect(retour?.firstElementChild?.tagName.toLowerCase()).toBe('svg');
  });

  test('aucun libellé perçu ne dit « magique »', () => {
    const el = mountAt('/login?methode=motdepasse');
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
   * vocabulaire de LECTURE renverrait ces adresses sur le lien magique — un
   * écran qui n'est pas celui qu'on a demandé.
   */
  test('`?methode=motdepasse`, l’ancienne adresse, ouvre toujours cette porte', () => {
    const el = mountAt('/login?methode=motdepasse');
    expect(el.querySelector('#login-password')).not.toBeNull();
  });
});

/**
 * LA CONNEXION EST LA RÉFÉRENCE DE LA GÉOMÉTRIE (#6643) — sa colonne centrée
 * devient celle de toutes les pages d'accès. Elle y migre SANS changement
 * visuel ; ce qui se prouve ici, c'est qu'elle monte la colonne PARTAGÉE, et
 * que ses trois sections — les deux portes et le second facteur — y tiennent.
 */
describe('/login — les deux portes et le second facteur tiennent dans LA colonne d’accès (#6643)', () => {
  test('la porte par défaut', () => {
    const el = mountAt('/login');
    expect(authColumnIn(el)?.querySelector('#magic-link-email')).not.toBeNull();
    expect(strayFromAuthColumn(el)).toEqual([]);
  });

  test('la porte du mot de passe', () => {
    const el = mountAt('/login?methode=password');
    expect(authColumnIn(el)?.querySelector('#login-password')).not.toBeNull();
    expect(strayFromAuthColumn(el)).toEqual([]);
  });

  test('le second facteur — l’étape de code', () => {
    act(() => {
      sessionStore.getState().beginTwoFactor({
        twoFactorToken: 'jeton-du-temoin',
        user: { id: '0'.repeat(24), username: 'ada', email: 'ada@meeshy.example', firstName: 'Ada', lastName: 'Lovelace', displayName: 'Ada', avatar: '' },
      });
    });
    const el = mountAt('/login?methode=password');
    expect(authColumnIn(el)?.querySelector('#login-2fa-code')).not.toBeNull();
    expect(strayFromAuthColumn(el)).toEqual([]);
    act(() => {
      sessionStore.getState().clearSession();
    });
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
