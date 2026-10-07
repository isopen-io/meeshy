/**
 * LA SECTION `game` DE L'EXPORT (#9384 à #9392, conformité I-2) — tout ce que le
 * jeu garde du compte, rien d'un autre compte, rien de présence.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import { fakeGameDb, seedUser, USER, OTHER, type FakeGameDb } from '../../../../services/game/__tests__/fakeGameDb';
import { exportGame } from '../../../../routes/me/export-game';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }) },
}));

import { dataExportRoutes } from '../../../../routes/me/export';

const PAGE = { limit: 500, offset: 0 };

const seed = (db: FakeGameDb) => {
  seedUser(db, { engagementScore: 4000, levelRecord: 20, prestige: 1, publicLeagueConsentAt: new Date('2026-10-01T00:00:00Z'), publicLeagueConsentVersion: 'v1', lastActiveAt: new Date(), isOnline: true });
  seedUser(db, {}, OTHER);
  db.gameProfile.rows.push({ id: 'p', userId: USER, showcaseVisibility: 'friends', atlasVisibility: 'me', gameHiddenAt: null, friendsLeagueOptOutAt: new Date('2026-10-02T00:00:00Z'), showcaseOrder: ['trophy.prestige.1'], mythicAt: null });
  db.leaguePseudonym.rows.push({ id: 'n', userId: USER, pseudonym: 'Colibri-0001', pseudonymKey: 'colibri0001', kind: 'drawn', seasonNumber: 1, createdAt: new Date() });
  db.leagueMembership.rows.push({ id: 'm', userId: USER, weekKey: '2026-10-12', groupId: 'G1', league: 'jade', finalRank: 2, finalPoints: 80, zone: 'promotion', cup: 'silver', settledAt: new Date() });
  db.gameWeekPoints.rows.push({ id: 'w', userId: USER, weekKey: '2026-10-12', dayKey: '2026-10-13', points: 40 });
  db.gameDuo.rows.push({ id: 'd', weekKey: '2026-10-12', inviterId: USER, inviteeId: OTHER, status: 'completed', templateKey: 'duo-messages', partTarget: 40, inviterProgress: 40, inviteeProgress: 40, inviterPaidAt: new Date(), inviteePaidAt: null, createdAt: new Date() });
  db.gameSeason.rows.push({ id: 's', userId: USER, number: 1, stars: 12, claimedSteps: [1, 2, 3], sealOwnedAt: null, settledAt: null });
  db.gameTrophy.rows.push({ id: 't', userId: USER, key: 'trophy.prestige.1', awardedAt: new Date() });
  db.atlasStamp.rows.push({ id: 'a', userId: USER, language: 'ja', sentAt: new Date(), receivedAt: new Date(), stampedOn: '2026-10-14' });
  db.gloryLedger.rows.push({ id: 'g', userId: USER, delta: 20, reason: 'level', requestId: 'level:2', createdAt: new Date(), actorId: OTHER });
  db.meeshLedger.rows.push({ id: 'l', userId: USER, delta: 5, reason: 'transfer_in', requestId: 'x', actorId: OTHER, createdAt: new Date() });
};

describe('exportGame', () => {
  it('rend la place du Mythe du compte, son numéro et sa date (#9636) — personne d’autre', async () => {
    const db = fakeGameDb();
    seed(db);
    db.mythicSeat.rows.push({ id: '6d7974686500000000000003', number: 3, userId: USER, glory: 1_000_000, grantedAt: new Date('2027-01-02T00:00:00Z') });
    db.mythicSeat.rows.push({ id: '6d7974686500000000000004', number: 4, userId: '68a0000000000000000000ff', glory: 1_000_000, grantedAt: new Date('2027-01-03T00:00:00Z') });
    const game = await exportGame(db.prisma, USER, PAGE);
    expect(game.mythicSeat).toEqual({ number: 3, grantedAt: '2027-01-02T00:00:00.000Z' });
    expect((await exportGame(db.prisma, '68a0000000000000000000ee', PAGE)).mythicSeat).toBeNull();
  });

  it('rend la progression, les réglages, le pseudonyme et chaque liste du compte', async () => {
    const db = fakeGameDb();
    seed(db);
    const game = await exportGame(db.prisma, USER, PAGE);

    expect(game.progress).toMatchObject({ engagementScore: 4000, levelRecord: 20, prestige: 1, publicLeagueConsentVersion: 'v1' });
    expect(game.settings).toMatchObject({ showcaseVisibility: 'friends', atlasVisibility: 'me', showcaseOrder: ['trophy.prestige.1'] });
    expect(game.pseudonym).toMatchObject({ pseudonym: 'Colibri-0001', kind: 'drawn' });
    expect(game.leagueHistory).toHaveLength(1);
    expect(game.weekPoints).toHaveLength(1);
    expect(game.duos).toEqual([expect.objectContaining({ role: 'inviter', status: 'completed', myProgress: 40 })]);
    expect(game.seasons).toHaveLength(1);
    expect(game.trophies).toHaveLength(1);
    expect(game.atlas).toHaveLength(1);
    expect(game.gloryLedger).toHaveLength(1);
    expect(game.meeshLedger).toHaveLength(1);
    expect(game.hasMore).toBe(false);
  });

  it('ne contient rien d’un autre compte ni de présence : ni partenaire, ni acteur, ni lastActiveAt', async () => {
    const db = fakeGameDb();
    seed(db);
    const text = JSON.stringify(await exportGame(db.prisma, USER, PAGE));
    expect(text).not.toContain(OTHER);
    expect(text).not.toMatch(/lastActiveAt|isOnline|actorId|inviteeId|inviterId|G1/);
  });

  it('exporte la plage de la mission personnelle du compte (#9539) — sa propre donnée, jamais la date de l’annonce', async () => {
    const db = fakeGameDb();
    seed(db);
    db.dailyMission.rows.push({
      id: 'dm1', userId: USER, dayKey: '2026-10-06', slot: 3, templateKey: 'send-voice', difficulty: 'easy', signal: 'axis:content.audio_message',
      target: 2, progress: 1, reward: 40, completedAt: null, paidPoints: null,
      startsAt: new Date('2026-10-06T16:00:00Z'), endsAt: new Date('2026-10-06T18:00:00Z'), notifiedAt: new Date('2026-10-06T16:01:00Z'),
    });

    const game = await exportGame(db.prisma, USER, PAGE);

    const row = (game.missions as readonly Record<string, unknown>[]).find((m) => m.slot === 3);
    expect(row).toMatchObject({ startsAt: new Date('2026-10-06T16:00:00Z'), endsAt: new Date('2026-10-06T18:00:00Z') });
    expect(row).not.toHaveProperty('notifiedAt');
  });

  it('un compte qui n’a jamais joué rend des listes vides, jamais d’erreur', async () => {
    const db = fakeGameDb();
    seedUser(db, {});
    const game = await exportGame(db.prisma, USER, PAGE);
    expect(game).toMatchObject({ settings: null, pseudonym: null, leagueHistory: [], duos: [], trophies: [], hasMore: false });
  });

  it('borne chaque liste par la page demandée et le dit', async () => {
    const db = fakeGameDb();
    seed(db);
    db.gameTrophy.rows.push({ id: 't2', userId: USER, key: 'trophy.prestige.2', awardedAt: new Date() });
    const game = await exportGame(db.prisma, USER, { limit: 1, offset: 0 });
    expect(game.trophies).toHaveLength(1);
    expect(game.hasMore).toBe(true);
  });
});

describe('GET /export?types=game', () => {
  const build = async (db: FakeGameDb): Promise<FastifyInstance> => {
    const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.decorate('prisma', db.prisma as never);
    app.decorate('authenticate', async (req: FastifyRequest) => {
      (req as any).authContext = { isAuthenticated: true, userId: USER, registeredUser: { id: USER } };
    });
    await app.register(dataExportRoutes);
    await app.ready();
    return app;
  };

  it('traverse le sérialiseur : la section game sort entière, en JSON et en CSV', async () => {
    const db = fakeGameDb();
    seed(db);
    const app = await build(db);

    const json = (await app.inject({ method: 'GET', url: '/export?types=game' })).json().data;
    expect(json.game.trophies).toEqual([expect.objectContaining({ key: 'trophy.prestige.1' })]);
    expect(json.game.progress.prestige).toBe(1);

    const csv = (await app.inject({ method: 'GET', url: '/export?types=game&format=csv' })).json().data.csv;
    expect(Object.keys(csv)).toEqual(expect.arrayContaining(['game.progress', 'game.trophies', 'game.atlas']));
    await app.close();
  });
});
