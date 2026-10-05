/**
 * LE REGISTRE DE GLOIRE (#9374) — en ajout seul, total lu au registre.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { GloryService, gloryTotalFromLedger } from '../GloryService';
import { fakeGameDb, seedUser, USER } from './fakeGameDb';

describe('GloryService.credit', () => {
  it('grave une ligne et le total se lit au registre', async () => {
    const db = fakeGameDb();
    seedUser(db);
    const service = new GloryService(db.prisma);

    const written = await service.credit({ userId: USER, delta: 100, reason: 'mint', requestId: 'mint:abc' });

    expect(written).toBe(true);
    expect(await gloryTotalFromLedger(db.prisma, USER)).toBe(100);
  });

  it('rejouer la même clé ne grave rien de plus (idempotence par requestId)', async () => {
    const db = fakeGameDb();
    const service = new GloryService(db.prisma);

    await service.credit({ userId: USER, delta: 20, reason: 'level', requestId: 'level:2' });
    const second = await service.credit({ userId: USER, delta: 20, reason: 'level', requestId: 'level:2' });

    expect(second).toBe(false);
    expect(await service.total(USER)).toBe(20);
  });

  it('un compte sans ligne a une Gloire de zéro, pas null', async () => {
    const db = fakeGameDb();
    expect(await gloryTotalFromLedger(db.prisma, USER)).toBe(0);
  });

  it('refuse un delta nul : le registre ne grave jamais zéro', async () => {
    const db = fakeGameDb();
    const written = await new GloryService(db.prisma).credit({ userId: USER, delta: 0, reason: 'level', requestId: 'level:3' });
    expect(written).toBe(false);
    expect(db.gloryLedger.rows).toHaveLength(0);
  });
});

describe('GloryService.creditLevelProgress — la Gloire du premier passage', () => {
  it('20 par niveau inédit, une ligne par niveau, et le record monte', async () => {
    const db = fakeGameDb();
    seedUser(db, { levelRecord: 3 });
    const service = new GloryService(db.prisma);

    const gained = await service.creditLevelProgress({ userId: USER, score: 10 * 6 * 6, previousRecord: 3 });

    expect(gained).toBe(60);
    expect(db.gloryLedger.rows.map((r) => r.requestId)).toEqual(['level:4', 'level:5', 'level:6']);
    expect(db.user.rows[0]?.levelRecord).toBe(6);
  });

  it('un niveau déjà connu ne rapporte rien — redescendre puis remonter ne paie pas deux fois', async () => {
    const db = fakeGameDb();
    seedUser(db, { levelRecord: 10 });

    const gained = await new GloryService(db.prisma).creditLevelProgress({ userId: USER, score: 10 * 7 * 7, previousRecord: 10 });

    expect(gained).toBe(0);
    expect(db.gloryLedger.rows).toHaveLength(0);
    expect(db.user.rows[0]?.levelRecord).toBe(10);
  });

  it('un record absent (compte antérieur) se lit comme le niveau 1', async () => {
    const db = fakeGameDb();
    seedUser(db);

    const gained = await new GloryService(db.prisma).creditLevelProgress({ userId: USER, score: 10 * 3 * 3, previousRecord: null });

    expect(gained).toBe(40);
    expect(db.user.rows[0]?.levelRecord).toBe(3);
  });

  it('deux passages concurrents ne gravent pas deux fois le même niveau', async () => {
    const db = fakeGameDb();
    seedUser(db, { levelRecord: 1 });
    const service = new GloryService(db.prisma);

    await Promise.all([
      service.creditLevelProgress({ userId: USER, score: 40, previousRecord: 1 }),
      service.creditLevelProgress({ userId: USER, score: 40, previousRecord: 1 }),
    ]);

    expect(await service.total(USER)).toBe(20 * 1);
  });
});

describe('GloryService.creditFlameRecords', () => {
  it('une ligne par record de Flamme franchi', async () => {
    const db = fakeGameDb();
    const service = new GloryService(db.prisma);

    const gained = await service.creditFlameRecords({ userId: USER, previousLongest: 6, longest: 7 });

    expect(gained).toBe(50);
    expect(db.gloryLedger.rows[0]).toMatchObject({ requestId: 'flame-record:7', reason: 'flame-record', delta: 50 });
  });

  it('ne repaie pas un record déjà franchi', async () => {
    const db = fakeGameDb();
    const service = new GloryService(db.prisma);
    await service.creditFlameRecords({ userId: USER, previousLongest: 6, longest: 7 });

    const again = await service.creditFlameRecords({ userId: USER, previousLongest: 6, longest: 7 });

    expect(again).toBe(0);
    expect(await service.total(USER)).toBe(50);
  });
});
