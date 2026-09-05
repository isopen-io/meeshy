/**
 * BroadcastInAppSenderJob.execute — le canal IN-APP des diffusions admin.
 *
 * Chaque destinataire ciblé reçoit une notification `system` (sujet/corps
 * dans SA langue via `translatedSubjects`/`translatedBodies`), livrée par
 * `NotificationService.createSystemNotification` — donc `notification:new`
 * + compteurs + push, sans rien réinventer. Les compteurs vivent dans
 * `inAppSentCount`/`inAppFailedCount`, distincts du canal e-mail.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  },
}));

import { BroadcastInAppSenderJob } from '../../../jobs/broadcast-inapp-sender';

const BASE_BROADCAST = {
  id: 'bc-1',
  status: 'READY',
  subject: 'Default subject',
  body: 'Default body',
  sourceLanguage: 'en',
  translatedSubjects: { fr: 'Sujet FR' },
  translatedBodies: { fr: 'Corps FR' },
  targeting: {},
};

const USER_FR = { id: 'u-fr', systemLanguage: 'fr' };
const USER_EN = { id: 'u-en', systemLanguage: 'en' };
const USER_NOLANG = { id: 'u-nolang', systemLanguage: null };

function makePrisma(opts: {
  broadcast?: unknown;
  userCount?: number;
  users?: unknown[];
  /** Valeurs VERBATIM distinctes de `systemLanguage` en base (#5161). */
  languageVariants?: string[];
} = {}) {
  const { broadcast = BASE_BROADCAST, userCount = 1, users = [USER_EN], languageVariants = [] } = opts;
  let batchCalls = 0;
  return {
    adminBroadcast: {
      findUnique: jest.fn<any>().mockResolvedValue(broadcast),
      update: jest.fn<any>().mockResolvedValue({}),
    },
    user: {
      count: jest.fn<any>().mockResolvedValue(userCount),
      // #5161 — router sur la forme de l'appel : `distinct: ['systemLanguage']`
      // résout les variantes verbatim, tout le reste est le batch destinataires.
      findMany: jest.fn<any>().mockImplementation((args: any) => {
        if (args?.distinct?.includes?.('systemLanguage')) {
          return Promise.resolve(languageVariants.map(systemLanguage => ({ systemLanguage })));
        }
        batchCalls += 1;
        return Promise.resolve(batchCalls === 1 ? users : []);
      }),
    },
  };
}

function makeNotifications(impl?: (params: any) => Promise<unknown>) {
  return {
    createSystemNotification: jest.fn<any>().mockImplementation(impl ?? (async () => ({ id: 'n-1' }))),
  };
}

beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => { jest.useRealTimers(); });

describe('BroadcastInAppSenderJob.execute', () => {
  it('ne fait rien quand la diffusion est introuvable', async () => {
    const prisma = makePrisma({ broadcast: null });
    const notifications = makeNotifications();

    await new BroadcastInAppSenderJob(prisma as any, notifications as any).execute('missing');

    expect(notifications.createSystemNotification).not.toHaveBeenCalled();
    expect(prisma.adminBroadcast.update).not.toHaveBeenCalled();
  });

  it('refuse une diffusion dont les traductions ne sont pas prêtes (DRAFT)', async () => {
    const prisma = makePrisma({ broadcast: { ...BASE_BROADCAST, status: 'DRAFT' } });
    const notifications = makeNotifications();

    await new BroadcastInAppSenderJob(prisma as any, notifications as any).execute('bc-1');

    expect(notifications.createSystemNotification).not.toHaveBeenCalled();
  });

  it('accepte une diffusion déjà envoyée par e-mail (SENT) — les deux canaux se cumulent', async () => {
    const prisma = makePrisma({ broadcast: { ...BASE_BROADCAST, status: 'SENT' } });
    const notifications = makeNotifications();

    await new BroadcastInAppSenderJob(prisma as any, notifications as any).execute('bc-1');

    expect(notifications.createSystemNotification).toHaveBeenCalledTimes(1);
  });

  it('livre à chaque destinataire une notification système « annonce » dans SA langue', async () => {
    const prisma = makePrisma({ userCount: 3, users: [USER_FR, USER_EN, USER_NOLANG] });
    const notifications = makeNotifications();

    await new BroadcastInAppSenderJob(prisma as any, notifications as any).execute('bc-1');

    expect(notifications.createSystemNotification).toHaveBeenCalledTimes(3);
    expect(notifications.createSystemNotification).toHaveBeenCalledWith(expect.objectContaining({
      recipientUserId: 'u-fr', title: 'Sujet FR', content: 'Corps FR', lang: 'fr',
      systemType: 'announcement',
    }));
    expect(notifications.createSystemNotification).toHaveBeenCalledWith(expect.objectContaining({
      recipientUserId: 'u-en', title: 'Default subject', content: 'Default body', lang: 'en',
    }));
    expect(notifications.createSystemNotification).toHaveBeenCalledWith(expect.objectContaining({
      recipientUserId: 'u-nolang', title: 'Default subject', content: 'Default body', lang: 'en',
    }));
  });

  it('cible sans exiger un e-mail vérifié — le canal in-app atteint tout compte actif', async () => {
    const prisma = makePrisma({
      broadcast: { ...BASE_BROADCAST, targeting: { languages: ['fr'], activityStatus: 'all' } },
      languageVariants: ['fr', 'FR'],
    });
    const notifications = makeNotifications();

    await new BroadcastInAppSenderJob(prisma as any, notifications as any).execute('bc-1');

    const where = prisma.user.count.mock.calls[0][0].where;
    expect(where).toEqual(expect.objectContaining({ isActive: true, deletedAt: null }));
    expect(where.systemLanguage.in).toEqual(expect.arrayContaining(['fr', 'FR']));
    expect(where).not.toHaveProperty('emailVerifiedAt');
  });

  it('compte les livraisons et les échecs, puis clôt la diffusion in-app', async () => {
    const prisma = makePrisma({ userCount: 3, users: [USER_FR, USER_EN, USER_NOLANG] });
    const notifications = makeNotifications(async (params: any) => {
      if (params.recipientUserId === 'u-en') throw new Error('boom');
      if (params.recipientUserId === 'u-nolang') return null; // filtré par ses préférences
      return { id: 'n-1' };
    });

    await new BroadcastInAppSenderJob(prisma as any, notifications as any).execute('bc-1');

    const finalUpdate = prisma.adminBroadcast.update.mock.calls.at(-1)![0];
    expect(finalUpdate.where).toEqual({ id: 'bc-1' });
    expect(finalUpdate.data).toEqual(expect.objectContaining({
      inAppSentCount: 1,
      inAppFailedCount: 1,
      inAppCompletedAt: expect.any(Date),
    }));
  });

  it('ne touche jamais au statut e-mail de la diffusion', async () => {
    const prisma = makePrisma();
    const notifications = makeNotifications();

    await new BroadcastInAppSenderJob(prisma as any, notifications as any).execute('bc-1');

    for (const call of prisma.adminBroadcast.update.mock.calls) {
      expect(call[0].data).not.toHaveProperty('status');
      expect(call[0].data).not.toHaveProperty('sentCount');
    }
  });

  it('marque un échec global si la lecture de la base explose', async () => {
    const prisma = makePrisma();
    prisma.user.count.mockRejectedValue(new Error('db down'));
    const notifications = makeNotifications();

    await new BroadcastInAppSenderJob(prisma as any, notifications as any).execute('bc-1');

    const finalUpdate = prisma.adminBroadcast.update.mock.calls.at(-1)![0];
    expect(finalUpdate.data).toEqual(expect.objectContaining({ inAppCompletedAt: expect.any(Date), errorMessage: 'db down' }));
    expect(notifications.createSystemNotification).not.toHaveBeenCalled();
  });
});
