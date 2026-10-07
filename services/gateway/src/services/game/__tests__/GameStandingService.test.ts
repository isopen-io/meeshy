/**
 * LE JEU D'UN AUTRE MEMBRE (#9481, #9541) — ce qu'un lecteur apprend d'un compte, selon SON réglage ET selon
 * le lien qui les unit. Décision porteur 2026-10-06 : la Flamme n'est servie qu'à ses AMIS (plus jamais à « tout
 * le monde ») ; les amis voient aussi ses POINTS et le nombre de ses TROPHÉES, en plus du rang, de la division
 * et de la mention Légende ou Mythe. « Jeu masqué », le blocage et les réglages restent des portes fermées.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { GameStandingService } from '../GameStandingService';
import { fakeGameDb, seedUser, USER, OTHER, type FakeGameDb } from './fakeGameDb';

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
const SCORE = 10 * 20 * 20;

const setup = (profile: Record<string, unknown> = {}, member: Record<string, unknown> = {}) => {
  const db: FakeGameDb = fakeGameDb();
  seedUser(
    db,
    { engagementScore: SCORE, prestige: 1, currentStreakDays: 12, lastStreakDate: new Date('2026-10-05T00:00:00Z'), ...member },
    MEMBER,
  );
  seedUser(db, {}, READER);
  db.gloryLedger.rows.push({ id: 'g1', userId: MEMBER, delta: 3000, reason: 'level', requestId: 'level:1' });
  for (const key of ['t1', 't2', 't3']) db.gameTrophy.rows.push({ id: key, userId: MEMBER, key, awardedAt: new Date('2026-09-10T00:00:00Z') });
  if (Object.keys(profile).length > 0) db.gameProfile.rows.push({ id: 'p1', userId: MEMBER, ...profile });
  return { db, service: new GameStandingService(db.prisma) };
};

const befriend = (db: FakeGameDb) => db.friendRequest.rows.push({ id: 'f1', status: 'accepted', senderId: READER, receiverId: MEMBER });

const stranger = { userId: READER, role: 'USER' as const };
const standing = async (service: GameStandingService, viewer: Parameters<GameStandingService['standingFor']>[0]['viewer'], targetId = MEMBER) =>
  service.standingFor({ viewer, targetId, now: NOW });

beforeEach(() => hidingFromSearch.clear());

describe('la Flamme n’est servie qu’aux AMIS (#9541)', () => {
  it('un ami la voit', async () => {
    const { db, service } = setup();
    befriend(db);
    const result = await standing(service, stranger);
    expect(result.standing?.flame).not.toBeNull();
  });

  it('un inconnu ne la voit pas, même quand le membre a réglé son rang sur « tout le monde »', async () => {
    const { service } = setup({ rankVisibility: 'everyone' });
    const result = await standing(service, stranger);
    expect(result.visible).toBe(true);
    expect(result.standing).not.toBeNull();
    expect(result.standing?.flame).toBeNull();
  });

  it('un lecteur anonyme non plus', async () => {
    const { service } = setup({ rankVisibility: 'everyone' });
    expect((await standing(service, null)).standing?.flame).toBeNull();
  });

  it('le membre la voit, et un administrateur aussi', async () => {
    const { service } = setup();
    expect((await standing(service, { userId: MEMBER, role: 'USER' as const })).standing?.flame).not.toBeNull();
    expect((await standing(service, { userId: READER, role: 'ADMIN' as const })).standing?.flame).not.toBeNull();
  });

  it('une Flamme éteinte se tait pour tout le monde, amis compris', async () => {
    const { db, service } = setup({}, { lastStreakDate: new Date('2026-09-01T00:00:00Z'), flameFreezes: 0 });
    befriend(db);
    expect((await standing(service, stranger)).standing?.flame).toBeNull();
  });
});

describe('ce que les amis voient de plus : points et trophées (#9541)', () => {
  it('un ami lit ses points et le nombre de ses trophées, avec le niveau, le rang et la division', async () => {
    const { db, service } = setup();
    befriend(db);

    const result = await standing(service, stranger);

    expect(result.standing).toMatchObject({ level: 20, prestige: 1, points: SCORE, trophyCount: 3 });
    expect(result.standing?.rank).toBeDefined();
    expect(result.standing?.division).toBeDefined();
  });

  it('un inconnu ne reçoit NI les points NI le nombre de trophées — les clés sont absentes, pas nulles', async () => {
    const { service } = setup({ rankVisibility: 'everyone', showcaseVisibility: 'everyone' });
    const result = await standing(service, stranger);
    expect(result.standing).not.toHaveProperty('points');
    expect(result.standing).not.toHaveProperty('trophyCount');
  });

  it('le nombre de trophées suit le réglage de la VITRINE : fermée à l’ami, il n’en voit pas le compte', async () => {
    const { db, service } = setup({ showcaseVisibility: 'me' });
    befriend(db);
    const result = await standing(service, stranger);
    expect(result.standing).not.toHaveProperty('trophyCount');
    expect(result.standing?.points).toBe(SCORE);
  });

  it('Mythe se lit au rang, avec le numéro de sa place, pour un ami (#9636)', async () => {
    const { db, service } = setup();
    db.gloryLedger.rows.push({ id: 'g2', userId: MEMBER, delta: 1_000_000, reason: 'level', requestId: 'level:99' });
    db.mythicSeat.rows.push({ id: '6d7974686500000000000064', number: 100, userId: MEMBER, glory: 1_000_000, grantedAt: new Date() });
    befriend(db);

    expect((await standing(service, stranger)).standing).toMatchObject({ rank: 'mythe', division: null, division5: null, mythic: { number: 100 } });
  });

  it('Légende I sans place : 1 000 000 de Gloire ne suffit pas sans une des cent places (#9636)', async () => {
    const { db, service } = setup({ mythicAt: new Date('2026-09-30T00:00:00Z') });
    db.gloryLedger.rows.push({ id: 'g2', userId: MEMBER, delta: 1_000_000, reason: 'level', requestId: 'level:99' });
    befriend(db);

    expect((await standing(service, stranger)).standing).toMatchObject({ rank: 'legende', division: 1, division5: 1, mythic: null });
  });

  it('jamais la Gloire exacte, les jours de série, ni une date — même pour un ami', async () => {
    const { db, service } = setup();
    befriend(db);
    const wire = JSON.stringify(await standing(service, stranger));
    for (const forbidden of ['"glory"', 'streak', 'Streak', 'lastActive', '2026-10', '"days"', '3000']) expect(wire).not.toContain(forbidden);
  });
});

describe('les portes qui restent fermées', () => {
  it('« Jeu masqué » ferme tout, amis compris : la même réponse qu’un compte inconnu', async () => {
    const { db, service } = setup({ gameHiddenAt: new Date() });
    befriend(db);
    expect(await standing(service, stranger)).toEqual({ visible: false, standing: null, treasury: null });
    expect(await standing(service, stranger, '68a0000000000000000000ee')).toEqual({ visible: false, standing: null, treasury: null });
  });

  it('un rang réglé sur « moi seul » ne montre rien à un ami', async () => {
    const { db, service } = setup({ rankVisibility: 'me', treasuryVisibility: 'me' });
    befriend(db);
    expect(await standing(service, stranger)).toEqual({ visible: false, standing: null, treasury: null });
  });

  it('le blocage prime, dans les deux sens', async () => {
    const { db, service } = setup({}, { blockedUserIds: [READER] });
    befriend(db);
    expect(await standing(service, stranger)).toEqual({ visible: false, standing: null, treasury: null });
  });
});
