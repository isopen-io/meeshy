import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { ListHeader } from './list-header';
import { StoryRail } from './story-rail';
import type { StoryTrayGroup } from '@/lib/view/story-tray';

/**
 * `ListHeader` — la bande épinglée prend la place du titre (#6103).
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

/**
 * LE CORPUS DU RAIL EST DÉSORMAIS CELUI DES STORIES (fusion #6080 ↔ #6103,
 * 2026-09-12) — ces témoins mesuraient la même géographie sur un corpus de
 * CONVERSATIONS ; seule la nature des tuiles a changé, pas ce qu'ils affirment.
 * L'identité de la tuile focalisable est passée de `data-conversation` à
 * `data-story-author`, pour la même raison et au même endroit.
 */
const group = (authorId: string, displayName: string): StoryTrayGroup => ({
  authorId,
  author: { id: authorId, displayName } as StoryTrayGroup['author'],
  stories: [],
  latestAt: 0,
  hasUnseen: true,
  isMine: false,
  entryStoryId: `st-${authorId}`,
});

const GROUPS: readonly StoryTrayGroup[] = [group('c-1', 'Amina Diallo')];

function mount(pinned: boolean): HTMLDivElement {
  const c = document.createElement('div');
  document.body.appendChild(c);
  const r = createRoot(c);
  container = c;
  root = r;
  act(() => {
    r.render(
      <ListHeader
        pinned={pinned}
        railProps={{ groups: GROUPS, loading: false }}
        conversations={[]}
        viewerId="u-viewer"
      />,
    );
  });
  return c;
}

function rerender(el: HTMLDivElement, pinned: boolean): void {
  void el;
  act(() => {
    root!.render(
      <ListHeader
        pinned={pinned}
        railProps={{ groups: GROUPS, loading: false }}
        conversations={[]}
        viewerId="u-viewer"
      />,
    );
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

describe('ListHeader — les deux boutons d’en-tête (#5652, réaccordés #6080)', () => {
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
          <ListHeader
            pinned={pinned}
            railProps={{ groups: GROUPS, loading: false }}
            conversations={[]}
            viewerId="u-viewer"
          />
          <StoryRail variant="grande" groups={GROUPS} loading={false} />
        </div>,
      );
    });
    return c;
  }

  test('un focus dans la bande, puis un retrait de la bande, retrouve la tuile du grand rail', () => {
    const el = mountWithGrandRail(true);
    const pinnedTile = el.querySelector('[data-rail="pinned"] a[data-story-author="c-1"]') as HTMLElement;
    act(() => {
      pinnedTile.focus();
    });
    expect(document.activeElement).toBe(pinnedTile);

    act(() => {
      root!.render(
        <div>
          <ListHeader
            pinned={false}
            railProps={{ groups: GROUPS, loading: false }}
            conversations={[]}
            viewerId="u-viewer"
          />
          <StoryRail variant="grande" groups={GROUPS} loading={false} />
        </div>,
      );
    });

    const grandeTile = el.querySelector('[data-rail="grande"] a[data-story-author="c-1"]');
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
    const pinnedTile = el.querySelector('[data-rail="pinned"] a[data-story-author="c-1"]') as HTMLElement;
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
          <ListHeader
            pinned={false}
            railProps={{ groups: GROUPS, loading: false }}
            conversations={[]}
            viewerId="u-viewer"
          />
          <StoryRail variant="grande" groups={GROUPS} loading={false} />
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
          <ListHeader
            pinned={false}
            railProps={{ groups: GROUPS, loading: false }}
            conversations={[]}
            viewerId="u-viewer"
          />
          <StoryRail variant="grande" groups={GROUPS} loading={false} />
        </div>,
      );
    });

    expect(document.activeElement).toBe(before);
    void el;
  });
});
