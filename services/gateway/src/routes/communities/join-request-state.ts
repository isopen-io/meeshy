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
import { liveJoinRequestWhere, reopenOrphanedAcceptances } from '../../services/community-join-request-lifecycle';

const logger = enhancedLogger.child({ module: 'CommunityJoinRequestState' });

export type ViewerJoinRequestState = 'pending' | null;

export async function viewerJoinRequestState(
  prisma: Pick<PrismaClient, 'communityJoinRequest' | 'communityMember'>,
  input: {
    readonly communityId: string;
    readonly viewerId: string;
    readonly requiresJoinApproval: boolean;
    readonly isMember: boolean;
  },
  now: Date = new Date(),
): Promise<ViewerJoinRequestState> {
  if (!input.requiresJoinApproval || input.isMember) return null;
  try {
    // #19924 — une acceptation restée sans entrée redevient « Demande envoyée ».
    await reopenOrphanedAcceptances(prisma, { communityId: input.communityId, userId: input.viewerId, now });
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
