import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { MessageDeletedEventData } from '@meeshy/shared/types/socketio-events';
import type { buildMessageEditedCore } from './messageEditedPayload';
import {
  emitConversationPreviewUpdate,
  type PreviewEmitIO,
  type PreviewPrisma,
} from './emitConversationPreviewUpdate';
import type { Anonymized, ServerEmitTarget } from './serverEmit';
import type { QueuedVariantFor } from './queuedEventContract';

// Ce relais ne lit rien lui-même : il transmet le prisma de l'aperçu tel quel.
// Le dériver plutôt que le redéclarer est ce qui empêche les deux listes de
// modèles de diverger.
type MutationPrisma = PreviewPrisma;

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
    messageId: string;
  } & QueuedVariantFor<'edited' | 'deleted'>): Promise<void>;
  emitUnreadCountsToRecipients?(params: {
    conversationId: string;
    senderId: string | null | undefined;
  }): Promise<void>;
}

/**
 * Ce que ce transport a le droit de mettre sur le fil, par événement.
 *
 * `broadcastMessageMutation` prenait `payload: Record<string, unknown>` : un
 * sac de clés ne satisfait AUCUN champ du contrat, donc le cliquet de
 * `messageEditedPayload.ts` — qui dérive de `SocketIOMessage` la liste des
 * champs REQUIS et refuse de compiler si le noyau en perd un — n'avait aucune
 * prise sur les TROIS entrées REST. Elles servaient le contrat par ACCIDENT,
 * en étalant la ligne Prisma brute qu'un `include` large rendait assez
 * fournie : les sept clés y étaient, avec la mauvaise VALEUR dans `senderId`
 * (le `Participant.id` de la colonne, là où les clients attendent un
 * `User.id`).
 *
 * Exiger le NOYAU plutôt que le contrat entier est délibéré : les extras que
 * chaque transport sert en propre (`sender`, `translations`,
 * `validatedMentions`, `meta`) restent libres — TypeScript n'applique pas le
 * contrôle des propriétés excédentaires aux clés apportées par étalement — et
 * le lot reste ADDITIF. Ce qui cesse d'être libre, c'est de composer soi-même
 * les champs que le contrat exige.
 */
export type MessageEditedMutationPayload = ReturnType<typeof buildMessageEditedCore>;
export type MessageDeletedMutationPayload = Anonymized<MessageDeletedEventData>;

type MessageMutationBase<TPayload> = {
  prisma: MutationPrisma;
  manager: MessageMutationManager | null | undefined;
  conversationId: string;
  actorUserId: string;
  messageId: string;
  payload: TPayload;
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
  | (MessageMutationBase<MessageEditedMutationPayload> & { eventType: 'edited' })
  | (MessageMutationBase<MessageDeletedMutationPayload> & {
      eventType: 'deleted';
      authorId: string | null | undefined;
    });

/**
 * L'émission de la room, discriminée sur `eventType`.
 *
 * Elle ne l'était pas : une table `EVENT_NAME[eventType]` d'un côté et
 * `payload` de l'autre sont DEUX unions indépendantes, et rien ne disait qu'on
 * prend le même membre dans les deux. Le cycle 103 a gouverné la CHARGE
 * (`payload` discriminé par `eventType`) et laissé cette moitié-là ouverte,
 * derrière un `emit(event: string, payload: unknown)` qui acceptait n'importe
 * quel couple : un `SocketIOMessage` servi sous `message:deleted` compilait.
 *
 * Le `switch` n'est pas une préférence de style, c'est le seul moyen de
 * CORRÉLER les deux unions — la porte typée refuse de compiler sans lui.
 */
function emitToConversationRoom(
  target: ServerEmitTarget | undefined,
  params: MessageMutationParams,
): void {
  if (!target) return;
  if (params.eventType === 'edited') {
    target.emit(SERVER_EVENTS.MESSAGE_EDITED, params.payload);
    return;
  }
  target.emit(SERVER_EVENTS.MESSAGE_DELETED, params.payload);
}

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
/**
 * Le couple `(eventType, payload)` de la FILE, narrowé une fois.
 *
 * `broadcastMessageMutation` reçoit une union discriminée et la destructurait :
 * `eventType` et `payload` redevenaient alors deux unions indépendantes, et
 * l'appel à la file ne pouvait plus être vérifié — le même défaut que le
 * cycle 104 a corrigé sur l'ÉMISSION, une couche plus bas et pour la même
 * raison.
 */
function queuedVariant(params: MessageMutationParams): QueuedVariantFor<'edited' | 'deleted'> {
  return params.eventType === 'edited'
    ? { eventType: 'edited', payload: params.payload }
    : { eventType: 'deleted', payload: params.payload };
}

export async function broadcastMessageMutation(params: MessageMutationParams): Promise<void> {
  const { prisma, manager, conversationId, actorUserId, eventType, messageId, payload, onError } = params;
  if (!manager) return;

  try {
    emitToConversationRoom(manager.getIO()?.to(ROOMS.conversation(conversationId)), params);
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

  // Fire-and-forget: awaiting this would only add the participant lookup's
  // latency to the response for no observable benefit.
  //
  // DEUX gardes, parce qu'il y a deux façons d'échouer et qu'aucune ne couvre
  // l'autre : le try/catch garde l'APPEL (un double de manager sans la
  // méthode, un `throw` synchrone), le `.catch` garde la PROMESSE RENDUE. Sans
  // le second, une implémentation `async` qui rejette produit un rejet non
  // traité, et Node 22 termine le process sous son
  // `--unhandled-rejections=throw` par défaut — la gateway entière tombée pour
  // un canal dont tout le contrat est d'être best-effort.
  //
  // Ne PAS raisonner « l'implémentation actuelle avale ses erreurs » :
  // `MessageMutationManager` est une interface structurelle, la garantie
  // appartient donc à ce fichier, pas au collaborateur. Le jumeau
  // `broadcastReactionMutation` garde l'appel identique de cette manière ;
  // c'était ici la dernière exception de la famille.
  try {
    void Promise.resolve(
      manager.enqueueOfflineMessageMutation({
        conversationId,
        actorUserId,
        messageId,
        // Le couple part CORRÉLÉ (cycle 106) : le destructurer le rendrait à
        // deux unions indépendantes, et la file cesserait d'être gardée à
        // l'étage même où elle vient de l'être.
        ...queuedVariant(params),
      })
    ).catch((error: unknown) => onError?.(error));
  } catch (error) {
    onError?.(error);
  }
}
