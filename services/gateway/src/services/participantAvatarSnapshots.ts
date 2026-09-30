import type { PrismaClient } from '@meeshy/shared/prisma/client';

/**
 * **UN PORTRAIT DE COMPTE NE SE FIGE DANS AUCUNE CONVERSATION** (#8886).
 *
 * `Participant.avatar` est la surcharge LOCALE d'un membre, et la loi de
 * lecture la fait passer AVANT la photo du compte (`resolveParticipantAvatar`,
 * `packages/shared/utils/participant-helpers.ts`). Aucune route n'écrit de
 * surcharge par conversation pour un compte inscrit ; deux portes d'entrée y
 * RECOPIENT pourtant la photo du compte au moment de l'ajout
 * (`routes/conversations/participants-writes.ts`, la migration de
 * `MessagingService`). Après un changement de photo, chacune de ces lignes
 * continuait de servir l'ANCIENNE, à tout le monde et au porteur lui-même —
 * listes de membres, en-têtes, fil, feuilles de transfert.
 *
 * Le changement de photo libère donc ces instantanés : la ligne retombe sur
 * la photo du compte, comme celles que la création nominale d'une
 * conversation écrit (`core-lifecycle.ts` ne pose aucun `avatar`). Seules les
 * lignes qui en PORTENT un sont écrites.
 */
export async function releaseParticipantAvatarSnapshots(
  prisma: Pick<PrismaClient, 'participant'>,
  userId: string,
): Promise<number> {
  const { count } = await prisma.participant.updateMany({
    where: { userId, type: 'user', avatar: { not: null } },
    data: { avatar: null },
  });
  return count;
}
