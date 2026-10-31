import { readMediaCrop, type MediaCropRect } from '@meeshy/shared/utils/media-crop';

import { backgroundBackdrop, backgroundFraming, hexColorCss } from '@/lib/canvas/background';
import { SCENE_BACKDROP_TINT } from '@/lib/canvas/backdrop';
import { objectMediaIdentity, objectMediaSrc, type SceneCarrier } from '@/lib/canvas/carrier';
import { clipTransitionOpacity, readClipTransitions } from '@/lib/canvas/clip-transition';
import { sceneAudioChipForm, sceneAudioPresence, type CanvasObject, type CanvasScene } from '@/lib/canvas/document';
import { MARKER_ALPHA, paintableStrokes, strokeWidth } from '@/lib/canvas/drawing';
import { MEDIA_CORNER_FRACTION, placedMediaDesignSize } from '@/lib/canvas/media-size';
import { parsePlace, placeLabel, PLACE_FONT_SIZE, PLACE_H_PAD, PLACE_ICON_EM, PLACE_ICON_GAP, PLACE_V_PAD } from '@/lib/canvas/place';
import { objectPose } from '@/lib/canvas/pose';
import { STICKER_MIN_PX, stickerGlyph, stickerWidthFraction } from '@/lib/canvas/sticker';
import { backgroundMedia } from '@/lib/feed/scene-framing';
import { isVideoObject } from '@/lib/feed/scene-motion';
import { LETTERBOX_FILL_OPACITY } from '@/lib/stories/letterbox';

import { drawPlacement, mediaLookOf, paintWithLook, placementOf, sourceSize, type GrainTile, type Placement, type Rect } from './scene-export-media';
import { layoutSceneText } from './scene-export-text';
import { slideTransitionPose, withSceneTransition } from './scene-export-transition';

/**
 * **UNE IMAGE DE L'EXPORT** (#13873) — la scène au temps `t`, peinte sur un
 * canvas 2D dans l'ordre du lecteur (`ScenePlayer` → `SceneCanvas`) : le fond
 * (couleur, image ou la frame COURANTE de la vidéo, rempli ou ajusté avec ses
 * bandes), puis chaque objet par `z` croissant — médias posés, textes,
 * stickers, lieux, pastilles des sons posés, dessin — à SA pose
 * (`objectPose` : ancre, échelle, rotation, opacité, keyframes, fenêtre).
 * Le son de fond ne produit aucun pixel (#9737). Loi 6 : on exporte ce
 * qu'on voit ; les mêmes lois que le lecteur décident de tout.
 */

export type ScenePaintable = Pick<
  CanvasRenderingContext2D,
  | 'fillStyle'
  | 'strokeStyle'
  | 'lineWidth'
  | 'font'
  | 'filter'
  | 'textAlign'
  | 'textBaseline'
  | 'globalAlpha'
  | 'shadowColor'
  | 'shadowBlur'
  | 'shadowOffsetX'
  | 'shadowOffsetY'
  | 'fillRect'
  | 'fillText'
  | 'strokeText'
  | 'measureText'
  | 'beginPath'
  | 'moveTo'
  | 'lineTo'
  | 'arc'
  | 'closePath'
  | 'roundRect'
  | 'rect'
  | 'clip'
  | 'fill'
  | 'stroke'
  | 'save'
  | 'restore'
  | 'translate'
  | 'rotate'
  | 'scale'
  | 'createLinearGradient'
  | 'drawImage'
  | 'globalCompositeOperation'
  | 'createRadialGradient'
  | 'createPattern'
> & { direction: CanvasDirection; lineCap: CanvasLineCap; lineJoin: CanvasLineJoin };

export type ExportAssets = {
  readonly image: (src: string) => CanvasImageSource | null;
  /** L'image d'une animation (GIF, WebP animé) à `tMs` de la slide (#13880) ; `null` : l'image fixe. */
  readonly imageAt?: (src: string, tMs: number) => CanvasImageSource | null;
  readonly video: (src: string) => HTMLVideoElement | null;
  /** La tuile du grain d'un média (#13880) — absente ou `null` : le grain se tait. */
  readonly grainTile?: GrainTile;
};

/** Les couleurs du thème, résolues depuis les jetons CSS : un canvas ne lit pas `var(--…)`. */
export type ExportPalette = {
  readonly card: string;
  readonly scrim: string;
  readonly onMedia: string;
  readonly placeFill: string;
  readonly placeInk: string;
  readonly pin: string;
  readonly mediaBackdrop: string;
  readonly fontFamily: string;
};

export type PaintSceneParams = {
  readonly ctx: ScenePaintable;
  readonly width: number;
  readonly height: number;
  readonly scene: CanvasScene;
  readonly carrier: SceneCarrier;
  readonly tSeconds: number;
  readonly assets: ExportAssets;
  readonly preferredLanguages: readonly string[];
  readonly palette: ExportPalette;
  readonly labels: { readonly placeHere: string };
  /** `@auteur` — le filigrane nomme l'auteur de l'œuvre, jamais celui qui l'enregistre. */
  readonly watermark: string | null;
  /** La durée de la slide — connue, l'ouverture et la fermeture de la scène se peignent (#13880). */
  readonly slideDurationMs?: number;
};

const DESIGN_WIDTH = 1080;
const DESIGN_HEIGHT = 1920;

type Size = { readonly width: number; readonly height: number };

function drawFitted(ctx: ScenePaintable, source: CanvasImageSource, box: Rect, mode: 'cover' | 'contain', crop: MediaCropRect | null): void {
  const placement = placementOf(source, box, mode, crop);
  if (placement !== null) drawPlacement(ctx, source, placement);
}

const NO_GRAIN: GrainTile = () => null;

/** Le média à sa place, avec son filtre, ses réglages, son halo et ses calques — la loi du lecteur. */
function paintLooked(
  object: CanvasObject,
  params: PaintSceneParams,
  pixels: CanvasImageSource,
  placement: Placement,
  frame: { readonly glowWidth: number; readonly overlayBox: Rect },
): void {
  const k = params.width / DESIGN_WIDTH;
  const look = mediaLookOf(object.payload, {
    target: isVideoObject(object) ? 'video' : 'image',
    designPixelsPerSourcePixel: placement.to.width / k / placement.from.width,
    pixelsPerDesignPixel: k,
  });
  paintWithLook(params.ctx, look, { ...frame, grainTile: params.assets.grainTile ?? NO_GRAIN }, () => drawPlacement(params.ctx, pixels, placement));
}

const imageOf = (src: string, params: PaintSceneParams): CanvasImageSource | null =>
  params.assets.imageAt?.(src, params.tSeconds * 1000) ?? params.assets.image(src);

const isReady = (video: HTMLVideoElement): boolean => video.readyState >= 2;

function pixelsOf(object: CanvasObject, params: PaintSceneParams): CanvasImageSource | null {
  const src = objectMediaSrc(object, params.carrier);
  if (src === undefined) return null;
  if (!isVideoObject(object)) return imageOf(src, params);
  const video = params.assets.video(src);
  return video !== null && isReady(video) ? video : null;
}

function paintSolid(ctx: ScenePaintable, value: unknown, fallback: string, size: Size): void {
  const raw = typeof value === 'string' ? value : '';
  const gradient = raw.startsWith('gradient:') ? raw.split(':') : null;
  const from = hexColorCss(gradient?.[1]);
  const to = hexColorCss(gradient?.[2]);
  if (from !== undefined && to !== undefined) {
    const fill = ctx.createLinearGradient(0, 0, size.width, size.height);
    fill.addColorStop(0, from);
    fill.addColorStop(1, to);
    ctx.fillStyle = fill;
  } else {
    ctx.fillStyle = hexColorCss(raw) ?? fallback;
  }
  ctx.fillRect(0, 0, size.width, size.height);
}

function paintBackground(params: PaintSceneParams, background: CanvasObject | undefined): void {
  const { ctx, width, height, scene, palette } = params;
  const frame: Rect = { x: 0, y: 0, width, height };
  ctx.fillStyle = palette.card;
  ctx.fillRect(0, 0, width, height);
  if (background === undefined) return;
  const pixels = pixelsOf(background, params);
  if (pixels === null) {
    if (objectMediaSrc(background, params.carrier) === undefined) paintSolid(ctx, background.payload.background, palette.card, frame);
    return;
  }
  const crop = readMediaCrop(background.payload);
  const framing = backgroundFraming(scene);
  if (framing === 'fit') {
    const backdrop = backgroundBackdrop(scene);
    if (backdrop === 'blur') {
      ctx.fillStyle = palette.mediaBackdrop;
      ctx.fillRect(0, 0, width, height);
      ctx.save();
      ctx.globalAlpha = ctx.globalAlpha * LETTERBOX_FILL_OPACITY;
      ctx.filter = 'blur(20px)';
      drawFitted(ctx, pixels, { x: -width * 0.175, y: -height * 0.175, width: width * 1.35, height: height * 1.35 }, 'cover', crop);
      ctx.restore();
    } else {
      ctx.fillStyle = SCENE_BACKDROP_TINT[backdrop];
      ctx.fillRect(0, 0, width, height);
    }
  }
  const placement = placementOf(pixels, frame, framing === 'fit' ? 'contain' : 'cover', crop);
  if (placement !== null) paintLooked(background, params, pixels, placement, { glowWidth: width, overlayBox: placement.to });
}

function roundedRect(ctx: ScenePaintable, box: Rect, radius: number): void {
  ctx.beginPath();
  ctx.roundRect(box.x, box.y, box.width, box.height, Math.max(0, Math.min(radius, box.width / 2, box.height / 2)));
}

function paintMedia(object: CanvasObject, params: PaintSceneParams): void {
  const pixels = pixelsOf(object, params);
  if (pixels === null) return;
  const { payload } = object;
  const identity = objectMediaIdentity(object);
  const carried = identity === null ? undefined : params.carrier.media.find((media) => media.id === identity);
  const natural = sourceSize(pixels);
  const declared = typeof payload.aspectRatio === 'number' && payload.aspectRatio > 0 ? payload.aspectRatio : undefined;
  const carriedRatio = carried?.width !== undefined && carried.height !== undefined && carried.height > 0 ? carried.width / carried.height : undefined;
  const aspectRatio = declared ?? carriedRatio ?? (natural === null ? 1 : natural.width / natural.height);
  const scale = typeof payload.scale === 'number' && payload.scale > 0 ? payload.scale : 1;
  const crop = readMediaCrop(payload);
  const design = placedMediaDesignSize({ aspectRatio, scale, crop });
  const k = params.width / DESIGN_WIDTH;
  const box: Rect = { x: (-design.width * k) / 2, y: (-design.height * k) / 2, width: design.width * k, height: design.height * k };
  const { ctx } = params;
  ctx.save();
  roundedRect(ctx, box, MEDIA_CORNER_FRACTION * Math.min(box.width, box.height));
  ctx.clip();
  const placement = placementOf(pixels, box, 'cover', crop);
  if (placement !== null) paintLooked(object, params, pixels, placement, { glowWidth: box.width, overlayBox: box });
  ctx.restore();
}

function paintText(object: CanvasObject, params: PaintSceneParams): void {
  const { ctx } = params;
  const layout = layoutSceneText({
    object,
    preferredLanguages: params.preferredLanguages,
    sceneWidth: params.width,
    measure: (text, font) => {
      ctx.font = font;
      return ctx.measureText(text).width;
    },
    defaultFamily: params.palette.fontFamily,
  });
  if (layout === null) return;
  if (layout.background !== undefined || layout.border !== undefined) {
    roundedRect(ctx, layout.box, layout.radius);
    if (layout.background !== undefined) {
      ctx.fillStyle = layout.background;
      ctx.fill();
    }
    if (layout.border !== undefined) {
      ctx.lineWidth = layout.border.width;
      ctx.strokeStyle = layout.border.color;
      ctx.stroke();
    }
  }
  ctx.font = layout.font;
  ctx.textAlign = layout.align;
  ctx.textBaseline = 'middle';
  ctx.direction = layout.direction;
  ctx.fillStyle = layout.color;
  const passes = layout.shadows.length > 0 ? layout.shadows : [null];
  for (const shadow of passes) {
    ctx.save();
    if (shadow !== null) {
      ctx.shadowColor = shadow.color;
      ctx.shadowBlur = shadow.blur;
      ctx.shadowOffsetX = shadow.offsetX;
      ctx.shadowOffsetY = shadow.offsetY;
    }
    for (const line of layout.lines) ctx.fillText(line.text, line.x, line.y);
    ctx.restore();
  }
  if (layout.stroke !== undefined) {
    ctx.lineWidth = layout.stroke.width;
    ctx.strokeStyle = layout.stroke.color;
    for (const line of layout.lines) ctx.strokeText(line.text, line.x, line.y);
  }
}

function paintSticker(object: CanvasObject, params: PaintSceneParams): void {
  const { payload } = object;
  const glyph = stickerGlyph(payload);
  if (glyph === null) return;
  const baseSize = typeof payload.baseSize === 'number' ? payload.baseSize : undefined;
  const size = Math.max(STICKER_MIN_PX, stickerWidthFraction(baseSize, object.transform.scale) * params.width);
  const emoji = typeof payload.emoji === 'string' && payload.emoji !== '' ? payload.emoji : undefined;
  const src = emoji === undefined ? objectMediaSrc(object, params.carrier) : undefined;
  const image = src === undefined ? null : imageOf(src, params);
  const { ctx } = params;
  if (image !== null) {
    drawFitted(ctx, image, { x: -size / 2, y: -size / 2, width: size, height: size }, 'contain', null);
    return;
  }
  ctx.font = `${size}px ${params.palette.fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = params.palette.onMedia;
  ctx.fillText(glyph, 0, 0);
}

function pill(ctx: ScenePaintable, params: { readonly height: number; readonly contentWidth: number; readonly padX: number; readonly fill: string }): Rect {
  const box: Rect = { x: -(params.contentWidth + 2 * params.padX) / 2, y: -params.height / 2, width: params.contentWidth + 2 * params.padX, height: params.height };
  roundedRect(ctx, box, params.height / 2);
  ctx.fillStyle = params.fill;
  ctx.fill();
  return box;
}

function paintPlace(object: CanvasObject, params: PaintSceneParams): void {
  const place = parsePlace(object.payload);
  if (place === null) return;
  const { ctx, palette } = params;
  const k = params.width / DESIGN_WIDTH;
  const fontPx = PLACE_FONT_SIZE * k;
  const label = placeLabel(place, params.labels.placeHere);
  ctx.font = `600 ${fontPx}px ${palette.fontFamily}`;
  const icon = PLACE_ICON_EM * fontPx;
  const gap = PLACE_ICON_GAP * k;
  const textWidth = ctx.measureText(label).width;
  const box = pill(ctx, { height: fontPx + 2 * PLACE_V_PAD * k, contentWidth: icon + gap + textWidth, padX: PLACE_H_PAD * k, fill: palette.placeFill });
  ctx.beginPath();
  ctx.arc(box.x + PLACE_H_PAD * k + icon / 2, 0, icon / 2.6, 0, Math.PI * 2);
  ctx.fillStyle = palette.pin;
  ctx.fill();
  ctx.fillStyle = palette.placeInk;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, box.x + PLACE_H_PAD * k + icon + gap, 0);
}

const RESTING_WAVE = [0.35, 0.7, 1, 0.5, 0.85, 0.4, 0.65] as const;

function paintAudioChip(object: CanvasObject, params: PaintSceneParams): void {
  const { ctx, palette } = params;
  const k = params.width / DESIGN_WIDTH;
  const form = sceneAudioChipForm(object);
  const fontPx = 34 * k;
  const note = 1.1 * fontPx;
  const gap = 14 * k;
  ctx.font = `600 ${fontPx}px ${palette.fontFamily}`;
  const label = form.kind === 'borrowed' ? form.label ?? '' : '';
  const waveWidth = form.kind === 'recording' ? 4 * fontPx : 0;
  const contentWidth = note + gap + (form.kind === 'recording' ? waveWidth : ctx.measureText(label).width);
  const box = pill(ctx, { height: 84 * k, contentWidth, padX: 28 * k, fill: palette.scrim });
  const left = box.x + 28 * k;
  ctx.fillStyle = palette.onMedia;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('♪', left + note / 2, 0);
  if (form.kind === 'borrowed') {
    ctx.textAlign = 'left';
    ctx.fillText(label, left + note + gap, 0);
    return;
  }
  const levels = form.samples.length > 0 ? form.samples : RESTING_WAVE;
  const barGap = 0.15 * fontPx;
  const barWidth = Math.max(1, (waveWidth - barGap * (levels.length - 1)) / levels.length);
  const maxHeight = 0.55 * 84 * k;
  levels.forEach((level, index) => {
    const barHeight = Math.min(1, Math.max(0.12, level)) * maxHeight;
    roundedRect(ctx, { x: left + note + gap + index * (barWidth + barGap), y: -barHeight / 2, width: barWidth, height: barHeight }, barWidth / 2);
    ctx.fill();
  });
}

function paintDrawing(object: CanvasObject, params: PaintSceneParams): void {
  const { ctx } = params;
  ctx.save();
  ctx.scale(params.width / DESIGN_WIDTH, params.height / DESIGN_HEIGHT);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const stroke of paintableStrokes(object.payload)) {
    const pressures = stroke.points.map((point) => point.pressure).filter((value): value is number => typeof value === 'number');
    const pressure = pressures.length === 0 ? 1 : pressures.reduce((sum, value) => sum + value, 0) / pressures.length;
    ctx.save();
    ctx.globalAlpha *= stroke.tool === 'marker' ? MARKER_ALPHA : 1;
    ctx.strokeStyle = hexColorCss(stroke.colorHex) ?? '#000000';
    ctx.lineWidth = strokeWidth(stroke, pressure);
    ctx.beginPath();
    stroke.points.forEach((point, index) => (index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)));
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

function paintObject(object: CanvasObject, params: PaintSceneParams): void {
  switch (object.kind) {
    case 'text':
      return paintText(object, params);
    case 'media':
      return paintMedia(object, params);
    case 'sticker':
      return paintSticker(object, params);
    case 'place':
      return paintPlace(object, params);
    case 'audio':
      return paintAudioChip(object, params);
    case 'drawing':
      return paintDrawing(object, params);
    default:
      return undefined;
  }
}

function paintWatermark(params: PaintSceneParams, handle: string): void {
  const { ctx, width, height, palette } = params;
  const k = width / DESIGN_WIDTH;
  const margin = 36 * k;
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 6 * k;
  ctx.fillStyle = palette.onMedia;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `700 ${40 * k}px ${palette.fontFamily}`;
  ctx.fillText('meeshy', width - margin, height - margin - 40 * k);
  ctx.font = `600 ${30 * k}px ${palette.fontFamily}`;
  ctx.fillText(handle, width - margin, height - margin);
  ctx.restore();
}

export function paintSceneFrame(params: PaintSceneParams): void {
  const { ctx, scene, tSeconds } = params;
  const background = backgroundMedia(scene);
  const clips = readClipTransitions(scene);
  const layers = scene.objects.filter((object) => object.id !== background?.id && sceneAudioPresence(object) !== 'offstage').slice().sort((a, b) => a.z - b.z);
  const transition = slideTransitionPose(scene, tSeconds * 1000, params.slideDurationMs);
  withSceneTransition(ctx, { width: params.width, height: params.height, backdrop: params.palette.mediaBackdrop }, transition, () => {
    paintBackground(params, background);
    for (const object of layers) {
      const pose = objectPose(object, tSeconds);
      const opacity = pose.opacity * clipTransitionOpacity(object, clips, tSeconds);
      if (!pose.visible || opacity <= 0) continue;
      ctx.save();
      ctx.globalAlpha = ctx.globalAlpha * opacity;
      if (object.kind !== 'drawing') {
        ctx.translate(pose.x * params.width, pose.y * params.height);
        ctx.rotate((pose.rotation * Math.PI) / 180);
        ctx.scale(pose.scale, pose.scale);
      }
      paintObject(object, params);
      ctx.restore();
    }
  });
  if (params.watermark !== null && params.watermark !== '') paintWatermark(params, params.watermark);
}
