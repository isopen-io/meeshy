import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { FloatingMenus } from './floating-menus';
import { MENU_LADDER } from '@/lib/view/floating-menu';

/**
 * LES DEUX MENUS FLOTTANTS (#6104) — ce que la capture ne prouve pas.
 *
 * Une capture montre six disques colorés ; elle ne dit ni où ils MÈNENT, ni si
 * le clavier les atteint, ni ce que le bouton ANNONCE quand son action change.
 * C'est cette moitié-là que ce fichier garde.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
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

function monter(): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<FloatingMenus />);
  });
  return container;
}

const boutonMenu = () => container.querySelector('[data-floating-menu]') as HTMLButtonElement;
const barreaux = () => [...container.querySelectorAll('[role="menuitem"]')] as HTMLAnchorElement[];

describe('au repos', () => {
  /**
   * L'échelle n'est pas seulement invisible : elle n'est pas MONTÉE. Six liens
   * cachés resteraient dans le parcours de tabulation — on tabulerait à travers
   * un menu fermé, ce qu'aucune capture ne montre jamais.
   */
  test('l’échelle n’est pas dans le document', () => {
    monter();
    expect(barreaux()).toHaveLength(0);
    expect(container.querySelector('[role="menu"]')).toBeNull();
  });

  test('les deux boutons sont là, et le menu s’annonce fermé', () => {
    monter();
    expect(container.querySelector('[data-floating-feed]')).not.toBeNull();
    expect(boutonMenu().getAttribute('aria-expanded')).toBe('false');
    expect(boutonMenu().getAttribute('aria-haspopup')).toBe('menu');
  });

  /**
   * **Le bouton de gauche est un LIEN** — il navigue, et rien d'autre. Un
   * `<button>` qui appellerait `navigate()` perdrait l'ouverture en nouvel
   * onglet, le survol qui montre l'adresse et le menu contextuel du
   * navigateur (`chrome-action.tsx:36`).
   */
  test('le Flux est un lien vers son adresse, jamais un bouton', () => {
    monter();
    const flux = container.querySelector('[data-floating-feed]');
    expect(flux?.tagName).toBe('A');
    expect(flux?.getAttribute('href')).toBe('/feed');
  });
});

describe('l’échelle ouverte', () => {
  /**
   * **LE TÉMOIN DE LA LOI 4** — les six barreaux MÈNENT quelque part, et là où
   * la table le dit. Un barreau sans `href` serait un disque coloré qui ne fait
   * rien, ce que ni l'œil ni une capture ne distinguent d'un barreau qui marche.
   */
  test('rend les six barreaux, dans l’ordre, chacun vers son adresse', () => {
    monter();
    act(() => {
      boutonMenu().click();
    });

    const rendus = barreaux();
    expect(rendus).toHaveLength(MENU_LADDER.length);
    expect(rendus.map((a) => a.getAttribute('aria-label'))).toEqual(MENU_LADDER.map((d) => d.label));
    for (const lien of rendus) {
      expect(lien.tagName).toBe('A');
      expect(lien.getAttribute('href')).toMatch(/^\/[a-z]+$/);
    }
  });

  /**
   * **Un bouton dont l'ACTION change doit changer de NOM.** iOS ouvre le profil
   * au second tap sur l'avatar (`RootView.swift:1570-1579`) : c'est la seule
   * porte du profil, qui n'a volontairement pas de barreau. Si le libellé
   * restait « Menu », le contrôle annoncerait une chose et en ferait une autre
   * — la définition même d'un contrôle qui ment.
   */
  test('le bouton s’annonce comme la porte du profil une fois ouvert', () => {
    monter();
    expect(boutonMenu().getAttribute('aria-label')).toBe('Menu');

    act(() => {
      boutonMenu().click();
    });

    expect(boutonMenu().getAttribute('aria-expanded')).toBe('true');
    expect(boutonMenu().getAttribute('aria-label')).toBe('Profil');
  });

  /**
   * Échap referme — la mécanique vient de `useRovingMenu`, mais ce témoin
   * prouve qu'elle est BRANCHÉE. Un hook correct non câblé rend un menu qu'on
   * ne peut plus fermer au clavier.
   */
  test('Échap la referme', () => {
    monter();
    act(() => {
      boutonMenu().click();
    });
    expect(barreaux()).toHaveLength(MENU_LADDER.length);

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(barreaux()).toHaveLength(0);
  });

  /**
   * La couche de fermeture PREND le geste sans rien assombrir — `Color.clear`
   * chez iOS (`RootView.swift:400-408`). Sans elle, un tap à côté laisserait le
   * menu ouvert par-dessus l'écran qu'on voulait atteindre.
   */
  test('un geste hors de l’échelle la referme', () => {
    monter();
    act(() => {
      boutonMenu().click();
    });

    const couche = container.querySelector('[data-floating-dismiss]') as HTMLElement;
    expect(couche).not.toBeNull();

    act(() => {
      couche.click();
    });

    expect(barreaux()).toHaveLength(0);
  });
});
