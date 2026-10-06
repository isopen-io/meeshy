/**
 * LE CYCLE D'UNE LIGUE (#9384) — placement idempotent, instantané quotidien,
 * règlement qui paie une fois (Gloire, coupes), groupes sans adversaire sans
 * récompense, suspendus et bloqués écartés, conservation de 4 semaines.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { LeagueSettlement, modalTimezone } from '../LeagueSettlement';
import { LeaguePseudonymService } from '../LeaguePseudonymService';
import { gloryTotalFromLedger } from '../GloryService';
import { fakeGameDb, seedUser, type FakeGameDb } from './fakeGameDb';

const privacy = new Map<string, Record<string, unknown>>();
jest.mock('../../preferences/privacy-cache', () => ({
  loadPrivacyPreferencesCached: async (_prisma: unknown, ids: string[]) => new Map(ids.map((id) => [id, privacy.get(id) ?? {}])),
}));
jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

const WEEK = '2026-10-19';
const PREVIOUS = '2026-10-12';
const MONDAY = new Date('2026-10-19T10:00:00Z');
const ADULT = new Date('1990-01-01T00:00:00Z');
const id = (n: number) => `68a0000000000000000000${String(n).padStart(2, '0')}`;

let draw = 0;
const settlement = (db: FakeGameDb) =>
  new LeagueSettlement(db.prisma, { pseudonyms: new LeaguePseudonymService(db.prisma, { draw: () => (draw += 1) }) });

const player = (db: FakeGameDb, n: number, fields: Record<string, unknown> = {}) =>
  seedUser(db, { engagementScore: 4000, levelRecord: 20, birthDate: ADULT, publicLeagueConsentAt: new Date('2026-10-01T00:00:00Z'), ...fields }, id(n));

const gain = (db: FakeGameDb, n: number, points: number, weekKey = WEEK, dayKey = '2026-10-20') =>
  db.gameWeekPoints.rows.push({ id: `w${n}-${weekKey}-${dayKey}`, userId: id(n), weekKey, dayKey, points });

beforeEach(() => {
  privacy.clear();
  draw = 0;
});

describe('modalTimezone', () => {
  it('le fuseau le plus fréquent, UTC pour l’inconnu, l’ordre alphabétique pour une égalité', () => {
    expect(modalTimezone(['Europe/Paris', 'Europe/Paris', 'UTC'])).toBe('Europe/Paris');
    expect(modalTimezone([null, 'Nope/Zone'])).toBe('UTC');
    expect(modalTimezone(['UTC', 'Europe/Paris'])).toBe('Europe/Paris');
    expect(modalTimezone([])).toBe('UTC');
  });
});

describe('LeagueSettlement.placeWeek', () => {
  it('place les inscrits éligibles en groupes, avec un pseudonyme, une fermeture et un instantané', async () => {
    const db = fakeGameDb();
    for (const n of [1, 2, 3, 4]) player(db, n, { timezone: 'Europe/Paris' });

    const placed = await settlement(db).placeWeek(WEEK, MONDAY);

    expect(placed).toBe(4);
    expect(db.leagueGroupWeek.rows).toHaveLength(1);
    expect(db.leagueGroupWeek.rows[0]).toMatchObject({ league: 'quartz', timezone: 'Europe/Paris', memberCount: 4, settledAt: null });
    expect((db.leagueGroupWeek.rows[0]!.closeAt as Date).toISOString()).toBe('2026-10-25T19:00:00.000Z'); // le 25 octobre, Paris repasse à l’heure d’hiver
    expect(db.leagueMembership.rows).toHaveLength(4);
    expect(db.leaguePseudonym.rows).toHaveLength(4);
  });

  it('est idempotente : une semaine déjà placée ne l’est pas deux fois', async () => {
    const db = fakeGameDb();
    for (const n of [1, 2]) player(db, n);
    await settlement(db).placeWeek(WEEK, MONDAY);
    expect(await settlement(db).placeWeek(WEEK, MONDAY)).toBe(0);
    expect(db.leagueMembership.rows).toHaveLength(2);
  });

  it('écarte : sans consentement, sous le niveau 10, mineur, suspendu (présence coupée, caché, jeu masqué)', async () => {
    const db = fakeGameDb();
    player(db, 1);
    player(db, 2, { publicLeagueConsentAt: undefined });
    player(db, 3, { engagementScore: 0, levelRecord: 2 });
    player(db, 4, { birthDate: new Date('2012-01-01T00:00:00Z') });
    player(db, 5);
    player(db, 6);
    player(db, 7);
    privacy.set(id(5), { showOnlineStatus: false });
    privacy.set(id(6), { hideProfileFromSearch: true });
    db.gameProfile.rows.push({ id: 'p', userId: id(7), gameHiddenAt: new Date() });

    await settlement(db).placeWeek(WEEK, MONDAY);

    expect(db.leagueMembership.rows.map((m) => m.userId)).toEqual([id(1)]);
  });

  it('deux comptes bloqués ne sont jamais dans le même groupe', async () => {
    const db = fakeGameDb();
    for (const n of [1, 2, 3]) player(db, n);
    db.user.rows.find((u) => u.id === id(1))!.blockedUserIds = [id(2)];

    await settlement(db).placeWeek(WEEK, MONDAY);

    const groupOf = (n: number) => db.leagueMembership.rows.find((m) => m.userId === id(n))!.groupId;
    expect(groupOf(1)).not.toBe(groupOf(2));
  });

  it('chacun repart de sa ligue de la semaine précédente, déplacée par sa zone', async () => {
    const db = fakeGameDb();
    for (const n of [1, 2, 3]) player(db, n);
    db.leagueMembership.rows.push(
      { id: 'a', userId: id(1), weekKey: PREVIOUS, groupId: 'g', league: 'jade', zone: 'promotion', settledAt: new Date() },
      { id: 'b', userId: id(2), weekKey: PREVIOUS, groupId: 'g', league: 'jade', zone: 'relegation', settledAt: new Date() },
      { id: 'c', userId: id(3), weekKey: PREVIOUS, groupId: 'g', league: 'prisme', zone: 'promotion', settledAt: new Date() },
    );
    db.leagueGroupWeek.rows.push({ id: 'old', groupId: 'g', weekKey: PREVIOUS, league: 'jade', settledAt: new Date() });

    await settlement(db).placeWeek(WEEK, MONDAY);

    const leagueOf = (n: number) => db.leagueMembership.rows.find((m) => m.userId === id(n) && m.weekKey === WEEK)!.league;
    expect([leagueOf(1), leagueOf(2), leagueOf(3)]).toEqual(['saphir', 'ambre', 'prisme']);
  });

  it('attend que la semaine précédente soit réglée pour tout le monde', async () => {
    const db = fakeGameDb();
    player(db, 1);
    db.leagueGroupWeek.rows.push({ id: 'old', groupId: 'g', weekKey: PREVIOUS, league: 'jade', settledAt: null, closeAt: new Date(MONDAY.getTime() - 3_600_000) });
    expect(await settlement(db).placeWeek(WEEK, MONDAY)).toBe(0);
  });

  it('un groupe dont le règlement échoue encore longtemps après sa fermeture ne fige pas la ligue de tout le monde', async () => {
    const db = fakeGameDb();
    for (const n of [1, 2]) player(db, n);
    db.leagueGroupWeek.rows.push({ id: 'poison', groupId: 'g', weekKey: PREVIOUS, league: 'jade', settledAt: null, closeAt: new Date(MONDAY.getTime() - 13 * 3_600_000) });

    expect(await settlement(db).placeWeek(WEEK, MONDAY)).toBe(2);
  });

  it('une semaine antérieure à la première saison n’est jamais placée', async () => {
    const db = fakeGameDb();
    player(db, 1);
    expect(await settlement(db).placeWeek('2026-10-05', MONDAY)).toBe(0);
  });
});

describe('LeagueSettlement.settleDue', () => {
  const placedGroup = async (db: FakeGameDb, players: number[]) => {
    for (const n of players) player(db, n);
    await settlement(db).placeWeek(WEEK, MONDAY);
  };
  const AFTER_CLOSE = new Date('2026-10-25T20:30:00Z');

  it('ne règle rien avant la fermeture', async () => {
    const db = fakeGameDb();
    await placedGroup(db, [1, 2, 3]);
    expect(await settlement(db).settleDue(new Date('2026-10-25T19:00:00Z'))).toBe(0);
  });

  it('règle à la fermeture : rangs, zones, Gloire de montée et de coupe, trophées', async () => {
    const db = fakeGameDb();
    await placedGroup(db, [1, 2, 3, 4]);
    gain(db, 1, 300);
    gain(db, 2, 200);
    gain(db, 3, 100);
    gain(db, 4, 0, WEEK, '2026-10-21');

    expect(await settlement(db).settleDue(AFTER_CLOSE)).toBe(1);

    const membership = (n: number) => db.leagueMembership.rows.find((m) => m.userId === id(n))!;
    expect(membership(1)).toMatchObject({ finalRank: 1, finalPoints: 300, cup: 'gold' });
    expect(membership(3)).toMatchObject({ finalRank: 3, cup: 'bronze' });
    expect(membership(4)).toMatchObject({ finalRank: 4, cup: null });
    // Un groupe de 4 : moitié = 2 — deux montent (les deux premiers), deux descendent… sauf au plancher.
    expect(membership(1).zone).toBe('promotion');
    expect(await gloryTotalFromLedger(db.prisma, id(1))).toBe(30 + 100);
    expect(await gloryTotalFromLedger(db.prisma, id(3))).toBe(100);
    expect(db.gameTrophy.rows.map((t) => t.key).sort()).toEqual([
      `trophy.league-cup.${WEEK}.quartz.bronze`,
      `trophy.league-cup.${WEEK}.quartz.gold`,
      `trophy.league-cup.${WEEK}.quartz.silver`,
    ]);
    expect(db.leagueGroupWeek.rows[0]!.settledAt).toEqual(AFTER_CLOSE);
  });

  it('rejouer un règlement ne paie rien de plus', async () => {
    const db = fakeGameDb();
    await placedGroup(db, [1, 2, 3]);
    gain(db, 1, 50);
    gain(db, 2, 20);
    await settlement(db).settleDue(AFTER_CLOSE);
    const glory = await gloryTotalFromLedger(db.prisma, id(1));

    db.leagueGroupWeek.rows[0]!.settledAt = null;
    await settlement(db).settleDue(new Date('2026-10-26T10:00:00Z'));

    expect(await gloryTotalFromLedger(db.prisma, id(1))).toBe(glory);
    expect(db.gameTrophy.rows).toHaveLength(2);
  });

  it('un groupe de moins de deux joueurs actifs ne paie rien', async () => {
    const db = fakeGameDb();
    await placedGroup(db, [1]);
    gain(db, 1, 500);

    await settlement(db).settleDue(AFTER_CLOSE);

    expect(db.leagueMembership.rows[0]).toMatchObject({ finalRank: 1, finalPoints: 500, cup: null, zone: 'safe' });
    expect(db.gameTrophy.rows).toHaveLength(0);
    expect(await gloryTotalFromLedger(db.prisma, id(1))).toBe(0);
  });

  it('un membre devenu suspendu au règlement est écarté : ni rang ni récompense', async () => {
    const db = fakeGameDb();
    await placedGroup(db, [1, 2, 3]);
    gain(db, 1, 900);
    gain(db, 2, 20);
    gain(db, 3, 10);
    privacy.set(id(1), { showOnlineStatus: false });

    await settlement(db).settleDue(AFTER_CLOSE);

    expect(db.leagueMembership.rows.find((m) => m.userId === id(1))).toMatchObject({ cup: null, zone: 'safe' });
    expect(db.leagueMembership.rows.find((m) => m.userId === id(2))).toMatchObject({ finalRank: 1, cup: 'gold' });
  });
});

describe('LeagueSettlement.settleDue — les notifications du résultat (#9490)', () => {
  const AFTER_CLOSE = new Date('2026-10-25T20:30:00Z');

  const withNotifier = (db: FakeGameDb) => {
    const events: Array<Record<string, unknown>> = [];
    const notifier = { notify: jest.fn(async (event: Record<string, unknown>) => { events.push(event); return 'sent' as const; }) };
    const service = new LeagueSettlement(db.prisma, { pseudonyms: new LeaguePseudonymService(db.prisma, { draw: () => (draw += 1) }), notifier: notifier as never });
    return { service, events, notifier };
  };

  it('chaque membre d’un groupe réglé reçoit SON résultat — sa zone, sa coupe, sa ligue —, jamais celui d’un autre', async () => {
    const db = fakeGameDb();
    for (const n of [1, 2, 3, 4]) player(db, n);
    await settlement(db).placeWeek(WEEK, MONDAY);
    gain(db, 1, 300);
    gain(db, 2, 200);
    gain(db, 3, 100);
    gain(db, 4, 0, WEEK, '2026-10-21');
    const { service, events } = withNotifier(db);

    await service.settleDue(AFTER_CLOSE);

    expect(events).toHaveLength(4);
    expect(events.map((e) => e.recipientId).sort()).toEqual([1, 2, 3, 4].map(id).sort());
    expect(events.every((e) => e.kind === 'league-result' && e.weekKey === WEEK && e.league === 'quartz')).toBe(true);
    const first = events.find((e) => e.recipientId === id(1))!;
    expect(first).toMatchObject({ zone: 'promotion', cup: 'gold', nextLeague: expect.any(String) });
    expect(Object.keys(first).sort()).toEqual(['cup', 'kind', 'league', 'nextLeague', 'recipientId', 'weekKey', 'zone']);
  });

  it('un groupe sans adversaire ne paie rien et ne notifie personne', async () => {
    const db = fakeGameDb();
    player(db, 1);
    await settlement(db).placeWeek(WEEK, MONDAY);
    const { service, events } = withNotifier(db);
    await service.settleDue(AFTER_CLOSE);
    expect(events).toEqual([]);
  });

  it('un membre écarté (suspendu) n’est pas notifié', async () => {
    const db = fakeGameDb();
    for (const n of [1, 2, 3]) player(db, n);
    await settlement(db).placeWeek(WEEK, MONDAY);
    gain(db, 1, 900);
    privacy.set(id(1), { showOnlineStatus: false });
    const { service, events } = withNotifier(db);
    await service.settleDue(AFTER_CLOSE);
    expect(events.map((e) => e.recipientId)).not.toContain(id(1));
    expect(events).toHaveLength(2);
  });

  it('une notification qui échoue ne retient pas le règlement : le groupe est réglé', async () => {
    const db = fakeGameDb();
    for (const n of [1, 2, 3]) player(db, n);
    await settlement(db).placeWeek(WEEK, MONDAY);
    const service = new LeagueSettlement(db.prisma, {
      pseudonyms: new LeaguePseudonymService(db.prisma, { draw: () => (draw += 1) }),
      notifier: { notify: async () => { throw new Error('push down'); } } as never,
    });
    expect(await service.settleDue(AFTER_CLOSE)).toBe(1);
    expect(db.leagueGroupWeek.rows[0]!.settledAt).toEqual(AFTER_CLOSE);
  });
});

describe('LeagueSettlement.refreshSnapshots', () => {
  it('fige une fois par jour de groupe, à 4 h : les totaux ne bougent pas entre deux instantanés', async () => {
    const db = fakeGameDb();
    for (const n of [1, 2]) player(db, n);
    await settlement(db).placeWeek(WEEK, MONDAY);
    gain(db, 1, 40);

    expect(await settlement(db).refreshSnapshots(new Date('2026-10-20T03:00:00Z'))).toBe(0);
    expect(await settlement(db).refreshSnapshots(new Date('2026-10-20T04:00:00Z'))).toBe(1);
    expect(db.leagueGroupWeek.rows[0]!.snapshot).toEqual({ [id(1)]: 40, [id(2)]: 0 });
    expect(db.leagueGroupWeek.rows[0]!.snapshotDay).toBe('2026-10-20');

    gain(db, 2, 25, WEEK, '2026-10-20');
    expect(await settlement(db).refreshSnapshots(new Date('2026-10-20T15:00:00Z'))).toBe(0);
    expect(db.leagueGroupWeek.rows[0]!.snapshot).toEqual({ [id(1)]: 40, [id(2)]: 0 });

    expect(await settlement(db).refreshSnapshots(new Date('2026-10-21T04:00:00Z'))).toBe(1);
    expect(db.leagueGroupWeek.rows[0]!.snapshot).toEqual({ [id(1)]: 40, [id(2)]: 25 });
  });

  it('un groupe réglé n’est plus rafraîchi', async () => {
    const db = fakeGameDb();
    for (const n of [1, 2]) player(db, n);
    await settlement(db).placeWeek(WEEK, MONDAY);
    db.leagueGroupWeek.rows[0]!.settledAt = new Date();
    expect(await settlement(db).refreshSnapshots(new Date('2026-10-22T04:00:00Z'))).toBe(0);
  });
});

describe('LeagueSettlement.purgeOld — la conservation (A-9)', () => {
  const seed = (db: FakeGameDb) => {
    for (const weekKey of ['2026-10-12', '2026-12-07']) {
      db.leagueGroupWeek.rows.push({ id: `g-${weekKey}`, groupId: `g-${weekKey}`, weekKey, league: 'jade' });
      db.leagueMembership.rows.push({ id: `m-${weekKey}`, userId: id(1), weekKey, groupId: `g-${weekKey}`, league: 'jade' });
      db.gameWeekPoints.rows.push({ id: `p-${weekKey}`, userId: id(1), weekKey, dayKey: weekKey, points: 5 });
    }
  };

  it('garde la saison tant que 4 semaines ne se sont pas écoulées après sa fin', async () => {
    const db = fakeGameDb();
    seed(db);
    expect(await settlement(db).purgeOld(new Date('2027-01-03T00:00:00Z'))).toBe(0);
  });

  it('supprime groupes, appartenances et points de la saison terminée depuis plus de 4 semaines', async () => {
    const db = fakeGameDb();
    seed(db);

    expect(await settlement(db).purgeOld(new Date('2027-01-04T00:00:00Z'))).toBe(3);

    expect(db.leagueGroupWeek.rows.map((r) => r.weekKey)).toEqual(['2026-12-07']);
    expect(db.leagueMembership.rows.map((r) => r.weekKey)).toEqual(['2026-12-07']);
    expect(db.gameWeekPoints.rows.map((r) => r.weekKey)).toEqual(['2026-12-07']);
  });

  it('ne purge rien avant la première saison', async () => {
    const db = fakeGameDb();
    seed(db);
    expect(await settlement(db).purgeOld(new Date('2026-10-01T00:00:00Z'))).toBe(0);
  });
});
