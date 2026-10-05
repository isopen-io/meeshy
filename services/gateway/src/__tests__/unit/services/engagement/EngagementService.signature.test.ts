/**
 * Un seul crédit par personne ou par ensemble de membres (#8906).
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { EngagementService } from '../../../../services/engagement/EngagementService';
import { getSharedNotificationService } from '../../../../services/notifications/notification-service-registry';

jest.mock('../../../../services/notifications/notification-service-registry');
jest.mock('../../../../services/notifications/NotificationService');

const mockGetSharedNotificationService = getSharedNotificationService as jest.MockedFunction<
  typeof getSharedNotificationService
>;

function makePrisma(overrides: Partial<{
  upsert: jest.Mock;
  conversationCreditCreate: jest.Mock;
  signatureCreditCreate: jest.Mock;
}> = {}) {
  return {
    engagementCounter: {
      upsert: overrides.upsert ?? jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    engagementMilestone: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    engagementConversationCredit: {
      create: overrides.conversationCreditCreate ?? jest.fn().mockResolvedValue({}),
    },
    engagementSignatureCredit: {
      create: overrides.signatureCreditCreate ?? jest.fn().mockResolvedValue({}),
    },
    engagementScaleConfig: { findUnique: jest.fn().mockResolvedValue(null) },
    engagementQuota: { upsert: jest.fn().mockResolvedValue({ count: 1 }), update: jest.fn().mockResolvedValue({ count: 1 }), updateMany: jest.fn().mockResolvedValue({ count: 0 }), create: jest.fn().mockResolvedValue({}), findUnique: jest.fn().mockResolvedValue(null) },
    conversationEngagement: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn().mockResolvedValue({}) },
    user: {
      findUnique: jest.fn().mockResolvedValue({ systemLanguage: 'fr' }),
      update: jest.fn().mockResolvedValue({}),
    },
    $runCommandRaw: jest.fn().mockResolvedValue({ ok: 1, value: { engagementScore: 0 } }),
  } as unknown as PrismaClient;
}

function makeSharedNotificationService() {
  return { createNotification: jest.fn().mockResolvedValue(null) } as any;
}

function p2002Error() {
  return Object.assign(new Error('duplicate key'), { code: 'P2002' });
}

beforeEach(() => {
  mockGetSharedNotificationService.mockReset();
});

describe('le crédit par ensemble de personnes (#8906)', () => {
  it('une conversation privée avec une personne déjà créditée ne rapporte plus', async () => {
    const conversationCreditCreate = jest.fn().mockResolvedValue({});
    const signatureCreditCreate = jest.fn().mockRejectedValue(p2002Error());
    const upsert = jest.fn();
    const prisma = makePrisma({ conversationCreditCreate, signatureCreditCreate, upsert });
    const svc = new EngagementService(prisma);

    await svc.recordConversationActivity('user-1', 'conversation.private', 'conv-2', { signature: 'sig-ali' });

    expect(signatureCreditCreate).toHaveBeenCalledWith({
      data: { userId: 'user-1', axisKey: 'conversation.private', signature: 'sig-ali', conversationId: 'conv-2' },
    });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('une conversation privée avec une nouvelle personne rapporte', async () => {
    const upsert = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = makePrisma({ upsert });
    mockGetSharedNotificationService.mockReturnValue(makeSharedNotificationService());
    const svc = new EngagementService(prisma);

    await svc.recordConversationActivity('user-1', 'conversation.private', 'conv-3', { signature: 'sig-baba' });

    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('un second message dans la même conversation ne relit pas la signature', async () => {
    const conversationCreditCreate = jest.fn().mockRejectedValue(p2002Error());
    const signatureCreditCreate = jest.fn();
    const prisma = makePrisma({ conversationCreditCreate, signatureCreditCreate });
    const svc = new EngagementService(prisma);

    await svc.recordConversationActivity('user-1', 'conversation.private', 'conv-2', { signature: 'sig-ali' });

    expect(signatureCreditCreate).not.toHaveBeenCalled();
  });

  it('créer un groupe rapporte 1 point, une fois par ensemble de membres', async () => {
    const signatureCreditCreate = jest
      .fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(p2002Error())
      .mockResolvedValueOnce({});
    const upsert = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = makePrisma({ signatureCreditCreate, upsert });
    mockGetSharedNotificationService.mockReturnValue(makeSharedNotificationService());
    const svc = new EngagementService(prisma);

    await svc.recordGroupCreation('me', 'g1', ['ali', 'baba', 'jean']);
    await svc.recordGroupCreation('me', 'g2', ['jean', 'baba', 'ali']);
    await svc.recordGroupCreation('me', 'g3', ['ali', 'baba', 'jean', 'josephine']);

    const signatures = signatureCreditCreate.mock.calls.map((call) => (call[0] as { data: { signature: string } }).data.signature);
    expect(signatures[0]).toBe(signatures[1]);
    expect(signatures[2]).not.toBe(signatures[0]);
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { userId: 'me', axisKey: 'conversation.group_created', count: 1, points: 1 },
      }),
    );
  });
});
