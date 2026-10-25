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

function verticalSides(d: string): readonly VerticalSide[] {
  return [...d.matchAll(/M(\d+) (\d+)((?:[hv]-?\d+)+)Z/g)].flatMap(([, sx, sy, moves]) => {
    const start: readonly [number, number] = [Number(sx), Number(sy)];
    const points = [...(moves ?? '').matchAll(/([hv])(-?\d+)/g)].reduce<readonly (readonly [number, number])[]>((acc, [, axis, n]) => {
      const [x, y] = acc[acc.length - 1] ?? start;
      return [...acc, axis === 'h' ? [x + Number(n), y] : [x, y + Number(n)]];
    }, [start]);
    const closed = [...points, start];
    return closed.slice(1).flatMap((to, at): readonly VerticalSide[] => {
      const from = closed[at] ?? to;
      return from[0] === to[0] && from[1] !== to[1] ? [{ x: from[0], y0: Math.min(from[1], to[1]), y1: Math.max(from[1], to[1]), sign: to[1] > from[1] ? 1 : -1 }] : [];
    });
  });
}

/**
 * Le masque qu'un chemin de fenêtre (`window.path`, grammaire fermée) découpe sur la boîte `origin` + `width` ×
 * `height` : règle non nulle, centre des pixels — le calcul de `rasterizeWindowPath` du générateur.
 */
export function rasterizeGloryWindowPath(d: string, { origin, width, height }: { readonly origin: readonly [number, number]; readonly width: number; readonly height: number }): Uint8Array {
  const [ox, oy] = origin;
  const sides = verticalSides(d);
  const data = new Uint8Array(Math.max(0, width * height));
  for (let y = 0; y < height; y++) {
    const center = oy + y + 0.5;
    const crossings = sides.filter((side) => side.y0 < center && center < side.y1).sort((a, b) => a.x - b.x);
    let winding = 0;
    let next = 0;
    for (let x = 0; x < width; x++) {
      while (next < crossings.length && (crossings[next]?.x ?? Infinity) <= ox + x) winding += crossings[next++]?.sign ?? 0;
      data[y * width + x] = winding === 0 ? 0 : 1;
    }
  }
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

/** La part du dessin d'une ancre qui tombe dans le chemin de la fenêtre photo (0 à 1). */
export function gloryBirdArtInWindow(format: GloryFrameFormat, anchor: GloryFrameBirdAnchor): number {
  const path = format.window.path;
  if (path === undefined) return 0;
  const [rx, ry, rw, rh] = gloryBirdArtRect(anchor);
  const [x0, y0] = [Math.max(0, Math.floor(rx)), Math.max(0, Math.floor(ry))];
  const [x1, y1] = [Math.min(format.size[0], Math.ceil(rx + rw)), Math.min(format.size[1], Math.ceil(ry + rh))];
  if (x1 <= x0 || y1 <= y0 || rw * rh === 0) return 0;
  const mask = rasterizeGloryWindowPath(path, { origin: [x0, y0], width: x1 - x0, height: y1 - y0 });
  return mask.reduce((sum, v) => sum + v, 0) / (rw * rh);
}

/**
 * Ce qui met un format en défaut : défaut absent ou selfie, mise en page sans verdict ou hors règle, dessin d'un
 * oiseau dans la photo (selfie excepté). Vide : le format tient la règle.
 */
export function gloryFrameBirdFailures(format: GloryFrameFormat): readonly string[] {
  const { default: fallback, layouts, validated } = format.birds;
  const declared = GLORY_FRAME_BIRD_LAYOUTS.filter((layout) => layouts[layout] !== undefined);
  const defaultFailure = fallback === 'selfie' || layouts[fallback] === undefined ? [`mise en page par défaut invalide : ${fallback}`] : [];
  const layoutFailures = declared.flatMap((layout) => {
    const verdict = validated?.[layout];
    if (verdict === undefined) return [`${layout} : sans verdict du détecteur`];
    const kind = gloryFrameLayoutVerdict(layout, verdict);
    const ruled = kind === 'ok' ? [] : [`${layout} : ${kind} (overlap ${verdict.overlap}, depth ${verdict.depth}, face ${verdict.face})`];
    const inside = layout === 'selfie'
      ? []
      : Object.entries(layouts[layout] ?? {}).flatMap(([key, anchor]) => {
          const share = gloryBirdArtInWindow(format, anchor);
          return share > GLORY_FRAME_ART_IN_WINDOW_MAX ? [`${layout} : ${key} dans la photo (${Math.round(share * 100)} % de son dessin)`] : [];
        });
    return [...ruled, ...inside];
  });
  return [...defaultFailure, ...layoutFailures];
}
