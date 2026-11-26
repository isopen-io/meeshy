/**
 * La Flamme en veille se DIT (#20507, tranche serveur de #17372) : le bloc `flame` porte la veille annoncée, de
 * l'annonce à son dernier jour, et un client antérieur la lit comme une Flamme allumée.
 */

import { describe, it, expect } from 'vitest';
import { buildGameBlock, type GameBlockFacts } from '../../utils/game/game-block';
import { restedLastActiveDay } from '../../utils/game/flame-pause';
import { flamePauseRequestSchema, parseFlamePause, parseGameBlock } from '../../types/game';
import { GAME_ERROR_CODES, GAME_ROUTES } from '../../types/game-routes';

const week = { from: '2026-11-24', until: '2026-11-30' };

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
  streak: 12,
  lastActiveDay: restedLastActiveDay({ lastActiveDay: '2026-11-23', through: '2026-11-27', pause: week }),
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

describe('le bloc `flame` porte la veille', () => {
  it('la sert pendant la veille, validée par le contrat, et la Flamme y paraît allumée', () => {
    const block = buildGameBlock(facts({ pause: week }));
    expect(block.flame.status).toBe('lit');
    expect(block.flame.days).toBe(12);
    expect(parseGameBlock(block)?.flame.pause).toEqual(week);
  });

  it('la sert dès le jour de l’annonce', () => {
    const block = buildGameBlock(facts({ today: '2026-11-23', lastActiveDay: '2026-11-23', pause: week }));
    expect(block.flame.pause).toEqual(week);
  });

  it('se tait après la veille, sans veille, et devant une passerelle qui ne la lit pas', () => {
    expect(buildGameBlock(facts({ today: '2026-12-01', pause: week })).flame).not.toHaveProperty('pause');
    expect(buildGameBlock(facts({ pause: null })).flame).not.toHaveProperty('pause');
    expect(buildGameBlock(facts()).flame).not.toHaveProperty('pause');
  });

  it('une forme illisible tombe seule, sans emporter le bloc', () => {
    const block = buildGameBlock(facts({ pause: week }));
    const parsed = parseGameBlock({ ...block, flame: { ...block.flame, pause: { from: 'demain' } } });
    expect(parsed?.flame.pause).toBeUndefined();
    expect(parsed?.flame.days).toBe(12);
    expect(parseFlamePause({ from: '2026-11-24' })).toBeNull();
    expect(parseFlamePause(week)).toEqual(week);
  });
});

describe('le bloc `flame` dit quand la prochaine veille sera possible (#20517)', () => {
  it('le trimestre pris, il dit le premier jour du suivant, validé par le contrat', () => {
    const block = buildGameBlock(facts({ today: '2026-12-05', lastActiveDay: '2026-12-05', pause: week }));
    expect(block.flame).not.toHaveProperty('pause');
    expect(block.flame.nextPauseFrom).toBe('2027-01-01');
    expect(parseGameBlock(block)?.flame.nextPauseFrom).toBe('2027-01-01');
  });

  it('se tait quand l’annonce est ouverte, pendant la veille, et devant une passerelle qui ne la lit pas', () => {
    expect(buildGameBlock(facts({ today: '2026-12-31', lastActiveDay: '2026-12-31', pause: week })).flame).not.toHaveProperty('nextPauseFrom');
    expect(buildGameBlock(facts({ pause: week })).flame).not.toHaveProperty('nextPauseFrom');
    expect(buildGameBlock(facts({ today: '2026-12-05', lastActiveDay: '2026-12-05' })).flame).not.toHaveProperty('nextPauseFrom');
  });

  it('se tait pour une Flamme éteinte : il n’y a rien à mettre en veille', () => {
    const block = buildGameBlock(facts({ today: '2026-12-20', lastActiveDay: '2026-12-05', pause: week }));
    expect(block.flame.status).toBe('out');
    expect(block.flame).not.toHaveProperty('nextPauseFrom');
  });

  it('une forme illisible tombe seule, sans emporter le bloc', () => {
    const block = buildGameBlock(facts({ today: '2026-12-05', lastActiveDay: '2026-12-05', pause: week }));
    const parsed = parseGameBlock({ ...block, flame: { ...block.flame, nextPauseFrom: 'janvier' } });
    expect(parsed?.flame.nextPauseFrom).toBeUndefined();
    expect(parsed?.flame.days).toBe(12);
  });
});

describe('le contrat de l’annonce', () => {
  it('une adresse et un code de refus à elle', () => {
    expect(GAME_ROUTES.flamePause).toBe('/me/game/flame/pause');
    expect(GAME_ERROR_CODES.flamePauseNotAllowed).toBe('FLAME_PAUSE_NOT_ALLOWED');
  });

  it('accepte 1 à 7 jours entiers, rien d’autre', () => {
    const body = (days: unknown) => flamePauseRequestSchema.safeParse({ requestId: 'req-pause-1', days }).success;
    expect([1, 7].map(body)).toEqual([true, true]);
    expect([0, 8, 2.5, '3', null].map(body)).toEqual([false, false, false, false, false]);
  });
});
