import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { makeChainableIO } from '../../helpers/chainable-io';

// ─── Module mocks (must be hoisted before imports) ───────────────────────────

jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: jest.fn<any>(),
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  errorResponseSchema: { type: 'object' },
}));

jest.mock('../../../utils/response', () => ({
  sendSuccess: jest.fn<any>((reply: any, data: any) => {
    reply._body = { success: true, data };
    return reply;
  }),
  sendBadRequest: jest.fn<any>((reply: any, msg: any) => {
    reply._body = { success: false, error: msg };
    return reply;
  }),
  sendForbidden: jest.fn<any>((reply: any, msg: any) => {
    reply._body = { success: false, error: msg };
    return reply;
  }),
  sendNotFound: jest.fn<any>((reply: any, msg: any) => {
    reply._body = { success: false, error: msg };
    return reply;
  }),
  sendInternalError: jest.fn<any>((reply: any, msg: any) => {
    reply._body = { success: false, error: msg };
    return reply;
  }),
}));

jest.mock('../../../services/ConversationMessageStatsService', () => ({
  conversationMessageStatsService: {
    getStats: jest.fn<any>(),
  },
}));

jest.mock('../../../routes/conversations/utils/access-control', () => ({
  canAccessConversation: jest.fn<any>(),
}));

// ─── Imports ─────────────────────────────────────────────────────────────────

import { resolveConversationId } from '../../../utils/conversation-id-cache';
import { sendSuccess, sendBadRequest, sendForbidden, sendNotFound, sendInternalError } from '../../../utils/response';
import { registerLeaveRoutes } from '../../../routes/conversations/leave';
import { registerBanRoutes } from '../../../routes/conversations/ban';
import { registerDeleteForMeRoutes } from '../../../routes/conversations/delete-for-me';
import { registerStatsRoutes } from '../../../routes/conversations/stats';
import { conversationMessageStatsService } from '../../../services/ConversationMessageStatsService';
import { canAccessConversation } from '../../../routes/conversations/utils/access-control';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';

// ─── Typed mocks ─────────────────────────────────────────────────────────────

const mockedResolve = resolveConversationId as jest.MockedFunction<typeof resolveConversationId>;
const mockedSendSuccess = sendSuccess as jest.MockedFunction<typeof sendSuccess>;
const mockedSendBadRequest = sendBadRequest as jest.MockedFunction<typeof sendBadRequest>;
const mockedSendForbidden = sendForbidden as jest.MockedFunction<typeof sendForbidden>;
const mockedSendNotFound = sendNotFound as jest.MockedFunction<typeof sendNotFound>;
const mockedSendInternalError = sendInternalError as jest.MockedFunction<typeof sendInternalError>;
const mockedGetStats = (conversationMessageStatsService.getStats as jest.MockedFunction<any>);
const mockedCanAccess = canAccessConversation as jest.MockedFunction<typeof canAccessConversation>;

// ─── IDs ─────────────────────────────────────────────────────────────────────

const VALID_CONV_ID = '507f1f77bcf86cd799439011';
const VALID_USER_ID = '507f1f77bcf86cd799439022';
const TARGET_USER_ID = '507f1f77bcf86cd799439033';
const PARTICIPANT_ID = '507f1f77bcf86cd799439044';
const TARGET_PARTICIPANT_ID = '507f1f77bcf86cd799439055';

// ─── Factories ───────────────────────────────────────────────────────────────

type RouteHandler = (request: any, reply: any) => Promise<any>;
type RouteRegistration = { method: string; path: string; handler: RouteHandler; options: any };

function createMockFastify() {
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
    socketIOHandler: undefined as any,
  };
}

function getRoute(fastify: ReturnType<typeof createMockFastify>, method: string, pathFragment: string) {
  const r = fastify.routes.find(r => r.method === method && r.path.includes(pathFragment));
  if (!r) throw new Error(`Route ${method} *${pathFragment}* not registered`);
  return r;
}

function createMockReply() {
  const reply: any = { _body: undefined, status: jest.fn<any>(), send: jest.fn<any>() };
  reply.status.mockReturnValue(reply);
  return reply;
}

function createMockPrisma() {
  return {
    conversation: {
      findFirst: jest.fn<any>(),
      update: jest.fn<any>().mockResolvedValue({}),
      // registerDeleteForMeRoutes' creator branch queries this to determine
      // isEmptyDirect (see routes/conversations/delete-for-me.ts) — default
      // to "not empty" so the pre-existing successor-transfer scenarios below
      // are unaffected. Pre-merge fix 2026-08-10 switched this from
      // `findUnique` + JS negation to a `count` guard (Prisma-Mongo
      // absent-vs-null trap).
      count: jest.fn<any>().mockResolvedValue(0),
    },
    participant: {
      findFirst: jest.fn<any>(),
      findMany: jest.fn<any>().mockResolvedValue([]),
      update: jest.fn<any>().mockResolvedValue({}),
      count: jest.fn<any>().mockResolvedValue(0),
    },
    notification: {
      // La trace des promotions, lue par la succession du créateur (#4058).
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    user: {
      findMany: jest.fn<any>(),
    },
    // Les deux routes de clôture committent leur écriture jumelle et le geste
    // de l'appelant dans UNE transaction. Le double n'en simule pas l'atomicité
    // — il rend les résultats dans l'ordre, ce qui suffit à ce que la route
    // lise son audience — et il RETIENT ses arguments, ce dont les gardes
    // d'atomicité se servent pour dire QUELLES écritures y sont entrées.
    $transaction: jest.fn<any>((ops: any) => Promise.all(ops)),
  } as any;
}

// `.to()` doit CHAÎNER : bannissement et levée passent désormais par
// `emitToConversationParticipants`, qui écrit `io.to(fil).to(perso…).emit()`
// pour ne livrer qu'une copie par socket. Un double dont `.to()` rend `{ emit }`
// sans `.to` plante au second maillon.
function createMockIO(extraSockets: any[] = []) {
  return makeChainableIO(extraSockets.length > 0 ? { sockets: extraSockets } : {});
}

function wireIO(fastify: ReturnType<typeof createMockFastify>, io?: any) {
  const invalidateParticipantCache = jest.fn<any>();
  const endLiveLocationsForClosedConversation = jest.fn<any>();
  fastify.socketIOHandler = io
    ? {
        getManager: () => ({
          getIO: () => io,
          invalidateParticipantCache,
          endLiveLocationsForClosedConversation,
        }),
      }
    : undefined;
  (fastify as any)._invalidateParticipantCache = invalidateParticipantCache;
  (fastify as any)._endLiveLocations = endLiveLocationsForClosedConversation;
}

function makeRequest(params: Record<string, string>, userId: string, extra: Record<string, any> = {}) {
  return {
    params,
    authContext: { userId, isAuthenticated: true, isAnonymous: false },
    ...extra,
  };
}

function makeParticipant(overrides: Record<string, any> = {}) {
  return {
    id: PARTICIPANT_ID,
    conversationId: VALID_CONV_ID,
    userId: VALID_USER_ID,
    role: 'member',
    displayName: 'Alice',
    isActive: true,
    bannedAt: null,
    joinedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// LEAVE ROUTES
// ─────────────────────────────────────────────────────────────────────────────

describe('registerLeaveRoutes — POST /conversations/:id/leave', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // By default, resolveConversationId returns the raw id unchanged (already a valid ObjectId)
    mockedResolve.mockResolvedValue(VALID_CONV_ID);
  });

  function setup(ioInstance?: any) {
    const fastify = createMockFastify();
    wireIO(fastify, ioInstance);
    const prisma = createMockPrisma();
    registerLeaveRoutes(fastify, prisma, jest.fn(), jest.fn());
    const route = getRoute(fastify, 'POST', 'leave');
    const reply = createMockReply();
    return { fastify, prisma, route, reply };
  }

  it('returns 404 when participant not found', async () => {
    const { prisma, route, reply } = setup();
    prisma.participant.findFirst.mockResolvedValue(null);
    const request = makeRequest({ id: VALID_CONV_ID }, VALID_USER_ID);
    await route.handler(request, reply);
    expect(mockedSendNotFound).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('returns success when a regular member leaves (no IO)', async () => {
    const { prisma, route, reply } = setup();
    prisma.participant.findFirst.mockResolvedValue(makeParticipant({ role: 'member' }));
    const request = makeRequest({ id: VALID_CONV_ID }, VALID_USER_ID);
    await route.handler(request, reply);
    expect(prisma.participant.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: PARTICIPANT_ID } })
    );
    expect(mockedSendSuccess).toHaveBeenCalledWith(
      reply,
      expect.objectContaining({ conversationId: VALID_CONV_ID })
    );
  });

  it("laisse le créateur partir et transfère le fil, plutôt que de REFUSER (#4058)", async () => {
    // Cette porte rendait `400` « transférez l'ownership ou supprimez la
    // conversation » — un mur, pendant que sa jumelle `delete-for-me.ts`
    // transférait en silence. La décision porteur du 2026-08-28 a tranché :
    // le créateur part, et l'héritier se calcule.
    const SUCCESSOR = '507f1f77bcf86cd7994390aa';
    const { prisma, route, reply } = setup();
    prisma.participant.findFirst.mockResolvedValue(makeParticipant({ role: 'creator' }));
    prisma.participant.findMany.mockResolvedValue([
      { id: SUCCESSOR, userId: TARGET_USER_ID, role: 'member', joinedAt: new Date('2026-01-01T00:00:00.000Z') },
    ]);
    const request = makeRequest({ id: VALID_CONV_ID }, VALID_USER_ID);
    await route.handler(request, reply);
    expect(mockedSendBadRequest).not.toHaveBeenCalled();
    expect(prisma.participant.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: SUCCESSOR }, data: { role: 'creator' } })
    );
    expect(prisma.conversation.update).not.toHaveBeenCalled();
  });

  it('deactivates conversation when creator is last member', async () => {
    const { prisma, route, reply } = setup();
    prisma.participant.findFirst.mockResolvedValue(makeParticipant({ role: 'creator' }));
    prisma.participant.findMany.mockResolvedValue([]);
    const request = makeRequest({ id: VALID_CONV_ID }, VALID_USER_ID);
    await route.handler(request, reply);
    // Ce témoin épinglait `data: { isActive: false }` À L'EXCLUSION du reste,
    // c'est-à-dire exactement le défaut : `loadConversationTombstones`
    // interroge `closedAt > since` et rien d'autre, donc une clôture sans
    // `closedAt` n'est portée par AUCUN delta de rattrapage. Il dit désormais
    // la même phrase que son jumeau `delete-for-me`.
    expect(prisma.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { isActive: false, closedAt: expect.any(Date), closedBy: VALID_USER_ID },
      })
    );
    expect(mockedSendSuccess).toHaveBeenCalled();
  });

  it('annonce la clôture aux rooms PERSONNELLES quand le départ du créateur ferme le fil', async () => {
    const io = createMockIO();
    const { prisma, route, reply } = setup(io);
    prisma.participant.findFirst.mockResolvedValue(makeParticipant({ role: 'creator' }));
    prisma.participant.count.mockResolvedValue(0);
    // L'audience est ramenée PAR l'écriture de clôture, jamais par une requête
    // de plus — le double doit donc la rendre, sans quoi le test mesurerait le
    // `?? []` et non le fan-out.
    prisma.conversation.update.mockResolvedValue({
      participants: [{ id: PARTICIPANT_ID, userId: VALID_USER_ID, isActive: true }],
    });
    const request = makeRequest({ id: VALID_CONV_ID }, VALID_USER_ID);
    await route.handler(request, reply);
    // `_roomsFor` et non `io.to` : la room doit appartenir à la chaîne qui a
    // émis CET événement, pas avoir été nommée quelque part dans la route (cf.
    // l'en-tête de `makeChainableIO`). `io.to` ne retient d'ailleurs que le
    // PREMIER maillon — la room de conversation — et serait vert sur une
    // diffusion qui n'atteint aucune room personnelle.
    expect(io._roomsFor(SERVER_EVENTS.CONVERSATION_CLOSED)).toContain(ROOMS.user(VALID_USER_ID));
    expect(io._payloadFor(SERVER_EVENTS.CONVERSATION_CLOSED)).toEqual(
      expect.objectContaining({ conversationId: VALID_CONV_ID, closedBy: VALID_USER_ID })
    );
  });

  it('éteint les partages de position en cours du fil fermé', async () => {
    const io = createMockIO();
    const { prisma, route, reply, fastify } = setup(io);
    prisma.participant.findFirst.mockResolvedValue(makeParticipant({ role: 'creator' }));
    prisma.participant.count.mockResolvedValue(0);
    prisma.conversation.update.mockResolvedValue({
      participants: [{ id: PARTICIPANT_ID, userId: VALID_USER_ID, isActive: true }],
    });

    await route.handler(makeRequest({ id: VALID_CONV_ID }, VALID_USER_ID), reply);

    expect((fastify as any)._endLiveLocations).toHaveBeenCalledWith(VALID_CONV_ID);
  });

  it("n'annonce AUCUNE clôture quand un simple membre s'en va", async () => {
    const io = createMockIO();
    const { prisma, route, reply } = setup(io);
    prisma.participant.findFirst.mockResolvedValue(makeParticipant({ role: 'member' }));
    const request = makeRequest({ id: VALID_CONV_ID }, VALID_USER_ID);
    await route.handler(request, reply);
    expect(prisma.conversation.update).not.toHaveBeenCalled();
    expect(io._emit).not.toHaveBeenCalledWith(SERVER_EVENTS.CONVERSATION_CLOSED, expect.anything());
  });

  it('les DEUX routes de clôture par départ écrivent le même état et annoncent le même fait', async () => {
    // La garde qui a de la valeur, et pour la raison du cycle 66 § 4 : les trois
    // témoins ci-dessus décrivent `leave` seul et resteraient VERTS si son
    // jumeau `delete-for-me` perdait demain ses `closedAt`/`closedBy` ou son
    // annonce. Celle-ci ne nomme AUCUNE des deux formes — elle fait jouer aux
    // deux routes le même geste (le créateur part, personne ne reste) et compare
    // les deux résultats entre eux.
    async function closeViaLeave() {
      const io = createMockIO();
      const fastify = createMockFastify();
      wireIO(fastify, io);
      const prisma = createMockPrisma();
      registerLeaveRoutes(fastify, prisma, jest.fn(), jest.fn());
      prisma.participant.findFirst.mockResolvedValue(makeParticipant({ role: 'creator' }));
      prisma.participant.count.mockResolvedValue(0);
      prisma.conversation.update.mockResolvedValue({
        participants: [{ id: PARTICIPANT_ID, userId: VALID_USER_ID, isActive: true }],
      });
      await getRoute(fastify, 'POST', 'leave').handler(
        makeRequest({ id: VALID_CONV_ID }, VALID_USER_ID),
        createMockReply()
      );
      return { prisma, io };
    }

    async function closeViaDeleteForMe() {
      const io = createMockIO();
      const fastify = createMockFastify();
      wireIO(fastify, io);
      const prisma = createMockPrisma();
      registerDeleteForMeRoutes(fastify, prisma, jest.fn(), jest.fn());
      prisma.participant.findFirst
        .mockResolvedValueOnce(makeParticipant({ role: 'creator' }))
        .mockResolvedValueOnce(null)  // aucun modérateur
        .mockResolvedValueOnce(null); // aucun autre membre
      prisma.conversation.update.mockResolvedValue({
        participants: [{ id: PARTICIPANT_ID, userId: VALID_USER_ID, isActive: true }],
      });
      await getRoute(fastify, 'DELETE', 'delete-for-me').handler(
        makeRequest({ id: VALID_CONV_ID }, VALID_USER_ID),
        createMockReply()
      );
      return { prisma, io };
    }

    const viaLeave = await closeViaLeave();
    const viaDeleteForMe = await closeViaDeleteForMe();

    const stateWritten = (r: { prisma: any }) => {
      const call = r.prisma.conversation.update.mock.calls.at(-1)?.[0];
      return Object.keys(call?.data ?? {}).sort();
    };
    const closureAnnounced = (r: { io: any }) =>
      r.io._sendsFor(SERVER_EVENTS.CONVERSATION_CLOSED).length > 0;
    // La room PERSONNELLE lue sur la chaîne de l'annonce elle-même : c'est la
    // propriété que les deux routes revendiquent (« un client posé sur la LISTE
    // a quitté `conversation:<id>` »), et la seule que `io.to` ne peut pas voir.
    const reachesPersonalRoom = (r: { io: any }) =>
      r.io._roomsFor(SERVER_EVENTS.CONVERSATION_CLOSED).includes(ROOMS.user(VALID_USER_ID));

    expect(stateWritten(viaLeave)).toEqual(stateWritten(viaDeleteForMe));
    expect({
      annonce: closureAnnounced(viaLeave),
      roomPersonnelle: reachesPersonalRoom(viaLeave),
    }).toEqual({
      annonce: closureAnnounced(viaDeleteForMe),
      roomPersonnelle: reachesPersonalRoom(viaDeleteForMe),
    });
  });

  it('committe la clôture et le départ dans UNE transaction, sans écriture isolée', async () => {
    // La clôture est DÉFINITIVE et rien ne la rétro-remplit. Séparée du départ,
    // elle committait la première : un échec du second laissait la conversation
    // fermée pour tout le monde pendant que la réponse HTTP — un 500 — niait
    // l'opération, et sans qu'aucune annonce ne parte (le bloc socket est plus
    // bas). Ce témoin dit que les deux moitiés ne peuvent plus atterrir seules.
    const { prisma, route, reply } = setup();
    prisma.participant.findFirst.mockResolvedValue(makeParticipant({ role: 'creator' }));
    prisma.participant.count.mockResolvedValue(0);
    const CLOSURE = { participants: [{ id: PARTICIPANT_ID, userId: VALID_USER_ID, isActive: true }] };
    const DEPARTURE = { id: PARTICIPANT_ID, isActive: false };
    prisma.conversation.update.mockResolvedValue(CLOSURE);
    prisma.participant.update.mockResolvedValue(DEPARTURE);

    await route.handler(makeRequest({ id: VALID_CONV_ID }, VALID_USER_ID), reply);

    // Les deux écritures sont DANS la transaction, et dans cet ordre : la
    // clôture d'abord, pour que l'audience ramenée par son `include` porte
    // encore l'appelant.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    await expect(Promise.all(prisma.$transaction.mock.calls[0][0])).resolves.toEqual([
      CLOSURE,
      DEPARTURE,
    ]);
    // Et AUCUNE des deux n'a de jumelle restée dehors — sans quoi la moitié
    // laissée seule reproduirait exactement le défaut que la transaction ferme.
    expect(prisma.conversation.update).toHaveBeenCalledTimes(1);
    expect(prisma.participant.update).toHaveBeenCalledTimes(1);
  });

  it("le départ d'un simple membre reste une écriture SEULE, sans transaction", async () => {
    // La contre-épreuve, et elle compte : sans elle, envelopper toute la route
    // dans une transaction inutile satisferait le témoin précédent. Un membre
    // qui part n'a aucune écriture jumelle à accorder.
    const { prisma, route, reply } = setup();
    prisma.participant.findFirst.mockResolvedValue(makeParticipant({ role: 'member' }));
    await route.handler(makeRequest({ id: VALID_CONV_ID }, VALID_USER_ID), reply);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.participant.update).toHaveBeenCalledTimes(1);
    expect(mockedSendSuccess).toHaveBeenCalled();
  });

  it('emits CONVERSATION_PARTICIPANT_LEFT and removes user from room when IO present', async () => {
    const io = createMockIO();
    const { fastify, prisma, route, reply } = setup(io);
    prisma.participant.findFirst.mockResolvedValue(makeParticipant({ role: 'member' }));
    const request = makeRequest({ id: VALID_CONV_ID }, VALID_USER_ID);
    await route.handler(request, reply);
    expect(io.to).toHaveBeenCalledWith(ROOMS.conversation(VALID_CONV_ID));
    expect(io._emit).toHaveBeenCalledWith(
      SERVER_EVENTS.CONVERSATION_PARTICIPANT_LEFT,
      expect.objectContaining({ userId: VALID_USER_ID })
    );
    expect(io.in).toHaveBeenCalledWith(ROOMS.user(VALID_USER_ID));
    expect(io._leave).toHaveBeenCalledWith(ROOMS.conversation(VALID_CONV_ID));
    expect((fastify as any)._invalidateParticipantCache).toHaveBeenCalledWith(VALID_USER_ID, VALID_CONV_ID);
    expect(mockedSendSuccess).toHaveBeenCalled();
  });

  it('handles multiple sockets when leaving room', async () => {
    const leaves = [jest.fn<any>(), jest.fn<any>()];
    const io = createMockIO(leaves.map(leave => ({ leave })));
    const { prisma, route, reply } = setup(io);
    prisma.participant.findFirst.mockResolvedValue(makeParticipant({ role: 'member' }));
    const request = makeRequest({ id: VALID_CONV_ID }, VALID_USER_ID);
    await route.handler(request, reply);
    leaves.forEach(leave => expect(leave).toHaveBeenCalledWith(ROOMS.conversation(VALID_CONV_ID)));
  });

  it('resolves non-ObjectId identifier via resolveConversationId', async () => {
    const { prisma, route, reply } = setup();
    mockedResolve.mockResolvedValue(VALID_CONV_ID);
    prisma.participant.findFirst.mockResolvedValue(makeParticipant());
    const request = makeRequest({ id: 'my-conversation-slug' }, VALID_USER_ID);
    await route.handler(request, reply);
    expect(mockedResolve).toHaveBeenCalledWith(prisma, 'my-conversation-slug');
    expect(mockedSendSuccess).toHaveBeenCalled();
  });

  it('falls back to raw id when resolveConversationId returns null', async () => {
    const { prisma, route, reply } = setup();
    mockedResolve.mockResolvedValue(null);
    prisma.participant.findFirst.mockResolvedValue(null);
    const request = makeRequest({ id: 'unknown-slug' }, VALID_USER_ID);
    await route.handler(request, reply);
    // Should not throw; uses raw id as fallback
    expect(prisma.participant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ conversationId: 'unknown-slug' }) })
    );
    expect(mockedSendNotFound).toHaveBeenCalled();
  });

  it('creator leaves with no other members and no IO', async () => {
    const { prisma, route, reply } = setup();
    prisma.participant.findFirst.mockResolvedValue(makeParticipant({ role: 'creator' }));
    prisma.participant.count.mockResolvedValue(0);
    const request = makeRequest({ id: VALID_CONV_ID }, VALID_USER_ID);
    await route.handler(request, reply);
    expect(prisma.conversation.update).toHaveBeenCalled();
    expect(mockedSendSuccess).toHaveBeenCalledWith(reply, expect.objectContaining({ conversationId: VALID_CONV_ID }));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BAN ROUTES
// ─────────────────────────────────────────────────────────────────────────────

describe('registerBanRoutes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedResolve.mockResolvedValue(VALID_CONV_ID);
  });

  function setup(ioInstance?: any) {
    const fastify = createMockFastify();
    wireIO(fastify, ioInstance);
    const prisma = createMockPrisma();
    registerBanRoutes(fastify, prisma, jest.fn(), jest.fn());
    const banRoute = getRoute(fastify, 'PATCH', '/ban');
    const unbanRoute = getRoute(fastify, 'PATCH', '/unban');
    const reply = createMockReply();
    return { fastify, prisma, banRoute, unbanRoute, reply };
  }

  // ── BAN ──────────────────────────────────────────────────────────────────

  describe('PATCH /conversations/:id/participants/:userId/ban', () => {
    it('returns 404 when current user is not in conversation', async () => {
      const { prisma, banRoute, reply } = setup();
      prisma.participant.findFirst.mockResolvedValue(null);
      const request = makeRequest({ id: VALID_CONV_ID, userId: TARGET_USER_ID }, VALID_USER_ID);
      await banRoute.handler(request, reply);
      expect(mockedSendNotFound).toHaveBeenCalledWith(reply, expect.any(String));
    });

    it('returns 404 when target participant not found', async () => {
      const { prisma, banRoute, reply } = setup();
      prisma.participant.findFirst
        .mockResolvedValueOnce({ id: PARTICIPANT_ID, role: 'admin' })
        .mockResolvedValueOnce(null);
      const request = makeRequest({ id: VALID_CONV_ID, userId: TARGET_USER_ID }, VALID_USER_ID);
      await banRoute.handler(request, reply);
      expect(mockedSendNotFound).toHaveBeenCalledWith(reply, expect.any(String));
    });

    it('returns 400 when target is already banned', async () => {
      const { prisma, banRoute, reply } = setup();
      prisma.participant.findFirst
        .mockResolvedValueOnce({ id: PARTICIPANT_ID, role: 'admin' })
        .mockResolvedValueOnce({ id: TARGET_PARTICIPANT_ID, userId: TARGET_USER_ID, role: 'member', bannedAt: new Date(), displayName: 'Bob' });
      const request = makeRequest({ id: VALID_CONV_ID, userId: TARGET_USER_ID }, VALID_USER_ID);
      await banRoute.handler(request, reply);
      expect(mockedSendBadRequest).toHaveBeenCalledWith(reply, expect.any(String));
    });

    it('returns 403 when current user has equal role to target', async () => {
      const { prisma, banRoute, reply } = setup();
      prisma.participant.findFirst
        .mockResolvedValueOnce({ id: PARTICIPANT_ID, role: 'moderator' })
        .mockResolvedValueOnce({ id: TARGET_PARTICIPANT_ID, userId: TARGET_USER_ID, role: 'moderator', bannedAt: null, displayName: 'Bob' });
      const request = makeRequest({ id: VALID_CONV_ID, userId: TARGET_USER_ID }, VALID_USER_ID);
      await banRoute.handler(request, reply);
      expect(mockedSendForbidden).toHaveBeenCalledWith(reply, expect.any(String));
    });

    it('returns 403 when current user has lower role than target', async () => {
      const { prisma, banRoute, reply } = setup();
      prisma.participant.findFirst
        .mockResolvedValueOnce({ id: PARTICIPANT_ID, role: 'member' })
        .mockResolvedValueOnce({ id: TARGET_PARTICIPANT_ID, userId: TARGET_USER_ID, role: 'admin', bannedAt: null, displayName: 'Bob' });
      const request = makeRequest({ id: VALID_CONV_ID, userId: TARGET_USER_ID }, VALID_USER_ID);
      await banRoute.handler(request, reply);
      expect(mockedSendForbidden).toHaveBeenCalledWith(reply, expect.any(String));
    });

    it('bans target when admin bans member (no IO)', async () => {
      const { prisma, banRoute, reply } = setup();
      prisma.participant.findFirst
        .mockResolvedValueOnce({ id: PARTICIPANT_ID, role: 'admin' })
        .mockResolvedValueOnce({ id: TARGET_PARTICIPANT_ID, userId: TARGET_USER_ID, role: 'member', bannedAt: null, displayName: 'Bob' });
      const request = makeRequest({ id: VALID_CONV_ID, userId: TARGET_USER_ID }, VALID_USER_ID);
      await banRoute.handler(request, reply);
      expect(prisma.participant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: TARGET_PARTICIPANT_ID },
          data: expect.objectContaining({ isActive: false }),
        })
      );
      expect(mockedSendSuccess).toHaveBeenCalledWith(
        reply,
        expect.objectContaining({ userId: TARGET_USER_ID })
      );
    });

    it('emits CONVERSATION_PARTICIPANT_BANNED and removes sockets when IO present', async () => {
      const io = createMockIO();
      const { fastify, prisma, banRoute, reply } = setup(io);
      prisma.participant.findFirst
        .mockResolvedValueOnce({ id: PARTICIPANT_ID, role: 'creator' })
        .mockResolvedValueOnce({ id: TARGET_PARTICIPANT_ID, userId: TARGET_USER_ID, role: 'member', bannedAt: null, displayName: 'Bob' });
      const request = makeRequest({ id: VALID_CONV_ID, userId: TARGET_USER_ID }, VALID_USER_ID);
      await banRoute.handler(request, reply);
      expect(io._emit).toHaveBeenCalledWith(
        SERVER_EVENTS.CONVERSATION_PARTICIPANT_BANNED,
        expect.objectContaining({ userId: TARGET_USER_ID })
      );
      expect(io._leave).toHaveBeenCalledWith(ROOMS.conversation(VALID_CONV_ID));
      expect((fastify as any)._invalidateParticipantCache).toHaveBeenCalledWith(TARGET_USER_ID, VALID_CONV_ID);
    });

    it('creator can ban admin', async () => {
      const { prisma, banRoute, reply } = setup();
      prisma.participant.findFirst
        .mockResolvedValueOnce({ id: PARTICIPANT_ID, role: 'creator' })
        .mockResolvedValueOnce({ id: TARGET_PARTICIPANT_ID, userId: TARGET_USER_ID, role: 'admin', bannedAt: null, displayName: 'Bob' });
      const request = makeRequest({ id: VALID_CONV_ID, userId: TARGET_USER_ID }, VALID_USER_ID);
      await banRoute.handler(request, reply);
      expect(mockedSendSuccess).toHaveBeenCalled();
    });

    it('admin can ban moderator', async () => {
      const { prisma, banRoute, reply } = setup();
      prisma.participant.findFirst
        .mockResolvedValueOnce({ id: PARTICIPANT_ID, role: 'admin' })
        .mockResolvedValueOnce({ id: TARGET_PARTICIPANT_ID, userId: TARGET_USER_ID, role: 'moderator', bannedAt: null, displayName: 'Mod' });
      const request = makeRequest({ id: VALID_CONV_ID, userId: TARGET_USER_ID }, VALID_USER_ID);
      await banRoute.handler(request, reply);
      expect(mockedSendSuccess).toHaveBeenCalled();
    });

    // Le rang illisible vaut 0, donc la seule comparaison des rangs laissait un
    // MEMBRE (niveau 10) bannir cette ligne. Bannir est un geste de MODÉRATION :
    // il exige le TITRE, puis la portée (#4176).
    it('un simple membre n\'atteint pas une ligne au rang illisible — le plancher passe avant la comparaison', async () => {
      const { prisma, banRoute, reply } = setup();
      prisma.participant.findFirst
        .mockResolvedValueOnce({ id: PARTICIPANT_ID, role: 'member' }) // level 10
        .mockResolvedValueOnce({ id: TARGET_PARTICIPANT_ID, userId: TARGET_USER_ID, role: 'unknown-role', bannedAt: null, displayName: 'X' }); // level 0
      const request = makeRequest({ id: VALID_CONV_ID, userId: TARGET_USER_ID }, VALID_USER_ID);
      await banRoute.handler(request, reply);
      expect(mockedSendForbidden).toHaveBeenCalledWith(reply, expect.any(String));
      expect(prisma.participant.update).not.toHaveBeenCalled();
    });

    it('bans multiple sockets leave room', async () => {
      const leaves = [jest.fn<any>(), jest.fn<any>()];
      const io = createMockIO(leaves.map(l => ({ leave: l })));
      const { prisma, banRoute, reply } = setup(io);
      prisma.participant.findFirst
        .mockResolvedValueOnce({ id: PARTICIPANT_ID, role: 'creator' })
        .mockResolvedValueOnce({ id: TARGET_PARTICIPANT_ID, userId: TARGET_USER_ID, role: 'member', bannedAt: null, displayName: 'M' });
      const request = makeRequest({ id: VALID_CONV_ID, userId: TARGET_USER_ID }, VALID_USER_ID);
      await banRoute.handler(request, reply);
      leaves.forEach(l => expect(l).toHaveBeenCalledWith(`conversation:${VALID_CONV_ID}`));
    });
  });

  // ── UNBAN ────────────────────────────────────────────────────────────────

  describe('PATCH /conversations/:id/participants/:userId/unban', () => {
    it('returns 404 when current user is not in conversation', async () => {
      const { prisma, unbanRoute, reply } = setup();
      prisma.participant.findFirst.mockResolvedValue(null);
      const request = makeRequest({ id: VALID_CONV_ID, userId: TARGET_USER_ID }, VALID_USER_ID);
      await unbanRoute.handler(request, reply);
      expect(mockedSendNotFound).toHaveBeenCalledWith(reply, expect.any(String));
    });

    // Décision du 2026-08-29 (#4176) : on lève un bannissement qu'on aurait pu
    // poser. Le modérateur qui bannit un membre le relève — sans quoi la moitié
    // destructrice du geste lui est ouverte et la moitié réparatrice fermée.
    it('le modérateur lève le bannissement qu\'il aurait pu poser', async () => {
      const { prisma, unbanRoute, reply } = setup();
      prisma.participant.findFirst
        .mockResolvedValueOnce({ id: PARTICIPANT_ID, role: 'moderator' })
        .mockResolvedValueOnce({ id: TARGET_PARTICIPANT_ID, userId: TARGET_USER_ID, role: 'member', bannedAt: new Date('2026-08-01T00:00:00.000Z') });
      const request = makeRequest({ id: VALID_CONV_ID, userId: TARGET_USER_ID }, VALID_USER_ID);
      await unbanRoute.handler(request, reply);
      expect(prisma.participant.update).toHaveBeenCalled();
    });

    // Le pendant : la loi vaut dans les deux sens. Seul le CRÉATEUR pouvait
    // bannir un ADMIN ; lui seul le relève.
    it('mais un ADMIN ne libère pas un ADMIN banni', async () => {
      const { prisma, unbanRoute, reply } = setup();
      prisma.participant.findFirst
        .mockResolvedValueOnce({ id: PARTICIPANT_ID, role: 'admin' })
        .mockResolvedValueOnce({ id: TARGET_PARTICIPANT_ID, userId: TARGET_USER_ID, role: 'admin', bannedAt: new Date('2026-08-01T00:00:00.000Z') });
      const request = makeRequest({ id: VALID_CONV_ID, userId: TARGET_USER_ID }, VALID_USER_ID);
      await unbanRoute.handler(request, reply);
      expect(mockedSendForbidden).toHaveBeenCalledWith(reply, expect.any(String));
      expect(prisma.participant.update).not.toHaveBeenCalled();
    });

    it('returns 403 when current user is a member', async () => {
      const { prisma, unbanRoute, reply } = setup();
      prisma.participant.findFirst.mockResolvedValueOnce({ id: PARTICIPANT_ID, role: 'member' });
      const request = makeRequest({ id: VALID_CONV_ID, userId: TARGET_USER_ID }, VALID_USER_ID);
      await unbanRoute.handler(request, reply);
      expect(mockedSendForbidden).toHaveBeenCalledWith(reply, expect.any(String));
    });

    it('returns 404 when target banned participant not found', async () => {
      const { prisma, unbanRoute, reply } = setup();
      prisma.participant.findFirst
        .mockResolvedValueOnce({ id: PARTICIPANT_ID, role: 'admin' })
        .mockResolvedValueOnce(null);
      const request = makeRequest({ id: VALID_CONV_ID, userId: TARGET_USER_ID }, VALID_USER_ID);
      await unbanRoute.handler(request, reply);
      expect(mockedSendNotFound).toHaveBeenCalledWith(reply, expect.any(String));
    });

    it('unbans participant successfully when admin (no IO)', async () => {
      const { prisma, unbanRoute, reply } = setup();
      prisma.participant.findFirst
        .mockResolvedValueOnce({ id: PARTICIPANT_ID, role: 'admin' })
        .mockResolvedValueOnce({ id: TARGET_PARTICIPANT_ID, userId: TARGET_USER_ID, bannedAt: new Date('2026-08-01T00:00:00.000Z') });
      const request = makeRequest({ id: VALID_CONV_ID, userId: TARGET_USER_ID }, VALID_USER_ID);
      await unbanRoute.handler(request, reply);
      expect(prisma.participant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: TARGET_PARTICIPANT_ID },
          data: expect.objectContaining({ bannedAt: null, isActive: true, leftAt: null }),
        })
      );
      // La réponse nomme les DEUX faces de l'identité : `participantId` toujours,
      // `userId` nul pour un visiteur sans compte.
      expect(mockedSendSuccess).toHaveBeenCalledWith(reply, {
        participantId: TARGET_PARTICIPANT_ID,
        userId: TARGET_USER_ID,
      });
    });

    it('emits CONVERSATION_PARTICIPANT_UNBANNED when IO present', async () => {
      const io = createMockIO();
      const { prisma, unbanRoute, reply } = setup(io);
      prisma.participant.findFirst
        .mockResolvedValueOnce({ id: PARTICIPANT_ID, role: 'creator' })
        .mockResolvedValueOnce({ id: TARGET_PARTICIPANT_ID, userId: TARGET_USER_ID, bannedAt: new Date('2026-08-01T00:00:00.000Z') });
      const request = makeRequest({ id: VALID_CONV_ID, userId: TARGET_USER_ID }, VALID_USER_ID);
      await unbanRoute.handler(request, reply);
      expect(io._emit).toHaveBeenCalledWith(
        SERVER_EVENTS.CONVERSATION_PARTICIPANT_UNBANNED,
        expect.objectContaining({ userId: TARGET_USER_ID })
      );
    });

    it('creator can unban', async () => {
      const { prisma, unbanRoute, reply } = setup();
      prisma.participant.findFirst
        .mockResolvedValueOnce({ id: PARTICIPANT_ID, role: 'creator' })
        .mockResolvedValueOnce({ id: TARGET_PARTICIPANT_ID, userId: TARGET_USER_ID, bannedAt: new Date('2026-08-01T00:00:00.000Z') });
      const request = makeRequest({ id: VALID_CONV_ID, userId: TARGET_USER_ID }, VALID_USER_ID);
      await unbanRoute.handler(request, reply);
      expect(mockedSendSuccess).toHaveBeenCalled();
    });

    it('falls back to rawId when resolveConversationId returns null (unban path)', async () => {
      const { prisma, unbanRoute, reply } = setup();
      mockedResolve.mockResolvedValue(null);
      prisma.participant.findFirst
        .mockResolvedValueOnce({ id: PARTICIPANT_ID, role: 'admin' })
        .mockResolvedValueOnce({ id: TARGET_PARTICIPANT_ID, userId: TARGET_USER_ID, bannedAt: new Date('2026-08-01T00:00:00.000Z') });
      const request = makeRequest({ id: 'unknown-slug', userId: TARGET_USER_ID }, VALID_USER_ID);
      await unbanRoute.handler(request, reply);
      // Uses raw id 'unknown-slug' as fallback — participant lookup uses it
      expect(prisma.participant.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ conversationId: 'unknown-slug' }) })
      );
      expect(mockedSendSuccess).toHaveBeenCalled();
    });
  });

  describe('PATCH ban — resolveConversationId fallback branch', () => {
    it('falls back to rawId when resolveConversationId returns null (ban path)', async () => {
      const { prisma, banRoute, reply } = setup();
      mockedResolve.mockResolvedValue(null);
      prisma.participant.findFirst
        .mockResolvedValueOnce({ id: PARTICIPANT_ID, role: 'creator' })
        .mockResolvedValueOnce({ id: TARGET_PARTICIPANT_ID, userId: TARGET_USER_ID, role: 'member', bannedAt: null, displayName: 'Bob' });
      const request = makeRequest({ id: 'slug-conv', userId: TARGET_USER_ID }, VALID_USER_ID);
      await banRoute.handler(request, reply);
      expect(prisma.participant.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ conversationId: 'slug-conv' }) })
      );
      expect(mockedSendSuccess).toHaveBeenCalled();
    });

    it('ban uses ?? 0 role fallback — unknown current role cannot ban known role', async () => {
      const { prisma, banRoute, reply } = setup();
      // currentLevel = 0 (unknown role), targetLevel = 10 (member) → 0 <= 10 → forbidden
      prisma.participant.findFirst
        .mockResolvedValueOnce({ id: PARTICIPANT_ID, role: 'unknown-role' })
        .mockResolvedValueOnce({ id: TARGET_PARTICIPANT_ID, userId: TARGET_USER_ID, role: 'member', bannedAt: null, displayName: 'Bob' });
      const request = makeRequest({ id: VALID_CONV_ID, userId: TARGET_USER_ID }, VALID_USER_ID);
      await banRoute.handler(request, reply);
      expect(mockedSendForbidden).toHaveBeenCalled();
    });

    it('ban uses ?? 0 for both roles — both unknown → equal (0 <= 0) → forbidden', async () => {
      const { prisma, banRoute, reply } = setup();
      prisma.participant.findFirst
        .mockResolvedValueOnce({ id: PARTICIPANT_ID, role: 'role-x' })
        .mockResolvedValueOnce({ id: TARGET_PARTICIPANT_ID, userId: TARGET_USER_ID, role: 'role-y', bannedAt: null, displayName: 'X' });
      const request = makeRequest({ id: VALID_CONV_ID, userId: TARGET_USER_ID }, VALID_USER_ID);
      await banRoute.handler(request, reply);
      // 0 <= 0 → forbidden
      expect(mockedSendForbidden).toHaveBeenCalled();
    });

    it('unban uses ?? 0 fallback on currentLevel — unknown role is treated as level 0 (< admin 30 → forbidden)', async () => {
      const { prisma, unbanRoute, reply } = setup();
      // ROLE_LEVELS['some-custom-role'] is undefined → ?? 0 → branch taken
      prisma.participant.findFirst
        .mockResolvedValueOnce({ id: PARTICIPANT_ID, role: 'some-custom-role' });
      const request = makeRequest({ id: VALID_CONV_ID, userId: TARGET_USER_ID }, VALID_USER_ID);
      await unbanRoute.handler(request, reply);
      expect(mockedSendForbidden).toHaveBeenCalled();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE-FOR-ME ROUTES
// ─────────────────────────────────────────────────────────────────────────────

describe('registerDeleteForMeRoutes — DELETE /conversations/:id/delete-for-me', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedResolve.mockResolvedValue(VALID_CONV_ID);
  });

  function setup(ioInstance?: any) {
    const fastify = createMockFastify();
    wireIO(fastify, ioInstance);
    const prisma = createMockPrisma();
    registerDeleteForMeRoutes(fastify, prisma, jest.fn(), jest.fn());
    const route = getRoute(fastify, 'DELETE', 'delete-for-me');
    const reply = createMockReply();
    return { fastify, prisma, route, reply };
  }

  it('returns 404 when participant not found', async () => {
    const { prisma, route, reply } = setup();
    prisma.participant.findFirst.mockResolvedValue(null);
    const request = makeRequest({ id: VALID_CONV_ID }, VALID_USER_ID);
    await route.handler(request, reply);
    expect(mockedSendNotFound).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('marks deletedForMe for a regular member (no IO)', async () => {
    const { prisma, route, reply } = setup();
    prisma.participant.findFirst.mockResolvedValue(makeParticipant({ role: 'member' }));
    const request = makeRequest({ id: VALID_CONV_ID }, VALID_USER_ID);
    await route.handler(request, reply);
    expect(prisma.participant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: PARTICIPANT_ID },
        data: expect.objectContaining({ isActive: false }),
      })
    );
    expect(mockedSendSuccess).toHaveBeenCalledWith(
      reply,
      expect.objectContaining({ conversationId: VALID_CONV_ID })
    );
  });

  it("transfers ownership to the first admin when the creator leaves (#4058)", async () => {
    const ADMIN_ID = '507f1f77bcf86cd799439066';
    const io = createMockIO();
    const { prisma, route, reply } = setup(io);
    prisma.participant.findFirst.mockResolvedValue(makeParticipant({ role: 'creator' }));
    prisma.participant.findMany.mockResolvedValue([
      { id: ADMIN_ID, userId: TARGET_USER_ID, role: 'admin', joinedAt: new Date('2026-01-01T00:00:00.000Z') },
    ]);
    const request = makeRequest({ id: VALID_CONV_ID }, VALID_USER_ID);
    await route.handler(request, reply);
    expect(prisma.participant.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: ADMIN_ID }, data: { role: 'creator' } })
    );
    expect(io._emit).toHaveBeenCalledWith(
      SERVER_EVENTS.PARTICIPANT_ROLE_UPDATED,
      expect.objectContaining({ userId: TARGET_USER_ID, newRole: 'creator' })
    );
    expect(mockedSendSuccess).toHaveBeenCalled();
  });

  it("n'annonce AUCUN transfert d'ownership quand l'écriture échoue", async () => {
    // LA garde de ce cycle, et la seule qui distingue « émettre plus tard » de
    // « émettre au bon moment ». Avant, la promotion committait puis s'annonçait
    // AUSSITÔT, entre les deux écritures : un échec du masquage de l'appelant
    // laissait tout le fil informé d'un nouveau créateur que le 500 démentait,
    // et l'ancien créateur en place à côté de lui — deux créateurs, qu'un
    // réessai aggrave en promouvant un troisième participant.
    //
    // Elle ne nomme ni la transaction ni l'ordre des lignes : elle affirme la
    // PROPRIÉTÉ (rien n'est annoncé de ce qui n'est pas committé), et tombe sur
    // toute forme qui la perd.
    const ADMIN_ID = '507f1f77bcf86cd799439066';
    const io = createMockIO();
    const { prisma, route, reply } = setup(io);
    prisma.participant.findFirst.mockResolvedValue(makeParticipant({ role: 'creator' }));
    prisma.participant.findMany.mockResolvedValue([
      { id: ADMIN_ID, userId: TARGET_USER_ID, role: 'admin', joinedAt: new Date('2026-01-01T00:00:00.000Z') },
    ]);
    prisma.$transaction.mockRejectedValue(new Error('write failed'));

    await expect(
      route.handler(makeRequest({ id: VALID_CONV_ID }, VALID_USER_ID), reply)
    ).rejects.toThrow('write failed');

    expect(io._emit).not.toHaveBeenCalledWith(
      SERVER_EVENTS.PARTICIPANT_ROLE_UPDATED,
      expect.anything()
    );
  });

  it("committe la promotion du successeur et le masquage de l'appelant dans UNE transaction", async () => {
    const ADMIN_ID = '507f1f77bcf86cd799439066';
    const { prisma, route, reply } = setup(createMockIO());
    prisma.participant.findFirst.mockResolvedValue(makeParticipant({ role: 'creator' }));
    prisma.participant.findMany.mockResolvedValue([
      { id: ADMIN_ID, userId: TARGET_USER_ID, role: 'admin', joinedAt: new Date('2026-01-01T00:00:00.000Z') },
    ]);

    await route.handler(makeRequest({ id: VALID_CONV_ID }, VALID_USER_ID), reply);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    // Les deux écritures de participant sont les DEUX de la transaction : la
    // promotion, puis le masquage. Aucune n'est restée dehors.
    expect(prisma.$transaction.mock.calls[0][0]).toHaveLength(2);
    expect(prisma.participant.update).toHaveBeenCalledTimes(2);
    expect(prisma.participant.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: { id: ADMIN_ID }, data: { role: 'creator' } })
    );
    expect(prisma.participant.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { id: PARTICIPANT_ID },
        data: expect.objectContaining({ isActive: false }),
      })
    );
  });

  it('les DEUX routes de clôture committent leur geste ATOMIQUEMENT', async () => {
    // Même argument que la garde de parité du cycle 67, sur la propriété de ce
    // cycle-ci : les témoins d'atomicité écrits côté `leave` resteraient VERTS
    // si `delete-for-me` repassait demain à deux écritures. Celle-ci fait jouer
    // aux deux routes le même geste et compare les deux résultats entre eux.
    async function closeVia(register: any, method: string, fragment: string, arrange: (p: any) => void) {
      const fastify = createMockFastify();
      wireIO(fastify, createMockIO());
      const prisma = createMockPrisma();
      register(fastify, prisma, jest.fn(), jest.fn());
      arrange(prisma);
      await getRoute(fastify, method, fragment).handler(
        makeRequest({ id: VALID_CONV_ID }, VALID_USER_ID),
        createMockReply()
      );
      return prisma;
    }

    const viaLeave = await closeVia(registerLeaveRoutes, 'POST', 'leave', p => {
      p.participant.findFirst.mockResolvedValue(makeParticipant({ role: 'creator' }));
      p.participant.findMany.mockResolvedValue([]); // plus personne à qui donner le fil
    });
    const viaDeleteForMe = await closeVia(registerDeleteForMeRoutes, 'DELETE', 'delete-for-me', p => {
      p.participant.findFirst.mockResolvedValue(makeParticipant({ role: 'creator' }));
      p.participant.findMany.mockResolvedValue([]);
    });

    const shape = (p: any) => ({
      transactions: p.$transaction.mock.calls.length,
      opsInTransaction: p.$transaction.mock.calls[0]?.[0]?.length ?? 0,
      closureWrites: p.conversation.update.mock.calls.length,
      participantWrites: p.participant.update.mock.calls.length,
    });

    expect(shape(viaLeave)).toEqual(shape(viaDeleteForMe));
    // Et la forme elle-même, nommée une fois : une transaction, deux écritures
    // dedans, aucune dehors.
    expect(shape(viaLeave)).toEqual({
      transactions: 1,
      opsInTransaction: 2,
      closureWrites: 1,
      participantWrites: 1,
    });
  });

  it('falls back to the oldest active member when there is no admin', async () => {
    const MEMBER_SUCCESSOR_ID = '507f1f77bcf86cd799439077';
    const { prisma, route, reply } = setup();
    prisma.participant.findFirst.mockResolvedValue(makeParticipant({ role: 'creator' }));
    prisma.participant.findMany.mockResolvedValue([
      { id: MEMBER_SUCCESSOR_ID, userId: TARGET_USER_ID, role: 'member', joinedAt: new Date('2026-01-01T00:00:00.000Z') },
    ]);
    const request = makeRequest({ id: VALID_CONV_ID }, VALID_USER_ID);
    await route.handler(request, reply);
    expect(prisma.participant.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: MEMBER_SUCCESSOR_ID }, data: { role: 'creator' } })
    );
    expect(mockedSendSuccess).toHaveBeenCalled();
  });

  it('deactivates conversation when creator is last member', async () => {
    const { prisma, route, reply } = setup();
    prisma.participant.findFirst.mockResolvedValue(makeParticipant({ role: 'creator' }));
    prisma.participant.findMany.mockResolvedValue([]); // plus aucun membre
    const request = makeRequest({ id: VALID_CONV_ID }, VALID_USER_ID);
    await route.handler(request, reply);
    // La clôture s'ENREGISTRE comme telle. `loadConversationTombstones`
    // interroge `closedAt > since` : une fermeture qui n'écrit que
    // `isActive: false` n'est portée par aucun delta de rattrapage.
    expect(prisma.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { isActive: false, closedAt: expect.any(Date), closedBy: VALID_USER_ID },
      })
    );
    expect(mockedSendSuccess).toHaveBeenCalled();
  });

  it('emits CONVERSATION_DELETED to user room when IO present', async () => {
    const io = createMockIO();
    const { prisma, route, reply } = setup(io);
    prisma.participant.findFirst.mockResolvedValue(makeParticipant({ role: 'member' }));
    const request = makeRequest({ id: VALID_CONV_ID }, VALID_USER_ID);
    await route.handler(request, reply);
    expect(io.in).toHaveBeenCalledWith(ROOMS.user(VALID_USER_ID));
    expect(io._leave).toHaveBeenCalledWith(ROOMS.conversation(VALID_CONV_ID));
    expect(io.to).toHaveBeenCalledWith(ROOMS.user(VALID_USER_ID));
    expect(io._emit).toHaveBeenCalledWith(
      SERVER_EVENTS.CONVERSATION_DELETED,
      expect.objectContaining({ userId: VALID_USER_ID, conversationId: VALID_CONV_ID })
    );
  });

  it('does not emit PARTICIPANT_ROLE_UPDATED when no IO but a successor was found', async () => {
    const ADMIN_ID = '507f1f77bcf86cd799439066';
    const { prisma, route, reply } = setup(undefined);
    prisma.participant.findFirst.mockResolvedValue(makeParticipant({ role: 'creator' }));
    prisma.participant.findMany.mockResolvedValue([
      { id: ADMIN_ID, userId: TARGET_USER_ID, role: 'admin', joinedAt: new Date('2026-01-01T00:00:00.000Z') },
    ]);
    const request = makeRequest({ id: VALID_CONV_ID }, VALID_USER_ID);
    await route.handler(request, reply);
    // update still happens (DB update), success is sent
    expect(prisma.participant.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: ADMIN_ID }, data: { role: 'creator' } })
    );
    expect(mockedSendSuccess).toHaveBeenCalled();
  });

  it('resolves non-ObjectId identifier', async () => {
    const { prisma, route, reply } = setup();
    mockedResolve.mockResolvedValue(VALID_CONV_ID);
    prisma.participant.findFirst.mockResolvedValue(makeParticipant({ role: 'member' }));
    const request = makeRequest({ id: 'mshy_abc123' }, VALID_USER_ID);
    await route.handler(request, reply);
    expect(mockedResolve).toHaveBeenCalledWith(prisma, 'mshy_abc123');
    expect(mockedSendSuccess).toHaveBeenCalled();
  });

  it('falls back to rawId when resolveConversationId returns null (?? rawId branch)', async () => {
    const { prisma, route, reply } = setup();
    mockedResolve.mockResolvedValue(null);
    prisma.participant.findFirst.mockResolvedValue(makeParticipant({ role: 'member' }));
    const request = makeRequest({ id: 'unknown-slug-delete' }, VALID_USER_ID);
    await route.handler(request, reply);
    // Fallback: conversationId = rawId = 'unknown-slug-delete'
    expect(prisma.participant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ conversationId: 'unknown-slug-delete' }),
      })
    );
    expect(mockedSendSuccess).toHaveBeenCalled();
  });

  it('handles multiple sockets when removing user from conversation room', async () => {
    const leaves = [jest.fn<any>(), jest.fn<any>(), jest.fn<any>()];
    const io = createMockIO(leaves.map(l => ({ leave: l })));
    const { prisma, route, reply } = setup(io);
    prisma.participant.findFirst.mockResolvedValue(makeParticipant({ role: 'member' }));
    const request = makeRequest({ id: VALID_CONV_ID }, VALID_USER_ID);
    await route.handler(request, reply);
    leaves.forEach(l => expect(l).toHaveBeenCalledWith(`conversation:${VALID_CONV_ID}`));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// STATS ROUTES
// ─────────────────────────────────────────────────────────────────────────────

describe('registerStatsRoutes — GET /conversations/:id/stats', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedResolve.mockResolvedValue(VALID_CONV_ID);
    mockedCanAccess.mockResolvedValue(true);
  });

  function setup() {
    const fastify = createMockFastify();
    const prisma = createMockPrisma();
    registerStatsRoutes(fastify, prisma, jest.fn());
    const route = getRoute(fastify, 'GET', 'stats');
    const reply = createMockReply();
    return { fastify, prisma, route, reply };
  }

  function makeStatsRequest(id = VALID_CONV_ID) {
    return {
      params: { id },
      authContext: { userId: VALID_USER_ID, isAuthenticated: true, isAnonymous: false },
    };
  }

  const defaultStats = {
    participantStats: {
      [VALID_USER_ID]: { messageCount: 5 },
    },
    dailyActivity: {
      '2026-06-01': 10,
      '2026-06-02': 20,
    },
    languageDistribution: {
      en: 50,
      fr: 30,
      es: 10,
    },
    totalMessages: 90,
  };

  it('returns 404 when resolveConversationId returns null', async () => {
    const { route, reply } = setup();
    mockedResolve.mockResolvedValue(null);
    await route.handler(makeStatsRequest(), reply);
    expect(mockedSendNotFound).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('returns 403 when user has no access', async () => {
    const { route, reply } = setup();
    mockedCanAccess.mockResolvedValue(false);
    await route.handler(makeStatsRequest(), reply);
    expect(mockedSendForbidden).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('returns enriched stats with user info', async () => {
    const { prisma, route, reply } = setup();
    mockedGetStats.mockResolvedValue(defaultStats);
    prisma.user.findMany.mockResolvedValue([
      { id: VALID_USER_ID, username: 'alice', displayName: 'Alice Doe', avatar: 'avatar.png' },
    ]);
    await route.handler(makeStatsRequest(), reply);
    expect(mockedSendSuccess).toHaveBeenCalledWith(
      reply,
      expect.objectContaining({
        participantStats: expect.arrayContaining([
          expect.objectContaining({ userId: VALID_USER_ID, username: 'alice' }),
        ]),
      })
    );
  });

  it('sorts dailyActivity chronologically', async () => {
    const { prisma, route, reply } = setup();
    mockedGetStats.mockResolvedValue({
      ...defaultStats,
      dailyActivity: { '2026-06-03': 5, '2026-06-01': 15, '2026-06-02': 10 },
      participantStats: {},
    });
    prisma.user.findMany.mockResolvedValue([]);
    await route.handler(makeStatsRequest(), reply);
    const sentData = (mockedSendSuccess as jest.MockedFunction<any>).mock.calls[0][1];
    expect(sentData.dailyActivity[0].date).toBe('2026-06-01');
    expect(sentData.dailyActivity[1].date).toBe('2026-06-02');
    expect(sentData.dailyActivity[2].date).toBe('2026-06-03');
  });

  it('sorts languageDistribution by count descending', async () => {
    const { prisma, route, reply } = setup();
    mockedGetStats.mockResolvedValue({
      ...defaultStats,
      languageDistribution: { es: 5, en: 100, fr: 40 },
      participantStats: {},
    });
    prisma.user.findMany.mockResolvedValue([]);
    await route.handler(makeStatsRequest(), reply);
    const sentData = (mockedSendSuccess as jest.MockedFunction<any>).mock.calls[0][1];
    expect(sentData.languageDistribution[0].language).toBe('en');
    expect(sentData.languageDistribution[1].language).toBe('fr');
    expect(sentData.languageDistribution[2].language).toBe('es');
  });

  it('returns null for user fields when user not found in DB', async () => {
    const { prisma, route, reply } = setup();
    mockedGetStats.mockResolvedValue({
      ...defaultStats,
      participantStats: { [TARGET_USER_ID]: { messageCount: 3 } },
    });
    prisma.user.findMany.mockResolvedValue([]); // no matching user
    await route.handler(makeStatsRequest(), reply);
    const sentData = (mockedSendSuccess as jest.MockedFunction<any>).mock.calls[0][1];
    expect(sentData.participantStats[0]).toMatchObject({
      userId: TARGET_USER_ID,
      username: null,
      displayName: null,
      avatar: null,
    });
  });

  it('handles empty participantStats gracefully', async () => {
    const { prisma, route, reply } = setup();
    mockedGetStats.mockResolvedValue({
      participantStats: {},
      dailyActivity: {},
      languageDistribution: {},
      totalMessages: 0,
    });
    prisma.user.findMany.mockResolvedValue([]);
    await route.handler(makeStatsRequest(), reply);
    const sentData = (mockedSendSuccess as jest.MockedFunction<any>).mock.calls[0][1];
    expect(sentData.participantStats).toEqual([]);
    expect(sentData.dailyActivity).toEqual([]);
    expect(sentData.languageDistribution).toEqual([]);
  });

  it('handles null/undefined participantStats from service', async () => {
    const { prisma, route, reply } = setup();
    mockedGetStats.mockResolvedValue({
      participantStats: undefined,
      dailyActivity: undefined,
      languageDistribution: undefined,
    });
    prisma.user.findMany.mockResolvedValue([]);
    await route.handler(makeStatsRequest(), reply);
    const sentData = (mockedSendSuccess as jest.MockedFunction<any>).mock.calls[0][1];
    expect(sentData.participantStats).toEqual([]);
    expect(sentData.dailyActivity).toEqual([]);
    expect(sentData.languageDistribution).toEqual([]);
  });

  it('calls sendInternalError when getStats throws', async () => {
    const { route, reply } = setup();
    mockedGetStats.mockRejectedValue(new Error('DB failure'));
    await route.handler(makeStatsRequest(), reply);
    expect(mockedSendInternalError).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('calls sendInternalError when prisma.user.findMany throws', async () => {
    const { prisma, route, reply } = setup();
    mockedGetStats.mockResolvedValue({
      participantStats: { [VALID_USER_ID]: { messageCount: 1 } },
      dailyActivity: {},
      languageDistribution: {},
    });
    prisma.user.findMany.mockRejectedValue(new Error('user query failed'));
    await route.handler(makeStatsRequest(), reply);
    expect(mockedSendInternalError).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('passes the raw id param to resolveConversationId', async () => {
    const { route, reply } = setup();
    mockedResolve.mockResolvedValue(null);
    await route.handler(makeStatsRequest('some-identifier'), reply);
    expect(mockedResolve).toHaveBeenCalledWith(expect.anything(), 'some-identifier');
  });

  it('passes authContext to canAccessConversation', async () => {
    const { prisma, route, reply } = setup();
    mockedGetStats.mockResolvedValue({ participantStats: {}, dailyActivity: {}, languageDistribution: {} });
    prisma.user.findMany.mockResolvedValue([]);
    const request = makeStatsRequest();
    await route.handler(request, reply);
    expect(mockedCanAccess).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: VALID_USER_ID }),
      VALID_CONV_ID,
      VALID_CONV_ID
    );
  });

  it('enriches multiple participants with user details', async () => {
    const USER2 = '507f1f77bcf86cd799439099';
    const { prisma, route, reply } = setup();
    mockedGetStats.mockResolvedValue({
      participantStats: {
        [VALID_USER_ID]: { messageCount: 10 },
        [USER2]: { messageCount: 5 },
      },
      dailyActivity: {},
      languageDistribution: {},
    });
    prisma.user.findMany.mockResolvedValue([
      { id: VALID_USER_ID, username: 'alice', displayName: 'Alice', avatar: null },
      { id: USER2, username: 'bob', displayName: null, avatar: 'bob.png' },
    ]);
    await route.handler(makeStatsRequest(), reply);
    const sentData = (mockedSendSuccess as jest.MockedFunction<any>).mock.calls[0][1];
    expect(sentData.participantStats).toHaveLength(2);
    const alice = sentData.participantStats.find((p: any) => p.userId === VALID_USER_ID);
    const bob = sentData.participantStats.find((p: any) => p.userId === USER2);
    expect(alice).toMatchObject({ username: 'alice', displayName: 'Alice' });
    expect(bob).toMatchObject({ username: 'bob', displayName: null });
  });
});
