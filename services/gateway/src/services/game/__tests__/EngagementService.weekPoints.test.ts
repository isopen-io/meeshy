/**
 * LES POINTS DE LA SEMAINE AU CRÉDIT (#9384, #9385) — chaque gain admis monte le
 * compteur de la semaine du compte : le geste d'un axe comme les points du jeu
 * (mission, coffre). Un geste refusé par un plafond ne monte rien.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { DEFAULT_ENGAGEMENT_SCALE } from '@meeshy/shared/types/engagement-scale';
import { EngagementService } from '../../engagement/EngagementService';
import { fakeGameDb, seedUser, USER, type FakeGameDb } from './fakeGameDb';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));
jest.mock('../../notifications/notification-service-registry', () => ({
  getSharedNotificationService: () => ({ createNotification: jest.fn().mockResolvedValue(undefined) }),
}));
jest.mock('../../notifications/NotificationService', () => ({ NotificationService: jest.fn() }));

const service = (db: FakeGameDb) =>
  new EngagementService(db.prisma, { scale: { current: async () => DEFAULT_ENGAGEMENT_SCALE }, emitIO: () => undefined });

const weekPoints = (db: FakeGameDb) => db.gameWeekPoints.rows.reduce((total, row) => total + (row.points as number), 0);

describe('EngagementService → points de la semaine', () => {
  it('un geste crédité monte la semaine du montant exact de son crédit', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 0 });

    await service(db).recordActivity(USER, 'tool.reaction');

    const credited = db.engagementCounter.rows.find((r) => r.axisKey === 'tool.reaction')?.points as number;
    expect(credited).toBeGreaterThan(0);
    expect(weekPoints(db)).toBe(credited);
  });

  it('les points du jeu (mission, coffre) comptent aussi, une fois', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 0 });

    await service(db).creditGamePoints(USER, 120, 'content.text_message');

    expect(weekPoints(db)).toBe(120);
    expect(db.gameWeekPoints.rows).toHaveLength(1);
  });

  it('une panne du compteur de semaine ne retient jamais le crédit', async () => {
    const db = fakeGameDb();
    seedUser(db, { engagementScore: 0 });
    (db.gameWeekPoints as unknown as { upsert: () => Promise<never> }).upsert = () => Promise.reject(new Error('down'));

    await service(db).creditGamePoints(USER, 50, 'content.text_message');

    expect(db.user.rows[0]?.engagementScore).toBe(50);
  });
});
