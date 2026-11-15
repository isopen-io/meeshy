/**
 * LA GÉOMÉTRIE D'UN STICKER MEE EN LOTTIE (#10639) — un attribut `d` SVG
 * devient la liste de sous-tracés que Lottie attend : des sommets ABSOLUS et
 * des poignées RELATIVES à leur sommet. Le dessin de `src/lib/mee/` n'emploie
 * que `M L H V C Q A Z` (relevé du 2026-10-14) : toute autre commande est
 * refusée, pour qu'un trait ajouté au catalogue ne disparaisse jamais en
 * silence du film.
 */

export type Point = readonly [number, number];

export type BezierShape = {
  readonly closed: boolean;
  readonly vertices: readonly Point[];
  readonly inTangents: readonly Point[];
  readonly outTangents: readonly Point[];
};

type Cubic = readonly [number, number, number, number, number, number];

type Builder = { vertices: Point[]; inTangents: Point[]; outTangents: Point[]; closed: boolean };

const TOKEN = /[a-zA-Z]|-?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/g;

export function arcToCubics(from: Point, arc: { rx: number; ry: number; rotation: number; large: boolean; sweep: boolean }, to: Point): readonly Cubic[] {
  const [x1, y1] = from;
  const [x2, y2] = to;
  const phi = (arc.rotation * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;
  const lambda = (x1p * x1p) / (arc.rx * arc.rx) + (y1p * y1p) / (arc.ry * arc.ry);
  const grow = lambda > 1 ? Math.sqrt(lambda) : 1;
  const rx = Math.abs(arc.rx) * grow;
  const ry = Math.abs(arc.ry) * grow;
  const numerator = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const factor = (arc.large === arc.sweep ? -1 : 1) * Math.sqrt(Math.max(0, numerator / (rx * rx * y1p * y1p + ry * ry * x1p * x1p)));
  const cxp = (factor * rx * y1p) / ry;
  const cyp = (-factor * ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const start = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  const rawDelta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  const delta = !arc.sweep && rawDelta > 0 ? rawDelta - 2 * Math.PI : arc.sweep && rawDelta < 0 ? rawDelta + 2 * Math.PI : rawDelta;
  const segments = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2) - 1e-9));
  const step = delta / segments;
  const k = (4 / 3) * Math.tan(step / 4);
  const point = (t: number): Point => [cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos];
  const derivative = (t: number): Point => [-rx * Math.sin(t) * cos - ry * Math.cos(t) * sin, -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos];
  return Array.from({ length: segments }, (_, index) => {
    const t0 = start + index * step;
    const t1 = t0 + step;
    const [p0x, p0y] = point(t0);
    const [p1x, p1y] = point(t1);
    const [d0x, d0y] = derivative(t0);
    const [d1x, d1y] = derivative(t1);
    return [p0x + k * d0x, p0y + k * d0y, p1x - k * d1x, p1y - k * d1y, p1x, p1y] as const;
  });
}

export function parsePathData(d: string): readonly BezierShape[] {
  const tokens = d.match(TOKEN) ?? [];
  const shapes: Builder[] = [];
  let index = 0;
  let command = '';
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let current: Builder | null = null;

  const number = (): number => parseFloat(tokens[index++] as string);
  const flag = (): boolean => {
    const token = tokens[index] as string;
    if (token.length > 1 && /^[01]/.test(token)) {
      tokens[index] = token.slice(1);
      return token[0] === '1';
    }
    index += 1;
    return token === '1';
  };
  const open = (px: number, py: number): Builder => {
    const shape: Builder = { vertices: [[px, py]], inTangents: [[0, 0]], outTangents: [[0, 0]], closed: false };
    shapes.push(shape);
    return shape;
  };
  const shape = (): Builder => current ?? (current = open(x, y));
  const lineTo = (ex: number, ey: number) => {
    const s = shape();
    s.vertices.push([ex, ey]);
    s.inTangents.push([0, 0]);
    s.outTangents.push([0, 0]);
    x = ex;
    y = ey;
  };
  const cubicTo = ([c1x, c1y, c2x, c2y, ex, ey]: Cubic) => {
    const s = shape();
    s.outTangents[s.vertices.length - 1] = [c1x - x, c1y - y];
    s.vertices.push([ex, ey]);
    s.inTangents.push([c2x - ex, c2y - ey]);
    s.outTangents.push([0, 0]);
    x = ex;
    y = ey;
  };
  const close = () => {
    const s = shape();
    s.closed = true;
    const last = s.vertices.length - 1;
    const [lx, ly] = s.vertices[last] as Point;
    const [fx, fy] = s.vertices[0] as Point;
    if (last > 0 && Math.abs(lx - fx) < 1e-6 && Math.abs(ly - fy) < 1e-6) {
      s.inTangents[0] = s.inTangents[last] as Point;
      s.vertices.pop();
      s.inTangents.pop();
      s.outTangents.pop();
    }
    x = startX;
    y = startY;
    current = null;
  };

  while (index < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[index] as string)) command = tokens[index++] as string;
    const relative = command === command.toLowerCase();
    const ox = relative ? x : 0;
    const oy = relative ? y : 0;
    switch (command.toUpperCase()) {
      case 'M': {
        const px = number() + ox;
        const py = number() + oy;
        current = open(px, py);
        x = startX = px;
        y = startY = py;
        command = relative ? 'l' : 'L';
        break;
      }
      case 'L':
        lineTo(number() + ox, number() + oy);
        break;
      case 'H':
        lineTo(number() + ox, y);
        break;
      case 'V':
        lineTo(x, number() + oy);
        break;
      case 'C':
        cubicTo([number() + ox, number() + oy, number() + ox, number() + oy, number() + ox, number() + oy]);
        break;
      case 'Q': {
        const qx = number() + ox;
        const qy = number() + oy;
        const ex = number() + ox;
        const ey = number() + oy;
        cubicTo([x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), ex + (2 / 3) * (qx - ex), ey + (2 / 3) * (qy - ey), ex, ey]);
        break;
      }
      case 'A': {
        const arc = { rx: number(), ry: number(), rotation: number(), large: flag(), sweep: flag() };
        const to: Point = [number() + ox, number() + oy];
        arcToCubics([x, y], arc, to).forEach(cubicTo);
        break;
      }
      case 'Z':
        close();
        break;
      default:
        throw new Error(`commande de tracé non prise en charge : ${command}`);
    }
  }
  return shapes;
}
