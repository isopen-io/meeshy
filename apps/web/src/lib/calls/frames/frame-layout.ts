import { gridRects, scatter, type Rect, type Size } from '../call-montage-shapes';
import type { FrameLook, SlotShape } from './frame-spec';

/**
 * **LA GÉOMÉTRIE CANONIQUE D'UN CADRE** (#8741) — où tombe chaque visage,
 * calculé depuis `layout` (§ 4.1 de la spec) et `slot.tilt` / `slot.shape`
 * (§ 4.2). C'est le fichier qu'iOS porte LITTÉRALEMENT : que des formules
 * fermées, aucune astuce de plateforme, aucun tirage non déterministe
 * (`scatter` est le seul hasard, et il est une fonction de l'index). La
 * fixture de parité (`packages/shared/design/call-capture-frames-layout.fixture.json`)
 * en fige les sorties ; un écart côté iOS se lit contre elle.
 *
 * Repère : l'origine en haut à gauche, les y vers le bas, les angles en
 * degrés dans le sens horaire (celui du canevas).
 */

export type FrameLayoutInput = Pick<FrameLook, 'layout' | 'slot'>;

/** Une case : son rectangle (avant rotation), sa forme, son inclinaison en degrés, l'index de la personne. */
export type FrameSlotBox = { readonly rect: Rect; readonly shape: SlotShape; readonly rotation: number; readonly index: number };

/** Les zones de la toile : l'intérieur (toile moins la marge), les deux réserves de texte, et la zone de contenu entre elles. */
export type FrameAreas = { readonly unit: number; readonly inner: Rect; readonly top: Rect; readonly content: Rect; readonly bottom: Rect };

const TILT_DEGREES = { none: 0, gentle: 4, wild: 9 } as const;
const DIAGONAL_SHARE = 0.64;
const HERO_SHARE = 0.62;
const ORBIT_CENTER_SHARE = 0.38;
const SCATTER_SHRINK = 0.88;
const TIERS_BACK_SHARE = 0.86;
const MOSAIC_SHARE = 2 / 3;
const CASCADE_SHARE = 0.6;
const HEX_RATIO = 2 / Math.sqrt(3);

const rect = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width: Math.max(0, width), height: Math.max(0, height) });

const square = (cx: number, cy: number, side: number): Rect => rect(cx - side / 2, cy - side / 2, side, side);

const centerOf = (area: Rect): { readonly x: number; readonly y: number } => ({ x: area.x + area.width / 2, y: area.y + area.height / 2 });

const isPortrait = (size: Size): boolean => size.height >= size.width;

export function frameAreas(layout: FrameLook['layout'], size: Size): FrameAreas {
  const unit = Math.min(size.width, size.height);
  const margin = Math.min(layout.margin * unit, unit / 2);
  const inner = rect(margin, margin, size.width - margin * 2, size.height - margin * 2);
  const topHeight = Math.min(layout.top * size.height, inner.height);
  const bottomHeight = Math.min(layout.bottom * size.height, inner.height - topHeight);
  const top = rect(inner.x, inner.y, inner.width, topHeight);
  const bottom = rect(inner.x, inner.y + inner.height - bottomHeight, inner.width, bottomHeight);
  const content = rect(inner.x, inner.y + topHeight, inner.width, inner.height - topHeight - bottomHeight);
  return { unit, inner, top, content, bottom };
}

export const contentArea = (layout: FrameLook['layout'], size: Size): Rect => frameAreas(layout, size).content;
export const reserveTop = (layout: FrameLook['layout'], size: Size): Rect => frameAreas(layout, size).top;
export const reserveBottom = (layout: FrameLook['layout'], size: Size): Rect => frameAreas(layout, size).bottom;

/** `split` — deux moitiés égales : empilées en portrait, côte à côte en paysage. */
function split(area: Rect, gap: number, portrait: boolean): readonly Rect[] {
  if (portrait) {
    const height = (area.height - gap) / 2;
    return [rect(area.x, area.y, area.width, height), rect(area.x, area.y + height + gap, area.width, height)];
  }
  const width = (area.width - gap) / 2;
  return [rect(area.x, area.y, width, area.height), rect(area.x + width + gap, area.y, width, area.height)];
}

/** `diagonal` — deux cases de 64 %, l'une collée en haut à gauche, l'autre en bas à droite (dessinée par-dessus). */
function diagonal(area: Rect): readonly Rect[] {
  const width = area.width * DIAGONAL_SHARE;
  const height = area.height * DIAGONAL_SHARE;
  return [rect(area.x, area.y, width, height), rect(area.x + area.width - width, area.y + area.height - height, width, height)];
}

/** Une rangée de `count` carrés centrés dans `area`, le long de sa largeur (`horizontal`) ou de sa hauteur. */
function squareLine(count: number, area: Rect, gap: number, horizontal: boolean): readonly Rect[] {
  if (count <= 0) return [];
  const along = horizontal ? area.width : area.height;
  const across = horizontal ? area.height : area.width;
  const side = Math.max(0, Math.min(across, (along - gap * (count - 1)) / count));
  const span = side * count + gap * (count - 1);
  const start = (horizontal ? area.x : area.y) + (along - span) / 2;
  const cross = (horizontal ? area.y : area.x) + (across - side) / 2;
  return Array.from({ length: count }, (_, index) => {
    const offset = start + index * (side + gap);
    return horizontal ? rect(offset, cross, side, side) : rect(cross, offset, side, side);
  });
}

/** `hero` — la case 1 prend 62 % du grand axe de la toile, les autres forment une rangée de médaillons carrés dans le reste. */
function hero(count: number, area: Rect, gap: number, portrait: boolean): readonly Rect[] {
  if (count === 1) return [area];
  if (portrait) {
    const height = area.height * HERO_SHARE;
    const rest = rect(area.x, area.y + height + gap, area.width, area.height - height - gap);
    return [rect(area.x, area.y, area.width, height), ...squareLine(count - 1, rest, gap, true)];
  }
  const width = area.width * HERO_SHARE;
  const rest = rect(area.x + width + gap, area.y, area.width - width - gap, area.height);
  return [rect(area.x, area.y, width, area.height), ...squareLine(count - 1, rest, gap, false)];
}

/** Ce qu'une distance `d` selon `angle` sépare deux carrés alignés sur les axes : `d · max(|cos|, |sin|)`. */
const axisReach = (angle: number): number => Math.max(Math.abs(Math.cos(angle)), Math.abs(Math.sin(angle)));

/** Le plus petit `axisReach` des cordes qui joignent deux angles voisins de `angles`. */
const neighbourReach = (angles: readonly number[]): number =>
  Math.min(...angles.slice(1).map((angle, index) => axisReach(((angles[index] ?? 0) + angle) / 2 + Math.PI / 2)));

/**
 * `arch` — des carrés égaux posés sur un demi-cercle ouvert vers le bas : la
 * case i est au MILIEU du i-ème des `n` arcs égaux qui découpent 180°→360°.
 * Le côté est le plus grand qui tient (deux voisins séparés de `gap` au moins
 * sur l'axe qui les sépare, l'ensemble dans la zone), puis l'ensemble est centré.
 */
function arch(count: number, area: Rect, gap: number): readonly Rect[] {
  const angles = Array.from({ length: count }, (_, index) => Math.PI + (Math.PI * (index + 0.5)) / count);
  const cosines = angles.map(Math.cos);
  const sines = angles.map(Math.sin);
  const chord = count > 1 ? 2 * Math.sin(Math.PI / (2 * count)) * neighbourReach(angles) : 1;
  const spanX = count > 1 ? (Math.max(...cosines) - Math.min(...cosines)) / chord : 0;
  const spanY = count > 1 ? (Math.max(...sines) - Math.min(...sines)) / chord : 0;
  const side = Math.max(0, Math.min((area.width - gap * spanX) / (1 + spanX), (area.height - gap * spanY) / (1 + spanY)));
  const radius = count > 1 ? (side + gap) / chord : 0;
  const minX = Math.min(...cosines) * radius;
  const minY = Math.min(...sines) * radius;
  const width = spanX * (side + gap) + side;
  const height = spanY * (side + gap) + side;
  const originX = area.x + (area.width - width) / 2 + side / 2 - minX;
  const originY = area.y + (area.height - height) / 2 + side / 2 - minY;
  return angles.map((_, index) => square(originX + (cosines[index] ?? 0) * radius, originY + (sines[index] ?? 0) * radius, side));
}

/**
 * `orbit` — la case 1 au centre (38 % du petit côté de la zone), les autres
 * sur un cercle autour d'elle, à égale distance, la première en haut. Le
 * rayon est le plus petit qui sépare de `gap` chaque satellite du centre ET
 * deux satellites voisins (sur l'axe qui les sépare) ; le côté des
 * satellites, le plus grand qui garde CHAQUE satellite dans la zone, axe par
 * axe (le rayon est affine en ce côté : chaque contrainte se résout seule),
 * plafonné à celui du centre.
 */
function orbit(count: number, area: Rect, gap: number): readonly Rect[] {
  const middle = centerOf(area);
  const reach = Math.min(area.width, area.height);
  const core = reach * ORBIT_CENTER_SHARE;
  const satellites = count - 1;
  if (satellites <= 0) return [square(middle.x, middle.y, core)];
  const angles = Array.from({ length: satellites }, (_, index) => -Math.PI / 2 + (2 * Math.PI * index) / satellites);
  const radial = Math.min(...angles.map(axisReach));
  const ring = satellites > 1 ? 2 * Math.sin(Math.PI / satellites) * neighbourReach([...angles, (angles[0] ?? 0) + 2 * Math.PI]) : Number.POSITIVE_INFINITY;
  const fits = angles.flatMap((angle) =>
    [
      [Math.abs(Math.cos(angle)), area.width / 2],
      [Math.abs(Math.sin(angle)), area.height / 2],
    ].flatMap(([reachOnAxis = 0, halfAxis = 0]) => [
      (halfAxis - (reachOnAxis * (core / 2 + gap)) / radial) / (reachOnAxis / (2 * radial) + 0.5),
      (halfAxis - (reachOnAxis * gap) / ring) / (reachOnAxis / ring + 0.5),
    ]),
  );
  const side = Math.max(0, Math.min(core, ...fits));
  const radius = Math.max((core / 2 + side / 2 + gap) / radial, (side + gap) / ring);
  return [square(middle.x, middle.y, core), ...angles.map((angle) => square(middle.x + Math.cos(angle) * radius, middle.y + Math.sin(angle) * radius, side))];
}

/** `scatter` — la grille, chaque case réduite à 88 % et décalée dans l'espace libéré (graines 2i+1 et 2i+2). */
function scattered(count: number, area: Rect, gap: number): readonly Rect[] {
  return gridRects(count, area, gap).map((cell, index) => {
    const width = cell.width * SCATTER_SHRINK;
    const height = cell.height * SCATTER_SHRINK;
    const dx = (scatter(index * 2 + 1) - 0.5) * (cell.width - width);
    const dy = (scatter(index * 2 + 2) - 0.5) * (cell.height - height);
    return rect(cell.x + (cell.width - width) / 2 + dx, cell.y + (cell.height - height) / 2 + dy, width, height);
  });
}

/** La répartition de `count` en `rows` rangées, la rangée de DEVANT (index 0) la plus fournie. */
const rowCounts = (count: number, rows: number): readonly number[] => Array.from({ length: rows }, (_, row) => Math.floor(count / rows) + (row < count % rows ? 1 : 0));

/** Le décalage de chaque rangée, en fraction de SA case : deux rangées de même compte se décalent d'une demi-case, sinon la rangée garde celui de devant. */
const rowShifts = (counts: readonly number[]): readonly number[] =>
  counts.reduce<readonly number[]>((shifts, value, row) => {
    const previous = shifts[row - 1] ?? 0;
    return [...shifts, row > 0 && value === counts[row - 1] ? (previous === 0 ? 0.5 : 0) : previous];
  }, []);

/**
 * `tiers` — des rangées en gradins : la rangée 0 devant (en bas), chaque
 * rangée du fond à 86 % de celle de devant ; deux rangées de même compte se
 * décalent d'une demi-case. Le nombre de rangées est celui, de 1 à n, qui
 * rend la plus grande case de devant ; le bloc est centré dans la zone.
 *
 * La largeur du bloc est affine en `side` par paire de rangées (le bord droit
 * de i moins le bord gauche de j) : la contrainte se résout paire par paire.
 */
function tiers(count: number, area: Rect, gap: number): readonly Rect[] {
  const plan = (rows: number) => {
    const counts = rowCounts(count, rows);
    const scales = counts.map((_, row) => TIERS_BACK_SHARE ** row);
    const shifts = rowShifts(counts);
    const rightSlope = counts.map((value, row) => (scales[row] ?? 1) * (value / 2 + (shifts[row] ?? 0)));
    const leftSlope = counts.map((value, row) => (scales[row] ?? 1) * ((shifts[row] ?? 0) - value / 2));
    const gaps = counts.map((value) => (gap * (value - 1)) / 2);
    const widthFit = Math.min(...counts.flatMap((_, i) => counts.map((__, j) => (area.width - (gaps[i] ?? 0) - (gaps[j] ?? 0)) / ((rightSlope[i] ?? 0) - (leftSlope[j] ?? 0)))));
    const heightFit = (area.height - gap * (rows - 1)) / scales.reduce((sum, scale) => sum + scale, 0);
    return { counts, scales, shifts, side: Math.max(0, Math.min(heightFit, widthFit)) };
  };
  const best = Array.from({ length: count }, (_, index) => plan(index + 1)).reduce((winner, candidate) => (candidate.side > winner.side ? candidate : winner));
  const sides = best.scales.map((scale) => best.side * scale);
  const rows = best.counts.map((value, row) => {
    const side = sides[row] ?? 0;
    const span = side * value + gap * (value - 1);
    const left = -span / 2 + (best.shifts[row] ?? 0) * side;
    return { value, side, left, right: left + span };
  });
  const centerX = area.x + area.width / 2 - (Math.max(...rows.map((row) => row.right)) + Math.min(...rows.map((row) => row.left))) / 2;
  const blockHeight = sides.reduce((sum, side) => sum + side, 0) + gap * (sides.length - 1);
  const bottom = area.y + (area.height + blockHeight) / 2;
  return rows.flatMap((row, index) => {
    const above = sides.slice(0, index + 1).reduce((sum, height) => sum + height, 0) + gap * index;
    return Array.from({ length: row.value }, (_, cell) => rect(centerX + row.left + cell * (row.side + gap), bottom - above, row.side, row.side));
  });
}

/** `mosaic` — la case 1 prend les deux tiers du grand axe de la toile, les autres se partagent le tiers restant en grille. */
function mosaic(count: number, area: Rect, gap: number, portrait: boolean): readonly Rect[] {
  if (count === 1) return [area];
  if (portrait) {
    const height = (area.height - gap) * MOSAIC_SHARE;
    return [rect(area.x, area.y, area.width, height), ...gridRects(count - 1, rect(area.x, area.y + height + gap, area.width, area.height - height - gap), gap)];
  }
  const width = (area.width - gap) * MOSAIC_SHARE;
  return [rect(area.x, area.y, width, area.height), ...gridRects(count - 1, rect(area.x + width + gap, area.y, area.width - width - gap, area.height), gap)];
}

/** Les comptes des rangées d'une ruche de `cols` colonnes : `cols`, `cols − 1`, `cols`… jusqu'à épuisement. */
const honeycombRows = (count: number, cols: number, row: number): readonly number[] => {
  if (count <= 0) return [];
  const slots = cols === 1 || row % 2 === 0 ? cols : cols - 1;
  return [Math.min(slots, count), ...honeycombRows(count - slots, cols, row + 1)];
};

/**
 * `honeycomb` — des hexagones à pointe en haut, en quinconce : les rangées
 * alternent `cols` et `cols − 1` cases (la rangée courte se loge dans les
 * creux), la dernière rangée, partielle, se cale sur le réseau au plus près
 * du centre. `cols` est celui, de 2 à n, qui rend le plus grand hexagone.
 */
function honeycomb(count: number, area: Rect, gap: number): readonly Rect[] {
  const plan = (cols: number) => {
    const counts = honeycombRows(count, cols, 0);
    const rows = counts.length;
    const stacked = cols === 1;
    const pitchShare = stacked ? 1 : 0.75;
    const heightFit = (area.height - gap * (rows - 1)) / (1 + pitchShare * (rows - 1));
    const widthFit = ((area.width - gap * (cols - 1)) / cols) * HEX_RATIO;
    return { cols, counts, pitchShare, height: Math.max(0, Math.min(heightFit, widthFit)) };
  };
  const best = Array.from({ length: Math.max(1, count - 1) }, (_, index) => plan(count === 1 ? 1 : index + 2)).reduce((winner, candidate) => (candidate.height > winner.height ? candidate : winner));
  const height = best.height;
  const width = height / HEX_RATIO;
  const rows = best.counts.length;
  const blockWidth = best.cols * width + gap * (best.cols - 1);
  const blockHeight = height + (rows - 1) * (height * best.pitchShare + gap);
  const originX = area.x + (area.width - blockWidth) / 2;
  const originY = area.y + (area.height - blockHeight) / 2;
  return best.counts.flatMap((value, row) => {
    const slots = best.cols === 1 || row % 2 === 0 ? best.cols : best.cols - 1;
    const inset = best.cols === 1 || row % 2 === 0 ? 0 : (width + gap) / 2;
    const first = Math.floor((slots - value) / 2);
    const y = originY + row * (height * best.pitchShare + gap);
    return Array.from({ length: value }, (_, index) => rect(originX + inset + (first + index) * (width + gap), y, width, height));
  });
}

/** `cascade` — des cartes égales (60 % de la zone) en escalier du coin haut-gauche au coin bas-droit. */
function cascade(count: number, area: Rect): readonly Rect[] {
  const width = area.width * CASCADE_SHARE;
  const height = area.height * CASCADE_SHARE;
  if (count === 1) return [rect(area.x + (area.width - width) / 2, area.y + (area.height - height) / 2, width, height)];
  return Array.from({ length: count }, (_, index) => rect(area.x + ((area.width - width) * index) / (count - 1), area.y + ((area.height - height) * index) / (count - 1), width, height));
}

function arrangementRects(input: FrameLayoutInput, count: number, area: Rect, gap: number, portrait: boolean): readonly Rect[] {
  const arrangement = (input.layout.arrangement === 'split' || input.layout.arrangement === 'diagonal') && count !== 2 ? 'grid' : input.layout.arrangement;
  switch (arrangement) {
    case 'split':
      return split(area, gap, portrait);
    case 'diagonal':
      return diagonal(area);
    case 'hero':
      return hero(count, area, gap, portrait);
    case 'grid':
      return gridRects(count, area, gap);
    case 'row':
      return squareLine(count, area, gap, !portrait);
    case 'column':
      return squareLine(count, area, gap, portrait);
    case 'arch':
      return arch(count, area, gap);
    case 'orbit':
      return orbit(count, area, gap);
    case 'scatter':
      return scattered(count, area, gap);
    case 'tiers':
      return tiers(count, area, gap);
    case 'mosaic':
      return mosaic(count, area, gap, portrait);
    case 'honeycomb':
      return honeycomb(count, area, gap);
    case 'cascade':
      return cascade(count, area);
  }
}

/** L'inclinaison de la case `index` : alternée (gauche, droite…), d'amplitude 50 à 100 % du maximum (graine index + 1). */
export function tiltDegrees(tilt: FrameLook['slot']['tilt'], index: number): number {
  const maximum = TILT_DEGREES[tilt];
  if (maximum === 0) return 0;
  const sign = index % 2 === 0 ? -1 : 1;
  return sign * maximum * (0.5 + 0.5 * scatter(index + 1));
}

/** Réduit `box` autour de son centre pour que, tourné de `degrees`, son encombrement tienne dans `bounds`. */
function keepInside(box: Rect, degrees: number, bounds: Rect): Rect {
  if (degrees === 0 || box.width <= 0 || box.height <= 0) return box;
  const radians = (Math.abs(degrees) * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const middle = centerOf(box);
  const halfX = (box.width * cos + box.height * sin) / 2;
  const halfY = (box.width * sin + box.height * cos) / 2;
  const roomX = Math.min(middle.x - bounds.x, bounds.x + bounds.width - middle.x);
  const roomY = Math.min(middle.y - bounds.y, bounds.y + bounds.height - middle.y);
  const factor = Math.max(0, Math.min(1, roomX / halfX, roomY / halfY));
  if (factor >= 1) return box;
  return rect(middle.x - (box.width * factor) / 2, middle.y - (box.height * factor) / 2, box.width * factor, box.height * factor);
}

/**
 * **UNE CASE PAR PERSONNE** — les `people` cases du cadre dans une toile de
 * `size`, dans l'ordre des personnes. Une case inclinée est réduite autour de
 * son centre jusqu'à ce que son encombrement tourné tienne dans la zone de
 * contenu : un visage ne déborde jamais sur un titre.
 */
export function frameSlots(frame: FrameLayoutInput, people: number, size: Size): readonly FrameSlotBox[] {
  const count = Math.max(0, Math.floor(people));
  if (count === 0) return [];
  const areas = frameAreas(frame.layout, size);
  const gap = frame.layout.gap * areas.unit;
  const shape: SlotShape = frame.layout.arrangement === 'honeycomb' ? 'hex' : frame.slot.shape;
  return arrangementRects(frame, count, areas.content, gap, isPortrait(size)).map((box, index) => {
    const rotation = tiltDegrees(frame.slot.tilt, index);
    return { rect: keepInside(box, rotation, areas.content), shape, rotation, index };
  });
}
