/**
 * L'élan appliqué AU MOMENT du crédit (#5749).
 * @jest-environment node
 *
 * Ces témoins portent sur le CÂBLAGE — la loi elle-même est éprouvée dans
 * `packages/shared/__tests__/engagement-elan.test.ts`. Ce qui se vérifie ici :
 * que le multiplicateur atteint bien les deux écritures, et la MÊME valeur les
 * deux fois.
 */

import { describe, it, expect, jest } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { ENGAGEMENT_AXIS_WEIGHTS } from '@meeshy/shared/types/engagement';
import { EngagementService } from '../../../../services/engagement/EngagementService';
import { getSharedNotificationService } from '../../../../services/notifications/notification-service-registry';

jest.mock('../../../../services/notifications/notification-service-registry');
jest.mock('../../../../services/notifications/NotificationService');

const mockGetShared = getSharedNotificationService as jest.MockedFunction<typeof getSharedNotificationService>;

/**
 * `recentAxes` : les axes touchés sur la fenêtre glissante — c'est leur FAMILLE
 * qui porte les trois premiers crans. `milestones` : ce qui décide de l'assise.
 */
function makePrisma(recentAxes: string[], milestones: Array<{ milestoneType: string; milestoneKey: string }> = []) {
  const upsert = jest.fn().mockResolvedValue({ count: 2 });
  const runCommandRaw = jest.fn().mockResolvedValue({ ok: 1, value: { engagementScore: 0 } });
  const prisma = {
    engagementCounter: {
      upsert,
      findMany: jest.fn().mockResolvedValue(recentAxes.map((axisKey) => ({ axisKey }))),
    },
    engagementMilestone: {
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue(milestones),
    },
    engagementConversationCredit: { create: jest.fn().mockResolvedValue({}) },
    user: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn().mockResolvedValue({}) },
    $runCommandRaw: runCommandRaw,
  } as unknown as PrismaClient;
  return { prisma, upsert, runCommandRaw };
}

/** Les points crédités par la commande brute de score. */
function pointsDuScore(runCommandRaw: jest.Mock): number {
  const cmd = runCommandRaw.mock.calls[0][0] as {
    update: Array<{ $set: { engagementScore: { $add: [unknown, number] } } }>;
  };
  return cmd.update[0].$set.engagementScore.$add[1];
}

describe('l\'élan multiplie les points crédités', () => {
  it('reste au neutre quand une seule famille est active', async () => {
    mockGetShared.mockReturnValue(undefined as never);
    const { prisma, upsert, runCommandRaw } = makePrisma(['content.post']);

    await new EngagementService(prisma).recordActivity('u-1', 'content.text_message');

    const poids = ENGAGEMENT_AXIS_WEIGHTS['content.text_message'];
    expect((upsert.mock.calls[0][0] as { create: { points: number } }).create.points).toBe(poids);
    expect(pointsDuScore(runCommandRaw)).toBe(poids);
  });

  it('multiplie par le nombre de familles tenues en même temps', async () => {
    mockGetShared.mockReturnValue(undefined as never);
    // contenu + commentaire + conversation actives, plus l'outil du geste courant : ×4
    const { prisma, upsert, runCommandRaw } = makePrisma([
      'content.post',
      'comment.text',
      'conversation.private',
    ]);

    await new EngagementService(prisma).recordActivity('u-2', 'tool.sticker');

    const attendu = ENGAGEMENT_AXIS_WEIGHTS['tool.sticker'] * 4;
    expect((upsert.mock.calls[0][0] as { create: { points: number } }).create.points).toBe(attendu);
    expect(pointsDuScore(runCommandRaw)).toBe(attendu);
  });

  it('compte la famille du geste COURANT, même si elle n\'était pas encore active', async () => {
    mockGetShared.mockReturnValue(undefined as never);
    // Seule la famille « contenu » était active ; le commentaire en ajoute une
    // SECONDE à cet instant précis.
    const { prisma, runCommandRaw } = makePrisma(['content.post']);

    await new EngagementService(prisma).recordActivity('u-3', 'comment.text');

    expect(pointsDuScore(runCommandRaw)).toBe(ENGAGEMENT_AXIS_WEIGHTS['comment.text'] * 2);
  });

  it('ajoute le cran d\'assise à partir de dix succès', async () => {
    mockGetShared.mockReturnValue(undefined as never);
    const succes = Array.from({ length: 10 }, (_, i) => ({
      milestoneType: 'achievement',
      milestoneKey: `achievement.a${i}`,
    }));
    const { prisma, runCommandRaw } = makePrisma(['content.post'], succes);

    await new EngagementService(prisma).recordActivity('u-4', 'content.story');

    // une seule famille (×1) + assise (+1) = ×2
    expect(pointsDuScore(runCommandRaw)).toBe(ENGAGEMENT_AXIS_WEIGHTS['content.story'] * 2);
  });

  it('compte comme « haut badge » un palier ≥ 100, jamais un palier bas', async () => {
    mockGetShared.mockReturnValue(undefined as never);
    const basPaliers = Array.from({ length: 9 }, (_, i) => ({
      milestoneType: 'badge',
      milestoneKey: `content.post:${i < 5 ? 50 : 10}`,
    }));
    const { prisma, runCommandRaw } = makePrisma(['content.post'], basPaliers);

    await new EngagementService(prisma).recordActivity('u-5', 'content.story');

    // Neuf badges, aucun ≥ 100 : pas d'assise.
    expect(pointsDuScore(runCommandRaw)).toBe(ENGAGEMENT_AXIS_WEIGHTS['content.story']);
  });

  it('plafonne à ×5 : les quatre familles ET l\'assise', async () => {
    mockGetShared.mockReturnValue(undefined as never);
    const hautsBadges = Array.from({ length: 5 }, (_, i) => ({
      milestoneType: 'badge',
      milestoneKey: `content.post:${i === 0 ? 500 : 100}`,
    }));
    const { prisma, runCommandRaw } = makePrisma(
      ['content.post', 'comment.text', 'conversation.private', 'tool.sticker'],
      hautsBadges,
    );

    await new EngagementService(prisma).recordActivity('u-6', 'content.reel');

    expect(pointsDuScore(runCommandRaw)).toBe(ENGAGEMENT_AXIS_WEIGHTS['content.reel'] * 5);
  });

  it('crédite le compteur et le score du MÊME montant — l\'invariant Σ(points)', async () => {
    mockGetShared.mockReturnValue(undefined as never);
    const { prisma, upsert, runCommandRaw } = makePrisma(['content.post', 'comment.text']);

    await new EngagementService(prisma).recordActivity('u-7', 'conversation.public');

    const auCompteur = (upsert.mock.calls[0][0] as { create: { points: number } }).create.points;
    expect(pointsDuScore(runCommandRaw)).toBe(auCompteur);
  });

  it('n\'altère JAMAIS le compte d\'actions, quel que soit l\'élan', async () => {
    mockGetShared.mockReturnValue(undefined as never);
    const { prisma, upsert } = makePrisma([
      'content.post',
      'comment.text',
      'conversation.private',
      'tool.sticker',
    ]);

    await new EngagementService(prisma).recordActivity('u-8', 'content.reel');

    // Un badge « cinquante réels » doit vouloir dire cinquante réels, même à ×5.
    const args = upsert.mock.calls[0][0] as {
      create: { count: number };
      update: { count: { increment: number } };
    };
    expect(args.create.count).toBe(1);
    expect(args.update.count.increment).toBe(1);
  });
});
