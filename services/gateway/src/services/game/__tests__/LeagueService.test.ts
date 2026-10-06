/**
 * LES LIGUES (#9384, #9385) — consentement daté et retirable, classement servi
 * sur l'instantané (jamais d'activité en direct des autres), blocage et
 * suspension, ligue Amis à la granularité du jour.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { LeagueService } from '../LeagueService';
import { LeaguePseudonymService } from '../LeaguePseudonymService';
import { fakeGameDb, seedUser, USER, OTHER, type FakeGameDb } from './fakeGameDb';

const privacy = new Map<string, Record<string, unknown>>();
jest.mock('../../preferences/privacy-cache', () => ({
  loadPrivacyPreferencesCached: async (_prisma: unknown, ids: string[]) => new Map(ids.map((id) => [id, privacy.get(id) ?? {}])),
}));

const C = '68a000000000000000000003';
const D = '68a000000000000000000004';
const NOW = new Date('2026-10-14T12:00:00Z'); // mercredi, semaine du 2026-10-12
const WEEK = '2026-10-12';
const ADULT = new Date('1990-01-01T00:00:00Z');
const MINOR = new Date('2012-01-01T00:00:00Z');
const LEVEL_20 = 4000;

let draw = 0;
const service = (db: FakeGameDb) =>
  new LeagueService(db.prisma, { pseudonyms: new LeaguePseudonymService(db.prisma, { draw: () => (draw += 1) }) });

const player = (db: FakeGameDb, id: string, fields: Record<string, unknown> = {}) =>
  seedUser(db, { engagementScore: LEVEL_20, levelRecord: 20, birthDate: ADULT, ...fields }, id);

const befriend = (db: FakeGameDb, a: string, b: string) =>
  db.friendRequest.rows.push({ id: `f-${a}-${b}`, status: 'accepted', senderId: a, receiverId: b, updatedAt: new Date() });

const gains = (db: FakeGameDb, userId: string, points: number, dayKey = '2026-10-13') =>
  db.gameWeekPoints.rows.push({ id: `w-${userId}-${dayKey}`, userId, weekKey: WEEK, dayKey, points });

beforeEach(() => {
  privacy.clear();
  draw = 0;
});

describe('LeagueService.setConsent', () => {
  it('refuse sous le niveau 10 (LEAGUE_LOCKED) et sans majorité vérifiée (LEAGUE_MINOR)', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 0, birthDate: ADULT }, USER);
    player(db, OTHER, { birthDate: MINOR });
    seedUser(db, { engagementScore: LEVEL_20, levelRecord: 20 }, C);

    await expect(service(db).setConsent({ userId: USER, consent: true, policyVersion: 'v1', now: NOW })).rejects.toMatchObject({ code: 'LEAGUE_LOCKED' });
    await expect(service(db).setConsent({ userId: OTHER, consent: true, policyVersion: 'v1', now: NOW })).rejects.toMatchObject({ code: 'LEAGUE_MINOR' });
    await expect(service(db).setConsent({ userId: C, consent: true, policyVersion: 'v1', now: NOW })).rejects.toMatchObject({ code: 'LEAGUE_MINOR' });
  });

  it('la majorité vient de la date de naissance serveur : aucune valeur du client ne la relève', async () => {
    const db = fakeGameDb();
    player(db, USER, { birthDate: MINOR, ageVerifiedAt: new Date() });
    await expect(service(db).setConsent({ userId: USER, consent: true, policyVersion: 'v1', now: NOW })).rejects.toMatchObject({ code: 'LEAGUE_MINOR' });
  });

  it('consentir date par le serveur, grave la version et tire un pseudonyme stocké', async () => {
    const db = fakeGameDb();
    player(db, USER);

    const result = await service(db).setConsent({ userId: USER, consent: true, policyVersion: '2026-10-06', now: NOW });

    expect(result).toEqual({ consent: true, pseudonym: 'Colibri-0001' });
    expect(db.user.rows[0]).toMatchObject({ publicLeagueConsentAt: NOW, publicLeagueConsentVersion: '2026-10-06' });
    expect(db.leaguePseudonym.rows).toHaveLength(1);
  });

  it('un pseudonyme REFUSÉ au consentement n’écrit RIEN : ni consentement, ni pseudonyme — un 409 ne laisse pas un accord gravé derrière lui', async () => {
    const db = fakeGameDb();
    player(db, USER);

    await expect(
      service(db).setConsent({ userId: USER, consent: true, policyVersion: 'v1', pseudonym: 'Zebulon', now: NOW }),
    ).rejects.toMatchObject({ code: 'LEAGUE_PSEUDONYM_FORBIDDEN' });

    expect(db.user.rows[0]!.publicLeagueConsentAt ?? null).toBeNull();
    expect(db.leaguePseudonym.rows).toHaveLength(0);
  });

  it('consentir de nouveau garde la date d’origine : la preuve du premier accord', async () => {
    const db = fakeGameDb();
    player(db, USER);
    await service(db).setConsent({ userId: USER, consent: true, policyVersion: 'v1', now: NOW });
    await service(db).setConsent({ userId: USER, consent: true, policyVersion: 'v2', now: new Date('2026-10-20T00:00:00Z') });

    expect(db.user.rows[0]).toMatchObject({ publicLeagueConsentAt: NOW, publicLeagueConsentVersion: 'v2' });
  });

  it('le retrait emporte la colonne, le pseudonyme, l’appartenance et la ligne de l’instantané', async () => {
    const db = fakeGameDb();
    player(db, USER);
    await service(db).setConsent({ userId: USER, consent: true, policyVersion: 'v1', now: NOW });
    db.leagueGroupWeek.rows.push({ id: 'g', groupId: 'G1', weekKey: WEEK, league: 'quartz', snapshot: { [USER]: 40, [OTHER]: 10 } });
    db.leagueMembership.rows.push({ id: 'm', userId: USER, weekKey: WEEK, groupId: 'G1', league: 'quartz', settledAt: null });

    const result = await service(db).setConsent({ userId: USER, consent: false, policyVersion: 'v1', now: NOW });

    expect(result).toEqual({ consent: false, pseudonym: null });
    expect(db.user.rows[0]).toMatchObject({ publicLeagueConsentAt: null, publicLeagueConsentVersion: null });
    expect(db.leaguePseudonym.rows).toHaveLength(0);
    expect(db.leagueMembership.rows).toHaveLength(0);
    expect(db.leagueGroupWeek.rows[0]?.snapshot).toEqual({ [OTHER]: 10 });
  });
});

describe('LeagueService.weekBoard', () => {
  const placed = async (db: FakeGameDb) => {
    for (const id of [USER, OTHER, C]) player(db, id);
    for (const id of [USER, OTHER, C]) await service(db).setConsent({ userId: id, consent: true, policyVersion: 'v1', now: NOW });
    db.leagueGroupWeek.rows.push({
      id: 'g',
      groupId: 'G1',
      weekKey: WEEK,
      league: 'jade',
      timezone: 'UTC',
      snapshotDay: '2026-10-14',
      snapshot: { [USER]: 50, [OTHER]: 80, [C]: 20 },
    });
    for (const id of [USER, OTHER, C]) db.leagueMembership.rows.push({ id: `m-${id}`, userId: id, weekKey: WEEK, groupId: 'G1', league: 'jade', settledAt: null });
  };

  it('sans consentement : non placé, aucune entrée', async () => {
    const db = fakeGameDb();
    player(db, USER);
    expect(await service(db).weekBoard(USER, NOW)).toMatchObject({ placed: false, league: null, groupId: null, entries: [] });
  });

  it('consenti mais pas encore placé : placed false', async () => {
    const db = fakeGameDb();
    player(db, USER);
    await service(db).setConsent({ userId: USER, consent: true, policyVersion: 'v1', now: NOW });
    expect((await service(db).weekBoard(USER, NOW)).placed).toBe(false);
  });

  it('les autres sont figés à l’instantané ; seule MA ligne est en direct — et mon rang suit mon total vif', async () => {
    const db = fakeGameDb();
    await placed(db);
    gains(db, USER, 95);
    gains(db, OTHER, 500, '2026-10-14');

    const board = await service(db).weekBoard(USER, NOW);

    expect(board.entries.map((e) => [e.weekPoints, e.isMe])).toEqual([
      [95, true],
      [80, false],
      [20, false],
    ]);
    expect(board.entries[0]).toMatchObject({ rank: 1 });
    expect(board.snapshotDay).toBe('2026-10-14');
    expect(board.league).toBe('jade');
  });

  it('le schéma servi est strict : un pseudonyme, jamais d’identifiant ni de présence', async () => {
    const db = fakeGameDb();
    await placed(db);
    const board = await service(db).weekBoard(USER, NOW);

    for (const entry of board.entries) {
      expect(Object.keys(entry).sort()).toEqual(['cup', 'displayName', 'isMe', 'rank', 'weekPoints', 'zone']);
      expect(entry.displayName).toMatch(/^Colibri-/);
    }
    expect(JSON.stringify(board)).not.toContain(OTHER);
  });

  it('deux comptes bloqués ne se voient jamais, même dans un groupe formé avant le blocage', async () => {
    const db = fakeGameDb();
    await placed(db);
    db.user.rows.find((u) => u.id === OTHER)!.blockedUserIds = [USER];

    const board = await service(db).weekBoard(USER, NOW);
    expect(board.entries).toHaveLength(2);
    expect(board.entries.some((e) => e.weekPoints === 80)).toBe(false);

    const theirs = await service(db).weekBoard(OTHER, NOW);
    expect(theirs.entries.some((e) => e.weekPoints === 50)).toBe(false);
  });

  it('un membre qui coupe sa présence en ligne, se cache de la recherche ou masque son jeu sort de la vue (A-7)', async () => {
    const db = fakeGameDb();
    await placed(db);
    privacy.set(OTHER, { showOnlineStatus: false });
    privacy.set(C, { hideProfileFromSearch: true });
    expect((await service(db).weekBoard(USER, NOW)).entries).toHaveLength(1);

    privacy.clear();
    db.gameProfile.rows.push({ id: 'p', userId: OTHER, gameHiddenAt: new Date() });
    expect((await service(db).weekBoard(USER, NOW)).entries).toHaveLength(2);
  });

  it('MA propre suspension ferme MA vue : non placé', async () => {
    const db = fakeGameDb();
    await placed(db);
    privacy.set(USER, { showOnlineStatus: false });
    expect(await service(db).weekBoard(USER, NOW)).toMatchObject({ placed: false, entries: [] });
  });
});

describe('LeagueService.friendsBoard', () => {
  it('classe le joueur et ses amis acceptés, jamais un inconnu', async () => {
    const db = fakeGameDb();
    for (const id of [USER, OTHER, C]) player(db, id);
    befriend(db, USER, OTHER);
    gains(db, USER, 30);
    gains(db, OTHER, 70);
    gains(db, C, 999);

    const board = await service(db).friendsBoard(USER, NOW);

    expect(board.entries.map((e) => [e.userId, e.weekPoints, e.rank, e.isMe])).toEqual([
      [OTHER, 70, 1, false],
      [USER, 30, 2, true],
    ]);
  });

  it('un ami qui a coupé sa présence se montre à la fin de la veille, pas à la minute (B-3)', async () => {
    const db = fakeGameDb();
    for (const id of [USER, OTHER]) player(db, id);
    befriend(db, USER, OTHER);
    gains(db, OTHER, 60, '2026-10-13');
    gains(db, OTHER, 40, '2026-10-14');
    privacy.set(OTHER, { showOnlineStatus: false });

    expect((await service(db).friendsBoard(USER, NOW)).entries.find((e) => e.userId === OTHER)?.weekPoints).toBe(60);
    privacy.clear();
    expect((await service(db).friendsBoard(USER, NOW)).entries.find((e) => e.userId === OTHER)?.weekPoints).toBe(100);
  });

  it('la veille se lit dans le fuseau de l’AMI, jamais dans celui du lecteur : un lecteur à l’est ne voit pas sa journée en cours (B-3)', async () => {
    const db = fakeGameDb();
    player(db, USER, { timezone: 'Pacific/Kiritimati' });
    player(db, OTHER, { timezone: 'America/Los_Angeles' });
    befriend(db, USER, OTHER);
    gains(db, OTHER, 60, '2026-10-13');
    gains(db, OTHER, 40, '2026-10-14');
    privacy.set(OTHER, { showOnlineStatus: false });

    expect((await service(db).friendsBoard(USER, NOW)).entries.find((e) => e.userId === OTHER)?.weekPoints).toBe(60);
  });

  it('l’opposition et « Jeu masqué » sortent un ami de la ligue ; la mienne me laisse seul', async () => {
    const db = fakeGameDb();
    for (const id of [USER, OTHER, C]) player(db, id);
    befriend(db, USER, OTHER);
    befriend(db, USER, C);
    db.gameProfile.rows.push({ id: 'p1', userId: OTHER, friendsLeagueOptOutAt: new Date() }, { id: 'p2', userId: C, gameHiddenAt: new Date() });

    expect((await service(db).friendsBoard(USER, NOW)).entries.map((e) => e.userId)).toEqual([USER]);

    db.gameProfile.rows.length = 0;
    db.gameProfile.rows.push({ id: 'p3', userId: USER, friendsLeagueOptOutAt: new Date() });
    expect((await service(db).friendsBoard(USER, NOW)).entries.map((e) => e.userId)).toEqual([USER]);
  });

  it('un blocage retire l’ami de la ligue', async () => {
    const db = fakeGameDb();
    for (const id of [USER, OTHER]) player(db, id);
    befriend(db, USER, OTHER);
    db.user.rows.find((u) => u.id === OTHER)!.blockedUserIds = [USER];
    expect((await service(db).friendsBoard(USER, NOW)).entries.map((e) => e.userId)).toEqual([USER]);
  });

  it('un compte sans ami ni point est seul, premier, à zéro', async () => {
    const db = fakeGameDb();
    player(db, USER);
    expect((await service(db).friendsBoard(USER, NOW)).entries).toEqual([{ rank: 1, userId: USER, weekPoints: 0, isMe: true }]);
  });
});
