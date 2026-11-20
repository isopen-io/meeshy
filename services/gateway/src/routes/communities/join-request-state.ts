/**
 * La demande d'entrée DU LECTEUR, servie sur le détail d'une communauté
 * (#19868) : `'pending'` quand le lecteur, non membre d'une communauté qui
 * valide chaque entrée, attend une réponse ; `null` sinon.
 *
 * Seul un ÉTAT voyage — ni l'identifiant de la demande, ni sa source, ni son
 * pays, ni rien d'un autre demandeur. Rien n'est lu pour un membre ni pour une
 * communauté à entrée directe. Une lecture qui lève rend `null` : le détail ne
 * tombe pas pour un libellé, et un nouvel envoi retrouve la demande existante
 * (`requestCommunityEntry` est idempotent). Une demande acceptée sans que
 * la personne soit entrée y est d'abord rouverte (#19924).
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { enhancedLogger } from '../../utils/logger-enhanced.js';
import {
  JOIN_REQUEST_COOLDOWN_MS,
  liveJoinRequestWhere,
  reopenOrphanedAcceptances,
  type ReopenedJoinRequest,
} from '../../services/community-join-request-lifecycle';

const logger = enhancedLogger.child({ module: 'CommunityJoinRequestState' });

export type ViewerJoinRequestState = 'pending' | null;

export async function viewerJoinRequestState(
  prisma: Pick<PrismaClient, 'communityJoinRequest' | 'communityMember'>,
  input: {
    readonly communityId: string;
    readonly viewerId: string;
    readonly requiresJoinApproval: boolean;
    readonly isMember: boolean;
    readonly onReopened?: (reopened: ReopenedJoinRequest) => void;
  },
  now: Date = new Date(),
): Promise<ViewerJoinRequestState> {
  if (!input.requiresJoinApproval || input.isMember) return null;
  try {
    // #19924 — une acceptation restée sans entrée redevient « Demande envoyée ».
    await reopenOrphanedAcceptances(prisma, {
      communityId: input.communityId,
      userId: input.viewerId,
      now,
      onReopened: input.onReopened,
    });
    const pending = await prisma.communityJoinRequest.findFirst({
      where: { communityId: input.communityId, userId: input.viewerId, ...liveJoinRequestWhere(now) },
      select: { id: true },
    });
    return pending ? 'pending' : null;
  } catch (error) {
    logger.warn('Viewer join request unavailable', { communityId: input.communityId, error: String(error) });
    return null;
  }
}

/**
 * La fin du délai après un refus (#19879) : la date ISO à partir de laquelle
 * le LECTEUR, non membre d'une communauté qui valide chaque entrée, peut
 * redemander ; `null` sans refus de moins de sept jours. Seule la date
 * voyage — ni qui a refusé, ni l'identifiant de la demande. Une lecture qui
 * lève rend `null` : le détail offre « Demander à rejoindre », et la
 * passerelle répond 403 `COMMUNITY_JOIN_COOLDOWN` si le délai court encore.
 */
export async function viewerJoinRetryAt(
  prisma: Pick<PrismaClient, 'communityJoinRequest'>,
  input: {
    readonly communityId: string;
    readonly viewerId: string;
    readonly requiresJoinApproval: boolean;
    readonly isMember: boolean;
  },
  now: Date = new Date(),
): Promise<string | null> {
  if (!input.requiresJoinApproval || input.isMember) return null;
  try {
    const refusal = await prisma.communityJoinRequest.findFirst({
      where: {
        communityId: input.communityId,
        userId: input.viewerId,
        status: 'rejected',
        decidedAt: { gte: new Date(now.getTime() - JOIN_REQUEST_COOLDOWN_MS) },
      },
      orderBy: { decidedAt: 'desc' },
      select: { decidedAt: true },
    });
    const decidedAt = refusal?.decidedAt;
    return decidedAt instanceof Date ? new Date(decidedAt.getTime() + JOIN_REQUEST_COOLDOWN_MS).toISOString() : null;
  } catch (error) {
    logger.warn('Viewer join retry date unavailable', { communityId: input.communityId, error: String(error) });
    return null;
  }
}
