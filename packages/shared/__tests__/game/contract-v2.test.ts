/**
 * Le contrat d'API de la vague 2 (#9384 à #9392) : sept extensions du bloc
 * `game`, treize routes, dix-huit codes d'erreur, les écritures idempotentes.
 * Le bloc ne casse ni un ancien serveur, ni un ancien client.
 */

import { describe, it, expect } from 'vitest';
import {
  GAME_ERROR_CODES,
  GAME_ROUTES,
  GAME_ROUTE_METHODS,
  gameDuoAbandonPath,
  gameDuoAcceptPath,
  gameSeasonClaimPath,
  gameUserShowcasePath,
} from '../../types/game-routes.js';
import {
  duoInviteRequestSchema,
  gameBlockSchema,
  gamePrivacyRequestSchema,
  leagueConsentRequestSchema,
  leagueFriendsResponseSchema,
  leaguePseudonymRequestSchema,
  leagueWeekResponseSchema,
  parseGameBlock,
  prestigeResponseSchema,
  seasonClaimResponseSchema,
  showcaseOrderRequestSchema,
  showcaseVisibilityRequestSchema,
  userShowcaseResponseSchema,
  type GameBlock,
} from '../../types/game.js';
import { buildGameBlock, type GameBlockFacts } from '../../utils/game/game-block.js';
import { buildGameBlockExtras, type GameBlockExtrasFacts } from '../../utils/game/game-block-extras.js';
import { levelThreshold } from '../../utils/game/levels.js';
import { drawDuoMission } from '../../utils/game/duo.js';
import { drawDailyMissions } from '../../utils/game/missions.js';
import { foldAtlas } from '../../utils/game/atlas.js';

const extrasFacts = (over: Partial<GameBlockExtrasFacts> = {}): GameBlockExtrasFacts => ({
  userId: 'me',
  today: '2026-10-14',
  minuteOfDay: 600,
  score: 12_180,
  levelRecord: 36,
  prestige: 0,
  flameDays: 12,
  balance: 14,
  adultVerified: true,
  league: {
    consented: true,
    pseudonym: 'Zephyr',
    group: {
      league: 'jade',
      groupId: '2026-10-12:jade:1',
      members: Array.from({ length: 30 }, (_, i) => ({ userId: i === 11 ? 'me' : `u${i}`, weekPoints: 1000 - i * 10 })),
    },
    friendIds: ['f1', 'f2'],
    friendsWeekPoints: { me: 120, f1: 300, f2: 50 },
  },
  duo: null,
  season: { stars: 25, claimedSteps: [1, 2], sealOwned: false },
  trophies: [
    { key: 'trophy.prestige.1', awardedAt: '2026-11-01T00:00:00.000Z' },
    { key: 'trophy.season-cup.1', awardedAt: '2026-12-07T00:00:00.000Z' },
  ],
  showcaseOrder: [],
  atlas: foldAtlas({ state: {}, events: [{ kind: 'sent', language: 'ja', dayKey: '2026-10-12' }, { kind: 'received', language: 'ja', dayKey: '2026-10-13' }] }),
  visibility: { showcase: 'friends', rank: 'friends', treasury: 'friends', atlas: 'me' },
  ...over,
});

const baseFacts = (over: Partial<GameBlockFacts> = {}): GameBlockFacts => ({
  userId: 'me',
  today: '2026-10-14',
  score: 12_180,
  levelRecord: 36,
  prestige: 0,
  glory: 2000,
  mythic: false,
  mintedLifetime: 12,
  debitablePoints: 12_180,
  balance: 14,
  streak: 12,
  lastActiveDay: '2026-10-14',
  broken: null,
  freezes: 1,
  lastRelightDay: null,
  missions: drawDailyMissions({ userId: 'me', dayKey: '2026-10-14', level: 34, flameDays: 12, treasury: 14 }).missions.map((m, i) => ({
    ...m,
    id: `64b7f0c2a1b2c3d4e5f6a7b${i}`,
    progress: 0,
    completedAt: null,
  })),
  rerollsUsedToday: 0,
  chestClaimed: false,
  chestReward: null,
  guideSeen: [],
  ...over,
});

describe('l\'extension du bloc game', () => {
  it('garde la forme actuelle quand le serveur n\'a rien de la vague 2 à servir', () => {
    const block = buildGameBlock(baseFacts());
    expect(Object.keys(block)).not.toContain('league');
    expect(Object.keys(block)).not.toContain('season');
    expect(gameBlockSchema.safeParse(block).success).toBe(true);
  });

  it('sert les sept extensions quand le serveur fournit ses faits', () => {
    const block = buildGameBlock(baseFacts({ extras: extrasFacts() }));
    expect(Object.keys(block)).toEqual(expect.arrayContaining(['league', 'duo', 'season', 'trophies', 'atlas', 'prestige', 'visibility']));
    const parsed = parseGameBlock(block);
    expect(parsed).not.toBeNull();
    expect(parsed?.league?.current?.league).toBe('jade');
    expect(parsed?.trophies?.order).toEqual(['trophy.prestige.1', 'trophy.season-cup.1']);
  });

  it('est lu en entier par un ANCIEN client, qui ignore les clés qu\'il ne connaît pas', () => {
    const oldClientSchema = gameBlockSchema.omit({
      league: true,
      duo: true,
      season: true,
      trophies: true,
      atlas: true,
      prestige: true,
      visibility: true,
    });
    const block = buildGameBlock(baseFacts({ extras: extrasFacts() }));
    const parsed = oldClientSchema.safeParse(block);
    expect(parsed.success).toBe(true);
    expect(parsed.data && Object.keys(parsed.data)).not.toContain('league');
  });

  it('perd UNE extension illisible sans perdre le bloc', () => {
    const block: unknown = { ...buildGameBlock(baseFacts({ extras: extrasFacts() })), league: { unlocked: 'oui' }, atlas: 3 };
    const parsed = parseGameBlock(block);
    expect(parsed).not.toBeNull();
    expect(parsed?.league).toBeUndefined();
    expect(parsed?.atlas).toBeUndefined();
    expect(parsed?.season?.number).toBe(1);
    expect(parsed?.level.level).toBe(34);
  });

  it('reste refusé quand un champ de la vague 1 manque : jamais à moitié lu', () => {
    const { flame: _flame, ...partial } = buildGameBlock(baseFacts({ extras: extrasFacts() }));
    expect(parseGameBlock(partial)).toBeNull();
  });
});

describe('la ligue dans le bloc', () => {
  it('place le joueur dans son groupe, avec zone et points manquants', () => {
    const block = buildGameBlockExtras(extrasFacts());
    expect(block.league).toMatchObject({
      unlocked: true,
      access: 'open',
      pseudonym: 'Zephyr',
      weekKey: '2026-10-12',
      closes: { dayKey: '2026-10-18', minuteOfDay: 1200 },
    });
    expect(block.league.current).toMatchObject({ league: 'jade', groupId: '2026-10-12:jade:1', groupSize: 30, rank: 12, zone: 'safe' });
    expect(block.league.current?.pointsToPromotion).toBeGreaterThan(0);
  });

  it('compte la semaine à partir de la fermeture : dimanche 20 h, c\'est déjà la semaine suivante', () => {
    expect(buildGameBlockExtras(extrasFacts({ today: '2026-10-18', minuteOfDay: 1199 })).league.weekKey).toBe('2026-10-12');
    expect(buildGameBlockExtras(extrasFacts({ today: '2026-10-18', minuteOfDay: 1200 })).league.weekKey).toBe('2026-10-19');
  });

  it('ne sert aucun groupe ni pseudonyme sans consentement, ni à qui n\'est pas majeur vérifié', () => {
    const noConsent = buildGameBlockExtras(extrasFacts({ league: { ...extrasFacts().league, consented: false } })).league;
    expect(noConsent.access).toBe('consent-required');
    expect(noConsent.current).toBeNull();
    expect(noConsent.pseudonym).toBeNull();
    const minor = buildGameBlockExtras(extrasFacts({ adultVerified: false })).league;
    expect(minor.access).toBe('minor');
    expect(minor.current).toBeNull();
  });

  it('verrouille sous le niveau 10, et reste lisible : la ligue Amis est toujours là', () => {
    const low = buildGameBlockExtras(extrasFacts({ score: 100, levelRecord: null })).league;
    expect(low).toMatchObject({ unlocked: false, access: 'locked', current: null });
    expect(low.friends).toMatchObject({ rank: 2, size: 3, weekPoints: 120 });
  });
});

describe('le duo, la saison, les trophées, l\'Atlas et le Prestige dans le bloc', () => {
  it('ne sert pas de duo avant qu\'il existe, et dit s\'il est ouvert', () => {
    expect(buildGameBlockExtras(extrasFacts()).duo).toMatchObject({ unlocked: true, status: 'none', duoId: null, mission: null, progress: null, reward: null });
    expect(buildGameBlockExtras(extrasFacts({ score: 100, levelRecord: 12 })).duo.unlocked).toBe(false);
  });

  it('sert la mission du duo, la progression de chacun et la récompense doublée quand les deux ont fini', () => {
    const mission = drawDuoMission({ userA: 'me', userB: 'f1', weekKey: '2026-10-12', levelA: 34, levelB: 40, unavailableSignals: [] })!;
    const half = buildGameBlockExtras(extrasFacts({ duo: { duoId: 'd1', status: 'active', role: 'inviter', partner: { userId: 'f1', displayName: 'Léa' }, mission, mine: mission.partTarget, partnerProgress: 1 } })).duo;
    expect(half.progress).toMatchObject({ mineDone: true, partnerDone: false, bothDone: false });
    expect(half.reward?.doubled).toBe(false);
    const both = buildGameBlockExtras(extrasFacts({ duo: { duoId: 'd1', status: 'active', role: 'inviter', partner: { userId: 'f1', displayName: 'Léa' }, mission, mine: mission.partTarget, partnerProgress: mission.partTarget } })).duo;
    expect(both.reward?.doubled).toBe(true);
    expect(both.reward?.points).toBe((half.reward?.points ?? 0) * 2);
  });

  it('sert l\'étape de saison et la prochaine récompense à réclamer', () => {
    const season = buildGameBlockExtras(extrasFacts()).season;
    expect(season).toMatchObject({
      number: 1,
      themeKey: 'language:fr',
      startDay: '2026-10-12',
      endDay: '2026-12-06',
      week: 1,
      stars: 25,
      steps: 6,
      stepsTotal: 40,
      starsToNext: 3,
      completed: false,
      claimedSteps: [1, 2],
      sealOwned: false,
      sealPrice: 10,
    });
    expect(season?.nextReward).toEqual({ step: 3, reward: { kind: 'points', amount: 100 } });
  });

  it('ne sert pas de saison avant la première', () => {
    expect(buildGameBlockExtras(extrasFacts({ today: '2026-10-05' })).season).toBeNull();
  });

  it('range la vitrine, résume l\'Atlas et dit si le Prestige s\'offre', () => {
    const extras = buildGameBlockExtras(extrasFacts({ score: levelThreshold(100) }));
    expect(extras.atlas).toMatchObject({ stamped: 1, stamps: [{ language: 'ja', stampedOn: '2026-10-13' }], pending: [] });
    expect(extras.prestige).toEqual({ stars: 0, max: 5, canPrestige: true, gloryOnPass: 10_000 });
    expect(buildGameBlockExtras(extrasFacts()).prestige.canPrestige).toBe(false);
    expect(buildGameBlockExtras(extrasFacts({ score: levelThreshold(100), prestige: 5 })).prestige.canPrestige).toBe(false);
    expect(extras.visibility).toEqual({ showcase: 'friends', rank: 'friends', treasury: 'friends', atlas: 'me' });
  });
});

describe('les routes de la vague 2', () => {
  it('nomment quatorze chemins publics nouveaux, sans toucher aux sept actuels', () => {
    expect(GAME_ROUTES).toMatchObject({
      engagement: '/me/engagement',
      mint: '/me/meesh/mint',
      missionReroll: '/me/game/missions/:missionId/reroll',
      chestClaim: '/me/game/chest/claim',
      flameFreezes: '/me/game/flame/freezes',
      flameRelight: '/me/game/flame/relight',
      guideSeen: '/me/game/guide/seen',
      leagueConsent: '/me/game/league/consent',
      leaguePseudonym: '/me/game/league/pseudonym',
      leagueWeek: '/me/game/league/week',
      leagueFriends: '/me/game/league/friends',
      duoInvite: '/me/game/duo/invite',
      duoAccept: '/me/game/duo/:duoId/accept',
      duoAbandon: '/me/game/duo/:duoId/abandon',
      seasonClaim: '/me/game/season/steps/:step/claim',
      seasonSeal: '/me/game/season/seal',
      showcaseOrder: '/me/game/showcase/order',
      showcaseVisibility: '/me/game/visibility',
      userShowcase: '/users/:userId/game/showcase',
      prestige: '/me/game/prestige',
      privacy: '/me/game/privacy',
    });
    expect(Object.keys(GAME_ROUTES)).toHaveLength(21);
  });

  it('dit la méthode de chaque route nouvelle', () => {
    expect(GAME_ROUTE_METHODS).toEqual({
      leagueConsent: 'POST',
      leaguePseudonym: 'PUT',
      leagueWeek: 'GET',
      leagueFriends: 'GET',
      duoInvite: 'POST',
      duoAccept: 'POST',
      duoAbandon: 'POST',
      seasonClaim: 'POST',
      seasonSeal: 'POST',
      showcaseOrder: 'PUT',
      showcaseVisibility: 'PUT',
      userShowcase: 'GET',
      prestige: 'POST',
      privacy: 'PUT',
    });
  });

  it('compose les chemins à paramètre', () => {
    expect(gameDuoAcceptPath('64b7f0c2a1b2c3d4e5f6a7b1')).toBe('/me/game/duo/64b7f0c2a1b2c3d4e5f6a7b1/accept');
    expect(gameDuoAbandonPath('d1')).toBe('/me/game/duo/d1/abandon');
    expect(gameSeasonClaimPath(12)).toBe('/me/game/season/steps/12/claim');
    expect(gameUserShowcasePath('u9')).toBe('/users/u9/game/showcase');
  });

  it('porte des codes d\'erreur uniques, les anciens inchangés', () => {
    const values = Object.values(GAME_ERROR_CODES);
    expect(new Set(values).size).toBe(values.length);
    expect(GAME_ERROR_CODES.insufficientMeeshes).toBe('INSUFFICIENT_MEESHES');
    expect(GAME_ERROR_CODES.requestIdConflict).toBe('REQUEST_ID_CONFLICT');
    expect(values).toEqual(expect.arrayContaining(['LEAGUE_LOCKED', 'LEAGUE_MINOR', 'LEAGUE_CONSENT_REQUIRED', 'LEAGUE_PSEUDONYM_FORBIDDEN', 'DUO_LOCKED', 'SEASON_STEP_LOCKED', 'PRESTIGE_LEVEL_TOO_LOW']));
  });
});

describe('les écritures de la vague 2', () => {
  const requestId = 'req-12345678';

  it('portent toutes un requestId borné', () => {
    expect(leagueConsentRequestSchema.safeParse({ consent: true }).success).toBe(false);
    expect(leagueConsentRequestSchema.safeParse({ requestId, consent: true }).success).toBe(true);
    expect(duoInviteRequestSchema.safeParse({ requestId: 'court', friendId: 'f1' }).success).toBe(false);
    expect(duoInviteRequestSchema.safeParse({ requestId, friendId: 'f1' }).success).toBe(true);
  });

  it('valident le pseudonyme avec la loi de ligue', () => {
    expect(leaguePseudonymRequestSchema.safeParse({ requestId, pseudonym: 'Zephyr' }).success).toBe(true);
    expect(leaguePseudonymRequestSchema.safeParse({ requestId, pseudonym: 'jean@mail.fr' }).success).toBe(false);
    expect(leagueConsentRequestSchema.safeParse({ requestId, consent: true, pseudonym: '0612345678' }).success).toBe(false);
  });

  it('exigent au moins un réglage de visibilité, parmi tout le monde / amis / moi seul', () => {
    expect(showcaseVisibilityRequestSchema.safeParse({ requestId }).success).toBe(false);
    expect(showcaseVisibilityRequestSchema.safeParse({ requestId, showcase: 'me' }).success).toBe(true);
    expect(showcaseVisibilityRequestSchema.safeParse({ requestId, rank: 'public' }).success).toBe(false);
    expect(showcaseVisibilityRequestSchema.safeParse({ requestId, atlas: 'friends' }).success).toBe(true);
  });

  it('bornent l\'ordre de la vitrine', () => {
    expect(showcaseOrderRequestSchema.safeParse({ requestId, order: ['trophy.prestige.1'] }).success).toBe(true);
    expect(showcaseOrderRequestSchema.safeParse({ requestId, order: Array.from({ length: 201 }, (_, i) => `trophy.prestige.${i}`) }).success).toBe(false);
  });
});

describe('les réponses de la vague 2', () => {
  it('ne servent aucun identifiant dans la ligue publique — un pseudonyme, un rang, un total', () => {
    const response = {
      weekKey: '2026-10-12',
      snapshotDay: '2026-10-14',
      closes: { dayKey: '2026-10-18', minuteOfDay: 1200 },
      placed: true,
      league: 'jade',
      groupId: '2026-10-12:jade:1',
      entries: [{ rank: 1, displayName: 'Zephyr', weekPoints: 900, zone: 'promotion', cup: 'gold', isMe: false, userId: 'secret' }],
    };
    const parsed = leagueWeekResponseSchema.parse(response);
    expect(Object.keys(parsed.entries[0] ?? {})).not.toContain('userId');
  });

  it('sert des identifiants dans la ligue Amis : on se connaît déjà', () => {
    const parsed = leagueFriendsResponseSchema.safeParse({
      weekKey: '2026-10-12',
      closes: { dayKey: '2026-10-18', minuteOfDay: 1200 },
      entries: [{ rank: 1, userId: 'f1', weekPoints: 300, isMe: false }],
    });
    expect(parsed.success).toBe(true);
  });

  it('dit une vitrine fermée par `visible: false`, jamais par une erreur', () => {
    expect(userShowcaseResponseSchema.safeParse({ visible: false, items: [], order: [] }).success).toBe(true);
  });

  it('ne sert à un visiteur que le MOIS d\'obtention d\'un trophée, jamais l\'horodatage', () => {
    const parsed = userShowcaseResponseSchema.parse({
      visible: true,
      items: [{ key: 'trophy.prestige.1', awardedMonth: '2026-11', awardedAt: '2026-11-01T08:42:17.000Z' }],
      order: ['trophy.prestige.1'],
    });
    expect(parsed.items[0]).toEqual({ key: 'trophy.prestige.1', awardedMonth: '2026-11' });
    expect(userShowcaseResponseSchema.safeParse({ visible: true, items: [{ key: 'trophy.prestige.1', awardedMonth: '2026-11-01T08:42' }], order: [] }).success).toBe(false);
  });

  it('compte deux coupes identiques du même mois sur UNE ligne — `count` est additif et optionnel', () => {
    const twice = { visible: true, items: [{ key: 'trophy.league-cup.2026-10.jade.gold', awardedMonth: '2026-10', count: 2 }], order: ['trophy.league-cup.2026-10.jade.gold'] };
    expect(userShowcaseResponseSchema.parse(twice).items[0]).toEqual({ key: 'trophy.league-cup.2026-10.jade.gold', awardedMonth: '2026-10', count: 2 });
    expect(userShowcaseResponseSchema.safeParse({ ...twice, items: [{ ...twice.items[0], count: 1 }] }).success).toBe(false);
  });

  it('rend la réclamation d\'une étape et le passage en Prestige', () => {
    expect(
      seasonClaimResponseSchema.safeParse({
        status: 'claimed',
        step: 40,
        reward: { kind: 'season-cup', amount: 1 },
        seal: { cosmeticKey: 'season-1.seal-10' },
        completed: true,
        gloryGained: 500,
        score: 5000,
      }).success,
    ).toBe(true);
    expect(
      prestigeResponseSchema.safeParse({ status: 'passed', prestige: 1, score: 0, level: 1, gloryGained: 1000, trophyKey: 'trophy.prestige.1' }).success,
    ).toBe(true);
    expect(
      prestigeResponseSchema.safeParse({ status: 'passed', prestige: 6, score: 0, level: 1, gloryGained: 1000, trophyKey: 'trophy.prestige.6' }).success,
    ).toBe(false);
  });
});

describe('le bloc reste du type GameBlock', () => {
  it('accepte les extensions comme des champs optionnels', () => {
    const block: GameBlock = buildGameBlock(baseFacts());
    expect(block.league).toBeUndefined();
  });
});

describe('« Jeu masqué » et l’opposition à la ligue Amis', () => {
  const requestId = 'privacy-0001';

  it('exige au moins un interrupteur', () => {
    expect(gamePrivacyRequestSchema.safeParse({ requestId }).success).toBe(false);
    expect(gamePrivacyRequestSchema.safeParse({ requestId, gameHidden: true }).success).toBe(true);
    expect(gamePrivacyRequestSchema.safeParse({ requestId, friendsLeagueOptOut: false }).success).toBe(true);
  });
});
