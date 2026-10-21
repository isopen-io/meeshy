/**
 * LES SAISONS (#9386) — huit semaines, un thème, quarante étapes gratuites.
 * `docs/product/jeu-meeshy-conception.html` § II.7.
 *
 * Le calendrier est DONNÉ, pas lu sur une horloge : la saison 1 ouvre le lundi
 * 2026-12-21 et ferme le dimanche 2027-02-14 à 20 h, puis les saisons
 * s'enchaînent sans trou de 56 jours. Elle devait ouvrir le lundi 2026-10-12 :
 * le porteur l'a repoussée le 2026-10-10 (#10014), et a retenu le lundi 21
 * plutôt que le dimanche 20 demandé, parce qu'une saison commence avec une
 * semaine de ligue. Avant cette date, `seasonAt` rend `null` : le bloc Jeu sert
 * alors la saison À VENIR (`upcomingSeason`), jamais un vide. Les semaines de
 * saison sont celles des ligues (lundi local, fermeture dimanche 20 h) : un
 * moment passé la fermeture du dernier dimanche est déjà dans la saison
 * suivante (`seasonOfMoment`).
 *
 * Les ÉTOILES de saison se gagnent par missions (1 pour une facile ou moyenne,
 * 2 pour une difficile, 3 pour une d'Or, 5 pour la mission en duo) ; quatre
 * étoiles font une étape. Le parcours gratuit compte 40 étapes — ses
 * récompenses ne comportent JAMAIS de Meesh : elles se gagnent par la frappe.
 * La rangée SCEAU (10 Meeshes) ajoute un cosmétique toutes les quatre étapes,
 * sans aucun avantage de jeu.
 *
 * Terminer le parcours (étape 40) rend la coupe de saison, un badge daté et
 * `GLORY_POINTS.season` de Gloire — c'est ce que `seasonSettlement` dit, une fois.
 */

import { addDays, dayDiff } from './day-prng.js';
import { GLORY_POINTS } from './glory.js';
import { leagueWeekKey, leagueWeekOfMoment, type LeagueMoment } from './league.js';
import type { MissionDifficulty } from './missions.js';

export const SEASON_ONE_START = '2026-12-21';
export const SEASON_WEEKS = 8;
export const SEASON_DAYS = SEASON_WEEKS * 7;
export const SEASON_STEPS = 40;
export const SEASON_STARS_PER_STEP = 4;
/** En Meeshes. */
export const SEASON_SEAL_PRICE = 10;
/** Un cosmétique de la rangée Sceau toutes les quatre étapes. */
export const SEASON_SEAL_EVERY = 4;

/**
 * Les clés de thème, en boucle : une langue du modèle de traduction à chaque
 * saison. Le catalogue est une donnée de produit, tunable sans toucher la loi.
 */
export const SEASON_THEME_KEYS = [
  'language:fr',
  'language:es',
  'language:ar',
  'language:sw',
  'language:ja',
  'language:pt',
  'language:hi',
  'language:zh',
] as const;
export type SeasonThemeKey = (typeof SEASON_THEME_KEYS)[number];

export type SeasonCalendar = {
  readonly number: number;
  readonly startDay: string;
  /** Le dernier dimanche de la saison. */
  readonly endDay: string;
  readonly weekKeys: readonly string[];
  readonly themeKey: SeasonThemeKey;
};

const validSeason = (n: number): boolean => Number.isFinite(n) && Math.trunc(n) >= 1;

export function seasonCalendar(number: number): SeasonCalendar | null {
  if (!validSeason(number)) return null;
  const n = Math.trunc(number);
  const startDay = addDays(SEASON_ONE_START, (n - 1) * SEASON_DAYS);
  return {
    number: n,
    startDay,
    endDay: addDays(startDay, SEASON_DAYS - 1),
    weekKeys: Array.from({ length: SEASON_WEEKS }, (_, week) => addDays(startDay, week * 7)),
    themeKey: SEASON_THEME_KEYS[(n - 1) % SEASON_THEME_KEYS.length]!,
  };
}

/** Le numéro de la saison qui contient ce jour, `null` avant la première. */
export function seasonAt(dayKey: string): number | null {
  const elapsed = dayDiff(SEASON_ONE_START, dayKey);
  return elapsed < 0 ? null : Math.floor(elapsed / SEASON_DAYS) + 1;
}

/** La semaine de saison de 1 à 8, `null` avant la première saison. */
export function seasonWeek(dayKey: string): number | null {
  const elapsed = dayDiff(SEASON_ONE_START, dayKey);
  return elapsed < 0 ? null : Math.floor((elapsed % SEASON_DAYS) / 7) + 1;
}

/** La saison d'un moment, la fermeture du dimanche 20 h comprise. */
export const seasonOfMoment = (moment: LeagueMoment): number | null => seasonAt(leagueWeekOfMoment(moment));

export const isSeasonOpen = (params: { readonly season: number; readonly dayKey: string }): boolean =>
  seasonAt(params.dayKey) === Math.trunc(params.season);

/** L'état d'une saison : terminée, en cours, à venir — les valeurs de `GameArchiveStatus`. */
export type SeasonTense = 'past' | 'current' | 'upcoming';

const TENSE_RANK: Readonly<Record<SeasonTense, number>> = { upcoming: 0, current: 1, past: 2 };

/**
 * L'ÉTAT D'UNE SAISON À UN MOMENT (#10131) — lu sur ses dates (`startDay`, `endDay`) et la semaine de ligue du moment :
 * la fermeture du dimanche 20 h ouvre la semaine suivante, donc la saison qui commence le lundi est en cours dès la
 * veille à 20 h, et se termine le dimanche 20 h de sa dernière semaine. La passerelle sert l'état ainsi
 * (`GameArchiveService`) ; un client le RECALCULE sur sa copie hors ligne avec son horloge (`liveSeasonTense`).
 */
export function seasonTenseAt(dates: { readonly startDay: string; readonly endDay: string }, moment: LeagueMoment): SeasonTense {
  const week = leagueWeekOfMoment(moment);
  if (week < leagueWeekKey(dates.startDay)) return 'upcoming';
  return week > leagueWeekKey(dates.endDay) ? 'past' : 'current';
}

/**
 * L'état d'une COPIE (#10131) : celui que le serveur a servi, avancé par l'horloge locale — une saison « à venir »
 * gardée hors ligne passe « en cours » le jour de son ouverture, puis « terminée », sans réseau. Une horloge en
 * retard ne le fait jamais RECULER : l'état servi est un plancher.
 */
export function liveSeasonTense(
  copy: { readonly served: SeasonTense; readonly startDay: string; readonly endDay: string },
  moment: LeagueMoment,
): SeasonTense {
  const computed = seasonTenseAt(copy, moment);
  return TENSE_RANK[computed] > TENSE_RANK[copy.served] ? computed : copy.served;
}

/**
 * La saison À VENIR (#10014) : avant l'ouverture de la première, la saison 1 —
 * son numéro, son thème, ses dates — pour que l'écran dise « la saison 1 ouvre
 * le lundi 21 décembre » plutôt qu'un vide. `null` dès qu'une saison est
 * ouverte : elles s'enchaînent sans trou, il n'y a plus d'attente à annoncer.
 * Une donnée de CALENDRIER, la même pour tous : rien de la présence de quiconque.
 */
export function upcomingSeason(moment: LeagueMoment): SeasonCalendar | null {
  return seasonOfMoment(moment) === null ? seasonCalendar(1) : null;
}

export type SeasonStarSource = MissionDifficulty | 'duo';

const STARS: Readonly<Record<SeasonStarSource, number>> = { easy: 1, medium: 1, hard: 2, gold: 3, duo: 5 };

export const seasonStarsForMission = (source: SeasonStarSource): number => STARS[source];

export type SeasonProgress = {
  readonly stars: number;
  /** De 0 à 40. */
  readonly steps: number;
  readonly starsToNext: number;
  /** Fraction de l'étape en cours ; `1` une fois le parcours terminé. */
  readonly progress: number;
  readonly completed: boolean;
};

export function seasonProgress(params: { readonly stars: number }): SeasonProgress {
  const stars = Number.isFinite(params.stars) ? Math.max(0, Math.trunc(params.stars)) : 0;
  const steps = Math.min(SEASON_STEPS, Math.floor(stars / SEASON_STARS_PER_STEP));
  const completed = steps >= SEASON_STEPS;
  const inStep = stars % SEASON_STARS_PER_STEP;
  return {
    stars,
    steps,
    starsToNext: completed ? 0 : SEASON_STARS_PER_STEP - inStep,
    progress: completed ? 1 : inStep / SEASON_STARS_PER_STEP,
    completed,
  };
}

export type SeasonRewardKind = 'points' | 'fragment' | 'freeze' | 'season-cup';
export type SeasonReward = { readonly kind: SeasonRewardKind; readonly amount: number };

/** Les points d'une étape ordinaire. */
export const SEASON_STEP_POINTS = 100;

/**
 * La récompense GRATUITE d'une étape : des points (ceux de la saison, bornés par
 * `season-schedule.ts`, #10016) ; UN fragment d'étoile (`star-fragments.ts`)
 * toutes les cinq étapes, un gel de Flamme toutes les dix, la coupe à la 40e.
 */
export function seasonStepReward(step: number, stepPoints: number = SEASON_STEP_POINTS): SeasonReward | null {
  if (!Number.isInteger(step) || step < 1 || step > SEASON_STEPS) return null;
  if (step === SEASON_STEPS) return { kind: 'season-cup', amount: 1 };
  if (step % 10 === 0) return { kind: 'freeze', amount: 1 };
  if (step % 5 === 0) return { kind: 'fragment', amount: 1 };
  return { kind: 'points', amount: Number.isInteger(stepPoints) && stepPoints > 0 ? stepPoints : SEASON_STEP_POINTS };
}

/** Le cosmétique de la rangée Sceau à cette étape, `null` hors des étapes marquées. */
export function seasonSealReward(season: number, step: number): { readonly cosmeticKey: string } | null {
  if (!Number.isInteger(step) || step < 1 || step > SEASON_STEPS || step % SEASON_SEAL_EVERY !== 0) return null;
  return { cosmeticKey: `season-${Math.trunc(season)}.seal-${step / SEASON_SEAL_EVERY}` };
}

export function canBuySeal(params: {
  readonly balance: number;
  readonly owned: boolean;
}): { readonly allowed: true } | { readonly allowed: false; readonly reason: 'already-owned' | 'insufficient-balance' } {
  if (params.owned) return { allowed: false, reason: 'already-owned' };
  if (!(params.balance >= SEASON_SEAL_PRICE)) return { allowed: false, reason: 'insufficient-balance' };
  return { allowed: true };
}

export type SeasonClaim =
  | { readonly allowed: true; readonly reward: SeasonReward; readonly seal: { readonly cosmeticKey: string } | null }
  | { readonly allowed: false; readonly reason: 'out-of-range' | 'locked' | 'already-claimed' };

export function claimSeasonStep(params: {
  readonly season: number;
  readonly step: number;
  readonly stepsReached: number;
  readonly claimed: readonly number[];
  readonly sealOwned: boolean;
  /** Les points d'une étape ordinaire de CETTE saison (calendrier servi, #10016) ; absent, la loi. */
  readonly stepPoints?: number;
}): SeasonClaim {
  const reward = seasonStepReward(params.step, params.stepPoints);
  if (reward === null) return { allowed: false, reason: 'out-of-range' };
  if (params.claimed.includes(params.step)) return { allowed: false, reason: 'already-claimed' };
  if (params.step > params.stepsReached) return { allowed: false, reason: 'locked' };
  return { allowed: true, reward, seal: params.sealOwned ? seasonSealReward(params.season, params.step) : null };
}

export type SeasonSettlement = {
  readonly completed: boolean;
  /** `GLORY_POINTS.season` au parcours terminé. */
  readonly glory: number;
  readonly cup: boolean;
  /** Le badge daté : `season.<n>`, `null` sans parcours terminé. */
  readonly badgeKey: string | null;
};

export function seasonSettlement(params: { readonly season: number; readonly stepsReached: number }): SeasonSettlement {
  const completed = params.stepsReached >= SEASON_STEPS;
  return completed
    ? { completed, glory: GLORY_POINTS.season, cup: true, badgeKey: `season.${Math.trunc(params.season)}` }
    : { completed, glory: 0, cup: false, badgeKey: null };
}
