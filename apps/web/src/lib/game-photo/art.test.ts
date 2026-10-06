import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { collectArtMarkup, loadArt } from './art';

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/me/progression' });
});
afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

/**
 * LES DESSINS DU CADRE (#9382) — l'image finale reprend les SVG que l'écran
 * vient de peindre (emblème, Mee, Meo, Signature) : le cadre est « le même
 * dessin partout ». Le cadre porte un `data-photo-art` par emplacement.
 */
const frame = (slots: readonly string[]): HTMLElement => {
  const root = document.createElement('div');
  for (const slot of slots) {
    const holder = document.createElement('span');
    holder.setAttribute('data-photo-art', slot);
    holder.innerHTML = `<svg viewBox="0 0 10 10" data-slot="${slot}"><path fill="var(--game-edge)"/></svg>`;
    root.append(holder);
  }
  return root;
};

const ALL = ['emblem', 'mee', 'meo', 'signature'];

describe('collectArtMarkup', () => {
  test('les quatre dessins, chacun lu à son emplacement', () => {
    const markup = collectArtMarkup(frame(ALL));
    expect(Object.keys(markup ?? {}).sort()).toEqual([...ALL].sort());
    expect(markup?.mee).toContain('data-slot="mee"');
  });

  test('un emplacement manquant : null — pas une image à moitié habillée', () => {
    expect(collectArtMarkup(frame(['emblem', 'mee', 'meo']))).toBeNull();
  });

  test('un emplacement sans SVG : null', () => {
    const root = frame(ALL);
    root.querySelector('[data-photo-art="meo"]')?.replaceChildren();
    expect(collectArtMarkup(root)).toBeNull();
  });
});

describe('loadArt', () => {
  const image = (id: string) => ({ id }) as unknown as HTMLImageElement;

  test('chaque dessin est préparé (jetons résolus) puis rasterisé', async () => {
    const seen: string[] = [];
    const art = await loadArt({
      root: frame(ALL),
      read: (name) => (name === '--game-edge' ? '#112233' : ''),
      raster: async (markup) => {
        seen.push(markup);
        return image(String(seen.length));
      },
    });
    expect(art).not.toBeNull();
    expect(seen).toHaveLength(4);
    expect(seen.every((m) => m.includes('fill="#112233"') && m.includes('xmlns='))).toBe(true);
  });

  test('un dessin qui ne se rasterise pas : null, la photo n’est pas composée à moitié', async () => {
    let n = 0;
    const art = await loadArt({ root: frame(ALL), read: () => '', raster: async () => (++n === 3 ? null : image('x')) });
    expect(art).toBeNull();
  });

  test('un cadre incomplet : null, sans rien rasteriser', async () => {
    let called = 0;
    const art = await loadArt({ root: frame(['emblem']), read: () => '', raster: async () => (called++, image('x')) });
    expect(art).toBeNull();
    expect(called).toBe(0);
  });
});

/**
 * LA FLAMME DU BANDEAU (#7742) — un cinquième dessin, FACULTATIF : il n'existe
 * que sur une carte qui porte le lien de parrainage et une Flamme allumée. Son
 * absence — ou son échec — ne défait pas la carte : seule la Flamme manque.
 */
describe('la Flamme du bandeau, dessin facultatif', () => {
  const image = (id: string) => ({ id }) as unknown as HTMLImageElement;

  test('lue quand le cadre la porte, absente sinon — jamais exigée', () => {
    expect(Object.keys(collectArtMarkup(frame([...ALL, 'flame'])) ?? {}).sort()).toEqual([...ALL, 'flame'].sort());
    expect(Object.keys(collectArtMarkup(frame(ALL)) ?? {})).not.toContain('flame');
  });

  test('rasterisée avec les autres, et remise à la composition', async () => {
    const art = await loadArt({ root: frame([...ALL, 'flame']), read: () => '', raster: async (markup) => image(markup.includes('data-slot="flame"') ? 'flame' : 'x') });
    expect((art?.flame as unknown as { id: string } | undefined)?.id).toBe('flame');
  });

  test('un cadre sans Flamme : la carte est complète, sans elle', async () => {
    const art = await loadArt({ root: frame(ALL), read: () => '', raster: async () => image('x') });
    expect(art).not.toBeNull();
    expect(art?.flame).toBeUndefined();
  });

  test('une Flamme qui ne se rasterise pas ne fait pas échouer la carte', async () => {
    const art = await loadArt({ root: frame([...ALL, 'flame']), read: () => '', raster: async (markup) => (markup.includes('data-slot="flame"') ? null : image('x')) });
    expect(art).not.toBeNull();
    expect(art?.flame).toBeUndefined();
  });
});
