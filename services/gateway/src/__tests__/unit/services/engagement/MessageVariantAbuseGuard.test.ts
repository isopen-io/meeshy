/**
 * Les gardes d'abus d'un message (#9377 : seul dans la conversation, compte de
 * moins de 24 h, bloqué) passent AVANT le crédit, quelle que soit la variante
 * de valeur (#9666) : la variante la mieux payée (`global`, 8) ne les contourne pas.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { DEFAULT_ENGAGEMENT_SCALE } from '@meeshy/shared/types/engagement-scale';
import { CONVERSATION_TYPE_VARIANTS } from '@meeshy/shared/types/engagement-operations';
import { EngagementService } from '../../../../services/engagement/EngagementService';
import { fakeGameDb, seedUser, USER, OTHER, type FakeGameDb } from '../../../../services/game/__tests__/fakeGameDb';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));
jest.mock('../../../../services/notifications/notification-service-registry', () => ({
  getSharedNotificationService: () => ({ createNotification: jest.fn<any>().mockResolvedValue(undefined) }),
}));
jest.mock('../../../../services/notifications/NotificationService', () => ({ NotificationService: jest.fn() }));

const CONV = '68b000000000000000000001';

const members = (db: FakeGameDb, ids: string[]) =>
  ids.forEach((userId, i) => db.participant.rows.push({ id: `p${i}`, conversationId: CONV, userId, isActive: true }));

const service = (db: FakeGameDb) =>
  new EngagementService(db.prisma, { scale: { current: async () => DEFAULT_ENGAGEMENT_SCALE }, emitIO: () => null as never });

const creditedPoints = (db: FakeGameDb): number =>
  db.engagementCounter.rows.filter((row) => row.userId === USER).reduce((sum, row) => sum + (row.points as number), 0);

const send = (db: FakeGameDb, variant: string) =>
  service(db).recordActivity(USER, 'content.text_message', { conversationId: CONV, variant });

describe('les gardes d’abus d’un message passent avant le crédit, à toute variante', () => {
  it.each(CONVERSATION_TYPE_VARIANTS)('seul dans la conversation (%s) : rien', async (variant) => {
    const db = fakeGameDb();
    seedUser(db);
    members(db, [USER]);

    expect(await send(db, variant)).toBe(false);
    expect(creditedPoints(db)).toBe(0);
  });

  it.each(CONVERSATION_TYPE_VARIANTS)('à un compte de moins de 24 h (%s) : rien', async (variant) => {
    const db = fakeGameDb();
    seedUser(db);
    seedUser(db, { createdAt: new Date(Date.now() - 60 * 60 * 1000) }, OTHER);
    members(db, [USER, OTHER]);

    expect(await send(db, variant)).toBe(false);
    expect(creditedPoints(db)).toBe(0);
  });

  it.each(CONVERSATION_TYPE_VARIANTS)('à un compte bloqué (%s) : rien', async (variant) => {
    const db = fakeGameDb();
    seedUser(db, { blockedUserIds: [OTHER] });
    seedUser(db, {}, OTHER);
    members(db, [USER, OTHER]);

    expect(await send(db, variant)).toBe(false);
    expect(creditedPoints(db)).toBe(0);
  });

  it('entre deux comptes établis, la variante globale crédite bien ses 8 points', async () => {
    const db = fakeGameDb();
    seedUser(db);
    seedUser(db, {}, OTHER);
    members(db, [USER, OTHER]);

    expect(await send(db, 'global')).toBe(true);
    expect(creditedPoints(db)).toBeGreaterThanOrEqual(8);
  });
});
