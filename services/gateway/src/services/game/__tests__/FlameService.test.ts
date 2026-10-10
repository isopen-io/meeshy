/**
 * LA FLAMME CÔTÉ PASSERELLE (#9376) — gel acheté et consommé, rallumage sous
 * 48 h, transition de série. La loi (`advanceFlame`, `canRelight`…) vient de
 * `@meeshy/shared/utils/game/flame` : ici on teste qu'elle est APPLIQUÉE
 * contre le registre, jamais réécrite.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { FlameService, flameFactsOf, planStreak } from '../FlameService';
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

  it('premier geste d’un compte sans série : la série démarre à 1', () => {
    const plan = planStreak(facts({ currentStreakDays: 0, lastStreakDate: null }));
    expect(plan).toMatchObject({ outcome: 'started', streak: 1 });
  });
});
