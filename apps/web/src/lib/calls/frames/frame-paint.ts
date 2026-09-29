import { coverCrop } from '../call-montage';
import type { Rect, Size } from '../call-montage-shapes';
import { BRAND_FONT, frameCanvasFont } from './frame-fonts';
import { frameAreas, frameSlots, type FrameAreas, type FrameSlotBox } from './frame-layout';
import { paintBorder, paintPattern } from './frame-paint-decor';
import { enterSlot, footprint, insetRect, mix, photoRect, rectOf, tint, type OrnamentStage, type Surface2D } from './frame-paint-kit';
import { paintOrnament } from './frame-paint-ornaments';
import { slotPath } from './frame-paint-shapes';
import { paintFrameTexts, textLayout, type TextLayout, type TextScene } from './frame-paint-text';
import type { FrameLook, SlotTone } from './frame-spec';
import type { FramePerson, FrameTexts } from './frame-text';

/**
 * **LA PEINTURE D'UN CADRE** (#8741) — l'ordre du § 5.1 de la spec : fond →
 * motif → ornements `back` → cartes, ombres, halos → visages (forme, ton) →
 * traits de case → bordure → ornements `front` → noms → titre et
 * sous-titre → signature. Découpée en trois temps pour le rendu en couches
 * (§ 5.5) : ce qui précède les visages (`paintBackdrop`), les visages
 * (`paintFaces`), ce qui les suit (`paintOverlay`).
 *
 * Une capture n'est JAMAIS en miroir (loi de #8719) : l'image d'un visage se
 * peint telle que la source la donne, sans retournement.
 */

/** Le visage d'une personne : sa source vidéo ou image, `null` caméra coupée (le cadre peint alors son initiale). */
export type FrameFace = { readonly source: CanvasImageSource | null; readonly size: Size };

export type FramePaintable = FrameLook & { readonly id?: string };

export type FrameScene = {
  readonly frame: FramePaintable;
  readonly people: readonly FramePerson[];
  readonly texts: FrameTexts;
  readonly size: Size;
  readonly areas: FrameAreas;
  readonly slots: readonly FrameSlotBox[];
};

export const MEESHY_ACCENT = { primary: '#6366F1', secondary: '#4338CA' } as const;

export function frameScene(frame: FramePaintable, people: readonly FramePerson[], texts: FrameTexts, size: Size): FrameScene {
  return { frame, people, texts, size, areas: frameAreas(frame.layout, size), slots: frameSlots(frame, people.length, size) };
}

function paintBackground(context: Surface2D, scene: FrameScene): void {
  const { width: w, height: h } = scene.size;
  const background = scene.frame.background;
  const spread = (gradient: CanvasGradient, colors: readonly string[]): CanvasGradient => {
    colors.forEach((color, index) => gradient.addColorStop(colors.length === 1 ? 0 : index / (colors.length - 1), color));
    return gradient;
  };
  context.save();
  switch (background.kind) {
    case 'solid':
      context.fillStyle = background.color;
      break;
    case 'linear': {
      const radians = (background.angle * Math.PI) / 180;
      const dx = Math.sin(radians);
      const dy = Math.cos(radians);
      const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
      context.fillStyle = spread(context.createLinearGradient(w / 2 - dx * half, h / 2 - dy * half, w / 2 + dx * half, h / 2 + dy * half), background.colors);
      break;
    }
    case 'radial':
      context.fillStyle = spread(context.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.hypot(w, h) / 2), background.colors);
      break;
    case 'accent': {
      const accent = scene.texts.accent ?? MEESHY_ACCENT;
      context.fillStyle = spread(context.createLinearGradient(0, 0, w, h), [mix(accent.primary, '#FFFFFF', 0.08), accent.primary, accent.secondary]);
      context.fillRect(0, 0, w, h);
      const light = context.createRadialGradient(w * 0.22, h * 0.1, 0, w * 0.22, h * 0.1, Math.hypot(w, h) * 0.6);
      light.addColorStop(0, 'rgba(255, 255, 255, 0.18)');
      light.addColorStop(1, 'rgba(255, 255, 255, 0)');
      context.fillStyle = light;
      break;
    }
  }
  context.fillRect(0, 0, w, h);
  context.restore();
}

/** Les scènes des ornements : toute la toile au fond ; les marges et les réserves au premier plan. */
export function ornamentStage(scene: FrameScene, front: boolean, text: Pick<TextLayout, 'boxes' | 'headline'> = { boxes: [], headline: null }): OrnamentStage {
  const { size, areas } = scene;
  const inner = areas.inner;
  const margins: readonly Rect[] = [
    { x: 0, y: 0, width: size.width, height: inner.y },
    { x: 0, y: inner.y + inner.height, width: size.width, height: size.height - inner.y - inner.height },
    { x: 0, y: inner.y, width: inner.x, height: inner.height },
    { x: inner.x + inner.width, y: inner.y, width: size.width - inner.x - inner.width, height: inner.height },
  ];
  const zones = front ? [areas.top, areas.bottom, ...margins].filter((zone) => zone.width > 0 && zone.height > 0) : [rectOf(size)];
  return { size, unit: areas.unit, zones, avoid: scene.slots.map(footprint), top: areas.top, bottom: areas.bottom, inner, slots: scene.slots, front, text: text.boxes, headline: text.headline };
}

const textSceneOf = (scene: FrameScene): TextScene => ({ look: scene.frame, people: scene.people, texts: scene.texts, size: scene.size, areas: scene.areas, slots: scene.slots });

function paintOrnaments(context: Surface2D, scene: FrameScene, layer: 'back' | 'front', text: TextLayout): void {
  const stage = ornamentStage(scene, layer === 'front', text);
  scene.frame.ornaments.forEach((ornament, rank) => {
    if (ornament.layer === layer) paintOrnament(context, ornament, stage, rank);
  });
}

const slotShapeOptions = (scene: FrameScene, box: FrameSlotBox) => ({ radius: scene.frame.slot.radius, seed: box.index });

/** Les cartes, les ombres portées et les halos — ce qui se tient SOUS le visage. */
function paintSlotGrounds(context: Surface2D, scene: FrameScene): void {
  const { slot } = scene.frame;
  const unit = scene.areas.unit;
  scene.slots.forEach((box) => {
    const photo = photoRect(box.rect, slot.card);
    const side = Math.min(photo.width, photo.height);
    context.save();
    enterSlot(context, box);
    if (slot.card !== undefined) {
      context.shadowColor = slot.shadow === true ? 'rgba(0, 0, 0, 0.38)' : 'rgba(0, 0, 0, 0.18)';
      context.shadowBlur = unit * (slot.shadow === true ? 0.03 : 0.014);
      context.shadowOffsetY = unit * (slot.shadow === true ? 0.01 : 0.004);
      context.fillStyle = slot.card.color;
      context.beginPath();
      context.rect(box.rect.x, box.rect.y, box.rect.width, box.rect.height);
      context.fill();
      context.shadowColor = 'transparent';
    }
    if (slot.glow !== undefined) {
      context.shadowColor = slot.glow;
      context.shadowBlur = side * 0.12;
      context.fillStyle = slot.glow;
      slotPath(context, box.shape, photo, slotShapeOptions(scene, box));
      context.fill();
      context.fill();
      context.shadowColor = 'transparent';
    }
    if (slot.shadow === true && slot.card === undefined) {
      context.shadowColor = 'rgba(0, 0, 0, 0.42)';
      context.shadowBlur = unit * 0.03;
      context.shadowOffsetY = unit * 0.012;
      context.fillStyle = '#111111';
      slotPath(context, box.shape, photo, slotShapeOptions(scene, box));
      context.fill();
    }
    context.restore();
  });
}

/** Le filtre de chaque ton (§ 4.2) — le duotone part du gris, puis se teinte par ses deux couleurs. */
export const TONE_FILTERS: Readonly<Record<SlotTone, string>> = {
  color: 'none',
  mono: 'grayscale(1)',
  sepia: 'sepia(0.85) contrast(1.05) brightness(1.02)',
  noir: 'grayscale(1) contrast(1.45) brightness(0.95)',
  warm: 'sepia(0.22) saturate(1.2) brightness(1.03)',
  cool: 'saturate(0.88) brightness(1.02)',
  faded: 'contrast(0.82) brightness(1.08) saturate(0.7)',
  duotone: 'grayscale(1) contrast(1.1)',
};

/** Les pellicules posées sur le visage après son filtre, dans la forme de la case. */
function paintToneFilm(context: Surface2D, tone: SlotTone, duotone: readonly [string, string] | undefined, photo: Rect): void {
  const film = (color: string, operation: GlobalCompositeOperation, alpha = 1): void => {
    context.globalCompositeOperation = operation;
    context.globalAlpha = alpha;
    context.fillStyle = color;
    context.fillRect(photo.x, photo.y, photo.width, photo.height);
  };
  context.save();
  if (tone === 'warm') film('#FF9A3C', 'soft-light', 0.22);
  if (tone === 'cool') film('#3C8CFF', 'soft-light', 0.24);
  if (tone === 'faded') film('#FFFFFF', 'source-over', 0.08);
  if (tone === 'duotone') {
    const [shadow, light] = duotone ?? ['#1E1B4B', '#F0ABFC'];
    film(light, 'multiply');
    film(shadow, 'lighten');
  }
  context.restore();
}

const PLACEHOLDER_HUES: readonly (readonly [string, string])[] = [
  ['#6366F1', '#A855F7'],
  ['#0EA5E9', '#6366F1'],
  ['#F97316', '#EC4899'],
  ['#10B981', '#0EA5E9'],
  ['#F59E0B', '#EF4444'],
  ['#8B5CF6', '#EC4899'],
  ['#14B8A6', '#22C55E'],
];

const hashOf = (value: string): number => Array.from(value).reduce((hash, char) => (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0, 7);

/** Caméra coupée : un dégradé propre à la personne et son initiale, jamais une case retirée (§ 2). */
function paintPlaceholder(context: Surface2D, photo: Rect, person: FramePerson | undefined): void {
  const [from, to] = PLACEHOLDER_HUES[hashOf(person?.id ?? '') % PLACEHOLDER_HUES.length] ?? ['#6366F1', '#4338CA'];
  const gradient = context.createLinearGradient(photo.x, photo.y, photo.x + photo.width, photo.y + photo.height);
  gradient.addColorStop(0, from);
  gradient.addColorStop(1, to);
  context.fillStyle = gradient;
  context.fillRect(photo.x, photo.y, photo.width, photo.height);
  const initial = Array.from((person?.name ?? '').trim())[0]?.toLocaleUpperCase() ?? '';
  if (initial.length === 0) return;
  const px = Math.min(photo.width, photo.height) * 0.36;
  context.fillStyle = 'rgba(255, 255, 255, 0.94)';
  context.shadowColor = 'rgba(0, 0, 0, 0.18)';
  context.shadowBlur = px * 0.12;
  context.font = frameCanvasFont(BRAND_FONT, px);
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(initial, photo.x + photo.width / 2, photo.y + photo.height / 2 + px * 0.04);
  context.shadowColor = 'transparent';
}

/** Les visages, chacun dans sa forme, avec son ton — la seule peinture qui change à chaque image. */
export function paintFaces(context: Surface2D, scene: FrameScene, faces: readonly (FrameFace | null)[]): void {
  const { slot } = scene.frame;
  scene.slots.forEach((box) => {
    const photo = photoRect(box.rect, slot.card);
    if (photo.width <= 0 || photo.height <= 0) return;
    const face = faces[box.index] ?? null;
    context.save();
    enterSlot(context, box);
    slotPath(context, box.shape, photo, slotShapeOptions(scene, box));
    context.clip();
    const filter = TONE_FILTERS[slot.tone];
    if (filter !== 'none') context.filter = filter;
    if (face !== null && face.source !== null && face.size.width > 0 && face.size.height > 0) {
      context.fillStyle = '#000000';
      context.fillRect(photo.x, photo.y, photo.width, photo.height);
      const crop = coverCrop(face.size, photo);
      context.drawImage(face.source, crop.x, crop.y, crop.width, crop.height, photo.x, photo.y, photo.width, photo.height);
    } else paintPlaceholder(context, photo, scene.people[box.index]);
    if (filter !== 'none') context.filter = 'none';
    paintToneFilm(context, slot.tone, slot.duotone, photo);
    context.restore();
  });
}

function paintSlotStrokes(context: Surface2D, scene: FrameScene): void {
  const { slot } = scene.frame;
  if (slot.stroke === undefined) return;
  const width = Math.max(0.75, slot.stroke.width * scene.areas.unit);
  const stroke = slot.stroke;
  scene.slots.forEach((box) => {
    const photo = photoRect(box.rect, slot.card);
    context.save();
    enterSlot(context, box);
    context.strokeStyle = stroke.color;
    context.lineWidth = width;
    context.lineJoin = 'round';
    slotPath(context, box.shape, photo, slotShapeOptions(scene, box));
    context.stroke();
    if (slot.double === true) {
      context.lineWidth = width * 0.4;
      context.strokeStyle = tint(stroke.color, 0.9);
      slotPath(context, box.shape, insetRect(photo, width * 2.2), slotShapeOptions(scene, box));
      context.stroke();
    }
    context.restore();
  });
}

/** Ce qui précède les visages : fond, motif, ornements du fond, cartes, ombres et halos. */
export function paintBackdrop(context: Surface2D, scene: FrameScene): void {
  paintBackground(context, scene);
  if (scene.frame.pattern !== undefined) paintPattern(context, scene.frame.pattern, scene.size);
  paintOrnaments(context, scene, 'back', textLayout(context, textSceneOf(scene)));
  paintSlotGrounds(context, scene);
}

/** Ce qui suit les visages : traits de case, bordure, ornements du premier plan, noms, titres, signature. */
export function paintOverlay(context: Surface2D, scene: FrameScene): void {
  const text = textSceneOf(scene);
  const layout = textLayout(context, text);
  paintSlotStrokes(context, scene);
  if (scene.frame.border !== undefined) paintBorder(context, scene.frame.border, scene.size);
  paintOrnaments(context, scene, 'front', layout);
  paintFrameTexts(context, text, layout.plan);
}

/**
 * **LE CADRE ENTIER, SANS CACHE** — pour une vignette, un témoin, la planche
 * de design. `faces[i]` est le visage de `people[i]` (absent ⇒ son initiale).
 */
export function paintFrame(context: Surface2D, frame: FramePaintable, people: readonly FramePerson[], faces: readonly (FrameFace | null)[], texts: FrameTexts, size: Size): FrameScene {
  const scene = frameScene(frame, people, texts, size);
  context.save();
  paintBackdrop(context, scene);
  paintFaces(context, scene, faces);
  paintOverlay(context, scene);
  context.restore();
  return scene;
}
