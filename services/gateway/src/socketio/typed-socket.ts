/**
 * Cycle 99 — le `Socket` d'un handler, TYPÉ contre le contrat partagé.
 *
 * `MeeshySocketIOManager` déclare son `io` avec les deux maps
 * (`SocketIOServer<ClientToServerEvents, ServerToClientEvents>`), donc tout ce
 * qu'il émet lui-même est vérifié à la compilation. Les handlers, eux,
 * importaient le `Socket` NU de `socket.io` : ses génériques valent alors
 * `DefaultEventsMap`, c'est-à-dire `[event: string]: (...args: any[]) => void`.
 * Sur un socket ainsi typé, `socket.emit(n'importe quoi, n'importe quoi)`
 * compile.
 *
 * C'est ainsi que `conversation:join-error` a pu vivre huit sites d'émission,
 * un consommateur web et un consommateur iOS sans JAMAIS figurer dans
 * `ServerToClientEvents` : rien, côté producteur, n'exigeait qu'il y figure.
 * Les décodeurs des deux clients sont pourtant écrits contre ce contrat — d'où
 * deux transcriptions indépendantes de la même forme non déclarée, et la même
 * erreur commise deux fois.
 *
 * Employer `MeeshySocket` dans un handler rend deux fautes impossibles à la
 * compilation : émettre un nom d'événement absent du contrat, et émettre un
 * payload qui ne correspond pas au type déclaré pour ce nom.
 */

import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@meeshy/shared/types/socketio-events';

/** Socket client vu d'un handler, contraint par le contrat partagé. */
export type MeeshySocket = Socket<ClientToServerEvents, ServerToClientEvents>;

/** Serveur Socket.IO vu d'un handler, contraint par le contrat partagé. */
export type MeeshyIOServer = Server<ClientToServerEvents, ServerToClientEvents>;
