import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { MeeshyKitCatalog } from './catalog';
import { MeeshyKitCatalogEmptyState } from './catalog/empty-state';
import {
  accessibilityName,
  isDelivered,
  kitCatalogEntry,
  kitCatalogState,
  listedEntries,
  listedEntry,
  MeeshyKitCatalogStage,
  tileId,
  tilesOf,
} from './meeshy-kit-catalog';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/kit' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let mounted: { readonly container: HTMLDivElement; readonly root: Root } | null = null;

afterEach(() => {
  act(() => mounted?.root.unmount());
  mounted?.container.remove();
  mounted = null;
});

const mount = (element: React.ReactElement): HTMLElement => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(element));
  mounted = { container, root };
  return container;
};

const entry = (states: Parameters<typeof kitCatalogEntry>[0]['states']) => kitCatalogEntry({ key: 'K02', name: 'MeeshyGlassButton', states });

describe('MeeshyKitCatalogEntry', () => {
  test('une entrée sans état ne se livre pas', () => {
    expect(isDelivered(entry([]))).toBe(false);
    expect(tilesOf(entry([]))).toEqual([]);
    expect(isDelivered(kitCatalogEntry({ key: 'K02', name: 'MeeshyGlassButton' }))).toBe(false);
  });

  test('un état par défaut est sombre, ne se touche pas et ne cite aucune vue', () => {
    expect(kitCatalogState({ id: 'repos' })).toEqual({ id: 'repos', boardView: null, backdrop: 'dark', isTouchable: false });
  });

  test('la tuile pressée n’existe que pour un état qui se touche', () => {
    const tiles = tilesOf(
      entry([kitCatalogState({ id: 'repos', boardView: 'R1' }), kitCatalogState({ id: 'actif', boardView: 'R3', isTouchable: true })]),
    );
    expect(tiles.map(tileId)).toEqual(['repos', 'actif', 'actif-presse']);
    expect(tiles.map((tile) => tile.isPressed)).toEqual([false, false, true]);
  });

  test('la tuile pressée suit la tuile vivante, dans l’ordre de la fiche', () => {
    const tiles = tilesOf(entry([kitCatalogState({ id: 'a', isTouchable: true }), kitCatalogState({ id: 'b', isTouchable: true })]));
    expect(tiles.map(tileId)).toEqual(['a', 'a-presse', 'b', 'b-presse']);
  });

  test('le nom accessible dit la clé et le nom', () => {
    expect(accessibilityName(entry([]))).toBe('K02 MeeshyGlassButton');
  });
});

describe('MeeshyKitCatalog', () => {
  test('vingt-cinq entrées, clés dans l’ordre', () => {
    expect(MeeshyKitCatalog.entries).toHaveLength(25);
    expect(MeeshyKitCatalog.entries.map((candidate) => candidate.key)).toEqual(Array.from({ length: 25 }, (_, index) => `K${String(index + 1).padStart(2, '0')}`));
  });

  test('la liste n’affiche que les entrées non vides', () => {
    expect(listedEntries(MeeshyKitCatalog.entries).every(isDelivered)).toBe(true);
    expect(listedEntries(MeeshyKitCatalog.entries)).toEqual(MeeshyKitCatalog.entries.filter((candidate) => candidate.states.length > 0));
  });

  test('une clé inconnue ou non livrée n’ouvre rien', () => {
    expect(listedEntry('K99', MeeshyKitCatalog.entries)).toBeNull();
    expect(listedEntry('', MeeshyKitCatalog.entries)).toBeNull();
  });

  test('une clé livrée ouvre son entrée, casse ignorée', () => {
    const entries = [kitCatalogEntry({ key: 'K01', name: 'MeeshyGlassTone' }), entry([kitCatalogState({ id: 'repos' })])];
    expect(listedEntry('k02', entries)?.key).toBe('K02');
    expect(listedEntry('K01', entries)).toBeNull();
    expect(listedEntries(entries).map((candidate) => candidate.key)).toEqual(['K02']);
  });

  test('le contenu d’une clé sans composant livré est vide', () => {
    expect(MeeshyKitCatalog.content('K02', kitCatalogState({ id: 'repos' }), false)).toBeNull();
    expect(MeeshyKitCatalog.content('K99', kitCatalogState({ id: 'repos' }), false)).toBeNull();
  });
});

describe('MeeshyKitCatalogStage', () => {
  test('cadre le composant sur le fond de son état, avec la marge md', () => {
    const container = mount(
      <MeeshyKitCatalogStage state={kitCatalogState({ id: 'repos', backdrop: 'media' })} isPressed>
        <button type="button">composant</button>
      </MeeshyKitCatalogStage>,
    );
    const stage = container.querySelector<HTMLElement>('[data-kit-stage]');
    expect(stage?.getAttribute('data-backdrop')).toBe('media');
    expect(stage?.getAttribute('data-pressed')).toBe('');
    expect(stage?.style.padding).toBe('var(--ios-space-md)');
    expect(stage?.textContent).toBe('composant');
  });

  test('un état au repos ne porte pas data-pressed', () => {
    const container = mount(
      <MeeshyKitCatalogStage state={kitCatalogState({ id: 'repos' })}>
        <span>x</span>
      </MeeshyKitCatalogStage>,
    );
    expect(container.querySelector('[data-kit-stage]')?.hasAttribute('data-pressed')).toBe(false);
  });
});

describe('MeeshyKitCatalogEmptyState', () => {
  test('dit qu’aucun composant n’est livré', () => {
    const container = mount(<MeeshyKitCatalogEmptyState />);
    expect(container.textContent).toBe('Aucun composant livré');
    expect(container.querySelector('[data-kit-empty]')).not.toBeNull();
  });
});
