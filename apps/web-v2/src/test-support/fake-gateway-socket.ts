import { CLIENT_EVENTS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import type { SocketClient, SocketHandler } from '@/lib/net/socket';

/**
 * **LA PASSERELLE VUE PAR UN LECTEUR QUI N'EST PAS AMI DE L'AUTEUR** (#7395).
 *
 * Les faux sockets des autres témoins remettent tout événement à tout
 * écouteur (`fire`) : ils prouvent qu'une charge REÇUE est appliquée, jamais
 * qu'elle ARRIVE. Or ce qui décide de l'arrivée est côté serveur : une
 * diffusion part vers des SALLES (`io.to(rooms)`), et un socket n'en reçoit que
 * ce qui vise une salle où il se trouve.
 *
 * Ce double tient cette règle, et rien d'autre :
 *
 * - le lecteur n'est dans AUCUN salon de fil (`feed:<id>`) — c'est ce que
 *   « non ami de l'auteur » veut dire pour `getVisibilityFilteredRecipients` ;
 *   seule la salle d'une publication (`post:<id>`), qu'il rejoint lui-même
 *   par `post:join`, le relie à ce qu'il lit ;
 * - `post:join` n'est accepté que sur une connexion AUTHENTIFIÉE
 *   (`PostReactionHandler.handleJoinPost` refuse « User not authenticated »
 *   avant `_registerUser`) ;
 * - une COUPURE sort le socket de toutes ses salles : la passerelle ne garde
 *   rien d'un socket mort, et la reconnexion en ouvre un NEUF. À la
 *   reconnexion, la passerelle réémet `authenticated`
 *   (`AuthHandler.ts`, à chaque poignée de main).
 *
 * L'ACL de `post:join` (visibilité, redirection d'un repost vers sa racine)
 * n'est PAS rejouée : elle est témoignée côté passerelle
 * (`PostReactionHandler.test.ts`). Ce double ne dit que ce que le CLIENT doit
 * faire pour être dans la salle.
 */
export type FakeGatewaySocket = SocketClient & {
  /** La passerelle diffuse vers une salle : seul un socket qui s'y trouve reçoit. */
  broadcast(room: string, event: string, payload: unknown): void;
  /** Coupure du transport : le socket sort de TOUTES ses salles. */
  drop(): void;
  /** Les salles où ce socket se trouve, côté passerelle. */
  rooms(): ReadonlySet<string>;
  /** Chaque `post:join` / `post:leave` émis par le client, dans l'ordre. */
  roomEmits(): readonly (readonly [event: string, postId: string])[];
};

const postIdOf = (payload: unknown): string | undefined => {
  if (typeof payload !== 'object' || payload === null) return undefined;
  const postId = (payload as Record<string, unknown>).postId;
  return typeof postId === 'string' ? postId : undefined;
};

export function createFakeGatewaySocket(): FakeGatewaySocket {
  const handlers = new Map<string, Set<SocketHandler>>();
  let connected = false;
  let rooms: ReadonlySet<string> = new Set();
  let emits: readonly (readonly [string, string])[] = [];

  const deliver = (event: string, payload: unknown): void => {
    for (const handler of handlers.get(event) ?? []) handler(payload);
  };

  return {
    get connected() {
      return connected;
    },
    connect: () => {
      connected = true;
      deliver(SERVER_EVENTS.AUTHENTICATED, { success: true });
    },
    disconnect: () => {
      connected = false;
      rooms = new Set();
    },
    on: (event, handler) => {
      handlers.set(event, (handlers.get(event) ?? new Set()).add(handler as SocketHandler));
    },
    off: (event, handler) => {
      handlers.get(event)?.delete(handler as SocketHandler);
    },
    emit: (event, payload) => {
      const postId = postIdOf(payload);
      if (postId === undefined) return;
      if (event === CLIENT_EVENTS.JOIN_POST) {
        emits = [...emits, [event, postId]];
        if (connected) rooms = new Set([...rooms, `post:${postId}`]);
        return;
      }
      if (event === CLIENT_EVENTS.LEAVE_POST) {
        emits = [...emits, [event, postId]];
        rooms = new Set([...rooms].filter((room) => room !== `post:${postId}`));
      }
    },
    broadcast: (room, event, payload) => {
      if (rooms.has(room)) deliver(event, payload);
    },
    drop: () => {
      connected = false;
      rooms = new Set();
    },
    rooms: () => rooms,
    roomEmits: () => emits,
  };
}
