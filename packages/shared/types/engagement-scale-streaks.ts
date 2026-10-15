/**
 * La lecture des SÉRIES et de la FIDÉLITÉ d'un barème (#10388, #10389, #10390),
 * sortie d'`engagement-scale.ts` (budget de taille). Le module public reste
 * `engagement-scale.ts`, qui ré-exporte ce qui doit l'être.
 *
 * Deux règles de compatibilité tiennent ici :
 * - un barème réglé avant les séries par acte n'a que `streakBonuses` : il se
 *   relit comme `streaks.global`, avec des actes sans palier ;
 * - `streakBonuses` reste ÉCRIT, comme projection de `streaks.global` dont les
 *   points sont ramenés à `LEGACY_STREAK_BONUS_POINTS_CEILING` : une passerelle
 *   d'avant #10388 relit encore un barème valide au lieu de retomber sur les
 *   défauts.
 */

import {
  ENGAGEMENT_STREAK_ACTS,
  ENGAGEMENT_STREAK_TIER_DAYS_CEILING,
  ENGAGEMENT_STREAK_TIER_LABEL_MAX,
  LEGACY_STREAK_BONUS_POINTS_CEILING,
  emptyActTiers,
  isEngagementStreakAct,
  type EngagementStreakAct,
  type EngagementStreakTier,
  type EngagementStreaks,
} from './engagement-act-streaks.js';

/**
 * Plafond DUR des points d'une opération, d'une règle de lien ou d'un palier :
 * dix millions. Il était de 1000 avant #10388 ; une série d'un an doit pouvoir
 * rapporter 100 000 points, et une faute de frappe ne distribue toujours pas un
 * milliard.
 */
export const ENGAGEMENT_SCALE_POINTS_CEILING = 10_000_000;

/**
 * Ce qu'un barème peut distribuer en PALIERS à un seul compte : un milliard. Un
 * palier se paie une fois par compte (seau `streak:…` / `loyalty:…`), donc la
 * somme des paliers de la série globale, de chaque acte et de la fidélité borne
 * ce qu'un compte en reçoit. `User.engagementScore` est un `Int` 32 bits
 * (2 147 483 647) : au-delà, Mongo promeut le champ en entier 64 bits et Prisma
 * ne relit plus la ligne — la fiche du compte et chaque classement qui la lit
 * tombent. Cent paliers de dix millions y suffisaient.
 */
export const ENGAGEMENT_SCALE_TIER_POINTS_TOTAL_CEILING = 1_000_000_000;

/** Paliers d'une liste (série globale, un acte, fidélité) : cent au plus. */
export const ENGAGEMENT_STREAK_TIERS_MAX = 100;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isIntIn = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;

type LabelRead = { readonly ok: true; readonly label?: string } | { readonly ok: false };

function readLabel(value: unknown): LabelRead {
  if (value === undefined || value === null) return { ok: true };
  if (typeof value !== 'string') return { ok: false };
  const label = value.trim();
  if (label.length > ENGAGEMENT_STREAK_TIER_LABEL_MAX) return { ok: false };
  return label.length === 0 ? { ok: true } : { ok: true, label };
}

/**
 * Une liste de paliers : jours entiers de 1 à 10 000, points entiers de 0 à
 * dix millions, libellé facultatif de 40 caractères au plus, jours uniques.
 * Rendue triée par jours croissants ; `null` au premier palier illisible.
 */
export function parseStreakTiers(value: unknown): readonly EngagementStreakTier[] | null {
  if (!Array.isArray(value) || value.length > ENGAGEMENT_STREAK_TIERS_MAX) return null;
  const tiers: EngagementStreakTier[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) return null;
    if (!isIntIn(entry.days, 1, ENGAGEMENT_STREAK_TIER_DAYS_CEILING)) return null;
    if (!isIntIn(entry.points, 0, ENGAGEMENT_SCALE_POINTS_CEILING)) return null;
    const label = readLabel(entry.label);
    if (!label.ok) return null;
    tiers.push(label.label === undefined ? { days: entry.days, points: entry.points } : { days: entry.days, points: entry.points, label: label.label });
  }
  if (new Set(tiers.map((tier) => tier.days)).size !== tiers.length) return null;
  return [...tiers].sort((a, b) => a.days - b.days);
}

/**
 * Les séries d'un barème. `fallbackGlobal` est ce que `streakBonuses` dit
 * (ou les défauts) : il tient lieu de `global` quand `streaks` est absent, ou
 * quand il ne porte pas de `global`. Un acte absent n'a aucun palier ; un acte
 * inconnu refuse le barème.
 */
export function parseStreaks(
  value: unknown,
  fallbackGlobal: readonly EngagementStreakTier[],
): EngagementStreaks | null {
  if (value === undefined) return { global: fallbackGlobal, acts: emptyActTiers() };
  if (!isRecord(value)) return null;
  const global = value.global === undefined ? fallbackGlobal : parseStreakTiers(value.global);
  if (global === null) return null;
  const rawActs = value.acts === undefined ? {} : value.acts;
  if (!isRecord(rawActs)) return null;
  if (!Object.keys(rawActs).every(isEngagementStreakAct)) return null;
  const acts: Partial<Record<EngagementStreakAct, readonly EngagementStreakTier[]>> = {};
  for (const act of ENGAGEMENT_STREAK_ACTS) {
    const tiers = rawActs[act] === undefined ? [] : parseStreakTiers(rawActs[act]);
    if (tiers === null) return null;
    acts[act] = tiers;
  }
  return { global, acts: acts as Record<EngagementStreakAct, readonly EngagementStreakTier[]> };
}

/** Les paliers de fidélité : absents ⇒ aucun. */
export function parseLoyalty(value: unknown): readonly EngagementStreakTier[] | null {
  return value === undefined ? [] : parseStreakTiers(value);
}

/**
 * Ce qu'une passerelle d'avant #10388 lit sous `streakBonuses` : les paliers
 * globaux, sans libellé, aux points ramenés à 1000.
 */
export function legacyStreakBonuses(global: readonly EngagementStreakTier[]): readonly { readonly days: number; readonly points: number }[] {
  return global.map((tier) => ({ days: tier.days, points: Math.min(tier.points, LEGACY_STREAK_BONUS_POINTS_CEILING) }));
}

/** La somme des points de tous les paliers d'un barème tient-elle sous le plafond ? */
export function tierPointsWithinTotal(streaks: EngagementStreaks, loyalty: readonly EngagementStreakTier[]): boolean {
  const lists = [streaks.global, ...Object.values(streaks.acts), loyalty];
  const total = lists.reduce((sum, tiers) => sum + tiers.reduce((inner, tier) => inner + tier.points, 0), 0);
  return total <= ENGAGEMENT_SCALE_TIER_POINTS_TOTAL_CEILING;
}
