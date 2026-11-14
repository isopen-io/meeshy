/**
 * `community:updated` (#18435, première tranche de #16857) — l'identité d'une
 * communauté, à jour chez ses membres.
 *
 * Renommer une communauté, changer son avatar, sa bannière, sa description ou
 * sa confidentialité n'émettait rien : l'écran ouvert des autres membres
 * mentait jusqu'à la péremption de son cache. Le geste diffuse désormais
 * l'identité ÉCRITE, relue après l'écriture.
 *
 * Règles, gardées par `__tests__/unit/services/community-updated-broadcast.test.ts` :
 *  - l'audience est la room personnelle de chaque membre ACTIF et du créateur,
 *    une fois chacun — jamais un ancien membre, jamais un non-membre ;
 *  - une communauté désactivée ou disparue n'annonce rien ;
 *  - la charge ne porte que l'identité publique (`CommunityUpdatedEventData`) :
 *    ni membres, ni présence, ni coordonnées, ni créateur ;
 *  - un envoi qui lève n'arrête pas les autres.
 *
 * Travail ASYNCHRONE : les routes l'appellent par
 * `scheduleCommunityUpdatedBroadcast`, après la réponse, jamais en ligne —
 * lire l'audience d'une grande communauté ne retient pas l'écran du créateur.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { CommunityUpdatedEventData } from '@meeshy/shared/types/socketio-events';
import { enhancedLogger } from '../utils/logger-enhanced.js';
import { deferAfterResponse, type AfterResponse } from '../utils/after-response.js';
import type { FastifyInstance } from 'fastify';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { broadcastToUser } from '../utils/socket-broadcast';

const logger = enhancedLogger.child({ module: 'CommunityUpdatedBroadcast' });

export type CommunityUpdatedDeps = {
  readonly prisma: Pick<PrismaClient, 'community' | 'communityMember'>;
  readonly emit: (userId: string, payload: CommunityUpdatedEventData) => void;
};

export type CommunityUpdatedRequest = { readonly communityId: string };

export async function broadcastCommunityUpdated(
  deps: CommunityUpdatedDeps,
  request: CommunityUpdatedRequest,
): Promise<number> {
  const community = await deps.prisma.community.findFirst({
    where: { id: request.communityId, isActive: true },
    select: {
      id: true,
      identifier: true,
      name: true,
      description: true,
      avatar: true,
      banner: true,
      isPrivate: true,
      createdBy: true,
      updatedAt: true,
    },
  });
  if (!community) return 0;

  const members = await deps.prisma.communityMember.findMany({
    where: { communityId: request.communityId, isActive: true },
    select: { userId: true },
  });

  const payload: CommunityUpdatedEventData = {
    communityId: community.id,
    identifier: community.identifier,
    name: community.name,
    description: community.description,
    avatar: community.avatar,
    banner: community.banner,
    isPrivate: community.isPrivate,
    memberCount: members.length,
    updatedAt: community.updatedAt.toISOString(),
  };

  const audience = [...new Set([...members.map((m) => m.userId), community.createdBy])];
  const delivered = audience.map((userId) => {
    try {
      deps.emit(userId, payload);
      return 1;
    } catch (error) {
      logger.warn('community:updated emit failed', { communityId: request.communityId, error });
      return 0;
    }
  });
  return delivered.reduce<number>((sum, one) => sum + one, 0);
}

export function scheduleCommunityUpdatedBroadcast(
  deps: CommunityUpdatedDeps,
  request: CommunityUpdatedRequest,
  options: { readonly afterResponse?: AfterResponse } = {},
): void {
  (options.afterResponse ?? deferAfterResponse)(async () => {
    try {
      await broadcastCommunityUpdated(deps, request);
    } catch (error) {
      logger.warn('community:updated broadcast failed', { communityId: request.communityId, error });
    }
  }, 'community-updated-broadcast');
}

/** Le branchement des routes : la room personnelle de chaque destinataire, par la porte d'émission typée. */
export function scheduleCommunityUpdatedBroadcastFrom(fastify: FastifyInstance, request: CommunityUpdatedRequest): void {
  scheduleCommunityUpdatedBroadcast(
    {
      prisma: fastify.prisma,
      emit: (userId, payload) => {
        broadcastToUser(fastify, userId, SERVER_EVENTS.COMMUNITY_UPDATED, payload);
      },
    },
    request,
  );
}
