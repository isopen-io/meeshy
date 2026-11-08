/**
 * La file de rejeu hors ligne des MARQUES PERSONNELLES du lecteur (#16688) —
 * étoile, masquage « pour moi », restauration.
 *
 * ## Le défaut que ce module existe pour fermer
 *
 * Les trois familles sont diffusées par `broadcastToUser`, sur la seule room
 * personnelle `user:{id}`, et leurs deux modules producteurs écrivent la raison
 * dans leur propre préambule : « diffuser à `user:{id}` pour que les AUTRES
 * appareils convergent ». C'est une feature de synchronisation multi-appareil,
 * consommée côté web (`starred-messages-cache.ts`, `realtime-message-hidden.ts`)
 * ET côté iOS (`MessageSocketManager+MessageMarks.swift`,
 * `MessageSocketEvents+Messages.swift`).
 *
 * Elle ne marchait que si les deux appareils étaient ALLUMÉS EN MÊME TEMPS.
 *
 * `io.to(room).emit(...)` n'atteint que les sockets CONNECTÉES, et la file de
 * rejeu est le seul mécanisme qui rattrape une absence. Or les trois familles
 * étaient, PAR CONSTRUCTION, les seules qui ne pouvaient jamais y entrer :
 * `enqueueForOfflineParticipants` décide de l'audience par
 * `connectedUsers.has(queueKey)`, la clé de file est le COMPTE
 * (`p.userId ?? p.id`, qu'`AuthHandler._registerUser` indexe pour TOUTES les
 * sockets du compte), et **l'appareil qui pose la marque est le compte**. La
 * question « ce destinataire est-il joignable ? » recevait donc toujours OUI,
 * de la part de l'acteur lui-même, pour un destinataire qui est un AUTRE
 * appareil du même compte.
 *
 * > **Un test de joignabilité posé sur le COMPTE ne dit rien d'un événement
 * > dont l'ACTEUR est ce compte.** Il ne mesure pas la présence du
 * > destinataire : il mesure la présence de l'émetteur. C'est la forme « une
 * > garde conditionnée à ce qu'elle garde est un no-op » déplacée d'une garde
 * > vers une audience — et elle est plus discrète, parce que le prédicat est
 * > JUSTE pour les onze autres familles, dont l'acteur est un TIERS.
 *
 * ## Ce que chaque famille avait comme recours, mesuré
 *
 * | famille | recours hors ligne avant ce lot |
 * |---|---|
 * | `message:starred` | **AUCUN** — ni file, ni `GET /sync` (qui ne porte aucun état d'étoile), ni drapeau d'étoile sur une charge de message : aucun `isStarred` n'existe dans le dépôt. Seul `GET /me/starred-messages` le rend, et seulement si l'utilisateur ouvre cet écran-là. |
 * | `message:hidden-for-me` | `GET /sync` sert les pierres tombales `hidden` (`routes/sync/messages.ts`) — un recours PULL, conditionné à l'appel, pas un rattrapage temps réel |
 * | `message:restored-for-me` | aucun canal PUSH ; sa prise en charge par `GET /sync` n'a pas été vérifiée par ce lot |
 *
 * C'est la première ligne qui justifie le lot : une étoile posée sur le
 * téléphone n'apparaissait sur la tablette JAMAIS, et aucune relecture du fil
 * ne la rendait.
 *
 * ## Pourquoi l'enfilage est INCONDITIONNEL
 *
 * On ne peut pas savoir QUEL appareil a agi : la clé de file est le compte, et
 * rien ne distingue deux sockets du même compte dans cette dimension. Enfiler
 * sous condition de non-connexion revient donc au prédicat qu'on vient de
 * disqualifier. L'entrée part donc toujours, et l'appareil qui a agi en reçoit
 * un ÉCHO au prochain drain du compte.
 *
 * Cet écho est inoffensif, et c'est une propriété des charges, pas un espoir :
 * les trois portent un état ABSOLU (`starred: true|false`, la liste exacte des
 * messages masqués, la liste exacte des restaurés), jamais un delta. Les
 * rejouer dans l'ordre — ce que le drain fait, il retrie par `enqueuedAt` —
 * aboutit au même état final. Le web le dit lui-même : son écouteur traite
 * `message:starred` comme « UN AUTRE APPAREIL, OU L'ÉCHO DE CE GESTE-CI ».
 *
 * ## Ce que ce module N'enfile PAS, et c'est délibéré
 *
 * Il ne fait AUCUNE entrée par message pour les familles de visibilité. Le lot
 * de masquage va jusqu'à 100 ids (`routes/user-deletions.ts`), la file est
 * bornée à `DELIVERY_QUEUE_MAX_PER_USER` (500) et son `LTRIM` garde les plus
 * RÉCENTES : cent entrées pour un seul geste évinceraient les messages que le
 * lecteur n'a pas encore vus. Le groupement par CONVERSATION est aussi ce que
 * le gate d'autorisation du drain exige — `_dropEndedMemberships` agrège les
 * `conversationId` du lot — et ce que les modules producteurs ont déjà choisi
 * pour la diffusion (« UNE diffusion pour tout le lot, jamais une par
 * message »).
 *
 * La `dedupKey` nomme donc le LOT, pas son premier message. Sous la clé par
 * défaut (`messageId`), deux lots qui se recouvrent se supplanteraient par leur
 * premier id commun, et les messages du lot supplanté seraient perdus —
 * l'entrée supprimée emportant sa liste entière.
 *
 * `starred`, lui, garde la clé par défaut (`messageId`) parce que c'est
 * exactement la bonne identité : un état par (lecteur, message), dont le
 * dernier gagne. `ENQUEUE_DEDUP_LUA` SUPPLANTE en place pour tout `eventType`
 * autre que `'new'` — un `starred:false` posé après un `starred:true` remplace
 * donc le premier, et l'appareil absent relit le seul état qui soit vrai.
 *
 * ## Postures d'échec
 *
 * Best-effort de bout en bout, comme la diffusion qu'il complète : ne lève
 * jamais, ne rejette jamais. L'écriture a déjà été commise quand ce module
 * s'exécute, et une panne de Redis ne doit pas transformer un masquage réussi
 * en 500 — l'utilisateur rejouerait un geste qui a pris effet.
 *
 * Pas de file dans ce processus (test, script, outil) ⇒ rien n'est enfilé et
 * rien n'est signalé : c'est le sens que `delivery-queue-registry` donne déjà à
 * son repli `undefined`.
 */

import { createHash } from 'crypto';
import type {
  MessageStarredEventData,
  PersonalMessageVisibilityRef,
} from '@meeshy/shared/types/socketio-events';
import type { QueuedMessagePayload } from '@meeshy/shared/types/delivery-queue';
import {
  getSharedPersonalMarkEnqueuer,
  type QueuedPersonalMarkEnqueuer,
} from '../services/delivery-queue-registry';
import {
  isAddressableConversationId,
  type PersonalMarkEventType,
  type QueuedPayloadFor,
} from './queuedEventContract';
import { enhancedLogger } from '../utils/logger-enhanced.js';

const logger = enhancedLogger.child({ module: 'enqueuePersonalMessageMark' });

/**
 * La file à employer. Le paramètre existe pour les témoins ; la PRODUCTION ne
 * le passe jamais, et c'est le registre — donc l'unité elle-même — qui résout.
 */
export type PersonalMarkQueueOverride = { readonly queue?: QueuedPersonalMarkEnqueuer };

/**
 * Enfile UNE entrée, et avale tout.
 *
 * `isAddressableConversationId` est vérifié ICI plutôt qu'au drain, bien que le
 * drain le revérifie : une entrée dont l'id de conversation n'est pas
 * interrogeable fait lever le gate d'autorisation du drain pour le LOT ENTIER
 * (les ids y sont agrégés en un seul `in`), et le `catch` de ce gate rejoue
 * alors l'arriéré SANS FILTRE. Écrire une entrée qu'on sait indélivrable
 * revient à armer cette désactivation. Les appelants servent des
 * `Conversation.id` lus en base, donc le refus ne devrait jamais se produire —
 * ce qui est précisément la raison de le journaliser plutôt que de le taire.
 */
async function pushMarkEntry(
  userId: string,
  entry: QueuedMessagePayload,
  override: PersonalMarkQueueOverride,
): Promise<void> {
  const queue = override.queue ?? getSharedPersonalMarkEnqueuer();
  if (!queue) return;
  if (!isAddressableConversationId(entry.conversationId)) {
    logger.warn('Personal mark NOT queued: the conversation id is not addressable', {
      userId,
      eventType: entry.eventType,
      conversationId: entry.conversationId,
    });
    return;
  }
  try {
    await queue.enqueue(userId, entry);
  } catch (error) {
    logger.warn('Failed to enqueue a personal message mark', {
      userId,
      eventType: entry.eventType,
      conversationId: entry.conversationId,
      error,
    });
  }
}

/**
 * La clé de dédup d'un LOT de visibilité : la famille, la conversation, et
 * l'empreinte de l'ENSEMBLE des messages, trié pour que deux lots identiques
 * écrits dans un ordre différent se supplantent bien.
 *
 * Tronquée à seize caractères hexadécimaux : la clé voyage dans chaque entrée
 * sérialisée et sert à une comparaison d'égalité, jamais à une preuve — une
 * collision ferait superposer deux lots distincts d'une même conversation, ce
 * qui est le comportement de la clé par défaut, en moins probable.
 */
function visibilityBatchDedupKey(
  eventType: PersonalMarkEventType,
  conversationId: string,
  messageIds: readonly string[],
): string {
  const digest = createHash('sha256').update([...messageIds].sort().join(',')).digest('hex').slice(0, 16);
  return `${eventType}:${conversationId}:${digest}`;
}

/** `conversationId` → les messages de ce lot qui lui appartiennent, dans l'ordre d'arrivée. */
function groupByConversation(
  messages: readonly PersonalMessageVisibilityRef[],
): Map<string, PersonalMessageVisibilityRef[]> {
  const byConversation = new Map<string, PersonalMessageVisibilityRef[]>();
  for (const message of messages) {
    const bucket = byConversation.get(message.conversationId);
    if (bucket) bucket.push(message);
    else byConversation.set(message.conversationId, [message]);
  }
  return byConversation;
}

export type EnqueuePersonalVisibilityMarkParams = PersonalMarkQueueOverride & {
  readonly userId: string;
  readonly eventType: 'hidden-for-me' | 'restored-for-me';
  readonly messages: readonly PersonalMessageVisibilityRef[];
  /** `hiddenAt` ou `restoredAt` — la MÊME valeur que la diffusion a servie. */
  readonly at: string;
};

/**
 * Rejoue à l'appareil absent le masquage (ou la restauration) qu'un autre
 * appareil du même compte vient de poser.
 *
 * La charge enfilée est celle de la DIFFUSION, à la liste près : une entrée par
 * conversation, portant les messages de cette conversation seulement. Les deux
 * consommateurs itèrent la liste, donc N entrées à une conversation chacune
 * sont équivalentes à une diffusion à N conversations — et c'est la seule forme
 * que le gate d'appartenance du drain sache arbitrer par conversation.
 */
export async function enqueuePersonalVisibilityMark(
  params: EnqueuePersonalVisibilityMarkParams,
): Promise<void> {
  const { userId, eventType, messages, at } = params;
  if (messages.length === 0) return;

  for (const [conversationId, group] of groupByConversation(messages)) {
    const refs = group.map((m) => ({ messageId: m.messageId, conversationId: m.conversationId }));
    // Typé par le CONTRAT DE FILE, jamais par une assertion : `QueuedPayloadFor`
    // dérive la charge de l'événement que `DRAINED_EVENT` associe à cet
    // `eventType`, et son `Anonymized` est exactement ce qui la rend assignable
    // au `Record<string, unknown>` que la file stocke. Un
    // `as unknown as Record<string, unknown>` aurait compilé en effaçant la
    // corrélation `(eventType, payload)` — c'est-à-dire la seule chose que ce
    // contrat existe pour tenir.
    const payload: QueuedPayloadFor<'hidden-for-me'> | QueuedPayloadFor<'restored-for-me'> =
      eventType === 'hidden-for-me'
        ? { userId, messages: refs, hiddenAt: at }
        : { userId, messages: refs, restoredAt: at };
    await pushMarkEntry(
      userId,
      {
        // Le message REPRÉSENTATIF du lot. Il ne sert ni à la dédup (la
        // `dedupKey` nomme le lot entier) ni à la garde de vivacité du drain
        // (`carriesMessageText` est FAUX pour ces familles, qui ne portent pas
        // de texte) : il reste parce que le type l'exige et parce que le
        // journal par entrée du drain NOMME ce champ quand une remise échoue.
        messageId: refs[0].messageId,
        conversationId,
        payload,
        enqueuedAt: new Date().toISOString(),
        eventType,
        dedupKey: visibilityBatchDedupKey(eventType, conversationId, refs.map((r) => r.messageId)),
      },
      params,
    );
  }
}

export type EnqueueStarMarkParams = PersonalMarkQueueOverride & {
  readonly userId: string;
  /** La charge que `message:starred` vient de diffuser, telle quelle. */
  readonly state: MessageStarredEventData;
};

/**
 * Rejoue à l'appareil absent l'étoile qu'un autre appareil du même compte vient
 * de poser ou de retirer.
 *
 * AUCUNE `dedupKey` : la clé par défaut (`messageId`) est la bonne identité, et
 * la supplantation en place de `ENQUEUE_DEDUP_LUA` fait exactement ce qu'il
 * faut — un seul état par (lecteur, message), le dernier écrit.
 */
export async function enqueueStarMark(params: EnqueueStarMarkParams): Promise<void> {
  const { userId, state } = params;
  // Même raison que chez la jumelle : la charge est la forme que le CONTRAT
  // associe à `'starred'`, pas un objet qu'on affirme compatible.
  const payload: QueuedPayloadFor<'starred'> = state;
  await pushMarkEntry(
    userId,
    {
      messageId: state.messageId,
      conversationId: state.conversationId,
      payload,
      enqueuedAt: new Date().toISOString(),
      eventType: 'starred',
    },
    params,
  );
}
