import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { RAIL_TILE_COMPACT, RAIL_TILE_GRANDE, RailTile } from './rail-tile';

/**
 * **UNE TUILE, DEUX TAILLES** (#5946) — le trail des stories se compacte quand
 * on le fait défiler, et la tuile compacte est LA MÊME que la grande.
 *
 * La référence iOS le dit dans son doc-comment, et c'est le contrat que ce
 * témoin garde :
 *
 * > « the grande trail and the pinned mini-trail render an identical cell, only
 * > differing by `context` size » — `StoryTrayView.swift`
 * > « `context` drives the size (`.storyTray` 88pt vs `.storyTrayCompact` 36pt);
 * > all proportional metrics derive from it »
 *
 * Deux composants « grande » et « compacte » auraient été deux vérités pour une
 * même tuile, et elles auraient divergé — ce dépôt l'a mesuré sur les trois
 * familles de résolveurs du Prisme, qui ont divergé sur trois clients faute
 * d'un site UNIQUE.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

/* `undefined` tant qu'un témoin n'a rien monté — le premier n'interroge que des
   constantes. Sans cette garde, `afterEach` démontait une racine inexistante et
   faisait échouer un témoin qui n'avait rien à voir avec le composant. */
let container: HTMLDivElement | undefined;
let root: Root | undefined;

afterEach(() => {
  if (root !== undefined) {
    const r = root;
    act(() => {
      r.unmount();
    });
  }
  container?.remove();
  root = undefined;
  container = undefined;
});

function demonter(): void {
  if (root !== undefined) {
    const r = root;
    act(() => {
      r.unmount();
    });
  }
  container?.remove();
  root = undefined;
  container = undefined;
}

function monter(taille: number, unread = 0): HTMLDivElement {
  const c = document.createElement('div');
  document.body.appendChild(c);
  const r = createRoot(c);
  container = c;
  root = r;
  act(() => {
    r.render(
      <RailTile
        conversationId="c-1"
        title="Amina Diallo"
        accent="#7B61FF"
        unread={unread}
        size={taille}
      />,
    );
  });
  return c;
}

describe('RailTile — une tuile, deux tailles', () => {
  test('les deux cotes de référence sont celles de l’app iOS', () => {
    expect(RAIL_TILE_GRANDE).toBe(72);
    expect(RAIL_TILE_COMPACT).toBe(30);
  });

  test('la grande porte son libellé — c’est ce qui la rend lisible', () => {
    const el = monter(RAIL_TILE_GRANDE);
    expect(el.textContent).toContain('Amina Diallo');
  });

  /**
   * La compacte n'a pas la place d'un libellé : à 30 px, un nom tronqué à deux
   * lettres ne dit rien que l'avatar ne dise déjà, et il vole la hauteur qui
   * fait tenir la bande dans une barre. iOS applique la même règle
   * (`showsUsername`), et son seuil est `context.size <= 44`.
   */
  test('la compacte n’en porte pas, et le nom reste ATTEIGNABLE', () => {
    const el = monter(RAIL_TILE_COMPACT);
    expect(el.textContent).not.toContain('Amina Diallo');
    // Le nom ne disparaît pas pour un lecteur d'écran — il migre sur le lien.
    const lien = el.querySelector('a');
    expect(lien?.getAttribute('aria-label')).toBe('Amina Diallo');
  });

  /**
   * **LA COTE PILOTE TOUT LE RESTE**, comme sur iOS. Si l'anneau gardait une
   * épaisseur fixe, il mangerait la moitié d'un avatar de 30 px alors qu'il
   * borde discrètement celui de 72.
   */
  test('l’anneau est PROPORTIONNEL — jamais une épaisseur figée', () => {
    const grande = monter(RAIL_TILE_GRANDE).querySelector('[data-anneau]') as HTMLElement;
    const epaisseurGrande = grande.style.padding;
    demonter();

    const compacte = monter(RAIL_TILE_COMPACT).querySelector('[data-anneau]') as HTMLElement;
    expect(compacte.style.padding).not.toBe(epaisseurGrande);
  });

  test('un non-lu accentue l’anneau, à l’une comme à l’autre taille', () => {
    for (const taille of [RAIL_TILE_GRANDE, RAIL_TILE_COMPACT]) {
      const el = monter(taille, 3);
      const anneau = el.querySelector('[data-anneau]') as HTMLElement;
      expect(anneau.style.background).toContain('brand');
      demonter();
    }
    // Le dernier démontage est repris par `afterEach` : on remonte pour lui.
    monter(RAIL_TILE_GRANDE);
  });

  test('les deux tailles rendent le MÊME balisage — un seul composant', () => {
    const formes = [RAIL_TILE_GRANDE, RAIL_TILE_COMPACT].map((t) => {
      const el = monter(t);
      const forme = el.innerHTML
        .replace(/\d+(\.\d+)?px/g, 'N')
        .replace(/Amina Diallo/g, '')
        // `data-rail-tile` PORTE la cote (#6070, mesurée par check-lens.mjs
        // pour prouver que le rail compacte réellement) — elle DIFFÈRE par
        // construction entre les deux tailles, et c'est la seule chose que
        // ce témoin neutralise sans y voir une divergence de STRUCTURE.
        .replace(/data-rail-tile="\d+"/g, 'data-rail-tile="N"')
        // LA MARGE DE CIBLE TACTILE (#6103, `MIN_TOUCH_TARGET`) est NÉGATIVE
        // à `RAIL_TILE_COMPACT` et NULLE à `RAIL_TILE_GRANDE` — mais une
        // marge nulle SIGNÉE (`-0px`) se sérialise SANS son signe une fois
        // fondue dans le raccourci `margin` (le CSSOM canonicalise le zéro,
        // signé ou non, à une seule écriture), quand une marge négative
        // RÉELLE (`-3.5px`) le garde. Cette dissymétrie de signe n'est pas
        // une divergence de STRUCTURE — c'est la même règle qui rend `0` à
        // une taille où elle n'a rien à compenser et un nombre réel à
        // l'autre — donc neutralisée ICI, jamais en évitant le signe dans
        // le composant (qui le perdrait alors pour de vrai, dans le DOM).
        .replace(/-N/g, 'N');
      demonter();
      return forme;
    });
    monter(RAIL_TILE_GRANDE);
    // Cotes et libellé neutralisés : ce qui reste est la STRUCTURE, et elle
    // doit être identique — c'est la définition de « la même cellule ».
    expect(formes[0]!.replace(/<span[^>]*data-libelle[\s\S]*?<\/span>/, '')).toBe(
      formes[1]!.replace(/<span[^>]*data-libelle[\s\S]*?<\/span>/, ''),
    );
  });

  /**
   * LA CIBLE TACTILE (#6103, charte dimension 5) — à `RAIL_TILE_COMPACT`, la
   * boîte visuelle du lien (~32 px) est SOUS 44 px. La cible s'étend par une
   * marge NÉGATIVE, jamais en élargissant `<li data-rail-tile>` : c'est LUI
   * que `check-lens.mjs` mesure pour prouver que le rail compacte
   * réellement (#6070) — le déformer romprait ce gate.
   */
  test('la cible reste ≥ 44 px SANS changer la boîte de mise en page', () => {
    const compact = monter(RAIL_TILE_COMPACT);
    const li = compact.querySelector('[data-rail-tile]') as HTMLElement;
    const lien = compact.querySelector('a') as HTMLAnchorElement;
    expect(li.style.width).toBe('37px');
    expect(lien.style.minWidth).toBe('44px');
    expect(lien.style.minHeight).toBe('44px');
    // La marge compense exactement (44 − 37) / 2 = 3.5 px, avec son signe.
    expect(lien.style.marginLeft).toBe('-3.5px');
    expect(lien.style.marginRight).toBe('-3.5px');
    demonter();

    const grande = monter(RAIL_TILE_GRANDE);
    const liGrande = grande.querySelector('[data-rail-tile]') as HTMLElement;
    const lienGrande = grande.querySelector('a') as HTMLAnchorElement;
    expect(liGrande.style.width).toBe('88px');
    expect(lienGrande.style.minWidth).toBe('44px');
    // La cellule (88) dépasse déjà la cible : aucune compensation à faire.
    expect(['0px', '-0px']).toContain(lienGrande.style.marginLeft);
  });
});
