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

import { safeBroadcast } from './serverEmit';

import type { ServerEventPayload } from './serverEmit';
import type { ReaderSignedPlan, ReaderSignedPlanOutcome } from './readerSignedDelivery';

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
  /**
   * Un plan ⇒ remise par lecteur, adresses signées par `signFor` ; `null` ⇒
   * diffusion de room ; `'unavailable'` ⇒ la lecture du plan est tombée, donc
   * RIEN en direct (#17026 — `ReaderSignedPlanOutcome` dit pourquoi les deux
   * derniers ne se confondent pas : retomber sur la room servirait l'adresse
   * nue d'une pièce peut-être protégée).
   */
  readonly readerSigned?: ReaderSignedPlanOutcome;
  /**
   * La panne d'UNE audience, NOMMÉE chez l'appelant (#17086). Elle ne remonte
   * plus par un `throw` : chaque audience est enrobée pour SA part, donc une
   * exception qui sortirait d'ici n'aurait plus l'identité de ce qui a été
   * perdu. `undefined` ⇒ `safeBroadcast` journalise lui-même.
   *
   * Le SECOND paramètre est l'étiquette de l'audience — « NOMMÉE » ne veut rien
   * dire sans elle, et le premier état de ce lot la jetait : quatre audiences
   * perdues rendaient quatre journaux identiques, et le chemin par lecteur
   * perdait l'identité de cible qu'il publiait avant. Constat C1/C2 de l'audit.
   */
  readonly onEmissionError?: (error: unknown, label: string) => void;
};

export function emitMessageNew<P extends MessageNewPayload>(input: MessageNewEmission<P>): void {
  if (input.readerSigned === 'unavailable') return;
  if (input.readerSigned) {
    emitPerReader(input, input.readerSigned);
    return;
  }

  const { io, room, senderPayload, peerPayload, senderUserId, senderSocket } = input;
  const onError = input.onEmissionError;
  const hiddenKeys = [...input.hiddenKeys];
  const hiddenRooms = hiddenKeys.map((key) => ROOMS.user(key));
  const byLanguage = hiddenRooms.length === 0 ? input.emitByLanguage ?? null : null;

  // L'enrobage est PAR AUDIENCE, pour la raison du régime par lecteur, sur le
  // chemin qui est cette fois le NOMINAL (#17086) : ces émissions ne dépendent
  // PAS l'une de l'autre, et un enrobage unique les perd ensemble. Ce qu'on
  // perdait, mesuré : la bulle de l'expéditeur — sa charge est la SEULE à
  // porter `clientMessageId`, donc la seule voie de promotion d'une ligne
  // optimiste — et les lecteurs MASQUÉS, qui n'ont QUE leur room personnelle
  // (la diffusion de room les exclut par construction) et que la file hors
  // ligne ne rattrape pas puisqu'elle saute les CONNECTÉS.
  if (senderUserId) {
    safeBroadcast(byLanguage ? 'message:new (room par langue)' : `message:new (room ${room})`, () => {
      if (byLanguage) byLanguage(peerPayload, { excludeUserId: senderUserId });
      else io.to(room).except([ROOMS.user(senderUserId), ...hiddenRooms]).emit(SERVER_EVENTS.MESSAGE_NEW, peerPayload);
    }, onError);
    safeBroadcast(`message:new (expéditeur ${ROOMS.user(senderUserId)})`, () => {
      io.to(ROOMS.user(senderUserId)).emit(SERVER_EVENTS.MESSAGE_NEW, senderPayload);
    }, onError);
  } else if (senderSocket) {
    safeBroadcast(byLanguage ? 'message:new (room par langue)' : `message:new (room ${room})`, () => {
      if (byLanguage) byLanguage(peerPayload, { excludeSocketId: senderSocket.id });
      else exceptHidden(senderSocket.broadcast.to(room), hiddenRooms).emit(SERVER_EVENTS.MESSAGE_NEW, peerPayload);
    }, onError);
    safeBroadcast(`message:new (expéditeur socket ${senderSocket.id})`, () => {
      senderSocket.emit(SERVER_EVENTS.MESSAGE_NEW, senderPayload);
    }, onError);
  } else if (byLanguage) {
    safeBroadcast('message:new (room par langue)', () => byLanguage(peerPayload, {}), onError);
  } else {
    safeBroadcast(`message:new (room ${room})`, () => {
      exceptHidden(io.to(room), hiddenRooms).emit(SERVER_EVENTS.MESSAGE_NEW, peerPayload);
    }, onError);
  }

  for (const key of hiddenKeys) {
    const hiddenRoom = ROOMS.user(key);
    // `payloadForKey` est DANS la fermeture : la variante d'un masqué se
    // CALCULE, et un calcul qui lève pour un lecteur privait tous les suivants.
    // C'est le constat que le second passage de l'audit a exigé sur le chemin
    // par lecteur ; il valait mot pour mot ici.
    safeBroadcast(`message:new (masqué ${hiddenRoom})`, () => {
      io.to(hiddenRoom).emit(SERVER_EVENTS.MESSAGE_NEW, input.payloadForKey(key));
    }, onError);
  }
}

const exceptHidden = (operator: MessageNewOperator, hiddenRooms: readonly string[]): MessageNewOperator =>
  hiddenRooms.length > 0 ? operator.except([...hiddenRooms]) : operator;

function emitPerReader<P extends MessageNewPayload>(input: MessageNewEmission<P>, readerSigned: ReaderSignedPlan): void {
  const hidden = new Set(input.hiddenKeys);
  const senderRoom = input.senderUserId ? ROOMS.user(input.senderUserId) : null;
  for (const target of readerSigned.targets) {
    const isSender = target.participantId === input.senderParticipantId || target.room === senderRoom;
    // L'enrobage est PAR CIBLE, et c'est la GRANULARITÉ qui compte ici (audit
    // adversarial de #17026). Un enrobage autour de la boucle entière garde
    // bien ce qui la suit, mais une cible qui lève prive TOUTES les suivantes :
    // la file hors ligne ne les compense pas, puisqu'elle saute les comptes
    // CONNECTÉS. Et la charge DIFFÈRE par lecteur (`signFor`, `payloadForKey`),
    // donc un encodeur en défaut échoue par cible, pas globalement.
    //
    // `payloadForKey` est DANS la fermeture, et c'est le second passage de
    // l'audit qui l'a exigé : il vivait une ligne AU-DESSUS de la garde que ce
    // commentaire justifie par lui. Mesuré sur trois cibles dont une masquée
    // et un `payloadForKey` qui lève pour elle : une seule cible servie, les
    // suivantes perdues, et l'exception hors de la boucle. Le lecteur concerné
    // est celui d'un transfert refusé ou d'une citation d'éphémère scellée
    // (#8562) — la population la plus protégée du chemin. Un commentaire qui
    // ÉNONCE une contrainte est une AFFIRMATION, et celui-ci disait faux de la
    // ligne juste au-dessus de lui.
    //
    // Le `label` nomme la ROOM : sur une panne par cible, l'identité de la
    // cible est la seule information utile, et c'était le seul endroit du lot
    // où elle n'était pas journalisée.
    safeBroadcast(
      `message:new (per reader ${target.room})`,
      () => {
        const base = isSender
          ? input.senderPayload
          : hidden.has(target.key)
            ? input.payloadForKey(target.key)
            : input.peerPayload;
        input.io.to(target.room).emit(SERVER_EVENTS.MESSAGE_NEW, readerSigned.signFor(base, target.participantId));
      },
      input.onEmissionError,
    );
  }
}

/**
 * `emitMessageNew` dont l'échec ne peut pas emporter ce qui SUIT chez
 * l'appelant (#17026) — une projection de `safeBroadcast`, le site UNIQUE de
 * cet enrobage.
 *
 * `io.to(room).emit(...)` LÈVE quand l'adaptateur ou l'encodeur est en défaut —
 * c'est une affirmation du dépôt, écrite là où il s'en garde
 * (`socketio/utils/emitWithSeq.ts`), pas une hypothèse. Les deux producteurs
 * d'envoi plaçaient cet appel dans le même `try` que l'enfilage hors ligne qui
 * le suit, sous un `catch` de fin de méthode : une diffusion tombée annulait le
 * rejeu durable pour TOUS les absents, et le message — déjà persisté, déjà
 * acquitté « envoyé » — n'atteignait plus personne.
 *
 * La garde vit ICI plutôt que recopiée chez les deux appelants, pour la raison
 * de la leçon 307 : une règle ne se propage pas depuis son énoncé, elle vaut là
 * où quelqu'un l'a récitée. Les deux producteurs portaient déjà, chacun, le
 * commentaire qui explique que la PLACE de l'enfilage fait partie de la
 * garantie — et ni l'un ni l'autre n'en tirait la conséquence sur l'émission
 * qui le précède.
 *
 * L'ordre reste celui du cycle 116 — charger la liste, enfiler (durable),
 * diffuser la cosmétique : ce helper ne déplace rien, il empêche la première
 * étape de supprimer la seconde.
 */
export function emitMessageNewBestEffort<P extends MessageNewPayload>(
  input: MessageNewEmission<P>,
  onError: (error: unknown, label: string) => void,
): void {
  safeBroadcast('message:new', () => emitMessageNew({ ...input, onEmissionError: input.onEmissionError ?? onError }), onError);
}
