import type { Rect } from '../call-montage-shapes';
import { heartPath } from '../call-montage-render';
import type { SlotShape } from './frame-spec';
import { centerOf, rand, roundedRectPath, TAU, type Surface2D } from './frame-paint-kit';

/**
 * **LES DOUZE FORMES DE CASE** (#8741, spec § 4.2) — chaque forme se trace
 * DANS son rectangle, centrée, sans le déborder : `circle`, `hex`, `star` et
 * `heart` gardent leurs proportions et prennent la plus grande taille qui
 * tient. `blob` est organique mais déterministe (graine = index de la case).
 * Chaque tracé ouvre son propre chemin (`beginPath`).
 */

export type ShapeOptions = { readonly radius?: number | undefined; readonly seed?: number | undefined };

const DEFAULT_RADIUS = 0.08;
const HEX_RATIO = 2 / Math.sqrt(3);

function polygon(context: Surface2D, points: readonly (readonly [number, number])[]): void {
  points.forEach(([x, y], index) => (index === 0 ? context.moveTo(x, y) : context.lineTo(x, y)));
  context.closePath();
}

function hex(context: Surface2D, rect: Rect): void {
  const width = Math.min(rect.width, rect.height / HEX_RATIO);
  const height = width * HEX_RATIO;
  const { x: cx, y: cy } = centerOf(rect);
  const left = cx - width / 2;
  const right = cx + width / 2;
  const top = cy - height / 2;
  polygon(context, [
    [cx, top],
    [right, top + height / 4],
    [right, top + (height * 3) / 4],
    [cx, top + height],
    [left, top + (height * 3) / 4],
    [left, top + height / 4],
  ]);
}

function star(context: Surface2D, rect: Rect): void {
  const lower = Math.cos(Math.PI / 5);
  const outer = Math.min(rect.width / (2 * Math.sin((2 * Math.PI) / 5)), rect.height / (1 + lower));
  const inner = outer * 0.5;
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + (rect.height - outer * (1 + lower)) / 2 + outer;
  polygon(
    context,
    Array.from({ length: 10 }, (_, index) => {
      const angle = -Math.PI / 2 + (index * Math.PI) / 5;
      const radius = index % 2 === 0 ? outer : inner;
      return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius] as const;
    }),
  );
}

function ticket(context: Surface2D, rect: Rect): void {
  const notch = Math.min(rect.width, rect.height) * 0.12;
  const { x, y, width: w, height: h } = rect;
  context.moveTo(x + notch, y);
  context.lineTo(x + w - notch, y);
  context.arc(x + w, y, notch, Math.PI, Math.PI / 2, true);
  context.lineTo(x + w, y + h - notch);
  context.arc(x + w, y + h, notch, -Math.PI / 2, -Math.PI, true);
  context.lineTo(x + notch, y + h);
  context.arc(x, y + h, notch, 0, -Math.PI / 2, true);
  context.lineTo(x, y + notch);
  context.arc(x, y, notch, Math.PI / 2, 0, true);
  context.closePath();
}

/** Un bord de timbre : des morsures en demi-cercle, régulières, le long des quatre côtés. */
function stamp(context: Surface2D, rect: Rect): void {
  const bite = Math.min(rect.width, rect.height) * 0.035;
  const { x, y, width: w, height: h } = rect;
  const bites = (length: number): readonly number[] => {
    const count = Math.max(2, Math.round(length / (bite * 3.2)));
    const step = length / count;
    return Array.from({ length: count }, (_, index) => step * (index + 0.5));
  };
  context.moveTo(x, y);
  bites(w).forEach((at) => {
    context.lineTo(x + at - bite, y);
    context.arc(x + at, y, bite, Math.PI, 0, true);
  });
  context.lineTo(x + w, y);
  bites(h).forEach((at) => {
    context.lineTo(x + w, y + at - bite);
    context.arc(x + w, y + at, bite, -Math.PI / 2, Math.PI / 2, true);
  });
  context.lineTo(x + w, y + h);
  bites(w).forEach((at) => {
    context.lineTo(x + w - at + bite, y + h);
    context.arc(x + w - at, y + h, bite, 0, -Math.PI, true);
  });
  context.lineTo(x, y + h);
  bites(h).forEach((at) => {
    context.lineTo(x, y + h - at + bite);
    context.arc(x, y + h - at, bite, Math.PI / 2, -Math.PI / 2, true);
  });
  context.closePath();
}

/** Un galet : un cercle déformé par deux harmoniques de phases tirées, lissé par des courbes quadratiques. */
function blob(context: Surface2D, rect: Rect, seed: number): void {
  const { x: cx, y: cy } = centerOf(rect);
  const phaseA = rand(seed + 11, 0) * TAU;
  const phaseB = rand(seed + 11, 1) * TAU;
  const wobble = (angle: number): number => 1 + 0.055 * Math.sin(3 * angle + phaseA) + 0.035 * Math.sin(5 * angle + phaseB);
  const rx = rect.width / 2 / 1.09;
  const ry = rect.height / 2 / 1.09;
  const points = Array.from({ length: 36 }, (_, index) => {
    const angle = (index / 36) * TAU;
    const radius = wobble(angle);
    return { x: cx + Math.cos(angle) * rx * radius, y: cy + Math.sin(angle) * ry * radius };
  });
  const mid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const last = points[points.length - 1] ?? { x: cx, y: cy };
  const first = points[0] ?? { x: cx, y: cy };
  const start = mid(last, first);
  context.moveTo(start.x, start.y);
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length] ?? first;
    const end = mid(point, next);
    context.quadraticCurveTo(point.x, point.y, end.x, end.y);
  });
  context.closePath();
}

/** Le tracé de la forme `shape` dans `rect` — le chemin est ouvert ici, à remplir, à tracer ou à découper. */
export function slotPath(context: Surface2D, shape: SlotShape, rect: Rect, options: ShapeOptions = {}): void {
  const side = Math.min(rect.width, rect.height);
  const { x: cx, y: cy } = centerOf(rect);
  if (shape === 'heart') {
    const width = Math.min(rect.width, rect.height * 1.1);
    const height = width / 1.1;
    heartPath(context, { x: cx - width / 2, y: cy - height / 2, width, height });
    return;
  }
  context.beginPath();
  switch (shape) {
    case 'rect':
      context.rect(rect.x, rect.y, rect.width, rect.height);
      return;
    case 'round':
      roundedRectPath(context, rect, (options.radius ?? DEFAULT_RADIUS) * side);
      return;
    case 'circle':
      context.moveTo(cx + side / 2, cy);
      context.arc(cx, cy, side / 2, 0, TAU);
      context.closePath();
      return;
    case 'oval':
      context.moveTo(cx + rect.width / 2, cy);
      context.ellipse(cx, cy, rect.width / 2, rect.height / 2, 0, 0, TAU);
      context.closePath();
      return;
    case 'arch': {
      const radius = Math.min(rect.width / 2, rect.height);
      context.moveTo(rect.x, rect.y + rect.height);
      context.lineTo(rect.x, rect.y + radius);
      context.arc(cx, rect.y + radius, radius, Math.PI, 0);
      context.lineTo(rect.x + rect.width, rect.y + rect.height);
      context.closePath();
      return;
    }
    case 'hex':
      hex(context, rect);
      return;
    case 'diamond':
      polygon(context, [
        [cx, rect.y],
        [rect.x + rect.width, cy],
        [cx, rect.y + rect.height],
        [rect.x, cy],
      ]);
      return;
    case 'star':
      star(context, rect);
      return;
    case 'ticket':
      ticket(context, rect);
      return;
    case 'stamp':
      stamp(context, rect);
      return;
    case 'blob':
      blob(context, rect, options.seed ?? 0);
      return;
  }
}

/**
 * Le rectangle UTILE d'une forme — là où poser un bandeau, une pastille :
 * le carré inscrit d'un cercle, le rectangle d'un losange, etc. Un texte
 * posé DANS la case (`plate`, `badge`, `bubble`) s'y tient.
 */
export function shapeInnerRect(shape: SlotShape, rect: Rect): Rect {
  const { x: cx, y: cy } = centerOf(rect);
  const around = (width: number, height: number): Rect => ({ x: cx - width / 2, y: cy - height / 2, width, height });
  const side = Math.min(rect.width, rect.height);
  switch (shape) {
    case 'circle':
      return around(side * 0.82, side * 0.82);
    case 'oval':
      return around(rect.width * 0.82, rect.height * 0.82);
    case 'hex':
      return around(Math.min(rect.width, rect.height / HEX_RATIO), Math.min(rect.height, rect.width * HEX_RATIO) * 0.7);
    case 'diamond':
      return around(rect.width * 0.5, rect.height * 0.5);
    case 'heart':
      return { x: cx - side * 0.3, y: rect.y + rect.height * 0.2, width: side * 0.6, height: rect.height * 0.45 };
    case 'star':
      return around(side * 0.42, side * 0.42);
    case 'arch':
      return { x: rect.x, y: rect.y + Math.min(rect.width / 2, rect.height) * 0.4, width: rect.width, height: rect.height - Math.min(rect.width / 2, rect.height) * 0.4 };
    case 'ticket':
    case 'stamp':
      return { x: rect.x + side * 0.06, y: rect.y + side * 0.06, width: rect.width - side * 0.12, height: rect.height - side * 0.12 };
    case 'blob':
      return around(rect.width * 0.8, rect.height * 0.8);
    case 'rect':
    case 'round':
      return rect;
  }
}
