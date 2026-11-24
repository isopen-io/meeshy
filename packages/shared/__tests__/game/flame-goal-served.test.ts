/**
 * L'objectif de Flamme se DIT (#20520, tranche passerelle de #17379) : le bloc `flame` porte ce qui se propose et
 * l'objectif retenu, et un client antérieur l'ignore.
 */

import { describe, it, expect } from 'vitest';
import { buildGameBlock, type GameBlockFacts } from '../../utils/game/game-block';
import { flameGoalRequestSchema, flameGoalResponseSchema, parseGameBlock, parseServedFlameGoal } from '../../types/game';
import { GAME_ERROR_CODES, GAME_ROUTES } from '../../types/game-routes';

const facts = (over: Partial<GameBlockFacts> = {}): GameBlockFacts => ({
  userId: 'u1',
  today: '2026-11-27',
  score: 1_000,
  levelRecord: 8,
  prestige: 0,
  glory: 0,
  mythic: false,
  mintedLifetime: 0,
  missionsDone: 0,
  flameRecord: 12,
  debitablePoints: 1_000,
  balance: 0,
  streak: 1,
  lastActiveDay: '2026-11-27',
  broken: null,
  freezes: 0,
  lastRelightDay: null,
  missions: [],
  rerollsUsedToday: 0,
  chestClaimed: false,
  chestReward: null,
  guideSeen: [],
  ...over,
});

describe('le bloc `flame` porte l’objectif', () => {
  it('au premier jour d’une Flamme, sans objectif : les trois choix, validés par le contrat', () => {
    const block = buildGameBlock(facts({ goal: null }));
    expect(parseGameBlock(block)?.flame.goal).toEqual({ offer: [7, 14, 30], current: null });
  });

  it('un objectif en cours dit ce qu’il reste', () => {
    const block = buildGameBlock(facts({ streak: 5, goal: { target: 7, chosenAtStreak: 1 } }));
    expect(block.flame.goal).toEqual({ offer: [], current: { target: 7, remaining: 2, reached: false, next: null } });
  });

  it('l’objectif atteint propose la marche suivante', () => {
    const block = buildGameBlock(facts({ streak: 14, goal: { target: 14, chosenAtStreak: 1 } }));
    expect(block.flame.goal).toEqual({ offer: [30], current: { target: 14, remaining: 0, reached: true, next: 30 } });
  });

  it('une Flamme éteinte fait tomber l’objectif : rien à dire', () => {
    const block = buildGameBlock(facts({ streak: 6, lastActiveDay: '2026-11-20', goal: { target: 7, chosenAtStreak: 1 } }));
    expect(block.flame.days).toBe(0);
    expect(block.flame).not.toHaveProperty('goal');
  });

  it('se tait passé le premier jour sans objectif, et devant une passerelle qui ne le lit pas', () => {
    expect(buildGameBlock(facts({ streak: 3, goal: null })).flame).not.toHaveProperty('goal');
    expect(buildGameBlock(facts()).flame).not.toHaveProperty('goal');
  });

  it('une forme illisible tombe seule, sans emporter le bloc', () => {
    const block = buildGameBlock(facts({ goal: null }));
    const parsed = parseGameBlock({ ...block, flame: { ...block.flame, goal: { offer: 'sept' } } });
    expect(parsed?.flame.goal).toBeUndefined();
    expect(parsed?.flame.days).toBe(1);
    expect(parseServedFlameGoal({ offer: [7], current: null })).toEqual({ offer: [7], current: null });
    expect(parseServedFlameGoal({ current: null })).toBeNull();
  });
});

describe('le contrat du choix', () => {
  it('une adresse et un code de refus à lui', () => {
    expect(GAME_ROUTES.flameGoal).toBe('/me/game/flame/goal');
    expect(GAME_ERROR_CODES.flameGoalNotAllowed).toBe('FLAME_GOAL_NOT_ALLOWED');
  });

  it('accepte une marche de l’échelle, rien d’autre', () => {
    const body = (target: unknown) => flameGoalRequestSchema.safeParse({ requestId: 'req-goal-1', target }).success;
    expect([7, 14, 30, 100, 365].map(body)).toEqual([true, true, true, true, true]);
    expect([0, 8, 7.5, '7', null, 366].map(body)).toEqual([false, false, false, false, false, false]);
  });

  it('la réponse porte l’objectif servi', () => {
    const served = { offer: [], current: { target: 7, remaining: 6, reached: false, next: null } };
    expect(flameGoalResponseSchema.parse({ status: 'chosen', goal: served })).toEqual({ status: 'chosen', goal: served });
    expect(flameGoalResponseSchema.safeParse({ status: 'chosen', goal: null }).success).toBe(false);
  });
});
