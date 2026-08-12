import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { emitConversationPreviewUpdate, type PreviewEmitIO } from './emitConversationPreviewUpdate';

type MutationPrisma = Pick<PrismaClient, 'participant' | 'message'>;

/**
 * The `MeeshySocketIOManager` surface this helper needs, kept structural so it
 * accepts both the production manager and a test double, and so the REST route
 * files never have to import the manager class.
 */
export interface MessageMutationManager {
  getIO(): PreviewEmitIO | null | undefined;
  enqueueOfflineMessageMutation(params: {
    conversationId: string;
    actorUserId: string | null | undefined;
    eventType: 'edited' | 'deleted';
    messageId: string;
    payload: Record<string, unknown>;
  }): Promise<void>;
  emitUnreadCountsToRecipients?(params: {
    conversationId: string;
    senderId: string | null | undefined;
  }): Promise<void>;
}

type MessageMutationBase = {
  prisma: MutationPrisma;
  manager: MessageMutationManager | null | undefined;
  conversationId: string;
  actorUserId: string;
  messageId: string;
  payload: Record<string, unknown>;
  onError?: (error: unknown) => void;
};

/**
 * `authorId` n'existe QUE sur la suppression, et y est REQUIS.
 *
 * Requis, parce qu'une suppression doit repousser la pastille de non-lus et que
 * l'exclusion porte sur l'AUTEUR du message : le type est ce qui empêche un
 * sixième transport de suppression de rouvrir la brèche en silence.
 *
 * Absent de l'édition, parce qu'éditer ne change aucun compte : redemander le
 * badge y coûterait deux requêtes par frappe validée, pour zéro delta.
 */
export type MessageMutationParams =
  | (MessageMutationBase & { eventType: 'edited' })
  | (MessageMutationBase & { eventType: 'deleted'; authorId: string | null | undefined });

const EVENT_NAME = {
  edited: SERVER_EVENTS.MESSAGE_EDITED,
  deleted: SERVER_EVENTS.MESSAGE_DELETED,
} as const;

/**
 * The single REST-side broadcaster for a message edit or delete.
 *
 * A message mutation has to reach THREE audiences, and every one of them is a
 * separate channel:
 *
 *  1. participants sitting in the conversation → the room emit;
 *  2. participants sitting on the conversation LIST (joined `user:<id>`, no
 *     longer in `conversation:<id>`) → `emitConversationPreviewUpdate`;
 *  3. participants who are OFFLINE right now → the delivery queue, replayed by
 *     `_drainPendingMessages` on their next connection.
 *
 * The WebSocket transport (`MessageHandler.handleMessageEdit` /
 * `handleMessageDelete`) covers all three. The five REST mutation routes each
 * open-coded (1) and (2) and none of them did (3), so an edit or delete made
 * over REST was lost FOREVER for anyone offline at that instant — the exact
 * failure `MessageHandler._enqueueOfflineEventForParticipants` exists to
 * prevent. That gap was invisible precisely because the five sites duplicated
 * the same two-channel block without referencing each other; collapsing them
 * here means a sixth transport cannot silently reopen it.
 *
 * REST is not a secondary path: the iOS SDK edits via `PUT /messages/:messageId`
 * (`routes/messages.ts` — NOT the conversation-scoped sibling) and
 * deletes via `DELETE /conversations/:id/messages/:id` (`MessageService.swift`),
 * so this is the primary mutation transport for the mobile client.
 *
 * Best-effort side channel — never throws. The mutation has already been
 * committed by the time this runs; a broadcast failure must not turn a
 * successful edit into a 500. `onError` lets callers log against the
 * originating request.
 */
export async function broadcastMessageMutation(params: MessageMutationParams): Promise<void> {
  const { prisma, manager, conversationId, actorUserId, eventType, messageId, payload, onError } = params;
  if (!manager) return;

  try {
    manager.getIO()?.to(ROOMS.conversation(conversationId)).emit(EVENT_NAME[eventType], payload);
  } catch (error) {
    onError?.(error);
  }

  await emitConversationPreviewUpdate(prisma, manager.getIO(), conversationId, actorUserId, onError);

  // (4) La pastille de non-lus, sur une SUPPRESSION seulement : le message ne
  // compte plus, et sans cette poussée la liste web (`staleTime: Infinity`) le
  // compterait indéfiniment. Le décompte est déjà juste — il ne manquait que de
  // le redemander. Exclusion sur l'AUTEUR, jamais sur l'acteur : un modérateur
  // qui supprime le message d'un autre est lui-même un destinataire à
  // rafraîchir. Cf. `README.md` § « La pastille de non-lus ».
  //
  // Fire-and-forget, comme dans `broadcastLinkMessage` et pour la même raison :
  // l'unité partagée s'annonce « never awaited on the ACK path », et elle coûte
  // jusqu'à deux requêtes. Les attendre les mettrait devant la réponse HTTP de
  // la suppression, pour un canal purement latéral. Le `.catch()` est
  // obligatoire — un rejet non traité termine le process sous le
  // `--unhandled-rejections=throw` par défaut de Node 22 — et le try/catch garde
  // l'APPEL lui-même (un double de manager sans la méthode).
  if (eventType === 'deleted') {
    try {
      void manager.emitUnreadCountsToRecipients?.({
        conversationId,
        senderId: params.authorId,
      })?.catch((error: unknown) => onError?.(error));
    } catch (error) {
      onError?.(error);
    }
  }

  // Fire-and-forget: `enqueueOfflineMessageMutation` swallows its own failures,
  // so awaiting it would only add the participant lookup's latency to the
  // response for no observable benefit. The try/catch guards the CALL itself
  // (a manager double without the method), not the returned promise.
  try {
    void manager.enqueueOfflineMessageMutation({
      conversationId,
      actorUserId,
      eventType,
      messageId,
      payload,
    });
  } catch (error) {
    onError?.(error);
  }
}
