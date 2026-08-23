/**
 * Le cliquet des portes d'ACQUITTEMENT.
 *
 * Le jumeau ENTRANT de `server-emit-door-sweep.test.ts`. Sa raison d'être, son
 * histoire et le coût mesuré de la forme fautive sont documentés dans
 * `ack-door-sweep.ts` — ici ne vivent que l'inventaire et ce qu'il gèle.
 *
 * **Deux cliquets, et aucun ne subsume l'autre** :
 *
 * - le COMPILATEUR garde ce que la porte refuse. Depuis que les neuf rappels
 *   des trois familles de réactions sont typés `AckOf<…>`, tout
 *   `callback({ success: true, data: … })` dont la charge n'est pas celle du
 *   contrat est une erreur `TS2353`/`TS2345`. C'est lui, et non la lecture du
 *   code, qui a nommé les deux derniers sites du cycle 109 ;
 * - celui-ci garde qu'il n'y ait pas de DIXIÈME porte. Une porte relâchée et
 *   une porte contournée sont deux régressions distinctes, et la seconde est la
 *   plus probable : rien n'oblige un nouveau handler à lire `AckOf<…>`, et les
 *   onze rédactions manuelles qui subsistent prouvent qu'on l'écrit
 *   spontanément à la main.
 *
 * **Pourquoi un inventaire GELÉ plutôt que VIDE**, et c'est une mesure, pas une
 * commodité : les onze sites restants ont été ouverts un par un et **aucun ne
 * ment**. `MessageHandler` déclare `SocketIOResponse<{ messageId: string }>` là
 * où le contrat déclare `MessageSendResponseData`, qui EST `{ messageId:
 * string }` ; les autres déclarent l'enveloppe nue, que le contrat déclare nue
 * aussi. Ce sont des jumeaux structurels — la famille de
 * `ReactionUpdateEvent` / `ReactionUpdateEventData` — donc un risque de DÉRIVE,
 * pas une divergence.
 *
 * La distinction commande la manœuvre : les portes qui MENTAIENT sont fermées
 * dans le lot qui les a trouvées ; celles qui redisent seulement la même chose
 * deux fois se ferment sans urgence, et surtout **pas dans le même lot** — quatre
 * d'entre elles sont sur le chemin d'envoi de message, le plus fréquenté du
 * produit, et un lot de consistance n'a rien à y faire tant qu'il n'a pas ses
 * propres témoins.
 *
 * **Quand ce témoin tombe :**
 *
 * - une entrée EN TROP = une porte NEUVE vient d'entrer. La réparation est de
 *   la remplacer par `AckOf<'…'>`, jamais de l'ajouter à l'inventaire — il n'y
 *   a pas de rédaction manuelle légitime à porter, la forme juste étant
 *   toujours la même lecture du contrat ;
 * - une entrée EN MOINS = une porte a été dérivée. Retirer sa ligne fait partie
 *   du correctif.
 *
 * L'inventaire est clé par FICHIER + DÉCLARATION, jamais par numéro de ligne :
 * une clé de ligne dérive à la première édition et transforme le cliquet en
 * bruit (règle du cycle 87 bis).
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { join } from 'path';

import { sweepHandWrittenAckDoors } from './ack-door-sweep';

const SRC_DIR = join(__dirname, '..', '..');

/**
 * Les onze rédactions manuelles qui subsistent, mesurées non-divergentes
 * (cf. l'en-tête). À DRAINER, pas à faire grossir.
 */
const FROZEN_ACK_DOORS: readonly string[] = [
  'socketio/MeeshySocketIOManager.ts :: socket.on(CLIENT_EVENTS.FEED_SUBSCRIBE, async (callback?: (response: SocketIOResponse) => void) => {',
  'socketio/MeeshySocketIOManager.ts :: socket.on(CLIENT_EVENTS.FEED_UNSUBSCRIBE, async (callback?: (response: SocketIOResponse) => void) => {',
  'socketio/MeeshySocketIOManager.ts :: socket.on(CLIENT_EVENTS.ADMIN_AGENT_SUBSCRIBE, (callback?: (response: SocketIOResponse) => void) => {',
  'socketio/MeeshySocketIOManager.ts :: socket.on(CLIENT_EVENTS.ADMIN_AGENT_UNSUBSCRIBE, (callback?: (response: SocketIOResponse) => void) => {',
  'socketio/handlers/AdminAgentHandler.ts :: async handleSubscribe(socket: Socket, callback?: (response: SocketIOResponse) => void): Promise<void> {',
  'socketio/handlers/AdminAgentHandler.ts :: handleUnsubscribe(socket: Socket, callback?: (response: SocketIOResponse) => void): void {',
  'socketio/handlers/LocationHandler.ts :: callback?: (response: SocketIOResponse<LocationLiveStartedEventData>) => void',
  'socketio/handlers/MessageHandler.ts :: callback?: (response: SocketIOResponse<{ messageId: string }>) => void',
  'socketio/handlers/MessageHandler.ts :: callback?: (response: SocketIOResponse<{ messageId: string }>) => void',
  'socketio/handlers/MessageHandler.ts :: callback?: (response: SocketIOResponse) => void',
  'socketio/handlers/MessageHandler.ts :: callback?: (response: SocketIOResponse) => void',
];

describe('portes d’acquittement Socket.IO — lues sur le contrat, jamais redéclarées', () => {
  it('aucune porte manuscrite au-delà de l’inventaire gelé', () => {
    const found = sweepHandWrittenAckDoors(SRC_DIR)
      .map((door) => `${door.file} :: ${door.declaration}`)
      .sort();

    expect(found).toEqual([...FROZEN_ACK_DOORS].sort());
  });

  /**
   * La garde qui compte, et elle est écrite en NÉGATIF : les trois familles de
   * réactions sont sorties de cet inventaire au cycle 109, et n'y rentrent pas.
   *
   * C'est l'assertion qui tombe si quelqu'un rétablit un
   * `callback?: (response: SocketIOResponse<unknown>) => void` sur l'un des neuf
   * rappels — la mutation exacte qui a laissé les quatre incidents de décodage
   * arriver. L'inventaire global, lui, tomberait aussi, mais en NOMMANT une
   * ligne parmi douze ; celui-ci nomme la famille.
   */
  it('aucune porte manuscrite dans les trois familles de réactions', () => {
    const reactionDoors = sweepHandWrittenAckDoors(SRC_DIR).filter((door) =>
      /Reaction(Handler)?\.ts$/.test(door.file)
    );

    expect(reactionDoors).toEqual([]);
  });
});
