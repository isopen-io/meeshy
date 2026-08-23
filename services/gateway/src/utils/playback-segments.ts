/**
 * Portions d'un audio ou d'une vidéo réellement consommées par un participant.
 *
 * `lastPlayPositionMs` ne dit que le point d'arrêt : un participant qui saute au
 * générique est indistinguable de celui qui a tout écouté. Les segments disent
 * ce qui a été parcouru.
 *
 * La somme des segments fusionnés donne la **couverture unique**, distincte de
 * `totalListenDurationMs` / `totalWatchDurationMs` qui comptabilisent les
 * replays : « 45 s uniques sur 90 s, pour 120 s d'écoute » se lit « a revu des
 * passages ».
 *
 * Leur **nombre** compte les écoutes ininterrompues : trois segments valent
 * trois passages distincts, même s'ils se suivent en temps média. Seuls les
 * segments qui se CHEVAUCHENT fusionnent — l'adjacence ne dit rien du temps
 * réel, et écraser deux passages jointifs présenterait à tort une écoute
 * hachée comme continue.
 *
 * **Contrat client** : chaque segment rapporté doit correspondre à une écoute
 * réellement continue. Un client qui échantillonne sa lecture (un point toutes
 * les dix secondes, par exemple) fusionne ses propres échantillons AVANT de
 * rapporter — lui seul sait qu'ils n'étaient pas séparés dans le temps.
 *
 * @see docs/superpowers/specs/2026-07-24-media-views-enrichment-design.md
 */

import { isMsRangeStrictlyOrdered } from '@meeshy/shared/utils/time-range';

export type PlaybackSegment = {
  readonly startMs: number;
  readonly endMs: number;
};

export type MergeOptions = {
  /**
   * Nombre maximal de segments conservés. Un scrub frénétique produirait sinon
   * un document qui enfle sans fin.
   */
  readonly maxSegments?: number;
};

const DEFAULT_MAX_SEGMENTS = 50;

function isUsable(segment: PlaybackSegment): boolean {
  return (
    Number.isFinite(segment.startMs) &&
    Number.isFinite(segment.endMs) &&
    segment.startMs >= 0 &&
    // `endMs > startMs` STRICT via la brique partagée : un segment de durée nulle
    // n'est pas une portion parcourue (cf. `isMsRangeStrictlyOrdered`).
    isMsRangeStrictlyOrdered(segment)
  );
}

/**
 * Réduit le nombre de segments en comblant d'abord l'écart le PLUS PETIT.
 *
 * Conséquence assumée : la couverture est légèrement sur-estimée, puisque les
 * écarts comblés comptent comme parcourus. Commencer par les plus petits écarts
 * minimise cette erreur, et à 50 segments la granularité reste très supérieure
 * au besoin d'affichage.
 */
function capSegments(sorted: PlaybackSegment[], maxSegments: number): PlaybackSegment[] {
  const segments = [...sorted];

  while (segments.length > maxSegments) {
    let smallestGapIndex = 0;
    let smallestGap = Infinity;

    for (let i = 0; i < segments.length - 1; i++) {
      const gap = segments[i + 1].startMs - segments[i].endMs;
      if (gap < smallestGap) {
        smallestGap = gap;
        smallestGapIndex = i;
      }
    }

    const left = segments[smallestGapIndex];
    const right = segments[smallestGapIndex + 1];
    segments.splice(smallestGapIndex, 2, {
      startMs: left.startMs,
      endMs: Math.max(left.endMs, right.endMs),
    });
  }

  return segments;
}

/**
 * Fusionne les segments déjà connus avec ceux d'un nouveau rapport.
 *
 * Pure et sans état : c'est ce qui la rend vérifiable sans base de données, et
 * duplicable à l'identique côté client pour un affichage optimiste.
 */
export function mergePlaybackSegments(
  existing: readonly PlaybackSegment[],
  incoming: readonly PlaybackSegment[],
  options: MergeOptions = {}
): PlaybackSegment[] {
  const maxSegments = options.maxSegments ?? DEFAULT_MAX_SEGMENTS;

  const sorted = [...existing, ...incoming]
    .filter(isUsable)
    .sort((a, b) => a.startMs - b.startMs);

  if (sorted.length === 0) return [];

  const merged: PlaybackSegment[] = [];
  for (const segment of sorted) {
    const last = merged[merged.length - 1];
    // `<` et non `<=` : seuls les segments qui se CHEVAUCHENT fusionnent, jamais
    // ceux qui se touchent. L'adjacence en temps média ne dit rien du temps
    // réel — écouter la première moitié, s'interrompre dix minutes, puis
    // reprendre produit deux segments jointifs qu'il serait faux de présenter
    // comme une écoute d'une traite.
    if (last && segment.startMs < last.endMs) {
      merged[merged.length - 1] = {
        startMs: last.startMs,
        endMs: Math.max(last.endMs, segment.endMs),
      };
      continue;
    }
    merged.push({ startMs: segment.startMs, endMs: segment.endMs });
  }

  return merged.length <= maxSegments ? merged : capSegments(merged, maxSegments);
}

/**
 * Durée réellement parcourue, un passage revu ne comptant qu'une fois.
 *
 * Attend des segments déjà fusionnés — sur des segments bruts qui se
 * chevauchent, le total serait sur-compté.
 */
export function coveredDurationMs(segments: readonly PlaybackSegment[]): number {
  return segments.reduce((total, segment) => total + (segment.endMs - segment.startMs), 0);
}
