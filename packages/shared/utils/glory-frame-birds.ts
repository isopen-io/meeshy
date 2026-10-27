/**
 * Mee et Meo ne recouvrent jamais la photo — la règle LUE SUR LE CONTRAT, sans navigateur (#10277, prompt § 5.7).
 *
 * Le détecteur pixel à pixel vit dans le générateur (`docs/product/cadres-de-gloire/generateur/lib/overlap.mjs`,
 * gardé en CI) : il rend chaque mise en page d'un cadre et écrit son verdict (`birds.validated`). Ce module relit ce
 * verdict, et ajoute un témoin GÉOMÉTRIQUE que tout lecteur du contrat peut rejouer : le DESSIN de chaque oiseau
 * (sa boîte carrée réduite à `art`, tournée) reste hors de la fenêtre photo, selfie excepté.
 */
import { GLORY_FRAME_BIRD_LAYOUTS, type GloryFrameBirdAnchor, type GloryFrameBirdLayout, type GloryFrameFormat, type GloryFrameLayoutVerdict } from '../types/glory-frame-format.js';

/** La règle du générateur (`lib/overlap-rule.mjs`), à l'échelle de design : overlap ≤ 250 px, depth ≤ 6 px, face = 0. */
export const GLORY_FRAME_OVERLAP_RULE = { overlap: 250, depth: 6, face: 0 } as const;

/**
 * La part du dessin d'un oiseau qui peut tomber dans le CHEMIN de la fenêtre. Le chemin est la fenêtre du décor : il
 * passe sous la plaque, le blason et l'avant-plan, que le détecteur, lui, voit couvrir la photo ; et un dessin réduit
 * à son rectangle compte ses coins vides. Au-delà, l'oiseau est DANS la photo.
 */
export const GLORY_FRAME_ART_IN_WINDOW_MAX = 0.35;

export type GloryFrameLayoutVerdictKind = 'ok' | 'hors-regle' | 'face';

export function gloryFrameLayoutVerdict(layout: GloryFrameBirdLayout, { overlap, depth, face }: GloryFrameLayoutVerdict): GloryFrameLayoutVerdictKind {
  if (face > GLORY_FRAME_OVERLAP_RULE.face) return 'face';
  if (layout === 'selfie') return 'ok';
  return overlap > GLORY_FRAME_OVERLAP_RULE.overlap || depth > GLORY_FRAME_OVERLAP_RULE.depth ? 'hors-regle' : 'ok';
}

type VerticalSide = { readonly x: number; readonly y0: number; readonly y1: number; readonly sign: 1 | -1 };
type Run = readonly [number, number];

function verticalSide(x: number, from: number, to: number): VerticalSide {
  return { x, y0: Math.min(from, to), y1: Math.max(from, to), sign: to > from ? 1 : -1 };
}

function subpathSides([sx, sy]: readonly [number, number], moves: string): readonly VerticalSide[] {
  const sides: VerticalSide[] = [];
  let [x, y] = [sx, sy];
  for (const [, axis, n] of moves.matchAll(/([hv])(-?\d+)/g)) {
    const step = Number(n);
    if (axis === 'v' && step !== 0) sides.push(verticalSide(x, y, y + step));
    if (axis === 'h') x += step;
    else y += step;
  }
  return x === sx && y !== sy ? [...sides, verticalSide(x, y, sy)] : sides;
}

function verticalSides(d: string): readonly VerticalSide[] {
  return [...d.matchAll(/M(\d+) (\d+)((?:[hv]-?\d+)+)Z/g)].flatMap(([, sx, sy, moves]) => subpathSides([Number(sx), Number(sy)], moves ?? ''));
}

/**
 * Les plages `[a, b)` d'abscisses de winding non nul, pour chaque ligne de pixels `oy + i` (`0 ≤ i < rows`), lue en
 * son centre : un pixel d'abscisse `X` est dans le chemin ssi `a ≤ X < b` pour une plage de sa ligne. Le chemin n'est
 * lu qu'UNE fois, et chaque côté ne visite que les lignes qu'il traverse.
 */
function windowRuns(d: string, oy: number, rows: number): readonly (readonly Run[])[] {
  const crossings: VerticalSide[][] = Array.from({ length: Math.max(0, rows) }, () => []);
  verticalSides(d).forEach((side) => {
    const last = Math.min(crossings.length - 1, Math.ceil(side.y1 - oy - 0.5) - 1);
    for (let row = Math.max(0, Math.floor(side.y0 - oy - 0.5) + 1); row <= last; row++) crossings[row]?.push(side);
  });
  return crossings.map((row) => {
    const sorted = row.sort((a, b) => a.x - b.x);
    return sorted.reduce<{ readonly winding: number; readonly runs: readonly Run[] }>(({ winding, runs }, side, at) => {
      const turned = winding + side.sign;
      const end = sorted[at + 1]?.x ?? Infinity;
      return { winding: turned, runs: turned !== 0 && end > side.x ? [...runs, [side.x, end]] : runs };
    }, { winding: 0, runs: [] }).runs;
  });
}

/**
 * Le masque qu'un chemin de fenêtre (`window.path`, grammaire fermée) découpe sur la boîte `origin` + `width` ×
 * `height` : règle non nulle, centre des pixels — le calcul de `rasterizeWindowPath` du générateur.
 */
export function rasterizeGloryWindowPath(d: string, { origin, width, height }: { readonly origin: readonly [number, number]; readonly width: number; readonly height: number }): Uint8Array {
  const [ox, oy] = origin;
  const data = new Uint8Array(Math.max(0, width * height));
  windowRuns(d, oy, height).forEach((runs, y) =>
    runs.forEach(([a, b]) => data.fill(1, y * width + Math.max(0, Math.ceil(a - ox)), y * width + Math.min(width, Math.ceil(b - ox)))),
  );
  return data;
}

type Rect = readonly [number, number, number, number];

/** Le rectangle (boîte englobante, rotation comprise) du DESSIN d'une ancre, en pixels de l'image. */
export function gloryBirdArtRect({ box: [x, y, w, h], art = [0, 0, 1, 1], rotate, flip }: GloryFrameBirdAnchor): Rect {
  const [ax, ay, aw, ah] = art;
  const left = flip ? 1 - ax - aw : ax;
  const [cx, cy] = [x + w / 2, y + h / 2];
  const corners = [
    [x + left * w, y + ay * h],
    [x + (left + aw) * w, y + ay * h],
    [x + left * w, y + (ay + ah) * h],
    [x + (left + aw) * w, y + (ay + ah) * h],
  ] as const;
  const rad = (rotate * Math.PI) / 180;
  const turned = corners.map(([px, py]) => [cx + (px - cx) * Math.cos(rad) - (py - cy) * Math.sin(rad), cy + (px - cx) * Math.sin(rad) + (py - cy) * Math.cos(rad)] as const);
  const xs = turned.map(([px]) => px);
  const ys = turned.map(([, py]) => py);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
}

/** Le nombre de pixels `x0 ≤ X < x1` d'une ligne dans ses plages : bornes entières, la grammaire du chemin l'est. */
function insideCount(runs: readonly Run[], x0: number, x1: number): number {
  return runs.reduce((sum, [a, b]) => sum + Math.max(0, Math.min(b, x1) - Math.max(a, x0)), 0);
}

/** La mesure de `gloryBirdArtInWindow` pour toutes les ancres d'un format : la fenêtre n'est découpée qu'une fois. */
function gloryBirdArtInWindowOf(format: GloryFrameFormat): (anchor: GloryFrameBirdAnchor) => number {
  const path = format.window.path;
  if (path === undefined) return () => 0;
  const runs = windowRuns(path, 0, format.size[1]);
  return (anchor) => {
    const [rx, ry, rw, rh] = gloryBirdArtRect(anchor);
    const [x0, y0] = [Math.max(0, Math.floor(rx)), Math.max(0, Math.floor(ry))];
    const [x1, y1] = [Math.min(format.size[0], Math.ceil(rx + rw)), Math.min(format.size[1], Math.ceil(ry + rh))];
    if (x1 <= x0 || y1 <= y0 || rw * rh === 0) return 0;
    return runs.slice(y0, y1).reduce((sum, row) => sum + insideCount(row, x0, x1), 0) / (rw * rh);
  };
}

/** La part du dessin d'une ancre qui tombe dans le chemin de la fenêtre photo (0 à 1). */
export function gloryBirdArtInWindow(format: GloryFrameFormat, anchor: GloryFrameBirdAnchor): number {
  return gloryBirdArtInWindowOf(format)(anchor);
}

/**
 * Ce qui met un format en défaut : défaut absent ou selfie, mise en page sans verdict ou hors règle, dessin d'un
 * oiseau dans la photo (selfie excepté). Vide : le format tient la règle.
 */
export function gloryFrameBirdFailures(format: GloryFrameFormat): readonly string[] {
  const { default: fallback, layouts, validated } = format.birds;
  const declared = GLORY_FRAME_BIRD_LAYOUTS.filter((layout) => layouts[layout] !== undefined);
  const artInWindow = gloryBirdArtInWindowOf(format);
  const defaultFailure = fallback === 'selfie' || layouts[fallback] === undefined ? [`mise en page par défaut invalide : ${fallback}`] : [];
  const layoutFailures = declared.flatMap((layout) => {
    const verdict = validated?.[layout];
    if (verdict === undefined) return [`${layout} : sans verdict du détecteur`];
    const kind = gloryFrameLayoutVerdict(layout, verdict);
    const ruled = kind === 'ok' ? [] : [`${layout} : ${kind} (overlap ${verdict.overlap}, depth ${verdict.depth}, face ${verdict.face})`];
    const inside = layout === 'selfie'
      ? []
      : Object.entries(layouts[layout] ?? {}).flatMap(([key, anchor]) => {
          const share = artInWindow(anchor);
          return share > GLORY_FRAME_ART_IN_WINDOW_MAX ? [`${layout} : ${key} dans la photo (${Math.round(share * 100)} % de son dessin)`] : [];
        });
    return [...ruled, ...inside];
  });
  return [...defaultFailure, ...layoutFailures];
}
