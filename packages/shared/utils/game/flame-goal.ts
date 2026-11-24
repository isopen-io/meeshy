/**
 * L'OBJECTIF DE FLAMME (#20512, tranche 1 de #17379) — un engagement choisi tient mieux qu'un objectif imposé.
 * `docs/product/jeu-attraction-fidelite-2026-11.md` § 6 (« Objectif de Flamme choisi »).
 *
 * Au premier jour d'une Flamme, le joueur choisit 7, 14 ou 30 jours, ou rien : passé ce jour, sans choix, rien
 * n'est plus proposé jusqu'à la prochaine Flamme — ne rien choisir n'a donc rien à retenir. L'objectif atteint
 * déclenche un signe des aïeux et propose la marche suivante de l'échelle, qui prolonge les choix par les formes
 * de la Flamme (100 et 365 jours).
 *
 * Rater l'objectif ne retire rien : un objectif dont la Flamme s'est éteinte, ou a recommencé depuis le choix, tombe
 * et ne se sert plus. La hauteur de la Flamme ne suffit pas à le dire — choisi au premier jour, un objectif ne verrait
 * pas une Flamme repartie à 1 —, donc le geste qui la casse le marque (`flameGoalAfterGesture`) et le rallumage, qui
 * rend la même Flamme, le rend (`flameGoalAfterRelight`). La loi est pure, sans horloge : les jours sont des clés.
 */

import { FLAME_FORMS, type FlameOutcome } from './flame.js';

export const FLAME_GOAL_FIRST_CHOICES = [7, 14, 30] as const;

/** Les choix du premier jour, puis les formes de la Flamme au-delà : 7, 14, 30, 100, 365. */
export const FLAME_GOAL_LADDER: readonly number[] = [
  ...FLAME_GOAL_FIRST_CHOICES,
  ...FLAME_FORMS.map((form) => form.minDays).filter((days) => days > Math.max(...FLAME_GOAL_FIRST_CHOICES)),
];

/**
 * L'objectif retenu : les jours de Flamme visés, ceux du jour du choix, et le jour où la Flamme s'est cassée depuis
 * (`null` ou absent tant qu'elle tient).
 */
export type FlameGoal = {
  readonly target: number;
  readonly chosenAtStreak: number;
  readonly brokenOn?: string | null;
};

export type FlameGoalState =
  | { readonly status: 'none' }
  | { readonly status: 'running'; readonly target: number; readonly remaining: number }
  | { readonly status: 'reached'; readonly target: number; readonly next: number | null }
  | { readonly status: 'lapsed'; readonly target: number };

const days0 = (value: number): number => (Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0);

/** La marche au-dessus de `target` ; `null` après la dernière. */
export const nextFlameGoal = (target: number): number | null =>
  FLAME_GOAL_LADDER.find((days) => days > days0(target)) ?? null;

export function flameGoalState(params: { readonly goal: FlameGoal | null; readonly streak: number }): FlameGoalState {
  if (params.goal === null) return { status: 'none' };
  const target = days0(params.goal.target);
  if (target === 0) return { status: 'none' };
  const streak = days0(params.streak);
  const broken = typeof params.goal.brokenOn === 'string';
  if (broken || streak === 0 || streak < days0(params.goal.chosenAtStreak)) return { status: 'lapsed', target };
  if (streak >= target) return { status: 'reached', target, next: nextFlameGoal(target) };
  return { status: 'running', target, remaining: target - streak };
}

/** Ce que le joueur peut choisir aujourd'hui : les trois choix au premier jour, la marche suivante une fois l'objectif atteint. */
export function flameGoalOffer(params: { readonly goal: FlameGoal | null; readonly streak: number }): readonly number[] {
  const state = flameGoalState(params);
  if (state.status === 'running') return [];
  if (state.status === 'reached') return state.next === null ? [] : [state.next];
  return days0(params.streak) === 1 ? FLAME_GOAL_FIRST_CHOICES : [];
}

export function canChooseFlameGoal(params: {
  readonly goal: FlameGoal | null;
  readonly streak: number;
  readonly target: number;
}): { readonly allowed: true } | { readonly allowed: false; readonly reason: 'no-flame' | 'not-offered' } {
  if (days0(params.streak) === 0) return { allowed: false, reason: 'no-flame' };
  if (!flameGoalOffer(params).includes(params.target)) return { allowed: false, reason: 'not-offered' };
  return { allowed: true };
}

/** L'objectif à retenir pour un choix accepté par `canChooseFlameGoal`. */
export const chooseFlameGoal = (params: { readonly streak: number; readonly target: number }): FlameGoal => ({
  target: days0(params.target),
  chosenAtStreak: days0(params.streak),
});

/** Ce que devient l'objectif après le geste du jour : la Flamme cassée (repartie à 1) le fait tomber. */
export function flameGoalAfterGesture(params: {
  readonly goal: FlameGoal | null;
  readonly outcome: FlameOutcome;
  readonly today: string;
}): FlameGoal | null {
  if (params.goal === null || params.outcome !== 'broken') return params.goal;
  return { ...params.goal, brokenOn: params.today };
}

/** La Flamme rallumée est celle d'avant la rupture : son objectif repart avec elle. */
export const flameGoalAfterRelight = (goal: FlameGoal | null): FlameGoal | null =>
  goal === null ? null : { ...goal, brokenOn: null };

/** Le geste qui porte la Flamme de « en cours » à « atteint » déclenche le signe des aïeux, une seule fois. */
export function flameGoalReachedBy(params: {
  readonly goal: FlameGoal | null;
  readonly streakBefore: number;
  readonly streakAfter: number;
}): boolean {
  const before = flameGoalState({ goal: params.goal, streak: params.streakBefore });
  const after = flameGoalState({ goal: params.goal, streak: params.streakAfter });
  return before.status === 'running' && after.status === 'reached';
}

/** Ce que le bloc `flame` dit de l'objectif ; `null` quand il n'y a rien à dire. */
export type ServedFlameGoal = {
  readonly offer: readonly number[];
  readonly current: {
    readonly target: number;
    readonly remaining: number;
    readonly reached: boolean;
    readonly next: number | null;
  } | null;
};

export function servedFlameGoal(params: { readonly goal: FlameGoal | null; readonly streak: number }): ServedFlameGoal | null {
  const state = flameGoalState(params);
  const offer = flameGoalOffer(params);
  const current =
    state.status === 'running'
      ? { target: state.target, remaining: state.remaining, reached: false, next: null }
      : state.status === 'reached'
        ? { target: state.target, remaining: 0, reached: true, next: state.next }
        : null;
  if (current === null && offer.length === 0) return null;
  return { offer, current };
}

/** La clé de guide qui ferme la proposition de la marche suivante, une fois par objectif atteint (`game.guideSeen`). */
export const flameGoalNextSeenKey = (reachedTarget: number): string => `flame-goal-next-${days0(reachedTarget)}`;
