/**
 * Les FONDS de conversation et les IMAGES DE BANNIÈRE des offres saisonnières (#16270, #16271).
 *
 * Un fond vit SOUS les bulles (bases proches du blanc et du noir, encre de motif entre 6 et 8 %, le plancher
 * d'Android et le plafond des fonds Meeshy, un seul rôle `ink`) ; un fond animé garde un DÉGRADÉ fixe, l'image de
 * « réduire les animations », et son film n'apporte que des formes petites ou diffuses. Une image de bannière se
 * VOIT : son encre de motif passe les 12 % d'un fond sans dépasser les 32 % d'une bannière, et son film peut être
 * franc. Repères : 360 × 760 pour un fond, 600 × 200 pour une bannière, comme les films existants.
 */
import { LINEAR, type P, animated, art, ellipse, fill, keys, path, sharpShape, stack, still, stroke } from '../illustrated-rings/kit.js';
import type { WallpaperDesign } from '../meeshy-collections/wallpapers.js';
import { FPS, bubblePiece, bubblesD, burstD, burstPiece, circlePath, clockD, confettiD, confettiPiece, coupeD, film, flakeD, flakePiece, polygonPath, sparklePiece, starPoints } from './draw.js';

type Palettes = WallpaperDesign['palettes'];
type Tile = NonNullable<WallpaperDesign['tile']>;
type Gradient = NonNullable<WallpaperDesign['gradient']>;

export type SeasonalDesign = { readonly design: WallpaperDesign; readonly film?: () => unknown };

const pattern = (key: string, palettes: Palettes, tile: Tile): SeasonalDesign => ({ design: { key, style: 'pattern', palettes, tile, fit: 'fill' } });
const gradient = (key: string, palettes: Palettes, value: Gradient, build: () => unknown): SeasonalDesign => ({ design: { key, style: 'gradient', palettes, gradient: value, fit: 'fill' }, film: build });
const tile = (width: number, height: number, paths: Tile['paths'], rotation = 0): Tile => ({ width, height, scale: 1, rotation, paths });

const WALL = [360, 760] as const;
const BANNER = [600, 200] as const;
const wallFilm = (name: string, seconds: number, pieces: (frames: number) => readonly unknown[]) => () => film(name, seconds, WALL[0], WALL[1], pieces(seconds * FPS));
const bannerFilm = (name: string, seconds: number, pieces: (frames: number) => readonly unknown[]) => () => film(name, seconds, BANNER[0], BANNER[1], pieces(seconds * FPS));

const FIREWORK = ['#F472B6', '#FBBF24', '#22D3EE', '#A78BFA', '#34D399'] as const;
const CONFETTI = ['#F472B6', '#FACC15', '#2DD4BF', '#A78BFA', '#FB7185', '#60A5FA'] as const;
const pick = <T>(list: readonly T[], index: number): T => list[index % list.length]!;

// ── Fonds du Nouvel An : quatre motifs ──────────────────────────────────

export const FOND_ARTIFICE = pattern(
  'fond-artifice',
  { light: { base: '#F7F7FB', ink: '#4338CA', soft: '#ECECF6' }, dark: { base: '#08091A', ink: '#FDE68A', soft: '#12142B' } },
  tile(76, 76, [
    { d: burstD([20, 20], 3, 9), role: 'ink', opacity: 0.07, width: 0.7 },
    { d: burstD([56, 54], 2, 5.5, 8, 22), role: 'ink', opacity: 0.06, width: 0.6 },
    { d: `${circlePath(1, [20, 20])}${circlePath(0.8, [56, 54])}${circlePath(0.7, [58, 14])}${circlePath(0.7, [12, 62])}`, role: 'ink', opacity: 0.08 },
  ]),
);

export const FOND_CONFETTIS = pattern(
  'fond-confettis',
  { light: { base: '#FDF9FB', ink: '#BE185D', soft: '#F6EAF0' }, dark: { base: '#120A10', ink: '#F9A8D4', soft: '#1E121B' } },
  tile(64, 64, [
    { d: `${confettiD([12, 14], 6, 2.6, 25)}${confettiD([44, 10], 5, 2.2, -40)}${confettiD([30, 40], 6, 2.6, 70)}${confettiD([54, 52], 5, 2.2, 10)}`, role: 'ink', opacity: 0.07 },
    { d: `${circlePath(1.4, [24, 24])}${circlePath(1.2, [52, 30])}${circlePath(1.4, [10, 50])}`, role: 'ink', opacity: 0.08 },
    { d: 'M34 58C37 54 40 62 43 58C46 54 49 62 52 58', role: 'ink', opacity: 0.06, width: 0.7 },
  ]),
);

const midnightClock = clockD([24, 26], 10);
export const FOND_MINUIT = pattern(
  'fond-minuit',
  { light: { base: '#F5F7FC', ink: '#1E3A8A', soft: '#E7ECF7' }, dark: { base: '#070A16', ink: '#C7D2FE', soft: '#10152A' } },
  tile(84, 84, [
    { d: midnightClock.face, role: 'ink', opacity: 0.06, width: 0.7 },
    { d: `${midnightClock.ticks}${midnightClock.hands}`, role: 'ink', opacity: 0.07, width: 0.7 },
    { d: `${polygonPath(starPoints([62, 62], 4.5))}${polygonPath(starPoints([66, 18], 2.5))}${polygonPath(starPoints([16, 66], 2.5))}`, role: 'ink', opacity: 0.08 },
  ]),
);

export const FOND_CHAMPAGNE = pattern(
  'fond-champagne',
  { light: { base: '#FCFAF4', ink: '#92650A', soft: '#F4EEDD' }, dark: { base: '#0F0C06', ink: '#FDE68A', soft: '#1A160C' } },
  tile(60, 76, [
    { d: coupeD([18, 22], 16), role: 'ink', opacity: 0.07, width: 0.7 },
    { d: bubblesD([[44, 16, 2.4], [50, 30, 1.6], [42, 42, 3], [52, 58, 1.8], [20, 56, 2.2], [12, 68, 1.4]]), role: 'ink', opacity: 0.06, width: 0.6 },
    { d: `${circlePath(0.8, [30, 6])}${circlePath(0.8, [6, 40])}${circlePath(0.8, [34, 66])}`, role: 'ink', opacity: 0.08 },
  ]),
);

// ── Fonds du Nouvel An : quatre animés ──────────────────────────────────

const still3 = (y: number): Gradient => ({ angle: 180, stops: [{ role: 'base', at: 0 }, { role: 'soft', at: 1 }], blobs: [{ x: 0.5, y, r: 0.85, role: 'ink', opacity: 0.4 }] });

export const FOND_ARTIFICE_VIF = gradient(
  'fond-artifice-vif',
  { light: { base: '#F6F6FB', ink: '#E4E1F6', soft: '#ECEAF5' }, dark: { base: '#07081A', ink: '#1A1840', soft: '#0D0E24' } },
  still3(0.1),
  wallFilm('fond-artifice-vif', 10, (frames) =>
    ([[80, 150, 46], [270, 230, 38], [150, 380, 30], [300, 520, 42], [60, 610, 34], [200, 120, 26]] as const).map(([x, y, size], index) =>
      burstPiece({ at: [x, y], size, hex: pick(FIREWORK, index), core: '#FFF7D6', phase: index / 6, frames, peak: 45, width: 1.4 }),
    ),
  ),
);

export const FOND_CONFETTIS_VIF = gradient(
  'fond-confettis-vif',
  { light: { base: '#FDF8FA', ink: '#F8E1EC', soft: '#F5EEF3' }, dark: { base: '#110910', ink: '#2A1424', soft: '#170E15' } },
  still3(0),
  wallFilm('fond-confettis-vif', 12, (frames) =>
    Array.from({ length: 18 }, (_, index) =>
      confettiPiece({ x: 12 + ((index * 67) % 340), height: WALL[1], hex: pick(CONFETTI, index), size: 4 + (index % 3), phase: ((index * 7) % 18) / 18, frames, opacity: 45, turns: 1 + (index % 2) }),
    ),
  ),
);

export const FOND_MINUIT_VIF = gradient(
  'fond-minuit-vif',
  { light: { base: '#F4F6FC', ink: '#DCE3F5', soft: '#E9EDF8' }, dark: { base: '#060915', ink: '#151C3A', soft: '#0B1022' } },
  still3(0.05),
  wallFilm('fond-minuit-vif', 12, (frames) =>
    ([[40, 90, 5], [120, 50, 3.5], [210, 130, 6], [310, 70, 4], [70, 260, 3.5], [280, 300, 5], [170, 420, 4], [40, 520, 5.5], [320, 600, 3.5], [140, 680, 4.5], [230, 560, 3], [100, 360, 3]] as const).map(([x, y, size], index) =>
      sparklePiece({ at: [x, y], size, hex: index % 3 === 0 ? '#FDE68A' : '#A5B4FC', phase: ((index * 5) % 12) / 12, frames, low: 8, high: 55 }),
    ),
  ),
);

export const FOND_CHAMPAGNE_VIF = gradient(
  'fond-champagne-vif',
  { light: { base: '#FCFAF3', ink: '#F4E8C8', soft: '#F3EEDF' }, dark: { base: '#0E0B05', ink: '#2A210C', soft: '#15120A' } },
  still3(1),
  wallFilm('fond-champagne-vif', 10, (frames) =>
    Array.from({ length: 16 }, (_, index) =>
      bubblePiece({ from: [16 + ((index * 53) % 330), 790], rise: 820, r: 3 + (index % 4) * 1.6, hex: '#D4A017', phase: ((index * 5) % 16) / 16, frames, opacity: 45, width: 1 }),
    ),
  ),
);

// ── Images de bannière du Nouvel An : quatre motifs ─────────────────────

export const BANNIERE_ARTIFICE = pattern(
  'banniere-artifice',
  { light: { base: '#1E1B4B', ink: '#FBBF24', soft: '#312E81' }, dark: { base: '#0B1026', ink: '#FDE68A', soft: '#1E1B4B' } },
  tile(90, 60, [
    { d: burstD([22, 22], 4, 13, 14), role: 'ink', opacity: 0.3, width: 1 },
    { d: burstD([66, 40], 3, 8, 10, 18), role: 'ink', opacity: 0.22, width: 0.8 },
    { d: `${circlePath(1.6, [22, 22])}${circlePath(1.2, [66, 40])}${circlePath(0.9, [80, 8])}${circlePath(0.9, [6, 52])}${circlePath(0.7, [48, 10])}`, role: 'ink', opacity: 0.32 },
  ]),
);

export const BANNIERE_CONFETTIS = pattern(
  'banniere-confettis',
  { light: { base: '#FFF1F7', ink: '#DB2777', soft: '#FCE7F3' }, dark: { base: '#2A0B1E', ink: '#F9A8D4', soft: '#3B1230' } },
  tile(70, 50, [
    { d: `${confettiD([10, 10], 7, 3, 25)}${confettiD([40, 8], 6, 2.6, -40)}${confettiD([28, 32], 7, 3, 70)}${confettiD([58, 38], 6, 2.6, 15)}`, role: 'ink', opacity: 0.3 },
    { d: `${circlePath(1.8, [22, 20])}${circlePath(1.5, [56, 18])}${circlePath(1.8, [8, 42])}${circlePath(1.2, [44, 46])}`, role: 'ink', opacity: 0.26 },
    { d: 'M2 26C6 21 10 31 14 26C18 21 22 31 26 26M46 28C49 24 52 32 55 28C58 24 61 32 64 28', role: 'ink', opacity: 0.2, width: 0.9 },
  ]),
);

const bannerClock = clockD([26, 28], 15);
export const BANNIERE_MINUIT = pattern(
  'banniere-minuit',
  { light: { base: '#1E1B4B', ink: '#E2E8F0', soft: '#312E81' }, dark: { base: '#0F172A', ink: '#E2E8F0', soft: '#1E1B4B' } },
  tile(100, 60, [
    { d: bannerClock.face, role: 'ink', opacity: 0.28, width: 1 },
    { d: `${bannerClock.ticks}${bannerClock.hands}`, role: 'ink', opacity: 0.32, width: 1 },
    { d: `${polygonPath(starPoints([70, 18], 4))}${polygonPath(starPoints([86, 44], 2.8))}${polygonPath(starPoints([58, 48], 2))}${polygonPath(starPoints([92, 8], 1.6))}`, role: 'ink', opacity: 0.3 },
  ]),
);

export const BANNIERE_CHAMPAGNE = pattern(
  'banniere-champagne',
  { light: { base: '#F7E7CE', ink: '#8A5A00', soft: '#EFD9B0' }, dark: { base: '#2B1F07', ink: '#FDE68A', soft: '#3D2C0B' } },
  tile(80, 56, [
    { d: `${coupeD([20, 12], 22)}${coupeD([34, 14], 20)}`, role: 'ink', opacity: 0.28, width: 0.9 },
    { d: bubblesD([[56, 12, 2.6], [64, 26, 1.8], [54, 36, 3.2], [70, 46, 2], [44, 48, 1.4]]), role: 'ink', opacity: 0.24, width: 0.8 },
    { d: `${polygonPath(starPoints([27, 6], 2.6))}${polygonPath(starPoints([74, 6], 1.8))}${polygonPath(starPoints([6, 46], 1.8))}`, role: 'ink', opacity: 0.32 },
  ]),
);

// ── Images de bannière du Nouvel An : quatre animées ────────────────────

const bannerGradient = (angle: number, blobs: Gradient['blobs']): Gradient => ({ angle, stops: [{ role: 'base', at: 0 }, { role: 'soft', at: 1 }], blobs });

export const BANNIERE_ARTIFICE_VIVE = gradient(
  'banniere-artifice-vive',
  { light: { base: '#0B1026', ink: '#7C3AED', soft: '#312E81' }, dark: { base: '#05071A', ink: '#6D28D9', soft: '#1E1B4B' } },
  bannerGradient(180, [{ x: 0.2, y: 0.2, r: 0.5, role: 'ink', opacity: 0.35 }, { x: 0.8, y: 0.3, r: 0.45, role: 'ink', opacity: 0.25 }]),
  bannerFilm('banniere-artifice-vive', 8, (frames) =>
    ([[90, 70, 52], [250, 50, 40], [400, 90, 58], [530, 60, 44], [170, 140, 34], [470, 150, 30]] as const).map(([x, y, size], index) =>
      burstPiece({ at: [x, y], size, hex: pick(FIREWORK, index), core: '#FFF7D6', phase: ((index * 5) % 6) / 6, frames, width: 2.2 }),
    ),
  ),
);

export const BANNIERE_CONFETTIS_VIVE = gradient(
  'banniere-confettis-vive',
  { light: { base: '#FDF2F8', ink: '#FBCFE8', soft: '#EDE9FE' }, dark: { base: '#1F0B1A', ink: '#4C1D95', soft: '#2E1065' } },
  bannerGradient(120, [{ x: 0.1, y: 0.9, r: 0.5, role: 'ink', opacity: 0.5 }, { x: 0.9, y: 0.1, r: 0.5, role: 'soft', opacity: 0.5 }]),
  bannerFilm('banniere-confettis-vive', 8, (frames) =>
    Array.from({ length: 24 }, (_, index) =>
      confettiPiece({ x: 12 + ((index * 97) % 580), height: BANNER[1], hex: pick(CONFETTI, index), size: 5 + (index % 3), phase: ((index * 7) % 24) / 24, frames, drift: 18, turns: 1 + (index % 3) }),
    ),
  ),
);

export const BANNIERE_MINUIT_VIVE = gradient(
  'banniere-minuit-vive',
  { light: { base: '#0F172A', ink: '#4338CA', soft: '#1E1B4B' }, dark: { base: '#020617', ink: '#3730A3', soft: '#172554' } },
  bannerGradient(160, [{ x: 0.82, y: 0.5, r: 0.45, role: 'ink', opacity: 0.4 }]),
  bannerFilm('banniere-minuit-vive', 12, (frames) => [
      ...([[60, 40, 6], [130, 120, 4], [200, 60, 7], [270, 150, 4.5], [330, 40, 5], [380, 130, 3.5], [580, 30, 4], [560, 170, 5], [30, 160, 4], [240, 100, 3]] as const).map(([x, y, size], index) =>
        sparklePiece({ at: [x, y], size, hex: index % 3 === 0 ? '#FDE68A' : '#E0E7FF', phase: ((index * 3) % 10) / 10, frames }),
      ),
      clockPiece([490, 100], 62, frames),
  ]),
);

export const BANNIERE_CHAMPAGNE_VIVE = gradient(
  'banniere-champagne-vive',
  { light: { base: '#3B2A05', ink: '#CA8A04', soft: '#A16207' }, dark: { base: '#1C1403', ink: '#A16207', soft: '#713F12' } },
  bannerGradient(200, [{ x: 0.5, y: 1, r: 0.7, role: 'ink', opacity: 0.45 }, { x: 0.15, y: 0.2, r: 0.4, role: 'soft', opacity: 0.35 }]),
  bannerFilm('banniere-champagne-vive', 8, (frames) => [
    ...Array.from({ length: 22 }, (_, index) =>
      bubblePiece({ from: [14 + ((index * 83) % 575), 215], rise: 235, r: 2.5 + (index % 4) * 1.5, hex: '#FDE68A', phase: ((index * 5) % 22) / 22, frames, width: 1.2 }),
    ),
    ...([[120, 50, 5], [300, 30, 6], [470, 60, 5], [560, 140, 4]] as const).map(([x, y, size], index) => sparklePiece({ at: [x, y], size, hex: '#FFF7D6', phase: index / 4, frames })),
  ]),
);

// ── Images de bannière de Noël ──────────────────────────────────────────

export const BANNIERE_NOEL_GIVRE = pattern(
  'banniere-noel-givre',
  { light: { base: '#E6EFFA', ink: '#1E3A8A', soft: '#D4E2F4' }, dark: { base: '#0B1730', ink: '#BFDBFE', soft: '#13254A' } },
  tile(80, 60, [
    { d: flakeD([20, 20], 11), role: 'ink', opacity: 0.28, width: 0.9 },
    { d: flakeD([60, 42], 7), role: 'ink', opacity: 0.22, width: 0.7 },
    { d: `${circlePath(1.2, [60, 12])}${circlePath(1, [12, 48])}${circlePath(0.9, [40, 30])}${circlePath(0.8, [74, 56])}`, role: 'ink', opacity: 0.3 },
  ]),
);

export const BANNIERE_NOEL_GUIRLANDE = pattern(
  'banniere-noel-guirlande',
  { light: { base: '#14532D', ink: '#FDE68A', soft: '#166534' }, dark: { base: '#052E16', ink: '#FDE68A', soft: '#14532D' } },
  tile(96, 48, [
    { d: 'M0 10C16 26 32 26 48 10C64 26 80 26 96 10', role: 'ink', opacity: 0.24, width: 0.9 },
    { d: `${circlePath(3.2, [24, 25])}${circlePath(3.2, [72, 25])}${circlePath(2.6, [8, 18])}${circlePath(2.6, [40, 18])}${circlePath(2.6, [56, 18])}${circlePath(2.6, [88, 18])}`, role: 'ink', opacity: 0.32 },
    { d: `${polygonPath(starPoints([48, 38], 4))}${polygonPath(starPoints([0, 38], 2.4))}${polygonPath(starPoints([96, 38], 2.4))}`, role: 'ink', opacity: 0.26 },
  ]),
);

export const BANNIERE_NOEL_CADEAU = pattern(
  'banniere-noel-cadeau',
  { light: { base: '#991B1B', ink: '#FDE68A', soft: '#B91C1C' }, dark: { base: '#450A0A', ink: '#FCD34D', soft: '#7F1D1D' } },
  tile(60, 60, [
    { d: 'M30 0V60M0 30H60', role: 'ink', opacity: 0.22, width: 3 },
    { d: 'M30 30C22 20 14 22 18 28C20 32 26 31 30 30C38 20 46 22 42 28C40 32 34 31 30 30Z', role: 'ink', opacity: 0.3, width: 1 },
    { d: `${polygonPath(starPoints([12, 12], 2.6))}${polygonPath(starPoints([48, 48], 2.6))}${circlePath(1, [48, 12])}${circlePath(1, [12, 48])}`, role: 'ink', opacity: 0.32 },
  ]),
);

export const BANNIERE_NOEL_NEIGE = gradient(
  'banniere-noel-neige',
  { light: { base: '#1E3A8A', ink: '#60A5FA', soft: '#0F2747' }, dark: { base: '#0B1730', ink: '#1D4ED8', soft: '#020617' } },
  bannerGradient(180, [{ x: 0.5, y: 0, r: 0.8, role: 'ink', opacity: 0.35 }]),
  bannerFilm('banniere-noel-neige', 10, (frames) =>
    Array.from({ length: 22 }, (_, index) =>
      flakePiece({ x: 10 + ((index * 89) % 585), height: BANNER[1], size: 3.5 + (index % 3) * 1.6, hex: '#F8FAFC', phase: ((index * 7) % 22) / 22, frames }),
    ),
  ),
);

const BULBS = ['#EF4444', '#FBBF24', '#22C55E', '#60A5FA'] as const;
export const BANNIERE_NOEL_LUMIERES = gradient(
  'banniere-noel-lumieres',
  { light: { base: '#14532D', ink: '#FDE68A', soft: '#052E16' }, dark: { base: '#052E16', ink: '#CA8A04', soft: '#022C22' } },
  bannerGradient(180, [{ x: 0.5, y: 0.2, r: 0.7, role: 'ink', opacity: 0.18 }]),
  bannerFilm('banniere-noel-lumieres', 4, (frames) => {
    const wire = (x: number, top: boolean): P => [x, top ? 18 + 14 * Math.sin((x / 600) * Math.PI * 4) ** 2 : 182 - 14 * Math.sin((x / 600) * Math.PI * 4) ** 2];
    return [true, false].flatMap((top) =>
      Array.from({ length: 14 }, (_, index) => {
        const at = wire(22 + index * 43, top);
        return sparklePiece({ at, size: 7, hex: pick(BULBS, index + (top ? 0 : 2)), phase: ((index % 4) / 4 + (top ? 0 : 0.5)) % 1, frames, low: 35 });
      }),
    );
  }),
);

export const BANNIERE_NOEL_ETINCELLES = gradient(
  'banniere-noel-etincelles',
  { light: { base: '#7F1D1D', ink: '#F59E0B', soft: '#450A0A' }, dark: { base: '#450A0A', ink: '#B45309', soft: '#1C0606' } },
  bannerGradient(180, [{ x: 0.5, y: 1, r: 0.8, role: 'ink', opacity: 0.35 }]),
  bannerFilm('banniere-noel-etincelles', 8, (frames) => [
    ...Array.from({ length: 12 }, (_, index) =>
      bubblePiece({ from: [20 + ((index * 101) % 570), 215], rise: 235, r: 2.2 + (index % 3), hex: index % 2 === 0 ? '#22C55E' : '#FCA5A5', phase: ((index * 5) % 12) / 12, frames, width: 1.4 }),
    ),
    ...([[70, 60], [160, 140], [250, 40], [340, 120], [430, 70], [520, 150], [580, 40], [30, 130]] as const).map(([x, y], index) =>
      sparklePiece({ at: [x, y], size: 6 + (index % 3), hex: '#FDE68A', phase: ((index * 3) % 8) / 8, frames }),
    ),
  ]),
);

// ── Le cadran animé de la bannière de minuit ────────────────────────────

/** Un cadran dont l'aiguille des minutes fait le tour en un cycle, l'aiguille des heures marquant minuit. */
function clockPiece(center: P, r: number, frames: number) {
  const seconds = frames / FPS;
  const ticks = Array.from({ length: 12 }, (_, index) => index * 30).map((degrees, index) => {
    const radians = (degrees * Math.PI) / 180;
    const inner = index % 3 === 0 ? 0.72 : 0.8;
    return path(sharpShape([[r * inner * Math.cos(radians), r * inner * Math.sin(radians)], [r * 0.9 * Math.cos(radians), r * 0.9 * Math.sin(radians)]], false));
  });
  return stack(
    [
      art([ellipse([r * 2, r * 2])], [fill('#0B1026', 70), stroke('#D4AF37', 2.4)]),
      art(ticks, [stroke('#E2E8F0', 2)]),
      art([path(sharpShape([[0, 4], [0, -r * 0.5]], false))], [stroke('#D4AF37', 4)]),
      art([path(sharpShape([[0, 6], [0, -r * 0.74]], false))], [stroke('#F8FAFC', 2.4)], { r: animated(keys([[0, 0], [seconds, 360]]), LINEAR) }),
      art([ellipse([7, 7])], [fill('#D4AF37')]),
    ],
    { p: still(center) },
  );
}
