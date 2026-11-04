/**
 * Les FONDS de conversation par Meeshy (#15158) — six fixes et quatre animés. Un fond vit SOUS les bulles :
 * bases proches du blanc (clair) et du noir (sombre), encres à 8 % au plus, aucun motif qui fasse grain sous
 * le texte. Les films n'apportent que des formes petites ou très diffuses, à faible opacité, dans des tons
 * moyens qui se voient sur les deux schémas sans jamais disputer le contraste d'une bulle.
 *
 * Repère d'un film : 360 × 760, comme les fonds animés existants.
 */
import { FPS, LINEAR, animated, art, cycle, ellipse, fill, glow, keys, stack, still, stroke, type P, type Profile } from '../illustrated-rings/kit.js';
import { circlePath, filmOf, polygonPath } from './geometry.js';

const W = 360;
const H = 760;

type Palette = { readonly base: string; readonly ink: string; readonly soft: string };
type Palettes = { readonly light: Palette; readonly dark: Palette };
type Stroke = { readonly d: string; readonly role: 'ink' | 'accent' | 'soft'; readonly opacity: number; readonly width?: number };

export type WallpaperDesign = {
  readonly key: string;
  readonly style: 'pattern' | 'gradient';
  readonly palettes: Palettes;
  readonly tile?: { readonly width: number; readonly height: number; readonly scale: number; readonly rotation: number; readonly paths: readonly Stroke[] };
  readonly gradient?: {
    readonly angle: number;
    readonly stops: readonly { readonly role: 'base' | 'soft' | 'ink'; readonly at: number }[];
    readonly blobs: readonly { readonly x: number; readonly y: number; readonly r: number; readonly role: 'ink' | 'soft' | 'accent'; readonly opacity: number }[];
  };
  readonly fit: 'fill';
};

export type AnimatedWallpaper = WallpaperDesign & { readonly film: () => unknown };

const pattern = (key: string, palettes: Palettes, tile: NonNullable<WallpaperDesign['tile']>): WallpaperDesign => ({ key, style: 'pattern', palettes, tile, fit: 'fill' });
const gradient = (key: string, palettes: Palettes, value: NonNullable<WallpaperDesign['gradient']>): WallpaperDesign => ({ key, style: 'gradient', palettes, gradient: value, fit: 'fill' });

// ── Les six fixes ───────────────────────────────────────────────────────

const SOIE = gradient(
  'soie',
  { light: { base: '#FAF7F2', ink: '#E8D9C2', soft: '#F2EBE0' }, dark: { base: '#121014', ink: '#2B2330', soft: '#1A171D' } },
  { angle: 165, stops: [{ role: 'base', at: 0 }, { role: 'soft', at: 1 }], blobs: [{ x: 0.15, y: 0.08, r: 0.85, role: 'ink', opacity: 0.45 }, { x: 0.92, y: 0.95, r: 0.7, role: 'accent', opacity: 0.06 }] },
);

const POINTILLE = pattern(
  'pointille',
  { light: { base: '#F7F8FA', ink: '#334155', soft: '#E9ECF1' }, dark: { base: '#0E1116', ink: '#CBD5E1', soft: '#171B22' } },
  { width: 22, height: 22, scale: 1, rotation: 0, paths: [{ d: `${circlePath(0.9, [5.5, 5.5])}${circlePath(0.9, [16.5, 16.5])}`, role: 'ink', opacity: 0.08 }] },
);

const VAGUES_FINES = pattern(
  'vagues-fines',
  { light: { base: '#F4F8FA', ink: '#155E75', soft: '#E3EEF2' }, dark: { base: '#0B1418', ink: '#A5F3FC', soft: '#12202A' } },
  { width: 60, height: 22, scale: 1, rotation: 0, paths: [{ d: 'M0 11C10 5 20 5 30 11S50 17 60 11', role: 'ink', opacity: 0.07, width: 0.8 }] },
);

const CANNAGE = pattern(
  'cannage',
  { light: { base: '#FAF7F1', ink: '#6B4E2E', soft: '#EFE6D6' }, dark: { base: '#14110D', ink: '#D8C3A0', soft: '#1F1A14' } },
  {
    width: 36,
    height: 36,
    scale: 1,
    rotation: 0,
    paths: [
      { d: 'M0 0L36 36M36 0L0 36M18 0V36M0 18H36', role: 'ink', opacity: 0.06, width: 0.55 },
      { d: circlePath(6.5, [18, 18]), role: 'ink', opacity: 0.06, width: 0.55 },
    ],
  },
);

const CHIPS: readonly (readonly [readonly P[], 'ink' | 'accent' | 'soft', number])[] = [
  [[[8, 10], [15, 7], [17, 13], [10, 15]], 'ink', 0.06],
  [[[46, 6], [52, 9], [49, 14], [43, 12]], 'accent', 0.08],
  [[[78, 18], [86, 16], [88, 22], [80, 25]], 'ink', 0.06],
  [[[22, 40], [30, 37], [33, 44], [26, 47], [21, 45]], 'accent', 0.07],
  [[[60, 44], [66, 40], [70, 47], [64, 50]], 'ink', 0.06],
  [[[86, 58], [92, 60], [89, 66]], 'accent', 0.08],
  [[[10, 72], [17, 70], [19, 77], [12, 80]], 'ink', 0.06],
  [[[44, 76], [52, 72], [56, 80], [48, 84]], 'ink', 0.06],
  [[[74, 84], [80, 82], [82, 88], [76, 90]], 'accent', 0.07],
];
const TERRAZZO = pattern(
  'terrazzo',
  { light: { base: '#F8F6F3', ink: '#57534E', soft: '#ECE8E2' }, dark: { base: '#111010', ink: '#D6D3D1', soft: '#1C1A19' } },
  { width: 96, height: 96, scale: 1, rotation: 0, paths: CHIPS.map(([points, role, opacity]) => ({ d: polygonPath(points), role, opacity })) },
);

const CREPUSCULE = gradient(
  'crepuscule',
  { light: { base: '#FBF7F4', ink: '#F3D3C8', soft: '#ECE4F4' }, dark: { base: '#120E18', ink: '#3A1F36', soft: '#1E1A33' } },
  { angle: 200, stops: [{ role: 'base', at: 0 }, { role: 'soft', at: 1 }], blobs: [{ x: 0.85, y: 0.05, r: 0.8, role: 'ink', opacity: 0.5 }, { x: 0.1, y: 0.9, r: 0.7, role: 'soft', opacity: 0.6 }] },
);

export const SIGNATURE_WALLPAPERS: readonly WallpaperDesign[] = [SOIE, POINTILLE, VAGUES_FINES, CANNAGE, TERRAZZO, CREPUSCULE];

// ── Les quatre animés ───────────────────────────────────────────────────

const film = (name: string, seconds: number, pieces: readonly unknown[]) => filmOf(name, seconds, W, H, pieces);

/** Lucioles : quatorze points ambrés dérivent en boucles lentes et s'allument tour à tour. */
const LUCIOLES: AnimatedWallpaper = {
  ...gradient(
    'lucioles',
    { light: { base: '#F8F6EF', ink: '#F1DDB0', soft: '#EFE8D8' }, dark: { base: '#0D0F14', ink: '#2E2614', soft: '#151922' } },
    { angle: 180, stops: [{ role: 'base', at: 0 }, { role: 'soft', at: 1 }], blobs: [{ x: 0.2, y: 0.85, r: 0.7, role: 'ink', opacity: 0.4 }] },
  ),
  film: () => {
    const seconds = 12;
    const frames = seconds * FPS;
    const flies: readonly (readonly [number, number, number, number])[] = [
      [40, 120, 0, 5], [300, 80, 0.21, 4], [180, 220, 0.47, 5.6], [90, 330, 0.68, 4.4], [270, 300, 0.12, 5], [150, 420, 0.83, 4], [320, 470, 0.36, 5.2],
      [60, 540, 0.58, 4.6], [220, 600, 0.04, 4], [130, 690, 0.29, 5], [300, 680, 0.75, 4.4], [20, 260, 0.91, 4], [250, 160, 0.52, 4.6], [110, 40, 0.16, 4.4],
    ];
    const light: Profile = [[0, [0]], [0.18, [60]], [0.4, [15]], [0.62, [55]], [0.85, [0]], [1, [0]]];
    return film(
      'lucioles',
      seconds,
      flies.map(([x, y, phase, r]) => {
        const loop: Profile = [[0, [x, y]], [0.25, [x + 16, y - 12]], [0.5, [x + 6, y - 26]], [0.75, [x - 12, y - 12]], [1, [x, y]]];
        return stack([glow([0, 0], r * 3.2, '#F5B942', 0.55), art([ellipse([r, r])], [fill('#FCD34D', 90)])], {
          p: animated(cycle(loop, phase, frames)),
          o: animated(cycle(light, phase, frames)),
        });
      }),
    );
  },
};

/** Voile d'aurore : trois lueurs immenses, sarcelle, violette et rose, glissent lentement l'une sur l'autre. */
const VOILE_AURORE: AnimatedWallpaper = {
  ...gradient(
    'voile-aurore',
    { light: { base: '#F3F7F8', ink: '#BDF3E9', soft: '#E4DEFB' }, dark: { base: '#071318', ink: '#0F3B3A', soft: '#221047' } },
    { angle: 180, stops: [{ role: 'base', at: 0 }, { role: 'soft', at: 1 }], blobs: [{ x: 0.3, y: 0.2, r: 0.7, role: 'ink', opacity: 0.35 }] },
  ),
  film: () => {
    const seconds = 16;
    const drift = (from: P, to: P, via: P) => animated(keys([[0, from], [seconds / 3, via], [(2 * seconds) / 3, to], [seconds, from]]));
    const veil = (hex: string, motion: ReturnType<typeof animated>) => stack([glow([0, 0], 230, hex, 0.2)], { p: motion });
    return film('voile-aurore', seconds, [
      veil('#2DD4BF', drift([60, 160], [140, 260], [20, 300])),
      veil('#8B5CF6', drift([300, 420], [220, 340], [330, 560])),
      veil('#F472B6', drift([120, 660], [260, 600], [60, 520])),
    ]);
  },
};

/** Neige douce : seize flocons gris-bleu tombent sans hâte en se balançant. */
const NEIGE_DOUCE: AnimatedWallpaper = {
  ...gradient(
    'neige-douce',
    { light: { base: '#F4F7FB', ink: '#DCE3EC', soft: '#E9EEF4' }, dark: { base: '#0B1220', ink: '#18233A', soft: '#0F172A' } },
    { angle: 180, stops: [{ role: 'base', at: 0 }, { role: 'soft', at: 1 }], blobs: [{ x: 0.5, y: 0, r: 0.9, role: 'ink', opacity: 0.4 }] },
  ),
  film: () => {
    const seconds = 15;
    const frames = seconds * FPS;
    const flakes: readonly (readonly [number, number, number])[] = [
      [30, 0, 7], [95, 0.27, 5], [160, 0.06, 8], [220, 0.44, 5.6], [290, 0.19, 7.2], [340, 0.61, 5], [60, 0.73, 6], [130, 0.52, 8],
      [200, 0.86, 5], [260, 0.34, 6.6], [320, 0.93, 6], [10, 0.4, 5], [180, 0.67, 5.6], [110, 0.12, 5], [245, 0.79, 7], [305, 0.55, 5.4],
    ];
    return film(
      'neige-douce',
      seconds,
      flakes.map(([x, phase, size]) => {
        const fall: Profile = [[0, [x, -20]], [0.25, [x + 14, 170]], [0.5, [x - 8, 370]], [0.75, [x + 12, 570]], [1, [x, 780]]];
        return art([ellipse([size, size])], [fill('#94A3B8', 38)], { p: animated(cycle(fall, phase, frames), LINEAR) });
      }),
    );
  },
};

/** Ondes : des cercles indigo naissent de deux points et s'élargissent jusqu'à s'effacer. */
const ONDES: AnimatedWallpaper = {
  ...gradient(
    'ondes',
    { light: { base: '#F5F6FF', ink: '#DDE3FD', soft: '#EBEEFF' }, dark: { base: '#0B0D1F', ink: '#1C1B4A', soft: '#15133A' } },
    { angle: 180, stops: [{ role: 'base', at: 0 }, { role: 'soft', at: 1 }], blobs: [{ x: 0.2, y: 0.25, r: 0.6, role: 'ink', opacity: 0.4 }, { x: 0.85, y: 0.75, r: 0.6, role: 'ink', opacity: 0.35 }] },
  ),
  film: () => {
    const seconds = 10;
    const frames = seconds * FPS;
    const grow: Profile = [[0, [0, 0]], [1, [560, 560]]];
    const fade: Profile = [[0, [0]], [0.1, [30]], [1, [0]]];
    const ring = (center: P, phase: number) => ({
      ty: 'gr',
      it: [
        { ty: 'el', p: still(center), s: animated(cycle(grow, phase, frames), LINEAR), d: 1 },
        stroke('#818CF8', 1.4, animated(cycle(fade, phase, frames))),
        { ty: 'tr', p: still([0, 0]), a: still([0, 0]), s: still([100, 100]), r: still(0), o: still(100), sk: still(0), sa: still(0) },
      ],
    });
    return film('ondes', seconds, [...[0, 1 / 3, 2 / 3].map((phase) => ring([80, 210], phase)), ...[1 / 6, 1 / 2, 5 / 6].map((phase) => ring([280, 560], phase))]);
  },
};

export const VIVANT_WALLPAPERS: readonly AnimatedWallpaper[] = [LUCIOLES, VOILE_AURORE, NEIGE_DOUCE, ONDES];
