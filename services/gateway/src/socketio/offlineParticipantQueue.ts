import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { QueuedMessagePayload } from '@meeshy/shared/types/delivery-queue';
import {
  resolveParticipantLanguage,
  resolveUserLanguagesOrdered,
} from '@meeshy/shared/utils/conversation-helpers';
import { normalizeLanguageCode } from '@meeshy/shared/utils/language-normalize';
import { enhancedLogger } from '../utils/logger-enhanced.js';
import type { QueuedEventVariant } from './queuedEventContract';

const logger = enhancedLogger.child({ module: 'offlineParticipantQueue' });

/**
 * The collaborators the enqueue needs, kept structural so the socket handlers,
 * the manager, the REST broadcasters and test doubles can all supply them
 * without importing each other.
 */
export interface OfflineParticipantQueueDeps {
  deliveryQueue: { enqueue(userId: string, entry: QueuedMessagePayload): Promise<void> } | null | undefined;
  prisma: Pick<PrismaClient, 'participant'>;
  connectedUsers: { has(key: string): boolean };
}

/**
 * Une ligne de participant telle que ce module la consomme. `language` et
 * `user` ne sont chargés que par le chemin restreint par langue — la projection
 * du chemin nominal reste `{ id, userId }`, qui est ce que la fan-out la plus
 * chaude du service paie aujourd'hui.
 */
interface OfflineQueueParticipant {
  id: string;
  userId: string | null;
  language?: string | null;
  user?: {
    systemLanguage?: string | null;
    regionalLanguage?: string | null;
    customDestinationLanguage?: string | null;
    deviceLocale?: string | null;
  } | null;
}

/**
 * Le couple `(eventType, payload)` est désormais CORRÉLÉ (cycle 106) : il vient
 * de `QueuedEventVariant`, dérivé de la table `DRAINED_EVENT` et donc du
 * contrat de fil. Un transport ne peut plus diffuser une forme et en enfiler
 * une autre — la divergence n'aurait eu pour témoin qu'un destinataire hors
 * ligne au mauvais moment.
 */
export type OfflineParticipantQueueParams = QueuedEventVariant & {
  conversationId: string;
  /**
   * Who caused the event, in whichever identity the calling transport holds.
   * Both are accepted and both are honoured: the socket paths know the actor's
   * `Participant.id`, the REST pin/edit routes run under `requiredAuth` and know
   * only the `User.id`. A participant id and a user id never collide, so an
   * exclusion on either is safe — but a caller passing the WRONG one would
   * queue the event back to its own author, who already has it.
   */
  actorParticipantId?: string | null;
  actorUserId?: string | null;
  messageId: string;
  /**
   * Overrides the (messageId, eventType) dedup identity `RedisDeliveryQueue`
   * uses by default. Required whenever more than one distinct occurrence of the
   * same eventType can matter for one message — see the per-caller reasoning at
   * each call site.
   */
  dedupKey?: string;
  /**
   * An already-loaded active-participant list to fan out over, skipping this
   * function's own query. `broadcastNewMessage` runs on the hottest path in the
   * service and has just fetched exactly this list to build its emits; making
   * it re-query per message would be a real regression, and letting it keep its
   * own inline copy of the fan-out is how the previous five copies happened.
   */
  participants?: { id: string; userId: string | null }[];
  /**
   * Restreint le fan-out aux participants hors ligne dont le Prisme
   * Linguistique porte CETTE langue.
   *
   * Une traduction n'est pas un message : elle ne concerne que les lecteurs qui
   * la liront. Le chemin VIVANT l'a toujours su — `emitConversationPreviewUpdate`
   * borne déjà sa diffusion par `onlyIfPreviewCarriesLanguage`. La file hors
   * ligne, elle, adressait chaque langue à TOUS les absents : un message d'une
   * conversation à L langues de lecture y déposait L entrées par absent, dont
   * L−1 dans des langues que le destinataire ne peut afficher (règle du Prisme :
   * seules les langues de son prisme sont servies).
   *
   * Le prédicat est l'APPARTENANCE au prisme, jamais « la langue de tête » : un
   * lecteur de prisme `['de','en']` doit garder l'entrée `en`, qui est son
   * repli de rang 2 le jour où la traduction allemande échoue. Filtrer sur la
   * tête échangerait une économie de bande passante contre une régression du
   * Prisme.
   *
   * Ne s'applique QU'aux familles d'événements par-langue (`translation`
   * aujourd'hui). Un `new`/`edited`/`deleted` n'a pas de langue et n'est jamais
   * restreint.
   */
  restrictToReadersOfLanguage?: string;
  /**
   * Adapte le payload AU DESTINATAIRE, juste avant de l'enfiler.
   *
   * La file est le troisième point de sortie d'un événement, et le plus facile
   * à oublier : une règle posée sur le rendu REST et sur la diffusion live
   * laisse la file rejouer au reconnect exactement ce qu'on venait de taire.
   * Elle est déjà PAR destinataire (`enqueue(queueKey, …)`) — la granularité
   * existe, il ne manquait qu'un moyen de s'en servir.
   *
   * Reçoit la clé de file (le `User.id`, ou le `Participant.id` d'un anonyme) ;
   * rend le payload à déposer pour LUI. Absent, tout le monde reçoit `payload`.
   */
  resolvePayloadForReader?: (queueKey: string) => Record<string, unknown>;
}

/**
 * Les langues qu'un participant peut effectivement AFFICHER, dans l'ordre du
 * Prisme.
 *
 * Compose les deux autorités du dépôt sans réimplémenter leur échelle
 * (règle CLAUDE.md) : `resolveUserLanguagesOrdered` rend le prisme in-app
 * ordonné (systemLanguage → regionalLanguage → customDestinationLanguage →
 * deviceLocale) ; `resolveParticipantLanguage` fournit le repli métier
 * `Participant.language` — le seul signal qu'un invité de lien partagé
 * possède, faute de ligne `User`.
 *
 * Rend `[]` quand aucune langue n'est résoluble : l'appelant traite ce cas en
 * ÉCHEC OUVERT (il met en file), parce qu'un prisme inconnu n'est pas un prisme
 * vide — perdre une traduction est un défaut visible, une entrée de trop ne
 * l'est pas.
 */
function readableLanguagesFor(participant: OfflineQueueParticipant): string[] {
  const prism = participant.user
    ? resolveUserLanguagesOrdered(participant.user, {
        deviceLocale: participant.user.deviceLocale ?? undefined,
      })
    : [];
  if (prism.length > 0) return prism;

  if (!participant.language) return [];
  return [
    resolveParticipantLanguage({
      type: participant.userId ? 'user' : 'anonymous',
      language: participant.language,
      user: participant.user ?? null,
    }),
  ];
}

/**
 * THE implementation of the "offline participants" audience, shared by every
 * transport that mutates or creates conversation state.
 *
 * Every conversation event has to reach participants who are not connected at
 * the instant it happens. `io.to(ROOMS.conversation(id))` reaches CONNECTED
 * sockets only, so a room emit alone loses the event forever for anyone
 * offline: nothing replays it on reconnect and no client refetches
 * spontaneously. `RedisDeliveryQueue` is that replay, drained by
 * `MeeshySocketIOManager._drainPendingMessages`, which re-emits each entry
 * under the event name `_drainedEventName(eventType)` resolves.
 *
 * This function exists because that obligation had been re-implemented FIVE
 * times — twice inside `MessageHandler`, once on the manager, once for
 * reactions, once for attachment reactions — each one private to its owner, so
 * no other writer could call it even when it wanted to. Every gap closed in
 * cycles 13 and 14 was a transport that had no way to honour a guarantee it
 * could not reach. The bodies differed only in the exclusion identity and the
 * dedup key, both of which are parameters here, so a new event family is a call
 * rather than a sixth copy.
 *
 * Best-effort side channel — never throws and never rejects. The event has
 * already been committed by the time this runs; a queue failure must not turn a
 * successful write into a 500 or flip an already-sent ACK to failure.
 */
export async function enqueueForOfflineParticipants(
  deps: OfflineParticipantQueueDeps,
  params: OfflineParticipantQueueParams
): Promise<void> {
  const { deliveryQueue, prisma, connectedUsers } = deps;
  if (!deliveryQueue) return;

  const { conversationId, actorParticipantId, actorUserId, eventType, messageId, payload, dedupKey, resolvePayloadForReader } = params;
  // Normalisée une fois, du MÊME côté que le prisme : `resolveUserLanguagesOrdered`
  // et `resolveParticipantLanguage` rendent des codes réduits et minusculés
  // ('PT-BR' → 'pt'). Comparer une langue cible brute à un prisme normalisé
  // raterait le lecteur qu'on cherche précisément à servir.
  const restrictToLanguage = params.restrictToReadersOfLanguage
    ? normalizeLanguageCode(params.restrictToReadersOfLanguage) ??
      params.restrictToReadersOfLanguage.toLowerCase()
    : null;
  try {
    // La restriction par langue exige les préférences du lecteur, que la
    // projection nominale ne porte pas — et qu'aucun appelant restreint ne
    // fournit via `params.participants`. On requête donc nous-mêmes dans ce cas,
    // en élargissant le `select` pour ce seul chemin : le chemin chaud
    // (`broadcastNewMessage`, jamais restreint) garde sa liste pré-chargée et
    // sa projection à deux colonnes.
    const participants: OfflineQueueParticipant[] = restrictToLanguage
      ? await prisma.participant.findMany({
          where: { conversationId, isActive: true },
          select: {
            id: true,
            userId: true,
            language: true,
            user: {
              select: {
                systemLanguage: true,
                regionalLanguage: true,
                customDestinationLanguage: true,
                deviceLocale: true,
              },
            },
          },
        })
      : params.participants ??
        (await prisma.participant.findMany({
          where: { conversationId, isActive: true },
          select: { id: true, userId: true },
        }));
    for (const p of participants) {
      // Queue key mirrors the presence-key convention: userId for registered
      // users, participant id for anonymous. `connectedUsers` and `ROOMS.user`
      // are keyed the same way on the drain side.
      const queueKey = p.userId ?? p.id;
      const isActor =
        (actorParticipantId != null && p.id === actorParticipantId) ||
        (actorUserId != null && p.userId === actorUserId);
      if (isActor || connectedUsers.has(queueKey)) continue;
      if (restrictToLanguage !== null) {
        // Échec OUVERT sur prisme vide : un participant dont aucune langue n'est
        // résoluble reçoit l'entrée, exactement comme avant ce filtre. Le pire
        // cas reste une entrée inutile en file, jamais une traduction perdue.
        const readable = readableLanguagesFor(p);
        if (readable.length > 0 && !readable.includes(restrictToLanguage)) continue;
      }
      deliveryQueue
        .enqueue(queueKey, {
          messageId,
          conversationId,
          payload: resolvePayloadForReader ? resolvePayloadForReader(queueKey) : payload,
          enqueuedAt: new Date().toISOString(),
          eventType,
          ...(dedupKey ? { dedupKey } : {}),
        })
        .catch((err) => logger.warn('Failed to enqueue offline event', { userId: queueKey, eventType, error: err }));
    }
  } catch (err) {
    logger.warn('Failed to fetch participants for offline enqueue', { conversationId, eventType, error: err });
  }
}
