/**
 * #17117 — l'effacement RGPD des adresses de pair (le numéro E.164 de l'ami
 * d'un réseau tiers) qu'un compte avait ouvertes. Appelé par la purge d'un
 * compte supprimé (`purgeAccountIsolatedData`) : le numéro n'était gardé que
 * pour CE compte (exception bornée à #9225) ; lui effacé, il ne sert plus
 * personne et n'attend pas son échéance de conservation. La conversation
 * reste (elle suit la purge des conversations), son adresse non.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';

export async function eraseExternalPeerHandlesOpenedBy(
  prisma: Pick<PrismaClient, 'externalConversationPeer'>,
  userId: string,
): Promise<number> {
  const { count } = await prisma.externalConversationPeer.deleteMany({ where: { openedByUserId: userId } });
  return count;
}
