/**
 * Compose les SIX couches Lottie des décorations animées de #13950 — deux contours
 * (« Prisme vivant », « Onde »), deux bannières (« Marée », « Braises ») et deux fonds
 * (« Bulles légères », « Pluie de pétales ») — en données pures, sans outil de dessin :
 *
 *   cd packages/shared && bun scripts/compose-animated-decor-lotties.ts
 *
 * Chaque couche est écrite adressée par contenu dans `design/appearance/lottie/<sha16>.json`
 * et sa référence `{ src, bytes, sha256 }` s'imprime, à reporter dans la source du catalogue
 * (`wallpapers/designs.json`, `banners/designs.json`, `avatar-rings/rings.json`). Idempotent :
 * mêmes formules ⇒ mêmes octets ⇒ mêmes adresses. Une boucle DOUCE : 30 images par seconde,
 * 5 à 15 secondes, chaque mouvement revient à son point de départ (ou repart hors champ, là où
 * le saut ne se voit pas) ; aucune expression, aucune image : `validateLottie` les lit toutes.
 */
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateLottie } from '../utils/lottie-validate.js';

type Vec = readonly number[];
type Key = { readonly t: number; readonly s: Vec; readonly h?: 1 };
type Profile = readonly (readonly [number, Vec])[];

const FPS = 30;
const round = (value: number): number => Math.round(value * 10) / 10;
const still = (k: number | Vec) => ({ a: 0, k: typeof k === 'number' ? k : k.map(round) });
const LINEAR = { i: { x: [1], y: [1] }, o: { x: [0], y: [0] } };
const SOFT = { i: { x: [0.45], y: [1] }, o: { x: [0.55], y: [0] } };

const animated = (keys: readonly Key[], ease: typeof LINEAR = LINEAR) => ({
  a: 1,
  k: keys.map((key, index) => (index === keys.length - 1 ? { t: round(key.t), s: key.s.map(round) } : { t: round(key.t), s: key.s.map(round), ...(key.h ? { h: 1 } : ease) })),
});

const lerp = (from: Vec, to: Vec, at: number): Vec => from.map((value, index) => value + ((to[index] ?? value) - value) * at);

const sample = (profile: Profile, u: number): Vec => {
  const next = profile.findIndex(([at]) => at >= u);
  if (next <= 0) return profile[Math.max(next, 0)]![1];
  const [fromAt, from] = profile[next - 1]!;
  const [toAt, to] = profile[next]!;
  return lerp(from, to, (u - fromAt) / (toAt - fromAt));
};

/**
 * Un mouvement de cycle (`u` de 0 à 1) décalé de `phase`, déplié sur `frames` images : la valeur
 * de l'image 0 est celle de l'image finale, et le saut de fin de cycle (u = 1 → u = 0) se tient une
 * image — il n'a lieu que là où le profil le cache (hors champ, ou à opacité nulle).
 */
function cycle(profile: Profile, phase: number, frames: number): Key[] {
  const at = (u: number) => ((u - phase + 1) % 1) * frames;
  const start: Key = { t: 0, s: sample(profile, phase) };
  if (phase === 0) return profile.map(([u, s]) => ({ t: u * frames, s }));
  const wrap = (1 - phase) * frames;
  const before = profile.filter(([u]) => u > phase).map(([u, s]): Key => ({ t: at(u), s }));
  const after = profile.filter(([u]) => u < phase).map(([u, s]): Key => ({ t: u === 0 ? wrap + 1 : at(u), s }));
  const held = before.length === 0 ? [] : [{ ...before[before.length - 1]!, t: wrap, h: 1 as const }];
  return [start, ...before.slice(0, -1), ...held, ...after, { t: frames, s: sample(profile, phase) }].filter((key, index, keys) => index === 0 || key.t > keys[index - 1]!.t);
}

const transform = (overrides: Record<string, unknown> = {}) => ({
  ty: 'tr',
  p: still([0, 0]),
  a: still([0, 0]),
  s: still([100, 100]),
  r: still(0),
  o: still(100),
  sk: still(0),
  sa: still(0),
  ...overrides,
});

const rgba = (hex: string): Vec => [0, 2, 4].map((at) => round(parseInt(hex.slice(1 + at, 3 + at), 16) / 255)).concat(1);
const fill = (hex: string, opacity: number | ReturnType<typeof animated>) => ({ ty: 'fl', c: still(rgba(hex)), o: typeof opacity === 'number' ? still(opacity) : opacity, r: 1 });
const stroke = (hex: string, width: number | ReturnType<typeof animated>, opacity: number | ReturnType<typeof animated> = 100) => ({
  ty: 'st',
  c: still(rgba(hex)),
  o: typeof opacity === 'number' ? still(opacity) : opacity,
  w: typeof width === 'number' ? still(width) : width,
  lc: 2,
  lj: 2,
  ml: 4,
});
const ellipse = (size: number | ReturnType<typeof animated>, at: Vec = [0, 0]) => ({ ty: 'el', p: still(at), s: typeof size === 'number' ? still([size, size]) : size, d: 1 });
const group = (items: readonly unknown[]) => ({ ty: 'gr', it: items });

const layer = (index: number, shapes: readonly unknown[], frames: number, ks: Record<string, unknown> = {}) => ({
  ddd: 0,
  ind: index,
  ty: 4,
  sr: 1,
  ks: { o: still(100), r: still(0), p: still([0, 0, 0]), a: still([0, 0, 0]), s: still([100, 100, 100]), ...ks },
  ao: 0,
  shapes,
  ip: 0,
  op: frames,
  st: 0,
  bm: 0,
});

const animation = (name: string, width: number, height: number, frames: number, layers: readonly unknown[]) => ({
  v: '5.7.0',
  fr: FPS,
  ip: 0,
  op: frames,
  w: width,
  h: height,
  nm: name,
  ddd: 0,
  assets: [],
  layers: layers.map((entry, index) => ({ ...(entry as object), ind: index + 1 })),
  markers: [],
});

/** Contour « Prisme vivant » : six arcs aux couleurs du prisme Meeshy tournent ensemble autour de l'avatar, en 8 s. */
function prismeVivant() {
  const frames = 8 * FPS;
  const colors = ['#6366F1', '#A855F7', '#EC4899', '#F59E0B', '#10B981', '#0EA5E9'];
  const arcs = colors.map((color, index) =>
    group([ellipse(92, [50, 50]), { ty: 'tm', s: still((index * 100) / 6 + 1.2), e: still(((index + 1) * 100) / 6 - 1.2), o: still(0), m: 1 }, stroke(color, 3.4), transform()]),
  );
  const glow = group([
    ellipse(92, [50, 50]),
    stroke('#FFFFFF', 1, animated([{ t: 0, s: [0] }, { t: frames / 2, s: [45] }, { t: frames, s: [0] }], SOFT)),
    transform(),
  ]);
  return animation('prisme-vivant', 100, 100, frames, [
    layer(1, [glow, ...arcs], frames, { a: still([50, 50, 0]), p: still([50, 50, 0]), r: animated([{ t: 0, s: [0] }, { t: frames, s: [360] }]) }),
  ]);
}

/** Contour « Onde » : deux ondes indigo naissent au bord de l'avatar et s'éloignent en s'effaçant, une toutes les 2,5 s. */
function onde() {
  const frames = 5 * FPS;
  const size: Profile = [[0, [84, 84]], [1, [98, 98]]];
  const opacity: Profile = [[0, [0]], [0.14, [80]], [1, [0]]];
  const width: Profile = [[0, [2.6]], [1, [0.6]]];
  const wave = (phase: number, color: string) =>
    group([ellipse(animated(cycle(size, phase, frames)), [50, 50]), stroke(color, animated(cycle(width, phase, frames)), animated(cycle(opacity, phase, frames))), transform()]);
  return animation('onde', 100, 100, frames, [layer(1, [wave(0, '#6366F1'), wave(0.5, '#A5B4FC')], frames)]);
}

/** Une vague : demi-ondes cubiques lisses de `from` à `to`, fermée par le bas de la toile. */
function wavePath(from: number, to: number, base: number, amplitude: number, length: number, floor: number) {
  const half = length / 2;
  const count = Math.round((to - from) / half);
  const crest = amplitude * 1.33;
  const vertices = Array.from({ length: count + 1 }, (_, index) => [from + index * half, base]);
  const sign = (index: number) => (index % 2 === 0 ? 1 : -1);
  const outs = vertices.map((_, index) => (index === count ? [0, 0] : [half * 0.36, -sign(index) * crest]));
  const ins = vertices.map((_, index) => (index === 0 ? [0, 0] : [-half * 0.36, -sign(index - 1) * crest]));
  return {
    ty: 'sh',
    ks: {
      a: 0,
      k: {
        c: true,
        v: [...vertices, [to, floor], [from, floor]].map((point) => point.map(round)),
        i: [...ins, [0, 0], [0, 0]].map((point) => point.map(round)),
        o: [...outs, [0, 0], [0, 0]].map((point) => point.map(round)),
      },
    },
  };
}

/** Bannière « Marée » : trois houles d'écume glissent l'une sur l'autre, la plus proche à contre-courant, en 10 s. */
function maree() {
  const frames = 10 * FPS;
  const swell = (base: number, amplitude: number, length: number, opacity: number, direction: 1 | -1) => {
    const from = direction === 1 ? 0 : -length;
    const to = direction === 1 ? 600 + length : 600;
    const shift = animated([{ t: 0, s: [0, 0] }, { t: frames, s: [-direction * length, 0] }]);
    return group([wavePath(from, to, base, amplitude, length, 210), fill('#FFFFFF', opacity), transform({ p: shift })]);
  };
  const glint = group([
    { ty: 'rc', p: still([0, 0]), s: still([90, 320]), r: still(0), d: 1 },
    fill('#FFFFFF', 10),
    transform({ p: animated([{ t: 0, s: [-120, 100] }, { t: frames * 0.45, s: [720, 100] }, { t: frames, s: [720, 100] }], SOFT), r: still(18) }),
  ]);
  return animation('maree', 600, 200, frames, [
    layer(1, [glint], frames),
    layer(2, [swell(176, 7, 150, 22, -1), swell(150, 9, 200, 14, 1), swell(122, 11, 300, 9, 1)], frames),
  ]);
}

/** Bannière « Braises » : neuf braises montent en ondulant, s'allument puis s'éteignent, en 12 s. */
function braises() {
  const frames = 12 * FPS;
  const embers: readonly (readonly [number, number, number, string])[] = [
    [40, 0, 8, '#FDBA74'], [110, 0.42, 6, '#FB923C'], [175, 0.77, 10, '#FCD34D'],
    [250, 0.18, 7, '#F97316'], [320, 0.6, 9, '#FDBA74'], [385, 0.31, 6, '#FCD34D'],
    [450, 0.88, 8, '#FB923C'], [515, 0.12, 10, '#FDBA74'], [570, 0.52, 7, '#F97316'],
  ];
  const opacity: Profile = [[0, [0]], [0.15, [95]], [0.6, [75]], [1, [0]]];
  return animation('braises', 600, 200, frames, [
    layer(
      1,
      embers.map(([x, phase, size, color]) => {
        const path: Profile = [[0, [x, 214]], [0.5, [x + 14, 100]], [1, [x - 6, -14]]];
        return group([ellipse(size), fill(color, 100), transform({ p: animated(cycle(path, phase, frames)), o: animated(cycle(opacity, phase, frames)) })]);
      }),
      frames,
    ),
  ]);
}

/** Fond « Bulles légères » : huit bulles cerclées montent sans hâte d'un bas à l'autre du fil, en 15 s. */
function bullesLegeres() {
  const frames = 15 * FPS;
  const bubbles: readonly (readonly [number, number, number])[] = [
    [48, 0, 34], [300, 0.13, 22], [180, 0.27, 52], [86, 0.41, 18], [262, 0.55, 40], [150, 0.69, 26], [330, 0.82, 46], [20, 0.93, 20],
  ];
  return animation('bulles-legeres', 360, 760, frames, [
    layer(
      1,
      bubbles.map(([x, phase, size]) => {
        const path: Profile = [[0, [x, 800]], [0.5, [x + 14, 380]], [1, [x - 6, -40]]];
        return group([
          ellipse(size),
          ellipse(size * 0.22, [-size * 0.2, -size * 0.2]),
          fill('#818CF8', 10),
          stroke('#818CF8', 1.6, 42),
          transform({ p: animated(cycle(path, phase, frames)) }),
        ]);
      }),
      frames,
    ),
  ]);
}

/** Fond « Pluie de pétales » : huit pétales roses tombent en tournoyant, en 14 s. */
function pluieDePetales() {
  const frames = 14 * FPS;
  const petal = { ty: 'sh', ks: { a: 0, k: { c: true, v: [[0, -14], [0, 14]], i: [[-9, 6], [9, -6]], o: [[9, 6], [-9, -6]] } } };
  const petals: readonly (readonly [number, number, number, string])[] = [
    [60, 0, 1, '#F9A8D4'], [210, 0.12, 0.8, '#FBCFE8'], [320, 0.26, 1.1, '#F472B6'], [130, 0.38, 0.9, '#F9A8D4'],
    [270, 0.51, 1, '#FBCFE8'], [30, 0.64, 0.8, '#F472B6'], [180, 0.77, 1.2, '#F9A8D4'], [340, 0.9, 0.9, '#FBCFE8'],
  ];
  return animation('pluie-de-petales', 360, 760, frames, [
    layer(
      1,
      petals.map(([x, phase, scale, color]) => {
        const path: Profile = [[0, [x, -30]], [0.25, [x + 22, 160]], [0.5, [x - 10, 360]], [0.75, [x + 18, 560]], [1, [x - 4, 790]]];
        const turn: Profile = [[0, [0]], [1, [540]]];
        return group([
          petal,
          fill(color, 55),
          transform({ p: animated(cycle(path, phase, frames)), r: animated(cycle(turn, phase, frames)), s: still([scale * 100, scale * 100]) }),
        ]);
      }),
      frames,
    ),
  ]);
}

export const ANIMATED_DECOR_LOTTIES = {
  'prisme-vivant': prismeVivant,
  onde,
  maree,
  braises,
  'bulles-legeres': bullesLegeres,
  'pluie-de-petales': pluieDePetales,
} as const;

export function renderAnimatedDecorLottie(key: keyof typeof ANIMATED_DECOR_LOTTIES): Buffer {
  return Buffer.from(JSON.stringify(ANIMATED_DECOR_LOTTIES[key]()), 'utf8');
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const out = resolve(dirname(fileURLToPath(import.meta.url)), '../design/appearance/lottie');
  const refs = Object.fromEntries(
    (Object.keys(ANIMATED_DECOR_LOTTIES) as (keyof typeof ANIMATED_DECOR_LOTTIES)[]).map((key) => {
      const bytes = renderAnimatedDecorLottie(key);
      const verdict = validateLottie(JSON.parse(bytes.toString('utf8')) as unknown, { bytes: bytes.length });
      if (!verdict.ok) throw new Error(`${key} : couche refusée (${verdict.reason})`);
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      const src = `${sha256.slice(0, 16)}.json`;
      writeFileSync(join(out, src), bytes);
      return [key, { src, bytes: bytes.length, sha256 }];
    }),
  );
  process.stdout.write(`${JSON.stringify(refs, null, 2)}\n`);
}
