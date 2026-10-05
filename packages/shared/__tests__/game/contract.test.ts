/**
 * Le contrat d'API du jeu (#9373, #9378) : le bloc `game` de GET /me/engagement,
 * les cinq écritures idempotentes, la réponse de frappe étendue.
 */

import { describe, it, expect } from 'vitest';
import {
  GAME_ERROR_CODES,
  GAME_ROUTES,
  gameMissionRerollPath,
} from '../../types/game-routes.js';
import {
  chestClaimRequestSchema,
  chestClaimResponseSchema,
  flameFreezeRequestSchema,
  flameRelightRequestSchema,
  gameBlockSchema,
  guideSeenRequestSchema,
  guideSeenResponseSchema,
  meeshMintResponseSchema,
  missionRerollRequestSchema,
  missionRerollResponseSchema,
  parseGameBlock,
  type EngagementPayloadWithGame,
  type GameBlock,
} from '../../types/game.js';
import { buildGameBlock, type GameMissionRecord } from '../../utils/game/game-block.js';
import { drawDailyMissions } from '../../utils/game/missions.js';
import { isEngagementProgressPayload } from '../../types/engagement.js';

const missionRecords = (level: number): readonly GameMissionRecord[] =>
  drawDailyMissions({ userId: 'u1', dayKey: '2026-10-05', level, flameDays: 4, treasury: 0 }).missions.map((m, i) => ({
    ...m,
    id: `64b7f0c2a1b2c3d4e5f6a7b${i}`,
    progress: i === 0 ? m.target : 0,
    completedAt: i === 0 ? '2026-10-05T09:00:00.000Z' : null,
  }));

const block = (over: Partial<Parameters<typeof buildGameBlock>[0]> = {}): GameBlock =>
  buildGameBlock({
    userId: 'u1',
    today: '2026-10-05',
    score: 12_180,
    levelRecord: 36,
    prestige: 0,
    glory: 2000,
    mythic: false,
    mintedLifetime: 12,
    debitablePoints: 12_180,
    balance: 9,
    streak: 23,
    lastActiveDay: '2026-10-05',
    broken: null,
    freezes: 1,
    lastRelightDay: null,
    missions: missionRecords(34),
    rerollsUsedToday: 0,
    chestClaimed: false,
    chestReward: null,
    guideSeen: ['first-level'],
    ...over,
  });

describe('le bloc game', () => {
  it('se valide contre son schéma', () => {
    expect(gameBlockSchema.safeParse(block()).success).toBe(true);
  });

  it('lit le niveau, la Gloire, le trésor et la frappe avec les lois partagées', () => {
    const b = block();
    expect(b.level).toMatchObject({ level: 34, tier: 'eclat', record: 36, prestige: 0, canPrestige: false });
    expect(b.glory).toMatchObject({ glory: 2000, rank: 'voix', division: 3 });
    expect(b.treasury).toMatchObject({ held: 9, tier: 'bourse' });
    expect(b.mint).toMatchObject({ number: 13, price: 1294, edition: 'silver', canMint: true, levelsLost: 2 });
  });

  it('sert le Vent arrière tant que le niveau est sous le record', () => {
    expect(block().boosts.tailwind).toBe(1.25);
    expect(block({ levelRecord: 34 }).boosts.tailwind).toBe(1);
  });

  it('sert l\'Heure du Prisme du jour, déterministe', () => {
    expect(block().boosts.prismHour).toEqual(block().boosts.prismHour);
    expect(block().boosts.prismHour?.multiplier).toBe(2);
  });

  it('sert la Flamme avec sa forme, son bonus et ses prix', () => {
    expect(block().flame).toMatchObject({
      days: 23,
      form: 'flamme',
      bonusPercent: 46,
      freezes: 1,
      maxFreezes: 2,
      freezePrice: 1,
      relightPrice: 3,
      status: 'lit',
      canRelight: false,
    });
  });

  it('dit qu\'une Flamme éteinte se rallume, avec son prix', () => {
    const b = block({
      lastActiveDay: '2026-10-02',
      streak: 12,
      broken: { streak: 12, lastActiveDay: '2026-10-02' },
      freezes: 0,
      balance: 5,
    });
    expect(b.flame.status).toBe('out');
    expect(b.flame.days).toBe(0);
    expect(b.flame.canRelight).toBe(true);
  });

  it('permet encore de rallumer une série rompue après le retour du joueur', () => {
    const b = block({
      lastActiveDay: '2026-10-05',
      streak: 1,
      broken: { streak: 12, lastActiveDay: '2026-10-02' },
      balance: 5,
    });
    expect(b.flame.status).toBe('lit');
    expect(b.flame.canRelight).toBe(true);
  });

  it('verrouille les missions sous le niveau 5', () => {
    const low = block({ score: 100, levelRecord: null, missions: [] });
    expect(low.missions.unlocked).toBe(false);
    expect(block().missions.unlocked).toBe(true);
  });

  it('ferme le coffre tant que les missions ne sont pas finies, l\'ouvre ensuite', () => {
    expect(block().chest.status).toBe('locked');
    const done = missionRecords(34).map((m) => ({ ...m, progress: m.target, completedAt: '2026-10-05T10:00:00.000Z' }));
    expect(block({ missions: done }).chest.status).toBe('ready');
    expect(
      block({ missions: done, chestClaimed: true, chestReward: { points: 120, fragment: true, freeze: false } }).chest,
    ).toMatchObject({ status: 'claimed', reward: { points: 120, fragment: true, freeze: false } });
  });

  it('expose les probabilités du coffre avant l\'ouverture, sans contenu', () => {
    expect(block().chest.odds).toEqual({ minPoints: 60, maxPoints: 200, fragment: 1 / 6, freeze: 1 / 20 });
    expect(block().chest.reward).toBeNull();
  });

  it('propose de changer une mission une fois par jour, à une Meesh', () => {
    expect(block().missions.rerollAvailable).toBe(true);
    expect(block({ rerollsUsedToday: 1 }).missions.rerollAvailable).toBe(false);
    expect(block({ balance: 0 }).missions.rerollAvailable).toBe(false);
  });

  it('refuse un bloc partiel', () => {
    const { flame: _flame, ...partial } = block();
    expect(parseGameBlock(partial)).toBeNull();
    expect(parseGameBlock(block())).not.toBeNull();
    expect(parseGameBlock('x')).toBeNull();
  });
});

describe('à côté des champs actuels de GET /me/engagement', () => {
  const legacy = {
    counters: [],
    milestones: [],
    streak: { currentStreakDays: 3, longestStreakDays: 5 },
    level: { engagementScore: 12 },
  };

  it('laisse la garde de frontière actuelle accepter la charge avec ou sans game', () => {
    const withGame: EngagementPayloadWithGame = { ...legacy, game: block() };
    expect(isEngagementProgressPayload(legacy)).toBe(true);
    expect(isEngagementProgressPayload(withGame)).toBe(true);
  });
});

describe('les routes', () => {
  it('nomme les chemins publics (préfixe /api/v1)', () => {
    expect(GAME_ROUTES).toEqual({
      engagement: '/me/engagement',
      mint: '/me/meesh/mint',
      missionReroll: '/me/game/missions/:missionId/reroll',
      chestClaim: '/me/game/chest/claim',
      flameFreezes: '/me/game/flame/freezes',
      flameRelight: '/me/game/flame/relight',
      guideSeen: '/me/game/guide/seen',
    });
  });

  it('compose le chemin de changement d\'une mission', () => {
    expect(gameMissionRerollPath('64b7f0c2a1b2c3d4e5f6a7b1')).toBe('/me/game/missions/64b7f0c2a1b2c3d4e5f6a7b1/reroll');
  });

  it('nomme ses codes d\'erreur', () => {
    expect(Object.values(GAME_ERROR_CODES)).toContain('INSUFFICIENT_MEESHES');
    expect(Object.values(GAME_ERROR_CODES)).toContain('REQUEST_ID_CONFLICT');
    expect(new Set(Object.values(GAME_ERROR_CODES)).size).toBe(Object.values(GAME_ERROR_CODES).length);
  });
});

describe('chaque écriture porte un requestId', () => {
  const ok = { requestId: 'req-12345678' };

  it.each([
    ['reroll', missionRerollRequestSchema],
    ['coffre', chestClaimRequestSchema],
    ['gel', flameFreezeRequestSchema],
    ['rallumage', flameRelightRequestSchema],
  ] as const)('exige le requestId de %s', (_name, schema) => {
    expect(schema.safeParse(ok).success).toBe(true);
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ requestId: 'court' }).success).toBe(false);
    expect(schema.safeParse({ requestId: 'x'.repeat(65) }).success).toBe(false);
  });

  it('exige le requestId et au moins une clé pour « guide vu »', () => {
    expect(guideSeenRequestSchema.safeParse({ ...ok, keys: ['first-level'] }).success).toBe(true);
    expect(guideSeenRequestSchema.safeParse({ ...ok, keys: [] }).success).toBe(false);
    expect(guideSeenRequestSchema.safeParse({ keys: ['first-level'] }).success).toBe(false);
  });
});

describe('les réponses', () => {
  it('étend la réponse de frappe sans casser l\'ancienne', () => {
    const old = { status: 'minted', balance: 3, mintedLifetime: 3 };
    expect(meeshMintResponseSchema.safeParse(old).success).toBe(true);
    const extended = { ...old, number: 3, edition: 'silver', price: 1221, gloryGained: 100, levelBefore: 14, levelAfter: 9 };
    expect(meeshMintResponseSchema.safeParse(extended).success).toBe(true);
    expect(meeshMintResponseSchema.safeParse({ ...extended, edition: 'bronze' }).success).toBe(false);
  });

  it('décrit les réponses des cinq écritures', () => {
    const mission = block().missions.items[1]!;
    expect(missionRerollResponseSchema.safeParse({ mission, balance: 8 }).success).toBe(true);
    expect(chestClaimResponseSchema.safeParse({ status: 'claimed', reward: { points: 90, fragment: false, freeze: false }, score: 12_270 }).success).toBe(true);
    expect(guideSeenResponseSchema.safeParse({ guideSeen: ['a'] }).success).toBe(true);
  });
});
