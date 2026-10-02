import { sceneTextAppearance } from '@/lib/canvas/text-appearance';

import {
  backgroundShownRatio,
  loadPlanSources,
  paintCompositePlan,
  studioCompositePlan,
  type Context2D,
  type StudioCompositeOp,
} from './studio-composite-plan';
import { STORY_PLAIN_BACKGROUND } from './story-document';
import type { StudioPage, StudioVisualAsset } from './studio-page';
import { textLayerPayload } from './studio-text';

/**
 * **LA RETOUCHE D'UNE IMAGE DU FIL** (#8416, miroir
 * `MeeshyComposerHost+ReturnImage.swift`) — « Terminé » rend la scène
 * ENTIÈRE dans un canvas hors écran, à la taille réelle d'une scène 9:16
 * (grand côté 1920 px), en JPEG : ce fichier REMPLACE la pièce jointe en
 * attente du brouillon. Rien n'est envoyé.
 *
 * La peinture reprend le plan du sol (`paintCompositePlan` : fond, Cadre,
 * calque) et y ajoute les TEXTES, à leur pose, dans leur famille, leur graisse,
 * leur couleur et leur pastille (`sceneTextAppearance`, la même lecture que le
 * moteur). Les effets de texte (néon, contour, ombres) ne sont pas rasterisés :
 * le texte part net, sans son effet.
 */
export const STUDIO_RETOUCH_SIZE = { width: 1080, height: 1920 } as const;

const JPEG_QUALITY = 0.9;
/** La boîte d'un texte ne dépasse pas 85 % de la scène (`scene-object-text.tsx`). */
const TEXT_MAX_WIDTH = 0.85;
const DESIGN_WIDTH = 1080;
const LINE_HEIGHT = 1.2;

export type StudioTextOp = {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  readonly scale: number;
  /** La taille en FRACTION de la largeur de la scène (`cqw`). */
  readonly size: number;
  readonly color: string;
  readonly font: string;
  readonly align: 'left' | 'center' | 'right';
  readonly background: string | undefined;
};

export function studioTextOps(page: StudioPage): readonly StudioTextOp[] {
  return page.texts
    .filter((layer) => layer.text.trim() !== '')
    .map((layer) => {
      const payload = textLayerPayload(layer);
      const appearance = sceneTextAppearance(payload);
      const fontSize = typeof payload.fontSize === 'number' ? payload.fontSize : 64;
      return {
        text: layer.text,
        x: layer.pose.x,
        y: layer.pose.y,
        rotation: layer.pose.rotation,
        scale: layer.pose.scale,
        size: fontSize / DESIGN_WIDTH,
        color: `#${layer.color}`,
        font: `${appearance.fontStyle ?? 'normal'} ${appearance.fontWeight ?? 700} {px}px ${appearance.fontFamily ?? 'system-ui, sans-serif'}`,
        align: appearance.textAlign,
        background: appearance.backgroundColor,
      };
    });
}

export type StudioRetouchCanvas = {
  readonly context: Context2D & Pick<CanvasRenderingContext2D, 'fillText' | 'measureText' | 'font' | 'textAlign' | 'textBaseline' | 'scale'>;
  readonly toBlob: (type: string, quality: number) => Promise<Blob | null>;
};

export type StudioRetouchDeps = {
  readonly createCanvas: (width: number, height: number) => StudioRetouchCanvas | null;
  readonly loadImage: (src: string) => Promise<CanvasImageSource | null>;
};

/** Les lignes d'un texte, coupées aux mots à `maxWidth` et aux sauts de ligne. */
function wrap(context: StudioRetouchCanvas['context'], text: string, maxWidth: number): readonly string[] {
  return text.split('\n').flatMap((paragraph) =>
    paragraph.split(' ').reduce<string[]>((lines, word) => {
      const last = lines[lines.length - 1];
      if (last === undefined) return [word];
      const candidate = `${last} ${word}`;
      return context.measureText(candidate).width <= maxWidth ? [...lines.slice(0, -1), candidate] : [...lines, word];
    }, []),
  );
}

export function paintText(canvas: StudioRetouchCanvas['context'], op: StudioTextOp, width: number, height: number): void {
  const px = op.size * width;
  canvas.save();
  canvas.translate(op.x * width, op.y * height);
  canvas.rotate((op.rotation * Math.PI) / 180);
  canvas.scale(op.scale, op.scale);
  canvas.font = op.font.replace('{px}', String(Math.round(px)));
  canvas.textBaseline = 'middle';
  const lines = wrap(canvas, op.text, TEXT_MAX_WIDTH * width);
  const lineHeight = px * LINE_HEIGHT;
  const blockWidth = Math.max(...lines.map((line) => canvas.measureText(line).width));
  const top = (-lines.length * lineHeight) / 2;
  const anchorX = op.align === 'left' ? -blockWidth / 2 : op.align === 'right' ? blockWidth / 2 : 0;
  if (op.background !== undefined) {
    const pad = px * 0.3;
    canvas.fillStyle = op.background;
    canvas.fillRect(-blockWidth / 2 - pad, top - pad, blockWidth + 2 * pad, lines.length * lineHeight + 2 * pad);
  }
  canvas.fillStyle = op.color;
  canvas.textAlign = op.align;
  lines.forEach((line, index) => canvas.fillText(line, anchorX, top + lineHeight * (index + 0.5)));
  canvas.restore();
}

/** Le rapport d'une image que la mesure à la sélection n'a pas encore rendu
 * (« Terminé » touché aussitôt) — relu sur l'image DÉCODÉE. */
export async function withMeasuredImages(page: StudioPage, loadImage: StudioRetouchDeps['loadImage']): Promise<StudioPage> {
  const measured = async (asset: StudioVisualAsset | null): Promise<StudioVisualAsset | null> => {
    if (asset === null || asset.mediaType !== 'image' || asset.aspectRatio !== undefined) return asset;
    const image = await loadImage(asset.previewUrl);
    const width = image !== null && 'naturalWidth' in image ? Number(image.naturalWidth) : 0;
    const height = image !== null && 'naturalHeight' in image ? Number(image.naturalHeight) : 0;
    return width > 0 && height > 0 ? { ...asset, aspectRatio: width / height } : asset;
  };
  return { ...page, background: await measured(page.background), overlay: await measured(page.overlay) };
}

/** **LA TAILLE DU RENDU** (#9136, miroir `ComposerRetouchSeries.imageRenderSize`)
 * — le cadre RECADRÉ du fond quand l'auteur l'a recadré (un carré repart
 * carré), grand côté 1920 ; sinon la scène 9:16. */
export function studioRetouchSize(page: StudioPage): { readonly width: number; readonly height: number } {
  const background = page.background;
  if (background === null || background.crop === undefined || background.aspectRatio === undefined || background.aspectRatio <= 0) return STUDIO_RETOUCH_SIZE;
  const ratio = backgroundShownRatio({ ...background, aspectRatio: background.aspectRatio });
  const long = STUDIO_RETOUCH_SIZE.height;
  return ratio >= 1 ? { width: long, height: Math.round(long / ratio) } : { width: Math.round(long * ratio), height: long };
}

/** Le JPEG de la scène — `null` quand le rendu est impossible (pas de canvas,
 * une image qui ne se décode pas, un média qui ne se dessine pas : vidéo). */
export async function renderStudioRetouch(unmeasured: StudioPage, deps: StudioRetouchDeps): Promise<Blob | null> {
  const page = await withMeasuredImages(unmeasured, deps.loadImage);
  const hasMedia = page.background !== null || page.overlay !== null;
  const size = studioRetouchSize(page);
  const plan: readonly StudioCompositeOp[] | null = hasMedia
    ? studioCompositePlan(page, { cardRatio: size.width / size.height })
    : [{ kind: 'fill', color: `#${STORY_PLAIN_BACKGROUND}` }];
  if (plan === null) return null;
  const { width, height } = size;
  const canvas = deps.createCanvas(width, height);
  if (canvas === null) return null;
  const sources = await loadPlanSources(plan, deps.loadImage);
  if (sources === null) return null;
  paintCompositePlan(canvas.context, plan, sources, size);
  studioTextOps(page).forEach((op) => paintText(canvas.context, op, width, height));
  return canvas.toBlob('image/jpeg', JPEG_QUALITY);
}

export function retouchedFileName(name: string): string {
  const dot = name.lastIndexOf('.');
  return `${dot > 0 ? name.slice(0, dot) : name}-retouche.jpg`;
}

/** Le navigateur réel — un canvas hors écran à la taille réelle. Les polices
 * embarquées se chargent AVANT de peindre, sans quoi le texte partirait dans
 * la police de repli. */
export const browserRetouchDeps: StudioRetouchDeps = {
  createCanvas: (width, height) => {
    if (typeof document === 'undefined') return null;
    const element = document.createElement('canvas');
    element.width = width;
    element.height = height;
    const context = element.getContext('2d');
    if (context === null) return null;
    return {
      context,
      toBlob: (type, quality) => new Promise((resolve) => element.toBlob((blob) => resolve(blob), type, quality)),
    };
  },
  loadImage: async (src) => {
    if (typeof Image === 'undefined') return null;
    const image = new Image();
    image.src = src;
    try {
      await image.decode();
      await document.fonts?.ready;
      return image;
    } catch {
      return null;
    }
  },
};
