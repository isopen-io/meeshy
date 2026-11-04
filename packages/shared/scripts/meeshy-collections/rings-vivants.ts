/**
 * « Vivants » (#15158) — six contours ANIMÉS par Meeshy. L'anneau fixe est complet à lui seul (c'est l'image
 * de « réduire les animations » et des clients antérieurs) ; les films n'ajoutent QUE ce qui bouge — lueur
 * derrière, perle, comète, étincelles ou houle devant — et débordent de 1,2 × la boîte du contour au plus,
 * pour rester lisibles dans une liste. Devant l'avatar, rien n'entre sous le rayon 43 : le visage reste libre.
 *
 * Repère d'un film : un carré de 120 unités centré sur l'avatar ; le contour en occupe les 100 du milieu.
 */
import {
  FPS,
  LINEAR,
  animated,
  art,
  cycle,
  ellipse,
  fill,
  glow,
  keys,
  path,
  radial,
  sharpShape,
  sparkle,
  stack,
  still,
  stroke,
  type P,
  type Profile,
} from '../illustrated-rings/kit.js';
import { around, at, circlePath, dotsPath, filmOf, polygonPath, starPoints } from './geometry.js';
import type { StillRing } from './rings-signature.js';

export const VIVANT_REACH = 1.2;
const SIDE = 100 * VIVANT_REACH;
const O: P = [SIDE / 2, SIDE / 2];
const film = (name: string, seconds: number, pieces: readonly unknown[]) => filmOf(name, seconds, SIDE, SIDE, pieces);

/** Un point du film à `r` de l'avatar, à `degrees`. */
const fp = (r: number, degrees: number): P => at(r, degrees, O);

const spin = (seconds: number, turns = 1) => ({ a: still(O), p: still(O), r: animated(keys([[0, 0], [seconds, 360 * turns]]), LINEAR) });

/** Une lueur en couronne : transparente sur l'avatar, pleine sur le contour, éteinte au bord du film. */
const halo = (hex: string, peak: number, opacity: number | ReturnType<typeof animated> = 100) =>
  art([ellipse([SIDE, SIDE], O)], [radial([[0, hex], [1, hex]], O, SIDE / 2, { alphas: [[0, 0], [0.7, 0], [0.8, peak], [1, 0]], opacity })]);

const breathe = (seconds: number, low: number, high: number) => animated(keys([[0, low], [seconds * 0.5, high], [seconds, low]]));

export type VivantRing = StillRing & { readonly back?: () => unknown; readonly front?: () => unknown };

const none = (colors: readonly string[]) => ({ style: 'none' as const, width: 0.02, colors });
const filets = (color: number, opacity: number) => [
  { d: circlePath(43.3), color, opacity, width: 0.5 },
  { d: circlePath(48.9), color, opacity, width: 0.5 },
];

/** Orbite : deux perles inégales et leur traîne tournent sur la couronne ; un halo indigo respire derrière. */
const ORBITE: VivantRing = {
  key: 'orbite',
  stroke: none(['#312E81', '#818CF8', '#E0E7FF']),
  ornament: { paths: [{ d: circlePath(46), color: 1, opacity: 0.9, width: 2.2 }, ...filets(0, 0.85)] },
  back: () => film('orbite-halo', 6, [halo('#818CF8', 0.55, breathe(6, 45, 100))]),
  front: () => {
    const bead = (degrees: number, r: number, hex: string) => [
      ...Array.from({ length: 9 }, (_, index) =>
        art([ellipse([r * 1.7 * (1 - index * 0.09), r * 1.7 * (1 - index * 0.09)], fp(46, degrees - (index + 1) * 4.2))], [fill(hex, 75 - index * 8)]),
      ).reverse(),
      glow(fp(46, degrees), r * 1.6, '#C7D2FE', 0.8),
      art([ellipse([r * 2, r * 2], fp(46, degrees))], [fill('#FFFFFF')]),
      art([ellipse([r * 2, r * 2], fp(46, degrees))], [stroke('#6366F1', 0.5, 90)]),
    ];
    return film('orbite-perles', 6, [stack([...bead(-90, 2.6, '#818CF8'), ...bead(90, 1.7, '#A5B4FC')], spin(6))]);
  },
};

/** Halo d'aurore : trois lueurs (sarcelle, violet, rose) tournent lentement derrière un anneau dégradé. */
const HALO_AURORE: VivantRing = {
  key: 'halo-aurore',
  stroke: none(['#0F766E', '#2DD4BF', '#A78BFA', '#F0ABFC', '#134E4A']),
  gradients: [{ kind: 'linear', x1: 0, y1: 0, x2: 1, y2: 1, stops: [{ color: 1, at: 0 }, { color: 2, at: 0.55 }, { color: 3, at: 1 }] }],
  ornament: { paths: [{ d: circlePath(46), color: 1, gradient: 0, opacity: 1, width: 3 }, ...filets(4, 0.8)] },
  back: () =>
    film('halo-aurore', 12, [
      stack(
        ([[-90, '#2DD4BF'], [-30, '#A78BFA'], [30, '#F472B6'], [90, '#2DD4BF'], [150, '#A78BFA'], [210, '#F472B6']] as const).map(([degrees, hex], index) =>
          glow(fp(50.5, degrees), index % 3 === 0 ? 10 : 8.5, hex, 0.55),
        ),
        spin(12),
      ),
    ]),
};

/** Pulsation : trois ondes corail partent du contour et s'éteignent au bord, l'une après l'autre. */
const PULSATION: VivantRing = {
  key: 'pulsation',
  stroke: none(['#9F1239', '#FB7185', '#FFE4E6']),
  ornament: { paths: [{ d: circlePath(46), color: 1, opacity: 1, width: 2.6 }, { d: circlePath(46.9), color: 2, opacity: 0.6, width: 0.4 }, ...filets(0, 0.85)] },
  back: () => {
    const seconds = 4.5;
    const frames = seconds * FPS;
    const size: Profile = [[0, [96, 96]], [1, [118, 118]]];
    const fade: Profile = [[0, [70]], [0.2, [55]], [1, [0]]];
    const width: Profile = [[0, [2.4]], [1, [0.6]]];
    return film('pulsation', seconds, [
      halo('#FB7185', 0.35),
      ...[0, 1 / 3, 2 / 3].map((phase) => ({
        ty: 'gr',
        it: [
          { ty: 'el', p: still(O), s: animated(cycle(size, phase, frames), LINEAR), d: 1 },
          { ty: 'st', c: still([0.984, 0.443, 0.522, 1]), o: animated(cycle(fade, phase, frames)), w: animated(cycle(width, phase, frames)), lc: 2, lj: 2, ml: 4 },
          { ty: 'tr', p: still([0, 0]), a: still([0, 0]), s: still([100, 100]), r: still(0), o: still(100), sk: still(0), sa: still(0) },
        ],
      })),
    ]);
  },
};

const GLINTS: readonly (readonly [number, number, number, number])[] = [
  [-100, 53, 2.6, 0], [-40, 54.5, 1.9, 0.37], [5, 52.5, 2.3, 0.71], [52, 55, 1.7, 0.18], [96, 53, 2.5, 0.56], [142, 54.5, 1.8, 0.86], [188, 52.5, 2.2, 0.29], [236, 55, 1.7, 0.63],
];
/** Scintillement : un fil d'or semé d'étoiles ; autour, huit éclats s'allument et s'éteignent tour à tour. */
const SCINTILLEMENT: VivantRing = {
  key: 'scintillement',
  stroke: none(['#78350F', '#FBBF24', '#FEF3C7']),
  ornament: {
    paths: [
      { d: circlePath(46), color: 1, opacity: 1, width: 1.4 },
      ...filets(0, 0.75),
      { d: around(8, -70).map((degrees) => polygonPath(starPoints(at(46, degrees), 1.5))).join(''), color: 2, opacity: 1 },
    ],
  },
  back: () => film('scintillement-halo', 5, [halo('#FBBF24', 0.32, breathe(5, 55, 100))]),
  front: () => {
    const seconds = 5;
    const frames = seconds * FPS;
    const pop: Profile = [[0, [0, 0]], [0.12, [100, 100]], [0.24, [0, 0]], [1, [0, 0]]];
    return film(
      'scintillement',
      seconds,
      GLINTS.map(([degrees, r, size, phase]) => {
        const center = fp(r, degrees);
        return stack([glow([0, 0], size * 1.4, '#FBBF24', 0.6), art([path(sparkle([0, 0], size * 1.5))], [fill('#F59E0B')]), art([path(sparkle([0, 0], size * 0.7))], [fill('#FFFFFF')])], {
          p: still(center),
          s: animated(cycle(pop, phase, frames)),
        });
      }),
    );
  },
};

/** Comète : une tête blanche et sa longue traîne bleue font le tour de la couronne en quatre secondes. */
const COMETE: VivantRing = {
  key: 'comete',
  stroke: none(['#1E3A8A', '#60A5FA', '#DBEAFE']),
  ornament: { paths: [{ d: circlePath(46), color: 1, opacity: 0.9, width: 1.6 }, ...filets(0, 0.8), { d: dotsPath(around(24).map((degrees) => at(46, degrees)), 0.35), color: 2, opacity: 0.8 }] },
  front: () =>
    film('comete', 4, [
      stack(
        [
          ...Array.from({ length: 16 }, (_, index) => art([ellipse([3.6 * (1 - index * 0.055), 3.6 * (1 - index * 0.055)], fp(46, -90 - (index + 1) * 3.2))], [fill(index < 6 ? '#93C5FD' : '#3B82F6', 80 - index * 4.8)])).reverse(),
          glow(fp(46, -90), 4.2, '#BFDBFE', 0.9),
          art([ellipse([4, 4], fp(46, -90))], [fill('#FFFFFF')]),
        ],
        spin(4),
      ),
    ]),
};

/** Une houle de `lobes` ondulations autour du rayon `r`, en sommets vifs assez serrés pour paraître courbe. */
const swell = (r: number, amplitude: number, lobes: number, offset: number) =>
  path(
    sharpShape(
      Array.from({ length: lobes * 8 }, (_, index) => {
        const degrees = (index * 360) / (lobes * 8);
        return fp(r + amplitude * Math.sin(((degrees + offset) * lobes * Math.PI) / 180), degrees);
      }),
    ),
  );

/** Houle : deux ondes d'eau tournent en sens contraires sur un anneau cyan ; une lueur marine respire derrière. */
const HOULE: VivantRing = {
  key: 'houle',
  stroke: none(['#155E75', '#22D3EE', '#CFFAFE']),
  ornament: { paths: [{ d: circlePath(46), color: 1, opacity: 0.85, width: 2.4 }, ...filets(0, 0.85)] },
  back: () => film('houle-halo', 12, [halo('#22D3EE', 0.4, breathe(12, 50, 100))]),
  front: () =>
    film('houle', 12, [
      stack([art([swell(46, 1.5, 9, 0)], [stroke('#CFFAFE', 0.7, 85)])], spin(12)),
      stack([art([swell(46, 1.2, 7, 20)], [stroke('#67E8F9', 0.6, 75)])], spin(12, -1)),
    ]),
};

export const VIVANT_RINGS: readonly VivantRing[] = [ORBITE, HALO_AURORE, PULSATION, SCINTILLEMENT, COMETE, HOULE];
