import { gridRects, inset, plain, scatter, unitOf, whole, type Circle, type LayoutInput, type MontageCell, type MontageLayout, type Rect } from './call-montage-shapes';

/**
 * **LES MONTAGES GLAMOUR, EN GÉOMÉTRIE** (#8580) — six mises en scène de
 * magazine pour la photo de groupe d'un appel, toutes composées avec TOUS
 * les visages affichés, du plus grand au plus petit :
 *
 * - `cover` : la couverture — le premier visage en héros plein cadre, sous le
 *   titre « MEESHY », trois accroches, la date, un code-barres, les autres en
 *   médaillons ronds ;
 * - `redcarpet` : le tapis rouge — un velours plissé, les flashs des
 *   photographes, les participants alignés sur une même ligne ;
 * - `gold` : le doré — un cadre d'or, un bokeh chaud, une lueur douce ;
 * - `film` : la pellicule 35 mm — des images égales, perforées des deux côtés,
 *   numérotées ;
 * - `neon` : des cadres néon rose et cyan qui rayonnent sur un fond sombre ;
 * - `noir` : le studio en noir et blanc — grain et vignettage.
 *
 * Tout est déterministe (`scatter`) : l'aperçu vivant ne scintille pas d'une
 * image à l'autre, et la capture est l'aperçu à pleine résolution.
 */

const MASTHEAD = 'MEESHY';

const barcodeBars = (rect: Rect): readonly Rect[] => {
  const count = 34;
  const step = rect.width / count;
  return Array.from({ length: count }, (_, index) => index)
    .filter((index) => scatter(index + 3) > 0.28)
    .map((index) => ({ x: rect.x + index * step, y: rect.y, width: step * (scatter(index + 91) > 0.6 ? 0.8 : 0.4), height: rect.height * 0.78 }));
};

function medallions(count: number, area: Rect, unit: number): readonly MontageCell[] {
  if (count <= 0) return [];
  const gap = unit * 0.025;
  const fit = (columns: number): number => {
    const rows = Math.ceil(count / columns);
    return Math.min(unit * 0.26, (area.height - gap * (rows - 1)) / rows, (area.width - gap * (columns - 1)) / columns);
  };
  const columns = [1, 2, 3].find((candidate) => fit(candidate) >= unit * 0.14) ?? 3;
  const side = fit(columns);
  const stroke = { width: unit * 0.008, color: '#ffffff' };
  return Array.from({ length: count }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const rect = { x: area.x + area.width - (column + 1) * side - column * gap, y: area.y + row * (side + gap), width: side, height: side };
    return plain(rect, { radius: side / 2, stroke });
  });
}

function cover({ count, size }: LayoutInput): MontageLayout {
  const unit = unitOf(size);
  const pad = unit * 0.05;
  const masthead = { x: pad, y: pad, width: size.width - pad * 2, height: unit * 0.2 };
  const dateline = { x: pad, y: pad + unit * 0.21, width: size.width - pad * 2, height: unit * 0.035 };
  const lineWidth = size.width * 0.44;
  const lineTop = size.height * 0.58;
  const lines = [0, 1, 2].map((index) => ({
    kind: 'coverline' as const,
    index,
    accent: index === 0,
    rect: { x: pad, y: lineTop + index * unit * 0.1, width: lineWidth, height: index === 0 ? unit * 0.075 : unit * 0.052 },
  }));
  const barcodeRect = { x: pad, y: size.height - pad - unit * 0.12, width: unit * 0.2, height: unit * 0.12 };
  const column = { x: pad + lineWidth + unit * 0.03, y: dateline.y + dateline.height + unit * 0.04, width: size.width - pad * 2 - lineWidth - unit * 0.03, height: size.height - pad - (dateline.y + dateline.height + unit * 0.04) };
  return {
    size,
    background: { kind: 'solid', color: '#000000' },
    cells: count === 0 ? [] : [plain(whole(size)), ...medallions(count - 1, column, unit)],
    clip: null,
    ornaments: [
      { kind: 'masthead', rect: masthead, text: MASTHEAD },
      { kind: 'dateline', rect: dateline },
      ...lines,
      { kind: 'barcode', rect: barcodeRect, bars: barcodeBars(barcodeRect) },
    ],
  };
}

const flashes = (size: { readonly width: number; readonly height: number }, unit: number): readonly Circle[] =>
  Array.from({ length: 9 }, (_, index) => ({ x: (0.08 + 0.84 * scatter(index + 7)) * size.width, y: (0.05 + 0.3 * scatter(index + 31)) * size.height, r: unit * (0.025 + 0.03 * scatter(index + 13)) }));

function redcarpet({ count, size }: LayoutInput): MontageLayout {
  const unit = unitOf(size);
  const pad = unit * 0.05;
  const gap = unit * 0.025;
  const aspect = 0.62;
  const width = Math.min((size.width - pad * 2 - gap * Math.max(0, count - 1)) / Math.max(1, count), size.height * 0.55 * aspect);
  const height = width / aspect;
  const baseline = size.height * 0.92;
  const start = (size.width - (width * count + gap * Math.max(0, count - 1))) / 2;
  const stroke = { width: unit * 0.004, color: '#e9c46a' };
  const cells = Array.from({ length: count }, (_, index) => plain({ x: start + index * (width + gap), y: baseline - height, width, height }, { radius: width * 0.08, stroke }));
  const folds = Array.from({ length: 8 }, (_, index) => ({ x: (index * size.width) / 8, y: 0, width: size.width / 8, height: size.height * 0.64 }));
  return {
    size,
    background: { kind: 'radial', inner: '#8e1020', outer: '#2a0307' },
    cells,
    clip: null,
    ornaments: [
      { kind: 'drapes', folds },
      { kind: 'flashes', points: flashes(size, unit) },
    ],
  };
}

function gold({ count, size }: LayoutInput): MontageLayout {
  const unit = unitOf(size);
  const circles = Array.from({ length: 18 }, (_, index) => ({ x: scatter(index + 1) * size.width, y: scatter(index + 50) * size.height, r: unit * (0.02 + 0.05 * scatter(index + 100)) }));
  const stroke = { width: unit * 0.006, color: '#f7d774' };
  return {
    size,
    background: { kind: 'radial', inner: '#5a3a12', outer: '#140b02' },
    cells: gridRects(count, inset(whole(size), unit * 0.1), unit * 0.03).map((rect) => plain(rect, { radius: unit * 0.02, stroke, glow: '#ffcf6b' })),
    clip: null,
    ornaments: [
      { kind: 'bokeh', circles },
      { kind: 'frame', rect: inset(whole(size), unit * 0.04), width: unit * 0.018 },
    ],
  };
}

function film({ count, size }: LayoutInput): MontageLayout {
  const unit = unitOf(size);
  const margin = unit * 0.08;
  const gap = unit * 0.03;
  const hole = unit * 0.024;
  const n = Math.max(1, count);
  const tall = size.height > size.width;
  const frames: readonly Rect[] = tall
    ? (() => {
        const width = size.width * 0.6;
        const height = Math.min(width * 0.72, (size.height - margin * 2 - gap * (n - 1)) / n);
        const top = (size.height - (height * n + gap * (n - 1))) / 2;
        return Array.from({ length: count }, (_, index) => ({ x: (size.width - width) / 2, y: top + index * (height + gap), width, height }));
      })()
    : (() => {
        const height = size.height * 0.6;
        const width = Math.min(height * 1.4, (size.width - margin * 2 - gap * (n - 1)) / n);
        const left = (size.width - (width * n + gap * (n - 1))) / 2;
        return Array.from({ length: count }, (_, index) => ({ x: left + index * (width + gap), y: (size.height - height) / 2, width, height }));
      })();
  const lane = tall ? size.width * 0.6 : size.height * 0.6;
  const near = tall ? (size.width - lane) / 2 - unit * 0.05 : (size.height - lane) / 2 - unit * 0.05;
  const far = tall ? (size.width + lane) / 2 + unit * 0.05 - hole : (size.height + lane) / 2 + unit * 0.05 - hole;
  const span = tall ? size.height : size.width;
  const holes = Array.from({ length: Math.floor((span - hole) / (hole * 2.2)) }, (_, index) => index * hole * 2.2 + hole * 0.6).flatMap((along) =>
    [near, far].map((across) => (tall ? { x: across, y: along, width: hole, height: hole * 1.4 } : { x: along, y: across, width: hole * 1.4, height: hole })),
  );
  const items = frames.map((frame, index) => ({ x: frame.x + frame.width - unit * 0.06, y: frame.y + frame.height + gap * 0.15, size: unit * 0.022, text: `${12 + index}A` }));
  return {
    size,
    background: { kind: 'solid', color: '#1c140d' },
    cells: frames.map((frame) => plain(frame, { radius: unit * 0.006 })),
    clip: null,
    ornaments: [
      { kind: 'holes', rects: holes },
      { kind: 'frameNumbers', items },
    ],
  };
}

const NEON = ['#ff2d95', '#00e5ff'] as const;

function neon({ count, size }: LayoutInput): MontageLayout {
  const unit = unitOf(size);
  return {
    size,
    background: { kind: 'solid', color: '#07040f' },
    cells: gridRects(count, inset(whole(size), unit * 0.08), unit * 0.06).map((rect, index) => {
      const color = NEON[index % NEON.length] ?? NEON[0];
      return plain(rect, { radius: unit * 0.03, stroke: { width: unit * 0.008, color }, glow: color });
    }),
    clip: null,
    ornaments: [],
  };
}

function noir({ count, size }: LayoutInput): MontageLayout {
  const unit = unitOf(size);
  const dots = Array.from({ length: 260 }, (_, index) => ({ x: scatter(index + 7) * size.width, y: scatter(index + 401) * size.height, r: unit * (0.0012 + 0.0022 * scatter(index + 803)) }));
  return {
    size,
    background: { kind: 'solid', color: '#101010' },
    cells: gridRects(count, inset(whole(size), unit * 0.06), unit * 0.03).map((rect) => plain(rect, { tone: 'mono', stroke: { width: unit * 0.004, color: '#f2f2f2' } })),
    clip: null,
    ornaments: [
      { kind: 'vignette', rect: whole(size) },
      { kind: 'grain', rect: whole(size), dots },
    ],
  };
}

export type GlamourStyle = 'cover' | 'gold' | 'redcarpet' | 'film' | 'neon' | 'noir';

export const GLAMOUR_LAYOUTS: Readonly<Record<GlamourStyle, (input: LayoutInput) => MontageLayout>> = { cover, gold, redcarpet, film, neon, noir };
