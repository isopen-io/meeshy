import { describe, expect, test } from 'bun:test';

import type { Lens, LensLayer } from '@meeshy/shared/types/lens-format';

import { lensAssetsOf, loadLensFiles, type LensFiles } from './lens-files';
import { identityStrip, lutCubeOf, type LutCube } from './lens-lut';
import type { LutStage } from './lens-lut-stage';
import { createLensStage, type LensSettings, type LensStageEnv } from './lens-stage';

/**
 * #11994 — LES FICHIERS D'UNE LENS SONT REMIS PAR L'HÔTE. Le contrat v1
 * interdit tout réseau à une lens : l'hôte lit les fichiers de son pack (la
 * bande de sa LUT, les images de ses stickers), les décode, et les remet au
 * worker DANS ses réglages (`LensSettings.files`) — le seul message qu'il lui
 * envoie déjà. L'étage les lit, et n'ouvre rien.
 */
const LUT_ASSET = 'aaaaaaaaaaaaaaaa.png';
const STAR_ASSET = 'bbbbbbbbbbbbbbbb.webp';
const MOON_ASSET = 'cccccccccccccccc.webp';

const lensOf = (layers: readonly LensLayer[]): Lens => ({
  schema: 1,
  id: 'essai',
  name: 'Essai',
  credits: { author: 'Studio', createdAt: '2026-10-01' },
  surfaces: ['live'],
  cost: 'light',
  window: { startsAt: '2026-10-01T00:00:00Z', endsAt: '2026-12-31T00:00:00Z' },
  layers,
  triggers: [],
});

const lut: LensLayer = { kind: 'lut', id: 'g', asset: LUT_ASSET, intensity: 0.8 };
const sticker = (id: string, asset: string): LensLayer => ({ kind: 'sticker', id, asset, anchor: { type: 'screen', x: 0.5, y: 0.5 }, size: 0.2 });
const LENS = lensOf([lut, sticker('etoile', STAR_ASSET), sticker('etoile-2', STAR_ASSET), sticker('lune', MOON_ASSET), { kind: 'particles', id: 'neige', preset: 'snow', density: 'low' }]);

const cube = (): LutCube => {
  const made = lutCubeOf(identityStrip(16));
  if (made === null) throw new Error('cube');
  return made;
};

type Bitmap = { readonly name: string };

describe('lensAssetsOf — ce que la lens déclare, une fois chacun', () => {
  test('la bande de la LUT et les images des stickers, sans doublon', () => {
    expect(lensAssetsOf(LENS)).toEqual({ luts: [LUT_ASSET], images: [STAR_ASSET, MOON_ASSET] });
  });

  test('une lens sans fichier n’en demande aucun', () => {
    expect(lensAssetsOf(lensOf([{ kind: 'particles', id: 'neige', preset: 'snow', density: 'low' }]))).toEqual({ luts: [], images: [] });
  });
});

describe('loadLensFiles — l’hôte lit, décode, et remet', () => {
  const deps = (missing: ReadonlySet<string> = new Set()) => {
    const read: string[] = [];
    return {
      read,
      deps: {
        read: async (asset: string) => (read.push(asset), missing.has(asset) ? null : new Blob([asset])),
        decode: async (blob: Blob): Promise<Bitmap> => ({ name: await blob.text() }),
        stripOf: () => identityStrip(16),
      },
    };
  };

  test('la LUT devient un cube, chaque sticker une image décodée', async () => {
    const { deps: d, read } = deps();
    const files = await loadLensFiles(LENS, d);
    expect(read).toEqual([LUT_ASSET, STAR_ASSET, MOON_ASSET]);
    expect(files.cubes[LUT_ASSET]?.size).toBe(16);
    expect(files.images[STAR_ASSET]).toEqual({ name: STAR_ASSET });
    expect(files.images[MOON_ASSET]).toEqual({ name: MOON_ASSET });
  });

  test('un fichier absent, illisible ou qui n’a pas la forme d’une bande manque seul : le reste est remis', async () => {
    const { deps: d } = deps(new Set([MOON_ASSET]));
    const files = await loadLensFiles(LENS, { ...d, stripOf: () => ({ width: 3, height: 3, data: new Uint8ClampedArray(36) }) });
    expect(files.cubes[LUT_ASSET]).toBeUndefined();
    expect(files.images[MOON_ASSET]).toBeUndefined();
    expect(files.images[STAR_ASSET]).toEqual({ name: STAR_ASSET });
    const failing = await loadLensFiles(LENS, { ...d, decode: async () => Promise.reject(new Error('illisible')) });
    expect(failing).toEqual({ cubes: {}, images: {} });
  });
});

describe('createLensStage — l’étage lit les fichiers remis dans les réglages', () => {
  const frame = { name: 'image' } as unknown as CanvasImageSource;
  const graded = { name: 'graded' } as unknown as CanvasImageSource;
  const size = { width: 1280, height: 720 };
  const env = (render: LutStage['render']): LensStageEnv => ({
    face: () => ({ x: 0, y: 0, width: 10, height: 10 }),
    cube: () => null,
    lut: () => ({ render, release: () => undefined }),
    paint: { assets: () => null },
  });
  const settings = (files?: LensFiles): LensSettings => ({ lens: LENS, languages: ['fr'], level: 'full', ...(files === undefined ? {} : { files }) });

  test('le cube remis étalonne l’image ; sans fichier remis, l’image part telle quelle', () => {
    const used: LutCube[] = [];
    const stage = createLensStage(env((_s, _w, _h, c) => (used.push(c), graded)));
    const remis = cube();
    expect(stage.grade(frame, settings({ cubes: { [LUT_ASSET]: remis }, images: {} }), size)).toBe(graded);
    expect(used).toEqual([remis]);
    expect(createLensStage(env(() => graded)).grade(frame, settings(), size)).toBe(frame);
  });

  test('des réglages sans fichiers gardent ceux déjà remis : un réglage voisin ne les recopie pas', () => {
    const used: LutCube[] = [];
    const stage = createLensStage(env((_s, _w, _h, c) => (used.push(c), graded)));
    const remis = cube();
    stage.grade(frame, settings({ cubes: { [LUT_ASSET]: remis }, images: {} }), size);
    expect(stage.grade(frame, settings(), size)).toBe(graded);
    expect(used).toEqual([remis, remis]);
  });

  test('l’image remise d’un sticker est peinte ; un sticker sans image ne l’est pas', () => {
    const star = { name: 'star' } as unknown as ImageBitmap;
    const stage = createLensStage(env(() => graded));
    const drawn: unknown[] = [];
    const context = {
      save: () => undefined,
      restore: () => undefined,
      translate: () => undefined,
      rotate: () => undefined,
      beginPath: () => undefined,
      arc: () => undefined,
      fill: () => undefined,
      fillText: () => undefined,
      drawImage: (image: unknown) => void drawn.push(image),
    } as unknown as Parameters<typeof stage.paint>[0];
    const remis = settings({ cubes: {}, images: { [STAR_ASSET]: star } });
    stage.paint(context, stage.plan(remis, frame, size, 0), size);
    expect(drawn).toEqual([star, star]);
  });
});
