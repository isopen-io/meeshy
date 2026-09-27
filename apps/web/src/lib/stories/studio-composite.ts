import { SCENE_BACKDROP_TINT } from '@/lib/canvas/backdrop';
import { placedMediaDesignSize } from '@/lib/canvas/media-size';
import { rgbaToThumbHash, thumbHashToBase64 } from '@/lib/media/thumbhash-image';

import { STORY_PLAIN_BACKGROUND } from './story-document';
import type { StudioPage, StudioVisualAsset } from './studio-page';

/**
 * **LE COMPOSITE DE LA SCÈNE, HACHÉ AU COMPOSER** (#8425, retour de revue de
 * #8413) — iOS peint le sol du thumbhash du RÉSULTAT de la slide
 * (`StorySlideRenderer.computeThumbHash`) ; le web le calcule désormais aussi :
 * un rendu réduit de la scène dans un canvas hors écran, encodé par
 * `rgbaToThumbHash`.
 *
 * Deux moitiés, pour que la loi se teste sans navigateur :
 *  - `studioCompositePlan` (PURE) dit QUOI dessiner, en fractions de la carte :
 *    l'aplat de la scène, le fond (et, ajusté, ce qui l'entoure — le Cadre,
 *    #8414), le calque à sa pose ;
 *  - `renderStudioComposite` l'exécute. Sans canvas 2D (tests), sur une image
 *    qui ne se charge pas ou un canvas « teinté » (média d'une autre origine),
 *    il rend `null` : le sol retombe sur le hash du fond (`studio-floor.ts`).
 *
 * Ce que le rendu réduit IGNORE, assumé : les TEXTES (à 32 px de hash, un titre
 * n'est qu'une nuance, et le rasteriser demanderait les polices embarquées) et
 * les VIDÉOS (une image de vidéo ne se dessine qu'une fois décodée à l'écran —
 * une vidéo rend `null`, et le repli sert).
 */
export const STUDIO_COMPOSITE_SIZE = { width: 56, height: 100 } as const;

const CARD_RATIO = 9 / 16;
const DESIGN_WIDTH = 1080;

export type StudioCompositeOp =
  | { readonly kind: 'fill'; readonly color: string }
  /** Un rectangle CENTRÉ en (`x`, `y`), de `width` × `height` — fractions de
   * la carte (largeur pour x/width, hauteur pour y/height). */
  | {
      readonly kind: 'image';
      readonly src: string;
      readonly blur: boolean;
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
      readonly rotation: number;
    };

/** Le rectangle d'un média de rapport `ratio` posé plein cadre : `cover`
 * remplit (et déborde), sinon ajusté (et laisse des bandes). */
function fitted(ratio: number, cover: boolean): { readonly width: number; readonly height: number } {
  const wider = ratio > CARD_RATIO;
  return wider === cover ? { width: ratio / CARD_RATIO, height: 1 } : { width: 1, height: CARD_RATIO / ratio };
}

const drawable = (asset: StudioVisualAsset | null): asset is StudioVisualAsset & { readonly aspectRatio: number } =>
  asset !== null && asset.mediaType === 'image' && asset.aspectRatio !== undefined && asset.aspectRatio > 0;

export function studioCompositePlan(page: StudioPage): readonly StudioCompositeOp[] | null {
  const { background, overlay } = page;
  if (background === null && overlay === null) return null;
  if ((background !== null && !drawable(background)) || (overlay !== null && !drawable(overlay))) return null;
  const ops: StudioCompositeOp[] = [{ kind: 'fill', color: `#${STORY_PLAIN_BACKGROUND}` }];
  if (drawable(background)) {
    const fitMode = background.frame?.fitMode ?? 'fit';
    const backdrop = background.frame?.backdrop ?? 'blur';
    const image = (rect: { readonly width: number; readonly height: number }, blur: boolean): StudioCompositeOp => ({
      kind: 'image',
      src: background.previewUrl,
      blur,
      x: 0.5,
      y: 0.5,
      rotation: 0,
      ...rect,
    });
    if (fitMode === 'fit') ops.push(backdrop === 'blur' ? image(fitted(background.aspectRatio, true), true) : { kind: 'fill', color: SCENE_BACKDROP_TINT[backdrop] });
    ops.push(image(fitted(background.aspectRatio, fitMode === 'fill'), false));
  }
  if (drawable(overlay)) {
    const size = placedMediaDesignSize({ aspectRatio: overlay.aspectRatio });
    const width = (size.width / DESIGN_WIDTH) * overlay.pose.scale;
    ops.push({
      kind: 'image',
      src: overlay.previewUrl,
      blur: false,
      x: overlay.pose.x,
      y: overlay.pose.y,
      width,
      height: (width * CARD_RATIO) / overlay.aspectRatio,
      rotation: overlay.pose.rotation,
    });
  }
  return ops;
}

type Context2D = Pick<
  CanvasRenderingContext2D,
  'fillStyle' | 'fillRect' | 'drawImage' | 'save' | 'restore' | 'translate' | 'rotate' | 'filter' | 'getImageData'
>;

export type StudioCompositeDeps = {
  readonly createCanvas: (width: number, height: number) => Context2D | null;
  readonly loadImage: (src: string) => Promise<CanvasImageSource | null>;
};

/** Le rendu réduit, encodé en thumbhash (base64) — `null` dès qu'une étape
 * manque (voir l'en-tête). */
export async function renderStudioComposite(plan: readonly StudioCompositeOp[], deps: StudioCompositeDeps): Promise<string | null> {
  const { width: w, height: h } = STUDIO_COMPOSITE_SIZE;
  const context = deps.createCanvas(w, h);
  if (context === null) return null;
  const sources = new Map<string, CanvasImageSource>();
  for (const op of plan) {
    if (op.kind !== 'image' || sources.has(op.src)) continue;
    const image = await deps.loadImage(op.src);
    if (image === null) return null;
    sources.set(op.src, image);
  }
  plan.forEach((op) => {
    if (op.kind === 'fill') {
      context.fillStyle = op.color;
      context.fillRect(0, 0, w, h);
      return;
    }
    const image = sources.get(op.src);
    if (image === undefined) return;
    context.save();
    context.translate(op.x * w, op.y * h);
    context.rotate((op.rotation * Math.PI) / 180);
    context.filter = op.blur ? 'blur(4px)' : 'none';
    context.drawImage(image, (-op.width * w) / 2, (-op.height * h) / 2, op.width * w, op.height * h);
    context.restore();
  });
  try {
    const pixels = context.getImageData(0, 0, w, h).data;
    return thumbHashToBase64(rgbaToThumbHash(w, h, new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength)));
  } catch {
    return null;
  }
}

/** Le navigateur réel — un canvas hors écran et une `Image` décodée. */
export const browserCompositeDeps: StudioCompositeDeps = {
  createCanvas: (width, height) => {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    try {
      return canvas.getContext('2d', { willReadFrequently: true });
    } catch {
      return null;
    }
  },
  loadImage: async (src) => {
    if (typeof Image === 'undefined') return null;
    const image = new Image();
    image.decoding = 'async';
    image.src = src;
    try {
      await image.decode();
      return image;
    } catch {
      return null;
    }
  },
};
