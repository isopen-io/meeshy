import type { PrismaClient } from '@meeshy/shared/prisma/client';

/**
 * Deux comptes sont-ils AMIS — au sens d'une demande acceptée, dans un sens
 * comme dans l'autre ?
 *
 * Cette question était écrite trois fois dans le dépôt, à l'identique et sans
 * lien : `PresenceVisibilityService.areConnected` (privée),
 * `routes/signal-protocol.ts:232`, et la garde de visibilité d'un post. Trois
 * copies d'une même loi divergent en silence — celle qui bouge ne fait rougir
 * aucune des deux autres. Site unique désormais.
 *
 * `status: 'accepted'` et rien d'autre : une demande `pending` n'est pas une
 * amitié, et une demande `rejected` encore moins.
 */
export async function amitieAcceptee(
  prisma: Pick<PrismaClient, 'friendRequest'>,
  a: string,
  b: string
): Promise<boolean> {
  if (!a || !b || a === b) return false;

  const ligne = await prisma.friendRequest.findFirst({
    where: {
      status: 'accepted',
      OR: [
        { senderId: a, receiverId: b },
        { senderId: b, receiverId: a },
      ],
    },
    select: { id: true },
  });

  return ligne !== null;
}
