/**
 * Les cadres de bannière du NOUVEL AN (#16271) — un par thème, chacun FIXE (le pack statique) et ANIMÉ par des
 * mouvements déclarés (le pack vivant, arrêtés sous « réduire les animations »), dessinés sur la boîte à outils
 * des bannières assorties (#15553, viewBox 0 0 300 100). Le cadre fixe porte la même clé que son contour fixe,
 * le cadre animé celle de son contour animé : avatar et bannière se portent du même thème.
 */
import { type P, sparkle } from '../illustrated-rings/kit.js';
import { type AssortedBanner, type BannerSpec, CORNER_GROUPS, at, banner, circle, curve, diamond, line, poly, spread, star } from '../assorted-banners/draw.js';

/** Une gerbe : `count` rayons de `r1` à `r2` autour de `center`. */
const burst = (center: P, r1: number, r2: number, count = 10, start = -90) => spread(count, start, start + 360 - 360 / count).map((degrees) => line([at(r1, degrees, center), at(r2, degrees, center)]));

/** Un confetti : un petit rectangle tourné. */
const confetti = ([x, y]: P, w: number, h: number, degrees: number) =>
  poly(([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]] as const).map(([dx, dy]) => {
    const radians = (degrees * Math.PI) / 180;
    return [x + dx * Math.cos(radians) - dy * Math.sin(radians), y + dx * Math.sin(radians) + dy * Math.cos(radians)] as P;
  }));

/** Une coupe de champagne, vasque, jambe et pied, en polygone. */
const coupe = ([x, y]: P, k: number, tilt = 0) => {
  const radians = (tilt * Math.PI) / 180;
  const local: readonly P[] = [[-5, 0], [5, 0], [4, 3], [1.6, 4.6], [0.5, 5], [0.5, 10], [3, 11], [-3, 11], [-0.5, 10], [-0.5, 5], [-1.6, 4.6], [-4, 3]];
  return poly(local.map(([dx, dy]) => [x + k * (dx * Math.cos(radians) - dy * Math.sin(radians)), y + k * (dx * Math.sin(radians) + dy * Math.cos(radians))] as P));
};

type Theme = (key: string) => BannerSpec;

// ── Feux d'artifice ─────────────────────────────────────────────────────
// 0 nuit · 1 or · 2 magenta · 3 cyan · 4 violet

const artifice: Theme = (key) => ({
  key,
  palette: ['#0B1026', '#FBBF24', '#EC4899', '#22D3EE', '#7C3AED'],
  gradients: [{ kind: 'linear', x1: 0, y1: 0, x2: 1, y2: 0, stops: [{ color: 4, at: 0 }, { color: 0, at: 0.5 }, { color: 4, at: 1 }] }],
  border: { width: 5.2, color: 0, gradient: 0, opacity: 0.92, filets: [{ inset: 0.5, width: 0.45, color: 1, opacity: 1 }, { inset: 4.6, width: 0.4, color: 2, opacity: 0.9 }] },
  corner: {
    size: 18,
    marks: [
      { shapes: burst([9, 9], 2.4, 8, 10), color: 1, width: 0.7, group: 'corner' },
      { shapes: [circle(1.2, [9, 9])], color: 3 },
    ],
  },
  cartouche: {
    width: 32,
    depth: 18,
    marks: [
      { shapes: burst([0, 9], 3, 9, 14), color: 2, width: 0.8, group: 'bouquet' },
      { shapes: burst([0, 9], 1.4, 4.6, 7, -64), color: 1, width: 0.6, group: 'bouquet' },
      { shapes: burst([-11, 5], 1, 3.4, 8), color: 3, width: 0.5, group: 'gerbe-a' },
      { shapes: burst([11, 5], 1, 3.4, 8), color: 3, width: 0.5, group: 'gerbe-b' },
      { shapes: [circle(1.3, [0, 9])], color: 1 },
    ],
  },
  frieze: {
    module: 14,
    from: 22,
    fit: 'justify',
    marks: [
      { shapes: [star([4, 2.8], 1.5, 4, 0.35)], color: 1, opacity: 0.95, group: 'etincelles-a' },
      { shapes: [circle(0.55, [10, 3.2])], color: 3, opacity: 0.95, group: 'etincelles-b' },
    ],
  },
});

const artificeMotion: BannerSpec['motion'] = [
  { kind: 'pulse', targets: ['bouquet'], duration: 2.4, amplitude: 0.22, origin: 'self' },
  { kind: 'pulse', targets: ['gerbe-a', 'gerbe-b'], duration: 2.4, stagger: 1.2, amplitude: 0.3, origin: 'self' },
  { kind: 'twinkle', targets: ['etincelles-a', 'etincelles-b', ...CORNER_GROUPS], duration: 2.8, stagger: 0.45, amplitude: 0.75 },
];

// ── Confettis ───────────────────────────────────────────────────────────
// 0 violet · 1 rose · 2 jaune · 3 turquoise · 4 blanc

const confettis: Theme = (key) => ({
  key,
  palette: ['#6D28D9', '#F472B6', '#FACC15', '#2DD4BF', '#FFFDF5'],
  gradients: [{ kind: 'linear', x1: 0, y1: 0, x2: 1, y2: 1, stops: [{ color: 0, at: 0 }, { color: 1, at: 1 }] }],
  border: { width: 4.8, color: 0, gradient: 0, opacity: 0.9, filets: [{ inset: 0.5, width: 0.45, color: 2, opacity: 1 }, { inset: 4.4, width: 0.4, color: 4, opacity: 0.85 }] },
  corner: {
    size: 18,
    marks: [
      { shapes: [confetti([6, 12], 5, 2, 30), confetti([14, 5], 4.4, 1.8, -35)], color: 2, group: 'corner' },
      { shapes: [confetti([12, 13], 4, 1.6, 75)], color: 3 },
      { shapes: [circle(1.1, [5, 5]), circle(0.8, [16, 14])], color: 1 },
    ],
  },
  cartouche: {
    width: 36,
    depth: 16,
    marks: [
      { shapes: [curve([[-16, 3], [-10, 9], [-4, 4], [2, 10], [8, 5], [16, 11]])], color: 4, width: 0.8 },
      { shapes: [confetti([-12, 11], 4.4, 1.8, 20), confetti([6, 13], 4.4, 1.8, -50)], color: 1, group: 'pluie-a' },
      { shapes: [confetti([-4, 13], 4, 1.6, 65), confetti([13, 4], 4, 1.6, 10)], color: 2, group: 'pluie-b' },
      { shapes: [confetti([0, 4], 4, 1.6, -20), confetti([-15, 5], 3.6, 1.5, 45)], color: 3, group: 'pluie-c' },
    ],
  },
  frieze: {
    module: 12,
    from: 20,
    fit: 'justify',
    marks: [
      { shapes: [confetti([3, 3], 3.6, 1.4, 35)], color: 2, opacity: 0.95, group: 'frise-a' },
      { shapes: [circle(0.8, [9, 3])], color: 1, opacity: 0.95, group: 'frise-b' },
    ],
  },
});

const confettisMotion: BannerSpec['motion'] = [
  { kind: 'skew', targets: ['pluie-a', 'pluie-b', 'pluie-c'], duration: 2.6, stagger: 0.5, amplitude: 0.4, direction: 'alternate', origin: 'self' },
  { kind: 'rotate', targets: ['frise-a'], duration: 6, origin: 'self' },
  { kind: 'twinkle', targets: ['frise-b', ...CORNER_GROUPS], duration: 3, stagger: 0.5, amplitude: 0.6 },
];

// ── Minuit ──────────────────────────────────────────────────────────────
// 0 minuit · 1 argent · 2 or · 3 indigo

const minuit: Theme = (key) => ({
  key,
  palette: ['#1E1B4B', '#E2E8F0', '#D4AF37', '#6366F1'],
  gradients: [{ kind: 'linear', x1: 0, y1: 0, x2: 0, y2: 1, stops: [{ color: 3, at: 0 }, { color: 0, at: 1 }] }],
  border: { width: 5.4, color: 0, gradient: 0, opacity: 0.92, filets: [{ inset: 0.5, width: 0.45, color: 2, opacity: 1 }, { inset: 5, width: 0.4, color: 1, opacity: 0.8 }] },
  corner: {
    size: 16,
    marks: [
      { shapes: [star([8, 8], 4.6, 4, 0.3)], color: 1, group: 'corner' },
      { shapes: [circle(0.9, [14, 4]), circle(0.7, [4, 14])], color: 2 },
    ],
  },
  cartouche: {
    width: 26,
    depth: 20,
    marks: [
      { shapes: [circle(9.4, [0, 10.4])], color: 0 },
      { shapes: [circle(9.4, [0, 10.4])], color: 2, width: 0.9 },
      { shapes: spread(12, -90, 240).map((degrees) => line([at(7, degrees, [0, 10.4]), at(8.4, degrees, [0, 10.4])])), color: 1, width: 0.55 },
      { shapes: [line([[0, 10.4], [0, 4.6]])], color: 2, width: 1.2 },
      { shapes: [line([[0, 15.4], [0, 3.2]])], color: 1, width: 0.6, group: 'aiguille' },
      { shapes: [diamond([-15, 6], 1.6), diamond([15, 6], 1.6)], color: 2, group: 'eclats' },
    ],
  },
  frieze: {
    module: 13,
    from: 18,
    fit: 'justify',
    marks: [
      { shapes: [star([4, 3], 1.6, 4, 0.3)], color: 1, opacity: 0.9, group: 'etoiles-a' },
      { shapes: [circle(0.55, [10, 2.4])], color: 2, opacity: 0.9, group: 'etoiles-b' },
    ],
  },
});

const minuitMotion: BannerSpec['motion'] = [
  { kind: 'rotate', targets: ['aiguille'], duration: 12, origin: 'self' },
  { kind: 'pulse', targets: ['eclats'], duration: 3, amplitude: 0.25, origin: 'self' },
  { kind: 'twinkle', targets: ['etoiles-a', 'etoiles-b', ...CORNER_GROUPS], duration: 3.6, stagger: 0.6, amplitude: 0.7 },
];

// ── Champagne doré ──────────────────────────────────────────────────────
// 0 or · 1 champagne · 2 ambre · 3 blanc

const champagne: Theme = (key) => ({
  key,
  palette: ['#B8860B', '#F7E7CE', '#7C4A03', '#FFFDF5'],
  gradients: [{ kind: 'linear', x1: 0, y1: 0, x2: 1, y2: 0, stops: [{ color: 2, at: 0 }, { color: 0, at: 0.35 }, { color: 1, at: 0.5 }, { color: 0, at: 0.65 }] }],
  border: { width: 5.6, color: 0, gradient: 0, opacity: 0.95, filets: [{ inset: 0.5, width: 0.45, color: 1, opacity: 1 }, { inset: 5.1, width: 0.4, color: 2, opacity: 0.9 }] },
  corner: {
    size: 17,
    marks: [
      { shapes: [circle(2.4, [7, 9]), circle(1.6, [12, 4.4]), circle(1.2, [4, 14])], color: 1, width: 0.55, group: 'corner' },
      { shapes: [circle(0.6, [14, 12])], color: 3 },
    ],
  },
  cartouche: {
    width: 30,
    depth: 18,
    marks: [
      { shapes: [coupe([-5, 5], 1.1, 14), coupe([5, 5], 1.1, -14)], color: 0 },
      { shapes: [coupe([-5, 5], 1.1, 14), coupe([5, 5], 1.1, -14)], color: 2, width: 0.5 },
      { shapes: [sparkle([0, 2.4], 2.6)], color: 3, group: 'tchin' },
      { shapes: [circle(1, [-9, 1.6]), circle(0.8, [9, 1.4]), circle(0.6, [-12, 6]), circle(0.6, [12, 6])], color: 1, width: 0.4, group: 'bulles' },
    ],
  },
  frieze: {
    module: 11,
    from: 19,
    fit: 'justify',
    marks: [
      { shapes: [circle(1.1, [3, 3])], color: 1, width: 0.45, opacity: 0.95, group: 'perles-a' },
      { shapes: [circle(0.6, [8, 2.2])], color: 3, opacity: 0.95, group: 'perles-b' },
    ],
  },
});

const champagneMotion: BannerSpec['motion'] = [
  { kind: 'pulse', targets: ['tchin'], duration: 2.2, amplitude: 0.35, origin: 'self' },
  { kind: 'twinkle', targets: ['bulles', 'perles-a', 'perles-b', ...CORNER_GROUPS], duration: 2.6, stagger: 0.4, amplitude: 0.7 },
];

const THEMES: readonly (readonly [Theme, BannerSpec['motion'], string, string])[] = [
  [artifice, artificeMotion, 'feux-d-artifice', 'bouquet-final'],
  [confettis, confettisMotion, 'pluie-de-confettis', 'envol-de-confettis'],
  [minuit, minuitMotion, 'cadran-de-minuit', 'minuit-sonne'],
  [champagne, champagneMotion, 'coupe-de-champagne', 'champagne-petillant'],
];

/** Les quatre cadres fixes, dans l'ordre de l'offre. */
export const NEW_YEAR_STILL_FRAMES: readonly AssortedBanner[] = THEMES.map(([theme, , stillKey]) => banner(theme(stillKey)));

/** Les quatre cadres animés, dans l'ordre de l'offre. */
export const NEW_YEAR_ANIMATED_FRAMES: readonly AssortedBanner[] = THEMES.map(([theme, motion, , animatedKey]) => banner({ ...theme(animatedKey), motion }));
