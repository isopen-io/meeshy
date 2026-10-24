import { LENS_LIMITS, LENS_SCHEMA_VERSION, type LENS_DENSITIES, type LENS_FACE_POINTS, type LENS_PARTICLE_PRESETS, type LENS_SURFACES, type LensLayer } from '@meeshy/shared/types/lens-format';
import type { GloryFrameFont } from '@meeshy/shared/types/glory-frame-format';
import { measureLensCost } from '@meeshy/shared/types/lens-pack';

import { PAPER } from '@/lib/mee/art';
import { slugOf } from '@/lib/sticker-packs/draft';

import { assetAddressOf, type Digest } from './submission';

/**
 * **COMPOSER UNE LENS SANS CODE** (W16, #11322) — le brouillon que le
 * partenaire remplit, et sa traduction en document MeeshyLens. Comme pour un
 * pack de stickers (`lib/sticker-packs/draft.ts`), tout ce qui se DÉDUIT se
 * déduit : l'adresse (`id`) vient du nom, le COÛT est mesuré sur les couches
 * (`measureLensCost`, la loi même de la passerelle — il n'est jamais demandé),
 * chaque couche reçoit son identifiant, chaque fichier son adresse par contenu.
 * Une position se CHOISIT par son nom (haut de l'écran, front, bouche…),
 * jamais par des coordonnées. Le texte saisi est la langue de repli du format
 * (`fr`). Ni lieu ni crédit de modération : #11251.
 */
export type LensSurface = (typeof LENS_SURFACES)[number];
export type LensParticlePreset = (typeof LENS_PARTICLE_PRESETS)[number];
export type LensDensity = (typeof LENS_DENSITIES)[number];

const SCREEN_PLACES = ['screen-top', 'screen-center', 'screen-bottom'] as const;
const FACE_PLACES = ['top-of-head', 'forehead', 'nose-tip', 'mouth', 'chin'] as const satisfies readonly (typeof LENS_FACE_POINTS)[number][];
type ScreenPlace = (typeof SCREEN_PLACES)[number];

export const LENS_PLACES = [...SCREEN_PLACES, ...FACE_PLACES] as const;
export type LensPlace = (typeof LENS_PLACES)[number];

/** Les primitives que l'éditeur propose : celles que le peintre web rend (le motif d'un cadre n'y a pas de peintre). */
export const DRAFT_LAYER_KINDS = ['text', 'sticker', 'particles', 'lut'] as const;
export type DraftLayerKind = (typeof DRAFT_LAYER_KINDS)[number];

export type DraftLayer =
  | { readonly key: string; readonly kind: 'sticker'; readonly file: File | null; readonly place: LensPlace; readonly size: number }
  | { readonly key: string; readonly kind: 'text'; readonly text: string; readonly font: GloryFrameFont; readonly color: string; readonly size: number; readonly place: LensPlace }
  | { readonly key: string; readonly kind: 'particles'; readonly preset: LensParticlePreset; readonly density: LensDensity }
  | { readonly key: string; readonly kind: 'lut'; readonly file: File | null; readonly intensity: number };

export type LensDraft = {
  readonly name: string;
  readonly author: string;
  readonly surfaces: readonly LensSurface[];
  /** Jours UTC (`AAAA-MM-JJ`) : la fenêtre proposée, que la modération peut refixer en publiant. */
  readonly startsOn: string;
  readonly endsOn: string;
  readonly layers: readonly DraftLayer[];
};

export type LensDraftProblem = 'name' | 'author' | 'surfaces' | 'window' | 'layers' | 'file' | 'text';

const DEFAULT_WINDOW_DAYS = 30;
const DAY_MS = 86_400_000;

const dayAfter = (day: string, days: number): string => new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

export const todayOf = (now: Date): string => now.toISOString().slice(0, 10);

export const emptyLensDraft = (today: string): LensDraft => ({
  name: '',
  author: '',
  surfaces: ['capture', 'live'],
  startsOn: today,
  endsOn: dayAfter(today, DEFAULT_WINDOW_DAYS),
  layers: [],
});

export function newDraftLayer(kind: DraftLayerKind, key: string): DraftLayer {
  switch (kind) {
    case 'sticker':
      return { key, kind, file: null, place: 'screen-center', size: 0.3 };
    case 'text':
      return { key, kind, text: '', font: 'Manrope', color: PAPER, size: 0.08, place: 'screen-bottom' };
    case 'particles':
      return { key, kind, preset: 'sparkles', density: 'mid' };
    case 'lut':
      return { key, kind, file: null, intensity: 1 };
  }
}

const SCREEN_Y: Readonly<Record<ScreenPlace, number>> = { 'screen-top': 0.15, 'screen-center': 0.5, 'screen-bottom': 0.85 };

const isScreenPlace = (place: LensPlace): place is ScreenPlace => (SCREEN_PLACES as readonly string[]).includes(place);

const anchorOf = (place: LensPlace) => (isScreenPlace(place) ? { type: 'screen' as const, x: 0.5, y: SCREEN_Y[place] } : { type: 'face' as const, point: place });

const assetOf = (file: File | null, addresses: ReadonlyMap<File, string>): string => (file === null ? '' : (addresses.get(file) ?? ''));

const layerOf = (layer: DraftLayer, index: number, addresses: ReadonlyMap<File, string>): LensLayer => {
  const id = `${layer.kind}-${index + 1}`;
  switch (layer.kind) {
    case 'sticker':
      return { kind: 'sticker', id, asset: assetOf(layer.file, addresses), anchor: anchorOf(layer.place), size: layer.size };
    case 'text':
      return { kind: 'text', id, text: { fr: layer.text.trim() }, font: layer.font, color: layer.color, size: layer.size, anchor: anchorOf(layer.place) };
    case 'particles':
      return { kind: 'particles', id, preset: layer.preset, density: layer.density };
    case 'lut':
      return { kind: 'lut', id, asset: assetOf(layer.file, addresses), intensity: layer.intensity };
  }
};

/** Le document MeeshyLens du brouillon. `parseLens` le lit dès que `lensDraftProblems` est vide. */
export function lensDocumentOf(draft: LensDraft, context: { readonly addresses: ReadonlyMap<File, string>; readonly today: string }) {
  const layers = draft.layers.map((layer, index) => layerOf(layer, index, context.addresses));
  return {
    schema: LENS_SCHEMA_VERSION,
    id: slugOf(draft.name, LENS_LIMITS.maxIdLength) || 'lens',
    name: draft.name.trim(),
    credits: { author: draft.author.trim(), createdAt: context.today },
    surfaces: [...draft.surfaces],
    cost: measureLensCost({ layers }),
    window: { startsAt: `${draft.startsOn}T00:00:00Z`, endsAt: `${draft.endsOn}T23:59:59Z` },
    layers,
  };
}

/** Les fichiers que le brouillon porte, une fois chacun, dans l'ordre des couches. */
export const lensDraftFiles = (draft: LensDraft): readonly File[] => [
  ...new Set(draft.layers.flatMap((layer) => ((layer.kind === 'sticker' || layer.kind === 'lut') && layer.file !== null ? [layer.file] : []))),
];

export async function lensDraftAddresses(draft: LensDraft, digest?: Digest): Promise<ReadonlyMap<File, string>> {
  const files = lensDraftFiles(draft);
  return new Map(await Promise.all(files.map(async (file) => [file, await assetAddressOf(file, digest)] as const)));
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const layerProblem = (layer: DraftLayer): LensDraftProblem | null => {
  if ((layer.kind === 'sticker' || layer.kind === 'lut') && layer.file === null) return 'file';
  if (layer.kind === 'text' && layer.text.trim() === '') return 'text';
  return null;
};

/** Ce qui manque encore, dans l'ordre où l'éditeur le montre ; vide : la lens peut partir. */
export function lensDraftProblems(draft: LensDraft): readonly LensDraftProblem[] {
  const windowOk = ISO_DAY.test(draft.startsOn) && ISO_DAY.test(draft.endsOn) && draft.endsOn >= draft.startsOn;
  const own: readonly (LensDraftProblem | null)[] = [
    draft.name.trim() === '' ? 'name' : null,
    draft.author.trim() === '' ? 'author' : null,
    draft.surfaces.length === 0 ? 'surfaces' : null,
    windowOk ? null : 'window',
    draft.layers.length === 0 ? 'layers' : null,
    ...draft.layers.map(layerProblem),
  ];
  return [...new Set(own.filter((problem): problem is LensDraftProblem => problem !== null))];
}
