import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { UnifiedAuthRequest } from '../../middleware/auth';

/**
 * Le `Participant.id` du lecteur dans CETTE conversation — la clé des
 * échéances d'éphémère (`MessageStatusEntry`). Un anonyme porte la sienne ;
 * un membre inactif n'en a pas, et ne reçoit donc aucune échéance servie.
 */
export async function readerParticipantIdOf(
  prisma: Pick<PrismaClient, 'participant'>,
  conversationId: string,
  authContext: UnifiedAuthRequest['authContext']
): Promise<string | undefined> {
  if (authContext.type === 'anonymous') return authContext.participantId ?? undefined;
  const participant = await prisma.participant.findFirst({
    where: { conversationId, userId: authContext.userId, isActive: true },
    select: { id: true },
  });
  return participant?.id;
}
