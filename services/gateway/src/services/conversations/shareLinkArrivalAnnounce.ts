/**
 * L'ARRIVÉE par un lien de partage, annoncée à qui le gère (#19446) : le
 * créateur du lien et les modérateurs, administrateurs et créateur ACTIFS de la
 * conversation — le même cercle que `loadShareLinkForManagement`, rang décidé
 * par la loi unique `actorHasMinimumRole`.
 *
 * Part APRÈS l'enregistrement du pays (tâche post-réponse), et ne porte de
 * l'arrivant que ce que la liste des arrivées montre déjà à ces lecteurs : son
 * identifiant de participation, invité ou non, son pays, son heure. Ni nom, ni
 * compte, ni e-mail. Ne fait jamais échouer la jointure.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { MemberRole } from '@meeshy/shared/types/role-types';
import { actorHasMinimumRole } from '@meeshy/shared/utils/conversation-authority';
import type { LinkActivityRelay } from '../../socketio/linkActivityEvents';

const MANAGER_ROLES = [MemberRole.CREATOR, MemberRole.ADMIN, MemberRole.MODERATOR].flatMap((role) => [
  role,
  role.toUpperCase(),
  role.charAt(0).toUpperCase() + role.slice(1),
]);

type AnnouncePrisma = {
  readonly conversationShareLink: Pick<PrismaClient['conversationShareLink'], 'findUnique'>;
  readonly participant: Pick<PrismaClient['participant'], 'findUnique' | 'findMany'>;
};

export async function announceShareLinkArrival(params: {
  readonly prisma: AnnouncePrisma;
  readonly relay: LinkActivityRelay;
  readonly shareLinkId: string;
  readonly participantId: string;
}): Promise<void> {
  try {
    const [link, arrival] = await Promise.all([
      params.prisma.conversationShareLink.findUnique({
        where: { id: params.shareLinkId },
        select: { linkId: true, currentUses: true, maxUses: true, createdBy: true, conversationId: true },
      }),
      params.prisma.participant.findUnique({
        where: { id: params.participantId },
        select: { id: true, type: true, joinedAt: true, joinCountry: true },
      }),
    ]);
    if (!link || !arrival) return;

    const managers = await params.prisma.participant.findMany({
      where: { conversationId: link.conversationId, isActive: true, userId: { not: null }, role: { in: MANAGER_ROLES } },
      select: { userId: true, role: true },
    });
    const managerIds = managers
      .filter((member) => actorHasMinimumRole({ conversationRole: member.role, platformRole: null }, MemberRole.MODERATOR))
      .flatMap((member) => (member.userId ? [member.userId] : []));

    params.relay.shareLinkArrival({
      recipientIds: [...new Set([...(link.createdBy ? [link.createdBy] : []), ...managerIds])],
      linkId: link.linkId,
      currentUses: link.currentUses,
      maxUses: link.maxUses ?? null,
      arrival: {
        participantId: arrival.id,
        isAnonymous: arrival.type === 'anonymous',
        country: arrival.joinCountry ?? null,
        joinedAt: arrival.joinedAt ?? new Date(),
      },
    });
  } catch {
    /* la jointure est faite ; l'annonce n'est qu'un écho */
  }
}
