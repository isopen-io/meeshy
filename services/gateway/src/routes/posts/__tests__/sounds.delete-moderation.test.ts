import { describe, it, expect, jest, afterEach } from '@jest/globals';
import Fastify from 'fastify';
import { registerSoundRoutes } from '../sounds';
import { setSharedNotificationService } from '../../../services/notifications/notification-service-registry';
import type { NotificationService } from '../../../services/notifications/NotificationService';

/**
 * #9856 — un son retiré par la MODÉRATION (MODERATOR, ADMIN, BIGBOSS) sur le
 * son d'autrui laisse une ligne `AdminAuditLog` (acteur, son, motif) et
 * prévient son auteur par `content_removed`. Le retrait par l'auteur lui-même
 * n'écrit ni l'une ni l'autre, et un rejeu sur un son déjà retiré non plus.
 */

const ID = '507f1f77bcf86cd799439011';
const AUTHOR = 'author-1';
const MODERATION = 'moderation-1';

type Role = 'USER' | 'MODERATOR' | 'ADMIN' | 'BIGBOSS';

const flush = () => new Promise((resolve) => setImmediate(resolve));

function auth(userId: string, role: Role) {
  return async (request: unknown) => {
    (request as Record<string, unknown>)['authContext'] = {
      type: 'registered', registeredUser: { id: userId, username: 'tester', role },
      userId, hasFullAccess: true,
    };
  };
}

function soundPrisma(initial: Record<string, unknown>) {
  let row = initial;
  return {
    sound: {
      findUnique: jest.fn<(args: unknown) => Promise<unknown>>().mockImplementation(async () => row),
      updateMany: jest.fn<(args: { data: Record<string, unknown> }) => Promise<{ count: number }>>()
        .mockImplementation(async (args) => {
          if (row['deletedAt']) return { count: 0 };
          row = { ...row, ...args.data };
          return { count: 1 };
        }),
    },
    soundUsage: { findMany: jest.fn<(args: unknown) => Promise<unknown[]>>().mockResolvedValue([]) },
    post: { findMany: jest.fn<(args: unknown) => Promise<unknown[]>>().mockResolvedValue([]) },
    adminAuditLog: { create: jest.fn<(args: { data: Record<string, unknown> }) => Promise<unknown>>().mockResolvedValue({}) },
    user: { findUnique: jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue({ systemLanguage: 'en' }) },
  };
}

function notifier() {
  const createNotification = jest.fn<(input: Record<string, unknown>) => Promise<unknown>>().mockResolvedValue({});
  setSharedNotificationService({ createNotification } as unknown as NotificationService);
  return createNotification;
}

async function removeAs(prisma: ReturnType<typeof soundPrisma>, userId: string, role: Role, payload?: Record<string, unknown>) {
  const app = Fastify();
  registerSoundRoutes(app, prisma as unknown as import('@meeshy/shared/prisma/client').PrismaClient, auth(userId, role));
  await app.ready();
  const res = await app.inject({ method: 'DELETE', url: `/sounds/${ID}`, ...(payload ? { payload } : {}) });
  await flush();
  return res;
}

const liveSound = () => ({ id: ID, uploaderId: AUTHOR, deletedAt: null });

afterEach(() => setSharedNotificationService(undefined));

describe('DELETE /sounds/:id — retrait de modération', () => {
  it.each<Role>(['MODERATOR', 'ADMIN', 'BIGBOSS'])('test_deleteSound_by%s_onAnotherSound_writesAnAuditLine', async (role) => {
    notifier();
    const prisma = soundPrisma(liveSound());
    const res = await removeAs(prisma, MODERATION, role, { reason: 'Droits d’auteur' });

    expect(res.statusCode).toBe(200);
    expect(prisma.adminAuditLog.create).toHaveBeenCalledTimes(1);
    const data = prisma.adminAuditLog.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ adminId: MODERATION, userId: AUTHOR, action: 'REMOVE_CONTENT', entity: 'Sound', entityId: ID });
    expect(JSON.parse(String(data['metadata']))).toMatchObject({ reason: 'Droits d’auteur' });
  });

  it.each<Role>(['MODERATOR', 'ADMIN', 'BIGBOSS'])('test_deleteSound_by%s_onAnotherSound_notifiesTheAuthor', async (role) => {
    const createNotification = notifier();
    const prisma = soundPrisma(liveSound());
    await removeAs(prisma, MODERATION, role, { reason: 'Droits d’auteur' });

    expect(createNotification).toHaveBeenCalledTimes(1);
    const input = createNotification.mock.calls[0][0];
    expect(input).toMatchObject({ userId: AUTHOR, type: 'content_removed' });
    expect(input['metadata']).toMatchObject({ contentType: 'sound', contentId: ID, reason: 'Droits d’auteur' });
    expect(String(input['title'])).toMatch(/sound/i);
    expect(JSON.stringify(input)).not.toContain(MODERATION);
  });

  it('test_deleteSound_byModerationWithoutReason_stillAuditsAndNotifies', async () => {
    const createNotification = notifier();
    const prisma = soundPrisma(liveSound());
    const res = await removeAs(prisma, MODERATION, 'ADMIN');

    expect(res.statusCode).toBe(200);
    expect(prisma.adminAuditLog.create).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(prisma.adminAuditLog.create.mock.calls[0][0].data['metadata']))).toMatchObject({ reason: null });
    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(createNotification.mock.calls[0][0]['metadata']).not.toHaveProperty('reason');
  });

  it('test_deleteSound_byItsAuthor_writesNoAuditAndNoNotification', async () => {
    const createNotification = notifier();
    const prisma = soundPrisma(liveSound());
    const res = await removeAs(prisma, AUTHOR, 'USER');

    expect(res.statusCode).toBe(200);
    expect(prisma.adminAuditLog.create).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('test_deleteSound_byAdminOnTheirOwnSound_writesNoAuditAndNoNotification', async () => {
    const createNotification = notifier();
    const prisma = soundPrisma({ ...liveSound(), uploaderId: MODERATION });
    await removeAs(prisma, MODERATION, 'ADMIN');

    expect(prisma.adminAuditLog.create).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('test_deleteSound_byModeration_alreadyDeleted_isNotAuditedOrNotifiedTwice', async () => {
    const createNotification = notifier();
    const prisma = soundPrisma({ ...liveSound(), deletedAt: new Date('2026-10-01T10:00:00.000Z') });
    const res = await removeAs(prisma, MODERATION, 'ADMIN', { reason: 'Rejeu' });

    expect(res.statusCode).toBe(200);
    expect(prisma.adminAuditLog.create).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('test_deleteSound_byModeration_auditFails_stillRemovesTheSound', async () => {
    notifier();
    const prisma = soundPrisma(liveSound());
    prisma.adminAuditLog.create.mockRejectedValue(new Error('mongo down'));
    const res = await removeAs(prisma, MODERATION, 'ADMIN', { reason: 'Droits d’auteur' });

    expect(res.statusCode).toBe(200);
    expect(typeof res.json().data.deletedAt).toBe('string');
  });
});
