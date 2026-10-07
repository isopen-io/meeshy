/**
 * LES SEPT EXTENSIONS DU BLOC `game` (#9384 à #9392) — servies à côté de
 * l'existant, validées par le schéma partagé, composées des faits que la
 * passerelle persiste ; une lecture qui échoue fait partir le bloc SANS elles.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { gameBlockSchema } from '@meeshy/shared/types/game';
import { GameBlockService } from '../GameBlockService';
import { MissionService } from '../MissionService';
import { fakeGameDb, seedUser, USER, OTHER, type FakeGameDb } from './fakeGameDb';

const privacy = new Map<string, Record<string, unknown>>();
jest.mock('../../preferences/privacy-cache', () => ({
  loadPrivacyPreferencesCached: async (_prisma: unknown, ids: string[]) => new Map(ids.map((id) => [id, privacy.get(id) ?? {}])),
}));
jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

const NOW = new Date('2026-10-14T12:00:00Z');
const WEEK = '2026-10-12';

const build = async (db: FakeGameDb) => {
  const missions = new MissionService(db.prisma, { creditPoints: async () => undefined });
  return new GameBlockService(db.prisma, { missions }).build({ userId: USER, now: NOW });
};

beforeEach(() => privacy.clear());

const veteran = (db: FakeGameDb) => {
  seedUser(db, { engagementScore: 4000, levelRecord: 20, birthDate: new Date('1990-01-01T00:00:00Z'), publicLeagueConsentAt: new Date('2026-10-01T00:00:00Z') }, USER);
  seedUser(db, { engagementScore: 4000, levelRecord: 20 }, OTHER);
  db.friendRequest.rows.push({ id: 'f', status: 'accepted', senderId: USER, receiverId: OTHER });
};

describe('les extensions du bloc game', () => {
  it('un compte qui n’a rien fait du jeu sert sept extensions neutres, qui passent le schéma partagé', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 0 });

    const block = await build(db);

    expect(gameBlockSchema.safeParse(block).success).toBe(true);
    expect(block!.league).toMatchObject({ unlocked: false, access: 'locked', pseudonym: null, current: null });
    expect(block!.duo).toMatchObject({ unlocked: false, status: 'none', duoId: null });
    expect(block!.season).toMatchObject({ number: 1, stars: 0, completed: false, sealOwned: false });
    expect(block!.trophies).toEqual({ items: [], order: [] });
    expect(block!.atlas).toMatchObject({ stamped: 0 });
    expect(block!.prestige).toMatchObject({ stars: 0, canPrestige: false });
    expect(block!.visibility).toEqual({ showcase: 'friends', rank: 'friends', treasury: 'friends', atlas: 'me' });
  });

  it('avant la première saison, la clé `season` est nulle — l’ancien comportement', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 0 });
    const block = await new GameBlockService(db.prisma, { missions: new MissionService(db.prisma, { creditPoints: async () => undefined }) }).build({
      userId: USER,
      now: new Date('2026-10-05T10:00:00Z'),
    });
    expect(block!.season).toBeNull();
  });

  it('un joueur placé sert son groupe : les autres figés, lui en direct, sous pseudonyme, sans identifiant', async () => {
    const db = fakeGameDb();
    veteran(db);
    db.leaguePseudonym.rows.push({ id: 'p1', userId: USER, pseudonym: 'Colibri-0001' }, { id: 'p2', userId: OTHER, pseudonym: 'Colibri-0002' });
    db.leagueGroupWeek.rows.push({ id: 'g', groupId: 'G1', weekKey: WEEK, league: 'jade', timezone: 'UTC', snapshotDay: '2026-10-14', snapshot: { [USER]: 10, [OTHER]: 80 } });
    db.leagueMembership.rows.push(
      { id: 'm1', userId: USER, weekKey: WEEK, groupId: 'G1', league: 'jade' },
      { id: 'm2', userId: OTHER, weekKey: WEEK, groupId: 'G1', league: 'jade' },
    );
    db.gameWeekPoints.rows.push({ id: 'w', userId: USER, weekKey: WEEK, dayKey: '2026-10-14', points: 120 });

    const block = await build(db);

    expect(block!.league).toMatchObject({ access: 'open', pseudonym: 'Colibri-0001', weekKey: WEEK });
    expect(block!.league!.current).toMatchObject({ league: 'jade', groupId: 'G1', groupSize: 2, rank: 1, weekPoints: 120 });
    expect(block!.league!.friends).toMatchObject({ rank: 1, size: 2, weekPoints: 120 });
    expect(JSON.stringify(block!.league)).not.toContain(OTHER);
  });

  it('un mineur voit sa ligue fermée (minor) : la majorité vient de la date de naissance serveur', async () => {
    const db = fakeGameDb();
    veteran(db);
    db.user.rows[0]!.birthDate = new Date('2012-01-01T00:00:00Z');
    expect((await build(db))!.league).toMatchObject({ access: 'minor', pseudonym: null, current: null });
  });

  it('sert le duo, la saison, les trophées rangés, l’Atlas et les réglages', async () => {
    const db = fakeGameDb();
    veteran(db);
    db.gameDuo.rows.push({
      id: 'd1', weekKey: WEEK, inviterId: USER, inviteeId: OTHER, status: 'active', templateKey: 'duo-messages', signal: 'axis:content.text_message',
      prism: false, partTarget: 40, commonTarget: 80, inviterProgress: 10, inviteeProgress: 25, inviterSeen: [], inviteeSeen: [],
    });
    db.gameDuoSlot.rows.push({ id: 's1', userId: USER, weekKey: WEEK, duoId: 'd1' });
    db.user.rows[1]!.displayName = 'Marie';
    db.gameSeason.rows.push({ id: 'se', userId: USER, number: 1, stars: 9, claimedSteps: [1], sealOwnedAt: null });
    db.gameTrophy.rows.push({ id: 't1', userId: USER, key: 'trophy.season-cup.1', awardedAt: new Date('2026-12-06T21:00:00Z') });
    db.atlasStamp.rows.push({ id: 'a1', userId: USER, language: 'es', sentAt: new Date(), receivedAt: new Date(), stampedOn: '2026-10-10' });
    db.gameProfile.rows.push({ id: 'gp', userId: USER, atlasVisibility: 'friends', showcaseOrder: ['trophy.season-cup.1'] });

    const block = await build(db);

    expect(gameBlockSchema.safeParse(block).success).toBe(true);
    expect(block!.duo).toMatchObject({ status: 'active', duoId: 'd1', partner: { userId: OTHER, displayName: 'Marie' }, progress: { mine: 10 } });
    // La part du partenaire n'est jamais plus fine que ce que la loi de présence permet de montrer.
    expect(block!.duo!.progress!.partner).toBeLessThanOrEqual(25);
    expect(block!.season).toMatchObject({ stars: 9, steps: 2, claimedSteps: [1], nextReward: { step: 2 } });
    expect(block!.trophies).toEqual({ items: [{ key: 'trophy.season-cup.1', awardedAt: '2026-12-06T21:00:00.000Z' }], order: ['trophy.season-cup.1'] });
    expect(block!.atlas).toMatchObject({ stamped: 1, stamps: [{ language: 'es', stampedOn: '2026-10-10' }] });
    expect(block!.visibility.atlas).toBe('friends');
  });

  it('le Mythe vient de la place du compte, avec son numéro, jamais d’une liste (#9636)', async () => {
    const db = fakeGameDb();
    veteran(db);
    db.gloryLedger.rows.push({ id: 'g1', userId: USER, delta: 1_000_000, reason: 'mint', requestId: 'r1' });
    db.mythicSeat.rows.push({ id: '6d7974686500000000000009', number: 9, edition: 9, userId: USER, glory: 1_000_000, grantedAt: new Date() });
    expect((await build(db))!.glory).toMatchObject({ rank: 'mythe', division: null, division5: null, mythic: { number: 9, edition: 9 } });
  });

  it('l’ancien drapeau « top 100 du moment » ne fait plus un Mythe (#9636)', async () => {
    const db = fakeGameDb();
    veteran(db);
    db.gloryLedger.rows.push({ id: 'g1', userId: USER, delta: 90_000, reason: 'mint', requestId: 'r1' });
    db.gameProfile.rows.push({ id: 'gp', userId: USER, mythicAt: new Date() });
    expect((await build(db))!.glory).toMatchObject({ rank: 'polyglotte', division: 3, division5: 4, mythic: null });
  });

  it('une extension qui ne se lit pas fait partir le bloc SANS les sept, et le reste tient', async () => {
    const db = fakeGameDb();
    veteran(db);
    (db.gameSeason as unknown as { findUnique: () => Promise<never> }).findUnique = () => Promise.reject(new Error('down'));

    const block = await build(db);

    expect(block).not.toBeNull();
    expect(block!.level).toBeDefined();
    expect(block!.league).toBeUndefined();
    expect(block!.season).toBeUndefined();
  });

  it('sert la carte des raretés mesurées à côté des sept extensions (#9489)', async () => {
    const db = fakeGameDb();
    veteran(db);
    db.achievementRarityStat.rows.push(
      { id: 'r1', milestoneKey: 'achievement.editor', holders: 150, population: 2000, rarity: 'rare', measuredAt: new Date() },
      { id: 'r2', milestoneKey: 'achievement.two', holders: 2, population: 2000, rarity: 'mythic', measuredAt: new Date() },
    );

    const block = await build(db);

    expect(gameBlockSchema.safeParse(block).success).toBe(true);
    expect(block!.achievementRarities).toEqual({ 'achievement.editor': { rarity: 'rare', holders: 150, population: 2000 } });
  });

  it('sans rareté affichable, la clé est ABSENTE : un serveur antérieur et celui-ci disent la même chose', async () => {
    const db = fakeGameDb();
    veteran(db);
    expect(Object.keys((await build(db))!)).not.toContain('achievementRarities');
  });

  it('une carte de raretés qui ne se lit pas ne retire PAS les sept extensions', async () => {
    const db = fakeGameDb();
    veteran(db);
    (db.achievementRarityStat as unknown as { findMany: () => Promise<never> }).findMany = () => Promise.reject(new Error('down'));

    const block = await build(db);

    expect(block!.league).toBeDefined();
    expect(block!.achievementRarities).toBeUndefined();
  });
});
