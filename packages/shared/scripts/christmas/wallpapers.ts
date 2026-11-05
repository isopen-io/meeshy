/**
 * Les FONDS de conversation de NOËL (#15553) — un pack de motifs fixes et un pack animé, chacun avec un fond par
 * thème de Noël, dans l'ordre des packs d'avatar (`packs.ts`) : enneigé, lumières, atelier du Père Noël. Avatar,
 * bannière et fond se portent ainsi du même thème.
 *
 * Un fond vit SOUS les bulles : bases proches du blanc (clair) et du noir (sombre), encre de motif entre 6 et 8 %
 * (le plancher d'Android, le plafond des fonds Meeshy), un seul rôle `ink` par tuile — l'accent du lecteur n'y entre
 * pas, la couleur du thème reste la même sur les trois clients. Un fond animé garde un DÉGRADÉ fixe : c'est l'image
 * de « réduire les animations » et des clients antérieurs ; son film n'apporte que des formes petites ou diffuses,
 * à faible opacité. Repère d'un film : 360 × 760, comme les fonds animés existants.
 */
import { FPS, LINEAR, animated, art, cycle, ellipse, fill, glow, path, sharpShape, sparkle, stack, still, stroke, type P, type Profile } from '../illustrated-rings/kit.js';
import type { Language } from '../illustrated-rings/packs.js';
import { circlePath, filmOf, n2, polygonPath, starPoints } from '../meeshy-collections/geometry.js';
import type { WallpaperDesign } from '../meeshy-collections/wallpapers.js';

const W = 360;
const H = 760;

type Palettes = WallpaperDesign['palettes'];
type Names = Readonly<Record<Language, string>>;

export type ChristmasWallpaper = {
  readonly key: string;
  /** Le slug du pack d'avatar de Noël dont il porte le thème. */
  readonly theme: string;
  readonly names: Names;
  readonly design: WallpaperDesign;
  readonly film?: () => unknown;
};

export type ChristmasWallpaperPack = {
  readonly slug: string;
  readonly animated: boolean;
  readonly names: Readonly<Record<Language, { readonly name: string; readonly description: string }>>;
  readonly items: readonly ChristmasWallpaper[];
};

const pattern = (key: string, palettes: Palettes, tile: NonNullable<WallpaperDesign['tile']>): WallpaperDesign => ({ key, style: 'pattern', palettes, tile, fit: 'fill' });
const gradient = (key: string, palettes: Palettes, value: NonNullable<WallpaperDesign['gradient']>): WallpaperDesign => ({ key, style: 'gradient', palettes, gradient: value, fit: 'fill' });
const film = (name: string, seconds: number, pieces: readonly unknown[]) => filmOf(name, seconds, W, H, pieces);

/** Les trois traits d'un flocon (six branches) et, au bout de chacune, un chevron. */
const flakeStrokes = ([x, y]: P, r: number): readonly (readonly P[])[] => {
  const point = (radius: number, degrees: number): P => [x + radius * Math.cos((degrees * Math.PI) / 180), y + radius * Math.sin((degrees * Math.PI) / 180)];
  const spokes = [90, 150, 210].map((degrees): readonly P[] => [point(r, degrees), point(r, degrees + 180)]);
  const chevrons = [30, 90, 150, 210, 270, 330].map((degrees): readonly P[] => {
    const [cx, cy] = point(r * 0.6, degrees);
    const tip = (side: number): P => [cx + r * 0.3 * Math.cos(((degrees + side * 45) * Math.PI) / 180), cy + r * 0.3 * Math.sin(((degrees + side * 45) * Math.PI) / 180)];
    return [tip(-1), [cx, cy], tip(1)];
  });
  return [...spokes, ...chevrons];
};
const flakeD = (center: P, r: number): string => flakeStrokes(center, r).map((points) => `M${points.map(([px, py]) => `${n2(px)} ${n2(py)}`).join('L')}`).join('');

// ── Les trois fixes ─────────────────────────────────────────────────────

const FLOCONS_CRISTAL = pattern(
  'flocons-cristal',
  { light: { base: '#F6F9FC', ink: '#1E3A8A', soft: '#E6EEF6' }, dark: { base: '#0A0F1A', ink: '#BFDBFE', soft: '#121A2A' } },
  {
    width: 64,
    height: 64,
    scale: 1,
    rotation: 0,
    paths: [
      { d: flakeD([18, 18], 8), role: 'ink', opacity: 0.07, width: 0.7 },
      { d: flakeD([50, 48], 5.5), role: 'ink', opacity: 0.06, width: 0.6 },
      { d: `${circlePath(0.8, [50, 14])}${circlePath(0.8, [14, 50])}`, role: 'ink', opacity: 0.08 },
    ],
  },
);

const GUIRLANDE_ETOILEE = pattern(
  'guirlande-etoilee',
  { light: { base: '#FBF8F1', ink: '#92400E', soft: '#F3ECDD' }, dark: { base: '#100D08', ink: '#FCD34D', soft: '#1B160E' } },
  {
    width: 80,
    height: 56,
    scale: 1,
    rotation: 0,
    paths: [
      { d: 'M0 8C13 20 27 20 40 8C53 20 67 20 80 8', role: 'ink', opacity: 0.07, width: 0.6 },
      { d: `${circlePath(2.6, [20, 20.5])}${circlePath(2.6, [60, 20.5])}`, role: 'ink', opacity: 0.08 },
      { d: polygonPath(starPoints([40, 38], 4.5)), role: 'ink', opacity: 0.07 },
    ],
  },
);

const SUCRE_D_ORGE_RAYE = pattern(
  'sucre-d-orge-raye',
  { light: { base: '#FCF7F7', ink: '#B91C1C', soft: '#F4E6E6' }, dark: { base: '#120A0B', ink: '#FCA5A5', soft: '#1E1213' } },
  {
    width: 32,
    height: 32,
    scale: 1,
    rotation: 0,
    paths: [
      { d: 'M-4 4L4 -4M0 32L32 0M28 36L36 28', role: 'ink', opacity: 0.06, width: 3 },
      { d: 'M0 16L16 0M16 32L32 16', role: 'ink', opacity: 0.08, width: 0.6 },
    ],
  },
);

// ── Les trois animés ────────────────────────────────────────────────────

/** Neige de Noël : douze cristaux tombent en tournant lentement sur eux-mêmes. */
const NEIGE_DE_NOEL: ChristmasWallpaper['film'] = () => {
  const seconds = 14;
  const frames = seconds * FPS;
  const flakes: readonly (readonly [number, number, number])[] = [
    [36, 0, 7], [104, 0.31, 5], [172, 0.08, 8], [236, 0.47, 5.5], [300, 0.22, 7], [348, 0.66, 5],
    [70, 0.78, 6], [140, 0.55, 7.5], [206, 0.89, 5], [270, 0.37, 6.5], [16, 0.44, 5], [322, 0.94, 6],
    [120, 0.16, 6], [254, 0.71, 7.5], [188, 0.6, 5.5], [56, 0.27, 7],
  ];
  return film(
    'neige-de-noel',
    seconds,
    flakes.map(([x, phase, size]) => {
      const fall: Profile = [[0, [x, -20]], [0.25, [x + 12, 170]], [0.5, [x - 10, 370]], [0.75, [x + 10, 570]], [1, [x, 780]]];
      return art(
        flakeStrokes([0, 0], size).map((points) => path(sharpShape(points, false))),
        [stroke('#94A3B8', size > 6.5 ? 1.3 : 1, 55)],
        { p: animated(cycle(fall, phase, frames), LINEAR), r: animated(cycle([[0, [0]], [1, [120]]], phase, frames), LINEAR) },
      );
    }),
  );
};

const BULB_COLORS = ['#EF4444', '#22C55E', '#FBBF24', '#60A5FA'] as const;

/** Ampoules de Noël : une guirlande court en haut de l'écran, ses ampoules s'allument tour à tour ; quelques reflets flottent. */
const AMPOULES_DE_NOEL: ChristmasWallpaper['film'] = () => {
  const seconds = 8;
  const frames = seconds * FPS;
  const wire = (x: number): P => [x, 46 + 22 * Math.sin((x / W) * Math.PI * 3) ** 2];
  const blink: Profile = [[0, [100]], [0.18, [35]], [0.5, [35]], [0.68, [100]], [1, [100]]];
  const bulbs = Array.from({ length: 9 }, (_, index) => {
    const [x, y] = wire(20 + index * 40);
    const hex = BULB_COLORS[index % BULB_COLORS.length]!;
    return stack([glow([0, 6], 13, hex, 0.55), art([ellipse([5, 7], [0, 6])], [fill(hex, 90)]), art([ellipse([3, 2.4], [0, 1])], [fill('#57534E', 80)])], {
      p: still([x, y]),
      o: animated(cycle(blink, index / 9, frames)),
    });
  });
  const bokeh = ([[70, 260], [290, 380], [120, 520], [250, 640]] as const).map(([x, y], index) =>
    stack([glow([0, 0], 34, BULB_COLORS[index]!, 0.16)], { p: animated(cycle([[0, [x, y]], [0.5, [x + 14, y - 18]], [1, [x, y]]], index / 4, frames)) }),
  );
  return film('ampoules-de-noel', seconds, [
    ...bokeh,
    art([path(sharpShape(Array.from({ length: 37 }, (_, index) => wire(index * 10)), false))], [stroke('#78716C', 1.2, 55)]),
    ...bulbs,
  ]);
};

/** Étincelles de l'atelier : des éclats d'or montent en scintillant, mêlés de petites perles rouges et vertes. */
const ETINCELLES_ATELIER: ChristmasWallpaper['film'] = () => {
  const seconds = 12;
  const frames = seconds * FPS;
  const twinkle: Profile = [[0, [20]], [0.15, [85]], [0.3, [25]], [0.55, [80]], [0.75, [20]], [1, [20]]];
  const rise = (x: number, drift: number): Profile => [[0, [x, 790]], [0.33, [x + drift, 530]], [0.66, [x - drift, 270]], [1, [x, -30]]];
  const sparks = ([[30, 0, 9], [92, 0.27, 6.5], [150, 0.61, 8], [214, 0.14, 6.5], [276, 0.42, 9], [334, 0.83, 7], [60, 0.71, 6.5], [184, 0.9, 7.5], [246, 0.55, 6.5], [310, 0.06, 8]] as const).map(
    ([x, phase, size]) =>
      stack([glow([0, 0], size * 2.2, '#FDE68A', 0.45), art([path(sparkle([0, 0], size))], [fill('#F59E0B', 85)])], {
        p: animated(cycle(rise(x, 10), phase, frames), LINEAR),
        o: animated(cycle(twinkle, (phase * 3) % 1, frames)),
      }),
  );
  const beads = ([[120, 0.19, '#EF4444'], [262, 0.48, '#22C55E'], [48, 0.63, '#22C55E'], [200, 0.36, '#EF4444'], [340, 0.77, '#EF4444'], [8, 0.02, '#22C55E']] as const).map(([x, phase, hex]) =>
    art([ellipse([6, 6])], [fill(hex, 50)], { p: animated(cycle(rise(x, -8), phase, frames), LINEAR) }),
  );
  return film('etincelles-atelier', seconds, [...beads, ...sparks]);
};

const still3 = { angle: 180, stops: [{ role: 'base', at: 0 }, { role: 'soft', at: 1 }] } as const;

// ── Les deux packs ──────────────────────────────────────────────────────

export const FONDS_NOEL: ChristmasWallpaperPack = {
  slug: 'fonds-noel',
  animated: false,
  names: {
    fr: { name: 'Fonds de Noël', description: 'Trois fonds de conversation assortis aux packs de Noël : flocons de cristal, guirlande étoilée et rayures de sucre d’orge, assez discrets pour laisser lire chaque bulle.' },
    en: { name: 'Christmas backgrounds', description: 'Three chat backgrounds to match the Christmas packs: crystal snowflakes, a starry garland and candy-cane stripes, subtle enough to keep every bubble readable.' },
    es: { name: 'Fondos de Navidad', description: 'Tres fondos de conversación a juego con los packs de Navidad: copos de cristal, guirnalda estrellada y rayas de bastón de caramelo, discretos para que cada burbuja se lea bien.' },
    pt: { name: 'Fundos de Natal', description: 'Três fundos de conversa a condizer com os packs de Natal: flocos de cristal, grinalda estrelada e riscas de bastão de doce, discretos para que cada balão se leia bem.' },
    de: { name: 'Weihnachtshintergründe', description: 'Drei Chat-Hintergründe passend zu den Weihnachtspaketen: Kristallflocken, Sternengirlande und Zuckerstangenstreifen, dezent genug, damit jede Blase lesbar bleibt.' },
    it: { name: 'Sfondi di Natale', description: 'Tre sfondi di conversazione abbinati ai pacchetti di Natale: fiocchi di cristallo, ghirlanda stellata e strisce di bastoncino di zucchero, discreti perché ogni fumetto resti leggibile.' },
    ar: { name: 'خلفيات الميلاد', description: 'ثلاث خلفيات للمحادثة تُناسب حزم الميلاد: ندف بلورية وإكليل النجوم وخطوط عصا الحلوى، هادئة بما يكفي لتبقى كل فقاعة مقروءة.' },
  },
  items: [
    { key: 'flocons-cristal', theme: 'noel-enneige', design: FLOCONS_CRISTAL, names: { fr: 'Flocons de cristal', en: 'Crystal snowflakes', es: 'Copos de cristal', pt: 'Flocos de cristal', de: 'Kristallflocken', it: 'Fiocchi di cristallo', ar: 'ندف بلورية' } },
    { key: 'guirlande-etoilee', theme: 'lumieres-de-noel', design: GUIRLANDE_ETOILEE, names: { fr: 'Guirlande étoilée', en: 'Starry garland', es: 'Guirnalda estrellada', pt: 'Grinalda estrelada', de: 'Sternengirlande', it: 'Ghirlanda stellata', ar: 'إكليل النجوم' } },
    { key: 'sucre-d-orge-raye', theme: 'atelier-du-pere-noel', design: SUCRE_D_ORGE_RAYE, names: { fr: 'Rayures sucre d’orge', en: 'Candy-cane stripes', es: 'Rayas de caramelo', pt: 'Riscas de bastão de doce', de: 'Zuckerstangenstreifen', it: 'Strisce di zucchero', ar: 'خطوط عصا الحلوى' } },
  ],
};

export const FONDS_NOEL_VIVANTS: ChristmasWallpaperPack = {
  slug: 'fonds-noel-vivants',
  animated: true,
  names: {
    fr: { name: 'Noël vivant', description: 'Trois fonds animés assortis aux packs de Noël : une neige de cristaux, une guirlande dont les ampoules s’allument tour à tour et les étincelles de l’atelier. Animations réduites : un dégradé fixe.' },
    en: { name: 'Living Christmas', description: 'Three animated backgrounds to match the Christmas packs: falling crystal snow, a garland whose bulbs light up in turn, and sparks from the workshop. With reduced motion: a still gradient.' },
    es: { name: 'Navidad viva', description: 'Tres fondos animados a juego con los packs de Navidad: nieve de cristales, una guirnalda cuyas bombillas se encienden por turnos y las chispas del taller. Con movimiento reducido: un degradado fijo.' },
    pt: { name: 'Natal vivo', description: 'Três fundos animados a condizer com os packs de Natal: neve de cristais, uma grinalda cujas lâmpadas se acendem à vez e as faíscas da oficina. Com movimento reduzido: um degradê fixo.' },
    de: { name: 'Lebendige Weihnacht', description: 'Drei animierte Hintergründe passend zu den Weihnachtspaketen: fallender Kristallschnee, eine Lichterkette, deren Birnen nacheinander leuchten, und Funken aus der Werkstatt. Bei reduzierter Bewegung: ein ruhiger Verlauf.' },
    it: { name: 'Natale vivo', description: 'Tre sfondi animati abbinati ai pacchetti di Natale: neve di cristalli, una ghirlanda le cui lampadine si accendono a turno e le scintille del laboratorio. Con movimento ridotto: una sfumatura fissa.' },
    ar: { name: 'ميلاد حي', description: 'ثلاث خلفيات متحركة تُناسب حزم الميلاد: ثلج من البلورات، وإكليل تضيء مصابيحه بالتناوب، وشرارات الورشة. مع تقليل الحركة: تدرّج ثابت.' },
  },
  items: [
    {
      key: 'neige-de-noel',
      theme: 'noel-enneige',
      design: gradient('neige-de-noel', { light: { base: '#F3F7FC', ink: '#D7E3F1', soft: '#E7EEF7' }, dark: { base: '#0A1020', ink: '#16223D', soft: '#0E1730' } }, { ...still3, blobs: [{ x: 0.5, y: 0, r: 0.9, role: 'ink', opacity: 0.45 }] }),
      film: NEIGE_DE_NOEL,
      names: { fr: 'Neige de Noël', en: 'Christmas snow', es: 'Nieve de Navidad', pt: 'Neve de Natal', de: 'Weihnachtsschnee', it: 'Neve di Natale', ar: 'ثلج الميلاد' },
    },
    {
      key: 'ampoules-de-noel',
      theme: 'lumieres-de-noel',
      design: gradient('ampoules-de-noel', { light: { base: '#FBF8F1', ink: '#F3E3BC', soft: '#F1EBDD' }, dark: { base: '#0F0D0A', ink: '#2A2010', soft: '#17140F' } }, { ...still3, blobs: [{ x: 0.5, y: 0.05, r: 0.8, role: 'ink', opacity: 0.4 }] }),
      film: AMPOULES_DE_NOEL,
      names: { fr: 'Ampoules de Noël', en: 'Christmas bulbs', es: 'Bombillas de Navidad', pt: 'Lâmpadas de Natal', de: 'Christbaumlichter', it: 'Lampadine di Natale', ar: 'مصابيح الميلاد' },
    },
    {
      key: 'etincelles-atelier',
      theme: 'atelier-du-pere-noel',
      design: gradient('etincelles-atelier', { light: { base: '#FCF8F6', ink: '#F6DCD5', soft: '#EFEDE4' }, dark: { base: '#110B0B', ink: '#2B1414', soft: '#121611' } }, { ...still3, blobs: [{ x: 0.5, y: 1, r: 0.85, role: 'ink', opacity: 0.4 }] }),
      film: ETINCELLES_ATELIER,
      names: { fr: 'Étincelles de l’atelier', en: 'Workshop sparks', es: 'Chispas del taller', pt: 'Faíscas da oficina', de: 'Werkstattfunken', it: 'Scintille del laboratorio', ar: 'شرارات الورشة' },
    },
  ],
};

export const CHRISTMAS_WALLPAPER_PACKS: readonly ChristmasWallpaperPack[] = [FONDS_NOEL, FONDS_NOEL_VIVANTS];
