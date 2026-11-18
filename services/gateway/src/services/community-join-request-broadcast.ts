/**
 * `community:join-requested` (#19429) — une demande d'entrée annoncée à ceux
 * qui peuvent l'accepter ou la refuser : les administrateurs, les modérateurs
 * ACTIFS et le créateur de la communauté, une fois chacun. Jamais un membre
 * simple, jamais la personne qui demande (elle a déjà la réponse 202), jamais
 * un intendant bloqué avec elle dans un sens ou l'autre — la liste des demandes
 * le lui cache aussi.
 *
 * La charge ne nomme la personne que par son identifiant : son profil et son
 * pays se relisent par `GET /communities/:id/join-requests`, sous les gardes
 * de la passerelle. Travail ASYNCHRONE, après la réponse.
 */

import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { SERVER_EVENTS, type CommunityJoinRequestedEventData } from '@meeshy/shared/types/socketio-events';
import { enhancedLogger } from '../utils/logger-enhanced.js';
import { deferAfterResponse } from '../utils/after-response.js';
import { broadcastToUser } from '../utils/socket-broadcast';
import { getBlockRelatedUserIds } from '../utils/blocking.js';

const logger = enhancedLogger.child({ module: 'CommunityJoinRequestBroadcast' });

export type CommunityJoinRequestedChange = {
  readonly communityId: string;
  readonly requestId: string;
  readonly userId: string;
};

export function joinRequestedAudience(input: {
  readonly createdBy: string;
  readonly stewards: readonly { readonly userId: string; readonly role: string }[];
}): ReadonlySet<string> {
  return new Set([
    input.createdBy,
    ...input.stewards.filter((s) => s.role === 'admin' || s.role === 'moderator').map((s) => s.userId),
  ]);
}

export type CommunityJoinRequestedDeps = {
  readonly prisma: Pick<PrismaClient, 'community' | 'communityMember' | 'communityJoinRequest' | 'user'>;
  readonly deliver: (userId: string, payload: CommunityJoinRequestedEventData) => void;
  readonly now?: () => Date;
};

export async function broadcastCommunityJoinRequested(
  deps: CommunityJoinRequestedDeps,
  change: CommunityJoinRequestedChange,
): Promise<number> {
  const community = await deps.prisma.community.findFirst({
    where: { id: change.communityId, isActive: true },
    select: { createdBy: true },
  });
  if (!community) return 0;
  const [stewards, pendingCount, blocked] = await Promise.all([
    deps.prisma.communityMember.findMany({
      where: { communityId: change.communityId, isActive: true, role: { in: ['admin', 'moderator'] } },
      select: { userId: true, role: true },
    }),
    deps.prisma.communityJoinRequest.count({ where: { communityId: change.communityId, status: 'pending' } }),
    getBlockRelatedUserIds(deps.prisma, change.userId),
  ]);
  const payload: CommunityJoinRequestedEventData = {
    ...change,
    pendingCount,
    at: (deps.now ?? (() => new Date()))().toISOString(),
  };
  const audience = [...joinRequestedAudience({ createdBy: community.createdBy, stewards })].filter(
    (userId) => userId !== change.userId && !blocked.has(userId),
  );
  return audience
    .map((userId) => {
      try {
        deps.deliver(userId, payload);
        return 1;
      } catch (error) {
        logger.warn('community join-requested emit failed', { communityId: change.communityId, error });
        return 0;
      }
    })
    .reduce<number>((sum, one) => sum + one, 0);
}

export function scheduleCommunityJoinRequestedFrom(fastify: FastifyInstance, change: CommunityJoinRequestedChange): void {
  deferAfterResponse(async () => {
    try {
      await broadcastCommunityJoinRequested(
        {
          prisma: fastify.prisma,
          deliver: (userId, payload) => broadcastToUser(fastify, userId, SERVER_EVENTS.COMMUNITY_JOIN_REQUESTED, payload),
        },
        change,
      );
    } catch (error) {
      logger.warn('community join-requested broadcast failed', { communityId: change.communityId, error });
    }
  }, 'community-join-requested');
}
