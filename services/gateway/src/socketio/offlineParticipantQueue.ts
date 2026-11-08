import { PARTICIPATION_VIVANTE } from '../routes/conversations/utils/access-control';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { QueuedMessagePayload } from '@meeshy/shared/types/delivery-queue';
import {
  resolveParticipantLanguage,
  resolveUserLanguagesOrdered,
} from '@meeshy/shared/utils/conversation-helpers';
import { normalizeLanguageForDedup } from '@meeshy/shared/utils/language-normalize';
import { isValidObjectId } from '@meeshy/shared/utils/object-id';
import { enhancedLogger } from '../utils/logger-enhanced.js';
import type { QueuedEventVariant } from './queuedEventContract';
import { isServerAtRestMode } from '../services/messaging/serverAtRest';
import { carriesMessageText } from './queuedEventContract';
import {
  MESSAGE_LIVENESS_SELECT,
  messageLivenessOf,
} from '../services/messages/message-liveness';

const logger = enhancedLogger.child({ module: 'offlineParticipantQueue' });

/**
 * The collaborators the enqueue needs, kept structural so the socket handlers,
 * the manager, the REST broadcasters and test doubles can all supply them
 * without importing each other.
 */
/**
 * #16687 — ce que la file doit pouvoir demander de `connectedUsers`. Les sites
 * qui la consomment DÉRIVENT ce type au lieu de redéclarer une forme étroite :
 * les deux redéclarations du dépôt (`emitAttachmentUpdated`, `ready-listener`)
 * sont exactement celles où la garde était morte.
 */
export type ReachabilityView = {
  has(key: string): boolean;
  get(key: string): { readonly unreachableConversations?: ReadonlySet<string>; readonly allConversationRoomsUnreachable?: boolean } | undefined;
};

export interface OfflineParticipantQueueDeps {
  deliveryQueue: {
    enqueue(userId: string, entry: QueuedMessagePayload, options?: { readonly sealAtRest?: boolean }): Promise<void>;
  } | null | undefined;
  // `'message'` a rejoint cette projection avec la garde d'admission (#16706,
  // cycle 143 bis). L'élargir est DÉLIBÉRÉ et c'est le compilateur qui en fait
  // la preuve : la leçon que `message-liveness.ts` écrit sur sa propre loi — « le
  // `select` est la seule des conditions qu'aucun témoin de verdict ne peut
  // voir » — vaut un cran plus haut, sur la PROJECTION du client. Un
  // `Pick<…,'participant'>` laissait la garde indisponible en aval sans qu'un
  // seul témoin rougisse ; ici, tout appelant qui ne peut pas la servir ne
  // compile plus.
  prisma: Pick<PrismaClient, 'participant' | 'message'>;
  /**
   * #16687 — la porte de joignabilité. `has` répond « cette clé a-t-elle une
   * socket ? » ; `get` pose la question JUSTE : « cette socket est-elle
   * joignable pour CETTE conversation ? ».
   *
   * **`get` est REQUIS**, et il l'est par mesure, pas par goût. Il a d'abord
   * été écrit OPTIONNEL « par décision, fail-OPEN » — un double réduit à `has`
   * gardait alors le comportement d'avant le lot. L'audit adversarial a montré
   * que ce n'était pas un double mais un CONSOMMATEUR DE PRODUCTION :
   * `MeeshySocketIOHandler` passait `new Set(manager.getConnectedUsers())`, un
   * `Set<string>` qui a `has` et n'a pas `get`, sur les QUATRE chemins média de
   * `message:attachment-updated`. La porte y était morte en silence.
   *
   * Un contrat optionnel ne se mesure pas : il se contente. Requis, le
   * compilateur NOMME les sites à moitié livrés — c'est la seule forme de cette
   * garde qui ne puisse pas se reperdre. L'arbitrage fail-open appartient à une
   * ENTRÉE de file, jamais à un contrat de dépendance.
   */
  connectedUsers: ReachabilityView;
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
  /**
   * Les clés de file qui ne reçoivent RIEN — un lecteur dont le plancher
   * d'historique est postérieur au message (`translationReaders`, #9709).
   */
  excludedQueueKeys?: ReadonlySet<string>;
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

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const modeOf = (record: Record<string, unknown> | null): string | null =>
  typeof record?.['encryptionMode'] === 'string' ? record['encryptionMode'] : null;

/**
 * #12822 — la déclaration `atRest` du producteur décide (requise au type pour
 * les familles qui portent du texte, `TextBearingQueuedEvent`). Une charge qui
 * déclare elle-même un mode au repos se scelle EN PLUS : défense en profondeur,
 * jamais un substitut — l'enveloppe d'un lien, par exemple, n'en porte aucun.
 */
const declaresAtRest = (payload: Record<string, unknown>): boolean =>
  isServerAtRestMode(modeOf(payload)) || isServerAtRestMode(modeOf(asRecord(payload['message'])));

const SEAL_AT_REST = { sealAtRest: true } as const;

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
/**
 * La garde d'ADMISSION : ce message a-t-il encore un contenu à garder ? (#16706,
 * cycle 143 bis)
 *
 * ## Pourquoi au seuil, et pas seulement au balayage
 *
 * Le lot #16706 a posé une purge PONCTUELLE, au moment de la destruction. Elle
 * est juste, et elle ne suffit pas : **trois des cinq producteurs d'entrées
 * porteuses de texte sont ASYNCHRONES** et n'interrogeaient la vivacité
 * d'aucune façon —
 * `deliverTextTranslation` (réponse NLLB, de 100 ms à plusieurs secondes) et
 * `emitAttachmentUpdated` (Whisper + NLLB + TTS, des dizaines de secondes à des
 * minutes). Leur `select` ne portait ni `deletedAt`, ni `expiresAt`, ni
 * `viewOnceBurnedAt`.
 *
 * Une traduction encore en vol quand la purge passe REDÉPOSE donc le clair après
 * elle, et **plus aucune purge ne tournera jamais** pour ce message. Le clair
 * repart pour 48 h dans Redis, persistance AOF comprise — c'est-à-dire
 * exactement l'invariant que #16706 revendiquait d'avoir fermé.
 *
 * > **Une purge est un BALAYAGE ; une garde d'admission est un INVARIANT.** Un
 * > balayage ne vaut que pour ce qui est déjà là, et il n'a aucune prise sur ce
 * > qui arrive après lui. Le dépôt l'écrit déjà deux fois — « une garde
 * > d'admission se pose sur CHAQUE chemin » et « une compensation en aval ne
 * > remplace pas une garde d'admission quand l'effet qu'elle compense est
 * > IRRÉVERSIBLE ». Écrire un clair dans Redis est irréversible : on ne le
 * > reprend pas, on en ajoute seulement le retrait.
 *
 * Et c'est le site JUSTE parce que c'est le seul que les cinq producteurs
 * traversent. Posée chez eux, la règle serait à retaper à chaque nouveau
 * producteur — « une règle qui doit être retapée à chaque site est une règle
 * qu'un site finira par ne pas avoir ».
 *
 * ## Son cadrage, et ses deux replis
 *
 * Elle ne s'applique qu'aux familles que `carriesMessageText` déclare : le MÊME
 * cadrage que la garde de remise et que l'index de purge. Une annonce de mort
 * (`deleted` / `expired`) doit passer — c'est son objet.
 *
 * Fail-CLOSED sur la PREUVE (`gone` ⇒ rien n'est enfilé), fail-OPEN sur
 * l'absence de preuve (ligne absente, lecture en échec ⇒ on enfile). C'est
 * l'arbitrage du drain, pour la raison qu'il écrit : « un message manqué se
 * rattrape, un secret remis non » vaut dans les deux sens, et c'est le second
 * qui décide quand la preuve est là.
 */
async function messageStillHasTextToKeep(
  prisma: Pick<PrismaClient, 'message'>,
  messageId: string,
  eventType: QueuedMessagePayload['eventType'],
): Promise<boolean> {
  if (!carriesMessageText(eventType)) return true;
  if (!isValidObjectId(messageId)) return true;
  try {
    const row = await prisma.message.findUnique({
      where: { id: messageId },
      select: MESSAGE_LIVENESS_SELECT,
    });
    const verdict = messageLivenessOf(row);
    if (verdict.liveness !== 'gone') return true;
    logger.info('Offline entry NOT queued: the message no longer has content to keep', {
      messageId, eventType: eventType ?? 'new', cause: verdict.cause,
    });
    return false;
  } catch (error) {
    // Pas de preuve ⇒ on enfile. Une tempête de reconnexions est exactement le
    // moment où la base est sous pression, et refuser ici perdrait un message
    // vivant sans recours.
    logger.warn('Message liveness read failed on enqueue — queueing anyway', { messageId, error });
    return true;
  }
}

export async function enqueueForOfflineParticipants(
  deps: OfflineParticipantQueueDeps,
  params: OfflineParticipantQueueParams
): Promise<void> {
  const { deliveryQueue, prisma, connectedUsers } = deps;
  if (!deliveryQueue) return;

  const { conversationId, actorParticipantId, actorUserId, eventType, messageId, payload, dedupKey, resolvePayloadForReader } = params;
  // Normalisée une fois, du MÊME côté que le prisme, et par la MÊME SSOT :
  // `resolveUserLanguagesOrdered` et `resolveParticipantLanguage` rendent des
  // codes région-strippés et minusculés — pour TOUT code depuis #9247, pas
  // seulement pour ceux que le catalogue sait réduire. Comparer une langue cible
  // brute à un prisme normalisé raterait le lecteur qu'on cherche précisément à
  // servir.
  //
  // Le repli écrit ici à la main (`normalizeLanguageCode ?? toLowerCase`) était la
  // porte jumelle du même défaut : aucune panne, le seul appelant de production
  // passant une cible que le pipeline a déjà canonicalisée — mais le premier à
  // passer un code verbatim hors catalogue aurait comparé un 'yue-hk' qui ne
  // matche plus personne.
  const restrictToLanguage = params.restrictToReadersOfLanguage
    ? normalizeLanguageForDedup(params.restrictToReadersOfLanguage)
    : null;
  // La garde d'ADMISSION, UNE fois pour tout l'éventail : la vivacité est une
  // propriété du MESSAGE, pas du destinataire, donc la demander par participant
  // serait N lectures pour un seul verdict.
  //
  // Elle part EN PARALLÈLE de la liste des participants, et ce n'est pas une
  // micro-optimisation : les deux lectures sont indépendantes, et les sérialiser
  // ajoutait un TOUR DE BOUCLE DE MICRO-TÂCHES avant la première écriture. Or les
  // deux appelants de `MessageHandler` lancent cette unité SANS l'attendre
  // (`_enqueueOfflineEventForParticipants`, lignes 975 et 1169) : ce que leurs
  // témoins observent dépend donc du nombre de tours écoulés pendant leur propre
  // `await`, et un tour de plus suffisait à faire passer l'enfilage APRÈS
  // l'assertion — sur TOUTES les familles, y compris celles que la garde ne
  // regarde même pas.
  //
  // > **Un `await` ajouté en amont d'un canal « fire-and-forget » en change la
  // > sémantique observable.** Le défaut ne se lit pas dans la garde, qui est
  // > juste, mais dans la PROFONDEUR D'ATTENTE qu'elle introduit chez des
  // > appelants qui n'attendent pas. Avant d'ajouter une lecture à une unité,
  // > demander : qui l'appelle sans l'attendre ?
  const livenessProbe = messageStillHasTextToKeep(prisma, messageId, eventType);

  try {
    // La restriction par langue exige les préférences du lecteur, que la
    // projection nominale ne porte pas — et qu'aucun appelant restreint ne
    // fournit via `params.participants`. On requête donc nous-mêmes dans ce cas,
    // en élargissant le `select` pour ce seul chemin : le chemin chaud
    // (`broadcastNewMessage`, jamais restreint) garde sa liste pré-chargée et
    // sa projection à deux colonnes.
    const participants: OfflineQueueParticipant[] = restrictToLanguage
      ? await prisma.participant.findMany({
          where: { conversationId, ...PARTICIPATION_VIVANTE },
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
          where: { conversationId, ...PARTICIPATION_VIVANTE },
          select: { id: true, userId: true },
        }));
    // Le verdict est consommé ICI, après que la liste soit là : les deux attentes
    // se recouvrent, donc la profondeur d'attente est celle d'AVANT ce lot.
    if (!(await livenessProbe)) return;

    const queued: Promise<void>[] = [];
    for (const p of participants) {
      // Queue key mirrors the presence-key convention: userId for registered
      // users, participant id for anonymous. `connectedUsers` and `ROOMS.user`
      // are keyed the same way on the drain side.
      const queueKey = p.userId ?? p.id;
      const isActor =
        (actorParticipantId != null && p.id === actorParticipantId) ||
        (actorUserId != null && p.userId === actorUserId);
      // #16687 — « connecté » ne vaut pas « joignable POUR CETTE
      // conversation ». Une socket dont la room de cette conversation n'a pas
      // pu être rejointe après réessais est inscrite dans `connectedUsers`
      // (l'échec n'est que journalisé) : la tenir pour joignable DÉSARMAIT la
      // file, alors que le `io.to(ROOMS.conversation(...))` ne l'atteint pas
      // davantage — message perdu, et sans rejeu puisque rien n'a été écrit.
      // Le drapeau dit « injoignable pour TOUTES, liste inconnue » — ce qu'un
      // ensemble de rooms ne peut pas exprimer. Il est posé quand la lecture
      // des conversations du compte est tombée au handshake : la socket n'a
      // alors rejoint aucune room, et la tenir pour joignable DÉSARMAIT la file
      // pour toute sa vie.
      // `has` D'ABORD, et `get` seulement ensuite : l'ordre fait partie du
      // contrat. Un appelant peut passer une carte dont `get` n'est pas
      // appelable pour une clé absente, et le court-circuit est ce qui le
      // garantit — hisser le `get` au-dessus du `has` a cassé le scellement au
      // repos de toute la file le temps d'une révision.
      const reachableHere =
        connectedUsers.has(queueKey) &&
        connectedUsers.get(queueKey)?.allConversationRoomsUnreachable !== true &&
        !connectedUsers.get(queueKey)?.unreachableConversations?.has(conversationId);
      if (isActor || reachableHere || params.excludedQueueKeys?.has(queueKey)) continue;
      if (restrictToLanguage !== null) {
        // Échec OUVERT sur prisme vide : un participant dont aucune langue n'est
        // résoluble reçoit l'entrée, exactement comme avant ce filtre. Le pire
        // cas reste une entrée inutile en file, jamais une traduction perdue.
        const readable = readableLanguagesFor(p);
        if (readable.length > 0 && !readable.includes(restrictToLanguage)) continue;
      }
      const body = resolvePayloadForReader ? resolvePayloadForReader(queueKey) : payload;
      const entry: QueuedMessagePayload = {
        messageId,
        conversationId,
        payload: body,
        enqueuedAt: new Date().toISOString(),
        eventType,
        ...(dedupKey ? { dedupKey } : {}),
      };
      // #16706 (cycle 143 bis) — l'enfilage est ATTENDU. Il ne l'était pas, et
      // ce n'était pas un détail : `await enqueueForOfflineParticipants(...)`
      // rendait la main AVANT que la moindre entrée soit écrite, si bien que
      // toute purge déclenchée juste après une destruction immédiate (rappel,
      // éphémère très court) balayait une file où le clair n'était pas encore
      // arrivé — et il y arrivait ensuite, pour 48 h, sans qu'aucune purge ne
      // repasse. « Best-effort » qualifie le droit d'ÉCHOUER, jamais celui de
      // n'être pas ORDONNÉ.
      //
      // `allSettled` et non `all` : un destinataire dont l'enfilage échoue ne
      // doit pas priver les autres du leur, et c'est ce que le `.catch` par
      // entrée disait déjà.
      queued.push(
        (params.atRest === true || declaresAtRest(body)
          ? deliveryQueue.enqueue(queueKey, entry, SEAL_AT_REST)
          : deliveryQueue.enqueue(queueKey, entry)
        ).catch((err) => logger.warn('Failed to enqueue offline event', { userId: queueKey, eventType, error: err })),
      );
    }
    await Promise.allSettled(queued);
  } catch (err) {
    logger.warn('Failed to fetch participants for offline enqueue', { conversationId, eventType, error: err });
  }
}
