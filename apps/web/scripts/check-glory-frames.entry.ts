/**
 * LA PAGE DU GATE DE FIDÉLITÉ DES CADRES DE GLOIRE (#10159, § 8.3) — côté
 * navigateur. Construite par `check-glory-frames.ts` (Bun.build), jamais par
 * Vite : elle n'entre pas dans l'application. Elle expose `window.gloryGate` :
 * composer UN cadre avec le VRAI peintre, à partir des MÊMES entrées que les
 * cibles de L21a — le contrat du manifeste, les couches du magasin, la photo
 * fixture, les stickers PNG du générateur, les textes d'exemple de l'export.
 */
import type { GloryFrameTextSlot } from '@meeshy/shared/types/glory-frame-format';

import { fontRequestsOf, stickersOf } from '../src/lib/game-photo/glory/frame-assets';
import { anchorsOf, birdLayoutOf, readGloryFrame, type GloryTexts } from '../src/lib/game-photo/glory/frame-spec';
import { paintGloryFrame, type GloryBirdImages, type GloryLayerImages, type PaintSurface } from '../src/lib/game-photo/glory/paint-glory-frame';
import { loadGloryFonts } from '../src/lib/game-photo/glory-fonts';
import type { PaintContext, PhotoArt, PhotoPalette, PhotoSource } from '../src/lib/game-photo/compose';

type ComposeInput = {
  readonly frame: unknown;
  readonly variant: 'plain' | 'message';
  readonly layers: string;
  readonly mee: string;
  readonly photo: string;
};

type ComposeOutput = {
  readonly png: string;
  readonly stable: boolean;
  readonly excluded: readonly (readonly [number, number, number, number])[];
  /** Les boîtes des oiseaux, À PART : le pilote y ajoute la place que les ancres du générateur leur donnent dans la cible. */
  readonly birds: readonly (readonly [number, number, number, number])[];
  readonly size: readonly [number, number];
};

const bitmap = async (url: string): Promise<ImageBitmap> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} : ${response.status}`);
  return createImageBitmap(await response.blob());
};

const canvasOf = (width: number, height: number): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
};

const scratch = (width: number, height: number): PaintSurface | null => {
  const canvas = canvasOf(width, height);
  const ctx = canvas.getContext('2d');
  return ctx === null ? null : { ctx: ctx as unknown as PaintContext, image: canvas };
};

/** Un dessin vide : le blason est hors de la comparaison (§ 8.3), il ne doit pas déborder de son ancre. */
const blank = (): CanvasImageSource => canvasOf(1, 1);

const PALETTE: PhotoPalette = { top: '#000000', bottom: '#000000', ink: '#FFFFFF', inkSoft: '#DDDDDD', scrim: '#000000' };

const samplesOf = (text: Readonly<Record<string, GloryFrameTextSlot>>, variant: ComposeInput['variant']): GloryTexts => ({
  kicker: text.kicker?.sample ?? null,
  title: text.title?.sample ?? null,
  date: text.date?.sample ?? null,
  message: variant === 'message' ? (text.message?.sample ?? null) : null,
  'plate.1': text['plate.1']?.sample ?? null,
});

async function compose(input: ComposeInput): Promise<ComposeOutput> {
  const frame = readGloryFrame(input.frame);
  if (frame === null) throw new Error('cadre illisible par le schéma partagé');
  const format = frame.formats.story;
  const layerOf = (ref: { readonly src: string }) => bitmap(`${input.layers}/${ref.src}`);
  const optional = async (ref: { readonly src: string } | undefined) => (ref === undefined ? undefined : layerOf(ref));
  const [mask, decor, windowFill, grade, under, over, plain, message, photoImage] = await Promise.all([
    layerOf(format.window.mask),
    layerOf(format.layers.decor),
    layerOf(format.layers.windowFill),
    Promise.all(format.layers.grade.map(layerOf)),
    optional(format.layers.front['under-birds']),
    optional(format.layers.front['over-birds']),
    optional(format.layers.plate.plain),
    optional(format.layers.plate.message),
    bitmap(input.photo),
  ]);
  const layers: GloryLayerImages = {
    mask,
    decor,
    windowFill,
    grade,
    front: { ...(under ? { 'under-birds': under } : {}), ...(over ? { 'over-birds': over } : {}) },
    plate: { ...(plain ? { plain } : {}), ...(message ? { message } : {}) },
  };
  const stickers = stickersOf(format.birds, null);
  const birds: GloryBirdImages = Object.fromEntries(await Promise.all(stickers.map(async (sticker) => [sticker, await bitmap(`${input.mee}/${sticker}.png`)] as const)));
  await loadGloryFonts(fontRequestsOf(format));
  const art: PhotoArt = { emblem: blank(), mee: blank(), meo: blank(), signature: blank() };
  const photo: PhotoSource = { image: photoImage, width: photoImage.width, height: photoImage.height, mirror: false };
  const paintOnce = (): string => {
    const canvas = canvasOf(format.size[0], format.size[1]);
    const ctx = canvas.getContext('2d');
    if (ctx === null) throw new Error('canvas 2d indisponible');
    paintGloryFrame(ctx as unknown as PaintContext, {
      format,
      layers,
      birds,
      recipe: { pose: null, message: input.variant === 'message' ? (format.text.message?.sample ?? null) : null, crop: { dx: 0, dy: 0, zoom: 1 }, showFlame: false, showLink: false },
      texts: samplesOf(format.text, input.variant),
      photo,
      art,
      palette: PALETTE,
      fontFamily: 'sans-serif',
      rtl: false,
      language: 'fr',
      scratch,
    });
    return canvas.toDataURL('image/png');
  };
  const first = paintOnce();
  const second = paintOnce();
  const layout = birdLayoutOf(format.birds, null);
  const crest = format.crest === null ? [] : [format.crest.box];
  const texts = Object.values(format.text).map((slot) => slot.bbox);
  const birdBoxes = layout === undefined ? [] : anchorsOf(layout).map((anchor) => anchor.box);
  return { png: first, stable: first === second, excluded: [...crest, ...texts], birds: birdBoxes, size: format.size };
}

(window as unknown as { gloryGate: { compose: typeof compose } }).gloryGate = { compose };
document.body.dataset.ready = 'true';
