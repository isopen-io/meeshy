/**
 * LE RALLUMAGE PAR L'EFFORT (#20455, tranche 1 de #17371) — dans la fenêtre de rallumage, deux rêves complets
 * rallument la Flamme sans payer ; les 3 Meeshes de `canRelight` restent le raccourci.
 * `docs/product/jeu-attraction-fidelite-2026-11.md` § 6.
 *
 * Un Rêve complet est le Rêve du jour tiré EN ENTIER (`isDreamWhole` : trois actes, ou l'acte unique du premier
 * Rêve) dont chaque acte est fait — la même condition que l'Offrande prête. La mission personnelle n'en fait pas
 * partie.
 *
 * La fenêtre est celle du rallumage payé : la Flamme s'éteint au deuxième jour sans geste, et se rallume ce jour-là
 * et le suivant. Seuls comptent les rêves des journées d'APRÈS le dernier jour actif de la série perdue.
 *
 * La série rendue est la série perdue PLUS les jours rejoués depuis la rupture : le joueur qui a fait deux rêves
 * complets a joué ces deux jours, et seul le jour manqué est pardonné.
 *
 * Ce rallumage ne consomme pas le rallumage payé du mois : il se gagne, il ne s'achète pas.
 */

import { addDays, dayDiff } from './day-prng.js';
import { FLAME_RELIGHT_WINDOW_DAYS } from './flame.js';
import { isDreamWhole, FULL_DREAM_ACTS } from './missions.js';

export const FLAME_EFFORT_RELIGHT_DREAMS = 2;

/** Un acte du Rêve d'une journée de jeu, tel que la passerelle le relit. */
export type DreamActRow = { readonly dayKey: string; readonly slot: number; readonly completed: boolean };

/** Les journées dont le Rêve est complet, triées, une fois chacune. */
export function wholeDreamDays(rows: readonly DreamActRow[]): readonly string[] {
  const acts = rows.filter((row) => row.slot >= 0 && row.slot < FULL_DREAM_ACTS);
  const days = [...new Set(acts.map((row) => row.dayKey))].sort();
  return days.filter((day) => {
    const ofDay = acts.filter((row) => row.dayKey === day);
    return isDreamWhole(ofDay.map((row) => row.slot)) && ofDay.every((row) => row.completed);
  });
}

export type EffortRelightDecision =
  | { readonly allowed: true; readonly dreamsDone: number; readonly dreamsNeeded: number; readonly closesOn: string }
  | {
      readonly allowed: false;
      readonly reason: 'no-streak' | 'not-extinguished' | 'window-closed' | 'dreams-missing';
      readonly dreamsDone: number;
      readonly dreamsNeeded: number;
      /** Le dernier jour où le rallumage reste possible ; `null` sans série à rendre. */
      readonly closesOn: string | null;
    };

const positive = (value: number): number => (Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0);

/** Deux rêves complets, d'après la rupture, avant la fin de la fenêtre de rallumage. */
export function canRelightByEffort(params: {
  /** Le dernier jour actif de la série perdue. */
  readonly brokenLastDay: string | null;
  readonly streakBeforeBreak: number;
  readonly today: string;
  /** Les journées de Rêve complet (`wholeDreamDays`). */
  readonly dreamDays: readonly string[];
}): EffortRelightDecision {
  const dreamsNeeded = FLAME_EFFORT_RELIGHT_DREAMS;
  if (params.brokenLastDay === null || positive(params.streakBeforeBreak) === 0) {
    return { allowed: false, reason: 'no-streak', dreamsDone: 0, dreamsNeeded, closesOn: null };
  }
  const brokenLastDay = params.brokenLastDay;
  const closesOn = addDays(brokenLastDay, 1 + FLAME_RELIGHT_WINDOW_DAYS);
  const dreamsDone = new Set(params.dreamDays.filter((day) => day > brokenLastDay && day <= params.today)).size;
  const refuse = (reason: 'not-extinguished' | 'window-closed' | 'dreams-missing'): EffortRelightDecision => ({
    allowed: false,
    reason,
    dreamsDone,
    dreamsNeeded,
    closesOn,
  });
  const gap = dayDiff(brokenLastDay, params.today);
  if (gap <= 1) return refuse('not-extinguished');
  if (gap > 1 + FLAME_RELIGHT_WINDOW_DAYS) return refuse('window-closed');
  if (dreamsDone < dreamsNeeded) return refuse('dreams-missing');
  return { allowed: true, dreamsDone, dreamsNeeded, closesOn };
}

/** Ce que le bloc `flame` dit du rallumage par l'effort (#20471) : combien de rêves complets sont faits, combien il en faut, et le dernier jour possible. */
export type ServedEffortRelight = {
  /** Les jours de la Flamme éteinte, qui reviennent avec elle. */
  readonly lostDays: number;
  readonly dreamsDone: number;
  readonly dreamsNeeded: number;
  readonly closesOn: string;
  /** Jours restants après aujourd'hui : `0`, c'est aujourd'hui ou jamais ; `1`, il reste demain. */
  readonly daysLeft: number;
};

/**
 * Le rallumage par l'effort tel que le bloc le sert : seulement quand la Flamme éteinte peut ENCORE se rallumer ainsi
 * (motif `dreams-missing`). Une Flamme vive, sans série, hors fenêtre, ou déjà rallumée ne dit rien.
 */
export function servedEffortRelight(params: Parameters<typeof canRelightByEffort>[0]): ServedEffortRelight | null {
  const verdict = canRelightByEffort(params);
  if (verdict.allowed || verdict.reason !== 'dreams-missing' || verdict.closesOn === null) return null;
  return {
    lostDays: positive(params.streakBeforeBreak),
    dreamsDone: verdict.dreamsDone,
    dreamsNeeded: verdict.dreamsNeeded,
    closesOn: verdict.closesOn,
    daysLeft: Math.max(0, dayDiff(params.today, verdict.closesOn)),
  };
}

/**
 * La série rendue. Si le joueur a repris une série depuis la rupture, elle s'ajoute à la série perdue et son
 * dernier jour actif est gardé. Sinon, la série perdue revient avec hier pour dernier jour : le geste du jour s'y
 * ajoutera, comme après un rallumage payé (`relightFlame`).
 */
export function relightByEffort(params: {
  readonly brokenLastDay: string;
  readonly streakBeforeBreak: number;
  readonly today: string;
  readonly lastActiveDay: string | null;
  readonly currentStreak: number;
}): { readonly streak: number; readonly lastActiveDay: string } {
  const lost = positive(params.streakBeforeBreak);
  if (params.lastActiveDay !== null && params.lastActiveDay > params.brokenLastDay) {
    return { streak: lost + positive(params.currentStreak), lastActiveDay: params.lastActiveDay };
  }
  return { streak: lost, lastActiveDay: addDays(params.today, -1) };
}
