/**
 * LES CENT PLACES DU MYTHE (#9636) — attribution atomique dans l'ordre d'arrivée,
 * jamais une 101e, jamais deux places pour un compte, jamais retirées.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { MythicSeatService, mythicSeatId } from '../MythicSeatService';
import { fakeGameDb, type FakeGameDb } from './fakeGameDb';

const uid = (n: number) => `68b${String(n).padStart(21, '0')}`;
const NOW = new Date('2027-03-01T00:00:00Z');

const fillSeats = (db: FakeGameDb, count: number) => {
  for (let n = 1; n <= count; n += 1) db.mythicSeat.rows.push({ id: mythicSeatId(n), number: n, userId: uid(1000 + n), glory: 1_000_000, grantedAt: NOW });
};

const seed = (db: FakeGameDb, n: number, glory: number, at = '2027-01-01T00:00:00Z') => {
  db.user.rows.push({ id: uid(n), isActive: true, deletedAt: null });
  db.gloryLedger.rows.push({ id: `g${n}`, userId: uid(n), delta: glory, reason: 'season', requestId: `season:${n}`, createdAt: new Date(at) });
};

describe('MythicSeatService.claimIfEligible', () => {
  it('999 999 ne prend rien, 1 000 000 prend la place n° 1', async () => {
    const db = fakeGameDb();
    const seats = new MythicSeatService(db.prisma);
    expect(await seats.claimIfEligible(uid(1), 999_999, NOW)).toBeNull();
    expect(db.mythicSeat.rows).toHaveLength(0);
    expect(await seats.claimIfEligible(uid(1), 1_000_000, NOW)).toBe(1);
    expect(db.mythicSeat.rows).toEqual([{ id: mythicSeatId(1), number: 1, userId: uid(1), glory: 1_000_000, grantedAt: NOW, createdAt: expect.any(Date) }]);
  });

  it('lit la Gloire au registre quand l’appelant ne la donne pas', async () => {
    const db = fakeGameDb();
    seed(db, 1, 1_000_000);
    expect(await new MythicSeatService(db.prisma).claimIfEligible(uid(1))).toBe(1);
  });

  it('la 100e place se prend, la 101e jamais', async () => {
    const db = fakeGameDb();
    fillSeats(db, 99);
    const seats = new MythicSeatService(db.prisma);
    expect(await seats.claimIfEligible(uid(1), 1_000_000, NOW)).toBe(100);
    expect(await seats.claimIfEligible(uid(2), 5_000_000, NOW)).toBeNull();
    expect(db.mythicSeat.rows).toHaveLength(100);
    expect(Math.max(...db.mythicSeat.rows.map((r) => r.number as number))).toBe(100);
  });

  it('deux comptes simultanés pour la dernière place : un seul la prend, l’autre n’en a pas de 101e', async () => {
    const db = fakeGameDb();
    fillSeats(db, 99);
    const seats = new MythicSeatService(db.prisma);
    const results = await Promise.all([seats.claimIfEligible(uid(1), 1_000_000, NOW), seats.claimIfEligible(uid(2), 1_000_000, NOW)]);
    expect([...results].sort()).toEqual([100, null].sort());
    expect(db.mythicSeat.rows).toHaveLength(100);
  });

  it('dix comptes simultanés prennent dix numéros distincts, sans trou', async () => {
    const db = fakeGameDb();
    const seats = new MythicSeatService(db.prisma);
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => seats.claimIfEligible(uid(i + 1), 1_000_000, NOW)));
    expect([...results].sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(new Set(db.mythicSeat.rows.map((r) => r.userId)).size).toBe(10);
  });

  it('un compte qui demande deux fois en même temps n’a qu’une place', async () => {
    const db = fakeGameDb();
    const seats = new MythicSeatService(db.prisma);
    const results = await Promise.all([seats.claimIfEligible(uid(1), 1_000_000, NOW), seats.claimIfEligible(uid(1), 1_000_000, NOW)]);
    expect(results).toEqual([1, 1]);
    expect(db.mythicSeat.rows).toHaveLength(1);
  });

  it('la place est définitive : une Gloire corrigée sous le seuil la garde, et la redemander rend la même', async () => {
    const db = fakeGameDb();
    const seats = new MythicSeatService(db.prisma);
    await seats.claimIfEligible(uid(1), 1_000_000, NOW);
    expect(await seats.claimIfEligible(uid(1), 10, NOW)).toBe(1);
    expect(await seats.seatOf(uid(1))).toBe(1);
  });

  it('le numéro dérive l’identifiant de la ligne : la collision tient même sans l’unique du numéro', () => {
    expect(mythicSeatId(1)).toBe('6d7974686500000000000001');
    expect(mythicSeatId(100)).toBe('6d7974686500000000000064');
    expect(mythicSeatId(100)).toMatch(/^[0-9a-f]{24}$/);
  });
});

describe('MythicSeatService.sweep — le rattrapage de la nuit', () => {
  it('range par instant de franchissement, et s’arrête à la 100e', async () => {
    const db = fakeGameDb();
    fillSeats(db, 98);
    seed(db, 1, 1_000_000, '2027-02-03T00:00:00Z');
    seed(db, 2, 1_000_000, '2027-02-01T00:00:00Z');
    seed(db, 3, 1_000_000, '2027-02-02T00:00:00Z');

    const granted = await new MythicSeatService(db.prisma).sweep(NOW);

    expect(granted).toEqual([
      { userId: uid(2), number: 99 },
      { userId: uid(3), number: 100 },
    ]);
    expect(await new MythicSeatService(db.prisma).seatOf(uid(1))).toBeNull();
  });

  it('relire le registre ne retire ni ne renumérote aucune place', async () => {
    const db = fakeGameDb();
    seed(db, 1, 1_000_000);
    const seats = new MythicSeatService(db.prisma);
    await seats.sweep(NOW);
    db.gloryLedger.rows.push({ id: 'fix', userId: uid(1), delta: -500_000, reason: 'correction', requestId: 'fix:1', createdAt: NOW });
    expect(await seats.sweep(NOW)).toEqual([]);
    expect(db.mythicSeat.rows.map((r) => [r.userId, r.number])).toEqual([[uid(1), 1]]);
  });
});

describe('MythicSeatService.vacate — la suppression du compte', () => {
  it('la place reste prise, ne nomme plus le compte, et ne se réattribue pas', async () => {
    const db = fakeGameDb();
    const seats = new MythicSeatService(db.prisma);
    await seats.claimIfEligible(uid(1), 1_000_000, NOW);

    expect(await seats.vacate(uid(1), NOW)).toBe(1);

    expect(db.mythicSeat.rows).toHaveLength(1);
    expect(db.mythicSeat.rows[0]).toMatchObject({ number: 1, vacatedAt: NOW });
    expect(db.mythicSeat.rows[0]!.userId).not.toBe(uid(1));
    expect(db.mythicSeat.rows[0]!.userId).toMatch(/^[0-9a-f]{24}$/);
    expect(await seats.claimIfEligible(uid(2), 1_000_000, NOW)).toBe(2);
  });
});
