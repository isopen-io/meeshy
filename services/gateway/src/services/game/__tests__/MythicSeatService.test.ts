/**
 * LES CENT PLACES DU MYTHE (#9636) — une seule porte (`sweep`), dans l'ordre d'arrivée, jamais
 * une 101e, jamais deux places pour un compte ; la suppression d'un compte LIBÈRE sa place pour le
 * plus ancien en attente, avec une émission neuve (décision porteur 2026-10-08).
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { mythicSignature } from '@meeshy/shared/utils/game/mythic-signature';
import { purgeGameData } from '../GamePurge';
import { MythicSeatService, mythicEditionId, mythicSeatId } from '../MythicSeatService';
import { fakeGameDb, type FakeGameDb } from './fakeGameDb';

const uid = (n: number) => `68b${String(n).padStart(21, '0')}`;
const NOW = new Date('2027-03-01T00:00:00Z');

const live = (db: FakeGameDb, n: number, fields: Record<string, unknown> = {}) =>
  db.user.rows.push({ id: uid(n), isActive: true, deletedAt: null, role: 'USER', ...fields });

const cross = (db: FakeGameDb, n: number, glory = 1_000_000, at = '2027-01-01T00:00:00Z') =>
  db.gloryLedger.rows.push({ id: `g${n}-${at}`, userId: uid(n), delta: glory, reason: 'season', requestId: `season:${n}:${at}`, createdAt: new Date(at) });

/** Les 100 places prises par d'autres comptes, avec les émissions 1 à 100 déjà tirées. */
const fillSeats = (db: FakeGameDb, count: number) => {
  for (let n = 1; n <= count; n += 1) {
    db.mythicEdition.rows.push({ id: mythicEditionId(n), edition: n, grantedAt: NOW });
    db.mythicSeat.rows.push({ id: mythicSeatId(n), number: n, userId: uid(1000 + n), edition: n, glory: 1_000_000, grantedAt: NOW });
  }
};

describe('MythicSeatService.claimIfEligible', () => {
  it('999 999 ne prend rien, 1 000 000 prend la place 1 et l’émission 1', async () => {
    const db = fakeGameDb();
    live(db, 1);
    cross(db, 1, 999_999);
    const seats = new MythicSeatService(db.prisma);
    expect(await seats.claimIfEligible(uid(1), undefined, NOW)).toBeNull();
    cross(db, 1, 1, '2027-01-02T00:00:00Z');
    expect(await seats.claimIfEligible(uid(1), undefined, NOW)).toEqual({ number: 1, edition: 1 });
    expect(db.mythicEdition.rows.map((r) => Object.keys(r).sort())).toEqual([['createdAt', 'edition', 'grantedAt', 'id']]);
  });

  it('décide au REGISTRE : une Gloire annoncée par l’appelant ne suffit pas', async () => {
    const db = fakeGameDb();
    live(db, 1);
    cross(db, 1, 10);
    expect(await new MythicSeatService(db.prisma).claimIfEligible(uid(1), 5_000_000, NOW)).toBeNull();
    expect(db.mythicSeat.rows).toHaveLength(0);
  });

  it('un compte désactivé, supprimé ou d’agent ne prend jamais de place', async () => {
    for (const fields of [{ isActive: false }, { deletedAt: new Date() }, { role: 'AGENT' }]) {
      const db = fakeGameDb();
      live(db, 1, fields);
      cross(db, 1);
      expect(await new MythicSeatService(db.prisma).claimIfEligible(uid(1), undefined, NOW)).toBeNull();
      expect(db.mythicSeat.rows).toHaveLength(0);
    }
  });

  it('la 100e place se prend, la 101e jamais', async () => {
    const db = fakeGameDb();
    fillSeats(db, 99);
    [1, 2].forEach((n) => { live(db, n); cross(db, n); });
    const seats = new MythicSeatService(db.prisma);
    expect(await seats.claimIfEligible(uid(1), undefined, NOW)).toEqual({ number: 100, edition: 100 });
    expect(await seats.claimIfEligible(uid(2), undefined, NOW)).toBeNull();
    expect(db.mythicSeat.rows).toHaveLength(100);
  });

  it('deux comptes simultanés pour la dernière place : un seul la prend, jamais de 101e', async () => {
    const db = fakeGameDb();
    fillSeats(db, 99);
    [1, 2].forEach((n) => { live(db, n); cross(db, n, 1_000_000, `2027-01-0${n}T00:00:00Z`); });
    const seats = new MythicSeatService(db.prisma);
    await Promise.all([seats.claimIfEligible(uid(2), undefined, NOW), seats.claimIfEligible(uid(1), undefined, NOW)]);
    expect(db.mythicSeat.rows).toHaveLength(100);
    expect(await seats.seatOf(uid(1))).toEqual({ number: 100, edition: 100 });
    expect(await seats.seatOf(uid(2))).toBeNull();
  });

  it('dix comptes simultanés prennent dix places et dix émissions distinctes', async () => {
    const db = fakeGameDb();
    for (let n = 1; n <= 10; n += 1) { live(db, n); cross(db, n); }
    const seats = new MythicSeatService(db.prisma);
    await Promise.all(Array.from({ length: 10 }, (_, i) => seats.claimIfEligible(uid(i + 1), undefined, NOW)));
    expect(db.mythicSeat.rows.map((r) => r.number).sort((a, b) => (a as number) - (b as number))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(new Set(db.mythicSeat.rows.map((r) => r.userId)).size).toBe(10);
    expect(new Set(db.mythicSeat.rows.map((r) => r.edition)).size).toBe(10);
  });

  it('un compte qui demande deux fois en même temps n’a qu’une place', async () => {
    const db = fakeGameDb();
    live(db, 1);
    cross(db, 1);
    const seats = new MythicSeatService(db.prisma);
    await Promise.all([seats.claimIfEligible(uid(1), undefined, NOW), seats.claimIfEligible(uid(1), undefined, NOW)]);
    expect(db.mythicSeat.rows).toHaveLength(1);
  });

  it('tant que le compte existe, la place ne se perd pas : une Gloire corrigée sous le seuil la garde', async () => {
    const db = fakeGameDb();
    live(db, 1);
    cross(db, 1);
    const seats = new MythicSeatService(db.prisma);
    await seats.claimIfEligible(uid(1), undefined, NOW);
    db.gloryLedger.rows.push({ id: 'fix', userId: uid(1), delta: -500_000, reason: 'correction', requestId: 'fix:1', createdAt: NOW });
    await seats.sweep(NOW);
    expect(await seats.claimIfEligible(uid(1), 10, NOW)).toEqual({ number: 1, edition: 1 });
  });

  it('les identifiants dérivés sont des ObjectId : la collision tient même sans les uniques', () => {
    expect(mythicSeatId(1)).toBe('6d7974686500000000000001');
    expect(mythicSeatId(100)).toBe('6d7974686500000000000064');
    expect(mythicEditionId(409_601)).toBe('6d6564697400000000064001');
    expect([mythicSeatId(100), mythicEditionId(1)].every((id) => /^[0-9a-f]{24}$/.test(id))).toBe(true);
  });
});

describe('MythicSeatService.sweep — l’ordre d’arrivée', () => {
  it('range par instant de franchissement, et s’arrête à la 100e', async () => {
    const db = fakeGameDb();
    fillSeats(db, 98);
    [[1, '2027-02-03'], [2, '2027-02-01'], [3, '2027-02-02']].forEach(([n, day]) => { live(db, n as number); cross(db, n as number, 1_000_000, `${day}T00:00:00Z`); });

    const granted = await new MythicSeatService(db.prisma).sweep(NOW);

    expect(granted).toEqual([
      { userId: uid(2), number: 99, edition: 99 },
      { userId: uid(3), number: 100, edition: 100 },
    ]);
  });
});

describe('la suppression d’un compte libère sa place (décision porteur 2026-10-08)', () => {
  const purge = (db: FakeGameDb, n: number) => {
    db.user.rows.find((u) => u.id === uid(n))!.isActive = false;
    db.user.rows.find((u) => u.id === uid(n))!.deletedAt = NOW;
    return purgeGameData(db.prisma, uid(n), { creditPoints: async () => undefined });
  };

  it('la place revient au plus ancien en attente, avec une émission neuve et une Signature jamais vue', async () => {
    const db = fakeGameDb();
    fillSeats(db, 99);
    live(db, 1);
    cross(db, 1, 1_000_000, '2027-01-01T00:00:00Z');
    const seats = new MythicSeatService(db.prisma);
    expect(await seats.claimIfEligible(uid(1), undefined, NOW)).toEqual({ number: 100, edition: 100 });
    [[2, '2027-02-05'], [3, '2027-02-01'], [4, '2027-02-09']].forEach(([n, day]) => { live(db, n as number); cross(db, n as number, 1_000_000, `${day}T00:00:00Z`); });
    expect(await seats.sweep(NOW)).toEqual([]);

    const summary = await purge(db, 1);

    expect(summary.mythicSeatsReleased).toBe(1);
    expect(await seats.seatOf(uid(1))).toBeNull();
    expect(await seats.seatOf(uid(3))).toEqual({ number: 100, edition: 101 });
    expect(await seats.seatOf(uid(2))).toBeNull();
    const issued = db.mythicEdition.rows.map((r) => r.edition as number);
    expect(issued).toEqual(Array.from({ length: 101 }, (_, i) => i + 1));
    const drawn = (e: number) => JSON.stringify({ ...mythicSignature(e)!, edition: 0, numeral: '', hue: 0 });
    expect(issued.slice(0, 100).map(drawn)).not.toContain(drawn(101));
  });

  it('sans personne en attente, la place libérée va au prochain qui franchit le million', async () => {
    const db = fakeGameDb();
    fillSeats(db, 99);
    live(db, 1);
    cross(db, 1);
    const seats = new MythicSeatService(db.prisma);
    await seats.claimIfEligible(uid(1), undefined, NOW);
    await purge(db, 1);
    expect(db.mythicSeat.rows).toHaveLength(99);

    live(db, 5);
    cross(db, 5);
    expect(await seats.claimIfEligible(uid(5), undefined, NOW)).toEqual({ number: 100, edition: 101 });
  });

  it('aucune donnée du compte supprimé ne reste au registre', async () => {
    const db = fakeGameDb();
    live(db, 1);
    cross(db, 1);
    await new MythicSeatService(db.prisma).claimIfEligible(uid(1), undefined, NOW);
    await purge(db, 1);
    expect(JSON.stringify([db.mythicSeat.rows, db.mythicEdition.rows])).not.toContain(uid(1));
  });

  it('course : le compte est supprimé et purgé ENTRE la décision et l’écriture de sa place ⇒ aucune place ne le nomme', async () => {
    const db = fakeGameDb();
    live(db, 1);
    cross(db, 1);
    let deletedDuringGrant = false;
    const racing = new Proxy(db.prisma, {
      get(target, prop, receiver) {
        if (prop !== 'mythicSeat') return Reflect.get(target, prop, receiver);
        const model = db.mythicSeat;
        return new Proxy(model, {
          get(m, key, r) {
            if (key !== 'create') return Reflect.get(m, key, r);
            return async (args: { data: Record<string, unknown> }) => {
              if (!deletedDuringGrant && args.data.userId === uid(1)) {
                deletedDuringGrant = true;
                await purge(db, 1);
              }
              return m.create(args);
            };
          },
        });
      },
    }) as unknown as PrismaClient;

    await new MythicSeatService(racing).claimIfEligible(uid(1), undefined, NOW);

    expect(deletedDuringGrant).toBe(true);
    expect(db.mythicSeat.rows.filter((r) => r.userId === uid(1))).toEqual([]);
  });

  it('course : un compte marqué supprimé avant le franchissement ne prend jamais de place', async () => {
    const db = fakeGameDb();
    live(db, 1);
    cross(db, 1);
    await Promise.all([purge(db, 1), new MythicSeatService(db.prisma).claimIfEligible(uid(1), undefined, NOW)]);
    expect(db.mythicSeat.rows).toEqual([]);
  });
});
