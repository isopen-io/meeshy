import type { FaceEffect } from './video-effects';

/**
 * **LES EFFETS DE VISAGE, EN GÉOMÉTRIE** (#8551) — sans canevas : où est le
 * visage, où poser les cornes du démon, le halo de l'ange, les yeux du
 * crapaud, où sont les braises de l'éruption à l'instant `t`. Le dessin
 * (`face-effects-draw.ts`) ne fait que tracer ce que ces fonctions rendent.
 *
 * Tout est DÉTERMINISTE et piloté par le temps (`t` en millisecondes) : la
 * même image au même instant donne le même dessin. Le visage vient du
 * détecteur du navigateur (`FaceDetector`) quand il existe, lu une image sur
 * `FACE_DETECT_EVERY` et lissé ; sinon d'une boîte supposée, au centre et
 * vers le haut — là où se tient celui qui se filme.
 *
 * Chaque image a un budget (`FACE_FRAME_BUDGET_MS`) : quand la moyenne
 * glissante le dépasse, l'effet renonce à ses ornements (particules,
 * plumes) et garde sa couleur, jusqu'à repasser sous le seuil.
 */

export type Box = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

export type Point = { readonly x: number; readonly y: number };

export type Circle = { readonly cx: number; readonly cy: number; readonly r: number };

export const FACE_DETECT_EVERY = 5;

export const shouldDetect = (frameIndex: number): boolean => frameIndex % FACE_DETECT_EVERY === 0;

export function heuristicFaceBox(frame: { readonly width: number; readonly height: number }): Box {
  const width = frame.width * 0.34;
  const height = Math.min(width * 1.3, frame.height * 0.6);
  return { x: frame.width / 2 - width / 2, y: frame.height * 0.38 - height / 2, width, height };
}

const lerp = (from: number, to: number, weight: number): number => from + (to - from) * weight;

export function smoothFaceBox(previous: Box | null, next: Box, weight = 0.35): Box {
  if (previous === null) return next;
  return { x: lerp(previous.x, next.x, weight), y: lerp(previous.y, next.y, weight), width: lerp(previous.width, next.width, weight), height: lerp(previous.height, next.height, weight) };
}

const centerOf = (face: Box): number => face.x + face.width / 2;

export type Horn = { readonly base: readonly [Point, Point]; readonly control: Point; readonly tip: Point };

export function hornsOf(face: Box): { readonly left: Horn; readonly right: Horn } {
  const cx = centerOf(face);
  const top = face.y + face.height * 0.08;
  const horn = (side: -1 | 1): Horn => {
    const inner = cx + side * face.width * 0.16;
    const outer = cx + side * face.width * 0.34;
    return {
      base: [
        { x: inner, y: top },
        { x: outer, y: top + face.height * 0.06 },
      ],
      control: { x: cx + side * face.width * 0.52, y: top - face.height * 0.12 },
      tip: { x: cx + side * face.width * 0.3, y: face.y - face.height * 0.32 },
    };
  };
  return { left: horn(-1), right: horn(1) };
}

export function haloOf(face: Box, t: number): { readonly cx: number; readonly cy: number; readonly rx: number; readonly ry: number; readonly lineWidth: number; readonly glow: number } {
  const shimmer = 0.75 + 0.25 * Math.sin(t / 260);
  return { cx: centerOf(face), cy: face.y - face.height * 0.14 + Math.sin(t / 700) * face.height * 0.015, rx: face.width * 0.4, ry: face.width * 0.1, lineWidth: Math.max(2, face.width * 0.045), glow: shimmer };
}

export type ToadEye = Circle & { readonly pupil: number };

export type Ellipse = { readonly cx: number; readonly cy: number; readonly rx: number; readonly ry: number };

export type Wart = { readonly x: number; readonly y: number; readonly r: number };

const WARTS: readonly (readonly [number, number, number])[] = [
  [0.22, 0.52, 0.022],
  [0.74, 0.47, 0.018],
  [0.36, 0.78, 0.016],
  [0.66, 0.74, 0.02],
  [0.5, 0.36, 0.014],
];

export function toadOf(face: Box): { readonly eyes: readonly ToadEye[]; readonly cheeks: readonly Ellipse[]; readonly warts: readonly Wart[] } {
  const cx = centerOf(face);
  const r = face.width * 0.17;
  const eye = (side: -1 | 1): ToadEye => ({ cx: cx + side * face.width * 0.24, cy: face.y + face.height * 0.06, r, pupil: r * 0.45 });
  const cheek = (side: -1 | 1): Ellipse => ({ cx: cx + side * face.width * 0.44, cy: face.y + face.height * 0.68, rx: face.width * 0.2, ry: face.height * 0.14 });
  return {
    eyes: [eye(-1), eye(1)],
    cheeks: [cheek(-1), cheek(1)],
    warts: WARTS.map(([x, y, size]) => ({ x: face.x + face.width * x, y: face.y + face.height * y, r: Math.max(1.5, face.width * size) })),
  };
}

export function demonEyesOf(face: Box, t: number): readonly (Circle & { readonly glow: number })[] {
  const glow = 0.7 + 0.3 * Math.sin(t / 180);
  return ([-1, 1] as const).map((side) => ({ cx: centerOf(face) + side * face.width * 0.2, cy: face.y + face.height * 0.4, r: face.width * 0.06, glow }));
}

/** Un générateur pseudo-aléatoire graine → [0, 1) : les mêmes braises à chaque rendu. */
function seeded(seed: number): () => number {
  let state = (seed * 2654435761) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export type Particle = { readonly x: number; readonly y: number; readonly r: number; readonly alpha: number };

type ParticleInput = { readonly seed: number; readonly t: number; readonly count: number; readonly area: Box; readonly size?: number; readonly period?: number };

/** Des particules qui MONTENT à travers `area`, chacune sur son propre cycle. */
export function risingParticles({ seed, t, count, area, size = Math.max(2, area.width * 0.006), period = 2600 }: ParticleInput): readonly Particle[] {
  return Array.from({ length: count }, (_, index) => {
    const random = seeded(seed * 1000 + index);
    const [start, lane, offset, sway, scale] = [random(), random(), random(), random(), random()];
    const cycle = period * (0.7 + start * 0.8);
    const phase = (t / cycle + offset) % 1;
    const drift = Math.sin(phase * Math.PI * 2 + sway * 6) * area.width * 0.02;
    const x = Math.min(area.x + area.width, Math.max(area.x, area.x + lane * area.width + drift));
    return { x, y: area.y + area.height * (1 - phase), r: size * (0.5 + scale), alpha: Math.sin(phase * Math.PI) };
  });
}

export function sparklesOf(face: Box, t: number): readonly Particle[] {
  const cx = centerOf(face);
  const cy = face.y + face.height * 0.2;
  return Array.from({ length: 6 }, (_, index) => {
    const angle = t / 1400 + (index * Math.PI * 2) / 6;
    const radius = face.width * (0.62 + 0.06 * Math.sin(t / 500 + index));
    return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius * 0.7, r: Math.max(2, face.width * 0.03), alpha: 0.55 + 0.45 * Math.sin(t / 300 + index * 1.7) ** 2 };
  });
}

export const lavaGlow = (t: number): number => 0.78 + 0.12 * Math.sin(t / 170) + 0.08 * Math.sin(t / 53 + 1.3);

const GRADE: Readonly<Record<FaceEffect, string>> = {
  none: '',
  smoothing: '',
  toad: '',
  angel: 'brightness(1.08) saturate(0.92) contrast(0.96)',
  demon: 'contrast(1.18) saturate(1.25) sepia(0.25) hue-rotate(-20deg)',
  volcano: 'sepia(0.35) saturate(1.6) hue-rotate(-12deg) contrast(1.1)',
};

/** Ce que l'effet fait à la couleur de TOUTE l'image, en filtre de canevas — vide s'il ne touche que le visage. */
export const faceGrade = (effect: FaceEffect): string => GRADE[effect];

export const FACE_FRAME_BUDGET_MS = 8;

export type EffectLoad = { readonly ema: number; readonly degraded: boolean };

/** La moyenne glissante du coût d'une image, et l'hystérésis qui décide de renoncer aux ornements. */
export function nextEffectLoad(load: EffectLoad, sampleMs: number): EffectLoad {
  const ema = load.ema * 0.85 + sampleMs * 0.15;
  if (load.degraded) return { ema, degraded: ema > FACE_FRAME_BUDGET_MS * 0.6 };
  return { ema, degraded: ema > FACE_FRAME_BUDGET_MS };
}
