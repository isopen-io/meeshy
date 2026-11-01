/**
 * LE JEU SUIT LE CERCLE (#13930, RG-25, RG-28) — visibilité servie = minimum(réglage du jeu, droits du cercle).
 * Ami : niveau, nomination (titres), rang. Proche et au-dessus : + étincelles et gloire. Sous Ami : le public seulement.
 * Le réglage du jeu ne peut jamais ouvrir plus que le cercle. GAM-01 : « c'est tout ce que voit un Ami du jeu » — le
 * nombre de trophées (ses titres) lui reste, la Flamme (un signal d'activité du jour) part avec les étincelles, à Proche+.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { GameStandingService } from '../GameStandingService';
import { TrophyService } from '../TrophyService';
import { GameProfileService } from '../GameProfileService';
import { fakeGameDb, relateAt, seedUser, USER, OTHER, type FakeGameDb } from './fakeGameDb';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

const hidingFromSearch = new Set<string>();
jest.mock('../../preferences/privacy-cache', () => ({
  loadPrivacyPreferencesCached: async (_prisma: unknown, ids: string[]) =>
    new Map(ids.map((id) => [id, { hideProfileFromSearch: hidingFromSearch.has(id) }])),
}));

const NOW = new Date('2026-10-06T10:00:00Z');
const MEMBER = USER;
const READER = OTHER;
const SCORE = 100 * 20 * 20;
const EVERYONE = { rankVisibility: 'everyone', showcaseVisibility: 'everyone', treasuryVisibility: 'everyone' };

const setup = (profile: Record<string, unknown> = {}, level: string | null = null) => {
  const db: FakeGameDb = fakeGameDb();
  seedUser(db, { engagementScore: SCORE, levelRecord: 20, prestige: 1, currentStreakDays: 12, lastStreakDate: new Date('2026-10-05T00:00:00Z') }, MEMBER);
  seedUser(db, {}, READER);
  db.gloryLedger.rows.push({ id: 'g1', userId: MEMBER, delta: 3000, reason: 'level', requestId: 'level:1' });
  db.meeshLedger.rows.push({ id: 'mint-1', userId: MEMBER, delta: 1, reason: 'mint', requestId: 'mint-0001' });
  db.dailyMission.rows.push({ id: 'dm-1', userId: MEMBER, dayKey: '2026-10-01', slot: 0, completedAt: new Date('2026-10-01T10:00:00Z') });
  for (const key of ['trophy.prestige.1', 'trophy.flame.100']) db.gameTrophy.rows.push({ id: key, userId: MEMBER, key, awardedAt: new Date('2026-09-10T00:00:00Z') });
  if (Object.keys(profile).length > 0) db.gameProfile.rows.push({ id: 'p1', userId: MEMBER, ...profile });
  if (level !== null) relateAt(db, MEMBER, READER, level);
  return { db, standing: new GameStandingService(db.prisma), trophies: new TrophyService(db.prisma), profile: new GameProfileService(db.prisma) };
};

const reader = { userId: READER, role: 'USER' as const };
const standingOf = (service: GameStandingService, viewer: Parameters<GameStandingService['standingFor']>[0]['viewer'] = reader) =>
  service.standingFor({ viewer, targetId: MEMBER, now: NOW });

const SPARKS_AND_GLORY = ['points', 'sparks', 'sparksLifetime', 'glory'] as const;

beforeEach(() => hidingFromSearch.clear());

describe('Ami : niveau, nomination (titres), rang — et rien de plus du compteur', () => {
  it('reçoit le niveau, le palier, les étoiles, le rang et la division', async () => {
    const { standing } = setup({}, 'FRIEND');
    const result = await standingOf(standing);
    expect(result.visible).toBe(true);
    expect(result.standing).toMatchObject({ level: 20, prestige: 1 });
    expect(result.standing?.rank).toBeDefined();
    expect(result.standing?.division).toBeDefined();
  });

  it('ne reçoit NI étincelles NI gloire : les clés sont absentes, pas nulles', async () => {
    const { standing } = setup({}, 'FRIEND');
    const served = (await standingOf(standing)).standing;
    SPARKS_AND_GLORY.forEach((key) => expect(served).not.toHaveProperty(key));
  });

  it('reçoit les titres (la vitrine) quand le membre les ouvre aux amis', async () => {
    const { trophies } = setup({}, 'FRIEND');
    const view = await trophies.showcaseFor({ viewer: reader, targetId: MEMBER, now: NOW });
    expect(view.visible).toBe(true);
    expect(view.items.length).toBeGreaterThan(0);
  });

  it('reçoit le nombre de ses trophées (ses titres), jamais la Flamme : un signal d’activité du jour, réservé à Proche+ (GAM-01)', async () => {
    const { standing } = setup({}, 'FRIEND');
    const served = (await standingOf(standing)).standing;
    expect(served?.flame).toBeNull();
    expect(served?.trophyCount).toBe(2);
  });

  it('un jeu ouvert à « tout le monde » ne lui ouvre ni étincelles, ni gloire, ni Flamme : le réglage n’ouvre jamais plus que le cercle', async () => {
    const { standing } = setup(EVERYONE, 'FRIEND');
    const served = (await standingOf(standing)).standing;
    expect(served).toMatchObject({ level: 20, trophyCount: 2 });
    expect(served?.flame).toBeNull();
    SPARKS_AND_GLORY.forEach((key) => expect(served).not.toHaveProperty(key));
  });

  it('un ami rattrapé par une demande acceptée, sans ligne de cercle, reste Ami', async () => {
    const { db, standing } = setup();
    db.friendRequest.rows.push({ id: 'f1', status: 'accepted', senderId: READER, receiverId: MEMBER });
    const served = (await standingOf(standing)).standing;
    expect(served).toMatchObject({ level: 20 });
    expect(served).not.toHaveProperty('points');
  });
});

describe('Proche et au-dessus : en plus les étincelles et la gloire', () => {
  it.each(['CLOSE', 'BLOOD'])('un %s reçoit points, étincelles et gloire', async (level) => {
    const { standing } = setup({}, level);
    const served = (await standingOf(standing)).standing;
    expect(served).toMatchObject({ points: SCORE, sparks: SCORE, glory: 3000 });
    expect(served).toHaveProperty('sparksLifetime');
    expect(served?.flame).not.toBeNull();
  });

  it('le niveau effectif est le MINIMUM des deux accords : Proche accordé d’un côté seulement ne suffit pas', async () => {
    const { db, standing } = setup();
    const [low, high] = MEMBER < READER ? [MEMBER, READER] : [READER, MEMBER];
    db.userRelation.rows.push({ id: 'r', userLowId: low, userHighId: high, grantedByLow: low === MEMBER ? 'CLOSE' : 'FRIEND', grantedByHigh: high === MEMBER ? 'CLOSE' : 'FRIEND', transitions: [] });
    expect((await standingOf(standing)).standing).not.toHaveProperty('glory');
  });
});

describe('Sous Ami : le public seulement', () => {
  it.each([['aucun lien', null], ['PUBLIC', 'PUBLIC'], ['COMMUNITY', 'COMMUNITY'], ['ACQUAINTANCE', 'ACQUAINTANCE']])(
    'avec %s et un jeu ouvert à tous : niveau et rang, jamais étincelles, gloire, Flamme ni trophées',
    async (_name, level) => {
      const { standing } = setup(EVERYONE, level);
      const served = (await standingOf(standing)).standing;
      expect(served).toMatchObject({ level: 20 });
      expect(served?.flame).toBeNull();
      expect(served).not.toHaveProperty('trophyCount');
      SPARKS_AND_GLORY.forEach((key) => expect(served).not.toHaveProperty(key));
    },
  );

  it('le lecteur anonyme voit le public, pas plus', async () => {
    const { standing } = setup(EVERYONE);
    const served = (await standingOf(standing, null)).standing;
    expect(served?.flame).toBeNull();
    SPARKS_AND_GLORY.forEach((key) => expect(served).not.toHaveProperty(key));
  });
});

describe('le réglage du jeu ne peut jamais ouvrir plus que le cercle', () => {
  it.each(['ACQUAINTANCE', 'COMMUNITY', null])('un rang réglé sur « amis » reste fermé à %s', async (level) => {
    const { standing, profile } = setup({}, level);
    expect(await profile.facetVisibleTo({ viewer: reader, targetId: MEMBER, facet: 'rank' })).toBe(false);
    expect(await standingOf(standing)).toEqual({ visible: false, standing: null, treasury: null });
  });

  it('un rang réglé sur « moi seul » reste fermé à un Sang, et un Ami ne le voit pas non plus', async () => {
    const { standing: blood } = setup({ rankVisibility: 'me', treasuryVisibility: 'me' }, 'BLOOD');
    expect((await standingOf(blood)).visible).toBe(false);
    const { standing: friend } = setup({ rankVisibility: 'me', treasuryVisibility: 'me' }, 'FRIEND');
    expect((await standingOf(friend)).visible).toBe(false);
  });

  it('un rang réglé sur « moi seul » ferme aussi les étincelles à un Proche', async () => {
    const { standing } = setup({ rankVisibility: 'me', treasuryVisibility: 'me' }, 'CLOSE');
    expect(await standingOf(standing)).toEqual({ visible: false, standing: null, treasury: null });
  });

  it('« caché de la recherche » ramène « tout le monde » aux Amis : une Connaissance ne lit plus rien, un Ami garde le niveau', async () => {
    hidingFromSearch.add(MEMBER);
    const { standing: acquaintance } = setup(EVERYONE, 'ACQUAINTANCE');
    expect((await standingOf(acquaintance)).visible).toBe(false);
    const { standing: friend } = setup(EVERYONE, 'FRIEND');
    const served = (await standingOf(friend)).standing;
    expect(served).toMatchObject({ level: 20 });
    SPARKS_AND_GLORY.forEach((key) => expect(served).not.toHaveProperty(key));
  });

  it('« Jeu masqué » ferme tout, Sang compris', async () => {
    const { standing } = setup({ gameHiddenAt: new Date() }, 'BLOOD');
    expect((await standingOf(standing)).visible).toBe(false);
  });

  it('la vitrine réglée sur « amis » est fermée à une Connaissance, ouverte à un Ami', async () => {
    const { trophies: acquaintance } = setup({}, 'ACQUAINTANCE');
    expect((await acquaintance.showcaseFor({ viewer: reader, targetId: MEMBER, now: NOW })).visible).toBe(false);
    const { trophies: friend } = setup({}, 'FRIEND');
    expect((await friend.showcaseFor({ viewer: reader, targetId: MEMBER, now: NOW })).visible).toBe(true);
  });

  it('la vitrine réglée sur « tout le monde » reste le public pour une Connaissance', async () => {
    const { trophies } = setup(EVERYONE, 'ACQUAINTANCE');
    expect((await trophies.showcaseFor({ viewer: reader, targetId: MEMBER, now: NOW })).visible).toBe(true);
  });
});

describe('soi, administrateur, blocage', () => {
  it('soi et ADMIN reçoivent tout, étincelles et gloire comprises', async () => {
    const { standing } = setup({ rankVisibility: 'me' });
    for (const viewer of [{ userId: MEMBER, role: 'USER' as const }, { userId: READER, role: 'ADMIN' as const }]) {
      expect((await standingOf(standing, viewer)).standing).toMatchObject({ points: SCORE, glory: 3000 });
    }
  });

  it('un MODERATOR est un utilisateur ordinaire : sans lien, rien des étincelles', async () => {
    const { standing } = setup(EVERYONE);
    const served = (await standingOf(standing, { userId: READER, role: 'MODERATOR' as const })).standing;
    SPARKS_AND_GLORY.forEach((key) => expect(served).not.toHaveProperty(key));
  });

  it('le blocage ferme tout, même un Sang', async () => {
    const { db, standing } = setup(EVERYONE, 'BLOOD');
    db.user.rows[0]!.blockedUserIds = [READER];
    expect(await standingOf(standing)).toEqual({ visible: false, standing: null, treasury: null });
  });
});
