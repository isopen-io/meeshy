/**
 * LA SAISON (#9386) — étoiles des missions et du duo, étapes réclamées une seule
 * fois (même en concurrence), règlement du parcours terminé, Sceau acheté en
 * Meeshes, saison fermée.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { SeasonService } from '../SeasonService';
import { fakeGameDb, seedUser, USER, type FakeGameDb } from './fakeGameDb';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

const IN_SEASON = new Date('2026-10-14T12:00:00Z');
const BEFORE = new Date('2026-10-05T12:00:00Z');

const setup = (stars = 0, extra: Record<string, unknown> = {}) => {
  const db = fakeGameDb();
  seedUser(db, { engagementScore: 500, ...extra });
  if (stars > 0) db.gameSeason.rows.push({ id: 's', userId: USER, number: 1, stars, claimedSteps: [], sealOwnedAt: null });
  const creditPoints = jest.fn<(userId: string, points: number, axis: string) => Promise<void>>().mockResolvedValue(undefined);
  const grantFreeze = jest.fn<(userId: string) => Promise<void>>().mockResolvedValue(undefined);
  const service = new SeasonService(db.prisma, { creditPoints, grantFreeze });
  return { db, service, creditPoints, grantFreeze };
};

const withMeeshes = (db: FakeGameDb, balance: number) =>
  db.meeshLedger.rows.push({ id: 'g1', userId: USER, delta: balance, reason: 'grant', requestId: 'octroi-0001' });

describe('SeasonService.addStars', () => {
  it('1 · 1 · 2 · 3 étoiles selon la difficulté, 5 pour un duo', async () => {
    const { service } = setup();
    for (const source of ['easy', 'medium', 'hard', 'gold', 'duo'] as const) await service.addStars(USER, source, IN_SEASON);
    expect((await service.state(USER, IN_SEASON)).stars).toBe(1 + 1 + 2 + 3 + 5);
  });

  it('deux premières étoiles concurrentes : l’upsert perdant (P2002 de MongoDB) se rejoue, aucune étoile ne se perd', async () => {
    const { db, service } = setup();
    const upsert = db.gameSeason.upsert.bind(db.gameSeason);
    let raced = false;
    db.gameSeason.upsert = (async (args: Parameters<typeof upsert>[0]) => {
      if (!raced) {
        raced = true;
        db.gameSeason.rows.push({ id: 'racer', userId: USER, number: 1, stars: 3, claimedSteps: [], sealOwnedAt: null });
        throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
      }
      return upsert(args);
    }) as typeof upsert;

    await service.addStars(USER, 'easy', IN_SEASON);

    expect(db.gameSeason.rows.map((r) => r.stars)).toEqual([4]);
  });

  it('avant la première saison, rien n’est écrit', async () => {
    const { db, service } = setup();
    await service.addStars(USER, 'gold', BEFORE);
    expect(db.gameSeason.rows).toHaveLength(0);
    expect(await service.state(USER, BEFORE)).toMatchObject({ number: null, stars: 0 });
  });
});

describe('SeasonService.claim', () => {
  it('un paiement qui échoue rend SA seule étape : une étape réclamée en même temps par une autre requête reste réclamée, et ne se paie pas deux fois', async () => {
    const { db, service, creditPoints } = setup(8);
    let concurrent: Promise<unknown> | null = null;
    creditPoints.mockImplementationOnce(async () => {
      concurrent = service.claim({ userId: USER, step: 2, now: IN_SEASON });
      await concurrent;
      throw new Error('credit down');
    });

    await expect(service.claim({ userId: USER, step: 1, now: IN_SEASON })).rejects.toThrow('credit down');
    expect(db.gameSeason.rows[0]!.claimedSteps).toEqual([2]);

    expect(await service.claim({ userId: USER, step: 2, now: IN_SEASON })).toMatchObject({ status: 'already-claimed' });
    expect(creditPoints).toHaveBeenCalledTimes(2);
  });

  it('une étape non atteinte est verrouillée, une étape hors parcours n’existe pas', async () => {
    const { service } = setup(3);
    await expect(service.claim({ userId: USER, step: 1, now: IN_SEASON })).rejects.toMatchObject({ code: 'SEASON_STEP_LOCKED' });
    await expect(service.claim({ userId: USER, step: 41, now: IN_SEASON })).rejects.toMatchObject({ code: 'SEASON_STEP_NOT_FOUND' });
  });

  it('avant la première saison, SEASON_NOT_OPEN', async () => {
    const { service } = setup(40);
    await expect(service.claim({ userId: USER, step: 1, now: BEFORE })).rejects.toMatchObject({ code: 'SEASON_NOT_OPEN' });
  });

  it('une étape de points crédite 100 points, une fois, et se grave', async () => {
    const { db, service, creditPoints } = setup(8);

    const result = await service.claim({ userId: USER, step: 2, now: IN_SEASON });

    expect(result).toMatchObject({ status: 'claimed', step: 2, reward: { kind: 'points', amount: 100 }, completed: false, gloryGained: 0 });
    expect(creditPoints).toHaveBeenCalledWith(USER, 100, 'content.text_message');
    expect(db.gameSeason.rows[0]!.claimedSteps).toEqual([2]);
  });

  it('rejouer rend already-claimed sans payer de nouveau', async () => {
    const { service, creditPoints } = setup(8);
    await service.claim({ userId: USER, step: 2, now: IN_SEASON });

    const again = await service.claim({ userId: USER, step: 2, now: IN_SEASON });

    expect(again).toMatchObject({ status: 'already-claimed', step: 2, gloryGained: 0 });
    expect(creditPoints).toHaveBeenCalledTimes(1);
  });

  it('deux réclamations concurrentes ne paient qu’une récompense', async () => {
    const { service, creditPoints } = setup(8);
    const [a, b] = await Promise.all([service.claim({ userId: USER, step: 1, now: IN_SEASON }), service.claim({ userId: USER, step: 1, now: IN_SEASON })]);
    expect([a.status, b.status].sort()).toEqual(['already-claimed', 'claimed']);
    expect(creditPoints).toHaveBeenCalledTimes(1);
  });

  it('l’étape 10 offre un gel de Flamme', async () => {
    const { service, grantFreeze } = setup(40);
    const result = await service.claim({ userId: USER, step: 10, now: IN_SEASON });
    expect(result.reward).toEqual({ kind: 'freeze', amount: 1 });
    expect(grantFreeze).toHaveBeenCalledWith(USER);
  });

  it('l’étape 5 offre un fragment, sans paiement de points', async () => {
    const { service, creditPoints } = setup(40);
    const result = await service.claim({ userId: USER, step: 5, now: IN_SEASON });
    expect(result.reward).toEqual({ kind: 'fragment', amount: 1 });
    expect(creditPoints).not.toHaveBeenCalled();
  });

  it('un paiement qui échoue rend la réclamation : l’étape reste réclamable', async () => {
    const { db, service, creditPoints } = setup(8);
    creditPoints.mockRejectedValueOnce(new Error('down'));

    await expect(service.claim({ userId: USER, step: 2, now: IN_SEASON })).rejects.toThrow('down');
    expect(db.gameSeason.rows[0]!.claimedSteps).toEqual([]);

    expect((await service.claim({ userId: USER, step: 2, now: IN_SEASON })).status).toBe('claimed');
  });

  it('le Sceau possédé ajoute le cosmétique de la rangée aux étapes qui en portent un', async () => {
    const { db, service } = setup(40);
    db.gameSeason.rows[0]!.sealOwnedAt = new Date();
    const withSeal = await service.claim({ userId: USER, step: 4, now: IN_SEASON });
    const without = await service.claim({ userId: USER, step: 3, now: IN_SEASON });
    expect(withSeal.seal).toEqual({ cosmeticKey: 'season-1.seal-1' });
    expect(without.seal).toBeNull();
  });

  it('l’étape 40 règle la saison : coupe, +500 de Gloire, trophée daté — une seule fois', async () => {
    const { db, service } = setup(160);

    const result = await service.claim({ userId: USER, step: 40, now: IN_SEASON });

    expect(result).toMatchObject({ status: 'claimed', completed: true, gloryGained: 500, reward: { kind: 'season-cup' } });
    expect(db.gloryLedger.rows).toHaveLength(1);
    expect(db.gloryLedger.rows[0]).toMatchObject({ reason: 'season', requestId: 'season:1', delta: 500 });
    expect(db.gameTrophy.rows.map((t) => t.key)).toEqual(['trophy.season-cup.1']);
    expect(db.gameSeason.rows[0]!.settledAt).not.toBeNull();

    const again = await service.claim({ userId: USER, step: 40, now: IN_SEASON });
    expect(again.gloryGained).toBe(0);
    expect(db.gloryLedger.rows).toHaveLength(1);
  });

  it('une saison terminée ne se réclame plus : la suivante repart de zéro', async () => {
    const { service } = setup(160);
    const nextSeason = new Date('2026-12-10T12:00:00Z');
    expect((await service.state(USER, nextSeason)).stars).toBe(0);
    await expect(service.claim({ userId: USER, step: 1, now: nextSeason })).rejects.toMatchObject({ code: 'SEASON_STEP_LOCKED' });
  });
});

describe('SeasonService.buySeal', () => {
  it('refuse sans assez de Meeshes, sans rien écrire', async () => {
    const { db, service } = setup();
    withMeeshes(db, 9);
    await expect(service.buySeal({ userId: USER, requestId: 'sceau-0001', now: IN_SEASON })).rejects.toMatchObject({ code: 'INSUFFICIENT_MEESHES', details: { balance: 9 } });
    expect(db.gameSeason.rows).toHaveLength(0);
  });

  it('achète pour 10 Meeshes, pose le Sceau, et rejouer rend already-bought sans débiter', async () => {
    const { db, service } = setup();
    withMeeshes(db, 12);

    expect(await service.buySeal({ userId: USER, requestId: 'sceau-0001', now: IN_SEASON })).toEqual({ status: 'bought', balance: 2 });
    expect(db.gameSeason.rows[0]!.sealOwnedAt).not.toBeNull();
    expect(await service.buySeal({ userId: USER, requestId: 'sceau-0001', now: IN_SEASON })).toEqual({ status: 'already-bought', balance: 2 });
    expect(db.meeshLedger.rows.filter((r) => r.reason === 'spend')).toHaveLength(1);
  });

  it('un Sceau déjà possédé refuse un second achat sous un autre requestId', async () => {
    const { db, service } = setup();
    withMeeshes(db, 30);
    await service.buySeal({ userId: USER, requestId: 'sceau-0001', now: IN_SEASON });
    await expect(service.buySeal({ userId: USER, requestId: 'sceau-0002', now: IN_SEASON })).rejects.toMatchObject({ code: 'SEAL_ALREADY_OWNED' });
  });

  it('avant la première saison, SEASON_NOT_OPEN', async () => {
    const { db, service } = setup();
    withMeeshes(db, 30);
    await expect(service.buySeal({ userId: USER, requestId: 'sceau-0001', now: BEFORE })).rejects.toMatchObject({ code: 'SEASON_NOT_OPEN' });
  });

  it('la saison reste hors argent : aucune ligne de registre ne crédite un Sceau', async () => {
    const { db, service } = setup();
    withMeeshes(db, 12);
    await service.buySeal({ userId: USER, requestId: 'sceau-0001', now: IN_SEASON });
    expect(db.meeshLedger.rows.filter((r) => (r.delta as number) > 0 && r.reason !== 'grant')).toHaveLength(0);
  });
});
