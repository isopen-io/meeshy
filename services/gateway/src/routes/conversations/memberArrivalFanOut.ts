import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { emitConversationMemberCountEvent } from '../../socketio/emitConversationMemberCount';
import { differsOrUnset } from '../../utils/prisma-unset';
import type { ConversationRoomEmitter } from '../../socketio/emitToConversationParticipants';

/**
 * L'arrivée d'un membre INSCRIT, annoncée aux autres membres (#16837).
 *
 * Site UNIQUE de l'éventail `conversation:participant-joined`, parce qu'il y a
 * TROIS portes d'arrivée et qu'une seule le faisait : l'ajout par un hôte
 * (`POST /conversations/:id/participants`). La jointure PAR LIEN — la porte de
 * croissance du produit, servie par trois routes à travers `performLinkJoin` —
 * et l'invitation (`POST /conversations/:id/invite`) n'émettaient rien du tout.
 *
 * Ce que cela coûtait, mesuré aux deux bouts :
 * - le web n'invalide la feuille des membres QUE sur cet événement
 *   (`conversation-members-live.ts`), et son `MEMBERS_STALE_TIME` est d'une
 *   minute : la feuille ouverte d'un admin ne voyait jamais l'arrivant ;
 * - iOS invalide son cache PERSISTÉ des participants sur `conversation:joined`
 *   (`ConversationSyncEngine+Socket`), et la ligne de liste écrit l'effectif
 *   ABSOLU de cet événement-ci. Sans eux, l'effectif de tous les autres membres
 *   reste trop bas jusqu'au prochain événement qui porte un compte — un départ,
 *   un bannissement — ou un `GET /conversations`.
 *
 * Et l'effectif ne pouvait DÉRIVER QUE VERS LE BAS : départ −1, bannissement
 * −1, arrivée par lien rien.
 *
 * **Un invité de lien partagé n'entre PAS ici, et ce n'est pas un oubli.**
 * `ConversationParticipantJoinedEventData` déclare `userId` et `displayName`
 * NON optionnels, et les décodeurs clients sont stricts : une charge au `userId`
 * nul ferait échouer le décodage de l'ÉVÉNEMENT ENTIER plutôt que d'annoncer un
 * invité. Élargir le contrat est une décision, pas un correctif — elle a son
 * issue (#16838), et le précédent du dépôt dit qu'un nom NEUF y coûte moins
 * cher qu'un élargissement (`USER_PREFERENCES_COMMUNITY_REORDERED`).
 */
export async function announceMemberArrival(params: {
  readonly prisma: Pick<PrismaClient, 'participant'>;
  readonly io: ConversationRoomEmitter | null | undefined;
  readonly conversationId: string;
  /**
   * La LIGNE de l'arrivant, qui est ÉCARTÉE de l'éventail : son propre écran
   * reçoit l'effectif par `conversation:new`, l'incrémenter en plus le mettrait
   * en trop.
   */
  readonly arrival: {
    readonly userId: string;
    readonly displayName: string;
    readonly joinedAt: Date | string;
  };
  readonly onError: (error: unknown) => void;
}): Promise<void> {
  const { prisma, io, conversationId, arrival, onError } = params;
  if (!io) return;

  try {
    const audience = await prisma.participant.findMany({
      // `differsOrUnset`, et pas un `NOT` nu : sous MongoDB un champ ABSENT
      // n'est pas un champ nul, donc `NOT: { userId }` ne matche PAS les lignes
      // sans compte — l'éventail perdrait tous les invités de lien, qui sont
      // précisément des destinataires légitimes (ils voient l'effectif, ils ne
      // peuvent simplement pas en être le SUJET, cf. le doc ci-dessus).
      where: { conversationId, isActive: true, ...differsOrUnset('userId', arrival.userId) },
      // `role` et `user.role` en plus des deux identités : les deux titres qui
      // ouvrent l'effectif ENTIER (`canViewExactMemberCount`), que l'éventail
      // doit connaître PAR DESTINATAIRE.
      select: { id: true, userId: true, role: true, user: { select: { role: true } } },
    });

    emitConversationMemberCountEvent({
      io,
      conversationId,
      participants: audience,
      event: SERVER_EVENTS.CONVERSATION_PARTICIPANT_JOINED,
      payload: {
        conversationId,
        userId: arrival.userId,
        displayName: arrival.displayName,
        joinedAt: arrival.joinedAt instanceof Date ? arrival.joinedAt.toISOString() : String(arrival.joinedAt),
      },
      // `+ 1` parce que l'éventail ÉCARTE l'arrivant : il est actif depuis
      // l'écriture, donc il compte, mais il ne figure pas dans `audience`. Une
      // seconde requête ne rendrait rien de plus.
      memberCount: audience.length + 1,
    });
  } catch (error) {
    // L'éventail est ACCESSOIRE : l'adhésion est persistée et la réponse déjà
    // due. Lever ici annoncerait à l'arrivant que son entrée a échoué alors
    // qu'elle a pris effet — et le ferait rejouer.
    onError(error);
  }
}
