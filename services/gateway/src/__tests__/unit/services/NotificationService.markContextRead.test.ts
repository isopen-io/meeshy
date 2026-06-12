/**
 * NotificationService.markContextRead.test.ts
 *
 * Iter 35 (F7) — l'auto-marquage des notifications d'une conversation/d'un post
 * est UN SEUL update Mongo ($runCommandRaw) filtré serveur sur le chemin JSON
 * context.* — plus de findMany de toutes les non-lues + filtre en mémoire.
 *
 * @jest-environment node
 */

jest.mock('isomorphic-dompurify', () => ({
  __esModule: true,
  default: { sanitize: (input: string) => input?.replace(/<[^>]*>/g, '') ?? '' },
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  notificationLogger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
  securityLogger: { logViolation: jest.fn() },
  enhancedLogger: { child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })) },
}));

jest.mock('@meeshy/shared/prisma/client', () => {
  const mockPrisma = {
    notification: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },
    $runCommandRaw: jest.fn(),
  };
  return { PrismaClient: jest.fn(() => mockPrisma) };
});

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { NotificationService } from '../../../services/notifications/NotificationService';

const USER_ID = '64a000000000000000000001';
const CONVERSATION_ID = '64b000000000000000000002';
const POST_ID = '64c000000000000000000003';

describe('NotificationService — marquage par contexte en 1 requête (iter 35 F7)', () => {
  let service: NotificationService;
  let prisma: any;
  let mockIO: any;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = new PrismaClient();
    service = new NotificationService(prisma);

    mockIO = { to: jest.fn().mockReturnThis(), emit: jest.fn() };
    service.setSocketIO(mockIO, new Map());
    prisma.notification.count.mockResolvedValue(0);
  });

  describe('markConversationNotificationsAsRead', () => {
    it('émet un seul update Mongo filtré { userId, isRead, context.conversationId } sans findMany', async () => {
      prisma.$runCommandRaw.mockResolvedValue({ ok: 1, n: 2, nModified: 2 });

      const count = await service.markConversationNotificationsAsRead(USER_ID, CONVERSATION_ID);

      expect(prisma.notification.findMany).not.toHaveBeenCalled();
      expect(prisma.notification.updateMany).not.toHaveBeenCalled();
      expect(prisma.$runCommandRaw).toHaveBeenCalledTimes(1);
      expect(prisma.$runCommandRaw).toHaveBeenCalledWith({
        update: 'Notification',
        updates: [{
          q: {
            userId: { $oid: USER_ID },
            isRead: false,
            'context.conversationId': CONVERSATION_ID,
          },
          u: { $set: { isRead: true, readAt: { $date: expect.any(String) } } },
          multi: true,
        }],
      });
      expect(count).toBe(2);
    });

    it('rafraîchit les compteurs (notification:counts) quand des notifications ont été marquées', async () => {
      prisma.$runCommandRaw.mockResolvedValue({ ok: 1, n: 1, nModified: 1 });

      await service.markConversationNotificationsAsRead(USER_ID, CONVERSATION_ID);
      await new Promise(resolve => setImmediate(resolve));

      expect(mockIO.to).toHaveBeenCalledWith(`user:${USER_ID}`);
      expect(mockIO.emit).toHaveBeenCalledWith('notification:counts', expect.any(Object));
    });

    it('n\'émet pas notification:counts quand rien n\'a été marqué', async () => {
      prisma.$runCommandRaw.mockResolvedValue({ ok: 1, n: 0, nModified: 0 });

      const count = await service.markConversationNotificationsAsRead(USER_ID, CONVERSATION_ID);
      await new Promise(resolve => setImmediate(resolve));

      expect(count).toBe(0);
      expect(mockIO.emit).not.toHaveBeenCalled();
    });

    it('retourne 0 sans requête DB pour un userId non-ObjectId (session anonyme)', async () => {
      const count = await service.markConversationNotificationsAsRead('anon-session-token', CONVERSATION_ID);

      expect(prisma.$runCommandRaw).not.toHaveBeenCalled();
      expect(count).toBe(0);
    });

    it('retourne 0 et n\'explose pas si Mongo échoue', async () => {
      prisma.$runCommandRaw.mockRejectedValue(new Error('mongo down'));

      const count = await service.markConversationNotificationsAsRead(USER_ID, CONVERSATION_ID);

      expect(count).toBe(0);
    });
  });

  describe('markPostNotificationsAsRead', () => {
    it('émet un seul update Mongo filtré sur context.postId', async () => {
      prisma.$runCommandRaw.mockResolvedValue({ ok: 1, n: 1, nModified: 1 });

      const count = await service.markPostNotificationsAsRead(USER_ID, POST_ID);

      expect(prisma.notification.findMany).not.toHaveBeenCalled();
      expect(prisma.$runCommandRaw).toHaveBeenCalledWith({
        update: 'Notification',
        updates: [{
          q: {
            userId: { $oid: USER_ID },
            isRead: false,
            'context.postId': POST_ID,
          },
          u: { $set: { isRead: true, readAt: { $date: expect.any(String) } } },
          multi: true,
        }],
      });
      expect(count).toBe(1);
    });
  });
});
