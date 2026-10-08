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
import { levelThreshold } from '../../utils/game/levels.js';
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
    expect(b.glory).toMatchObject({ glory: 2000, rank: 'echo', division: 3, division5: 5, mythic: null });
    expect(b.treasury).toMatchObject({ held: 9, tier: 'bourse' });
    expect(b.mint).toMatchObject({ number: 13, price: 1294, edition: 'silver', canMint: true, levelsLost: 2 });
  });

  it('sert la lecture ouverte par le rang dans ladder, sous les mêmes valeurs qu\'hier quand le niveau est sous 100 (#9688)', () => {
    const b = block();
    expect(b.level.ladder).toEqual({
      level: 34,
      tier: 'eclat',
      floorScore: b.level.floorScore,
      nextThreshold: b.level.nextThreshold,
      pointsToNext: b.level.pointsToNext,
      progress: b.level.progress,
      record: 36,
      cap: 499,
      isMax: false,
    });
  });

  it('garde les champs d\'hier bornés à 100 et Galaxie pour les clients publiés, la vérité dans ladder (#9688)', () => {
    const score = levelThreshold(640);
    const capped = block({ score, debitablePoints: score, levelRecord: 120, glory: 2000 });
    expect(capped.level).toMatchObject({ level: 100, tier: 'galaxie', record: 100, nextThreshold: null, progress: 1, canPrestige: true });
    expect(capped.level.ladder).toMatchObject({ level: 499, tier: 'supernova', record: 499, cap: 499, isMax: true, nextThreshold: null });
    expect(capped.mint).toMatchObject({ levelBefore: 100, levelAfter: 100, levelsLost: 0, ladder: { levelBefore: 499, levelAfter: 499, levelsLost: 0 } });
    expect(gameBlockSchema.safeParse(capped).success).toBe(true);

    const ambassador = block({ score, debitablePoints: score, levelRecord: 499, glory: 130_000 });
    expect(ambassador.level).toMatchObject({ level: 100, tier: 'galaxie', record: 100 });
    expect(ambassador.level.ladder).toMatchObject({ level: 640, tier: 'amas', record: 640, cap: 1000, isMax: false });
    expect(ambassador.mint.ladder).toEqual({ levelBefore: 640, levelAfter: 639, levelsLost: 1 });

    const oracle = block({ score: levelThreshold(1001), debitablePoints: 0, levelRecord: 1000, glory: 380_000 });
    expect(oracle.level.ladder).toMatchObject({ level: 1001, tier: 'singularite', cap: null, isMax: false });
    expect(gameBlockSchema.safeParse(oracle).success).toBe(true);
  });

  it('refuse un niveau d\'hier au-delà de 100 : le contrat des clients publiés ne bouge pas (#9688)', () => {
    const b = block();
    expect(gameBlockSchema.safeParse({ ...b, level: { ...b.level, level: 101 } }).success).toBe(false);
    expect(gameBlockSchema.safeParse({ ...b, level: { ...b.level, tier: 'nebuleuse' } }).success).toBe(false);
  });

  it('garde la division héritée (1–3) que les clients publiés décodent, et sert la division à cinq crans à côté (#9636)', () => {
    const b = block({ glory: 2800 });
    expect(b.glory).toMatchObject({ rank: 'echo', division: 3, division5: 4 });
    expect(b.glory.next).toEqual({ rank: 'echo', division: 2, division5: 3, minGlory: 3600 });
    const parsed = parseGameBlock(b);
    expect(parsed?.glory).toMatchObject({ division: 3, division5: 4, next: { division: 2, division5: 3 } });
  });

  it('sert la place du Mythe et son émission, sans division (#9636)', () => {
    const b = block({ glory: 1_000_000, mythic: true, mythicSeat: { number: 42, edition: 117 } });
    expect(b.glory).toMatchObject({ rank: 'mythe', division: null, division5: null, mythic: { number: 42, edition: 117 } });
    expect(parseGameBlock(b)?.glory.mythic).toEqual({ number: 42, edition: 117 });
  });

  it('un bloc d’avant #9636 (sans division5 ni mythic) reste valide', () => {
    const { division5: _d, mythic: _m, ...old } = block().glory;
    const legacy = { ...block(), glory: { ...old, next: old.next === null ? null : { rank: old.next.rank, division: old.next.division, minGlory: old.next.minGlory } } };
    expect(gameBlockSchema.safeParse(legacy).success).toBe(true);
  });

  it('refuse une division héritée hors de 1–3 : le fil ne la sert jamais', () => {
    const b = block();
    expect(gameBlockSchema.safeParse({ ...b, glory: { ...b.glory, division: 5 } }).success).toBe(false);
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

  it('juge la Flamme sur son jour CIVIL quand la journée de jeu est encore la veille', () => {
    const b = block({ today: '2026-10-05', flameToday: '2026-10-06', lastActiveDay: '2026-10-05', streak: 4, freezes: 0 });
    expect(b.flame.status).toBe('at-risk');
    expect(b.missions.dayKey).toBe('2026-10-05');
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

  describe('la mission personnelle (#9539)', () => {
    const personal = {
      record: {
        id: '64b7f0c2a1b2c3d4e5f6a7c1',
        difficulty: 'medium' as const,
        templateKey: 'publish-post',
        signal: 'axis:content.post' as const,
        prism: false,
        target: 2,
        progress: 0,
        reward: 80,
        glory: 0,
        completedAt: null,
      },
      startsAt: '2026-10-05T16:00:00.000Z',
      endsAt: '2026-10-05T18:00:00.000Z',
      now: '2026-10-05T15:00:00.000Z',
    };

    it('se sert À CÔTÉ des trois missions du jour, avec sa plage et son état', () => {
      const b = block({ personalMission: personal });
      expect(b.missions.items).toHaveLength(3);
      expect(b.missions.personal).toMatchObject({ templateKey: 'publish-post', startsAt: personal.startsAt, endsAt: personal.endsAt, state: 'upcoming' });
      expect(block({ personalMission: { ...personal, now: '2026-10-05T17:00:00.000Z' } }).missions.personal?.state).toBe('active');
      expect(block({ personalMission: { ...personal, now: '2026-10-05T18:00:00.000Z' } }).missions.personal?.state).toBe('missed');
      expect(
        block({ personalMission: { ...personal, record: { ...personal.record, completedAt: '2026-10-05T16:30:00.000Z', progress: 2 }, now: '2026-10-06T08:00:00.000Z' } }).missions.personal?.state,
      ).toBe('completed');
    });

    it('est absente d’un bloc sans mission personnelle — la forme d’avant, intacte', () => {
      expect(block().missions.personal).toBeUndefined();
      expect('personal' in block().missions).toBe(false);
    });

    it('ne gouverne NI le coffre NI le changement de mission', () => {
      const done = missionRecords(34).map((m) => ({ ...m, progress: m.target, completedAt: '2026-10-05T10:00:00.000Z' }));
      expect(block({ missions: done, personalMission: personal }).chest.status).toBe('ready');
      const allDone = block({ missions: done, personalMission: personal });
      expect(allDone.missions.rerollAvailable).toBe(false);
    });

    it('un ancien client lit toujours le bloc : la clé en plus est ignorée', () => {
      const b = block({ personalMission: personal });
      const legacyShape = { ...b, missions: { ...b.missions, personal: 'illisible' } };
      const parsed = parseGameBlock(legacyShape);
      expect(parsed).not.toBeNull();
      expect(parsed?.missions.personal).toBeUndefined();
    });
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
  it('nomme les chemins publics (préfixe /api/v1) — les treize de la vague 2 sont gardés par contract-v2.test.ts', () => {
    expect(GAME_ROUTES).toMatchObject({
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
