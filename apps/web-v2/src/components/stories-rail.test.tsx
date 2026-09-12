import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { RAIL_SIZE_COMPACT, StoriesRail, type StoriesRailProps } from './stories-rail';
import type { RailEntry, RailSelfEntry } from '@/lib/lens/rail-policy';

/**
 * `StoriesRail` (#5652) — remplace `ConversationRail` dans les DEUX
 * géographies. Voir le doc-comment du module pour la référence iOS
 * (`StoriesVivantsRail.swift`).
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

const selfEntry = (partial: Partial<RailSelfEntry> = {}): RailSelfEntry => ({
  displayName: 'Vous',
  accentColor: '#111111',
  hasActiveStory: false,
  ...partial,
});

function mount(
  props: Partial<StoriesRailProps> & { readonly variant: StoriesRailProps['variant']; readonly inert?: boolean },
): HTMLDivElement {
  const c = document.createElement('div');
  document.body.appendChild(c);
  const r = createRoot(c);
  container = c;
  root = r;
  act(() => {
    r.render(<StoriesRail entries={[]} loading={false} {...props} />);
  });
  return c;
}

describe('StoriesRail — deux géographies, une seule loi', () => {
  test('`grande` rend `ul[data-rail="grande"]`, tuile 48, libellé visible', () => {
    const el = mount({ variant: 'grande', entries: [entry({ id: 'u-amina', displayName: 'Amina Diallo' })] });
    const ul = el.querySelector('ul[data-rail="grande"]');
    expect(ul).not.toBeNull();
    expect(ul?.querySelector('[data-rail-tile="48"]')).not.toBeNull();
    expect(el.textContent).toContain('Amina Diallo');
  });

  test('`pinned` rend `ul[data-rail="pinned"]`, tuile compacte, AUCUN libellé', () => {
    const el = mount({ variant: 'pinned', entries: [entry({ id: 'u-amina', displayName: 'Amina Diallo' })] });
    const ul = el.querySelector('ul[data-rail="pinned"]');
    expect(ul).not.toBeNull();
    expect(ul?.querySelector(`[data-rail-tile="${RAIL_SIZE_COMPACT}"]`)).not.toBeNull();
    expect(el.textContent).not.toContain('Amina Diallo');
  });

  test('aria-label « Stories », retiré quand `inert`', () => {
    const el = mount({ variant: 'grande', entries: [entry({ id: 'u-1' })] });
    expect(el.querySelector('ul[data-rail="grande"]')?.getAttribute('aria-label')).toBe('Stories');
    const inerte = mount({ variant: 'grande', entries: [entry({ id: 'u-1' })], inert: true });
    expect(inerte.querySelector('ul[data-rail="grande"]')?.getAttribute('aria-label')).toBeNull();
  });

  test('la troncature à 6 est appliquée par la LOI, pas redécidée ici', () => {
    const entries = Array.from({ length: 9 }, (_, i) => entry({ id: `u-${i}` }));
    const el = mount({ variant: 'grande', entries });
    expect(el.querySelectorAll('[data-rail-tile]').length).toBe(6);
  });

  test('« moi » est TOUJOURS la première pastille, hors de la borne des 6', () => {
    const entries = Array.from({ length: 6 }, (_, i) => entry({ id: `u-${i}` }));
    const el = mount({ variant: 'grande', selfEntry: selfEntry(), entries });
    const tiles = [...el.querySelectorAll('[data-rail-tile]')];
    expect(tiles.length).toBe(7);
    expect(tiles[0]?.hasAttribute('data-rail-self')).toBe(true);
  });

  test('anneau ACCENTUÉ quand hasUnviewed, SOURD sinon (couleur du fond de l’anneau)', () => {
    const el = mount({
      variant: 'grande',
      entries: [entry({ id: 'u-vu', hasUnviewed: false }), entry({ id: 'u-non-vu', hasUnviewed: true })],
    });
    const anneaux = [...el.querySelectorAll('[data-anneau]')] as HTMLElement[];
    // `data-accented` plutôt que le style calculé — happy-dom rejette
    // silencieusement `color-mix()` sur `backgroundColor` (valeur non reconnue
    // par sa CSSOM), l'attribut de test reste le témoin fiable du VERDICT de
    // la loi (`ringIsAccented`), indépendant du moteur de style.
    expect(anneaux[0]?.getAttribute('data-accented')).toBe('false');
    expect(anneaux[1]?.getAttribute('data-accented')).toBe('true');
  });

  test('masqué si rien à montrer (ni « moi », ni personne)', () => {
    const el = mount({ variant: 'grande', entries: [], loading: false });
    expect(el.innerHTML).toBe('');
  });

  test('« moi » seule suffit à rendre le rail, sans aucune autre entrée', () => {
    const el = mount({ variant: 'grande', selfEntry: selfEntry(), entries: [] });
    expect(el.querySelector('ul[data-rail="grande"]')).not.toBeNull();
  });

  test('chargement + corpus vide, `grande` ⇒ une tuile fantôme aria-hidden', () => {
    const el = mount({ variant: 'grande', entries: [], loading: true });
    const fantome = el.querySelector('[aria-hidden="true"]');
    expect(fantome).not.toBeNull();
    expect((fantome as HTMLElement).style.visibility).toBe('hidden');
  });

  test('le conteneur masque sa barre de défilement (iOS `showsIndicators: false`)', () => {
    const el = mount({ variant: 'grande', entries: [entry({ id: 'u-1' })] });
    const ul = el.querySelector('ul[data-rail="grande"]') as HTMLElement;
    expect(ul.style.scrollbarWidth).toBe('none');
  });
});

/**
 * SANS PORTE, SANS CONTRÔLE (règle #5765) — voir le doc-comment du module.
 * Une pastille sans `onSelect` est une FIGURE, jamais un `<button>` : c'est ce
 * qui laisse `check-list-actions.mjs` ne rien trouver à reprocher.
 */
describe('StoriesRail — sans porte, aucune pastille n’est un contrôle', () => {
  test('sans `onSelect`, les autres pastilles ne portent AUCUN `<button>`', () => {
    const el = mount({ variant: 'grande', entries: [entry({ id: 'u-1', displayName: 'Amina' })] });
    expect(el.querySelector('button')).toBeNull();
  });

  test('sans `onSelectSelf`, la pastille « moi » ne porte AUCUN `<button>`', () => {
    const el = mount({ variant: 'grande', selfEntry: selfEntry(), entries: [] });
    expect(el.querySelector('button')).toBeNull();
  });

  test('avec `onSelect`, la pastille devient un `<button>` qui APPELLE avec l’id', () => {
    let called: string | undefined;
    const el = mount({
      variant: 'grande',
      entries: [entry({ id: 'u-1', displayName: 'Amina' })],
      onSelect: (id) => {
        called = id;
      },
    });
    const bouton = el.querySelector('button') as HTMLButtonElement;
    expect(bouton).not.toBeNull();
    act(() => {
      bouton.click();
    });
    expect(called).toBe('u-1');
  });
});

/**
 * LE RAIL SERT CE QUE SES PORTS RÉSOLVENT (revue #5652) — la couverture de la
 * dernière story et le badge d'humeur. Les deux voyageaient dans `RailEntry`
 * et la peau les JETAIT : un résolveur dont la valeur n'atteint aucun pixel
 * n'a corrigé personne (cycle 122 du `CLAUDE.md`).
 */
describe('StoriesRail — la couverture et l’humeur atteignent le pixel', () => {
  test('`previewUrl` est rendue en IMAGE, par-dessus les initiales qui restent le repli', () => {
    const el = mount({
      variant: 'grande',
      entries: [entry({ id: 'u-1', displayName: 'Amina Diallo', previewUrl: 'https://cdn.test/cover.jpg' })],
    });
    const img = el.querySelector('img') as HTMLImageElement | null;
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('https://cdn.test/cover.jpg');
    // Les initiales restent SOUS l'image : aucun cercle vide pendant le
    // téléchargement, aucun trou si l'URL casse.
    expect(el.textContent).toContain('AD');
  });

  test('à défaut de couverture, l’AVATAR de l’auteur sert (miroir `previewURL ?? avatarURL`)', () => {
    const el = mount({ variant: 'grande', entries: [entry({ id: 'u-1', avatarUrl: 'https://cdn.test/avatar.jpg' })] });
    expect(el.querySelector('img')?.getAttribute('src')).toBe('https://cdn.test/avatar.jpg');
  });

  test('sans couverture ni avatar, AUCUNE image — jamais un `src` vide qui rechargerait le document', () => {
    const el = mount({ variant: 'grande', entries: [entry({ id: 'u-1', displayName: 'Amina Diallo' })] });
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toContain('AD');
  });

  test('le badge d’humeur est PEINT et DÉCORATIF (aria-hidden, sans pointeur)', () => {
    const el = mount({ variant: 'grande', entries: [entry({ id: 'u-1', moodEmoji: '🎉' })] });
    const badge = el.querySelector('[data-mood]') as HTMLElement | null;
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toBe('🎉');
    expect(badge?.getAttribute('aria-hidden')).toBe('true');
    expect(badge?.style.pointerEvents).toBe('none');
  });

  test('la bande COMPACTE ne porte pas de badge — elle ne porte déjà pas le nom', () => {
    const el = mount({ variant: 'pinned', entries: [entry({ id: 'u-1', moodEmoji: '🎉' })] });
    expect(el.querySelector('[data-mood]')).toBeNull();
  });

  test('« moi » porte aussi sa couverture et son humeur', () => {
    const el = mount({
      variant: 'grande',
      selfEntry: selfEntry({ hasActiveStory: true, previewUrl: 'https://cdn.test/moi.jpg', moodEmoji: '😴' }),
      entries: [],
    });
    expect(el.querySelector('[data-rail-self] img')?.getAttribute('src')).toBe('https://cdn.test/moi.jpg');
    expect(el.querySelector('[data-rail-self] [data-mood]')?.textContent).toBe('😴');
  });
});
