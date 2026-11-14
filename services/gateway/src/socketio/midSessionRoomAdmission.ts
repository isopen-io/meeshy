import type { Socket } from 'socket.io';
import { ROOMS } from '@meeshy/shared/types/socketio-events';

import { enhancedLogger } from '../utils/logger-enhanced.js';
import { joinConversationRoomsWithRetry } from './handlers/join-user-conversations.js';
import type { SocketUser } from './utils/socket-helpers.js';

const logger = enhancedLogger.child({ module: 'MidSessionRoomAdmission' });

/**
 * La porte de MI-SESSION : un compte ajouté à une conversation PENDANT qu'il est
 * connecté rejoint `conversation:<id>` sans attendre de reconnexion (#18381).
 *
 * Sa JUMELLE est la porte d'AUTHENTIFICATION (`joinUserConversations`), et
 * celle-là fait deux choses que celle-ci n'avait pas :
 *
 * 1. elle **réessaie** (`joinConversationRoomsWithRetry`, 3 tentatives) ;
 * 2. sur échec définitif, elle **marque** la socket
 *    (`SocketUser.unreachableConversations`).
 *
 * Le marqueur n'est pas décoratif : c'est la SEULE chose qui réarme la file
 * hors ligne (`offlineParticipantQueue`, `reachableHere`). Sans lui, un compte
 * dont la jonction a échoué est `connectedUsers.has(key) === true` sans
 * marqueur — `enqueueForOfflineParticipants` le SAUTE parce qu'il se croit
 * joignable, pendant que `io.to(ROOMS.conversation(id))` le manque aussi.
 * Chaque message, édition, suppression, réaction et épingle de cette
 * conversation ne va alors **nulle part**, et rien n'est rejoué à la
 * reconnexion puisque rien n'a été écrit.
 *
 * ## La jonction est ADAPTATEUR-CONSCIENTE, et ce n'est pas un raffinement
 *
 * `io.sockets.sockets` et `userSockets` ne voient que le nœud COURANT. Sous
 * l'adaptateur Redis, un membre connecté au nœud B et ajouté par une requête
 * servie par le nœud A n'était JAMAIS joint à la room — et le nœud B, qui le
 * tient dans son `connectedUsers`, le saute ensuite dans la file. Le message
 * est alors perdu des DEUX côtés. `io.in(ROOMS.user(key)).socketsJoin(room)`
 * traverse l'adaptateur ; les jonctions locales qui suivent sont idempotentes.
 *
 * ## Ce que le verdict PEUT dire, et ce qu'il ne peut pas
 *
 * Le marqueur vit dans `connectedUsers`, qui est NODE-LOCAL et par UTILISATEUR
 * (pas par socket). Le verdict se prononce donc sur ce que ce nœud peut
 * PROUVER :
 *
 * | ce que le nœud voit | verdict |
 * |---|---|
 * | au moins une socket locale a rejoint | joignable — le marqueur de cette conversation est RETIRÉ |
 * | des sockets locales, toutes en échec définitif | injoignable — marqueur POSÉ |
 * | aucune socket locale, et le compte est dans `connectedUsers` | marqué seulement si la jonction par adaptateur a LEVÉ (aucune preuve que la room ait été rejointe où que ce soit) |
 * | aucune socket locale, compte absent de `connectedUsers` | rien à marquer : la file l'enfile déjà comme hors ligne |
 *
 * `allConversationRoomsUnreachable` n'est jamais RETIRÉ ici : il dit « toutes,
 * dont j'ignore la liste », et une jonction réussie ne prouve que SA
 * conversation. Le lever sur cette preuve déclarerait joignables toutes les
 * autres. Le coût est un doublon possible à la remise, jamais une perte.
 */
export type MidSessionAdmissionDeps = {
  readonly io: { in(room: string): { socketsJoin(rooms: string): unknown } };
  readonly userSockets: ReadonlyMap<string, ReadonlySet<string>>;
  readonly socketById: (socketId: string) => Socket | undefined;
  readonly connectedUsers: Map<string, SocketUser>;
};

function markUnreachable(connectedUsers: Map<string, SocketUser>, key: string, conversationId: string): void {
  const entry = connectedUsers.get(key);
  if (!entry) return;
  const next = new Set(entry.unreachableConversations ?? []);
  next.add(conversationId);
  entry.unreachableConversations = next;
}

function clearUnreachable(connectedUsers: Map<string, SocketUser>, key: string, conversationId: string): void {
  const entry = connectedUsers.get(key);
  const current = entry?.unreachableConversations;
  if (!entry || !current?.has(conversationId)) return;
  const next = new Set(current);
  next.delete(conversationId);
  entry.unreachableConversations = next.size > 0 ? next : undefined;
}

export async function admitUserToConversationRoom(
  deps: MidSessionAdmissionDeps,
  roomKey: string,
  conversationId: string,
): Promise<void> {
  const room = ROOMS.conversation(conversationId);

  let clusterJoinProven = true;
  try {
    deps.io.in(ROOMS.user(roomKey)).socketsJoin(room);
  } catch (error) {
    clusterJoinProven = false;
    logger.error('cluster-wide room join failed — remote sockets of this account may be absent from the room', {
      userId: roomKey,
      conversationId,
      error,
    });
  }

  const localSockets = Array.from(deps.userSockets.get(roomKey) ?? [])
    .map(socketId => deps.socketById(socketId))
    .filter((socket): socket is Socket => socket !== undefined);

  if (localSockets.length === 0) {
    if (clusterJoinProven || !deps.connectedUsers.has(roomKey)) return;
    markUnreachable(deps.connectedUsers, roomKey, conversationId);
    return;
  }

  const failures = await Promise.all(
    localSockets.map(socket => joinConversationRoomsWithRetry(socket, [conversationId])),
  );
  const joinedSomewhere = failures.some(failed => failed.length === 0);
  if (joinedSomewhere) {
    clearUnreachable(deps.connectedUsers, roomKey, conversationId);
    return;
  }

  logger.error('mid-session conversation room join failed after retries — account marked unreachable for this conversation', {
    userId: roomKey,
    conversationId,
    sockets: localSockets.length,
  });
  markUnreachable(deps.connectedUsers, roomKey, conversationId);
}
