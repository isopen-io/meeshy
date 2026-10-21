/**
 * **Une notification de palier dit le NOUVEAU PALIER et l'EXPLOIT qui l'a fait
 * atteindre** (#10298, directive porteur 2026-10-12 : « 1000 commentaires,
 * bravo vous êtes au 10e palier »).
 *
 * Avant ce lot, la bannière d'un succès disait « 🏆 Succès débloqué : 10
 * conversations rejointes » — l'exploit sans le palier — et son titre de push
 * retombait sur « Meeshy ». Le titre porte désormais le palier, le corps
 * l'exploit ET le palier : un client qui ne rend que le corps (l'écran
 * verrouillé Android, un ancien client) dit encore tout.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { CERCLES_FAMILIES, familyId } from '@meeshy/shared/types/achievement-families';
import { achievementKey } from '@meeshy/shared/types/achievement-catalog';
import { CerclesAchievements } from '../../../../services/achievements/CerclesAchievements';
import { getSharedNotificationService } from '../../../../services/notifications/notification-service-registry';

jest.mock('../../../../services/notifications/notification-service-registry');
jest.mock('../../../../services/notifications/NotificationService');

const mockGetSharedNotificationService = getSharedNotificationService as jest.MockedFunction<
  typeof getSharedNotificationService
>;

type NotificationArgs = {
  userId: string;
  type: string;
  title?: string;
  content: string;
  metadata?: Record<string, unknown>;
};

function makeNotificationService() {
  const createNotification = jest.fn<(args: NotificationArgs) => Promise<unknown>>().mockResolvedValue({});
  mockGetSharedNotificationService.mockReturnValue({ createNotification } as never);
  return createNotification;
}

const famille = (id: string) => {
  const f = CERCLES_FAMILIES.find((c) => familyId(c) === id);
  if (!f) throw new Error(`famille absente du catalogue : ${id}`);
  return f;
};

function makePrisma(systemLanguage: string) {
  const deja = new Set([achievementKey(famille('conversation.join.count'), 1)]);
  const create = jest.fn(async (args: unknown) => {
    const cle = (args as { data: { milestoneKey: string } }).data.milestoneKey;
    if (deja.has(cle)) {
      const err: Error & { code?: string } = new Error('unique');
      err.code = 'P2002';
      throw err;
    }
    deja.add(cle);
    return {};
  });
  const participantCount = jest.fn(async (args: unknown) => {
    const where = (args as { where?: { conversationId?: string } } | undefined)?.where;
    return where?.conversationId !== undefined ? 3 : 10;
  });
  return {
    engagementMilestone: { create, findMany: jest.fn(async () => []) },
    participant: { count: participantCount, findMany: jest.fn().mockResolvedValue([{ id: 'p1' }]) },
    user: { findUnique: jest.fn().mockResolvedValue({ systemLanguage }) },
  } as unknown as PrismaClient;
}

async function announceTenthConversation(systemLanguage: string): Promise<NotificationArgs> {
  const createNotification = makeNotificationService();
  await new CerclesAchievements(makePrisma(systemLanguage)).recordEvent({
    kind: 'conversation.join',
    userId: 'u1',
    conversationId: 'c1',
  });
  expect(createNotification).toHaveBeenCalledTimes(1);
  return createNotification.mock.calls[0][0];
}

describe('la notification de palier dit le palier ET l’exploit (#10298)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('titre = le palier atteint, corps = l’exploit chiffré + le palier, en français', async () => {
    const args = await announceTenthConversation('fr');

    // 10 conversations rejointes = le DEUXIÈME palier de l'échelle de volume (1, 10, 100…).
    expect(args.title).toBe('🏆 Palier 2 atteint');
    expect(args.content).toBe('10 conversations rejointes — bravo, tu atteins le palier 2 !');
  });

  it('se compose dans la langue du LECTEUR', async () => {
    const args = await announceTenthConversation('en');

    expect(args.title).toBe('🏆 Tier 2 reached');
    expect(args.content).toBe('10 conversations joined — well done, you’ve reached tier 2!');
  });

  it('transporte le rang et la valeur pour le client qui veut les rendre lui-même', async () => {
    const args = await announceTenthConversation('fr');

    expect(args.metadata).toEqual(expect.objectContaining({
      achievementKey: achievementKey(famille('conversation.join.count'), 10),
      tierRank: 2,
      value: 10,
    }));
  });
});
