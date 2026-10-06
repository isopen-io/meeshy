/**
 * **Les réglages d'un média de scène — la loi de LECTURE, une fois, pour les
 * clients TypeScript** (#9497).
 *
 * Le modèle est né côté iOS (`ImageAdjustments` / `AdjustmentKind`,
 * `packages/MeeshySDK/Sources/MeeshySDK/Models/Story/ImageAdjustments.swift`,
 * #9175 pour l'image, #9169 pour la vidéo). Il voyage dans
 * `payload.adjustments` d'un objet `media` — que `canvas-v3.ts` déclare
 * permissif par contrat — sous la forme des seules valeurs ACTIVES.
 *
 * Ce module est le miroir de la lecture Swift :
 * - une clé inconnue est ignorée, une valeur non numérique ou non finie aussi ;
 * - une valeur hors bornes est ramenée à la borne de son curseur — la charge
 *   ne décide jamais du coût d'un rendu (un flou de 400 n'est jamais servi) ;
 * - une valeur neutre ne compte pas ;
 * - une vidéo ne peint ni la NETTETÉ ni le FLOU (`AdjustmentKind.isServedForVideo`).
 *
 * **Les EFFETS de l'ancien éditeur d'image (#9498) voyagent dans le MÊME sac.**
 * Ce que son outil « Effets » offrait de plus que les réglages — le BLOOM et le
 * GRAIN — sont deux clés de plus, de 0 à 1, neutres à 0. Son flou, sa vignette
 * et sa netteté étaient déjà des réglages : ils ne reviennent pas une seconde
 * fois. Aucune vidéo ne les peint : le bloom est un flou gaussien de plus à
 * chaque trame, et le grain est un bruit que la compression ne sait pas tenir.
 *
 * La PEINTURE reste chez chaque client : ce module ne dit que ce qui se peint.
 */

export const MEDIA_ADJUSTMENT_KINDS = [
  'exposure',
  'brightness',
  'contrast',
  'saturation',
  'vibrance',
  'temperature',
  'sharpness',
  'blur',
  'vignette',
  'bloom',
  'grain',
] as const;

export type MediaAdjustmentKind = (typeof MEDIA_ADJUSTMENT_KINDS)[number];

export type MediaAdjustmentRange = { readonly min: number; readonly max: number };

export type MediaAdjustmentTarget = 'image' | 'video';

/** Les valeurs ACTIVES d'un média, bornées ; une clé absente est neutre. */
export type MediaAdjustments = Readonly<Partial<Record<MediaAdjustmentKind, number>>>;

export const MEDIA_ADJUSTMENT_RANGES: Readonly<Record<MediaAdjustmentKind, MediaAdjustmentRange>> = {
  exposure: { min: -2, max: 2 },
  brightness: { min: -0.4, max: 0.4 },
  contrast: { min: 0.5, max: 1.5 },
  saturation: { min: 0, max: 2 },
  vibrance: { min: -1, max: 1 },
  temperature: { min: -1, max: 1 },
  sharpness: { min: 0, max: 1 },
  blur: { min: 0, max: 1 },
  vignette: { min: 0, max: 2 },
  bloom: { min: 0, max: 1 },
  grain: { min: 0, max: 1 },
};

export const MEDIA_ADJUSTMENT_NEUTRAL: Readonly<Record<MediaAdjustmentKind, number>> = {
  exposure: 0,
  brightness: 0,
  contrast: 1,
  saturation: 1,
  vibrance: 0,
  temperature: 0,
  sharpness: 0,
  blur: 0,
  vignette: 0,
  bloom: 0,
  grain: 0,
};

const ACTIVE_EPSILON = 0.0001;

const NOT_SERVED_FOR_VIDEO: ReadonlySet<MediaAdjustmentKind> = new Set(['sharpness', 'blur', 'bloom', 'grain']);

export const isAdjustmentServed = (kind: MediaAdjustmentKind, target: MediaAdjustmentTarget): boolean =>
  target === 'image' || !NOT_SERVED_FOR_VIDEO.has(kind);

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const clampTo = (value: number, { min, max }: MediaAdjustmentRange): number => Math.min(Math.max(value, min), max);

function servedValue(raw: unknown, kind: MediaAdjustmentKind, target: MediaAdjustmentTarget): number | null {
  if (!isAdjustmentServed(kind, target) || typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  const value = clampTo(raw, MEDIA_ADJUSTMENT_RANGES[kind]);
  return Math.abs(value - MEDIA_ADJUSTMENT_NEUTRAL[kind]) > ACTIVE_EPSILON ? value : null;
}

/** `payload.adjustments` tel qu'un média de ce genre le PEINT, ou `null` quand rien ne se peint. */
export function readMediaAdjustments(
  payload: Readonly<Record<string, unknown>>,
  target: MediaAdjustmentTarget,
): MediaAdjustments | null {
  const raw = payload.adjustments;
  if (!isRecord(raw)) return null;
  const entries = MEDIA_ADJUSTMENT_KINDS.flatMap((kind) => {
    const value = servedValue(raw[kind], kind, target);
    return value === null ? [] : [[kind, value] as const];
  });
  return entries.length === 0 ? null : Object.fromEntries(entries);
}
