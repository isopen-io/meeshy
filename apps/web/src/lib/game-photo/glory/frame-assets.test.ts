import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { PackAssetRef } from '@meeshy/shared/types/content-pack';
import { gloryFrameFormatAssets } from '@meeshy/shared/types/glory-frame-format';

import { readGloryFrame, type GloryFrame } from './frame-spec';
import { fontRequestsOf, loadGloryFrameImages, missingGloryFrameAssets, stickersOf, type ClosableImage, type GloryAssetDeps } from './frame-assets';

/**
 * LES IMAGES D'UN CADRE (#10159) — lues au magasin SANS réseau : une couche
 * absente rend le cadre « pas prêt », demande ce qui manque et rend `null`,
 * sans attendre ; les bitmaps se ferment ; les stickers viennent du catalogue
 * embarqué ; les polices sont attendues avant la peinture.
 */

const DESIGN = join(new URL('.', import.meta.url).pathname, '..', '..', '..', '..', '..', '..', 'packages', 'shared', 'design', 'glory-frames');
const savane = JSON.parse(readFileSync(join(DESIGN, 'savane.json'), 'utf8')) as { readonly frames: readonly unknown[] };
const frame = readGloryFrame(savane.frames[0]) as GloryFrame;
const format = frame.formats.story;

type Fake = { readonly name: string; closed: boolean; readonly close: () => void };

function deps(options: { readonly missing?: readonly string[]; readonly fonts?: string[] } = {}) {
  const requested: PackAssetRef[][] = [];
  const decoded: Fake[] = [];
  const rasters: string[] = [];
  const scales: number[] = [];
  const make = (name: string): ClosableImage => {
    const fake: Fake = { name, closed: false, close: () => void (fake.closed = true) };
    decoded.push(fake);
    return fake as unknown as ClosableImage;
  };
  const value: GloryAssetDeps = {
    read: async (ref) => ((options.missing ?? []).includes(ref.src) ? null : new Blob([ref.src])),
    request: (refs) => void requested.push([...refs]),
    decode: async (blob, _box, scale) => {
      scales.push(scale);
      return make(await blob.text());
    },
    rasterSticker: async (markup) => {
      rasters.push(markup);
      return make(markup);
    },
    stickerMarkup: (sticker) => (sticker === 'meo-salut' ? null : `<svg>${sticker}</svg>`),
    fonts: { load: async (font: string) => ((options.fonts ?? []).push(font), []) },
  };
  return { value, requested, decoded, rasters, scales };
}

describe('un cadre prêt', () => {
  test('toutes les couches du format sont lues et décodées, à l’échelle demandée, et les polices attendues', async () => {
    const fonts: string[] = [];
    const d = deps({ fonts });
    const images = await loadGloryFrameImages(format, null, d.value, 0.5);
    expect(images).not.toBeNull();
    const names = d.decoded.map((image) => image.name);
    for (const asset of gloryFrameFormatAssets(format)) expect(names).toContain(asset.src);
    expect(new Set(d.scales)).toEqual(new Set([0.5]));
    expect(images?.layers.grade).toHaveLength(format.layers.grade.length);
    expect(d.requested).toEqual([]);
    expect(fonts.length).toBeGreaterThan(0);
    expect(fonts).toEqual([...new Set(fonts)]);
  });

  test('les stickers de la pose viennent du catalogue ; un identifiant inconnu n’est pas rastérisé (le peintre a son repli)', async () => {
    const d = deps();
    const images = await loadGloryFrameImages(format, null, d.value);
    expect(stickersOf(format.birds, null)).toEqual(['mee-coucou', 'meo-salut']);
    expect(Object.keys(images?.birds ?? {})).toEqual(['mee-coucou']);
    expect(d.rasters).toEqual(['<svg>mee-coucou</svg>']);
  });

  test('close() rend chaque bitmap, stickers compris', async () => {
    const d = deps();
    const images = await loadGloryFrameImages(format, null, d.value);
    images?.close();
    expect(d.decoded.every((image) => image.closed)).toBe(true);
  });
});

describe('un cadre pas prêt', () => {
  test('une couche absente du magasin ⇒ null SANS attente : ce qui manque est demandé, ce qui était décodé est fermé', async () => {
    const missing = format.layers.decor.src;
    const d = deps({ missing: [missing] });
    const images = await loadGloryFrameImages(format, null, d.value);
    expect(images).toBeNull();
    expect(d.requested).toEqual([[{ src: format.layers.decor.src, bytes: format.layers.decor.bytes, sha256: format.layers.decor.sha256 }]]);
    expect(d.decoded.every((image) => image.closed)).toBe(true);
  });

  test('un décodage qui lève ne fait tomber que le cadre, jamais le déroulé', async () => {
    const d = deps();
    const broken: GloryAssetDeps = { ...d.value, decode: async () => Promise.reject(new Error('webp')) };
    expect(await loadGloryFrameImages(format, null, broken)).toBeNull();
    expect(d.requested.length).toBe(1);
  });
});

describe('ce que le format demande', () => {
  test('une requête de police par face du contrat', () => {
    const requests = fontRequestsOf(format);
    expect(requests.length).toBe(Object.keys(format.text).length);
    expect(requests.every((request) => typeof request.family === 'string' && request.weight >= 100)).toBe(true);
  });
});

describe('la présence d’un cadre (#10164)', () => {
  test('rien ne manque : la liste vide ; une couche absente : SA référence, et ce qui manque pèse ses octets', async () => {
    const assets = gloryFrameFormatAssets(format);
    const gone = assets[1]!;
    expect(await missingGloryFrameAssets(format, deps().value)).toEqual([]);
    const missing = await missingGloryFrameAssets(format, deps({ missing: [gone.src] }).value);
    expect(missing).toEqual([gone]);
  });

  test('`has` répond sans lire les octets quand le magasin le sait', async () => {
    const asked: string[] = [];
    const base = deps().value;
    const value: GloryAssetDeps = { ...base, read: async () => { throw new Error('lu'); }, has: async (ref) => (asked.push(ref.src), ref.src !== gloryFrameFormatAssets(format)[0]!.src) };
    const missing = await missingGloryFrameAssets(format, value);
    expect(missing.map((ref) => ref.src)).toEqual([gloryFrameFormatAssets(format)[0]!.src]);
    expect(asked.length).toBe(gloryFrameFormatAssets(format).length);
  });
});
