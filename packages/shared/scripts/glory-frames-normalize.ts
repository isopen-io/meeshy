/**
 * LE NORMALISEUR des cadres de gloire (#10154, L3, § 5.3) — l'export brut du
 * générateur (`docs/product/cadres-de-gloire/generateur/export/<collection>/export.json`,
 * produit par `lib/export.mjs`, L1) et le manifeste de design de la collection
 * (`docs/product/cadres-de-gloire/manifests/<collection>.json`) deviennent LE
 * contrat d'une collection (`types/glory-frames.ts`).
 *
 * Fonctions PURES : aucune lecture de disque ici, `import-glory-frames.ts` les
 * nourrit. La cible d'un cadre (`appliesTo`) se lit dans son IDENTIFIANT, avec
 * les clés de la loi — jamais dans la prose du manifeste (« Palier de niveau »,
 * « braise ») : c'est ce qui rend le vocabulaire des manifestes sans effet sur
 * la loi (D17 : la Flamme de la loi gagne).
 */
import type { FrameUsage } from '../types/frame-usage.js';
import { GLORY_FRAME_BIRD_LAYOUTS } from '../types/glory-frame-format.js';
import type {
  GloryFrameBirdAnchor,
  GloryFrameBirdLayout,
  GloryFrameBirds,
  GloryFrameFilter,
  GloryFrameFormat,
  GloryFrameLayer,
  GloryFrameLayoutVerdict,
  GloryFramePaint,
  GloryFrameStroke,
  GloryFrameTextEffect,
  GloryFrameTextSlot,
} from '../types/glory-frame-format.js';
import type { GloryFrame, GloryFrameAppliesTo, MeeshFrameEdition } from '../types/glory-frames.js';
import type { GloryAtmosphere } from '../types/glory-atmospheres.js';
import { ACHIEVEMENT_RARITIES } from '../utils/game/glory.js';

/** L'atmosphère de chaque collection d'atmosphère ; les autres sont hors atmosphère. */
export const COLLECTION_ATMOSPHERES: Readonly<Record<string, GloryAtmosphere>> = {
  savane: 'afrique',
  royaumes: 'afrique',
  egypte: 'egypte',
  olympe: 'olympe',
  celeste: 'celeste',
  nord: 'nord',
  abysses: 'abysses',
  neon: 'neon',
};

/** `poses` est une collection de DÉMONSTRATION (référence des ancres et des supports), jamais livrée en cadres (§ 5.2). */
export const DEMO_COLLECTIONS: readonly string[] = ['poses'];

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'] as const;
const MEESH_EDITIONS: Readonly<Record<string, MeeshFrameEdition>> = { '1': 'first', '10': 'silver', '100': 'gold', '1000': 'prism' };

export type FrameTarget = { readonly appliesTo: GloryFrameAppliesTo; readonly option: string | null };

/** La cible d'un cadre, lue dans son slug (`ambassadeur-5`, `oracle-b`, `palier-aurore`, `meesh-100`, `coffre-c`, `rare`, `neutre`…). */
export function targetOfSlug(collection: string, slug: string): FrameTarget | null {
  const [, divisionRank, divisionValue] = /^(ambassadeur|legende)-([1-5])$/.exec(slug) ?? [];
  if (divisionRank !== undefined && divisionValue !== undefined) {
    const value = Number(divisionValue) as 1 | 2 | 3 | 4 | 5;
    return { appliesTo: { family: 'rank', rank: divisionRank as 'ambassadeur' | 'legende', division: value }, option: ROMAN[value] };
  }
  const [, letteredRank, letter] = /^(orateur|oracle|mythe)-([a-c])$/.exec(slug) ?? [];
  if (letteredRank !== undefined && letter !== undefined) return { appliesTo: { family: 'rank', rank: letteredRank as 'orateur' | 'oracle' | 'mythe', division: null }, option: letter.toUpperCase() };
  const [, tier] = /^palier-([a-z]+)$/.exec(slug) ?? [];
  if (tier !== undefined) return { appliesTo: { family: 'tier', tier: tier as never }, option: null };
  const [, days] = /^flamme-(\d+)$/.exec(slug) ?? [];
  if (days !== undefined) return { appliesTo: { family: 'flame', days: Number(days) as never }, option: null };
  const [, meesh] = /^meesh-(\d+)$/.exec(slug) ?? [];
  const edition = meesh === undefined ? undefined : MEESH_EDITIONS[meesh];
  if (meesh !== undefined) return edition === undefined ? null : { appliesTo: { family: 'meesh', edition }, option: null };
  const [, day] = /^jour-([a-c])$/.exec(slug) ?? [];
  if (day !== undefined) return { appliesTo: { family: 'day' }, option: day };
  if (collection === 'succes' && slug === 'neutre') return { appliesTo: { family: 'achievement', rarity: null }, option: null };
  const rarity = ACHIEVEMENT_RARITIES.find((candidate) => candidate === slug);
  if (collection === 'succes' && rarity !== undefined) return { appliesTo: { family: 'achievement', rarity }, option: null };
  const [, treasury, treasuryOption] = /^([a-z]+)-([a-c])$/.exec(slug) ?? [];
  if (collection === 'tresor' && treasury !== undefined && treasuryOption !== undefined) return { appliesTo: { family: 'treasury', treasury: treasury as never }, option: treasuryOption };
  return null;
}

/**
 * L'usage d'un cadre (la loi d'usage, #10146). Un cadre de rang sert son RANG, toutes divisions : à la division d,
 * on propose les cinq décorations du rang, celle de d en premier (D3, #10180) — sa division reste dans `appliesTo`.
 */
export function usageOfTarget(target: GloryFrameAppliesTo): FrameUsage {
  switch (target.family) {
    case 'rank':
      return { kind: 'rank', rank: target.rank };
    case 'achievement':
      return target.rarity === null ? { kind: 'achievement' } : { kind: 'achievement', rarity: target.rarity };
    default:
      return { kind: 'moment', family: target.family };
  }
}

const hex2 = (value: number): string => Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, '0').toUpperCase();

/** `#RGB`, `#RRGGBB`, `#RRGGBBAA`, `rgb()` ou `rgba()` → `#RRGGBBAA`, l'opacité multipliée dans l'alpha. */
export function normalizeColor(raw: string, opacity = 1): string {
  const value = raw.trim();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(value);
  const long = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(value);
  const fn = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(value);
  if (short !== null) return `#${short.slice(1, 4).map((c) => `${c}${c}`).join('').toUpperCase()}${hex2(255 * opacity)}`;
  if (long?.[1] !== undefined) return `#${long[1].toUpperCase()}${hex2((long[2] === undefined ? 255 : parseInt(long[2], 16)) * opacity)}`;
  if (fn !== null) return `#${[fn[1], fn[2], fn[3]].map((c) => hex2(Number(c))).join('')}${hex2(255 * Number(fn[4] ?? 1) * opacity)}`;
  throw new Error(`couleur illisible : ${raw}`);
}

type RawStop = { readonly offset: number; readonly color: string; readonly opacity?: number };
type RawPaint = { readonly solid?: string; readonly gradient?: string; readonly stops?: readonly RawStop[]; readonly x1?: string; readonly y1?: string; readonly x2?: string; readonly y2?: string };

export function normalizePaint(raw: RawPaint): GloryFramePaint {
  if (typeof raw.solid === 'string') return { solid: normalizeColor(raw.solid) };
  if (raw.gradient !== 'linearGradient' || raw.stops === undefined) throw new Error(`remplissage illisible : ${JSON.stringify(raw)}`);
  return {
    linear: {
      x1: Number(raw.x1 ?? 0),
      y1: Number(raw.y1 ?? 0),
      x2: Number(raw.x2 ?? 1),
      y2: Number(raw.y2 ?? 0),
      stops: raw.stops.map((stop) => ({ offset: stop.offset, color: normalizeColor(stop.color, stop.opacity ?? 1) })),
    },
  };
}

type RawStroke = { readonly paint: RawPaint; readonly width: number } | null;
const normalizeStroke = (raw: RawStroke): GloryFrameStroke | null => (raw === null ? null : { paint: normalizePaint(raw.paint), width: raw.width });

type RawFilter = readonly (readonly Readonly<Record<string, unknown>>[])[] | null;
const normalizeFilter = (raw: RawFilter): GloryFrameFilter | null =>
  raw === null ? null : raw.map((chain) => chain.map((op) => Object.fromEntries(Object.entries(op).map(([key, value]) => [key, String(value)]))));

type RawEffect = { readonly dx: number; readonly dy: number; readonly fill: RawPaint; readonly stroke: RawStroke; readonly opacity: number; readonly filter: RawFilter; readonly under: boolean };

const normalizeEffect = (raw: RawEffect): GloryFrameTextEffect => ({
  dx: raw.dx,
  dy: raw.dy,
  fill: normalizePaint(raw.fill),
  stroke: normalizeStroke(raw.stroke),
  opacity: raw.opacity,
  under: raw.under,
  filter: normalizeFilter(raw.filter),
});

export type RawTextSlot = {
  readonly text: string;
  readonly x: number;
  readonly baseline: number;
  readonly matrix: readonly number[];
  readonly anchor: 'start' | 'middle' | 'end';
  readonly font: { readonly family: string; readonly weight: number; readonly style: 'normal' | 'italic'; readonly size: number; readonly tracking: number };
  readonly fill: RawPaint;
  readonly stroke: RawStroke;
  readonly opacity: number;
  readonly filter: RawFilter;
  readonly path: { readonly d: string; readonly startOffset: string | number } | null;
  readonly bbox: [number, number, number, number];
  readonly effects: readonly RawEffect[];
  readonly contrast: number;
};

const IDENTITY = [1, 0, 0, 1, 0, 0];
const isIdentity = (matrix: readonly number[]): boolean => matrix.length === 6 && matrix.every((value, at) => value === IDENTITY[at]);

export function normalizeTextSlot(raw: RawTextSlot): GloryFrameTextSlot {
  const [a = 1, b = 0, c = 0, d = 1, e = 0, f = 0] = raw.matrix;
  const matrix = isIdentity(raw.matrix) ? {} : { matrix: [a, b, c, d, e, f] as [number, number, number, number, number, number] };
  return {
    x: raw.x,
    baseline: raw.baseline,
    anchor: raw.anchor,
    ...matrix,
    font: { family: raw.font.family as GloryFrameTextSlot['font']['family'], weight: raw.font.weight, style: raw.font.style, size: raw.font.size, tracking: raw.font.tracking },
    fill: normalizePaint(raw.fill),
    stroke: normalizeStroke(raw.stroke),
    opacity: raw.opacity,
    effects: raw.effects.map(normalizeEffect),
    filter: normalizeFilter(raw.filter),
    path: raw.path === null ? null : { d: raw.path.d, startOffset: String(raw.path.startOffset) },
    bbox: raw.bbox,
    contrast: raw.contrast,
    sample: raw.text,
  };
}

/** Le mot de mise en page du manifeste (« perchés (Mee coucou…) », « côtés », « selfie : … »), ramené à la liste fermée. */
export function birdLayoutOf(prose: string, birdCount: number): GloryFrameBirdLayout {
  const word = prose.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[\s(,:]/)[0] ?? '';
  if (word === 'selfie') return 'selfie';
  if (birdCount === 1) return 'duo';
  const known: Readonly<Record<string, GloryFrameBirdLayout>> = { pied: 'pied', perches: 'perches', cotes: 'cotes', ruban: 'ruban', duo: 'duo' };
  return known[word] ?? 'libre';
}

type RawBird = {
  readonly pose: string;
  readonly box: [number, number, number, number];
  readonly rotate: number;
  readonly flip: boolean;
  readonly opacity: number;
  readonly art?: [number, number, number, number];
};

const anchorOf = (bird: RawBird): GloryFrameBirdAnchor => ({
  sticker: bird.pose,
  box: bird.box,
  rotate: bird.rotate,
  flip: bird.flip,
  opacity: bird.opacity,
  ...(bird.art === undefined ? {} : { art: bird.art }),
});

export function birdsOf(raw: readonly RawBird[]): GloryFrameBirds {
  const mee = raw.find((bird) => bird.pose.startsWith('mee-'));
  const meo = raw.find((bird) => bird.pose.startsWith('meo-'));
  const pair = raw.find((bird) => bird.pose.startsWith('duo-'));
  if (raw.length === 1 && pair !== undefined) return { pair: anchorOf(pair) };
  if (raw.length === 1 && meo !== undefined) return { meo: anchorOf(meo) };
  if (raw.length === 2 && mee !== undefined && meo !== undefined) return { mee: anchorOf(mee), meo: anchorOf(meo) };
  throw new Error(`oiseaux illisibles : ${raw.map((bird) => bird.pose).join(', ')}`);
}

/**
 * Les mises en page DÉCLARÉES d'un cadre (#10277) : celles que le détecteur du générateur a validées
 * (`docs/product/cadres-de-gloire/controle/mises-en-page-<collection>.json`, puis `birds` de l'export), chacune avec
 * ses oiseaux et son verdict. Un export d'avant ne porte que le tableau des oiseaux dessinés.
 */
export type RawBirdTable = {
  readonly default: GloryFrameBirdLayout;
  readonly layouts: Readonly<Partial<Record<GloryFrameBirdLayout, { readonly birds: readonly RawBird[]; readonly validated: GloryFrameLayoutVerdict }>>>;
};

/** `birds` du contrat : la table déclarée, ou — export d'avant #10277 — la seule mise en page dessinée, sans verdict. */
export function birdTableOf(raw: RawBirdTable | readonly RawBird[], drawn: GloryFrameBirdLayout = 'libre'): GloryFrameFormat['birds'] {
  if (isRawBirdList(raw)) return { default: drawn, layouts: { [drawn]: birdsOf(raw) } };
  const declared = GLORY_FRAME_BIRD_LAYOUTS.flatMap((layout) => {
    const entry = raw.layouts[layout];
    return entry === undefined ? [] : [[layout, entry] as const];
  });
  return {
    default: raw.default,
    layouts: Object.fromEntries(declared.map(([layout, entry]) => [layout, birdsOf(entry.birds)])),
    validated: Object.fromEntries(declared.map(([layout, entry]) => [layout, { overlap: entry.validated.overlap, depth: entry.validated.depth, face: entry.validated.face }])),
  };
}

const isRawBirdList = (raw: RawBirdTable | readonly RawBird[]): raw is readonly RawBird[] => Array.isArray(raw);

export type RawRef = { readonly src: string; readonly bytes: number; readonly sha256: string; readonly box?: [number, number, number, number]; readonly blend?: string };

/** La fenêtre de l'export : `path` manque à un export d'avant #10254, et vaut `null` pour un masque vide. */
export type RawWindow = { readonly box: [number, number, number, number]; readonly path?: string | null; readonly mask: RawRef; readonly veilMaxAlpha: number };

export type RawExportFrame = {
  readonly frame: string;
  readonly size: [number, number];
  readonly motifs: readonly string[];
  readonly stack: readonly string[];
  readonly window: RawWindow;
  readonly banner: { readonly box: [number, number, number, number] } | null;
  readonly layers: {
    readonly decor: RawRef;
    readonly windowFill: RawRef;
    readonly grade: readonly (RawRef | null)[];
    readonly front: { readonly 'under-birds': RawRef | null; readonly 'over-birds': RawRef | null };
    readonly plate: { readonly plain?: RawRef | null; readonly message?: RawRef | null };
  };
  readonly thumb: RawRef;
  readonly crest: { readonly box: [number, number, number, number] } | null;
  readonly birds: RawBirdTable | readonly RawBird[];
  readonly text: Readonly<Record<string, RawTextSlot>>;
};

export type ManifestEntry = { readonly file: string; readonly name: string; readonly story: string; readonly layout: string };

/** Le nom adressé par contenu d'un fichier exporté : `<sha16>.<ext>`. */
export const addressedName = (ref: RawRef): string => `${ref.sha256.slice(0, 16)}.${ref.src.split('.').pop() ?? 'webp'}`;

const addressed = (ref: RawRef): { readonly src: string; readonly bytes: number; readonly sha256: string } => ({ src: addressedName(ref), bytes: ref.bytes, sha256: ref.sha256 });

const layerOf = (ref: RawRef): GloryFrameLayer => {
  if (ref.box === undefined) throw new Error(`couche sans boîte : ${ref.src}`);
  return { ...addressed(ref), box: ref.box };
};

const optionalLayer = (ref: RawRef | null | undefined): GloryFrameLayer | undefined => (ref === null || ref === undefined ? undefined : layerOf(ref));

const definedEntries = <V>(record: Readonly<Record<string, V | undefined>>): Readonly<Record<string, V>> =>
  Object.fromEntries(Object.entries(record).filter((entry): entry is [string, V] => entry[1] !== undefined));

/** L'ordre des couches : les passes de `grade` renumérotées sans trou, le bandeau en dernier quand le cadre l'a. */
export function normalizeStack(raw: RawExportFrame): string[] {
  const present = raw.layers.grade.map((ref, index) => (ref === null ? null : index)).filter((index): index is number => index !== null);
  const stack = raw.stack.map((token) => (token.startsWith('grade:') ? `grade:${present.indexOf(Number(token.slice(6)))}` : token));
  return raw.banner === null || stack.includes('banner') ? stack : [...stack, 'banner'];
}

/** La fenêtre du contrat : sa boîte, son chemin quand l'export le porte (#10254), son masque adressé par contenu. */
export function normalizeWindow(raw: RawWindow): GloryFrameFormat['window'] {
  const path = typeof raw.path === 'string' ? { path: raw.path } : {};
  return { box: raw.box, ...path, mask: layerOf(raw.mask), veilMaxAlpha: raw.veilMaxAlpha };
}

export function normalizeFormat(raw: RawExportFrame, layout: GloryFrameBirdLayout): GloryFrameFormat {
  const grades = raw.layers.grade.filter((ref): ref is RawRef => ref !== null).map((ref) => ({ ...layerOf(ref), blend: (ref.blend ?? 'normal') as 'normal' | 'screen' | 'multiply' }));
  return {
    size: raw.size,
    window: normalizeWindow(raw.window),
    stack: normalizeStack(raw),
    layers: {
      decor: layerOf(raw.layers.decor),
      windowFill: layerOf(raw.layers.windowFill),
      grade: grades,
      front: definedEntries({ 'under-birds': optionalLayer(raw.layers.front['under-birds']), 'over-birds': optionalLayer(raw.layers.front['over-birds']) }),
      plate: definedEntries({ plain: optionalLayer(raw.layers.plate.plain), message: optionalLayer(raw.layers.plate.message) }),
    },
    crest: raw.crest === null ? null : { box: raw.crest.box },
    text: Object.fromEntries(Object.entries(raw.text).map(([key, slot]) => [key, normalizeTextSlot(slot)])),
    birds: birdTableOf(raw.birds, layout),
    banner: raw.banner === null ? null : { box: raw.banner.box },
  };
}

export const frameStringKeys = (collection: string, slug: string) => ({
  name: `game.frame.${collection}.${slug}.name`,
  story: `game.frame.${collection}.${slug}.story`,
});

/** Un cadre exporté + son entrée de manifeste → un cadre du contrat. */
export function normalizeFrame(collection: string, raw: RawExportFrame, manifest: ManifestEntry): GloryFrame {
  const slug = raw.frame.startsWith(`${collection}-`) ? raw.frame.slice(collection.length + 1) : raw.frame;
  const target = targetOfSlug(collection, slug);
  if (target === null) throw new Error(`cible inconnue pour ${raw.frame}`);
  return {
    id: `${collection}.${slug}`,
    usage: usageOfTarget(target.appliesTo) as GloryFrame['usage'],
    thumb: addressed(raw.thumb),
    i18n: frameStringKeys(collection, slug),
    collection,
    appliesTo: target.appliesTo,
    option: target.option,
    motifs: [...raw.motifs],
    hidden: false,
    formats: { story: normalizeFormat(raw, birdLayoutOf(manifest.layout, isRawBirdList(raw.birds) ? raw.birds.length : 2)), square: null },
  };
}

/** Tous les fichiers exportés qu'un cadre référence, sous leur chemin d'export : ce que l'import copie dans le magasin. */
export function exportedRefs(raw: RawExportFrame): readonly RawRef[] {
  const { decor, windowFill, grade, front, plate } = raw.layers;
  return [raw.thumb, raw.window.mask, decor, windowFill, ...grade, front['under-birds'], front['over-birds'], plate.plain, plate.message].filter(
    (ref): ref is RawRef => ref !== null && ref !== undefined,
  );
}
