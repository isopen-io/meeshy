/**
 * #3718 — art. 16 DSA : le déclarant d'un signalement reçoit une réponse
 * motivée quand ce signalement passe à un statut TERMINAL
 * (resolved/rejected/dismissed). `NotificationTypeEnum.REPORT_RESOLVED`
 * existait déjà dans le contrat partagé mais n'était émis nulle part.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  isNewlyResolvedReportTransition,
  notifyReportResolved,
  type ResolvedReport,
} from '../reportResolvedNotification';
import { getSharedNotificationService } from '../../notifications/notification-service-registry';

jest.mock('../../notifications/notification-service-registry');
jest.mock('../../notifications/NotificationService');

const mockGetSharedNotificationService = getSharedNotificationService as jest.MockedFunction<
  typeof getSharedNotificationService
>;

function makePrisma(overrides: Partial<{ findUnique: jest.Mock }> = {}) {
  return {
    user: {
      findUnique: overrides.findUnique ?? jest.fn().mockResolvedValue({ systemLanguage: 'fr' }),
    },
  } as unknown as PrismaClient;
}

function makeSharedNotificationService(overrides: Partial<{ createNotification: jest.Mock }> = {}) {
  return {
    createNotification: overrides.createNotification ?? jest.fn().mockResolvedValue(null),
  } as any;
}

function makeReport(overrides: Partial<ResolvedReport> = {}): ResolvedReport {
  return {
    id: 'report-1',
    reporterId: 'reporter-1',
    reportedType: 'message',
    reportType: 'spam',
    status: 'resolved',
    actionTaken: 'content_removed',
    ...overrides,
  };
}

describe('isNewlyResolvedReportTransition', () => {
  it.each([
    ['pending', 'resolved', true],
    ['under_review', 'rejected', true],
    ['pending', 'dismissed', true],
    ['pending', 'under_review', false],
    ['pending', 'pending', false],
    ['resolved', 'resolved', false],
    ['rejected', 'dismissed', true],
  ])('%s → %s ⇒ %s', (previous, next, expected) => {
    expect(isNewlyResolvedReportTransition(previous, next)).toBe(expected);
  });
});

describe('notifyReportResolved', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('crée une notification pour le déclarant quand le signalement est résolu avec une mesure prise', async () => {
    const service = makeSharedNotificationService();
    mockGetSharedNotificationService.mockReturnValue(service);
    const prisma = makePrisma();

    await notifyReportResolved(prisma, makeReport());

    expect(service.createNotification).toHaveBeenCalledTimes(1);
    const call = service.createNotification.mock.calls[0][0] as any;
    expect(call.userId).toBe('reporter-1');
    expect(call.type).toBe('report_resolved');
    expect(call.context).toEqual({});
    expect(call.metadata).toMatchObject({
      reportedType: 'message',
      reportType: 'spam',
      outcome: 'resolved',
      actionTaken: 'content_removed',
      action: 'view_details',
    });
    expect(typeof call.content).toBe('string');
    expect(call.content.length).toBeGreaterThan(0);
  });

  it('crée une notification "aucune violation" pour un signalement rejeté', async () => {
    const service = makeSharedNotificationService();
    mockGetSharedNotificationService.mockReturnValue(service);
    const prisma = makePrisma();

    await notifyReportResolved(prisma, makeReport({ status: 'rejected', actionTaken: null }));

    const call = service.createNotification.mock.calls[0][0] as any;
    expect(call.metadata.outcome).toBe('rejected');
    expect(call.content).not.toBe('');
  });

  it('crée une notification "aucune violation" pour un signalement classé sans suite (dismissed)', async () => {
    const service = makeSharedNotificationService();
    mockGetSharedNotificationService.mockReturnValue(service);
    const prisma = makePrisma();

    await notifyReportResolved(prisma, makeReport({ status: 'dismissed', actionTaken: 'none' }));

    const call = service.createNotification.mock.calls[0][0] as any;
    expect(call.metadata.outcome).toBe('dismissed');
  });

  it('ne crée AUCUNE notification pour un déclarant anonyme', async () => {
    const service = makeSharedNotificationService();
    mockGetSharedNotificationService.mockReturnValue(service);
    const prisma = makePrisma();

    await notifyReportResolved(prisma, makeReport({ reporterId: null }));

    expect(service.createNotification).not.toHaveBeenCalled();
  });

  it('résout la langue du déclarant pour composer le contenu (anglais)', async () => {
    const service = makeSharedNotificationService();
    mockGetSharedNotificationService.mockReturnValue(service);
    const findUnique = jest.fn().mockResolvedValue({ systemLanguage: 'en' });
    const prisma = makePrisma({ findUnique });

    await notifyReportResolved(prisma, makeReport());

    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'reporter-1' } })
    );
    const call = service.createNotification.mock.calls[0][0] as any;
    expect(call.content).toMatch(/report/i);
    expect(call.title).toMatch(/report/i);
  });

  it("ne lève jamais quand aucun NotificationService partagé n'est câblé", async () => {
    mockGetSharedNotificationService.mockReturnValue(undefined);
    const prisma = makePrisma();

    await expect(notifyReportResolved(prisma, makeReport())).resolves.toBeUndefined();
  });

  it('ne lève jamais quand la résolution de la langue du déclarant échoue', async () => {
    const service = makeSharedNotificationService();
    mockGetSharedNotificationService.mockReturnValue(service);
    const prisma = makePrisma({ findUnique: jest.fn().mockRejectedValue(new Error('down')) });

    await expect(notifyReportResolved(prisma, makeReport())).resolves.toBeUndefined();
    expect(service.createNotification).not.toHaveBeenCalled();
  });
});
