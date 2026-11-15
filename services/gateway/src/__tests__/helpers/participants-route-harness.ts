/**
 * Le HARNAIS des routes de participants — doubles de Prisma, de `reply`, du
 * service de notification, de l'`io` de Socket.IO, de l'instance Fastify, et le
 * câblage qui relie un `request.server` à l'instance enregistrée.
 *
 * ─── Pourquoi un fichier ────────────────────────────────────────────────────
 *
 * `participants.test.ts` était à 2 938 lignes, hors du budget de taille, et le
 * cliquet (`gateway-test-file-size-budget.test.ts`) refuse toute ligne de plus à
 * un fichier déjà hors budget : « on extrait d'abord, on ajoute ensuite ». Il a
 * rougi sur un lot de DEUX lignes de production (#17032), et la bonne réponse
 * n'était pas dans le lot — elle était dans ce fichier-ci, qui n'existait pas
 * encore. Le harnais n'avait aucune maison : il vivait dans la suite qu'il sert,
 * et chaque témoin ajouté le poussait plus loin hors budget.
 *
 * Il reste du HARNAIS et non des FIXTURES : `createParticipant` est resté dans
 * la suite, parce qu'il dépend de ses identifiants, qui sont des données de cas
 * et non de l'outillage.
 */

import { jest } from '@jest/globals';

export function createMockPrisma() {
  return {
    conversation: {
      findFirst: jest.fn<any>(),
      // L'état terminal que la porte d'ajout doit désormais opposer à
      // `resolveConversationEntry`. Vivante par défaut : c'est le conteneur dans
      // lequel tous les cas ci-dessous se placent, et le dire ici évite de le
      // répéter partout.
      findUnique: jest.fn<any>().mockResolvedValue({ isActive: true, closedAt: null }),
    },
    participant: {
      findFirst: jest.fn<any>(),
      // Vide par défaut : `resolveConversationEntry` lit ici TOUTES les lignes
      // de la paire (conversation, utilisateur) — y compris celles qu'un départ
      // ou un bannissement a laissées inactives — donc « aucune ligne » =
      // primo-arrivant.
      findMany: jest.fn<any>().mockResolvedValue([]),
      create: jest.fn<any>(),
      update: jest.fn<any>(),
      updateMany: jest.fn<any>(),
      findUnique: jest.fn<any>(),
      count: jest.fn<any>().mockResolvedValue(0),
    },
    user: {
      findFirst: jest.fn<any>(),
    },
    conversationMessageStats: {
      findUnique: jest.fn<any>().mockResolvedValue(null),
    },
    communityMember: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
    },
  } as any;
}

export function createMockReply() {
  const reply: any = {
    status: jest.fn<any>(),
    send: jest.fn<any>(),
  };
  reply.status.mockReturnValue(reply);
  return reply;
}

export function createMockNotificationService() {
  return {
    createAddedToConversationNotification: jest.fn<any>().mockResolvedValue(undefined),
    createMemberJoinedNotification: jest.fn<any>().mockResolvedValue(undefined),
    createMemberJoinedNotificationsBatch: jest.fn<any>().mockResolvedValue(0),
    createRemovedFromConversationNotification: jest.fn<any>().mockResolvedValue(undefined),
    createMemberRemovedNotification: jest.fn<any>().mockResolvedValue(undefined),
    createMemberRoleChangedNotification: jest.fn<any>().mockResolvedValue(undefined),
  };
}

/**
 * `.to()` rend un émetteur CHAÎNABLE, comme le vrai : `io.to(a).to(b).emit()`
 * est la forme qu'utilise `emitToConversationParticipants` pour ne livrer
 * qu'UNE copie par socket. Un `.to()` qui rend `{ emit }` sans `.to` faisait
 * planter le second maillon — et un mock qui casse sur la forme de production
 * est un témoin qui décrit un autre programme.
 *
 * `_roomsFor` rend les rooms de la chaîne qui a émis un événement donné :
 * c'est la seule façon de prouver « la room personnelle a été adressée », que
 * `expect(io.to).toHaveBeenCalledWith(...)` ne peut pas distinguer d'un simple
 * appel isolé.
 */
export function createMockIO() {
  const mockEmit = jest.fn<any>();
  const mockLeave = jest.fn<any>();
  const mockFetchSockets = jest.fn<any>().mockResolvedValue([{ leave: mockLeave }]);
  const sent: Array<{ rooms: string[]; event: string; payload: any }> = [];
  const chain = (rooms: string[]): any => ({
    to: (room: string) => chain([...rooms, room]), except: () => chain(rooms),
    emit: (event: string, payload: unknown) => {
      sent.push({ rooms, event, payload });
      mockEmit(event, payload);
    },
  });
  const io = {
    to: jest.fn<any>((room: string) => chain([room])),
    in: jest.fn<any>().mockReturnValue({ fetchSockets: mockFetchSockets }),
    _emit: mockEmit,
    _leave: mockLeave,
    _fetchSockets: mockFetchSockets,
    _roomsFor: (event: string) => sent.filter((s) => s.event === event).flatMap((s) => s.rooms),
    _payloadFor: (event: string) => sent.find((s) => s.event === event)?.payload,
  };
  return io;
}

type RouteHandler = (request: any, reply: any) => Promise<any>;
type RouteRegistration = {
  method: string;
  path: string;
  handler: RouteHandler;
  options: any;
};

export function createMockFastify() {
  const routes: RouteRegistration[] = [];
  return {
    routes,
    get: jest.fn<any>((path: string, options: any, handler: RouteHandler) => {
      routes.push({ method: 'GET', path, handler, options });
    }),
    post: jest.fn<any>((path: string, options: any, handler: RouteHandler) => {
      routes.push({ method: 'POST', path, handler, options });
    }),
    delete: jest.fn<any>((path: string, options: any, handler: RouteHandler) => {
      routes.push({ method: 'DELETE', path, handler, options });
    }),
    patch: jest.fn<any>((path: string, options: any, handler: RouteHandler) => {
      routes.push({ method: 'PATCH', path, handler, options });
    }),
  };
}

export function getRoute(fastify: ReturnType<typeof createMockFastify>, method: string, pathPattern: string) {
  return fastify.routes.find(r => r.method === method && r.path.includes(pathPattern))!;
}

// The mutating routes resolve Socket.IO and the notification service from the
// Fastify instance (`fastify.socketIOHandler?.getManager()?.getIO()` and
// `fastify.notificationService`), not from `request.server`. Mirror whatever a
// test wires onto `request.server` onto the registered Fastify instance so the
// route's closure observes it.
export function wireServerToFastify(
  fastify: any,
  server?: { io?: unknown; notificationService?: unknown }
) {
  const invalidateParticipantCache = jest.fn<any>();
  const endLiveLocationForDepartedMember = jest.fn<any>();
  // `joinUserToConversationRoom` COMPLÈTE le double, et son absence coûtait
  // plus qu'une méthode manquante (#17032). L'ajout d'un participant l'appelle
  // — `socketManager.joinUserToConversationRoom(...).catch(...)` lève quand la
  // méthode n'existe pas — et l'appel vivait APRÈS les diffusions : le
  // `TypeError` partait donc dans le `catch` de fin de route, qui répondait
  // 500, pendant que les témoins d'émission restaient verts. Ils n'assertaient
  // que `io.to` / `io._emit`, jamais la réponse. C'est « un double mente aussi
  // par ce qu'il ACCEPTE » dans sa variante par OMISSION : la méthode absente
  // ne refusait rien, elle faisait tomber la suite du gestionnaire.
  const joinUserToConversationRoom = jest.fn<any>(async () => undefined);
  fastify.socketIOHandler = server?.io
    ? {
        getManager: () => ({
          getIO: () => server.io,
          invalidateParticipantCache,
          endLiveLocationForDepartedMember,
          joinUserToConversationRoom,
        }),
      }
    : undefined;
  fastify.notificationService = server?.notificationService;
  fastify._invalidateParticipantCache = invalidateParticipantCache;
  fastify._joinUserToConversationRoom = joinUserToConversationRoom;
  fastify._endLiveLocationForDepartedMember = endLiveLocationForDepartedMember;
}
