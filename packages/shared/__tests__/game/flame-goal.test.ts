/**
 * L'objectif de Flamme (#20512, tranche 1 de #17379) : au premier jour d'une Flamme, le joueur choisit 7, 14 ou
 * 30 jours, ou rien ; l'objectif atteint déclenche un signe des aïeux et propose le suivant ; le rater ne retire rien.
 */

import { describe, it, expect } from 'vitest';
import {
  FLAME_GOAL_FIRST_CHOICES,
  FLAME_GOAL_LADDER,
  canChooseFlameGoal,
  chooseFlameGoal,
  flameGoalNextSeenKey,
  flameGoalOffer,
  flameGoalReachedBy,
  flameGoalState,
  nextFlameGoal,
  servedFlameGoal,
} from '../../utils/game/flame-goal';

const goal = (target: number, chosenAtStreak = 1) => ({ target, chosenAtStreak });

describe('les choix', () => {
  it('le premier jour propose 7, 14 ou 30 jours', () => {
    expect(FLAME_GOAL_FIRST_CHOICES).toEqual([7, 14, 30]);
  });

  it('l’échelle prolonge les choix par les formes de la Flamme au-delà de 30 jours', () => {
    expect(FLAME_GOAL_LADDER).toEqual([7, 14, 30, 100, 365]);
  });

  it('l’objectif suivant est la marche au-dessus de celle atteinte', () => {
    expect(nextFlameGoal(7)).toBe(14);
    expect(nextFlameGoal(14)).toBe(30);
    expect(nextFlameGoal(30)).toBe(100);
    expect(nextFlameGoal(100)).toBe(365);
  });

  it('après la dernière marche, rien ne suit', () => {
    expect(nextFlameGoal(365)).toBeNull();
  });
});

describe('flameGoalState — l’état d’un objectif', () => {
  it('sans objectif, rien', () => {
    expect(flameGoalState({ goal: null, streak: 4 })).toEqual({ status: 'none' });
  });

  it('en cours, il dit combien de jours restent', () => {
    expect(flameGoalState({ goal: goal(7), streak: 4 })).toEqual({ status: 'running', target: 7, remaining: 3 });
  });

  it('atteint, il dit l’objectif suivant', () => {
    expect(flameGoalState({ goal: goal(7), streak: 7 })).toEqual({ status: 'reached', target: 7, next: 14 });
    expect(flameGoalState({ goal: goal(7), streak: 9 })).toEqual({ status: 'reached', target: 7, next: 14 });
  });

  it('une Flamme éteinte fait tomber l’objectif, sans rien retirer d’autre', () => {
    expect(flameGoalState({ goal: goal(14), streak: 0 })).toEqual({ status: 'lapsed', target: 14 });
  });

  it('une Flamme recommencée depuis le choix fait tomber l’objectif', () => {
    expect(flameGoalState({ goal: goal(14, 5), streak: 2 })).toEqual({ status: 'lapsed', target: 14 });
  });

  it('un objectif illisible ne dit rien', () => {
    expect(flameGoalState({ goal: goal(Number.NaN), streak: 3 })).toEqual({ status: 'none' });
    expect(flameGoalState({ goal: goal(0), streak: 3 })).toEqual({ status: 'none' });
  });
});

describe('flameGoalOffer — ce que le joueur peut choisir aujourd’hui', () => {
  it('au premier jour d’une Flamme sans objectif : 7, 14 ou 30', () => {
    expect(flameGoalOffer({ goal: null, streak: 1 })).toEqual([7, 14, 30]);
  });

  it('au premier jour d’une Flamme recommencée, l’ancien objectif tombé ne gêne pas', () => {
    expect(flameGoalOffer({ goal: goal(30, 3), streak: 1 })).toEqual([7, 14, 30]);
  });

  it('passé le premier jour, sans objectif, rien n’est proposé', () => {
    expect(flameGoalOffer({ goal: null, streak: 2 })).toEqual([]);
  });

  it('sans Flamme, rien', () => {
    expect(flameGoalOffer({ goal: null, streak: 0 })).toEqual([]);
  });

  it('pendant un objectif en cours, rien', () => {
    expect(flameGoalOffer({ goal: goal(7), streak: 3 })).toEqual([]);
  });

  it('l’objectif atteint propose le suivant, et lui seul', () => {
    expect(flameGoalOffer({ goal: goal(7), streak: 7 })).toEqual([14]);
  });

  it('la dernière marche atteinte ne propose plus rien', () => {
    expect(flameGoalOffer({ goal: goal(365, 1), streak: 365 })).toEqual([]);
  });
});

describe('canChooseFlameGoal et chooseFlameGoal — le choix', () => {
  it('accepte un choix proposé et retient la Flamme du jour du choix', () => {
    expect(canChooseFlameGoal({ goal: null, streak: 1, target: 14 })).toEqual({ allowed: true });
    expect(chooseFlameGoal({ streak: 1, target: 14 })).toEqual({ target: 14, chosenAtStreak: 1 });
  });

  it('refuse une durée hors des choix proposés', () => {
    expect(canChooseFlameGoal({ goal: null, streak: 1, target: 10 })).toEqual({ allowed: false, reason: 'not-offered' });
  });

  it('refuse un choix passé le premier jour', () => {
    expect(canChooseFlameGoal({ goal: null, streak: 4, target: 7 })).toEqual({ allowed: false, reason: 'not-offered' });
  });

  it('refuse un choix sans Flamme', () => {
    expect(canChooseFlameGoal({ goal: null, streak: 0, target: 7 })).toEqual({ allowed: false, reason: 'no-flame' });
  });

  it('accepte l’objectif suivant une fois le précédent atteint', () => {
    expect(canChooseFlameGoal({ goal: goal(7), streak: 8, target: 14 })).toEqual({ allowed: true });
    expect(chooseFlameGoal({ streak: 8, target: 14 })).toEqual({ target: 14, chosenAtStreak: 8 });
  });
});

describe('flameGoalReachedBy — le geste qui déclenche le signe des aïeux', () => {
  it('le geste qui porte la Flamme à l’objectif le déclenche', () => {
    expect(flameGoalReachedBy({ goal: goal(7), streakBefore: 6, streakAfter: 7 })).toBe(true);
  });

  it('un rallumage qui franchit l’objectif le déclenche aussi', () => {
    expect(flameGoalReachedBy({ goal: goal(7, 2), streakBefore: 3, streakAfter: 9 })).toBe(true);
  });

  it('un objectif déjà atteint ne se déclenche pas deux fois', () => {
    expect(flameGoalReachedBy({ goal: goal(7), streakBefore: 7, streakAfter: 8 })).toBe(false);
  });

  it('un geste qui n’y arrive pas encore ne déclenche rien', () => {
    expect(flameGoalReachedBy({ goal: goal(7), streakBefore: 4, streakAfter: 5 })).toBe(false);
  });

  it('sans objectif, ou objectif tombé, rien', () => {
    expect(flameGoalReachedBy({ goal: null, streakBefore: 6, streakAfter: 7 })).toBe(false);
    expect(flameGoalReachedBy({ goal: goal(7, 5), streakBefore: 0, streakAfter: 1 })).toBe(false);
  });
});

describe('servedFlameGoal — ce que le bloc `flame` en dit', () => {
  it('le premier jour sans objectif, les trois choix', () => {
    expect(servedFlameGoal({ goal: null, streak: 1 })).toEqual({ offer: [7, 14, 30], current: null });
  });

  it('un objectif en cours, sa cible et les jours restants', () => {
    expect(servedFlameGoal({ goal: goal(14), streak: 10 })).toEqual({
      offer: [],
      current: { target: 14, remaining: 4, reached: false, next: null },
    });
  });

  it('un objectif atteint, et le suivant proposé', () => {
    expect(servedFlameGoal({ goal: goal(14), streak: 14 })).toEqual({
      offer: [30],
      current: { target: 14, remaining: 0, reached: true, next: 30 },
    });
  });

  it('rien à dire : rien de servi', () => {
    expect(servedFlameGoal({ goal: null, streak: 5 })).toBeNull();
    expect(servedFlameGoal({ goal: goal(14, 6), streak: 3 })).toBeNull();
  });
});

describe('flameGoalNextSeenKey — la proposition suivante se ferme une fois', () => {
  it('une clé de guide par objectif atteint', () => {
    expect(flameGoalNextSeenKey(7)).toBe('flame-goal-next-7');
  });
});
