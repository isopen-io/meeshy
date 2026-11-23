/**
 * LA FLAMME CÔTÉ PASSERELLE (#9376) — gel acheté et consommé, rallumage sous
 * 48 h, transition de série. La loi (`advanceFlame`, `canRelight`…) vient de
 * `@meeshy/shared/utils/game/flame` : ici on teste qu'elle est APPLIQUÉE
 * contre le registre, jamais réécrite.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { FlameService, flameFactsOf, planStreak, writeStreak } from '../FlameService';
import { GameRefusal } from '../GameRefusal';
import { fakeGameDb, seedUser, USER, type FakeGameDb } from './fakeGameDb';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

const NOW = new Date('2026-10-05T12:00:00Z');

const grant = (db: FakeGameDb, balance: number) =>
  db.meeshLedger.rows.push({ id: 'g1', userId: USER, delta: balance, reason: 'grant', requestId: 'octroi-0001' });

const refusal = async (work: () => Promise<unknown>): Promise<GameRefusal> => {
  try {
    await work();
  } catch (error) {
    if (error instanceof GameRefusal) return error;
    throw error;
  }
  throw new Error('aucun refus levé');
};

describe('FlameService.buyFreeze', () => {
  it('achète un gel : une ligne spend de 1 Meesh, la réserve passe de absente à 1', async () => {
    const db = fakeGameDb();
    seedUser(db, { currentStreakDays: 4 });
    grant(db, 3);

    const issue = await new FlameService(db.prisma).buyFreeze({ userId: USER, requestId: 'gel-0000001', now: NOW });

    expect(issue).toEqual({ status: 'bought', freezes: 1, balance: 2 });
    expect(db.user.rows[0]?.flameFreezes).toBe(1);
    expect(db.meeshLedger.rows.at(-1)).toMatchObject({ delta: -1, reason: 'spend' });
  });

  it('refuse au maximum de 2 gels, sans rien débiter', async () => {
    const db = fakeGameDb();
    seedUser(db, { flameFreezes: 2 });
    grant(db, 3);

    const error = await refusal(() => new FlameService(db.prisma).buyFreeze({ userId: USER, requestId: 'gel-0000002', now: NOW }));

    expect(error.code).toBe('FREEZE_AT_MAXIMUM');
    expect(db.meeshLedger.rows).toHaveLength(1);
  });

  it('refuse quand il n’y a aucune Meesh, avec le motif du solde', async () => {
    const db = fakeGameDb();
    seedUser(db, {});

    const error = await refusal(() => new FlameService(db.prisma).buyFreeze({ userId: USER, requestId: 'gel-0000003', now: NOW }));

    expect(error.code).toBe('INSUFFICIENT_MEESHES');
  });

  it('rejouer la demande rend l’achat déjà fait, sans second débit ni second gel', async () => {
    const db = fakeGameDb();
    seedUser(db, {});
    grant(db, 3);
    const service = new FlameService(db.prisma);

    await service.buyFreeze({ userId: USER, requestId: 'gel-0000004', now: NOW });
    const again = await service.buyFreeze({ userId: USER, requestId: 'gel-0000004', now: NOW });

    expect(again).toEqual({ status: 'already-bought', freezes: 1, balance: 2 });
    expect(db.user.rows[0]?.flameFreezes).toBe(1);
  });
});

describe('FlameService.relight', () => {
  const extinguished = (db: FakeGameDb, fields: Record<string, unknown> = {}) =>
    seedUser(db, { currentStreakDays: 12, longestStreakDays: 12, lastStreakDate: new Date('2026-10-02T00:00:00Z'), ...fields });

  it('rallume une Flamme éteinte depuis moins de 48 h : 3 Meeshes, la série d’avant est rendue', async () => {
    const db = fakeGameDb();
    extinguished(db);
    grant(db, 4);

    const issue = await new FlameService(db.prisma).relight({ userId: USER, requestId: 'rallume-001', now: NOW });

    expect(issue).toEqual({ status: 'relit', streak: 12, balance: 1 });
    expect(db.user.rows[0]).toMatchObject({ currentStreakDays: 12, lastRelightDay: '2026-10-05' });
    expect((db.user.rows[0]?.lastStreakDate as Date).toISOString()).toBe('2026-10-04T00:00:00.000Z');
    expect(db.meeshLedger.rows.at(-1)).toMatchObject({ delta: -3, reason: 'spend' });
  });

  it('si le joueur a déjà agi aujourd’hui après la rupture, le geste du jour s’ajoute à la série rendue', async () => {
    const db = fakeGameDb();
    seedUser(db, {
      currentStreakDays: 1,
      longestStreakDays: 12,
      lastStreakDate: new Date('2026-10-05T00:00:00Z'),
      brokenStreakDays: 12,
      brokenStreakLastDay: '2026-10-02',
    });
    grant(db, 3);

    const issue = await new FlameService(db.prisma).relight({ userId: USER, requestId: 'rallume-002', now: NOW });

    expect(issue).toEqual({ status: 'relit', streak: 13, balance: 0 });
    expect((db.user.rows[0]?.lastStreakDate as Date).toISOString()).toBe('2026-10-05T00:00:00.000Z');
    expect(db.user.rows[0]?.brokenStreakDays).toBeNull();
    expect(db.user.rows[0]?.longestStreakDays).toBe(13);
  });

  it('refuse hors de la fenêtre de 48 h', async () => {
    const db = fakeGameDb();
    extinguished(db, { lastStreakDate: new Date('2026-09-30T00:00:00Z') });
    grant(db, 4);

    const error = await refusal(() => new FlameService(db.prisma).relight({ userId: USER, requestId: 'rallume-003', now: NOW }));

    expect(error).toMatchObject({ code: 'RELIGHT_NOT_ALLOWED', details: { reason: 'window-closed' } });
    expect(db.meeshLedger.rows).toHaveLength(1);
  });

  it('refuse une seconde fois dans le même mois', async () => {
    const db = fakeGameDb();
    extinguished(db, { lastRelightDay: '2026-10-01' });
    grant(db, 4);

    const error = await refusal(() => new FlameService(db.prisma).relight({ userId: USER, requestId: 'rallume-004', now: NOW }));

    expect(error).toMatchObject({ code: 'RELIGHT_NOT_ALLOWED', details: { reason: 'monthly-limit' } });
  });

  it('refuse quand la Flamme n’est pas éteinte', async () => {
    const db = fakeGameDb();
    extinguished(db, { lastStreakDate: new Date('2026-10-04T00:00:00Z') });
    grant(db, 4);

    const error = await refusal(() => new FlameService(db.prisma).relight({ userId: USER, requestId: 'rallume-005', now: NOW }));

    expect(error).toMatchObject({ code: 'RELIGHT_NOT_ALLOWED', details: { reason: 'not-extinguished' } });
  });

  it('refuse avec le motif du SOLDE quand il manque des Meeshes', async () => {
    const db = fakeGameDb();
    extinguished(db);
    grant(db, 2);

    const error = await refusal(() => new FlameService(db.prisma).relight({ userId: USER, requestId: 'rallume-006', now: NOW }));

    expect(error.code).toBe('INSUFFICIENT_MEESHES');
  });

  it('rejouer le rallumage ne débite pas deux fois', async () => {
    const db = fakeGameDb();
    extinguished(db);
    grant(db, 6);
    const service = new FlameService(db.prisma);

    await service.relight({ userId: USER, requestId: 'rallume-007', now: NOW });
    const again = await service.relight({ userId: USER, requestId: 'rallume-007', now: NOW });

    expect(again).toMatchObject({ status: 'already-relit', balance: 3 });
  });
});

describe('planStreak — la transition de série appliquée au geste du jour', () => {
  const facts = (fields: Partial<Parameters<typeof flameFactsOf>[0]>) =>
    flameFactsOf({ currentStreakDays: 5, longestStreakDays: 9, lastStreakDate: new Date('2026-10-04T00:00:00Z'), timezone: 'UTC', ...fields }, NOW);

  it('même jour : rien à écrire', () => {
    const plan = planStreak(facts({ lastStreakDate: new Date('2026-10-05T00:00:00Z') }));
    expect(plan.outcome).toBe('same-day');
    expect(plan.data).toBeNull();
  });

  it('jour suivant : la série continue, le record suit', () => {
    const plan = planStreak(facts({ currentStreakDays: 9 }));
    expect(plan).toMatchObject({ outcome: 'continued', streak: 10, longest: 10, previousLongest: 9 });
    expect(plan.data).toMatchObject({ currentStreakDays: 10, longestStreakDays: 10 });
  });

  it('un jour manqué avec un gel : le gel est consommé automatiquement et la série continue', () => {
    const plan = planStreak(facts({ lastStreakDate: new Date('2026-10-03T00:00:00Z'), flameFreezes: 2 }));
    expect(plan).toMatchObject({ outcome: 'protected', streak: 6 });
    expect(plan.data).toMatchObject({ currentStreakDays: 6, flameFreezes: 1 });
  });

  it('un jour manqué SANS gel : la Flamme s’éteint, la série perdue est gardée pour le rallumage', () => {
    const plan = planStreak(facts({ lastStreakDate: new Date('2026-10-03T00:00:00Z'), currentStreakDays: 8 }));
    expect(plan).toMatchObject({ outcome: 'broken', streak: 1 });
    expect(plan.data).toMatchObject({
      currentStreakDays: 1,
      brokenStreakDays: 8,
      brokenStreakLastDay: '2026-10-03',
    });
    expect(plan.data).not.toHaveProperty('flameFreezes');
  });

  it('gels insuffisants pour TOUS les jours manqués : la Flamme s’éteint et les gels restent intacts', () => {
    const plan = planStreak(facts({ lastStreakDate: new Date('2026-10-01T00:00:00Z'), flameFreezes: 1 }));
    expect(plan.outcome).toBe('broken');
    expect(plan.data).not.toHaveProperty('flameFreezes');
  });

  it('le 3e jour de la première Flamme : une Veilleuse est offerte, écrite avec la série (#17371)', () => {
    const plan = planStreak(facts({ currentStreakDays: 2, longestStreakDays: 2 }));
    expect(plan).toMatchObject({ outcome: 'continued', streak: 3, freezeGifted: true });
    expect(plan.data).toMatchObject({ currentStreakDays: 3, flameFreezes: 1 });
  });

  it('le jour du cadeau s\'écrit avec lui, pour que les clients l\'annoncent ce jour-là (#20169)', () => {
    const plan = planStreak(facts({ currentStreakDays: 2, longestStreakDays: 2 }));
    expect(plan.data).toMatchObject({ flameFreezeGiftDay: '2026-10-05' });
  });

  it('sans cadeau, le jour du cadeau ne s\'écrit pas', () => {
    expect(planStreak(facts({ currentStreakDays: 9 })).data).not.toHaveProperty('flameFreezeGiftDay');
    expect(planStreak(facts({ currentStreakDays: 2, longestStreakDays: 9 })).data).not.toHaveProperty('flameFreezeGiftDay');
  });

  it('lit le jour du cadeau du compte, absent sur un compte antérieur', () => {
    expect(facts({ flameFreezeGiftDay: '2026-09-30' }).freezeGiftDay).toBe('2026-09-30');
    expect(facts({}).freezeGiftDay).toBeNull();
  });

  it('un jour couvert par un gel qui mène au 3e jour : le gel part, la Veilleuse offerte arrive', () => {
    const plan = planStreak(
      facts({ currentStreakDays: 2, longestStreakDays: 2, lastStreakDate: new Date('2026-10-03T00:00:00Z'), flameFreezes: 1 }),
    );
    expect(plan).toMatchObject({ outcome: 'protected', streak: 3, freezeGifted: true });
    expect(plan.data).toMatchObject({ flameFreezes: 1 });
  });

  it('un joueur qui a déjà tenu trois jours ne reçoit plus de Veilleuse offerte en repassant par le 3e jour', () => {
    const plan = planStreak(facts({ currentStreakDays: 2, longestStreakDays: 9 }));
    expect(plan).toMatchObject({ streak: 3, freezeGifted: false });
    expect(plan.data).not.toHaveProperty('flameFreezes');
  });

  it('premier geste d’un compte sans série : la série démarre à 1', () => {
    const plan = planStreak(facts({ currentStreakDays: 0, lastStreakDate: null }));
    expect(plan).toMatchObject({ outcome: 'started', streak: 1 });
  });
});

describe('writeStreak — la Veilleuse offerte arrive dans la réserve du compte (#17371)', () => {
  it('le geste du 3e jour écrit la série ET la Veilleuse offerte', async () => {
    const db = fakeGameDb();
    seedUser(db, { currentStreakDays: 2, longestStreakDays: 2, lastStreakDate: new Date('2026-10-04T00:00:00Z'), timezone: 'UTC' });

    const written = await writeStreak(db as never, USER, NOW);

    expect(written?.plan).toMatchObject({ streak: 3, freezeGifted: true });
    const row = await db.user.findUnique({ where: { id: USER } });
    expect(row).toMatchObject({ currentStreakDays: 3, flameFreezes: 1, flameFreezeGiftDay: '2026-10-05' });
  });

  it('un compte antérieur au Jeu, sans champ de gel : la Veilleuse s\'écrit quand même', async () => {
    const db = fakeGameDb();
    seedUser(db, { currentStreakDays: 2, longestStreakDays: 2, lastStreakDate: new Date('2026-10-04T00:00:00Z') });

    await writeStreak(db as never, USER, NOW);

    expect(await db.user.findUnique({ where: { id: USER } })).toMatchObject({ flameFreezes: 1 });
  });
});

describe('FlameService.relightByEffort — deux rêves complets rallument la Flamme sans payer (#20455)', () => {
  const act = (db: FakeGameDb, dayKey: string, slot: number, done = true) =>
    db.dailyMission.rows.push({
      id: `act-${dayKey}-${slot}`, userId: USER, dayKey, slot, templateKey: 'send-voice', difficulty: 'easy',
      signal: 'axis:content.audio_message', prism: false, target: 1, progress: done ? 1 : 0, reward: 40, glory: 0, seen: [],
      completedAt: done ? new Date(`${dayKey}T10:00:00Z`) : null, paidPoints: done ? 40 : null, rerolledAt: null,
    });
  const wholeDream = (db: FakeGameDb, dayKey: string, done = true) => [0, 1, 2].forEach((slot) => act(db, dayKey, slot, done || slot < 2));
  const replayedSinceBreak = (db: FakeGameDb, fields: Record<string, unknown> = {}) =>
    seedUser(db, {
      currentStreakDays: 2,
      longestStreakDays: 12,
      lastStreakDate: new Date('2026-10-05T00:00:00Z'),
      brokenStreakDays: 12,
      brokenStreakLastDay: '2026-10-02',
      ...fields,
    });

  it('au second Rêve complet, la série perdue revient avec les jours rejoués, sans aucune Meesh', async () => {
    const db = fakeGameDb();
    replayedSinceBreak(db);
    wholeDream(db, '2026-10-04');
    wholeDream(db, '2026-10-05');

    const relit = await new FlameService(db.prisma).relightByEffort(USER, NOW);

    expect(relit).toEqual({ streak: 14 });
    expect(db.user.rows[0]).toMatchObject({ currentStreakDays: 14, longestStreakDays: 14, brokenStreakDays: null, brokenStreakLastDay: null });
    expect((db.user.rows[0]?.lastStreakDate as Date).toISOString()).toBe('2026-10-05T00:00:00.000Z');
    expect(db.meeshLedger.rows).toHaveLength(0);
  });

  it('ne consomme pas le rallumage payé du mois', async () => {
    const db = fakeGameDb();
    replayedSinceBreak(db);
    wholeDream(db, '2026-10-04');
    wholeDream(db, '2026-10-05');

    await new FlameService(db.prisma).relightByEffort(USER, NOW);

    expect(db.user.rows[0]?.lastRelightDay).toBeUndefined();
  });

  it('hors de la fenêtre, ne relit aucun rêve passé (#20471)', async () => {
    const db = fakeGameDb();
    replayedSinceBreak(db, { brokenStreakLastDay: '2026-08-02' });
    const findMany = jest.spyOn(db.prisma.dailyMission, 'findMany');

    expect(await new FlameService(db.prisma).relightByEffort(USER, NOW)).toBeNull();
    expect(findMany).not.toHaveBeenCalled();
  });

  it('un seul Rêve complet ne rallume rien', async () => {
    const db = fakeGameDb();
    replayedSinceBreak(db);
    wholeDream(db, '2026-10-04');
    wholeDream(db, '2026-10-05', false);

    expect(await new FlameService(db.prisma).relightByEffort(USER, NOW)).toBeNull();
    expect(db.user.rows[0]).toMatchObject({ currentStreakDays: 2, brokenStreakDays: 12 });
  });

  it('la mission personnelle ne compte pas comme un acte du Rêve', async () => {
    const db = fakeGameDb();
    replayedSinceBreak(db);
    wholeDream(db, '2026-10-04');
    act(db, '2026-10-05', 3);

    expect(await new FlameService(db.prisma).relightByEffort(USER, NOW)).toBeNull();
  });

  it('les rêves d’avant la rupture ne comptent pas', async () => {
    const db = fakeGameDb();
    replayedSinceBreak(db);
    wholeDream(db, '2026-10-01');
    wholeDream(db, '2026-10-02');
    wholeDream(db, '2026-10-05');

    expect(await new FlameService(db.prisma).relightByEffort(USER, NOW)).toBeNull();
  });

  it('hors de la fenêtre de 48 h, deux rêves complets ne rallument plus', async () => {
    const db = fakeGameDb();
    replayedSinceBreak(db, { brokenStreakLastDay: '2026-10-01', currentStreakDays: 3 });
    wholeDream(db, '2026-10-04');
    wholeDream(db, '2026-10-05');

    expect(await new FlameService(db.prisma).relightByEffort(USER, NOW)).toBeNull();
    expect(db.user.rows[0]).toMatchObject({ currentStreakDays: 3, brokenStreakDays: 12 });
  });

  it('une Flamme qui brûle ne bouge pas', async () => {
    const db = fakeGameDb();
    seedUser(db, { currentStreakDays: 9, longestStreakDays: 9, lastStreakDate: new Date('2026-10-05T00:00:00Z') });
    wholeDream(db, '2026-10-04');
    wholeDream(db, '2026-10-05');

    expect(await new FlameService(db.prisma).relightByEffort(USER, NOW)).toBeNull();
    expect(db.user.rows[0]).toMatchObject({ currentStreakDays: 9 });
  });

  it('une fois rallumée, un nouvel acte ne la rallume pas deux fois', async () => {
    const db = fakeGameDb();
    replayedSinceBreak(db);
    wholeDream(db, '2026-10-04');
    wholeDream(db, '2026-10-05');
    const service = new FlameService(db.prisma);

    await service.relightByEffort(USER, NOW);
    expect(await service.relightByEffort(USER, NOW)).toBeNull();
    expect(db.user.rows[0]).toMatchObject({ currentStreakDays: 14 });
  });
});
