/**
 * **LES FORMES D'UN MONTAGE** (#8552, #8580) — les types et les briques de
 * géométrie que partagent les styles ludiques (`call-montage.ts`) et les
 * styles glamour (`call-montage-glamour.ts`) : une case, un ornement, un
 * fond, une grille.
 */

export type Size = { readonly width: number; readonly height: number };

export type Rect = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

export type Stroke = { readonly width: number; readonly color: string };

/**
 * Une case du montage : `card` est le rectangle du cadre (son fond `cardColor`,
 * tourné de `rotation` degrés autour de son centre), `photo` celui de l'image,
 * dans le même repère. `glow` fait rayonner le cadre (néon, doré) ; `tone`
 * `mono` développe le visage en noir et blanc.
 */
export type MontageCell = {
  readonly card: Rect;
  readonly photo: Rect;
  readonly rotation: number;
  readonly cardColor: string | null;
  readonly stroke: Stroke | null;
  readonly radius: number;
  readonly glow: string | null;
  readonly tone: 'color' | 'mono';
};

export type Circle = { readonly x: number; readonly y: number; readonly r: number };

export type Ornament =
  | { readonly kind: 'masthead'; readonly rect: Rect; readonly text: string }
  | { readonly kind: 'dateline'; readonly rect: Rect }
  | { readonly kind: 'bubble'; readonly rect: Rect; readonly tail: { readonly x: number; readonly y: number } }
  | { readonly kind: 'holes'; readonly rects: readonly Rect[] }
  | { readonly kind: 'halftone'; readonly rect: Rect }
  | { readonly kind: 'coverline'; readonly rect: Rect; readonly index: number; readonly accent: boolean }
  | { readonly kind: 'barcode'; readonly rect: Rect; readonly bars: readonly Rect[] }
  | { readonly kind: 'flashes'; readonly points: readonly Circle[] }
  | { readonly kind: 'drapes'; readonly folds: readonly Rect[] }
  | { readonly kind: 'bokeh'; readonly circles: readonly Circle[] }
  | { readonly kind: 'frame'; readonly rect: Rect; readonly width: number }
  | { readonly kind: 'frameNumbers'; readonly items: readonly { readonly x: number; readonly y: number; readonly size: number; readonly text: string }[] }
  | { readonly kind: 'grain'; readonly rect: Rect; readonly dots: readonly Circle[] }
  | { readonly kind: 'vignette'; readonly rect: Rect };

export type Background =
  | { readonly kind: 'solid'; readonly color: string }
  | { readonly kind: 'vertical'; readonly from: string; readonly to: string }
  | { readonly kind: 'radial'; readonly inner: string; readonly outer: string };

export type MontageLayout = {
  readonly size: Size;
  readonly background: Background;
  readonly cells: readonly MontageCell[];
  readonly clip: { readonly shape: 'heart'; readonly box: Rect } | null;
  readonly ornaments: readonly Ornament[];
};

export type LayoutInput = { readonly count: number; readonly size: Size; readonly onScreen?: readonly Rect[] };

export const inset = (rect: Rect, by: number): Rect => ({ x: rect.x + by, y: rect.y + by, width: Math.max(0, rect.width - by * 2), height: Math.max(0, rect.height - by * 2) });

export const plain = (rect: Rect, extra: Partial<MontageCell> = {}): MontageCell => ({ card: rect, photo: rect, rotation: 0, cardColor: null, stroke: null, radius: 0, glow: null, tone: 'color', ...extra });

export const whole = (size: Size): Rect => ({ x: 0, y: 0, width: size.width, height: size.height });

export const unitOf = (size: Size): number => Math.min(size.width, size.height);

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

/** Un tirage pseudo-aléatoire DÉTERMINISTE (0…1) : le même montage à chaque image de l'aperçu. */
export const scatter = (seed: number): number => {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
};
