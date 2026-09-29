import { captureStamp } from './call-capture-save';
import { GLAMOUR_LAYOUTS } from './call-montage-glamour';
import { gridRects, inset, plain, whole, type LayoutInput as ShapeInput, type MontageLayout, type Ornament, type Rect, type Size } from './call-montage-shapes';

export { gridRects, type Background, type MontageCell, type MontageLayout, type Ornament, type Rect, type Size, type Stroke } from './call-montage-shapes';

/**
 * **LES MONTAGES D'UNE CAPTURE D'APPEL, EN GÉOMÉTRIE** (#8552) — sans canevas :
 * où poser chaque visage, avec quel cadre, sous quel angle, pour chacun des
 * treize styles, dont six glamour (`call-montage-glamour.ts`, #8580). Le rendu (`call-montage-render.ts`) ne fait que tracer ce que
 * `montageLayout` rend, pour l'aperçu en direct comme pour la capture pleine
 * résolution : les deux sont la MÊME image, à deux tailles.
 *
 * Le style « Plein écran » reproduit ce que l'écran montre : chaque tuile à sa
 * place, rapportée à la scène (`onScreen`, des rectangles normalisés 0…1).
 * Les autres rangent les visages du plus grand (celui qu'on regarde) au plus
 * petit.
 */

export const MONTAGE_STYLES = ['screen', 'cover', 'gold', 'redcarpet', 'grid', 'strip', 'polaroid', 'magazine', 'film', 'neon', 'noir', 'comic', 'heart'] as const;

export type MontageStyle = (typeof MONTAGE_STYLES)[number];

type LayoutInput = ShapeInput & { readonly style: MontageStyle };

function screen({ count, size, onScreen }: ShapeInput): MontageLayout {
  const placed = onScreen !== undefined && onScreen.length === count ? onScreen.map((rect) => ({ x: rect.x * size.width, y: rect.y * size.height, width: rect.width * size.width, height: rect.height * size.height })) : gridRects(count, whole(size), 0);
  return { size, background: { kind: 'solid', color: '#0b0a1f' }, cells: placed.map((rect) => plain(rect)), clip: null, ornaments: [] };
}

function grid({ count, size }: ShapeInput): MontageLayout {
  const unit = Math.min(size.width, size.height);
  const gap = unit * 0.02;
  return { size, background: { kind: 'solid', color: '#15123a' }, cells: gridRects(count, inset(whole(size), gap), gap).map((rect) => plain(rect, { radius: unit * 0.03 })), clip: null, ornaments: [] };
}

function strip({ count, size }: ShapeInput): MontageLayout {
  const unit = Math.min(size.width, size.height);
  const margin = unit * 0.1;
  const gap = unit * 0.03;
  const column = size.width >= size.height ? size.width * 0.34 : size.width - margin * 2;
  const x = (size.width - column) / 2;
  const height = (size.height - margin * 2 - gap * (count - 1)) / Math.max(1, count);
  const cells = Array.from({ length: count }, (_, index) => plain({ x, y: margin + index * (height + gap), width: column, height }));
  const hole = unit * 0.022;
  const holes = Array.from({ length: Math.floor((size.height - hole) / (hole * 2.4)) }, (_, index) => index * hole * 2.4 + hole).flatMap((y) => [
    { x: x - margin * 0.55, y, width: hole, height: hole * 1.3 },
    { x: x + column + margin * 0.55 - hole, y, width: hole, height: hole * 1.3 },
  ]);
  return { size, background: { kind: 'solid', color: '#111111' }, cells, clip: null, ornaments: [{ kind: 'holes', rects: holes }] };
}

const POLAROID_TILT = [-6, 4, -3, 7, -5, 3, -7, 5, -2] as const;

function polaroid({ count, size }: ShapeInput): MontageLayout {
  const unit = Math.min(size.width, size.height);
  const pad = unit * 0.06;
  const slots = gridRects(count, inset(whole(size), pad), pad);
  const cells = slots.map((slot, index) => {
    const side = Math.min(slot.width, slot.height / 1.2);
    const card = { x: slot.x + (slot.width - side) / 2, y: slot.y + (slot.height - side * 1.2) / 2, width: side, height: side * 1.2 };
    const border = side * 0.06;
    return {
      card,
      photo: { x: card.x + border, y: card.y + border, width: side - border * 2, height: side - border * 2 },
      rotation: count === 1 ? -2 : POLAROID_TILT[index % POLAROID_TILT.length] ?? 0,
      cardColor: '#fbfaf5',
      stroke: null,
      radius: side * 0.01,
      glow: null,
      tone: 'color' as const,
    };
  });
  return { size, background: { kind: 'vertical', from: '#3b2a20', to: '#1e140f' }, cells, clip: null, ornaments: [] };
}

function magazine({ count, size }: ShapeInput): MontageLayout {
  const unit = Math.min(size.width, size.height);
  const pad = unit * 0.04;
  const cover = plain(whole(size));
  const others = count - 1;
  const gap = pad * 0.5;
  const insetSide = Math.min(size.width * 0.24, size.height * 0.2, (size.width - pad * 2 - gap * Math.max(0, others - 1)) / Math.max(1, others));
  const row = Array.from({ length: Math.max(0, others) }, (_, index) => {
    const x = size.width - pad - (others - index) * (insetSide + gap) + gap;
    return plain({ x, y: size.height - pad * 2.5 - insetSide, width: insetSide, height: insetSide }, { stroke: { width: unit * 0.008, color: '#ffffff' } });
  });
  return {
    size,
    background: { kind: 'solid', color: '#000000' },
    cells: count === 0 ? [] : [cover, ...row],
    clip: null,
    ornaments: [
      { kind: 'masthead', rect: { x: pad, y: pad, width: size.width - pad * 2, height: unit * 0.16 }, text: 'MEESHY' },
      { kind: 'dateline', rect: { x: pad, y: pad + unit * 0.17, width: size.width - pad * 2, height: unit * 0.04 } },
    ],
  };
}

function comic({ count, size }: ShapeInput): MontageLayout {
  const unit = Math.min(size.width, size.height);
  const gutter = unit * 0.025;
  const panels = gridRects(count, inset(whole(size), gutter), gutter);
  const stroke = { width: unit * 0.012, color: '#111111' };
  const first = panels[0] ?? whole(size);
  const bubbleWidth = Math.min(first.width * 0.62, unit * 0.5);
  const bubble = { x: first.x + first.width * 0.06, y: first.y + first.height * 0.05, width: bubbleWidth, height: bubbleWidth * 0.42 };
  return {
    size,
    background: { kind: 'solid', color: '#fff8e1' },
    cells: panels.map((rect) => plain(rect, { stroke })),
    clip: null,
    ornaments: [
      ...panels.map((rect): Ornament => ({ kind: 'halftone', rect })),
      { kind: 'bubble', rect: bubble, tail: { x: bubble.x + bubble.width * 0.55, y: bubble.y + bubble.height * 1.45 } },
    ],
  };
}

/** Le cœur : sa boîte, centrée ; le tracé lui-même est `heartPath`. */
export function heartBox(size: Size): Rect {
  const side = Math.min(size.width, size.height) * 0.9;
  return { x: (size.width - side) / 2, y: (size.height - side) / 2, width: side, height: side };
}

function heart({ count, size }: ShapeInput): MontageLayout {
  const box = heartBox(size);
  return { size, background: { kind: 'vertical', from: '#ff8fb1', to: '#b0306a' }, cells: gridRects(count, box, 0).map((rect) => plain(rect)), clip: { shape: 'heart', box }, ornaments: [] };
}

const LAYOUTS: Readonly<Record<MontageStyle, (input: ShapeInput) => MontageLayout>> = { screen, grid, strip, polaroid, magazine, comic, heart, ...GLAMOUR_LAYOUTS };

export function montageLayout(input: LayoutInput): MontageLayout {
  return LAYOUTS[input.style]({ ...input, count: Math.max(0, input.count) });
}

/** La taille d'une capture : portrait 1080 × 1920 sur un écran étroit, paysage 1920 × 1080 ailleurs. */
export function captureSize(viewport: Size): Size {
  return viewport.width < viewport.height ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 };
}

export const FACE_CROP_SIZE = 1080;

/** Le carré d'un portrait : le visage et ses épaules, dans l'image, jamais au-delà. */
export function faceCropRect(face: Rect, frame: Size): Rect {
  const side = Math.min(frame.width, frame.height, Math.max(face.width, face.height) * 1.9);
  const cx = face.x + face.width / 2;
  const cy = face.y + face.height * 0.55;
  const clamp = (value: number, max: number): number => Math.min(Math.max(0, value), Math.max(0, max));
  return { x: clamp(cx - side / 2, frame.width - side), y: clamp(cy - side / 2, frame.height - side), width: side, height: side };
}

/** La part de la source qui REMPLIT la destination sans la déformer (object-fit: cover). */
export function coverCrop(source: Size, target: Size): Rect {
  if (source.width <= 0 || source.height <= 0 || target.width <= 0 || target.height <= 0) return { x: 0, y: 0, width: 0, height: 0 };
  const scale = Math.max(target.width / source.width, target.height / source.height);
  const width = target.width / scale;
  const height = target.height / scale;
  return { x: (source.width - width) / 2, y: (source.height - height) / 2, width, height };
}

/** La part de la destination qu'occupe TOUTE la source (object-fit: contain) — un partage d'écran ne se rogne pas. */
export function containRect(source: Size, target: Rect): Rect {
  if (source.width <= 0 || source.height <= 0) return target;
  const scale = Math.min(target.width / source.width, target.height / source.height);
  const width = source.width * scale;
  const height = source.height * scale;
  return { x: target.x + (target.width - width) / 2, y: target.y + (target.height - height) / 2, width, height };
}

/** Le nom du fichier : `meeshy-appel-<style>-AAAAMMJJ-HHMMSS.png`, ou `…-visage-<n>` pour un portrait. */
export function captureFileName(options: { readonly at: Date; readonly style: MontageStyle | 'visage'; readonly index?: number }): string {
  const suffix = options.index === undefined ? '' : `-${options.index + 1}`;
  return `meeshy-appel-${options.style}-${captureStamp(options.at)}${suffix}.png`;
}
