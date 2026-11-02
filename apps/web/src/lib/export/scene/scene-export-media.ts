import type { MediaCropRect } from '@meeshy/shared/utils/media-crop';
import type { MediaAdjustmentTarget } from '@meeshy/shared/utils/media-adjustments';

import { BLOOM_RADIUS_FRACTION, mediaAdjustmentLayers, mediaAdjustmentsPaint, type MediaAdjustmentLayer } from '@/lib/canvas/media-adjustments';
import { mediaFilterCss } from '@/lib/canvas/media-filter';

import type { ScenePaintable } from './scene-export-paint';

/**
 * **L'ASPECT D'UN MÉDIA, PEINT PAR L'EXPORT** (#13880) — ce que le lecteur
 * pose sur une image ou une vidéo (`SceneObjectMedia`, `SceneObjectBackground`),
 * rejoué sur le canvas avec les MÊMES lois : le filtre de l'auteur
 * (`mediaFilterCss`) puis ses réglages (`mediaAdjustmentsPaint`, le flou
 * compté en pixels du canvas), le bloom en halo (le média flouté de
 * `BLOOM_RADIUS_FRACTION` de sa largeur, atténué, fondu en `screen` — le
 * filtre SVG `MediaGlowFilter`), puis les calques dans la boîte du média
 * (`mediaAdjustmentLayers` : teinte en lumière douce, vignette elliptique,
 * grain).
 */

export type Size = { readonly width: number; readonly height: number };
export type Rect = Size & { readonly x: number; readonly y: number };
export type Placement = { readonly from: Rect; readonly to: Rect };

export function sourceSize(source: CanvasImageSource): Size | null {
  const record = source as unknown as Record<string, unknown>;
  const pick = (...keys: readonly string[]): number => {
    const value = keys.map((key) => record[key]).find((candidate): candidate is number => typeof candidate === 'number' && candidate > 0);
    return value ?? 0;
  };
  const width = pick('videoWidth', 'naturalWidth', 'displayWidth', 'width');
  const height = pick('videoHeight', 'naturalHeight', 'displayHeight', 'height');
  return width > 0 && height > 0 ? { width, height } : null;
}

const cropRectOf = (size: Size, crop: MediaCropRect | null): Rect =>
  crop === null ? { x: 0, y: 0, ...size } : { x: crop.x * size.width, y: crop.y * size.height, width: crop.width * size.width, height: crop.height * size.height };

/** `object-cover` (rempli) ou `object-contain` (ajusté) d'une source dans une boîte, après son recadrage. */
export function placementOf(source: CanvasImageSource, box: Rect, mode: 'cover' | 'contain', crop: MediaCropRect | null): Placement | null {
  const size = sourceSize(source);
  if (size === null) return null;
  const cropped = cropRectOf(size, crop);
  const scale = mode === 'cover' ? Math.max(box.width / cropped.width, box.height / cropped.height) : Math.min(box.width / cropped.width, box.height / cropped.height);
  if (mode === 'contain') {
    const width = cropped.width * scale;
    const height = cropped.height * scale;
    return { from: cropped, to: { x: box.x + (box.width - width) / 2, y: box.y + (box.height - height) / 2, width, height } };
  }
  const width = box.width / scale;
  const height = box.height / scale;
  return { from: { x: cropped.x + (cropped.width - width) / 2, y: cropped.y + (cropped.height - height) / 2, width, height }, to: box };
}

export function drawPlacement(ctx: ScenePaintable, source: CanvasImageSource, { from, to }: Placement): void {
  ctx.drawImage(source, from.x, from.y, from.width, from.height, to.x, to.y, to.width, to.height);
}

export type MediaLook = {
  readonly filter: string | undefined;
  readonly glow: number | undefined;
  readonly layers: readonly MediaAdjustmentLayer[];
};

const round2 = (value: number): number => Math.round(value * 100) / 100;

export function mediaLookOf(
  payload: Readonly<Record<string, unknown>>,
  options: { readonly target: MediaAdjustmentTarget; readonly designPixelsPerSourcePixel?: number; readonly pixelsPerDesignPixel: number },
): MediaLook {
  const adjustments = mediaAdjustmentsPaint(payload, {
    target: options.target,
    ...(options.designPixelsPerSourcePixel !== undefined ? { designPixelsPerSourcePixel: options.designPixelsPerSourcePixel } : {}),
    blurLength: (designPixels) => `${round2(designPixels * options.pixelsPerDesignPixel)}px`,
  });
  const chain = [mediaFilterCss(payload), adjustments.filter].filter((step): step is string => step !== undefined);
  return { filter: chain.length === 0 ? undefined : chain.join(' '), glow: adjustments.glow, layers: mediaAdjustmentLayers(payload, options.target) };
}

/** Une tuile de bruit noir dont l'alpha va jusqu'à `alpha` — `null` sans canvas où la tisser. */
export type GrainTile = (alpha: number) => CanvasImageSource | null;

function paintLayer(ctx: ScenePaintable, layer: MediaAdjustmentLayer, box: Rect, grainTile: GrainTile): void {
  if (layer.kind === 'grain') {
    const tile = grainTile(layer.alpha);
    const pattern = tile === null ? null : ctx.createPattern(tile, 'repeat');
    if (pattern === null) return;
    ctx.fillStyle = pattern;
    ctx.fillRect(box.x, box.y, box.width, box.height);
    return;
  }
  if (layer.kind === 'tint') {
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = `rgba(${layer.rgb}, ${layer.alpha})`;
    ctx.fillRect(box.x, box.y, box.width, box.height);
    ctx.restore();
    return;
  }
  /* `radial-gradient(ellipse at center …)` va jusqu'au coin le plus lointain :
     des rayons de √2 × la demi-boîte, sur chaque axe. */
  ctx.save();
  ctx.translate(box.x + box.width / 2, box.y + box.height / 2);
  ctx.scale(1, box.height / box.width);
  const radius = (box.width / 2) * Math.SQRT2;
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
  gradient.addColorStop(layer.clearStop, 'rgba(0, 0, 0, 0)');
  gradient.addColorStop(1, `rgba(0, 0, 0, ${layer.alpha})`);
  ctx.fillStyle = gradient;
  ctx.fillRect(-box.width / 2, -box.width / 2, box.width, box.width);
  ctx.restore();
}

export function paintWithLook(
  ctx: ScenePaintable,
  look: MediaLook,
  frame: { readonly glowWidth: number; readonly overlayBox: Rect; readonly grainTile: GrainTile },
  draw: () => void,
): void {
  ctx.save();
  if (look.filter !== undefined) ctx.filter = look.filter;
  draw();
  ctx.restore();
  if (look.glow !== undefined) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.filter = [look.filter, `blur(${round2(BLOOM_RADIUS_FRACTION * frame.glowWidth)}px)`, `brightness(${look.glow})`].filter((step) => step !== undefined).join(' ');
    draw();
    ctx.restore();
  }
  if (look.layers.length === 0) return;
  const box = frame.overlayBox;
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.width, box.height);
  ctx.clip();
  for (const layer of look.layers) paintLayer(ctx, layer, box, frame.grainTile);
  ctx.restore();
}

const GRAIN_TILE_PX = 256;

/** Un générateur déterministe (mulberry32) : le même grain d'une image à l'autre, d'un export à l'autre. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * LES TUILES DU GRAIN, tissées sur un canvas du document — une par intensité,
 * gardées le temps de l'export : le motif du lecteur (`feTurbulence`) ne se
 * peint pas sur un canvas, sa forme (un bruit noir d'alpha borné) si.
 */
export function grainTiles(doc: Document): GrainTile {
  const tiles = new Map<number, CanvasImageSource | null>();
  return (alpha) => {
    const known = tiles.get(alpha);
    if (known !== undefined) return known;
    const canvas = doc.createElement('canvas');
    canvas.width = GRAIN_TILE_PX;
    canvas.height = GRAIN_TILE_PX;
    const ctx = canvas.getContext('2d');
    const tile = ctx === null ? null : weave(ctx, alpha, canvas);
    tiles.set(alpha, tile);
    return tile;
  };
}

function weave(ctx: CanvasRenderingContext2D, alpha: number, canvas: HTMLCanvasElement): CanvasImageSource {
  const image = ctx.createImageData(GRAIN_TILE_PX, GRAIN_TILE_PX);
  const random = seeded(0x9e3779b9);
  const peak = Math.max(0, Math.min(1, alpha)) * 255;
  for (let index = 3; index < image.data.length; index += 4) image.data[index] = Math.round(random() * peak);
  ctx.putImageData(image, 0, 0);
  return canvas;
}
