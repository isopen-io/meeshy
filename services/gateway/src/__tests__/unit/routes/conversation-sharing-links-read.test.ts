/**
 * `GET /conversations/:conversationId/links` — extrait de
 * `conversation-sharing.test.ts` (#5191), dont le budget de taille était déjà
 * dépassé (1258 lignes, plafond dur 1200) : la directive interdit d'y ajouter
 * avant d'en extraire. Route DÉPRÉCIÉE depuis 2026-08-30 (successeur :
 * `GET /links?conversationId=`, voir `conversation-sharing.ts`), mais servie
 * jusqu'à son retrait — sa garde d'appartenance mérite le même témoin que sa
 * jumelle.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { findFirstHonouringWhere } from '../../helpers/find-first-honouring-where';

// ─── Module mocks (must be hoisted before imports) ────────────────────────────

const mockResolveConversationId = jest.fn<any>();
const mockGenerateUniqueShareLinkId = jest.fn<any>().mockResolvedValue('mshy_TestLnk1');
const mockEnsureUniqueShareLinkIdentifier = jest.fn<any>().mockResolvedValue('mshy_unique');

const mockSendSuccess = jest.fn<any>((reply: any, data: any) => {
  reply._body = { success: true, data };
  return reply;
});
const mockSendBadRequest = jest.fn<any>((reply: any, msg: any) => {
  reply._body = { success: false, error: msg };
  return reply;
});
const mockSendUnauthorized = jest.fn<any>((reply: any, msg: any) => {
  reply._body = { success: false, error: msg };
  return reply;
});
const mockSendForbidden = jest.fn<any>((reply: any, msg: any) => {
  reply._body = { success: false, error: msg };
  return reply;
});
const mockSendNotFound = jest.fn<any>((reply: any, msg: any) => {
  reply._body = { success: false, error: msg };
  return reply;
});
const mockSendConflict = jest.fn<any>((reply: any, msg: any) => {
  reply._body = { success: false, error: msg };
  return reply;
});
const mockSendInternalError = jest.fn<any>((reply: any, msg: any) => {
  reply._body = { success: false, error: msg };
  return reply;
});
const mockSendError = jest.fn<any>((reply: any, status: any, msg: any) => {
  reply._body = { success: false, status, error: msg };
  return reply;
});

jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: any[]) => mockResolveConversationId(...args),
}));

// PROLONGER le module, jamais le REMPLACER — même raison que
// `conversation-sharing.test.ts` (CLAUDE.md § « Un double PARTIEL d'un module
// perd en silence tout ce que le module GAGNE »).
jest.mock('../../../routes/links/utils/link-helpers', () => ({
  ...(jest.requireActual('../../../routes/links/utils/link-helpers') as object),
  generateUniqueShareLinkId: (...args: any[]) => mockGenerateUniqueShareLinkId(...args),
  ensureUniqueShareLinkIdentifier: (...args: any[]) => mockEnsureUniqueShareLinkIdentifier(...args),
}));

jest.mock('../../../utils/response', () => ({
  sendSuccess: (...args: any[]) => mockSendSuccess(...args),
  sendBadRequest: (...args: any[]) => mockSendBadRequest(...args),
  sendUnauthorized: (...args: any[]) => mockSendUnauthorized(...args),
  sendForbidden: (...args: any[]) => mockSendForbidden(...args),
  sendNotFound: (...args: any[]) => mockSendNotFound(...args),
  sendConflict: (...args: any[]) => mockSendConflict(...args),
  sendInternalError: (...args: any[]) => mockSendInternalError(...args),
  sendError: (...args: any[]) => mockSendError(...args),
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn<any>().mockReturnValue({
      error: jest.fn<any>(),
      info: jest.fn<any>(),
      warn: jest.fn<any>(),
      debug: jest.fn<any>(),
    }),
  },
}));

jest.mock('@meeshy/shared/utils/errors', () => ({
  createError: jest.fn<any>(),
  sendErrorResponse: jest.fn<any>(),
}));

const mockResolveForTarget = jest.fn<any>(async () => ({ showOnline: false, showLastSeenTimestamp: false }));
jest.mock('../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({
    resolveForTarget: (...args: any[]) => mockResolveForTarget(...args),
  }),
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  conversationSchema: { type: 'object' },
  conversationParticipantSchema: { type: 'object' },
  conversationResponseSchema: { type: 'object' },
  errorResponseSchema: { type: 'object' },
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import { registerSharingRoutes } from '../../../routes/conversations/sharing';

// ─── IDs ──────────────────────────────────────────────────────────────────────

const CONV_ID = '507f1f77bcf86cd799439011';
const USER_ID = '507f1f77bcf86cd799439022';
const PART_ID = '507f1f77bcf86cd799439044';
// Un AUTRE participant, ACTIF dans la MÊME conversation — jamais `USER_ID`.
// Placé en tête du double, il fait échouer tout `where` qui perdrait `userId`
// (#5191) : la garde plate le trouverait, jamais `null`.
const INTRUDER_USER_ID = '507f1f77bcf86cd799439066';

// ─── Factories ────────────────────────────────────────────────────────────────

type RouteHandler = (req: any, reply: any) => Promise<any>;
type RouteReg = { method: string; path: string; handler: RouteHandler; options: any };

function createMockFastify() {
  const routes: RouteReg[] = [];
  const authenticate = jest.fn<any>();
  const notificationService = {
    createMemberJoinedNotification: jest.fn<any>().mockResolvedValue(undefined),
    createMemberJoinedNotificationsBatch: jest.fn<any>().mockResolvedValue(0),
    createConversationInviteNotification: jest.fn<any>().mockResolvedValue(undefined),
    createSystemNotification: jest.fn<any>().mockResolvedValue(undefined),
  };
  const mentionService = {
    invalidateCacheForConversation: jest.fn<any>().mockResolvedValue(undefined),
  };
  const prismaOnFastify = {
    conversation: { findUnique: jest.fn<any>() },
    user: { findUnique: jest.fn<any>() },
    participant: {
      create: jest.fn<any>(),
      update: jest.fn<any>(),
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    message: {
      create: jest.fn<any>().mockImplementation(async ({ data }: any) => ({ id: 'sys-1', ...data })),
    },
  };
  const joinUserToConversationRoom = jest.fn<any>().mockResolvedValue(undefined);
  const broadcastMessage = jest.fn<any>().mockResolvedValue(undefined);
  const socketIOHandler = {
    getManager: jest.fn<any>().mockReturnValue({ joinUserToConversationRoom, broadcastMessage }),
  };
  return {
    routes,
    authenticate,
    notificationService,
    mentionService,
    socketIOHandler,
    joinUserToConversationRoom,
    broadcastMessage,
    prisma: prismaOnFastify,
    get: jest.fn<any>((path: string, options: any, handler: RouteHandler) => {
      routes.push({ method: 'GET', path, handler, options });
    }),
    post: jest.fn<any>((path: string, options: any, handler: RouteHandler) => {
      routes.push({ method: 'POST', path, handler, options });
    }),
    patch: jest.fn<any>((path: string, options: any, handler: RouteHandler) => {
      routes.push({ method: 'PATCH', path, handler, options });
    }),
  };
}

function createMockPrisma() {
  return {
    conversation: {
      findUnique: jest.fn<any>(),
      update: jest.fn<any>().mockResolvedValue({ id: CONV_ID, title: 'Updated', participants: [] }),
    },
    participant: {
      findFirst: jest.fn<any>(),
      findMany: jest.fn<any>().mockResolvedValue([]),
      create: jest.fn<any>(),
      update: jest.fn<any>(),
    },
    user: {
      findUnique: jest.fn<any>(),
    },
    conversationShareLink: {
      create: jest.fn<any>(),
      update: jest.fn<any>().mockResolvedValue({}),
      findFirst: jest.fn<any>(),
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    message: {
      create: jest.fn<any>().mockImplementation(async ({ data }: any) => ({ id: 'sys-1', ...data })),
    },
  } as any;
}

function createMockReply() {
  const reply: any = {
    _body: undefined,
    status: jest.fn<any>(),
    send: jest.fn<any>((body: any) => { reply._body = body; return reply; }),
  };
  reply.status.mockReturnValue(reply);
  return reply;
}

function getRoute(fastify: ReturnType<typeof createMockFastify>, method: string, pathFragment: string) {
  const r = fastify.routes.find(r => r.method === method && r.path.includes(pathFragment));
  if (!r) throw new Error(`Route ${method} *${pathFragment}* not found`);
  return r;
}

function makeRequest(overrides: Record<string, any> = {}) {
  return {
    params: {},
    body: {},
    authContext: { type: 'user', userId: USER_ID, isAuthenticated: true, registeredUser: { id: USER_ID, role: 'USER' } },
    ...overrides,
  };
}

function makeParticipant(overrides: Record<string, any> = {}) {
  return {
    id: PART_ID,
    userId: USER_ID,
    conversationId: CONV_ID,
    role: 'member',
    displayName: 'Alice',
    isActive: true,
    user: { id: USER_ID, role: 'USER' },
    ...overrides,
  };
}

/**
 * Seed `prisma.participant.findFirst` en honorant son `where` — un intrus,
 * puis la ligne RÉELLE du lecteur (`role` par défaut `member`, surchargeable).
 * Un `where` qui perdrait `userId` trouverait l'intrus, jamais `null`.
 */
function seedMembership(prisma: ReturnType<typeof createMockPrisma>, overrides: Record<string, unknown> = {}): void {
  prisma.participant.findFirst.mockImplementation(
    findFirstHonouringWhere([
      { conversationId: CONV_ID, userId: INTRUDER_USER_ID, isActive: true, role: 'moderator' },
      makeParticipant(overrides),
    ])
  );
}

function setup() {
  const fastify = createMockFastify();
  const prisma = createMockPrisma();
  const optionalAuth = jest.fn<any>();
  const requiredAuth = jest.fn<any>();
  registerSharingRoutes(fastify as any, prisma, optionalAuth, requiredAuth);
  return { fastify, prisma, reply: createMockReply(), optionalAuth, requiredAuth };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /conversations/:conversationId/links
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /conversations/:conversationId/links', () => {
  beforeEach(() => jest.clearAllMocks());

  function getLinksRoute() {
    const { fastify, prisma, reply } = setup();
    const route = getRoute(fastify, 'GET', '/links');
    return { prisma, reply, route };
  }

  it('returns 403 when user is not a member — jamais quand un AUTRE membre existe (#5191)', async () => {
    const { prisma, reply, route } = getLinksRoute();
    // Aucune ligne pour `USER_ID` : seul un `where` honorant `userId` peut
    // légitimement rendre `null` — un `where` qui l'aurait perdu trouverait
    // l'intrus, actif dans la même conversation.
    prisma.participant.findFirst.mockImplementation(
      findFirstHonouringWhere([
        { conversationId: CONV_ID, userId: INTRUDER_USER_ID, isActive: true, role: 'moderator' },
      ])
    );
    const req = makeRequest({ params: { conversationId: CONV_ID } });
    await route.handler(req, reply);
    expect(mockSendForbidden).toHaveBeenCalledWith(reply, expect.any(String));
  });

  it('moderator sees all links (aucun filtre createdBy)', async () => {
    const { prisma, reply, route } = getLinksRoute();
    seedMembership(prisma, { role: 'moderator' });
    const mockLinks = [{ id: 'link1', currentUses: 5 }, { id: 'link2', currentUses: 2 }];
    prisma.conversationShareLink.findMany.mockResolvedValue(mockLinks);
    const req = makeRequest({ params: { conversationId: CONV_ID } });
    await route.handler(req, reply);
    const findCall = prisma.conversationShareLink.findMany.mock.calls[0][0];
    expect(findCall.where).not.toHaveProperty('createdBy');
    expect(reply._body).toMatchObject({
      success: true,
      isModerator: true,
      data: [
        expect.objectContaining({ id: 'link1', participantCount: 5 }),
        expect.objectContaining({ id: 'link2', participantCount: 2 }),
      ],
    });
  });

  it('admin role also gets all links', async () => {
    const { prisma, reply, route } = getLinksRoute();
    seedMembership(prisma, { role: 'admin' });
    prisma.conversationShareLink.findMany.mockResolvedValue([]);
    const req = makeRequest({ params: { conversationId: CONV_ID } });
    await route.handler(req, reply);
    const findCall = prisma.conversationShareLink.findMany.mock.calls[0][0];
    expect(findCall.where).not.toHaveProperty('createdBy');
    expect(reply._body).toMatchObject({ isModerator: true });
  });

  it('creator role also gets all links', async () => {
    const { prisma, reply, route } = getLinksRoute();
    seedMembership(prisma, { role: 'creator' });
    prisma.conversationShareLink.findMany.mockResolvedValue([]);
    const req = makeRequest({ params: { conversationId: CONV_ID } });
    await route.handler(req, reply);
    const findCall = prisma.conversationShareLink.findMany.mock.calls[0][0];
    expect(findCall.where).not.toHaveProperty('createdBy');
  });

  it('regular member sees only own links (filtre createdBy applique)', async () => {
    const { prisma, reply, route } = getLinksRoute();
    seedMembership(prisma, { role: 'member' });
    prisma.conversationShareLink.findMany.mockResolvedValue([{ id: 'link1', currentUses: 1 }]);
    const req = makeRequest({ params: { conversationId: CONV_ID } });
    await route.handler(req, reply);
    const findCall = prisma.conversationShareLink.findMany.mock.calls[0][0];
    // #4170 -- ce temoin assertait `creatorId`, une colonne qui N'EXISTE PAS sur
    // ConversationShareLink (le schema declare `createdBy`). Le Prisma mocke ne
    // valide aucun nom de colonne, donc le test restait VERT sur du code qui levait
    // en production et tombait dans le catch-all : 500 sur toute lecture par un
    // membre non-moderateur. Un temoin qui asserte l'IMPLEMENTATION plutot que le
    // COMPORTEMENT peut verrouiller un defaut au lieu de le prevenir.
    expect(findCall.where).toHaveProperty('createdBy', USER_ID);
    expect(reply._body).toMatchObject({ isModerator: false });
  });

  it('maps currentUses to participantCount in response', async () => {
    const { prisma, reply, route } = getLinksRoute();
    seedMembership(prisma, { role: 'member' });
    prisma.conversationShareLink.findMany.mockResolvedValue([{ id: 'l1', currentUses: 7 }]);
    const req = makeRequest({ params: { conversationId: CONV_ID } });
    await route.handler(req, reply);
    expect(reply._body.data[0]).toMatchObject({ id: 'l1', currentUses: 7, participantCount: 7 });
  });

  it('sends internal error on unexpected exception', async () => {
    const { prisma, reply, route } = getLinksRoute();
    prisma.participant.findFirst.mockRejectedValue(new Error('DB error'));
    const req = makeRequest({ params: { conversationId: CONV_ID } });
    await route.handler(req, reply);
    expect(mockSendInternalError).toHaveBeenCalledWith(reply, expect.any(String));
  });
});
