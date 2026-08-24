/**
 * Trace de l'interaction d'un participant avec un audio ou une vidéo.
 *
 * ## Une trace, pas des segments
 *
 * Ce que le client rapporte n'est pas une liste de portions parcourues mais une
 * suite d'écoutes réellement CONTINUES, dans l'ordre où elles ont eu lieu, avec
 * ce qui a mis fin à chacune. Le serveur accumule cette suite sans la trier ni
 * la fusionner : écouter la fin puis revenir au début doit rester lisible dans
 * cet ordre, et deux passages jointifs séparés par dix minutes de silence ne
 * sont pas une écoute d'une traite.
 *
 * ## Trois lectures, une seule source
 *
 * - le CARDINAL donne le nombre d'écoutes ininterrompues ;
 * - la fusion des chevauchements ({@link traceCoverage}) donne la COUVERTURE
 *   unique — quelles portions, sans compter deux fois un passage réécouté ;
 * - l'écart entre cette couverture et `totalListenDurationMs` (qui, lui, compte
 *   les replays) dit que des passages ont été REVUS.
 *
 * Rien de tout cela n'est stocké séparément : un seul champ, trois lectures.
 *
 * Le producteur de cette trace est `PlaybackStretchTracker`, décliné à
 * l'identique côté web (`apps/web/utils/playback-stretch-tracker.ts`) et iOS
 * (`packages/MeeshySDK/…/PlaybackStretchTracker.swift`).
 *
 * @see docs/superpowers/specs/2026-07-24-media-views-enrichment-design.md
 */

import { isMsRangeStrictlyOrdered } from '@meeshy/shared/utils/time-range';

import { mergePlaybackSegments, type PlaybackSegment } from './playback-segments.js';

/** Ce qui a mis fin à une écoute continue. */
export type StretchEnd =
  | 'pause'
  | 'seek'
  | 'muted'
  | 'completed'
  | 'dismissed'
  | 'superseded';

const STRETCH_ENDS: ReadonlySet<string> = new Set<StretchEnd>([
  'pause',
  'seek',
  'muted',
  'completed',
  'dismissed',
  'superseded',
]);

export type PlaybackStretch = {
  readonly startMs: number;
  readonly endMs: number;
  readonly endedBy: StretchEnd;
};

/**
 * Plafond de la trace stockée. Un scrub frénétique produirait sinon un document
 * qui enfle sans fin.
 *
 * Volontairement identique au plafond de {@link mergePlaybackSegments} : la
 * fusion ne pouvant que réduire le nombre d'entrées, la couverture dérivée d'une
 * trace déjà plafonnée n'atteint jamais son propre plafond — donc jamais la
 * sur-estimation qu'il introduirait.
 */
export const MAX_TRACE_STRETCHES = 50;

function isUsable(candidate: unknown): candidate is PlaybackStretch {
  if (typeof candidate !== 'object' || candidate === null) return false;

  const { startMs, endMs, endedBy } = candidate as Record<string, unknown>;

  return (
    typeof startMs === 'number' &&
    typeof endMs === 'number' &&
    Number.isFinite(startMs) &&
    Number.isFinite(endMs) &&
    startMs >= 0 &&
    // `endMs > startMs` STRICT via la brique partagée : une écoute continue de
    // durée nulle n'est pas une écoute (cf. `isMsRangeStrictlyOrdered`, dont le
    // gate de wire `playbackStretch` et le filtre de `playback-segments` sont
    // les jumeaux).
    isMsRangeStrictlyOrdered({ startMs, endMs }) &&
    typeof endedBy === 'string' &&
    STRETCH_ENDS.has(endedBy)
  );
}

/** Forme canonique : les champs surnuméraires d'un client plus récent tombent. */
function canonical(stretch: PlaybackStretch): PlaybackStretch {
  return { startMs: stretch.startMs, endMs: stretch.endMs, endedBy: stretch.endedBy };
}

function identity(stretch: PlaybackStretch): string {
  return `${stretch.startMs}:${stretch.endMs}:${stretch.endedBy}`;
}

/**
 * Relit une trace persistée en `Json?`.
 *
 * Mongo rend un `unknown` : forme libre, potentiellement écrite par une version
 * antérieure ou corrompue. Une entrée douteuse est jetée, jamais propagée — et
 * jamais au prix d'une exception qui ferait échouer l'affichage entier des vues.
 */
export function parsePlaybackTrace(raw: unknown): PlaybackStretch[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isUsable).map(canonical);
}

/**
 * Réduit la trace au plafond en sacrifiant les écoutes les plus COURTES.
 *
 * Perdre la moindre couverture possible : une trace saturée sous-estime ce qui a
 * été écouté, elle n'invente jamais une écoute qui n'a pas eu lieu. Combler les
 * écarts, comme le fait la dérivation de couverture, ferait l'inverse — c'est
 * acceptable pour une barre de progression, pas pour la trace de référence.
 *
 * L'ordre chronologique des rescapées est préservé.
 */
function capTrace(trace: PlaybackStretch[], maxStretches: number): PlaybackStretch[] {
  if (trace.length <= maxStretches) return trace;

  const rankedByDuration = trace
    .map((stretch, index) => ({ index, duration: stretch.endMs - stretch.startMs }))
    .sort((a, b) => b.duration - a.duration || a.index - b.index)
    .slice(0, maxStretches);

  const kept = new Set(rankedByDuration.map((entry) => entry.index));
  return trace.filter((_, index) => kept.has(index));
}

/**
 * Accumule un nouveau rapport à la suite de la trace connue.
 *
 * Une écoute strictement identique — mêmes bornes, même motif de fin — n'est
 * comptée qu'une fois. Une file d'attente hors-ligne peut re-poster son rapport
 * après une coupure réseau ; sans cette garde, « trois écoutes » deviendrait
 * « six » à la première reprise. Le risque inverse (deux écoutes réellement
 * distinctes tombant à la milliseconde près sur les mêmes bornes ET le même
 * motif) est négligeable devant celui du rejeu.
 */
export function appendPlaybackStretches(
  existing: readonly PlaybackStretch[],
  incoming: readonly unknown[],
  options: { maxStretches?: number } = {}
): PlaybackStretch[] {
  const maxStretches = options.maxStretches ?? MAX_TRACE_STRETCHES;

  const trace: PlaybackStretch[] = [];
  const seen = new Set<string>();

  for (const candidate of [...existing, ...(incoming ?? [])]) {
    if (!isUsable(candidate)) continue;
    const stretch = canonical(candidate);
    const key = identity(stretch);
    if (seen.has(key)) continue;
    seen.add(key);
    trace.push(stretch);
  }

  return capTrace(trace, maxStretches);
}

/**
 * Couverture unique DÉDUITE de la trace : quelles portions ont été parcourues,
 * un passage réécouté ne comptant qu'une fois.
 *
 * Remet dans l'ordre des positions ce que la trace donne dans l'ordre du temps —
 * c'est ce dont une barre de progression a besoin, et uniquement elle : la trace
 * reste la référence pour tout le reste.
 */
export function traceCoverage(trace: readonly PlaybackStretch[]): PlaybackSegment[] {
  return mergePlaybackSegments(
    trace.map((stretch) => ({ startMs: stretch.startMs, endMs: stretch.endMs })),
    [],
    { maxSegments: MAX_TRACE_STRETCHES }
  );
}
