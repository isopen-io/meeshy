/**
 * Les briques des OFFRES SAISONNIÈRES (#16270, #16271) : chemins SVG des tuiles de motif (fonds et images de
 * bannière) et pièces de films Lottie (gerbes, confettis, bulles, flocons, étincelles) composées sur le kit des
 * cadres illustrés. Une pièce de film se dessine autour de l'origine ; le film la pose par sa transformation.
 */
import { FPS, LINEAR, type P, type Profile, animated, art, cycle, ellipse, fill, glow, path, sharpShape, sparkle, stack, still, stroke } from '../illustrated-rings/kit.js';
import { circlePath, filmOf, n2, polygonPath, starPoints } from '../meeshy-collections/geometry.js';

export { circlePath, n2, polygonPath, starPoints };

const rad = (degrees: number): number => (degrees * Math.PI) / 180;
export const pointAt = (r: number, degrees: number, [x, y]: P = [0, 0]): P => [x + r * Math.cos(rad(degrees)), y + r * Math.sin(rad(degrees))];
const segment = (from: P, to: P): string => `M${n2(from[0])} ${n2(from[1])}L${n2(to[0])} ${n2(to[1])}`;

// ── Les chemins de tuile ────────────────────────────────────────────────

/** Une gerbe de feu d'artifice : `count` rayons de `r1` à `r2` autour de `center`. */
export const burstD = (center: P, r1: number, r2: number, count = 12, start = 0): string =>
  Array.from({ length: count }, (_, index) => start + (index * 360) / count).map((degrees) => segment(pointAt(r1, degrees, center), pointAt(r2, degrees, center))).join('');

/** Un confetti : un petit rectangle tourné de `degrees`. */
export const confettiD = (center: P, w: number, h: number, degrees: number): string =>
  polygonPath(([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]] as const).map(([x, y]) => {
    const [c, s] = [Math.cos(rad(degrees)), Math.sin(rad(degrees))];
    return [center[0] + x * c - y * s, center[1] + x * s + y * c] as P;
  }));

/** Un cadran : le cercle, douze graduations, et les deux aiguilles sur midi moins cinq. */
export const clockD = (center: P, r: number): { readonly face: string; readonly ticks: string; readonly hands: string } => ({
  face: circlePath(r, center),
  ticks: Array.from({ length: 12 }, (_, index) => index * 30).map((degrees) => segment(pointAt(r * 0.78, degrees, center), pointAt(r * 0.92, degrees, center))).join(''),
  hands: `${segment(center, pointAt(r * 0.72, -90, center))}${segment(center, pointAt(r * 0.5, -120, center))}`,
});

/** Une coupe de champagne : la vasque, la jambe et le pied, en un trait. */
export const coupeD = ([x, y]: P, size: number): string => {
  const k = size / 10;
  const p = (dx: number, dy: number): string => `${n2(x + dx * k)} ${n2(y + dy * k)}`;
  return `M${p(-5, 0)}L${p(5, 0)}Q${p(4.5, 4.5)} ${p(0.4, 5)}L${p(0.4, 10)}L${p(3, 11)}L${p(-3, 11)}L${p(-0.4, 10)}L${p(-0.4, 5)}Q${p(-4.5, 4.5)} ${p(-5, 0)}Z`;
};

/** Des bulles : des cercles évidés de rayons donnés. */
export const bubblesD = (bubbles: readonly (readonly [number, number, number])[]): string => bubbles.map(([x, y, r]) => circlePath(r, [x, y])).join('');

/** Un flocon à six branches (trois traits) portant chacune deux barbes. */
export const flakeD = (center: P, r: number): string =>
  [-90, -30, 30, 90, 150, 210]
    .flatMap((degrees) => {
      const knot = pointAt(r * 0.58, degrees, center);
      return [segment(center, pointAt(r, degrees, center)), segment(pointAt(r * 0.32, degrees - 50, knot), knot), segment(knot, pointAt(r * 0.32, degrees + 50, knot))];
    })
    .join('');

// ── Les pièces de film ──────────────────────────────────────────────────

export const film = (name: string, seconds: number, width: number, height: number, pieces: readonly unknown[]) => filmOf(name, seconds, width, height, pieces);

const rays = (count: number, r1: number, r2: number) =>
  Array.from({ length: count }, (_, index) => (index * 360) / count).map((degrees) => path(sharpShape([pointAt(r1, degrees), pointAt(r2, degrees)], false)));

/** Une gerbe qui éclôt à `at` : les rayons s'ouvrent, l'éclat culmine puis s'éteint ; `phase` décale l'éclosion dans le cycle. */
export function burstPiece(options: { readonly at: P; readonly size: number; readonly hex: string; readonly core?: string; readonly phase: number; readonly frames: number; readonly peak?: number; readonly width?: number }) {
  const { at, size, hex, core = '#FFFFFF', phase, frames, peak = 100, width = size / 9 } = options;
  const grow: Profile = [[0, [15, 15]], [0.18, [100, 100]], [0.4, [118, 118]], [1, [118, 118]]];
  const fade: Profile = [[0, [0]], [0.04, [peak]], [0.25, [peak * 0.8]], [0.45, [0]], [1, [0]]];
  return stack(
    [
      glow([0, 0], size * 0.9, hex, 0.35),
      art(rays(14, size * 0.25, size), [stroke(hex, width)]),
      art(rays(7, size * 0.15, size * 0.55), [stroke(core, width * 0.8)]),
      art([ellipse([size * 0.18, size * 0.18])], [fill(core)]),
    ],
    { p: still(at), s: animated(cycle(grow, phase, frames)), o: animated(cycle(fade, phase, frames)) },
  );
}

/** Un confetti qui tombe de `x` en tournoyant, sur toute la hauteur `height`. */
export function confettiPiece(options: { readonly x: number; readonly height: number; readonly hex: string; readonly size: number; readonly phase: number; readonly frames: number; readonly drift?: number; readonly opacity?: number; readonly turns?: number }) {
  const { x, height, hex, size, phase, frames, drift = 14, opacity = 100, turns = 2 } = options;
  const fall: Profile = [[0, [x, -size * 2]], [0.25, [x + drift, height * 0.25]], [0.5, [x - drift, height * 0.5]], [0.75, [x + drift, height * 0.75]], [1, [x, height + size * 2]]];
  const flip: Profile = [[0, [100, 100]], [0.25, [100, 15]], [0.5, [100, 100]], [0.75, [100, 15]], [1, [100, 100]]];
  return art([path(sharpShape([[-size, -size * 0.45], [size, -size * 0.45], [size, size * 0.45], [-size, size * 0.45]]))], [fill(hex, opacity)], {
    p: animated(cycle(fall, phase, frames), LINEAR),
    r: animated(cycle([[0, [0]], [1, [360 * turns]]], phase, frames), LINEAR),
    s: animated(cycle(flip, phase, frames)),
  });
}

/** Une bulle qui monte de `from` à `to` en oscillant, et s'efface en haut. */
export function bubblePiece(options: { readonly from: P; readonly rise: number; readonly r: number; readonly hex: string; readonly phase: number; readonly frames: number; readonly opacity?: number; readonly width?: number }) {
  const { from, rise, r, hex, phase, frames, opacity = 85, width = Math.max(r / 3, 0.5) } = options;
  const [x, y] = from;
  const climb: Profile = [[0, [x, y]], [0.33, [x + r * 1.5, y - rise / 3]], [0.66, [x - r * 1.5, y - (rise * 2) / 3]], [1, [x, y - rise]]];
  const fade: Profile = [[0, [0]], [0.12, [opacity]], [0.75, [opacity]], [1, [0]]];
  return art([ellipse([r * 2, r * 2]), ellipse([r * 0.6, r * 0.6], [-r * 0.35, -r * 0.35])], [stroke(hex, width)], {
    p: animated(cycle(climb, phase, frames), LINEAR),
    o: animated(cycle(fade, phase, frames)),
  });
}

/** Une étincelle qui scintille sur place. */
export function sparklePiece(options: { readonly at: P; readonly size: number; readonly hex: string; readonly phase: number; readonly frames: number; readonly low?: number; readonly high?: number }) {
  const { at, size, hex, phase, frames, low = 10, high = 100 } = options;
  const twinkle: Profile = [[0, [low]], [0.2, [high]], [0.4, [low]], [1, [low]]];
  return stack([glow([0, 0], size * 1.8, hex, 0.4), art([path(sparkle([0, 0], size))], [fill(hex)])], {
    p: still(at),
    o: animated(cycle(twinkle, phase, frames)),
    s: animated(cycle([[0, [70, 70]], [0.2, [110, 110]], [0.4, [70, 70]], [1, [70, 70]]], phase, frames)),
  });
}

/** Un flocon qui tombe en tournant lentement. */
export function flakePiece(options: { readonly x: number; readonly height: number; readonly size: number; readonly hex: string; readonly phase: number; readonly frames: number; readonly opacity?: number }) {
  const { x, height, size, hex, phase, frames, opacity = 90 } = options;
  const fall: Profile = [[0, [x, -size * 2]], [0.5, [x + size * 2, height / 2]], [1, [x, height + size * 2]]];
  const spokes = [-90, -30, 30].map((degrees) => path(sharpShape([pointAt(size, degrees), pointAt(size, degrees + 180)], false)));
  return art(spokes, [stroke(hex, Math.max(size / 5, 0.6), opacity)], {
    p: animated(cycle(fall, phase, frames), LINEAR),
    r: animated(cycle([[0, [0]], [1, [180]]], phase, frames), LINEAR),
  });
}

export { FPS };
