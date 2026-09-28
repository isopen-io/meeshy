/**
 * **LES MONTAGES D'UNE CAPTURE D'APPEL, EN GÉOMÉTRIE** (#8552) — sans canevas :
 * où poser chaque visage, avec quel cadre, sous quel angle, pour chacun des
 * sept styles. Le rendu (`call-montage-render.ts`) ne fait que tracer ce que
 * `montageLayout` rend, pour l'aperçu en direct comme pour la capture pleine
 * résolution : les deux sont la MÊME image, à deux tailles.
 *
 * Le style « Plein écran » reproduit ce que l'écran montre : chaque tuile à sa
 * place, rapportée à la scène (`onScreen`, des rectangles normalisés 0…1).
 * Les autres rangent les visages du plus grand (celui qu'on regarde) au plus
 * petit.
 */

export const MONTAGE_STYLES = ['screen', 'grid', 'strip', 'polaroid', 'magazine', 'comic', 'heart'] as const;

export type MontageStyle = (typeof MONTAGE_STYLES)[number];

export type Size = { readonly width: number; readonly height: number };

export type Rect = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

export type Stroke = { readonly width: number; readonly color: string };

/**
 * Une case du montage : `card` est le rectangle du cadre (son fond `cardColor`,
 * tourné de `rotation` degrés autour de son centre), `photo` celui de l'image,
 * dans le même repère.
 */
export type MontageCell = {
  readonly card: Rect;
  readonly photo: Rect;
  readonly rotation: number;
  readonly cardColor: string | null;
  readonly stroke: Stroke | null;
  readonly radius: number;
};

export type Ornament =
  | { readonly kind: 'masthead'; readonly rect: Rect; readonly text: string }
  | { readonly kind: 'dateline'; readonly rect: Rect }
  | { readonly kind: 'bubble'; readonly rect: Rect; readonly tail: { readonly x: number; readonly y: number } }
  | { readonly kind: 'holes'; readonly rects: readonly Rect[] }
  | { readonly kind: 'halftone'; readonly rect: Rect };

export type Background = { readonly kind: 'solid'; readonly color: string } | { readonly kind: 'vertical'; readonly from: string; readonly to: string };

export type MontageLayout = {
  readonly size: Size;
  readonly background: Background;
  readonly cells: readonly MontageCell[];
  readonly clip: { readonly shape: 'heart'; readonly box: Rect } | null;
  readonly ornaments: readonly Ornament[];
};

type LayoutInput = { readonly style: MontageStyle; readonly count: number; readonly size: Size; readonly onScreen?: readonly Rect[] };

const inset = (rect: Rect, by: number): Rect => ({ x: rect.x + by, y: rect.y + by, width: Math.max(0, rect.width - by * 2), height: Math.max(0, rect.height - by * 2) });

const plain = (rect: Rect, extra: Partial<MontageCell> = {}): MontageCell => ({ card: rect, photo: rect, rotation: 0, cardColor: null, stroke: null, radius: 0, ...extra });

/** Une grille de `count` cases dans `area` : autant de colonnes que la racine, l'orientation de l'aire décidant du sens. */
export function gridRects(count: number, area: Rect, gap: number): readonly Rect[] {
  if (count <= 0) return [];
  const wide = area.width >= area.height;
  const major = Math.ceil(Math.sqrt(count));
  const minor = Math.ceil(count / major);
  const [cols, rows] = wide ? [major, minor] : [minor, major];
  const cellWidth = (area.width - gap * (cols - 1)) / cols;
  const cellHeight = (area.height - gap * (rows - 1)) / rows;
  return Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / cols);
    const inRow = row === rows - 1 ? count - row * cols : cols;
    const offset = ((cols - inRow) * (cellWidth + gap)) / 2;
    return { x: area.x + offset + (index % cols) * (cellWidth + gap), y: area.y + row * (cellHeight + gap), width: cellWidth, height: cellHeight };
  });
}

const whole = (size: Size): Rect => ({ x: 0, y: 0, width: size.width, height: size.height });

function screen({ count, size, onScreen }: LayoutInput): MontageLayout {
  const placed = onScreen !== undefined && onScreen.length === count ? onScreen.map((rect) => ({ x: rect.x * size.width, y: rect.y * size.height, width: rect.width * size.width, height: rect.height * size.height })) : gridRects(count, whole(size), 0);
  return { size, background: { kind: 'solid', color: '#0b0a1f' }, cells: placed.map((rect) => plain(rect)), clip: null, ornaments: [] };
}

function grid({ count, size }: LayoutInput): MontageLayout {
  const unit = Math.min(size.width, size.height);
  const gap = unit * 0.02;
  return { size, background: { kind: 'solid', color: '#15123a' }, cells: gridRects(count, inset(whole(size), gap), gap).map((rect) => plain(rect, { radius: unit * 0.03 })), clip: null, ornaments: [] };
}

function strip({ count, size }: LayoutInput): MontageLayout {
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

function polaroid({ count, size }: LayoutInput): MontageLayout {
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
    };
  });
  return { size, background: { kind: 'vertical', from: '#3b2a20', to: '#1e140f' }, cells, clip: null, ornaments: [] };
}

function magazine({ count, size }: LayoutInput): MontageLayout {
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

function comic({ count, size }: LayoutInput): MontageLayout {
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

function heart({ count, size }: LayoutInput): MontageLayout {
  const box = heartBox(size);
  return { size, background: { kind: 'vertical', from: '#ff8fb1', to: '#b0306a' }, cells: gridRects(count, box, 0).map((rect) => plain(rect)), clip: { shape: 'heart', box }, ornaments: [] };
}

const LAYOUTS: Readonly<Record<MontageStyle, (input: LayoutInput) => MontageLayout>> = { screen, grid, strip, polaroid, magazine, comic, heart };

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
  const pad = (value: number): string => String(value).padStart(2, '0');
  const at = options.at;
  const stamp = `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`;
  const suffix = options.index === undefined ? '' : `-${options.index + 1}`;
  return `meeshy-appel-${options.style}-${stamp}${suffix}.png`;
}
