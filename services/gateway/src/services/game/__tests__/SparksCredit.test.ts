/**
 * LES CRÉDITS D'ÉTINCELLES (#10846, #10892) — tous les chemins de crédit incrémentent le TOTAL À VIE et le CYCLE avec la
 * poche, et le NIVEAU se lit sur la poche ; cycle et total à vie sont indicatifs.
 *
 * Deux chemins créditent : `recordActivity` → `updateEngagementScore` (commande brute), et `creditGamePoints`
 * (transaction : missions, coffre, réponse reçue, saison, duo). Les deux écrivent poche, cycle et total à vie du même
 * montant ; un compte d'avant le rattrapage (cycle et total à vie absents) les voit posés sur sa poche.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import { DEFAULT_ENGAGEMENT_SCALE } from '@meeshy/shared/types/engagement-scale';
import { EngagementService } from '../../engagement/EngagementService';
import { takeBackPoints } from '../../engagement/EngagementReceipts';
import { fakeGameDb, seedUser, USER, type FakeGameDb } from './fakeGameDb';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));
jest.mock('../../notifications/notification-service-registry', () => ({
  getSharedNotificationService: () => ({ createNotification: jest.fn().mockResolvedValue(undefined) }),
}));
jest.mock('../../notifications/NotificationService', () => ({ NotificationService: jest.fn() }));

const FROZEN_NOW = new Date('2026-10-10T00:13:00.000Z');
beforeAll(() => {
  jest.useFakeTimers({
    now: FROZEN_NOW,
    doNotFake: ['hrtime', 'nextTick', 'performance', 'queueMicrotask', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'],
  });
});
afterAll(() => {
  jest.useRealTimers();
});

const service = (db: FakeGameDb) =>
  new EngagementService(db.prisma, { scale: { current: async () => DEFAULT_ENGAGEMENT_SCALE }, emitIO: () => undefined });

const row = (db: FakeGameDb) => db.user.rows[0]!;
const dayKey = () => new Date().toISOString().slice(0, 10);

/** Les missions du jour, toutes sur un autre geste : le crédit observé est celui du SEUL geste. */
const missionsAwaitOtherGestures = (db: FakeGameDb) =>
  db.dailyMission.rows.push(
    ...[0, 1, 2].map((slot) => ({
      id: `m-other-${slot}`, userId: USER, dayKey: dayKey(), slot, templateKey: 'publish-posts', difficulty: 'easy',
      signal: 'axis:content.post', prism: false, target: 2, progress: 0, reward: 60, glory: 0, seen: [],
      completedAt: null, paidPoints: null, rerolledAt: null,
    })),
  );

describe('recordActivity — poche, cycle et total à vie montent du même montant', () => {
  it('un compte à jour : les trois s\'additionnent, la frappe passée ne les décale pas', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 200, sparksSincePrestige: 9000, sparksEarnedLifetime: 12_000, levelRecord: 9, levelMaxLifetime: 9 });
    missionsAwaitOtherGestures(db);

    await service(db).recordActivity(USER, 'content.text_message');

    const gained = (row(db).engagementScore as number) - 200;
    expect(gained).toBeGreaterThan(0);
    expect(row(db).sparksSincePrestige).toBe(9000 + gained);
    expect(row(db).sparksEarnedLifetime).toBe(12_000 + gained);
  });

  it('un compte d\'AVANT le rattrapage : cycle et total à vie sont posés sur la poche, puis crédités', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 500 });
    missionsAwaitOtherGestures(db);

    await service(db).recordActivity(USER, 'content.text_message');

    const gained = (row(db).engagementScore as number) - 500;
    expect(gained).toBeGreaterThan(0);
    expect(row(db).sparksSincePrestige).toBe(500 + gained);
    expect(row(db).sparksEarnedLifetime).toBe(500 + gained);
  });

  it('un cycle en RETARD sur la poche (écrivain concurrent) est relevé : jamais sous la poche', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 800, sparksSincePrestige: 100, sparksEarnedLifetime: 50 });
    missionsAwaitOtherGestures(db);

    await service(db).recordActivity(USER, 'content.text_message');

    const gained = (row(db).engagementScore as number) - 800;
    expect(row(db).sparksSincePrestige).toBe(800 + gained);
    expect(row(db).sparksEarnedLifetime).toBe(800 + gained);
  });
});

describe('creditGamePoints — missions, coffre, réponse reçue', () => {
  it('crédite la poche, le cycle et le total à vie du même montant', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 200, sparksSincePrestige: 9000, sparksEarnedLifetime: 12_000, levelRecord: 9, levelMaxLifetime: 9 });

    await service(db).creditGamePoints(USER, 100, 'content.text_message');

    expect(row(db)).toMatchObject({ engagementScore: 300, sparksSincePrestige: 9100, sparksEarnedLifetime: 12_100 });
  });

  it('un compte d\'avant le rattrapage les pose sur sa poche', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 500, levelRecord: 9 });

    await service(db).creditGamePoints(USER, 30, 'content.text_message');

    expect(row(db)).toMatchObject({ engagementScore: 530, sparksSincePrestige: 530, sparksEarnedLifetime: 530 });
  });

  it('le total à vie dépasse un Int32 sans perdre un point', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 10, sparksSincePrestige: 2_147_483_600, sparksEarnedLifetime: 4_000_000_000 });

    await service(db).creditGamePoints(USER, 100, 'content.text_message');

    expect(row(db).sparksSincePrestige).toBe(2_147_483_700);
    expect(row(db).sparksEarnedLifetime).toBe(4_000_000_100);
  });
});

describe('la DETTE se déduit des prochaines étincelles gagnées (porteur 2026-10-16)', () => {
  it('recordActivity : le gain rembourse d\'abord la dette, seul le reste va en poche ; cycle et total à vie montent du gain entier', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 0, sparksSincePrestige: 5000, sparksEarnedLifetime: 8000, sparksDebt: 3 });
    missionsAwaitOtherGestures(db);

    await service(db).recordActivity(USER, 'content.text_message');

    const gain = (db.engagementCounter.rows.find((r) => r.axisKey === 'content.text_message')?.points as number) ?? 0;
    expect(gain).toBeGreaterThan(3);
    expect(row(db)).toMatchObject({ engagementScore: gain - 3, sparksDebt: 0, sparksSincePrestige: 5000 + gain, sparksEarnedLifetime: 8000 + gain });
  });

  it('une dette plus grande que le gain absorbe tout le gain : la poche ne monte pas', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 0, sparksSincePrestige: 5000, sparksEarnedLifetime: 8000, sparksDebt: 100_000 });
    missionsAwaitOtherGestures(db);

    await service(db).recordActivity(USER, 'content.text_message');

    const gain = db.engagementCounter.rows.find((r) => r.axisKey === 'content.text_message')?.points as number;
    expect(row(db)).toMatchObject({ engagementScore: 0, sparksDebt: 100_000 - gain, sparksSincePrestige: 5000 + gain });
  });

  it('creditGamePoints : même règle', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 0, sparksSincePrestige: 5000, sparksEarnedLifetime: 8000, sparksDebt: 40 });

    await service(db).creditGamePoints(USER, 100, 'content.text_message');

    expect(row(db)).toMatchObject({ engagementScore: 60, sparksDebt: 0, sparksSincePrestige: 5100, sparksEarnedLifetime: 8100 });
  });

  it('creditGamePoints : une dette de 300 sur un gain de 100 reste à 200', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 0, sparksSincePrestige: 5000, sparksEarnedLifetime: 8000, sparksDebt: 300 });

    await service(db).creditGamePoints(USER, 100, 'content.text_message');

    expect(row(db)).toMatchObject({ engagementScore: 0, sparksDebt: 200 });
  });
});

describe('le NIVEAU se lit sur la poche (#10892)', () => {
  it('franchir le seuil avec la POCHE grave la Gloire et le record, quel que soit le cumul', async () => {
    const db = fakeGameDb();
    // Poche à 1 point du niveau 2 (400), cycle bien plus haut : un crédit de 5 franchit le niveau 2.
    seedUser(db, { engagementScore: 399, sparksSincePrestige: 9000, sparksEarnedLifetime: 9000, levelRecord: 1, levelMaxLifetime: 1 });

    await service(db).creditGamePoints(USER, 5, 'content.text_message');

    expect(db.gloryLedger.rows.filter((r) => r.reason === 'level').map((r) => r.requestId)).toEqual(['level:2']);
    expect(row(db)).toMatchObject({ levelRecord: 2, levelMaxLifetime: 2 });
  });

  it('un niveau gagné ne se re-paie pas après un prestige : le max à vie tient la Gloire du premier passage', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 399, sparksSincePrestige: 399, sparksEarnedLifetime: 3_000_000, levelRecord: 1, levelMaxLifetime: 100, prestige: 1 });

    await service(db).creditGamePoints(USER, 5, 'content.text_message');

    expect(db.gloryLedger.rows.filter((r) => r.reason === 'level')).toHaveLength(0);
    // Le record depuis le prestige, lui, remonte avec la poche.
    expect(row(db)).toMatchObject({ levelRecord: 2, levelMaxLifetime: 100 });
  });
});

describe('le Vent arrière souffle à 7 niveaux ou plus sous le record (#10896)', () => {
  const gesture = async (pocket: number, levelRecord: number) => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: pocket, sparksSincePrestige: 400_000, sparksEarnedLifetime: 400_000, levelRecord });
    missionsAwaitOtherGestures(db);
    await service(db).recordActivity(USER, 'content.text_message');
    return {
      counter: db.engagementCounter.rows.find((r) => r.axisKey === 'content.text_message')?.points,
      gained: (row(db).engagementScore as number) - pocket,
    };
  };
  const base = DEFAULT_ENGAGEMENT_SCALE.operations['content.text_message'].points;

  it('niveau 3 pour un record à 15 : +25 %, le même montant au compteur et à la poche', async () => {
    const { counter, gained } = await gesture(1000, 15);
    expect(counter).toBe(Math.round(base * 1.25));
    expect(gained).toBe(Math.round(base * 1.25));
  });

  it('niveau 9 pour un record à 15 (écart de 6) : rien de plus', async () => {
    const { counter } = await gesture(8100, 15);
    expect(counter).toBe(base);
  });
});

describe('la reprise d\'un contenu retiré réduit le total à vie, dans la limite de ce qu\'il a rapporté', () => {
  it('retire la même somme à la poche, au cycle et au total à vie — jamais sous zéro', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 700, sparksSincePrestige: 5000, sparksEarnedLifetime: 8000 });
    db.engagementCounter.rows.push({ id: 'c', userId: USER, axisKey: 'content.post', count: 3, points: 900 });

    const taken = await takeBackPoints(db.prisma, USER, 'content.post', 500);

    expect(taken).toBe(500);
    expect(row(db)).toMatchObject({ engagementScore: 200, sparksSincePrestige: 4500, sparksEarnedLifetime: 7500 });
  });

  it('une poche déjà dépensée à la frappe ne descend pas sous zéro, mais le cycle et le total à vie reprennent tout ce que le contenu a rapporté', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 100, sparksSincePrestige: 5000, sparksEarnedLifetime: 8000 });
    db.engagementCounter.rows.push({ id: 'c', userId: USER, axisKey: 'content.post', count: 3, points: 900 });

    await takeBackPoints(db.prisma, USER, 'content.post', 500);

    // La part que la poche ne pouvait plus rendre (500 − 100) devient une DETTE.
    expect(row(db)).toMatchObject({ engagementScore: 0, sparksSincePrestige: 4500, sparksEarnedLifetime: 7500, sparksDebt: 400 });
  });

  it('une reprise entièrement prélevée sur la poche ne crée aucune dette', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 700, sparksSincePrestige: 5000, sparksEarnedLifetime: 8000 });
    db.engagementCounter.rows.push({ id: 'c', userId: USER, axisKey: 'content.post', count: 3, points: 900 });

    await takeBackPoints(db.prisma, USER, 'content.post', 500);

    expect(row(db).sparksDebt ?? 0).toBe(0);
  });

  it('les dettes s\'additionnent d\'une reprise à l\'autre', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 0, sparksSincePrestige: 5000, sparksEarnedLifetime: 8000, sparksDebt: 100 });
    db.engagementCounter.rows.push({ id: 'c', userId: USER, axisKey: 'content.post', count: 3, points: 900 });

    await takeBackPoints(db.prisma, USER, 'content.post', 250);

    expect(row(db).sparksDebt).toBe(350);
  });

  it('ne reprend rien quand le compteur ne rend rien', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 100, sparksSincePrestige: 5000, sparksEarnedLifetime: 8000 });

    const taken = await takeBackPoints(db.prisma, USER, 'content.post', 500);

    expect(taken).toBe(0);
    expect(row(db)).toMatchObject({ engagementScore: 100, sparksSincePrestige: 5000, sparksEarnedLifetime: 8000 });
  });
});
