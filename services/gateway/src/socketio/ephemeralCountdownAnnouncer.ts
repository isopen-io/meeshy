import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { MessageCountdownStartedEventData } from '@meeshy/shared/types/socketio-events';
import { enhancedLogger } from '../utils/logger-enhanced';
import type { ServerEmitIO } from './serverEmit';
import type { StartedEphemeralCountdown } from '../services/messaging/ephemeralCountdown';

const logger = enhancedLogger.child({ module: 'ephemeralCountdownAnnouncer' });

/**
 * Le relais qui porte `message:countdown-started` aux DEUX rooms personnelles
 * concernées (#7451).
 *
 * ─── POURQUOI UN REGISTRE, ET PAS UN PARAMÈTRE ──────────────────────────────
 *
 * Le décompte démarre au fond de `freezeMessageStatus`, où convergent les CINQ
 * chemins de réception. Deux d'entre eux tiennent `io` (`MessageHandler`,
 * `MeeshySocketIOManager`), les trois autres non (`GET .../messages`,
 * `POST .../receipts`, NSE) — et `MessageReadStatusService` est instancié à la
 * volée (`new MessageReadStatusService(prisma)`) par ceux-là. Faire descendre
 * un émetteur jusqu'au gel aurait demandé de traverser deux fichiers déjà au
 * double du budget de 1 200 lignes, pour finir avec trois appelants sur cinq
 * qui passent `undefined`.
 *
 * Même patron, même raison et même repli que
 * `notifications/notification-service-registry.ts` : le processus n'a qu'un
 * `io`, on le nomme une fois. Le résolveur est PARESSEUX — le manager Socket.IO
 * n'existe pas quand `server.ts` le pose, et une capture retiendrait `null`
 * pour toujours.
 *
 * ─── L'ÉMISSION EST BEST-EFFORT, ET C'EST UNE DÉCISION ──────────────────────
 *
 * Sans `io` (tests, scripts, démarrage), le décompte est POSÉ en base et
 * simplement pas annoncé : les autres appareils du destinataire l'apprendront à
 * leur prochain `GET .../messages`, qui sert `expiresAt` par lecteur. C'est la
 * bonne façon d'échouer — l'échéance est durable, l'annonce ne l'est pas.
 */

/**
 * `ServerEmitIO`, jamais une porte réécrite : le couple `(événement, charge)`
 * vient du contrat partagé (`serverEmit.ts`), sans quoi ce relais serait libre
 * de porter sa charge sous un autre nom d'événement — ou n'importe quoi d'autre
 * sous le bon.
 */
export type EphemeralCountdownIO = ServerEmitIO;

let resolveIO: (() => EphemeralCountdownIO | null | undefined) | undefined;

/** Posé une fois au démarrage (`server.ts`), avec un résolveur PARESSEUX. */
export function setEphemeralCountdownIOResolver(
  resolver: (() => EphemeralCountdownIO | null | undefined) | undefined,
): void {
  resolveIO = resolver;
}

/**
 * Deux émissions par décompte, avec des VALEURS différentes — ce n'est pas une
 * diffusion dupliquée :
 *
 *   - le destinataire reçoit `D(u)`, son échéance ;
 *   - l'expéditeur reçoit la plus TARDIVE des échéances connues.
 *
 * Une seule émission en room de conversation aurait servi la même date aux deux,
 * donc une date fausse pour au moins l'un des deux — c'est exactement pourquoi
 * `message:new` ne porte pas d'`expiresAt` pour un éphémère.
 *
 * L'expéditeur qui est aussi le destinataire (message à soi-même) reçoit les
 * deux : les valeurs coïncident alors, et déduire la room serait deviner.
 */
export function announceEphemeralCountdownStarted(
  started: readonly StartedEphemeralCountdown[],
): void {
  const io = resolveIO?.();
  if (!io) return;

  for (const countdown of started) {
    emit(io, countdown.recipientRoomKey, {
      messageId: countdown.messageId,
      conversationId: countdown.conversationId,
      expiresAt: countdown.recipientExpiresAt.toISOString(),
    });
    emit(io, countdown.senderRoomKey, {
      messageId: countdown.messageId,
      conversationId: countdown.conversationId,
      expiresAt: countdown.latestExpiresAt.toISOString(),
    });
  }
}

function emit(
  io: EphemeralCountdownIO,
  roomKey: string,
  data: MessageCountdownStartedEventData,
): void {
  try {
    io.to(ROOMS.user(roomKey)).emit(SERVER_EVENTS.MESSAGE_COUNTDOWN_STARTED, data);
  } catch (err) {
    logger.warn('countdown announce failed', { roomKey, messageId: data.messageId, err });
  }
}
