/**
 * « Signature » (#15158) — six contours FIXES par Meeshy, sobres, dessinés dans la seule couronne de
 * l'avatar (rayons 42 à 50 du viewBox 0 0 100 100) : rien ne déborde, ils se lisent à la taille d'une liste.
 */
import { ringGradient, type P, type RingStill } from '../illustrated-rings/kit.js';
import { around, at, circlePath, diamondPoints, dotsPath, leafPath, polygonPath, starPoints } from './geometry.js';

export type StillRing = { readonly key: string } & RingStill;

const none = (colors: readonly string[]) => ({ style: 'none' as const, width: 0.02, colors });

const FIL_D_OR: StillRing = {
  key: 'fil-d-or',
  stroke: none(['#6B4E16', '#E9C77B', '#FFF3D1', '#B48A3C']),
  gradients: [ringGradient([[2, 0], [1, 0.35], [3, 0.75], [0, 1]])],
  ornament: {
    paths: [
      { d: circlePath(46), color: 3, gradient: 0, opacity: 1, width: 3.6 },
      { d: circlePath(47.2), color: 2, opacity: 0.55, width: 0.45 },
      { d: circlePath(43.4), color: 0, opacity: 0.85, width: 0.6 },
      { d: circlePath(49.2), color: 0, opacity: 0.85, width: 0.6 },
    ],
  },
};

const PEARLS = around(18).map((degrees) => at(46, degrees));
const PERLES_DE_NACRE: StillRing = {
  key: 'perles-de-nacre',
  stroke: none(['#E9E3F1', '#FFFFFF', '#7D739E', '#CFC6DF']),
  gradients: [{ kind: 'linear', x1: 0.2, y1: 0, x2: 0.8, y2: 1, stops: [{ color: 1, at: 0 }, { color: 0, at: 0.45 }, { color: 3, at: 1 }] }],
  ornament: {
    paths: [
      { d: circlePath(46), color: 2, opacity: 0.8, width: 0.8 },
      ...PEARLS.map((center) => ({ d: circlePath(3, center), color: 0, gradient: 0, opacity: 1 })),
      { d: dotsPath(PEARLS, 3), color: 2, opacity: 0.7, width: 0.4 },
      { d: dotsPath(PEARLS.map(([x, y]): P => [x - 0.9, y - 1]), 0.8), color: 1, opacity: 0.95 },
    ],
  },
};

const ECLIPSE: StillRing = {
  key: 'eclipse',
  stroke: none(['#1E1B4B', '#6366F1', '#C7D2FE', '#F0ABFC']),
  gradients: [{ kind: 'linear', x1: 0, y1: 0, x2: 1, y2: 1, stops: [{ color: 3, at: 0 }, { color: 1, at: 0.45 }, { color: 0, at: 1 }] }],
  ornament: {
    paths: [
      { d: `${circlePath(49.4)}${circlePath(44.6, [51.5, 51.5], true)}`, color: 1, gradient: 0, opacity: 1 },
      { d: circlePath(49.7), color: 2, opacity: 0.5, width: 0.35 },
      { d: polygonPath(starPoints(at(47.2, -135), 1.9)), color: 2, opacity: 0.95 },
    ],
  },
};

const PETALS = around(12).map((degrees) => leafPath(at(46, degrees - 10), at(46, degrees + 10), 1.6));
const ROSACE: StillRing = {
  key: 'rosace',
  stroke: none(['#5A1E0A', '#F59E0B', '#FDE68A', '#9A3412']),
  gradients: [ringGradient([[2, 0], [1, 1]])],
  ornament: {
    paths: [
      { d: circlePath(46), color: 3, opacity: 1, width: 3 },
      { d: PETALS.join(''), color: 1, gradient: 0, opacity: 1 },
      { d: PETALS.join(''), color: 0, opacity: 0.55, width: 0.35 },
      { d: dotsPath(around(12, -90 + 15).map((degrees) => at(46, degrees)), 0.9), color: 2, opacity: 1 },
      { d: circlePath(43.1), color: 0, opacity: 0.8, width: 0.5 },
      { d: circlePath(48.9), color: 0, opacity: 0.8, width: 0.5 },
    ],
  },
};

const STARS: readonly (readonly [number, number, number])[] = [
  [-120, 46.4, 1.9], [-62, 45.6, 1.3], [-18, 46.8, 1.6], [28, 45.4, 1.1], [71, 46.6, 1.7], [118, 45.8, 1.2], [164, 46.5, 1.5], [212, 45.7, 1.1],
];
const NUIT_ETOILEE: StillRing = {
  key: 'nuit-etoilee',
  stroke: none(['#0B1033', '#24308A', '#F8E7A1', '#8EA2FF']),
  gradients: [ringGradient([[1, 0], [0, 1]])],
  ornament: {
    paths: [
      { d: circlePath(46), color: 0, gradient: 0, opacity: 1, width: 6 },
      { d: circlePath(43.1), color: 3, opacity: 0.75, width: 0.45 },
      { d: circlePath(48.9), color: 3, opacity: 0.6, width: 0.45 },
      { d: STARS.map(([degrees, r, size]) => polygonPath(starPoints(at(r, degrees), size))).join(''), color: 2, opacity: 1 },
    ],
  },
};

const FACETS = around(24);
const STEP = 360 / 24;
const FACETTES: StillRing = {
  key: 'facettes',
  stroke: none(['#1F2937', '#94A3B8', '#F1F5F9', '#64748B']),
  gradients: [ringGradient([[2, 0], [1, 1]])],
  ornament: {
    paths: [
      { d: FACETS.map((degrees) => polygonPath([at(43.6, degrees - STEP / 2), at(43.6, degrees + STEP / 2), at(48.8, degrees)])).join(''), color: 2, gradient: 0, opacity: 1 },
      { d: FACETS.map((degrees) => polygonPath([at(48.8, degrees), at(48.8, degrees + STEP), at(43.6, degrees + STEP / 2)])).join(''), color: 3, opacity: 1 },
      { d: circlePath(43.5), color: 0, opacity: 0.85, width: 0.5 },
      { d: circlePath(48.9), color: 0, opacity: 0.85, width: 0.5 },
      { d: polygonPath(diamondPoints(at(46.2, -90), 1.1, 1.8)), color: 2, opacity: 1 },
    ],
  },
};

export const SIGNATURE_RINGS: readonly StillRing[] = [FIL_D_OR, PERLES_DE_NACRE, ECLIPSE, ROSACE, NUIT_ETOILEE, FACETTES];
