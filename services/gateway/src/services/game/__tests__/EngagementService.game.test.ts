/**
 * LE JEU BRANCHÉ SUR LES GESTES (#9374, #9375, #9376, #9377) — ce que
 * `EngagementService.recordActivity` fait désormais du jeu : le Vent arrière,
 * le frein de l'entre-soi, la série qui consomme un gel ou s'éteint, la Gloire
 * du premier passage d'un niveau, la progression des missions, et le crédit des
 * points de jeu.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { DEFAULT_ENGAGEMENT_SCALE } from '@meeshy/shared/types/engagement-scale';
import { EngagementService } from '../../engagement/EngagementService';
import { fakeGameDb, seedUser, USER, OTHER, writeConflict, type FakeGameDb } from './fakeGameDb';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));
jest.mock('../../notifications/notification-service-registry', () => ({
  getSharedNotificationService: () => ({ createNotification: jest.fn().mockResolvedValue(undefined) }),
}));
jest.mock('../../notifications/NotificationService', () => ({ NotificationService: jest.fn() }));

const CONV = '68b000000000000000000001';
const TEXT_POINTS = DEFAULT_ENGAGEMENT_SCALE.operations['content.text_message'].points;

const service = (db: FakeGameDb) =>
  new EngagementService(db.prisma, { scale: { current: async () => DEFAULT_ENGAGEMENT_SCALE }, emitIO: () => undefined });

const counter = (db: FakeGameDb, axisKey = 'content.text_message') => db.engagementCounter.rows.find((r) => r.axisKey === axisKey);

const today = () => new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
const daysAgo = (n: number) => new Date(today().getTime() - n * 24 * 60 * 60 * 1000);
const dayKeyOf = (d: Date) => d.toISOString().slice(0, 10);

describe('Vent arrière — +25 % tant que le niveau est sous le niveau record', () => {
  it('un geste sous le niveau record crédite 25 % de plus, au compteur ET au score (même montant)', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 10 * 10 * 10, levelRecord: 15 });

    await service(db).recordActivity(USER, 'content.text_message');

    const boosted = Math.round(TEXT_POINTS * 1.25);
    expect(counter(db)?.points).toBe(boosted);
    expect(db.user.rows[0]?.engagementScore).toBe(1000 + boosted);
  });

  it('au niveau record, aucun bonus', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 10 * 15 * 15, levelRecord: 15 });

    await service(db).recordActivity(USER, 'content.text_message');

    expect(counter(db)?.points).toBe(TEXT_POINTS);
  });

  it('un compte sans record (antérieur au jeu) n’a pas de Vent arrière', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 1000 });

    await service(db).recordActivity(USER, 'content.text_message');

    expect(counter(db)?.points).toBe(TEXT_POINTS);
  });
});

describe('le frein de l’entre-soi sur les messages', () => {
  const pair = (db: FakeGameDb, dayCount: number) => {
    seedUser(db, { engagementScore: 500, levelRecord: 7 });
    seedUser(db, {}, OTHER);
    db.participant.rows.push(
      { id: 'p1', conversationId: CONV, userId: USER, isActive: true },
      { id: 'p2', conversationId: CONV, userId: OTHER, isActive: true },
    );
    db.conversationEngagement.rows.push({
      id: 'ce',
      userId: USER,
      conversationId: CONV,
      totalPoints: 0,
      dayPoints: 0,
      day: today(),
      dayCounts: { 'content.text_message': dayCount },
      streakDays: 1,
      longestStreakDays: 1,
    });
  };

  it('au-delà de 50 messages par jour entre deux comptes seuls, les points sont divisés par 4', async () => {
    const db = fakeGameDb();
    pair(db, 50);

    await service(db).recordActivity(USER, 'content.text_message', { conversationId: CONV });

    expect(counter(db)?.points).toBe(Math.max(1, Math.round(TEXT_POINTS / 4)));
  });

  it('en deçà de 50, les points restent entiers', async () => {
    const db = fakeGameDb();
    pair(db, 49);

    await service(db).recordActivity(USER, 'content.text_message', { conversationId: CONV });

    expect(counter(db)?.points).toBe(TEXT_POINTS);
  });

  it('un message à soi (conversation sans personne d’autre) ne rapporte rien du tout', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 500 });
    db.participant.rows.push({ id: 'p1', conversationId: CONV, userId: USER, isActive: true });

    await service(db).recordActivity(USER, 'content.text_message', { conversationId: CONV });

    expect(counter(db)).toBeUndefined();
    expect(db.user.rows[0]?.engagementScore).toBe(500);
  });

  it('un message à un compte de moins de 24 h ne rapporte rien', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 500 });
    seedUser(db, { createdAt: new Date() }, OTHER);
    db.participant.rows.push(
      { id: 'p1', conversationId: CONV, userId: USER, isActive: true },
      { id: 'p2', conversationId: CONV, userId: OTHER, isActive: true },
    );

    await service(db).recordActivity(USER, 'content.text_message', { conversationId: CONV });

    expect(counter(db)).toBeUndefined();
  });
});

describe('la série : un gel couvre le jour manqué, sinon la Flamme s’éteint', () => {
  it('un jour manqué avec un gel : la série continue et le gel est consommé', async () => {
    const db = fakeGameDb();
    seedUser(db, { currentStreakDays: 8, longestStreakDays: 8, lastStreakDate: daysAgo(2), flameFreezes: 1, engagementScore: 500 });

    await service(db).recordActivity(USER, 'tool.reaction');

    expect(db.user.rows[0]).toMatchObject({ currentStreakDays: 9, flameFreezes: 0 });
  });

  it('un gel ACHETÉ entre la lecture et l’écriture de la série n’est pas écrasé : la série en consomme un, l’achat reste', async () => {
    const db = fakeGameDb();
    seedUser(db, { currentStreakDays: 8, longestStreakDays: 8, lastStreakDate: daysAgo(2), flameFreezes: 1, engagementScore: 500 });
    const findUnique = db.user.findUnique.bind(db.user);
    let bought = false;
    db.user.findUnique = (async (args: Parameters<typeof findUnique>[0]) => {
      const row = await findUnique(args);
      if (!bought && args.select?.lastRelightDay) {
        bought = true;
        db.user.rows[0]!.flameFreezes = 2;
      }
      return row;
    }) as typeof db.user.findUnique;

    await service(db).recordActivity(USER, 'tool.reaction');

    expect(db.user.rows[0]).toMatchObject({ currentStreakDays: 9, flameFreezes: 1 });
  });

  it('une série RALLUMÉE entre la lecture et l’écriture n’est pas écrasée par un recalcul périmé', async () => {
    const db = fakeGameDb();
    seedUser(db, { currentStreakDays: 8, longestStreakDays: 8, lastStreakDate: daysAgo(3), engagementScore: 500 });
    const findUnique = db.user.findUnique.bind(db.user);
    let relit = false;
    db.user.findUnique = (async (args: Parameters<typeof findUnique>[0]) => {
      const row = await findUnique(args);
      if (!relit && args.select?.lastRelightDay) {
        relit = true;
        Object.assign(db.user.rows[0]!, { currentStreakDays: 8, lastStreakDate: daysAgo(1), lastRelightDay: dayKeyOf(today()) });
      }
      return row;
    }) as typeof db.user.findUnique;

    await service(db).recordActivity(USER, 'tool.reaction');

    expect(db.user.rows[0]).toMatchObject({ currentStreakDays: 9 });
  });

  it('sans gel : la série repart à 1 et la série perdue est gardée pour le rallumage', async () => {
    const db = fakeGameDb();
    seedUser(db, { currentStreakDays: 8, longestStreakDays: 8, lastStreakDate: daysAgo(2), engagementScore: 500 });

    await service(db).recordActivity(USER, 'tool.reaction');

    expect(db.user.rows[0]).toMatchObject({ currentStreakDays: 1, brokenStreakDays: 8, brokenStreakLastDay: dayKeyOf(daysAgo(2)) });
  });

  it('un record de Flamme franchi grave sa Gloire une fois', async () => {
    const db = fakeGameDb();
    seedUser(db, { currentStreakDays: 6, longestStreakDays: 6, lastStreakDate: daysAgo(1), engagementScore: 500 });

    await service(db).recordActivity(USER, 'tool.reaction');
    await service(db).recordActivity(USER, 'tool.reaction');

    expect(db.gloryLedger.rows.filter((r) => r.reason === 'flame-record')).toEqual([
      expect.objectContaining({ delta: 50, requestId: 'flame-record:7' }),
    ]);
  });
});

describe('la Gloire du premier passage d’un niveau', () => {
  it('un geste qui fait franchir le niveau 2 grave 20 de Gloire et monte le record', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 40 - 1, levelRecord: 1 });

    await service(db).recordActivity(USER, 'content.text_message');

    expect(db.gloryLedger.rows).toEqual([expect.objectContaining({ delta: 20, reason: 'level', requestId: 'level:2' })]);
    expect(db.user.rows[0]?.levelRecord).toBe(2);
  });

  it('un geste qui ne franchit aucun niveau ne grave rien', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 500, levelRecord: 7 });

    await service(db).recordActivity(USER, 'content.text_message');

    expect(db.gloryLedger.rows).toHaveLength(0);
  });
});

describe('la progression des missions au geste', () => {
  it('un geste crédité sur l’axe d’une mission la fait avancer, et la paie à l’objectif', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 10 * 10 * 10, levelRecord: 10 });
    db.dailyMission.rows.push({
      id: 'm1', userId: USER, dayKey: dayKeyOf(today()), slot: 0, templateKey: 'send-texts', difficulty: 'easy',
      signal: 'axis:content.text_message', prism: false, target: 1, progress: 0, reward: 60, glory: 0, seen: [],
      completedAt: null, paidPoints: null, rerolledAt: null,
    });

    await service(db).recordActivity(USER, 'content.text_message');

    expect(db.dailyMission.rows[0]?.completedAt).not.toBeNull();
    const gained = (db.dailyMission.rows[0]?.paidPoints as number) ?? 0;
    expect([60, 120]).toContain(gained);
    expect(counter(db)?.points).toBeGreaterThanOrEqual(TEXT_POINTS + gained);
  });

  it('un échec de mission ne casse jamais le crédit du geste', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 10 * 10 * 10, levelRecord: 10 });
    jest.spyOn(db.dailyMission, 'findMany').mockRejectedValue(new Error('missions indisponibles'));

    await expect(service(db).recordActivity(USER, 'content.text_message')).resolves.toBeUndefined();

    expect(counter(db)?.points).toBe(TEXT_POINTS);
  });
});

describe('EngagementService.creditGamePoints — les points du jeu', () => {
  it('crédite le score et les points de l’axe sans toucher à son nombre d’actions', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 500, levelRecord: 9 });
    db.engagementCounter.rows.push({ id: 'c', userId: USER, axisKey: 'content.text_message', count: 20, points: 60 });

    await service(db).creditGamePoints(USER, 100, 'content.text_message');

    expect(counter(db)).toMatchObject({ count: 20, points: 160 });
    expect(db.user.rows[0]?.engagementScore).toBe(600);
  });

  it('ATOMIQUE : si le score ne s’écrit pas, le compteur ne garde rien — un nouvel essai ne crédite qu’une fois', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 500, levelRecord: 9 });
    db.engagementCounter.rows.push({ id: 'c', userId: USER, axisKey: 'content.text_message', count: 20, points: 60 });
    const panne = () => Promise.reject(new Error('score indisponible'));
    const update = db.user.update.bind(db.user);
    const raw = (db.prisma as unknown as { $runCommandRaw: unknown }).$runCommandRaw;
    db.user.update = panne as unknown as typeof db.user.update;
    (db.prisma as unknown as { $runCommandRaw: unknown }).$runCommandRaw = panne;

    await expect(service(db).creditGamePoints(USER, 100, 'content.text_message')).rejects.toThrow('score indisponible');
    expect(counter(db)).toMatchObject({ count: 20, points: 60 });
    expect(db.user.rows[0]?.engagementScore).toBe(500);

    db.user.update = update;
    (db.prisma as unknown as { $runCommandRaw: unknown }).$runCommandRaw = raw;
    await service(db).creditGamePoints(USER, 100, 'content.text_message');
    expect(counter(db)).toMatchObject({ count: 20, points: 160 });
    expect(db.user.rows[0]?.engagementScore).toBe(600);
  });

  it('un conflit d’écriture se rejoue en bloc : compteur et score crédités une seule fois', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 500, levelRecord: 9 });
    db.engagementCounter.rows.push({ id: 'c', userId: USER, axisKey: 'content.text_message', count: 20, points: 60 });
    let conflicts = 1;
    const update = db.user.update.bind(db.user);
    db.user.update = (async (args: Parameters<typeof update>[0]) => {
      if (conflicts > 0) {
        conflicts -= 1;
        throw writeConflict();
      }
      return update(args);
    }) as typeof db.user.update;

    await service(db).creditGamePoints(USER, 100, 'content.text_message');

    expect(counter(db)).toMatchObject({ count: 20, points: 160 });
    expect(db.user.rows[0]?.engagementScore).toBe(600);
  });

  it('un score ABSENT (compte antérieur au barème) se lit zéro, jamais null', async () => {
    const db = fakeGameDb();
    seedUser(db, {});

    await service(db).creditGamePoints(USER, 30, 'content.text_message');

    expect(db.user.rows[0]?.engagementScore).toBe(30);
  });

  it('un axe jamais touché reçoit une ligne à zéro action et aux points crédités', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 500, levelRecord: 9 });

    await service(db).creditGamePoints(USER, 30, 'content.text_message');

    expect(counter(db)).toMatchObject({ count: 0, points: 30 });
  });
});
