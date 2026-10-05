/**
 * LE PRESTIGE (#9389) — au niveau 100, une étoile de plus, le score et le niveau
 * repartent, +1000 de Gloire, trophée numéroté ; atomique, idempotent, plafonné
 * à cinq étoiles.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { PrestigeService } from '../PrestigeService';
import { fakeGameDb, seedUser, USER, type FakeGameDb } from './fakeGameDb';

const LEVEL_100 = 10 * 100 * 100;

const setup = (fields: Record<string, unknown> = {}) => {
  const db = fakeGameDb();
  seedUser(db, { engagementScore: LEVEL_100, levelRecord: 100, ...fields });
  return { db, service: new PrestigeService(db.prisma) };
};

const total = (db: FakeGameDb) => db.gloryLedger.rows.reduce((s, r) => s + (r.delta as number), 0);

describe('PrestigeService.pass', () => {
  it('refuse sous le niveau 100 (PRESTIGE_LEVEL_TOO_LOW) et à cinq étoiles (PRESTIGE_AT_MAXIMUM)', async () => {
    const low = setup({ engagementScore: 500 });
    await expect(low.service.pass({ userId: USER, requestId: 'prestige-01' })).rejects.toMatchObject({ code: 'PRESTIGE_LEVEL_TOO_LOW' });
    expect(low.db.user.rows[0]!.engagementScore).toBe(500);

    const max = setup({ prestige: 5 });
    await expect(max.service.pass({ userId: USER, requestId: 'prestige-01' })).rejects.toMatchObject({ code: 'PRESTIGE_AT_MAXIMUM' });
  });

  it('passe : une étoile, score à 0, niveau record à 1, +1000 de Gloire, trophée numéroté', async () => {
    const { db, service } = setup();

    const result = await service.pass({ userId: USER, requestId: 'prestige-01' });

    expect(result).toEqual({ status: 'passed', prestige: 1, score: 0, level: 1, gloryGained: 1000, trophyKey: 'trophy.prestige.1' });
    expect(db.user.rows[0]).toMatchObject({ prestige: 1, engagementScore: 0, levelRecord: 1 });
    expect(total(db)).toBe(1000);
    expect(db.gloryLedger.rows[0]).toMatchObject({ reason: 'prestige', requestId: 'prestige:1' });
    expect(db.gameTrophy.rows.map((t) => t.key)).toEqual(['trophy.prestige.1']);
  });

  it('rejouer la même demande rend already-passed et ne paie rien de plus', async () => {
    const { db, service } = setup();
    await service.pass({ userId: USER, requestId: 'prestige-01' });

    const again = await service.pass({ userId: USER, requestId: 'prestige-01' });

    expect(again).toMatchObject({ status: 'already-passed', prestige: 1, gloryGained: 0, trophyKey: 'trophy.prestige.1' });
    expect(db.user.rows[0]!.prestige).toBe(1);
    expect(total(db)).toBe(1000);
    expect(db.gameTrophy.rows).toHaveLength(1);
  });

  it('un rejeu rattrape une suite tombée : la Gloire manquante se grave, une seule fois', async () => {
    const { db, service } = setup();
    await service.pass({ userId: USER, requestId: 'prestige-01' });
    db.gloryLedger.rows.length = 0;
    db.gameTrophy.rows.length = 0;

    await service.pass({ userId: USER, requestId: 'prestige-01' });
    await service.pass({ userId: USER, requestId: 'prestige-01' });

    expect(total(db)).toBe(1000);
    expect(db.gameTrophy.rows).toHaveLength(1);
  });

  it('deux demandes concurrentes avec des requestId différents : un seul passage', async () => {
    const { db, service } = setup();
    const results = await Promise.allSettled([service.pass({ userId: USER, requestId: 'prestige-aa' }), service.pass({ userId: USER, requestId: 'prestige-bb' })]);

    expect(db.user.rows[0]!.prestige).toBe(1);
    expect(total(db)).toBe(1000);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });

  it('un compte sans étoile (champ absent, antérieur au jeu) passe aussi', async () => {
    const { db, service } = setup();
    delete db.user.rows[0]!.prestige;
    expect((await service.pass({ userId: USER, requestId: 'prestige-01' })).prestige).toBe(1);
  });

  it('un crédit arrivé entre la lecture et l’écriture fait relire — le score écrit reste celui de la loi', async () => {
    const { db, service } = setup();
    const realFind = db.user.findUnique.bind(db.user);
    let first = true;
    (db.user as unknown as { findUnique: (args: unknown) => Promise<unknown> }).findUnique = async (args: unknown) => {
      const row = await realFind(args as never);
      if (first) {
        first = false;
        db.user.rows[0]!.engagementScore = LEVEL_100 + 25;
      }
      return row;
    };

    const result = await service.pass({ userId: USER, requestId: 'prestige-01' });

    expect(result.status).toBe('passed');
    expect(db.user.rows[0]!.engagementScore).toBe(0);
  });

  it('un doublon arrivé PENDANT le passage (demande réclamée, étoile pas encore écrite) ne paie ni Gloire ni trophée d’un Prestige qui n’a pas eu lieu', async () => {
    const { db, service } = setup();
    db.engagementQuota.rows.push({ id: 'q', userId: USER, operationKey: 'game.prestige', bucket: 'request:prestige-01', count: 1 });

    await expect(service.pass({ userId: USER, requestId: 'prestige-01' })).rejects.toThrow();

    expect(total(db)).toBe(0);
    expect(db.gameTrophy.rows).toHaveLength(0);
    expect(db.user.rows[0]!.prestige ?? null).toBeNull();
  });

  it('la deuxième étoile paie sa propre Gloire et son propre trophée', async () => {
    const { db, service } = setup({ prestige: 1 });
    const result = await service.pass({ userId: USER, requestId: 'prestige-02' });
    expect(result).toMatchObject({ prestige: 2, trophyKey: 'trophy.prestige.2', gloryGained: 1000 });
    expect(db.gloryLedger.rows.map((r) => r.requestId)).toEqual(['prestige:2']);
  });
});
