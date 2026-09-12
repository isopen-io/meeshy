import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { ListHeader } from './list-header';
import { StoriesRail, type StoriesRailProps } from './stories-rail';
import type { RailEntry } from '@/lib/lens/rail-policy';

/**
 * `ListHeader` — la bande épinglée prend la place du titre (#6103), et porte
 * désormais le rail de STORIES (#5652) au lieu du rail de conversations.
 * Voir le doc-comment du module pour le miroir iOS (`PinnedStoryTrailBand`).
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

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

const entry = (partial: Partial<RailEntry> & { readonly id: string }): RailEntry => ({
  displayName: partial.id,
  hasUnviewed: false,
  isLive: false,
  accentColor: '#000000',
  ...partial,
});

const ENTRIES: readonly RailEntry[] = [entry({ id: 'u-amina', displayName: 'Amina Diallo' })];
const noop = (): void => {};
const railProps: Omit<StoriesRailProps, 'variant'> = { entries: ENTRIES, loading: false, onSelect: noop };

function mount(pinned: boolean): HTMLDivElement {
  const c = document.createElement('div');
  document.body.appendChild(c);
  const r = createRoot(c);
  container = c;
  root = r;
  act(() => {
    r.render(<ListHeader pinned={pinned} railProps={railProps} conversations={[]} viewerId="u-viewer" />);
  });
  return c;
}

function rerender(el: HTMLDivElement, pinned: boolean): void {
  void el;
  act(() => {
    root!.render(<ListHeader pinned={pinned} railProps={railProps} conversations={[]} viewerId="u-viewer" />);
  });
}

describe('ListHeader — la bande épinglée prend la place du titre', () => {
  test('non épinglé : le titre est visible, aucune bande dans le document', () => {
    const el = mount(false);
    const h1 = el.querySelector('h1');
    expect(h1).not.toBeNull();
    expect(h1?.getAttribute('aria-hidden')).toBeNull();
    expect(el.querySelector('[data-rail="pinned"]')).toBeNull();
  });

  test('épinglé : le titre cède (aria-hidden), la bande occupe SA fente', () => {
    const el = mount(true);
    const h1 = el.querySelector('h1') as HTMLElement;
    expect(h1.getAttribute('aria-hidden')).toBe('true');
    const bande = el.querySelector('[data-rail="pinned"]');
    expect(bande).not.toBeNull();
    // La bande vit dans le MÊME parent que le titre — la fente du titre,
    // jamais une seconde ligne ajoutée sous elle.
    const titleSlot = h1.parentElement;
    expect(titleSlot?.contains(bande)).toBe(true);
    expect(titleSlot?.className).toContain('relative');
  });

  test('le lien Progression est rendu dans les DEUX états', () => {
    for (const pinned of [false, true]) {
      const el = mount(pinned);
      expect(el.querySelector('a[aria-label^="Progression"]')).not.toBeNull();
      act(() => {
        root!.unmount();
      });
      container?.remove();
    }
    // laisse un montage derrière pour `afterEach`
    mount(false);
  });

  test('la bascule true → false retire la bande', () => {
    const el = mount(true);
    expect(el.querySelector('[data-rail="pinned"]')).not.toBeNull();
    rerender(el, false);
    expect(el.querySelector('[data-rail="pinned"]')).toBeNull();
  });
});

describe('ListHeader — les deux boutons d’en-tête (#5652)', () => {
  test('« Créer un lien de partage » et « Nouvelle conversation » sont rendus, à côté de Progression', () => {
    const el = mount(false);
    expect(el.querySelector('button[aria-label="Créer un lien de partage"]')).not.toBeNull();
    expect(el.querySelector('a[aria-label="Nouvelle conversation"]')).not.toBeNull();
  });

  test('« Créer un lien de partage » ouvre la feuille de choix', () => {
    const el = mount(false);
    const bouton = el.querySelector('button[aria-label="Créer un lien de partage"]') as HTMLButtonElement;
    act(() => {
      bouton.click();
    });
    expect(el.querySelector('dialog')).not.toBeNull();
  });
});

/**
 * CE QUE CE BLOC MESURE, ET CE QU'IL NE PROUVE PAS (revue #5652).
 *
 * `railProps` y porte `onSelect` — donc des pastilles FOCALISABLES. **Ce n'est
 * pas la forme que la production monte aujourd'hui** : `routes/conversations
 * .tsx` ne passe aucun `onSelect` tant que le viewer `/story/:postId` n'existe
 * pas (règle #5765), la bande n'a donc aucun élément focalisable et le report
 * de focus n'a rien à reporter. Le mécanisme reste ARMÉ et mesuré ici parce
 * qu'il est la leçon de #6103 — un focus orphelin sur `<body>` après le
 * démontage de la bande — et qu'il devra fonctionner du premier coup le jour
 * où la porte arrive. Le CLIQUET qui empêche d'oublier ce couplage vit dans
 * `check-lens.mjs` § 7 (« 0 élément focalisable dans la bande ») et dans le
 * témoin ci-dessous, qui mesure, lui, la forme RÉELLE.
 */
describe('ListHeader — la bande, sans porte, ne porte aucun contrôle (#5652)', () => {
  test('sans `onSelect` (la forme de production), la bande n’a AUCUN élément focalisable', () => {
    const c = document.createElement('div');
    document.body.appendChild(c);
    const r = createRoot(c);
    container = c;
    root = r;
    act(() => {
      r.render(
        <ListHeader
          pinned
          railProps={{ entries: ENTRIES, loading: false }}
          conversations={[]}
          viewerId="u-viewer"
        />,
      );
    });
    const bande = c.querySelector('[data-rail="pinned"]') as HTMLElement;
    expect(bande).not.toBeNull();
    expect(bande.querySelectorAll('a[href],button,[tabindex]:not([tabindex="-1"])').length).toBe(0);
  });
});

describe('ListHeader — le focus passe à la tuile jumelle du grand rail', () => {
  function mountWithGrandRail(pinned: boolean): HTMLDivElement {
    const c = document.createElement('div');
    document.body.appendChild(c);
    const r = createRoot(c);
    container = c;
    root = r;
    act(() => {
      r.render(
        <div>
          <ListHeader pinned={pinned} railProps={railProps} conversations={[]} viewerId="u-viewer" />
          <StoriesRail variant="grande" entries={ENTRIES} loading={false} onSelect={noop} />
        </div>,
      );
    });
    return c;
  }

  test('un focus dans la bande, puis un retrait de la bande, retrouve la tuile du grand rail', () => {
    const el = mountWithGrandRail(true);
    const pinnedTile = el.querySelector('[data-rail="pinned"] [data-story="u-amina"]') as HTMLElement;
    act(() => {
      pinnedTile.focus();
    });
    expect(document.activeElement).toBe(pinnedTile);

    act(() => {
      root!.render(
        <div>
          <ListHeader pinned={false} railProps={railProps} conversations={[]} viewerId="u-viewer" />
          <StoriesRail variant="grande" entries={ENTRIES} loading={false} onSelect={noop} />
        </div>,
      );
    });

    const grandeTile = el.querySelector('[data-rail="grande"] [data-story="u-amina"]');
    expect(document.activeElement).toBe(grandeTile);
  });

  /**
   * LE REPORT DE FOCUS NE REPREND QUE CE QUE LE DÉMONTAGE A ORPHELINÉ
   * (revue #6103). Mémoriser la dernière tuile focalisée SUFFIT à savoir où
   * REMETTRE le focus, jamais à savoir S'IL FAUT le remettre : un utilisateur
   * qui parcourt la bande au clavier, puis va écrire dans la barre de
   * recherche, puis fait remonter la liste, se voyait ARRACHER le curseur du
   * champ pour le poser sur une tuile du grand rail — la bande n'avait plus
   * le focus depuis longtemps. Le seul fait qui autorise la reprise est que
   * le retrait ait laissé le focus SUR `<body>`.
   */
  test('un focus PARTI ailleurs avant le retrait n’est jamais arraché', () => {
    const el = mountWithGrandRail(true);
    const pinnedTile = el.querySelector('[data-rail="pinned"] [data-story="u-amina"]') as HTMLElement;
    act(() => {
      pinnedTile.focus();
    });
    const ailleurs = document.createElement('input');
    document.body.appendChild(ailleurs);
    act(() => {
      ailleurs.focus();
    });
    // Identité comparée en BOOLÉEN : `toBe` sur un nœud sérialise tout
    // l'arbre React quand il rougit, et le témoin s'étrangle avant de dire
    // ce qu'il a trouvé.
    expect(document.activeElement === ailleurs).toBe(true);

    act(() => {
      root!.render(
        <div>
          <ListHeader pinned={false} railProps={railProps} conversations={[]} viewerId="u-viewer" />
          <StoriesRail variant="grande" entries={ENTRIES} loading={false} onSelect={noop} />
        </div>,
      );
    });

    expect((document.activeElement as HTMLElement | null)?.tagName).toBe('INPUT');
    expect(document.activeElement === ailleurs).toBe(true);
    ailleurs.remove();
  });

  test('sans focus préalable dans la bande, le retrait ne déplace rien', () => {
    const el = mountWithGrandRail(true);
    (document.activeElement as HTMLElement | null)?.blur?.();
    const before = document.activeElement;

    act(() => {
      root!.render(
        <div>
          <ListHeader pinned={false} railProps={railProps} conversations={[]} viewerId="u-viewer" />
          <StoriesRail variant="grande" entries={ENTRIES} loading={false} onSelect={noop} />
        </div>,
      );
    });

    expect(document.activeElement).toBe(before);
    void el;
  });
});
