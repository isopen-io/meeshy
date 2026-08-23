import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { ReactionEventType, ReactionOfflineQueueParams } from './reactionOfflineQueue';
import type { ReactionUpdateEventData } from '@meeshy/shared/types/socketio-events';
import type { Anonymized, ServerEmitIO, ServerEmitTarget } from './serverEmit';

/** Alias de la porte typée du contrat — voir `serverEmit.ts` (cycle 104). */
export type ReactionEmitIO = ServerEmitIO;

/**
 * The `MeeshySocketIOManager` surface this helper needs, kept structural so it
 * accepts both the production manager and a test double, and so the REST route
 * files never have to import the manager class.
 */
export interface ReactionMutationManager {
  getIO(): ReactionEmitIO | null | undefined;
  enqueueOfflineReactionMutation(params: ReactionOfflineQueueParams): Promise<void>;
}

/**
 * Ce que ce transport a le droit de mettre sur le fil.
 *
 * `payload: Record<string, unknown>` — un sac de clés — ne satisfait AUCUN champ
 * du contrat, et les QUATRE routes appelantes portaient le double cast qui le
 * dit : `updateEvent as unknown as Record<string, unknown>`. C'est exactement la
 * marque relevée au cycle 103 sur la jumelle des messages : un cast de cette
 * forme sur un objet de contrat NOMME la gouvernance qui manque.
 *
 * Le contrat déclare `ReactionUpdateEventData` ; `ReactionService.createUpdateEvent`
 * rend `ReactionUpdateEvent` (`@meeshy/shared/types/reaction`), son jumeau
 * structurel écrit dans un second fichier. Les quatre casts disparaissent parce
 * que la charge était DÉJÀ juste — ce qui manquait n'était pas la valeur, c'était
 * quoi que ce soit qui la vérifie.
 */
export type ReactionMutationPayload = Anonymized<ReactionUpdateEventData>;

/**
 * L'émission de la room, discriminée sur `eventType`.
 *
 * Les deux réactions partagent leur charge (`ReactionUpdateEventData` pour les
 * deux), donc le `switch` n'est pas ici ce qui choisit un TYPE — c'est ce qui
 * empêche une table indexée de laisser croire que le couple est vérifié quand il
 * ne l'est pas. La porte typée refuse `EVENT_NAME[eventType]` pour cette raison
 * seule, et elle a raison : elle vaudra le jour où les deux charges divergeront.
 */
function emitToConversationRoom(
  target: ServerEmitTarget | undefined,
  eventType: ReactionEventType,
  payload: ReactionMutationPayload,
): void {
  if (!target) return;
  if (eventType === 'reaction-added') {
    target.emit(SERVER_EVENTS.REACTION_ADDED, payload);
    return;
  }
  target.emit(SERVER_EVENTS.REACTION_REMOVED, payload);
}

/**
 * The single REST-side broadcaster for a message reaction toggle.
 *
 * A reaction mutation has to reach TWO audiences, and each is a separate
 * channel:
 *
 *  1. participants sitting in the conversation → the room emit;
 *  2. participants who are OFFLINE right now → the delivery queue, replayed by
 *     `_drainPendingMessages` on their next connection.
 *
 * Unlike `broadcastMessageMutation` there is no third, conversation-list
 * audience: a reaction changes no field of the conversation preview (last
 * message, sender, timestamp all stay put), so there is nothing for
 * `emitConversationPreviewUpdate` to refresh. Two audiences, deliberately.
 *
 * `ReactionHandler` (the socket transport) covered both. The four REST reaction
 * routes and the agent reaction path each open-coded (1) and none of them did
 * (2), so a reaction toggled over REST was lost FOREVER for anyone offline at
 * that instant — the exact failure `enqueueOfflineReactionEvent` exists to
 * prevent. That gap was invisible precisely because the five sites duplicated
 * the same room-emit block without referencing each other; collapsing them here
 * means a sixth transport cannot silently reopen it.
 *
 * REST is not a secondary path: the iOS SDK reacts via `POST /reactions` and
 * un-reacts via `DELETE /reactions/:messageId/:emoji`
 * (`MeeshySDK/Services/ReactionService.swift`), so this is the primary reaction
 * transport for the mobile client.
 *
 * Best-effort side channel — never throws. The reaction has already been
 * committed by the time this runs; a broadcast failure must not turn a
 * successful reaction into a 500. The two audiences are independent: a failure
 * reaching one must not cost the other its event, so each is guarded
 * separately. `onError` lets callers log against the originating request.
 */
export async function broadcastReactionMutation(params: {
  manager: ReactionMutationManager | null | undefined;
  conversationId: string;
  actorParticipantId: string | null | undefined;
  eventType: ReactionEventType;
  messageId: string;
  emoji: string;
  payload: ReactionMutationPayload;
  onError?: (error: unknown) => void;
}): Promise<void> {
  const { manager, conversationId, actorParticipantId, eventType, messageId, emoji, payload, onError } = params;
  if (!manager) return;

  try {
    emitToConversationRoom(manager.getIO()?.to(ROOMS.conversation(conversationId)), eventType, payload);
  } catch (error) {
    onError?.(error);
  }

  // Fire-and-forget: `enqueueOfflineReactionMutation` swallows its own failures,
  // so awaiting it would only add the participant lookup's latency to the
  // response for no observable benefit. The try/catch guards the CALL itself
  // (a manager without the method), and the `.catch` guards the returned
  // promise — Node 22 terminates the process on an unhandled rejection, so a
  // manager that ever rejects must not be able to take the gateway down from a
  // side channel whose whole contract is to be best-effort.
  try {
    void Promise.resolve(
      manager.enqueueOfflineReactionMutation({
        conversationId,
        actorParticipantId,
        eventType,
        messageId,
        emoji,
        payload,
      })
    ).catch((error: unknown) => onError?.(error));
  } catch (error) {
    onError?.(error);
  }
}
