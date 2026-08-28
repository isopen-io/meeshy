import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type {
  MessageDeletedEventData,
  MessagePinnedEventData,
  MessageUnpinnedEventData,
} from '@meeshy/shared/types/socketio-events';
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
  } & QueuedVariantFor<'edited' | 'deleted' | 'pinned' | 'unpinned'>): Promise<void>;
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
export type MessagePinnedMutationPayload = Anonymized<MessagePinnedEventData>;
export type MessageUnpinnedMutationPayload = Anonymized<MessageUnpinnedEventData>;

type MessageMutationBase<TPayload> = {
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
 *
 * **`prisma` n'existe QUE sur les deux mutations qui déplacent l'APERÇU**, et
 * c'est la même façon de parler : le type dit quelles audiences chaque mutation
 * doit atteindre, plutôt que de laisser un drapeau le décider au corps de la
 * fonction. Éditer change le texte du dernier message, supprimer change quel
 * message est le dernier — les deux se voient depuis la liste des
 * conversations. Épingler n'y change RIEN : ni l'aperçu, ni son ordre, ni son
 * compteur. Exiger le client Prisma pour l'épingle aurait fait payer à chaque
 * épinglage la passe d'aperçu (`emitConversationPreviewUpdate` relit la
 * conversation et son dernier message) pour zéro delta observable, et — pire —
 * aurait donné la passe pour obligatoire au prochain transport qui recopierait
 * la forme.
 */
export type MessageMutationParams =
  | (MessageMutationBase<MessageEditedMutationPayload> & {
      eventType: 'edited';
      prisma: MutationPrisma;
    })
  | (MessageMutationBase<MessageDeletedMutationPayload> & {
      eventType: 'deleted';
      prisma: MutationPrisma;
      authorId: string | null | undefined;
    })
  | (MessageMutationBase<MessagePinnedMutationPayload> & { eventType: 'pinned' })
  | (MessageMutationBase<MessageUnpinnedMutationPayload> & { eventType: 'unpinned' });

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
  switch (params.eventType) {
    case 'edited':
      target.emit(SERVER_EVENTS.MESSAGE_EDITED, params.payload);
      return;
    case 'deleted':
      target.emit(SERVER_EVENTS.MESSAGE_DELETED, params.payload);
      return;
    case 'pinned':
      target.emit(SERVER_EVENTS.MESSAGE_PINNED, params.payload);
      return;
    case 'unpinned':
      target.emit(SERVER_EVENTS.MESSAGE_UNPINNED, params.payload);
      return;
  }
}

/**
 * The single REST-side broadcaster for a message edit, delete, pin or unpin.
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
 *
 * ── L'ÉPINGLE, sixième transport, arrivée au cycle 130 ──────────────────────
 *
 * « Collapsing them here means a sixth transport cannot silently reopen it »,
 * dit le paragraphe ci-dessus. Le sixième transport est arrivé — les deux
 * entrées d'épingle REST — et il a re-codé (1) et (3) à la main plutôt que
 * d'appeler. La phrase disait vrai de ce qu'elle GARDAIT et faux de ce qu'elle
 * PRÉDISAIT : rien n'oblige un nouvel écrivain à passer par ici, et le seul
 * effet d'un helper à peu d'appelants est de documenter que quelques sites
 * appliquent la règle.
 *
 * Ce que la copie manuscrite avait perdu, mesuré :
 *
 *  - **l'émission de room n'était pas gardée.** `io.to(room).emit(...)` LÈVE
 *    quand l'adaptateur ou l'encodeur est en défaut, et l'épingle était déjà
 *    COMMISE en base : la levée remontait au `catch` de la route, qui rendait
 *    500 pour une écriture réussie — puis, la levée ayant sauté la suite,
 *    l'entrée de file hors ligne n'était jamais posée. Un incident cosmétique
 *    emportait la seule garantie DURABLE du chemin (règle du cycle 116) ;
 *  - **la mise en file était détachée sans `.catch`** — la forme que la leçon
 *    230 interdit, et que ce fichier commente à deux endroits.
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
function queuedVariant(
  params: MessageMutationParams,
): QueuedVariantFor<'edited' | 'deleted' | 'pinned' | 'unpinned'> {
  switch (params.eventType) {
    case 'edited':
      return { eventType: 'edited', payload: params.payload };
    case 'deleted':
      return { eventType: 'deleted', payload: params.payload };
    case 'pinned':
      return { eventType: 'pinned', payload: params.payload };
    case 'unpinned':
      return { eventType: 'unpinned', payload: params.payload };
  }
}

export async function broadcastMessageMutation(params: MessageMutationParams): Promise<void> {
  const { manager, conversationId, actorUserId, eventType, messageId, onError } = params;
  if (!manager) return;

  try {
    emitToConversationRoom(manager.getIO()?.to(ROOMS.conversation(conversationId)), params);
  } catch (error) {
    onError?.(error);
  }

  // (2) La liste des conversations, sur les deux mutations qui la DÉPLACENT.
  // L'épingle n'en est pas une (cf. `MessageMutationParams`) : elle ne touche ni
  // l'aperçu, ni son ordre, ni son compteur, et le type est ce qui la dispense —
  // aucun drapeau à lire ici, aucun `prisma` à fournir là-bas.
  if (params.eventType === 'edited' || params.eventType === 'deleted') {
    await emitConversationPreviewUpdate(params.prisma, manager.getIO(), conversationId, actorUserId, onError);
  }

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
  // `broadcastReactionMutation` garde l'appel identique de cette manière.
  //
  // Cette ligne portait « c'était ici la dernière exception de la famille ».
  // C'était une AFFIRMATION, et le balayage du cycle 130 l'a mesurée fausse :
  // il en restait QUATORZE dans `services/gateway/src/`, dont deux à cinquante
  // lignes d'ici, sur les deux entrées d'épingle. Une famille se COMPTE, elle
  // ne se conclut pas depuis le site qu'on vient de corriger — c'est la règle
  // du cycle 93 (« un compte est une affirmation ») appliquée à un inventaire
  // de sites. Le cliquet qui la tient désormais :
  // `src/__tests__/detached-promise-catch-sweep.ts`.
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
