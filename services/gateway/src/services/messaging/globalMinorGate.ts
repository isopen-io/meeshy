/**
 * Règle 5 de `conversationWriteAdmission` (#9927), pour les chemins qui font
 * PARAÎTRE du contenu dans une conversation sans passer par le point de
 * convergence de l'envoi (`MessagingService.handleMessage`) : la position
 * partagée en direct, l'épinglage, la pièce jointe ajoutée à un message
 * existant.
 *
 * Même loi que l'envoi — `viewerWriteRestrictionOf`, calculée depuis
 * `User.birthDate`, sans état stocké — et même coût nul hors de Global : la
 * date de naissance n'est lue que si la conversation est de type `global`.
 * Un appelant sans compte (session anonyme) n'a pas de date de naissance, donc
 * pas de mineur déclaré. Aucune lecture n'est enveloppée : une base illisible
 * fait échouer le geste, elle n'admet pas un mineur.
 */

import { viewerWriteRestrictionOf, GLOBAL_CONVERSATION_TYPE } from '@meeshy/shared/utils/global-minor-restriction';

export interface GlobalMinorGateReader {
  conversation: {
    findUnique(args: { where: { id: string }; select: { type: true } }): Promise<{ type?: string | null } | null>;
  };
  user: {
    findUnique(args: { where: { id: string }; select: { birthDate: true } }): Promise<{ birthDate?: Date | null } | null>;
  };
}

/** Le type de la conversation est DÉJÀ en main : une lecture au plus, et seulement dans Global. */
export async function refusesMinorInConversationOfType(
  prisma: Pick<GlobalMinorGateReader, 'user'>,
  params: {
    readonly conversationType: string | null | undefined;
    readonly userId: string | null | undefined;
    readonly now: Date;
  }
): Promise<boolean> {
  if (params.conversationType !== GLOBAL_CONVERSATION_TYPE || !params.userId) return false;
  const user = await prisma.user.findUnique({ where: { id: params.userId }, select: { birthDate: true } });
  return viewerWriteRestrictionOf({ conversationType: params.conversationType, birthDate: user?.birthDate, now: params.now }) !== null;
}

/** Le type de la conversation est à lire : une lecture, deux dans Global. */
export async function refusesMinorInConversation(
  prisma: GlobalMinorGateReader,
  params: {
    readonly conversationId: string;
    readonly userId: string | null | undefined;
    readonly now: Date;
  }
): Promise<boolean> {
  if (!params.userId) return false;
  const conversation = await prisma.conversation.findUnique({
    where: { id: params.conversationId },
    select: { type: true },
  });
  return refusesMinorInConversationOfType(prisma, {
    conversationType: conversation?.type,
    userId: params.userId,
    now: params.now,
  });
}
