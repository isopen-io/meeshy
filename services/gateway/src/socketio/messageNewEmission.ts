/**
 * L'émission de `message:new` — extraite des DEUX producteurs
 * (`MessageHandler.broadcastNewMessage`, transport socket ;
 * `MeeshySocketIOManager._broadcastNewMessage`, transport REST/ZMQ), tous deux
 * hors budget de taille, par #9646. Les deux portaient la même cascade
 * d'émissions écrite deux fois ; elle vit ici une fois.
 *
 * Deux régimes :
 *
 * 1. **Diffusion de room** (le cas courant, inchangé) :
 *    - l'expéditeur inscrit reçoit `senderPayload` (qui garde
 *      `clientMessageId`) sur sa room personnelle, la room de conversation le
 *      reste SAUF lui ;
 *    - un expéditeur anonyme muni de son socket : `broadcast` depuis ce socket,
 *      et `senderPayload` à ce socket seul ;
 *    - les lecteurs MASQUÉS (provenance d'un transfert refusée, citation d'un
 *      éphémère scellée, #8562) sont exclus de la room et reçoivent leur
 *      variante sur leur room personnelle — un destinataire reçoit exactement
 *      UN `message:new` ;
 *    - le filtre par langue (`SOCKET_LANG_FILTER`) ne joue que sans masqué.
 *
 * 2. **Remise par lecteur** (#9646) — quand une pièce du message se lit par
 *    lecteur (`readerSignedTargets`) : AUCUNE diffusion de room ; chaque
 *    participant actif reçoit, sur sa room personnelle, la charge qui lui
 *    revient (expéditeur ⇒ `senderPayload`, masqué ⇒ sa variante, sinon
 *    `peerPayload`) avec ses adresses de pièces SIGNÉES pour sa ligne
 *    `Participant`. Un socket présent dans la room sans être participant actif
 *    ne reçoit rien : il relira la page.
 */
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

import type { ServerEventPayload } from './serverEmit';
import type { ReaderSignedPlan } from './readerSignedDelivery';

type MessageNewPayload = ServerEventPayload<typeof SERVER_EVENTS.MESSAGE_NEW>;

type MessageNewTarget = {
  emit(...args: [typeof SERVER_EVENTS.MESSAGE_NEW, MessageNewPayload]): unknown;
};
type MessageNewOperator = MessageNewTarget & { except(rooms: string | string[]): MessageNewOperator };

export type MessageNewIO = { to(room: string): MessageNewOperator };
export type MessageNewSenderSocket = MessageNewTarget & {
  readonly id: string;
  readonly broadcast: { to(room: string): MessageNewOperator };
};

export type LanguageExclusion = { readonly excludeUserId?: string; readonly excludeSocketId?: string };

export type MessageNewEmission<P extends MessageNewPayload> = {
  readonly io: MessageNewIO;
  /** `ROOMS.conversation(id)`. */
  readonly room: string;
  readonly senderPayload: P;
  readonly peerPayload: P;
  readonly senderUserId: string | null;
  /** La ligne `Participant` de l'expéditeur — `Message.senderId`. */
  readonly senderParticipantId: string;
  readonly senderSocket?: MessageNewSenderSocket | null;
  /** Les clés (`userId ?? id`) des lecteurs exclus de la room, servis par leur variante. */
  readonly hiddenKeys: readonly string[] | ReadonlySet<string>;
  readonly payloadForKey: (key: string) => P;
  /** Le filtre par langue, quand il est ACTIVÉ ; ignoré dès qu'un lecteur est masqué. */
  readonly emitByLanguage?: ((payload: P, exclusion: LanguageExclusion) => void) | null;
  /** Non nul ⇒ remise par lecteur, adresses signées par `signFor`. */
  readonly readerSigned?: ReaderSignedPlan | null;
};

export function emitMessageNew<P extends MessageNewPayload>(input: MessageNewEmission<P>): void {
  if (input.readerSigned) {
    emitPerReader(input, input.readerSigned);
    return;
  }

  const { io, room, senderPayload, peerPayload, senderUserId, senderSocket } = input;
  const hiddenKeys = [...input.hiddenKeys];
  const hiddenRooms = hiddenKeys.map((key) => ROOMS.user(key));
  const byLanguage = hiddenRooms.length === 0 ? input.emitByLanguage ?? null : null;

  if (senderUserId) {
    if (byLanguage) byLanguage(peerPayload, { excludeUserId: senderUserId });
    else io.to(room).except([ROOMS.user(senderUserId), ...hiddenRooms]).emit(SERVER_EVENTS.MESSAGE_NEW, peerPayload);
    io.to(ROOMS.user(senderUserId)).emit(SERVER_EVENTS.MESSAGE_NEW, senderPayload);
  } else if (senderSocket) {
    if (byLanguage) byLanguage(peerPayload, { excludeSocketId: senderSocket.id });
    else exceptHidden(senderSocket.broadcast.to(room), hiddenRooms).emit(SERVER_EVENTS.MESSAGE_NEW, peerPayload);
    senderSocket.emit(SERVER_EVENTS.MESSAGE_NEW, senderPayload);
  } else if (byLanguage) {
    byLanguage(peerPayload, {});
  } else {
    exceptHidden(io.to(room), hiddenRooms).emit(SERVER_EVENTS.MESSAGE_NEW, peerPayload);
  }

  for (const key of hiddenKeys) {
    io.to(ROOMS.user(key)).emit(SERVER_EVENTS.MESSAGE_NEW, input.payloadForKey(key));
  }
}

const exceptHidden = (operator: MessageNewOperator, hiddenRooms: readonly string[]): MessageNewOperator =>
  hiddenRooms.length > 0 ? operator.except([...hiddenRooms]) : operator;

function emitPerReader<P extends MessageNewPayload>(input: MessageNewEmission<P>, readerSigned: ReaderSignedPlan): void {
  const hidden = new Set(input.hiddenKeys);
  const senderRoom = input.senderUserId ? ROOMS.user(input.senderUserId) : null;
  for (const target of readerSigned.targets) {
    const isSender = target.participantId === input.senderParticipantId || target.room === senderRoom;
    const base = isSender ? input.senderPayload : hidden.has(target.key) ? input.payloadForKey(target.key) : input.peerPayload;
    input.io.to(target.room).emit(SERVER_EVENTS.MESSAGE_NEW, readerSigned.signFor(base, target.participantId));
  }
}
