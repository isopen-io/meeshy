/**
 * LA FLAMME (#9373) — la série de jours existante prend cinq formes, un bonus
 * sur les missions, des gels qui protègent un jour manqué, un rallumage dans
 * les 48 h. `docs/product/jeu-meeshy-conception.html` § II.6.
 *
 * Les jours sont des clés `AAAA-MM-JJ` dans le fuseau de l'utilisateur : la
 * transition est pure, sans horloge. La fenêtre de rallumage de 48 h se lit en
 * jours calendaires — la Flamme s'éteint au début du deuxième jour sans geste,
 * et on peut la rallumer ce jour-là et le suivant.
 */

import { addDays, dayDiff, monthOf } from './day-prng.js';

export const FLAME_FORMS = [
  { key: 'braise', minDays: 1 },
  { key: 'flamme', minDays: 7 },
  { key: 'brasier', minDays: 30 },
  { key: 'astre', minDays: 100 },
  { key: 'soleil', minDays: 365 },
] as const;

export type FlameFormKey = (typeof FLAME_FORMS)[number]['key'];

export const FLAME_FREEZE_MAX = 2;
/** En Meeshes. */
export const FLAME_FREEZE_PRICE = 1;
export const FLAME_RELIGHT_PRICE = 3;
/** Jours calendaires de fenêtre après l'extinction (48 h). */
export const FLAME_RELIGHT_WINDOW_DAYS = 2;
/** Bonus de Flamme : 2 % par jour de série, plafond 50 %. */
export const FLAME_BONUS_PERCENT_PER_DAY = 2;
export const FLAME_BONUS_PERCENT_MAX = 50;

const days0 = (value: number): number => (Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0);

/** `null` sans série. */
export const flameForm = (streakDays: number): FlameFormKey | null =>
  FLAME_FORMS.filter((form) => days0(streakDays) >= form.minDays).at(-1)?.key ?? null;

/** Le bonus en pour cent entier — la forme exacte que les récompenses emploient. */
export const flameBonusPercent = (streakDays: number): number =>
  Math.min(FLAME_BONUS_PERCENT_MAX, FLAME_BONUS_PERCENT_PER_DAY * days0(streakDays));

/** min(0,5 ; 0,02 × jours). */
export const flameBonus = (streakDays: number): number => flameBonusPercent(streakDays) / 100;

export function canBuyFreeze(params: { readonly freezes: number; readonly balance: number }):
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: 'at-maximum' | 'insufficient-balance' } {
  if (days0(params.freezes) >= FLAME_FREEZE_MAX) return { allowed: false, reason: 'at-maximum' };
  if (days0(params.balance) < FLAME_FREEZE_PRICE) return { allowed: false, reason: 'insufficient-balance' };
  return { allowed: true };
}

export type FlameOutcome = 'started' | 'same-day' | 'continued' | 'protected' | 'broken';

export type FlameTransition = {
  readonly outcome: FlameOutcome;
  readonly streak: number;
  readonly freezes: number;
  readonly freezesUsed: number;
  readonly missedDays: number;
  /** La série perdue quand la Flamme s'éteint, `0` sinon — c'est elle qu'un rallumage rend. */
  readonly lostStreak: number;
};

/**
 * Le jour où l'utilisateur AGIT : que devient la série ?
 *
 * Un gel couvre un jour manqué, et il est consommé AUTOMATIQUEMENT — mais
 * seulement si les gels couvrent TOUS les jours manqués. Partiellement
 * couverte, la Flamme s'éteint quand même : dépenser des gels pour rien serait
 * une perte sèche. La série part alors à 1 (aujourd'hui).
 */
export function advanceFlame(params: {
  readonly lastActiveDay: string | null;
  readonly today: string;
  readonly streak: number;
  readonly freezes: number;
}): FlameTransition {
  const streak = days0(params.streak);
  const freezes = days0(params.freezes);
  const unchanged = { streak, freezes, freezesUsed: 0, missedDays: 0, lostStreak: 0 };
  if (params.lastActiveDay === null) return { outcome: 'started', ...unchanged, streak: 1 };

  const gap = dayDiff(params.lastActiveDay, params.today);
  if (gap <= 0) return { outcome: 'same-day', ...unchanged };
  if (gap === 1) return { outcome: 'continued', ...unchanged, streak: streak + 1 };

  const missedDays = gap - 1;
  if (missedDays <= freezes) {
    return { outcome: 'protected', streak: streak + 1, freezes: freezes - missedDays, freezesUsed: missedDays, missedDays, lostStreak: 0 };
  }
  return { outcome: 'broken', streak: 1, freezes, freezesUsed: 0, missedDays, lostStreak: streak };
}

export type FlameStatus = 'none' | 'lit' | 'at-risk' | 'covered' | 'out';

/** L'état de la Flamme à l'ouverture, avant tout geste du jour. */
export function flameStatus(params: {
  readonly lastActiveDay: string | null;
  readonly today: string;
  readonly streak: number;
  readonly freezes: number;
}): FlameStatus {
  if (params.lastActiveDay === null || days0(params.streak) === 0) return 'none';
  const gap = dayDiff(params.lastActiveDay, params.today);
  if (gap <= 0) return 'lit';
  if (gap === 1) return 'at-risk';
  return gap - 1 <= days0(params.freezes) ? 'covered' : 'out';
}

export type RelightDecision =
  | { readonly allowed: true; readonly price: number }
  | {
      readonly allowed: false;
      readonly reason: 'no-streak' | 'not-extinguished' | 'window-closed' | 'monthly-limit' | 'insufficient-balance';
      readonly price: number;
    };

/** 3 Meeshes, dans les 48 h qui suivent l'extinction, une fois par mois. */
export function canRelight(params: {
  readonly lastActiveDay: string | null;
  readonly today: string;
  readonly streakBeforeBreak: number;
  readonly lastRelightDay: string | null;
  readonly balance: number;
}): RelightDecision {
  const refuse = (reason: Extract<RelightDecision, { allowed: false }>['reason']): RelightDecision => ({
    allowed: false,
    reason,
    price: FLAME_RELIGHT_PRICE,
  });
  if (params.lastActiveDay === null || days0(params.streakBeforeBreak) === 0) return refuse('no-streak');
  const gap = dayDiff(params.lastActiveDay, params.today);
  if (gap <= 1) return refuse('not-extinguished');
  if (gap > 1 + FLAME_RELIGHT_WINDOW_DAYS) return refuse('window-closed');
  if (params.lastRelightDay !== null && monthOf(params.lastRelightDay) === monthOf(params.today)) {
    return refuse('monthly-limit');
  }
  if (days0(params.balance) < FLAME_RELIGHT_PRICE) return refuse('insufficient-balance');
  return { allowed: true, price: FLAME_RELIGHT_PRICE };
}

/** La série d'avant la rupture, à poursuivre par le geste du jour. */
export const relightFlame = (params: { readonly today: string; readonly streakBeforeBreak: number }) => ({
  streak: days0(params.streakBeforeBreak),
  lastActiveDay: addDays(params.today, -1),
});
