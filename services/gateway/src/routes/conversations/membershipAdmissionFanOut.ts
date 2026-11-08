import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { announceConversationNew } from '../../services/conversations/obsoleteCapability';
import { announceMemberArrival } from './memberArrivalFanOut';
import type { ConversationRoomEmitter } from '../../socketio/emitToConversationParticipants';
import type { ServerEmitIO } from '../../socketio/serverEmit';

/**
 * Ce qu'une porte d'adhésion doit émettre quand le NOUVEL ARRIVANT n'est pas
 * l'auteur du geste — et le SITE UNIQUE qui le porte (#17032).
 *
 * ─── Pourquoi un module, et pas trois appels par porte ───────────────────────
 *
 * Parce que les trois diffusions étaient retapées à une seule porte sur deux.
 * `POST /conversations/:id/participants` les émettait toutes les trois ;
 * `POST /conversations/:id/invite` n'en émettait qu'une — et son fichier
 * portait l'aveu du motif : son commentaire annonçait « mirrors
 * POST /conversations/:id/participants », la jumelle avait donc été ouverte et
 * à moitié reprise. L'auto-join en est venu, #16837 a rapatrié l'arrivée, les
 * deux autres sont restées derrière.
 *
 * **Une règle qui doit être retapée à chaque porte est une règle qu'une porte
 * finira par ne pas avoir.** C'est la même conclusion que `editedAudience.ts`
 * au cycle 147, pour la même raison : la seconde porte ne rougit jamais.
 *
 * ─── Les trois, et ce que chacune porte ──────────────────────────────────────
 *
 * | événement | audience | ce qu'il fait |
 * |---|---|---|
 * | `conversation:joined` | la room du fil | iOS invalide son cache PERSISTÉ de participants (`ConversationSyncEngine+Socket`) ; le web recharge la feuille des membres |
 * | `conversation:participant-joined` | chaque membre SAUF l'arrivant | l'effectif ABSOLU, par destinataire (`announceMemberArrival`, #16837) |
 * | `conversation:new` | la room PERSONNELLE de l'arrivant | **la seule qui CRÉE la ligne de liste** |
 *
 * La troisième est celle dont l'absence ne se rattrape pas, et c'est ce qui
 * rend le défaut net. `conversation:updated` et la pastille, que le message
 * système d'arrivée pousse déjà, **PATCHENT** une ligne de liste existante — le
 * web sort si la conversation n'est pas en cache (`patchConversation`) — ils ne
 * la CRÉENT pas. Un invité connecté voyait donc ses sockets jointes à la room,
 * recevait les `message:new`, et sa liste ne connaissait pas la conversation.
 * Une notification n'est créée que pour un tête-à-tête : une invitation de
 * GROUPE n'avait **aucun** canal de découverte.
 *
 * ─── Qui N'entre PAS ici, et pourquoi ce n'est pas un oubli ──────────────────
 *
 * Les deux portes de LIEN (`performLinkJoin`, `link-admission-guest`). Le
 * discriminant n'est pas la porte, c'est **qui agit** : l'arrivant d'un lien EST
 * l'auteur du geste, et la conversation lui est servie par la réponse HTTP qu'il
 * attend — `conversation:new` lui apprendrait ce qu'il vient de lire. Un invité
 * SANS COMPTE ne peut en plus pas être le sujet de l'arrivée (contrat strict,
 * #16838) ni destinataire d'une room personnelle d'utilisateur.
 *
 * L'inventaire de ces exemptions est GELÉ par
 * `__tests__/unit/routes/membership-admission-sites.test.ts`, avec la raison de
 * chacune : sans lui, une cinquième porte pourrait naître muette, et le seul
 * symptôme serait une conversation absente de la liste de quelqu'un qui n'a rien
 * demandé.
 *
 * ─── Ordre, et indépendance des échecs ──────────────────────────────────────
 *
 * Les trois partent dans l'ordre du tableau, et **aucune ne peut emporter les
 * suivantes** : chacune est gardée chez elle (`io.to(...).emit(...)` LÈVE quand
 * l'adaptateur ou l'encodeur est en défaut — `emitWithSeq` l'écrit, et c'est la
 * cause du cycle 147). Un éventail accessoire ne décide pas d'une adhésion déjà
 * persistée et déjà due en réponse.
 *
 * **L'admission dans la ROOM se fait AVANT**, et c'est la règle qu'écrit déjà
 * `performLinkJoin` : « l'une sert l'arrivant, l'autre parle de lui aux autres,
 * et c'est la première qui décide s'il recevra quoi que ce soit du fil ». Elle
 * reste au site d'appel — ce n'est pas une diffusion, et elle n'a pas besoin du
 * même `io`.
 */
export async function announceMembershipAdmission(params: {
  readonly prisma: Pick<PrismaClient, 'participant' | 'user' | 'conversation'>;
  readonly io: (ServerEmitIO & ConversationRoomEmitter) | null | undefined;
  readonly conversationId: string;
  readonly arrival: {
    readonly userId: string;
    readonly displayName: string;
    readonly joinedAt: Date | string;
  };
  /**
   * L'auteur du geste, servi comme `creatorId` de la ligne de liste neuve.
   * Repli sur l'arrivant lui-même : la charge déclare le champ non nullable, et
   * l'ancien site d'appel posait déjà `currentUserId ?? userId`.
   */
  readonly actorUserId: string | null | undefined;
  readonly onError: (error: unknown) => void;
}): Promise<void> {
  const { prisma, io, conversationId, arrival, onError } = params;
  if (!io) return;

  try {
    io.to(ROOMS.conversation(conversationId)).emit(SERVER_EVENTS.CONVERSATION_JOINED, {
      conversationId,
      userId: arrival.userId,
    });
  } catch (error) {
    onError(error);
  }

  // `conversation:joined` ci-dessus ne peut PAS porter l'effectif : le même nom
  // et le même payload `{conversationId, userId}` servent l'ack self-only qu'un
  // socket reçoit en REJOIGNANT LA ROOM (`ConversationHandler`), que produit
  // chaque ouverture de fil et qui ne change aucune appartenance. Compter dessus
  // gonflerait le compteur à chaque ouverture — c'est pourquoi aucun client
  // n'incrémente, et pourquoi l'effectif ne pouvait DÉRIVER QUE VERS LE BAS.
  await announceMemberArrival({ prisma, io, conversationId, arrival, onError });

  await announceNewListRow({ ...params, io });
}

async function announceNewListRow(params: {
  readonly prisma: Pick<PrismaClient, 'participant' | 'user' | 'conversation'>;
  readonly io: ServerEmitIO;
  readonly conversationId: string;
  readonly arrival: { readonly userId: string };
  readonly actorUserId: string | null | undefined;
  readonly onError: (error: unknown) => void;
}): Promise<void> {
  const { prisma, io, conversationId, arrival, actorUserId, onError } = params;
  try {
    const [conversation, participants] = await Promise.all([
      prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { type: true, title: true, createdAt: true },
      }),
      prisma.participant.findMany({ where: { conversationId, isActive: true }, select: { userId: true } }),
    ]);
    // Une conversation introuvable n'a pas de ligne de liste à créer, et
    // fabriquer la charge sans elle servirait un type et une date inventés.
    if (!conversation) return;

    await announceConversationNew(prisma, {
      io,
      recipientIds: [arrival.userId],
      payload: {
        conversationId,
        conversationType: conversation.type,
        title: conversation.title ?? null,
        creatorId: actorUserId ?? arrival.userId,
        participantIds: participants
          .map((participant) => participant.userId)
          .filter((userId): userId is string => !!userId),
        createdAt: conversation.createdAt instanceof Date
          ? conversation.createdAt.toISOString()
          : String(conversation.createdAt),
      },
      onError,
    });
  } catch (error) {
    onError(error);
  }
}
