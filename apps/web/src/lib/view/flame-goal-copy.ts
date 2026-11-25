import type { GameServedFlameGoal } from '@meeshy/shared/types/game';
import { GAME_ERROR_CODES } from '@meeshy/shared/types/game-routes';
import { flameGoalNextSeenKey } from '@meeshy/shared/utils/game/flame-goal';

import { isRec } from '@/lib/api/game-guards';
import { translateGame } from '@/lib/i18n-game-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { daysLabel, gameErrorMessage } from '@/lib/view/game-copy';

/**
 * CE QUE L'OBJECTIF DE FLAMME DIT (#17379, #20521) — le choix du premier jour, l'objectif en cours, le signe des
 * aïeux quand il est atteint, et les refus. Ses phrases vivent dans la partie `concept` du catalogue : seule la fiche
 * de la Flamme (Progression) les lit.
 *
 * Un objectif raté ne se dit pas : la passerelle cesse de le servir, et la carte revient à ce qu'elle était.
 */

type Language = InterfaceLanguage;

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0;

type Current = NonNullable<GameServedFlameGoal['current']>;

const readCurrent = (value: unknown): Current | null | undefined => {
  if (value === null) return null;
  if (!isRec(value)) return undefined;
  const { target, remaining, reached, next } = value;
  if (!isCount(target) || !isCount(remaining) || typeof reached !== 'boolean') return undefined;
  if (next !== null && !isCount(next)) return undefined;
  return { target, remaining, reached, next };
};

/** L'objectif servi lu par le web : `null` devant un serveur antérieur, sans rien à dire, ou une forme illisible. */
export const readFlameGoal = (value: unknown): GameServedFlameGoal | null => {
  if (!isRec(value)) return null;
  const { offer } = value;
  if (!Array.isArray(offer) || !offer.every(isCount)) return null;
  const current = readCurrent(value.current);
  return current === undefined ? null : { offer: [...offer], current };
};

/** Le signe de l'objectif atteint a déjà été fermé : sa clé (`flameGoalNextSeenKey`) est dans `game.guideSeen`. */
export const flameGoalSignSeen = (goal: unknown, guideSeen: readonly string[]): boolean => {
  const current = readFlameGoal(goal)?.current;
  return current?.reached === true && guideSeen.includes(flameGoalNextSeenKey(current.target));
};

export type FlameGoalView =
  | { readonly kind: 'choose'; readonly offer: readonly number[] }
  | { readonly kind: 'running'; readonly target: number; readonly remaining: number }
  | { readonly kind: 'reached'; readonly target: number; readonly next: number | null };

/**
 * Ce que la carte montre : les choix du premier jour, ce qu'il reste, ou le signe des aïeux avec la marche suivante —
 * jusqu'à ce que le joueur le ferme (`signSeen`, la clé `flameGoalNextSeenKey` dans `game.guideSeen`).
 */
export function flameGoalView(goal: GameServedFlameGoal | null, signSeen: boolean): FlameGoalView | null {
  if (goal === null) return null;
  const { current } = goal;
  if (current === null) return goal.offer.length === 0 ? null : { kind: 'choose', offer: goal.offer };
  if (!current.reached) return { kind: 'running', target: current.target, remaining: current.remaining };
  return signSeen ? null : { kind: 'reached', target: current.target, next: current.next };
}

export const flameGoalLine = (view: FlameGoalView, language: Language = currentInterfaceLanguage()): string => {
  switch (view.kind) {
    case 'choose':
      return translateGame(language, 'game.flame_panel.goal_intro');
    case 'running':
      return translateGame(language, 'game.flame_panel.goal_running', { target: daysLabel(view.target, language), remaining: daysLabel(view.remaining, language) });
    case 'reached':
      return translateGame(language, 'game.flame_panel.goal_reached', { days: daysLabel(view.target, language) });
  }
};

export const flameGoalNextAction = (days: number, language: Language = currentInterfaceLanguage()): string =>
  translateGame(language, 'game.flame_panel.goal_next', { days: daysLabel(days, language) });

type GoalRefusalKey = 'game.error.flame_goal.not_offered' | 'game.error.flame_goal.no_flame';

const GOAL_REFUSALS: Readonly<Record<string, GoalRefusalKey>> = {
  'not-offered': 'game.error.flame_goal.not_offered',
  'no-flame': 'game.error.flame_goal.no_flame',
};

/** Le refus d'un objectif dit sa raison (`ApiError.reason`) ; une raison inconnue garde la phrase générale du refus. */
export const flameGoalRefusal = (reason: string | undefined, language: Language = currentInterfaceLanguage()): string => {
  const key = Object.entries(GOAL_REFUSALS).find(([served]) => served === reason)?.[1];
  return key === undefined ? gameErrorMessage(GAME_ERROR_CODES.flameGoalNotAllowed, language) : translateGame(language, key);
};
