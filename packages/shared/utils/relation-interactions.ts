/**
 * LES INTERACTIONS D'UNE PAIRE — ce qui fait naître la Connaissance et monter la
 * série qui rend éligible à Proche puis Sang (#13932, cercles de proximité).
 *
 * Fonctions PURES sur des jours d'agrégat (`PairInteractionDay`) : le serveur les
 * appelle sur les lignes qu'il lit, aucun client ne décide d'un niveau.
 *
 * ## Les règles (décisions porteur du 2026-10-31)
 *
 * - **Connaissance automatique (D-1)** : sur une semaine GLISSANTE (les sept jours
 *   UTC qui se terminent aujourd'hui), dans CHAQUE sens, au moins
 *   `acquaintance.minInteractions` interactions dont au moins un message, une
 *   réaction (like compris), une vue de post sur le contenu de l'autre et un
 *   message audio. Aucun accès à sens unique.
 * - **Semaine active** : une semaine ISO UTC où chacun a ÉCHANGÉ au moins une
 *   fois avec l'autre (`ACTIVE_WEEK_NATURES`, RG-04 : la vue de post n'y entre
 *   pas). La semaine EN COURS ne casse jamais la série : elle n'est pas
 *   finie. Une semaine finie sans les deux côtés la remet à zéro.
 * - **Proche** : `close.activeWeeks` semaines actives d'affilée, depuis Ami.
 *   **Sang** : `blood.activeWeeks` semaines actives d'affilée, comptées en
 *   semaines ENTIÈRES postérieures à l'entrée en Proche (la continuité est le
 *   garde-fou qui ouvre le Sang à tous les âges).
 * - **L'éligibilité PERMET la demande ; elle n'élève jamais.** Ce module ne rend
 *   aucun niveau à écrire, et une série brisée ne baisse rien : le niveau atteint
 *   est conservé.
 *
 * E2EE : seul le FAIT qu'une interaction a eu lieu est compté — le contenu n'entre
 * jamais ici.
 */
import type { RelationLevel } from '../types/relation.js';
import type { RelationThresholds } from './relation-levels.js';
import { addUtcDays, isoWeekStart, utcDayKey } from './iso-week.js';

export const PAIR_INTERACTION_NATURES = [
  'message',
  'reaction',
  'postView',
  'comment',
  'share',
  'storyReply',
  'mention',
  'call',
  'audio',
] as const;

export type PairInteractionNature = (typeof PAIR_INTERACTION_NATURES)[number];

/** Les natures sans lesquelles la Connaissance automatique ne naît pas (RG-02). */
export const ACQUAINTANCE_REQUIRED_NATURES = ['message', 'reaction', 'postView', 'audio'] as const satisfies readonly PairInteractionNature[];

/**
 * Les natures qui rendent une semaine ACTIVE (RG-04) : des ÉCHANGES. La vue de
 * post n'en est pas une — défiler le fil de l'autre ne tient pas une série, et
 * c'est la continuité des échanges qui distingue un proche d'une connaissance
 * neuve. Elle ne sert qu'à la Connaissance automatique (RG-02).
 */
export const ACTIVE_WEEK_NATURES = PAIR_INTERACTION_NATURES.filter(
  (nature): nature is Exclude<PairInteractionNature, 'postView'> => nature !== 'postView',
);

export type SideCounts = Readonly<Record<PairInteractionNature, number>>;

export type PairInteractionSide = 'low' | 'high';

/** Un jour UTC (« 2026-10-31 ») : ce que `low` a fait envers `high`, et l'inverse. */
export type PairDay = { readonly day: string; readonly low: SideCounts; readonly high: SideCounts };

const capitalized = (nature: PairInteractionNature): string => nature.charAt(0).toUpperCase() + nature.slice(1);

/** `byLowMessage`, `byHighPostView`… : une colonne Int par sens et par nature. */
export const pairDayColumn = (side: PairInteractionSide, nature: PairInteractionNature): string =>
  `by${side === 'low' ? 'Low' : 'High'}${capitalized(nature)}`;

const counter = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;

const sideOf = (row: Readonly<Record<string, unknown>>, side: PairInteractionSide): SideCounts =>
  Object.fromEntries(PAIR_INTERACTION_NATURES.map((nature) => [nature, counter(row[pairDayColumn(side, nature)])])) as SideCounts;

/** Relit une ligne d'agrégat : colonne absente ou illisible = zéro. */
export const pairDayFromRow = (row: Readonly<Record<string, unknown>>): PairDay => ({
  day: row.day instanceof Date ? utcDayKey(row.day) : String(row.day),
  low: sideOf(row, 'low'),
  high: sideOf(row, 'high'),
});

const total = (counts: SideCounts): number => PAIR_INTERACTION_NATURES.reduce((sum, nature) => sum + counts[nature], 0);

const exchanges = (counts: SideCounts): number => ACTIVE_WEEK_NATURES.reduce((sum, nature) => sum + counts[nature], 0);

const sum = (parts: readonly SideCounts[]): SideCounts =>
  Object.fromEntries(
    PAIR_INTERACTION_NATURES.map((nature) => [nature, parts.reduce((acc, part) => acc + part[nature], 0)]),
  ) as SideCounts;

export type AcquaintanceSideProgress = {
  readonly total: number;
  readonly missing: readonly PairInteractionNature[];
};

export type AcquaintanceProgress = {
  readonly met: boolean;
  /** Les natures requises qu'au moins un des deux sens n'a pas encore. */
  readonly missing: readonly PairInteractionNature[];
  readonly low: AcquaintanceSideProgress;
  readonly high: AcquaintanceSideProgress;
};

const sideProgress = (counts: SideCounts): AcquaintanceSideProgress => ({
  total: total(counts),
  missing: ACQUAINTANCE_REQUIRED_NATURES.filter((nature) => counts[nature] < 1),
});

export function acquaintanceProgress(input: {
  readonly days: readonly PairDay[];
  readonly now: Date;
  readonly thresholds: RelationThresholds;
}): AcquaintanceProgress {
  const first = utcDayKey(addUtcDays(input.now, -6));
  const last = utcDayKey(input.now);
  const inWindow = input.days.filter((d) => d.day >= first && d.day <= last);
  const low = sideProgress(sum(inWindow.map((d) => d.low)));
  const high = sideProgress(sum(inWindow.map((d) => d.high)));
  const min = input.thresholds.acquaintance.minInteractions;
  const missing = ACQUAINTANCE_REQUIRED_NATURES.filter((nature) => low.missing.includes(nature) || high.missing.includes(nature));
  return {
    met: missing.length === 0 && low.total >= min && high.total >= min,
    missing,
    low,
    high,
  };
}

type WeekTally = { low: number; high: number };

const weeksOf = (days: readonly PairDay[], now: Date): Map<number, WeekTally> => {
  const today = utcDayKey(now);
  return days
    .filter((d) => d.day <= today)
    .reduce((weeks, d) => {
      const start = isoWeekStart(new Date(`${d.day}T00:00:00Z`)).getTime();
      const tally = weeks.get(start) ?? { low: 0, high: 0 };
      weeks.set(start, { low: tally.low + exchanges(d.low), high: tally.high + exchanges(d.high) });
      return weeks;
    }, new Map<number, WeekTally>());
};

const isActive = (tally: WeekTally | undefined): boolean => tally !== undefined && tally.low > 0 && tally.high > 0;

const WEEK_DAYS = 7;

/**
 * Les semaines actives d'affilée qui se terminent à la semaine courante (ou à la
 * précédente quand la courante n'est pas encore active). `notBefore` écarte toute
 * semaine qui ne tient pas ENTIÈRE après lui.
 */
export function activeWeekStreak(input: {
  readonly days: readonly PairDay[];
  readonly now: Date;
  readonly notBefore?: Date | null;
}): number {
  const weeks = weeksOf(input.days, input.now);
  const floor = input.notBefore ? input.notBefore.getTime() : Number.NEGATIVE_INFINITY;
  const current = isoWeekStart(input.now);
  const firstWeek = isActive(weeks.get(current.getTime())) ? current : addUtcDays(current, -WEEK_DAYS);

  let streak = 0;
  for (let cursor = firstWeek; cursor.getTime() >= floor && isActive(weeks.get(cursor.getTime())); cursor = addUtcDays(cursor, -WEEK_DAYS)) {
    streak += 1;
  }
  return streak;
}

export type RelationSeriesProgress = {
  readonly activeWeeks: number;
  /** Semaines à tenir pour le cran suivant ; `null` quand aucune série n'en ouvre un. */
  readonly needed: number | null;
  readonly eligibleFor: 'CLOSE' | 'BLOOD' | null;
};

export function relationSeriesProgress(input: {
  readonly days: readonly PairDay[];
  readonly now: Date;
  readonly level: RelationLevel;
  readonly levelSince: Date | null;
  readonly thresholds: RelationThresholds;
}): RelationSeriesProgress {
  const { days, now, level, levelSince, thresholds } = input;
  if (level === 'FRIEND') {
    const activeWeeks = activeWeekStreak({ days, now });
    const needed = thresholds.close.activeWeeks;
    return { activeWeeks, needed, eligibleFor: activeWeeks >= needed ? 'CLOSE' : null };
  }
  if (level === 'CLOSE') {
    const activeWeeks = levelSince ? activeWeekStreak({ days, now, notBefore: levelSince }) : 0;
    const needed = thresholds.blood.activeWeeks;
    return { activeWeeks, needed, eligibleFor: activeWeeks >= needed ? 'BLOOD' : null };
  }
  return { activeWeeks: activeWeekStreak({ days, now }), needed: null, eligibleFor: null };
}
