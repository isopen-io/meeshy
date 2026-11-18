/**
 * `community:deleted` (#19590, dernière tranche de #16857) — la disparition
 * d'une communauté, à jour chez ses membres.
 *
 * Supprimer une communauté (son créateur) ou la désactiver (l'équipe)
 * n'émettait rien : chez les autres membres, elle restait dans la liste et son
 * détail ouvert restait actionnable jusqu'à la péremption du cache, puis chaque
 * geste échouait en 404.
 *
 * Règles, gardées par `__tests__/unit/services/community-deleted-broadcast.test.ts` :
 *  - l'audience (membres ACTIFS ∪ créateur) se lit AVANT l'écriture : la
 *    suppression efface les lignes d'appartenance, et une communauté déjà
 *    désactivée n'existait plus pour personne ;
 *  - une lecture qui échoue rend une audience vide : l'annonce ne fait jamais
 *    échouer la suppression ;
 *  - la charge ne dit que ce qui a disparu, pourquoi et quand
 *    (`CommunityDeletedEventData`) : ni membres, ni créateur, ni identité ;
 *  - un envoi qui lève n'arrête pas les autres ;
 *  - l'envoi part après la réponse, jamais en ligne.
 */

import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  SERVER_EVENTS,
  type CommunityDeletedEventData,
  type CommunityDeletedReason,
} from '@meeshy/shared/types/socketio-events';
import { enhancedLogger } from '../utils/logger-enhanced.js';
import { deferAfterResponse, type AfterResponse } from '../utils/after-response.js';
import { broadcastToUser } from '../utils/socket-broadcast';

const logger = enhancedLogger.child({ module: 'CommunityDeletedBroadcast' });

export type CommunityDeletedDeps = {
  readonly deliver: (userId: string, payload: CommunityDeletedEventData) => void;
  readonly now?: () => Date;
};

export type CommunityDeletedRequest = {
  readonly communityId: string;
  readonly reason: CommunityDeletedReason;
  readonly audience: readonly string[];
};

export async function readCommunityDeletedAudience(
  prisma: Pick<PrismaClient, 'community' | 'communityMember'>,
  communityId: string,
): Promise<readonly string[]> {
  try {
    const community = await prisma.community.findFirst({
      where: { id: communityId, isActive: true },
      select: { createdBy: true },
    });
    if (!community) return [];
    const members = await prisma.communityMember.findMany({
      where: { communityId, isActive: true },
      select: { userId: true },
    });
    return [...new Set([...members.map((m) => m.userId), community.createdBy])];
  } catch (error) {
    logger.warn('community:deleted audience read failed', { communityId, error });
    return [];
  }
}

export function deliverCommunityDeleted(deps: CommunityDeletedDeps, request: CommunityDeletedRequest): number {
  const payload: CommunityDeletedEventData = {
    communityId: request.communityId,
    reason: request.reason,
    at: (deps.now ?? (() => new Date()))().toISOString(),
  };
  const delivered = request.audience.map((userId) => {
    try {
      deps.deliver(userId, payload);
      return 1;
    } catch (error) {
      logger.warn('community:deleted emit failed', { communityId: request.communityId, error });
      return 0;
    }
  });
  return delivered.reduce<number>((sum, one) => sum + one, 0);
}

export function scheduleCommunityDeletedBroadcast(
  deps: CommunityDeletedDeps,
  request: CommunityDeletedRequest,
  options: { readonly afterResponse?: AfterResponse } = {},
): void {
  if (request.audience.length === 0) return;
  (options.afterResponse ?? deferAfterResponse)(async () => {
    deliverCommunityDeleted(deps, request);
  }, 'community-deleted-broadcast');
}

/** Le branchement des routes : la room personnelle de chaque destinataire, par la porte d'émission typée. */
export function scheduleCommunityDeletedBroadcastFrom(fastify: FastifyInstance, request: CommunityDeletedRequest): void {
  scheduleCommunityDeletedBroadcast(
    {
      deliver: (userId, payload) => {
        broadcastToUser(fastify, userId, SERVER_EVENTS.COMMUNITY_DELETED, payload);
      },
    },
    request,
  );
}
