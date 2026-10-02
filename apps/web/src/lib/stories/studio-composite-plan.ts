import { SCENE_BACKDROP_TINT } from '@/lib/canvas/backdrop';
import { placedMediaDesignSize } from '@/lib/canvas/media-size';

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

/** `video` : la retouche d'une VIDÉO (#9124) peint l'image courante d'un
 * `<video>` qui joue — le hash du sol, lui, n'en dessine aucune. */
export function studioCompositePlan(page: StudioPage, { video = false }: { readonly video?: boolean } = {}): readonly StudioCompositeOp[] | null {
  const drawable = (asset: StudioVisualAsset | null): asset is StudioVisualAsset & { readonly aspectRatio: number } =>
    asset !== null && (asset.mediaType === 'image' || (video && asset.mediaType === 'video')) && asset.aspectRatio !== undefined && asset.aspectRatio > 0;
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

export type Context2D = Pick<
  CanvasRenderingContext2D,
  'fillStyle' | 'fillRect' | 'drawImage' | 'save' | 'restore' | 'translate' | 'rotate' | 'filter' | 'getImageData'
>;

export type StudioCompositeDeps = {
  readonly createCanvas: (width: number, height: number) => Context2D | null;
  readonly loadImage: (src: string) => Promise<CanvasImageSource | null>;
};


/** Les images du plan, décodées une fois chacune — `null` dès qu'une manque. */
export async function loadPlanSources(
  plan: readonly StudioCompositeOp[],
  loadImage: (src: string) => Promise<CanvasImageSource | null>,
): Promise<ReadonlyMap<string, CanvasImageSource> | null> {
  const sources = new Map<string, CanvasImageSource>();
  for (const op of plan) {
    if (op.kind !== 'image' || sources.has(op.src)) continue;
    const image = await loadImage(op.src);
    if (image === null) return null;
    sources.set(op.src, image);
  }
  return sources;
}

/** PEINDRE le plan sur un contexte de `size` — la même peinture pour le hash
 * du sol (56×100) et pour la retouche (1080×1920) ; le flou suit la taille. */
export function paintCompositePlan(
  context: Context2D,
  plan: readonly StudioCompositeOp[],
  sources: ReadonlyMap<string, CanvasImageSource>,
  size: { readonly width: number; readonly height: number },
): void {
  const { width: w, height: h } = size;
  const blur = `blur(${Math.max(1, Math.round(w * 0.07))}px)`;
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
    context.filter = op.blur ? blur : 'none';
    context.drawImage(image, (-op.width * w) / 2, (-op.height * h) / 2, op.width * w, op.height * h);
    context.restore();
  });
}
