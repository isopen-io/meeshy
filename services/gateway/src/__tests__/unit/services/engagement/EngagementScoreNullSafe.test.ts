/**
 * Le score d'engagement survit à un champ `null` en base (#5742).
 * @jest-environment node
 *
 * ## Ce que ce fichier reproduit
 *
 * Mesuré en production le 2026-09-08 : les 9 comptes ayant une activité
 * portent `User.engagementScore = null`, là où la somme pondérée de leurs
 * compteurs vaut 8 à 140. Aucun `level_up` n'est jamais parti, et l'écran
 * « Progression » annonce « Niveau 0 · 0 point » à un compte qui a produit
 * 140 points.
 *
 * La cause, vérifiée contre Mongo 8 :
 *
 *     champ ABSENT + $inc  ->  { s: 3 }
 *     champ NULL   + $inc  ->  ERREUR « Cannot apply $inc to a value of
 *                              non-numeric type »
 *
 * Le doc-comment d'`updateEngagementScore` posait l'hypothèse inverse — juste
 * pour un champ ABSENT, fausse pour un champ NULL.
 *
 * ## Pourquoi le harnais existant ne pouvait pas l'attraper
 *
 * `makeLevelPrisma` rend `user.update` par un `jest.fn()` qui ACCEPTE tout :
 * un mock qui ne peut pas échouer là où la base échoue ne teste pas la base.
 * Le mock ci-dessous REJOUE le refus de Mongo — c'est lui, et lui seul, qui
 * fait de ce fichier un témoin et non une paraphrase du code.
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
 * Une base qui se comporte comme Mongo : `$inc` sur `null` refuse, `$inc` sur
 * un champ absent part de zéro, et une écriture par pipeline d'agrégation
 * (`$ifNull`) réussit dans les deux cas.
 */
function makeMongoLikePrisma(initialScore: number | null | undefined) {
  const state: { engagementScore: number | null | undefined } = { engagementScore: initialScore };

  const userUpdate = jest.fn(async (args: unknown) => {
    const data = (args as { data: { engagementScore?: { increment?: number } } }).data;
    const increment = data.engagementScore?.increment;
    if (increment === undefined) return { engagementScore: state.engagementScore };
    if (state.engagementScore === null) {
      throw new Error(
        'Cannot apply $inc to a value of non-numeric type. {_id: ...} has the field \'engagementScore\' of non-numeric type null',
      );
    }
    state.engagementScore = (state.engagementScore ?? 0) + increment;
    return { engagementScore: state.engagementScore };
  });

  const runCommandRaw = jest.fn(async (command: unknown) => {
    const cmd = command as { findAndModify?: string; update?: unknown };
    if (cmd.findAndModify === undefined) return { ok: 1 };
    // Le pipeline `$ifNull` traite null ET absent comme zéro — c'est tout
    // l'intérêt de cette forme d'écriture.
    const pipeline = cmd.update as Array<{ $set: { engagementScore: { $add: [unknown, number] } } }>;
    const added = pipeline[0].$set.engagementScore.$add[1];
    state.engagementScore = (state.engagementScore ?? 0) + added;
    return { ok: 1, value: { engagementScore: state.engagementScore } };
  });

  const prisma = {
    engagementCounter: {
      upsert: jest.fn().mockResolvedValue({ count: 2, points: 6 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    engagementMilestone: { create: jest.fn().mockResolvedValue({}) },
    engagementConversationCredit: { create: jest.fn().mockResolvedValue({}) },
    user: { findUnique: jest.fn().mockResolvedValue(null), update: userUpdate },
    $runCommandRaw: runCommandRaw,
  } as unknown as PrismaClient;

  return { prisma, state, userUpdate, runCommandRaw };
}

describe('updateEngagementScore — un champ null ne fait plus perdre le point', () => {
  it('crédite le poids de l\'axe même quand le score vaut null en base', async () => {
    mockGetShared.mockReturnValue(undefined as never);
    const { prisma, state } = makeMongoLikePrisma(null);

    await new EngagementService(prisma).recordActivity('u-1', 'content.text_message');

    expect(state.engagementScore).toBe(ENGAGEMENT_AXIS_WEIGHTS['content.text_message']);
  });

  it('crédite aussi quand le champ est ABSENT — le cas d\'un compte neuf', async () => {
    mockGetShared.mockReturnValue(undefined as never);
    const { prisma, state } = makeMongoLikePrisma(undefined);

    await new EngagementService(prisma).recordActivity('u-2', 'conversation.private');

    expect(state.engagementScore).toBe(ENGAGEMENT_AXIS_WEIGHTS['conversation.private']);
  });

  it('accumule sur plusieurs activités depuis un score null initial', async () => {
    mockGetShared.mockReturnValue(undefined as never);
    const { prisma, state } = makeMongoLikePrisma(null);
    const service = new EngagementService(prisma);

    await service.recordActivity('u-3', 'content.post');
    await service.recordActivity('u-3', 'comment.text');
    await service.recordActivity('u-3', 'tool.sticker');

    expect(state.engagementScore).toBe(
      ENGAGEMENT_AXIS_WEIGHTS['content.post'] +
        ENGAGEMENT_AXIS_WEIGHTS['comment.text'] +
        ENGAGEMENT_AXIS_WEIGHTS['tool.sticker'],
    );
  });

  it('n\'écrit plus le score par un `increment` nu — la forme qui échoue sur null', async () => {
    mockGetShared.mockReturnValue(undefined as never);
    const { prisma, userUpdate } = makeMongoLikePrisma(null);

    await new EngagementService(prisma).recordActivity('u-4', 'content.story');

    const incrementsDeScore = userUpdate.mock.calls.filter((call) => {
      const data = (call[0] as { data?: { engagementScore?: { increment?: number } } }).data;
      return data?.engagementScore?.increment !== undefined;
    });
    expect(incrementsDeScore).toHaveLength(0);
  });
});

describe('EngagementCounter.points — l\'invariant qui remplace `Σ(compteur × poids)`', () => {
  it('crédite le poids de l\'axe en POINTS, à côté du compte d\'actions', async () => {
    mockGetShared.mockReturnValue(undefined as never);
    const { prisma } = makeMongoLikePrisma(0);
    const upsert = (prisma as unknown as { engagementCounter: { upsert: jest.Mock } }).engagementCounter.upsert;

    await new EngagementService(prisma).recordActivity('u-5', 'content.reel');

    const args = upsert.mock.calls[0][0] as {
      create: { count: number; points: number };
      update: { count: { increment: number }; points: { increment: number } };
    };
    const poids = ENGAGEMENT_AXIS_WEIGHTS['content.reel'];
    expect(args.create.points).toBe(poids);
    expect(args.update.points.increment).toBe(poids);
    expect(args.create.count).toBe(1);
    expect(args.update.count.increment).toBe(1);
  });
});
