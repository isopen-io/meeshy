/**
 * L'ENTRÉE par le lien d'une communauté, annoncée à ses intendants (#19446) —
 * le créateur et les administrateurs et modérateurs ACTIFS, décidés par la porte
 * unique `isCommunitySteward` (#19429). Un membre simple ne la reçoit jamais :
 * les comptes d'entrée ne lui sont pas servis.
 *
 * La charge porte le nombre EXACT de membres actifs entrés par le lien — le
 * `viaLink` que `GET /communities/:id/entries/stats` rend aux mêmes lecteurs —,
 * jamais qui est entré. Ne fait jamais échouer l'adhésion.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { isCommunitySteward } from './community-entries';
import type { LinkActivityRelay } from '../socketio/linkActivityEvents';

type AnnouncePrisma = {
  readonly community: Pick<PrismaClient['community'], 'findFirst'>;
  readonly communityMember: Pick<PrismaClient['communityMember'], 'findMany' | 'count'>;
};

export async function announceCommunityLinkEntry(params: {
  readonly prisma: AnnouncePrisma;
  readonly relay: LinkActivityRelay;
  readonly communityId: string;
  readonly at: Date;
}): Promise<void> {
  try {
    const community = await params.prisma.community.findFirst({
      where: { id: params.communityId, isActive: true },
      select: { id: true, identifier: true, createdBy: true },
    });
    if (!community) return;

    const [members, entries] = await Promise.all([
      params.prisma.communityMember.findMany({
        where: { communityId: params.communityId, isActive: true, role: { in: ['admin', 'moderator'] } },
        select: { userId: true, role: true },
      }),
      params.prisma.communityMember.count({ where: { communityId: params.communityId, isActive: true, joinedVia: 'link' } }),
    ]);
    const stewardship = { createdBy: community.createdBy, members };
    const recipientIds = [...new Set([community.createdBy, ...members.map((member) => member.userId)])]
      .filter((userId) => isCommunitySteward(stewardship, userId));

    params.relay.communityLinkEntry({
      recipientIds,
      communityId: community.id,
      linkId: community.identifier,
      entries,
      at: params.at,
    });
  } catch {
    /* l'adhésion est faite ; l'annonce n'est qu'un écho */
  }
}
