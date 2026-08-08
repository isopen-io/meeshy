/**
 * Unit tests for links/messages routes.
 * Tests POST /links/:identifier/messages (anonymous) and
 * POST /links/:identifier/messages/auth (authenticated).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { z } from 'zod';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../utils/logger', () => ({ logError: jest.fn() }));

jest.mock('../../../utils/session-token', () => ({
  hashSessionToken: jest.fn((token: string) => 'hashed-' + token),
}));

const mockProcessMessageLinks = jest.fn<any>().mockResolvedValue({
  processedContent: 'Hello!',
  trackingLinks: [],
});
const mockUpdateTrackingLinksMessageId = jest.fn<any>().mockResolvedValue(undefined);
jest.mock('../../../services/TrackingLinkService', () => ({
  TrackingLinkService: jest.fn().mockImplementation(() => ({
    processMessageLinks: (...a: any[]) => mockProcessMessageLinks(...a),
    updateTrackingLinksMessageId: (...a: any[]) => mockUpdateTrackingLinksMessageId(...a),
  })),
}));

const mockAuthMiddleware = jest.fn<any>();
jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: () => mockAuthMiddleware,
  isRegisteredUser: (ctx: any) => ctx?.type === 'registered',
  UnifiedAuthRequest: {},
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  errorResponseSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      error: { type: 'string' },
      message: { type: 'string' },
      code: { type: 'string' },
    },
  },
}));

jest.mock('@meeshy/shared/types/socketio-events', () => ({
  SERVER_EVENTS: { LINK_MESSAGE_NEW: 'link:message-new' },
  ROOMS: { conversation: (id: string) => `conversation:${id}` },
}));

// Post-save language stats: a real singleton driven by a mock prisma would only
// exercise its own error path here. The route's obligation is that it FIRES,
// which is what the double records.
const mockUpdateOnNewMessage = jest.fn<any>().mockResolvedValue(undefined);
jest.mock('../../../services/ConversationStatsService', () => ({
  conversationStatsService: {
    updateOnNewMessage: (...a: any[]) => mockUpdateOnNewMessage(...a),
  },
}));

// Controllable parse mock
const mockParse = jest.fn<any>((body: any) => ({
  content: body?.content ?? 'Hello!',
  originalLanguage: body?.originalLanguage ?? 'fr',
  messageType: body?.messageType ?? 'text',
  clientMessageId: body?.clientMessageId ?? 'cid_test',
}));

// Only `sendMessageSchema.parse` is stubbed (to drive Zod failures); every
// response-shaping constant is the REAL one. A permissive stand-in
// (`additionalProperties: true`) would make fast-json-stringify echo whatever
// the route hands it, so a truncating schema would still look correct here —
// exactly the coincidence the cycle-7 review flagged (D4).
jest.mock('../../../routes/links/types', () => ({
  ...(jest.requireActual('../../../routes/links/types') as Record<string, unknown>),
  sendMessageSchema: { parse: (...a: any[]) => mockParse(...a) },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerMessageRoutes } from '../../../routes/links/messages';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = 'user-abc123';
const MSHY_ID = 'mshy_link_abc123';
const DB_ID = '507f1f77bcf86cd799439055';
const CONV_ID = '507f1f77bcf86cd799439022';
const PART_ID = '507f1f77bcf86cd799439033';
const LINK_DB_ID = '507f1f77bcf86cd799439011';
const MSG_ID = '507f1f77bcf86cd799439044';
const SESSION_TOKEN = 'anon_session_token';

const mockShareLink = {
  id: LINK_DB_ID, linkId: MSHY_ID, conversationId: CONV_ID,
  isActive: true, expiresAt: null, allowAnonymousMessages: true,
  conversation: { id: CONV_ID, identifier: 'some-conv', title: 'Test', type: 'group' },
};

const mockParticipantShareLink = {
  id: LINK_DB_ID, conversationId: CONV_ID,
  isActive: true, allowAnonymousMessages: true, expiresAt: null,
};

const mockAnonParticipant = {
  id: PART_ID, conversationId: CONV_ID, type: 'anonymous',
  displayName: 'anon', language: 'fr',
  sessionTokenHash: 'hashed-' + SESSION_TOKEN,
  isActive: true,
  permissions: { canSendMessages: true, canSendFiles: false },
  anonymousSession: { shareLinkId: LINK_DB_ID },
};

const CID = 'cid_550e8400-e29b-41d4-a716-446655440000';

const mockMessage = {
  id: MSG_ID, content: 'Hello!', originalLanguage: 'fr', messageType: 'text',
  clientMessageId: CID,
  isEdited: false, editedAt: null, deletedAt: null, replyToId: null,
  createdAt: new Date(), updatedAt: new Date(),
  sender: { id: PART_ID, userId: null, displayName: 'anon', avatar: null, type: 'anonymous', language: 'fr', user: null },
};

const mockAuthContext = {
  type: 'registered' as const,
  userId: USER_ID,
  hasFullAccess: true,
  registeredUser: { id: USER_ID, username: 'alice', role: 'USER' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    conversationShareLink: {
      findUnique: jest.fn<any>().mockImplementation(async (opts: any) => {
        if (opts?.where?.id === LINK_DB_ID) return mockParticipantShareLink;
        return mockShareLink;
      }),
    },
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue(mockAnonParticipant),
    },
    message: {
      create: jest.fn<any>().mockResolvedValue(mockMessage),
    },
    conversation: {
      update: jest.fn<any>().mockResolvedValue(undefined),
    },
    ...overrides,
  } as any;
}

function makeTranslationService() {
  return { handleNewMessage: jest.fn<any>().mockResolvedValue({ status: 'queued' }) };
}

function makeSocketIOHandler(hasManager = false) {
  if (!hasManager) {
    return { getManager: () => null, to: jest.fn(), emit: jest.fn(), enqueueOfflineLinkMessage: jest.fn() };
  }
  const emit = jest.fn();
  const to = jest.fn(() => ({ emit }));
  // The manager's offline-queue surface is part of what a link message send
  // must exercise: the room emit only reaches CONNECTED sockets, so without
  // this second call an offline participant never learns the message exists.
  const enqueueOfflineLinkMessage = jest.fn<any>().mockResolvedValue(undefined);
  return {
    getManager: () => ({ getIO: () => ({ to }), enqueueOfflineLinkMessage }),
    to,
    emit,
    enqueueOfflineLinkMessage,
  };
}

async function buildApp(opts: {
  prisma?: any;
  socketIOHandler?: any;
  authContext?: any;
  translationService?: any;
} = {}): Promise<FastifyInstance> {
  const ctx = opts.authContext ?? mockAuthContext;
  mockAuthMiddleware.mockImplementation(async (req: any) => {
    req.authContext = ctx;
  });

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', opts.prisma ?? makePrisma());
  app.decorate('socketIOHandler', opts.socketIOHandler ?? makeSocketIOHandler(false));
  app.decorate(
    'translationService',
    opts.translationService === null ? undefined : opts.translationService ?? makeTranslationService()
  );
  await registerMessageRoutes(app);
  await app.ready();
  return app;
}

/** Les effets post-commit sont fire-and-forget : ils se règlent après le 201. */
const flushPostSaveEffects = () => new Promise((resolve) => setImmediate(resolve));

const VALID_BODY = { content: 'Hello!', clientMessageId: CID };
const ANON_HEADERS = { 'x-session-token': SESSION_TOKEN };

// ═══════════════════════════════════════════════════════════════════════════════
// Anonymous route: POST /links/:identifier/messages
// ═══════════════════════════════════════════════════════════════════════════════

describe('POST /links/:id/messages — anonymous: missing session token header', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 400 when x-session-token header is absent (AJV required header)', async () => {
    const res = await app.inject({ method: 'POST', url: `/links/${MSHY_ID}/messages`, payload: VALID_BODY });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('POST /links/:id/messages — anonymous: empty session token', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 401 when x-session-token is empty string', async () => {
    const res = await app.inject({
      method: 'POST', url: `/links/${MSHY_ID}/messages`,
      headers: { 'x-session-token': '' }, payload: VALID_BODY,
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /links/:id/messages — anonymous: share link not found', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findUnique = jest.fn<any>().mockResolvedValue(null);
    app = await buildApp({ prisma });
  });
  afterAll(async () => { await app.close(); });

  it('returns 404 when share link not found', async () => {
    const res = await app.inject({
      method: 'POST', url: `/links/${MSHY_ID}/messages`,
      headers: ANON_HEADERS, payload: VALID_BODY,
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /links/:id/messages — anonymous: non-mshy_ identifier', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findUnique = jest.fn<any>().mockImplementation(async (opts: any) => {
      if (opts?.where?.id === DB_ID) return mockShareLink;
      if (opts?.where?.id === LINK_DB_ID) return mockParticipantShareLink;
      return null;
    });
    app = await buildApp({ prisma });
  });
  afterAll(async () => { await app.close(); });

  it('returns 201 using db id path (non-mshy_ identifier)', async () => {
    const res = await app.inject({
      method: 'POST', url: `/links/${DB_ID}/messages`,
      headers: ANON_HEADERS, payload: VALID_BODY,
    });
    expect(res.statusCode).toBe(201);
  });
});

describe('POST /links/:id/messages — anonymous: participant not found', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const prisma = makePrisma();
    prisma.participant.findFirst = jest.fn<any>().mockResolvedValue(null);
    app = await buildApp({ prisma });
  });
  afterAll(async () => { await app.close(); });

  it('returns 401 when anonymous participant not found', async () => {
    const res = await app.inject({
      method: 'POST', url: `/links/${MSHY_ID}/messages`,
      headers: ANON_HEADERS, payload: VALID_BODY,
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /links/:id/messages — anonymous: participantShareLink null', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const prisma = makePrisma();
    const anonWithNoShareLink = { ...mockAnonParticipant, anonymousSession: { shareLinkId: null } };
    prisma.participant.findFirst = jest.fn<any>().mockResolvedValue(anonWithNoShareLink);
    app = await buildApp({ prisma });
  });
  afterAll(async () => { await app.close(); });

  it('returns 401 when anonymousSession.shareLinkId is null', async () => {
    const res = await app.inject({
      method: 'POST', url: `/links/${MSHY_ID}/messages`,
      headers: ANON_HEADERS, payload: VALID_BODY,
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /links/:id/messages — anonymous: participantShareLink inactive', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findUnique = jest.fn<any>()
      .mockResolvedValueOnce(mockShareLink)
      .mockResolvedValueOnce({ ...mockParticipantShareLink, isActive: false });
    app = await buildApp({ prisma });
  });
  afterAll(async () => { await app.close(); });

  it('returns 410 when participantShareLink is inactive', async () => {
    const res = await app.inject({
      method: 'POST', url: `/links/${MSHY_ID}/messages`,
      headers: ANON_HEADERS, payload: VALID_BODY,
    });
    expect(res.statusCode).toBe(410);
  });
});

describe('POST /links/:id/messages — anonymous: participantShareLink expired', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findUnique = jest.fn<any>()
      .mockResolvedValueOnce(mockShareLink)
      .mockResolvedValueOnce({ ...mockParticipantShareLink, expiresAt: new Date('2020-01-01') });
    app = await buildApp({ prisma });
  });
  afterAll(async () => { await app.close(); });

  it('returns 410 when participantShareLink has expired', async () => {
    const res = await app.inject({
      method: 'POST', url: `/links/${MSHY_ID}/messages`,
      headers: ANON_HEADERS, payload: VALID_BODY,
    });
    expect(res.statusCode).toBe(410);
  });
});

describe('POST /links/:id/messages — anonymous: allowAnonymousMessages=false', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findUnique = jest.fn<any>()
      .mockResolvedValueOnce(mockShareLink)
      .mockResolvedValueOnce({ ...mockParticipantShareLink, allowAnonymousMessages: false });
    app = await buildApp({ prisma });
  });
  afterAll(async () => { await app.close(); });

  it('returns 403 when anonymous messages not allowed', async () => {
    const res = await app.inject({
      method: 'POST', url: `/links/${MSHY_ID}/messages`,
      headers: ANON_HEADERS, payload: VALID_BODY,
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('POST /links/:id/messages — anonymous: canSendMessages=false', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const prisma = makePrisma();
    prisma.participant.findFirst = jest.fn<any>().mockResolvedValue({
      ...mockAnonParticipant,
      permissions: { canSendMessages: false, canSendFiles: false },
    });
    app = await buildApp({ prisma });
  });
  afterAll(async () => { await app.close(); });

  it('returns 403 when participant canSendMessages is false', async () => {
    const res = await app.inject({
      method: 'POST', url: `/links/${MSHY_ID}/messages`,
      headers: ANON_HEADERS, payload: VALID_BODY,
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('POST /links/:id/messages — anonymous: with tracking links', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('calls updateTrackingLinksMessageId when trackingLinks is non-empty', async () => {
    mockProcessMessageLinks.mockResolvedValueOnce({
      processedContent: 'Hi [tracked]!',
      trackingLinks: [{ token: 'tok-1' }, { token: 'tok-2' }],
    });
    const res = await app.inject({
      method: 'POST', url: `/links/${MSHY_ID}/messages`,
      headers: ANON_HEADERS, payload: VALID_BODY,
    });
    expect(res.statusCode).toBe(201);
    expect(mockUpdateTrackingLinksMessageId).toHaveBeenCalledWith(['tok-1', 'tok-2'], MSG_ID);
  });
});

describe('POST /links/:id/messages — anonymous: originalLanguage canonicalization', () => {
  let app: FastifyInstance;
  let prisma: any;
  beforeAll(async () => { prisma = makePrisma(); app = await buildApp({ prisma }); });
  afterAll(async () => { await app.close(); });

  it('canonicalizes a region-tagged claim at the write boundary', async () => {
    const res = await app.inject({
      method: 'POST', url: `/links/${MSHY_ID}/messages`,
      headers: ANON_HEADERS, payload: { ...VALID_BODY, originalLanguage: 'en-US' },
    });
    expect(res.statusCode).toBe(201);
    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ originalLanguage: 'en' }) })
    );
  });

  it('keeps an irreducible claim verbatim', async () => {
    const res = await app.inject({
      method: 'POST', url: `/links/${MSHY_ID}/messages`,
      headers: ANON_HEADERS, payload: { ...VALID_BODY, originalLanguage: 'bas' },
    });
    expect(res.statusCode).toBe(201);
    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ originalLanguage: 'bas' }) })
    );
  });
});

describe('POST /links/:id/messages — anonymous: socketIO emit', () => {
  let app: FastifyInstance;
  let socketIOHandler: ReturnType<typeof makeSocketIOHandler>;
  beforeAll(async () => {
    socketIOHandler = makeSocketIOHandler(true);
    app = await buildApp({ socketIOHandler });
  });
  afterAll(async () => { await app.close(); });

  it('returns 201 and emits socket event when socketIO manager is available', async () => {
    const res = await app.inject({
      method: 'POST', url: `/links/${MSHY_ID}/messages`,
      headers: ANON_HEADERS, payload: VALID_BODY,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().success).toBe(true);
    expect(res.json().data.messageId).toBe(MSG_ID);
  });

  // Le seul routage dont dispose un client : la charge utile elle-même. Le nom
  // de la room n'est pas transporté par Socket.IO côté réception, donc un
  // message sans `conversationId` est indélivrable — le client ne sait dans
  // quelle conversation l'insérer.
  it('carries the conversationId of the room it was emitted to', () => {
    expect(socketIOHandler.to).toHaveBeenCalledWith(`conversation:${CONV_ID}`);
    const [, payload] = socketIOHandler.emit.mock.calls[0] as [string, { message: Record<string, unknown> }];
    expect(payload.message.conversationId).toBe(CONV_ID);
  });

  it('carries the senderId of the anonymous participant that authored it', () => {
    const [, payload] = socketIOHandler.emit.mock.calls[0] as [string, { message: Record<string, unknown> }];
    expect(payload.message.senderId).toBe(PART_ID);
  });

  // La room ne contient que des sockets CONNECTÉS. Sans cette seconde audience,
  // un participant hors ligne à cet instant n'apprend jamais l'existence du
  // message : `_drainPendingMessages` n'a rien à rejouer à sa reconnexion et le
  // client web ne refetch pas (`staleTime: Infinity`).
  it('queues the message for participants who are offline right now', () => {
    expect(socketIOHandler.enqueueOfflineLinkMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: CONV_ID,
        actorParticipantId: PART_ID,
        messageId: MSG_ID,
      })
    );
  });

  // Le rejeu doit livrer EXACTEMENT ce que les pairs connectés ont reçu : même
  // événement, même charge utile débarrassée du `clientMessageId`. Un rejeu
  // porteur du cid fuiterait l'id optimiste de l'auteur chez un tiers.
  it('queues the same peer payload the live room received, cid stripped', () => {
    const [, live] = socketIOHandler.emit.mock.calls[0] as [string, unknown];
    const [queued] = socketIOHandler.enqueueOfflineLinkMessage.mock.calls[0] as [{ payload: unknown }];
    expect(queued.payload).toEqual(live);
    expect((queued.payload as { message: Record<string, unknown> }).message).not.toHaveProperty('clientMessageId');
  });
});

describe('POST /links/:id/messages — anonymous: ZodError catch', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 400 when body parse throws ZodError', async () => {
    mockParse.mockImplementationOnce(() => {
      throw new z.ZodError([{ code: 'custom', message: 'Invalid', path: ['content'] }]);
    });
    const res = await app.inject({
      method: 'POST', url: `/links/${MSHY_ID}/messages`,
      headers: ANON_HEADERS, payload: VALID_BODY,
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /links/:id/messages — anonymous: DB error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findUnique = jest.fn<any>().mockRejectedValue(new Error('DB failure'));
    app = await buildApp({ prisma });
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on unexpected DB error', async () => {
    const res = await app.inject({
      method: 'POST', url: `/links/${MSHY_ID}/messages`,
      headers: ANON_HEADERS, payload: VALID_BODY,
    });
    expect(res.statusCode).toBe(500);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Auth route: POST /links/:identifier/messages/auth
// ═══════════════════════════════════════════════════════════════════════════════

describe('POST /links/:id/messages/auth — non-registered user', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({
      authContext: { type: 'anonymous', userId: 'anon', hasFullAccess: false, registeredUser: null },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 403 when user is not registered', async () => {
    const res = await app.inject({ method: 'POST', url: `/links/${MSHY_ID}/messages/auth`, payload: VALID_BODY });
    expect(res.statusCode).toBe(403);
  });
});

describe('POST /links/:id/messages/auth — share link not found', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findUnique = jest.fn<any>().mockResolvedValue(null);
    app = await buildApp({ prisma });
  });
  afterAll(async () => { await app.close(); });

  it('returns 404 when share link not found', async () => {
    const res = await app.inject({ method: 'POST', url: `/links/${MSHY_ID}/messages/auth`, payload: VALID_BODY });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /links/:id/messages/auth — non-mshy_ identifier', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findUnique = jest.fn<any>().mockImplementation(async (opts: any) => {
      if (opts?.where?.id === DB_ID) return mockShareLink;
      return null;
    });
    prisma.participant.findFirst = jest.fn<any>().mockResolvedValue({ id: PART_ID, conversationId: CONV_ID });
    app = await buildApp({ prisma });
  });
  afterAll(async () => { await app.close(); });

  it('returns 201 when using db id (non-mshy_ path)', async () => {
    const res = await app.inject({ method: 'POST', url: `/links/${DB_ID}/messages/auth`, payload: VALID_BODY });
    expect(res.statusCode).toBe(201);
  });
});

describe('POST /links/:id/messages/auth — link inactive', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findUnique = jest.fn<any>().mockResolvedValue({ ...mockShareLink, isActive: false });
    app = await buildApp({ prisma });
  });
  afterAll(async () => { await app.close(); });

  it('returns 410 when share link is inactive', async () => {
    const res = await app.inject({ method: 'POST', url: `/links/${MSHY_ID}/messages/auth`, payload: VALID_BODY });
    expect(res.statusCode).toBe(410);
  });
});

describe('POST /links/:id/messages/auth — link expired', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findUnique = jest.fn<any>().mockResolvedValue({
      ...mockShareLink, isActive: true, expiresAt: new Date('2020-01-01'),
    });
    app = await buildApp({ prisma });
  });
  afterAll(async () => { await app.close(); });

  it('returns 410 when share link has expired', async () => {
    const res = await app.inject({ method: 'POST', url: `/links/${MSHY_ID}/messages/auth`, payload: VALID_BODY });
    expect(res.statusCode).toBe(410);
  });
});

describe('POST /links/:id/messages/auth — not a participant', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findUnique = jest.fn<any>().mockResolvedValue(mockShareLink);
    prisma.participant.findFirst = jest.fn<any>().mockResolvedValue(null);
    app = await buildApp({ prisma });
  });
  afterAll(async () => { await app.close(); });

  it('returns 403 when user is not a participant', async () => {
    const res = await app.inject({ method: 'POST', url: `/links/${MSHY_ID}/messages/auth`, payload: VALID_BODY });
    expect(res.statusCode).toBe(403);
  });
});

describe('POST /links/:id/messages/auth — meeshy global conversation auto-join', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findUnique = jest.fn<any>().mockResolvedValue({
      ...mockShareLink, conversation: { id: CONV_ID, identifier: 'meeshy', title: 'Meeshy', type: 'group' },
    });
    prisma.participant.findFirst = jest.fn<any>().mockResolvedValue(null); // not found
    app = await buildApp({ prisma });
  });
  afterAll(async () => { await app.close(); });

  it('returns 201 when meeshy conversation and participant is auto-joined', async () => {
    const res = await app.inject({ method: 'POST', url: `/links/${MSHY_ID}/messages/auth`, payload: VALID_BODY });
    expect(res.statusCode).toBe(201);
  });
});

describe('POST /links/:id/messages/auth — with tracking links', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findUnique = jest.fn<any>().mockResolvedValue(mockShareLink);
    prisma.participant.findFirst = jest.fn<any>().mockResolvedValue({ id: PART_ID, conversationId: CONV_ID });
    app = await buildApp({ prisma });
  });
  afterAll(async () => { await app.close(); });

  it('calls updateTrackingLinksMessageId when trackingLinks is non-empty', async () => {
    mockProcessMessageLinks.mockResolvedValueOnce({
      processedContent: 'Hi [tracked]!',
      trackingLinks: [{ token: 'tok-auth-1' }],
    });
    const res = await app.inject({ method: 'POST', url: `/links/${MSHY_ID}/messages/auth`, payload: VALID_BODY });
    expect(res.statusCode).toBe(201);
    expect(mockUpdateTrackingLinksMessageId).toHaveBeenCalledWith(['tok-auth-1'], MSG_ID);
  });
});

describe('POST /links/:id/messages/auth — socketIO emit', () => {
  let app: FastifyInstance;
  let socketIOHandler: ReturnType<typeof makeSocketIOHandler>;
  beforeAll(async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findUnique = jest.fn<any>().mockResolvedValue(mockShareLink);
    prisma.participant.findFirst = jest.fn<any>().mockResolvedValue({ id: PART_ID, conversationId: CONV_ID });
    socketIOHandler = makeSocketIOHandler(true);
    app = await buildApp({ prisma, socketIOHandler });
  });
  afterAll(async () => { await app.close(); });

  it('returns 201 and emits socket event when socketIO manager is available', async () => {
    const res = await app.inject({ method: 'POST', url: `/links/${MSHY_ID}/messages/auth`, payload: VALID_BODY });
    expect(res.statusCode).toBe(201);
    expect(res.json().success).toBe(true);
  });

  it('carries the conversationId and senderId, exactly like the anonymous twin', () => {
    expect(socketIOHandler.to).toHaveBeenCalledWith(`conversation:${CONV_ID}`);
    const [, payload] = socketIOHandler.emit.mock.calls[0] as [string, { message: Record<string, unknown> }];
    expect(payload.message.conversationId).toBe(CONV_ID);
    expect(payload.message.senderId).toBe(PART_ID);
  });

  // Même garantie hors ligne que le jumeau anonyme : les deux routes servent la
  // même conversation aux mêmes participants, une seule des deux couvrant les
  // pairs déconnectés serait exactement l'asymétrie que le point unique existe
  // pour rendre inécrivable.
  it('queues the message for participants who are offline right now', () => {
    expect(socketIOHandler.enqueueOfflineLinkMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: CONV_ID,
        actorParticipantId: PART_ID,
        messageId: MSG_ID,
      })
    );
  });
});

describe('POST /links/:id/messages/auth — success', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findUnique = jest.fn<any>().mockResolvedValue(mockShareLink);
    prisma.participant.findFirst = jest.fn<any>().mockResolvedValue({ id: PART_ID, conversationId: CONV_ID });
    app = await buildApp({ prisma });
  });
  afterAll(async () => { await app.close(); });

  it('returns 201 with message data', async () => {
    const res = await app.inject({ method: 'POST', url: `/links/${MSHY_ID}/messages/auth`, payload: VALID_BODY });
    expect(res.statusCode).toBe(201);
    expect(res.json().success).toBe(true);
    expect(res.json().data.messageId).toBe(MSG_ID);
  });
});

describe('POST /links/:id/messages/auth — originalLanguage canonicalization', () => {
  let app: FastifyInstance;
  let prisma: any;
  beforeAll(async () => {
    prisma = makePrisma();
    prisma.conversationShareLink.findUnique = jest.fn<any>().mockResolvedValue(mockShareLink);
    prisma.participant.findFirst = jest.fn<any>().mockResolvedValue({ id: PART_ID, conversationId: CONV_ID });
    app = await buildApp({ prisma });
  });
  afterAll(async () => { await app.close(); });

  it('canonicalizes a region-tagged claim at the write boundary', async () => {
    const res = await app.inject({
      method: 'POST', url: `/links/${MSHY_ID}/messages/auth`,
      payload: { ...VALID_BODY, originalLanguage: 'pt-BR' },
    });
    expect(res.statusCode).toBe(201);
    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ originalLanguage: 'pt' }) })
    );
  });
});

describe('POST /links/:id/messages/auth — ZodError catch', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 400 when body parse throws ZodError', async () => {
    mockParse.mockImplementationOnce(() => {
      throw new z.ZodError([{ code: 'custom', message: 'Invalid', path: ['content'] }]);
    });
    const res = await app.inject({ method: 'POST', url: `/links/${MSHY_ID}/messages/auth`, payload: VALID_BODY });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /links/:id/messages/auth — DB error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findUnique = jest.fn<any>().mockRejectedValue(new Error('DB failure'));
    app = await buildApp({ prisma });
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on unexpected DB error', async () => {
    const res = await app.inject({ method: 'POST', url: `/links/${MSHY_ID}/messages/auth`, payload: VALID_BODY });
    expect(res.statusCode).toBe(500);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Language canonicalisation at the write boundary (iteration 219)
// The share-link message-create paths bypass the MessagingService funnel (which
// normalizes `originalLanguage` since iteration 218), so they must canonicalise
// the client-claimed locale themselves before persisting — otherwise a raw
// platform locale (`fr-FR`, `en_US`, `FR`) fragments every downstream consumer
// keyed on `Message.originalLanguage` (NLLB source, translation cache, stats).
// ═══════════════════════════════════════════════════════════════════════════════

describe('POST /links/:id/messages — anonymous: originalLanguage canonicalisation', () => {
  it('normalizes a region-tagged locale (fr-FR) to its canonical code (fr) before persisting', async () => {
    const prisma = makePrisma();
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'POST', url: `/links/${MSHY_ID}/messages`,
      headers: ANON_HEADERS, payload: { ...VALID_BODY, originalLanguage: 'fr-FR' },
    });
    expect(res.statusCode).toBe(201);
    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ originalLanguage: 'fr' }) })
    );
    await app.close();
  });

  it('keeps an irreducible code (bas) verbatim — no data loss', async () => {
    const prisma = makePrisma();
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'POST', url: `/links/${MSHY_ID}/messages`,
      headers: ANON_HEADERS, payload: { ...VALID_BODY, originalLanguage: 'bas' },
    });
    expect(res.statusCode).toBe(201);
    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ originalLanguage: 'bas' }) })
    );
    await app.close();
  });
});

describe('POST /links/:id/messages/auth — authenticated: originalLanguage canonicalisation', () => {
  it('normalizes a region-tagged locale (en_US) to its canonical code (en) before persisting', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findUnique = jest.fn<any>().mockResolvedValue(mockShareLink);
    prisma.participant.findFirst = jest.fn<any>().mockResolvedValue({ id: PART_ID, conversationId: CONV_ID });
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'POST', url: `/links/${MSHY_ID}/messages/auth`,
      payload: { ...VALID_BODY, originalLanguage: 'en_US' },
    });
    expect(res.statusCode).toBe(201);
    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ originalLanguage: 'en' }) })
    );
    await app.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 201 response body contract — what the AUTHOR gets back
//
// The socket payload (asserted above) is what every OTHER participant receives;
// the 201 body is the only thing the author itself sees. The two are built from
// the same message but travel different pipes: the socket emit is raw, while the
// REST body passes through fast-json-stringify, which drops every property the
// response schema does not declare. A field missing from the schema is therefore
// truncated in SILENCE — no error, no log, just an absent key.
// ═══════════════════════════════════════════════════════════════════════════════

const PLACE = { latitude: 48.8566, longitude: 2.3522, name: 'Paris', address: 'Île-de-France', category: 'city' };

function messageBodyOf(res: { json: () => any }): Record<string, any> {
  return res.json().data.message;
}

describe.each([
  {
    label: 'anonymous',
    url: `/links/${MSHY_ID}/messages`,
    headers: ANON_HEADERS,
    prisma: () => makePrisma(),
  },
  {
    label: 'authenticated',
    url: `/links/${MSHY_ID}/messages/auth`,
    headers: {} as Record<string, string>,
    prisma: () => {
      const prisma = makePrisma();
      prisma.conversationShareLink.findUnique = jest.fn<any>().mockResolvedValue(mockShareLink);
      prisma.participant.findFirst = jest.fn<any>().mockResolvedValue({ id: PART_ID, conversationId: CONV_ID });
      return prisma;
    },
  },
])('201 body contract — $label route', ({ url, headers, prisma: makeRoutePrisma }) => {
  async function post(messageOverrides: Record<string, unknown> = {}, body: Record<string, unknown> = {}) {
    const prisma = makeRoutePrisma();
    prisma.message.create = jest.fn<any>().mockResolvedValue({ ...mockMessage, ...messageOverrides });
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'POST', url, headers, payload: { ...VALID_BODY, ...body } });
    await app.close();
    return res;
  }

  it('routes the message it returns: conversationId and senderId are present', async () => {
    const res = await post();
    expect(res.statusCode).toBe(201);
    expect(messageBodyOf(res).conversationId).toBe(CONV_ID);
    expect(messageBodyOf(res).senderId).toBe(PART_ID);
  });

  it('returns the sender the route resolved, not a nulled placeholder', async () => {
    const res = await post();
    expect(messageBodyOf(res).sender).toMatchObject({ id: PART_ID, displayName: 'anon', type: 'anonymous' });
  });

  it('preserves a shared place instead of dropping it on serialization', async () => {
    const res = await post({ metadata: { location: PLACE } }, { location: PLACE });
    expect(messageBodyOf(res).location).toMatchObject({ latitude: PLACE.latitude, longitude: PLACE.longitude, name: 'Paris' });
  });

  it('preserves the edit / delete / reply envelope the route builds', async () => {
    const res = await post({ isEdited: true, editedAt: new Date('2026-08-07T10:00:00.000Z'), replyToId: MSG_ID });
    const message = messageBodyOf(res);
    expect(message.isEdited).toBe(true);
    expect(message.editedAt).toBe('2026-08-07T10:00:00.000Z');
    expect(message.replyToId).toBe(MSG_ID);
    expect(message.updatedAt).toEqual(expect.any(String));
    expect(message).toHaveProperty('deletedAt', null);
  });

  it('echoes the clientMessageId back to the author, so the optimistic row can be reconciled', async () => {
    const res = await post();
    expect(messageBodyOf(res).clientMessageId).toBe(CID);
  });

  it('withholds the clientMessageId from the other participants, exactly like the nominal path', async () => {
    const socketIOHandler = makeSocketIOHandler(true);
    const app = await buildApp({ prisma: makeRoutePrisma(), socketIOHandler });
    await app.inject({ method: 'POST', url, headers, payload: VALID_BODY });
    await app.close();

    const [, emitted] = socketIOHandler.emit.mock.calls[0] as [string, { message: Record<string, unknown> }];
    expect(emitted.message).not.toHaveProperty('clientMessageId');
  });

  it('returns the same message the other participants receive over the socket, modulo the clientMessageId', async () => {
    const socketIOHandler = makeSocketIOHandler(true);
    const prisma = makeRoutePrisma();
    const app = await buildApp({ prisma, socketIOHandler });
    const res = await app.inject({ method: 'POST', url, headers, payload: VALID_BODY });
    await app.close();

    const [, emitted] = socketIOHandler.emit.mock.calls[0] as [string, { message: Record<string, unknown> }];
    const { clientMessageId: _authorOnly, ...sharedWithPeers } = messageBodyOf(res);
    expect(sharedWithPeers).toEqual(JSON.parse(JSON.stringify(emitted.message)));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Post-save obligations (cycle 16)
//
// Les deux routes contournent `MessagingService.handleMessage`, donc RIEN d'autre
// n'exécute ce que tout message committé doit à sa conversation. Sans ces effets :
//   • `Message.translations` reste vide À VIE — le Prisme Linguistique est éteint
//     sur le seul transport d'envoi dont dispose un participant anonyme ;
//   • `Conversation.lastMessageAt` reste périmé, donc `GET /conversations`
//     (`orderBy: { lastMessageAt: 'desc' }` + curseur sur ce même champ) redescend
//     au refetch la conversation que le client venait de remonter.
// ═══════════════════════════════════════════════════════════════════════════════

describe.each([
  {
    label: 'anonymous',
    url: `/links/${MSHY_ID}/messages`,
    headers: ANON_HEADERS,
    prisma: () => makePrisma(),
  },
  {
    label: 'authenticated',
    url: `/links/${MSHY_ID}/messages/auth`,
    headers: {} as Record<string, string>,
    prisma: () => {
      const prisma = makePrisma();
      prisma.conversationShareLink.findUnique = jest.fn<any>().mockResolvedValue(mockShareLink);
      prisma.participant.findFirst = jest.fn<any>().mockResolvedValue({ id: PART_ID, conversationId: CONV_ID });
      return prisma;
    },
  },
])('post-save obligations — $label route', ({ url, headers, prisma: makeRoutePrisma }) => {
  async function post(opts: { prisma?: any; translationService?: any; body?: Record<string, unknown> } = {}) {
    const prisma = opts.prisma ?? makeRoutePrisma();
    const translationService = opts.translationService ?? makeTranslationService();
    const app = await buildApp({ prisma, translationService });
    const res = await app.inject({ method: 'POST', url, headers, payload: { ...VALID_BODY, ...(opts.body ?? {}) } });
    await flushPostSaveEffects();
    await app.close();
    return { res, prisma, translationService };
  }

  it('remonte la conversation : lastMessageAt est bumpé', async () => {
    const { res, prisma } = await post();
    expect(res.statusCode).toBe(201);
    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: CONV_ID },
      data: { lastMessageAt: expect.any(Date) },
    });
  });

  it('pousse le message au translator sous son id persisté', async () => {
    const { translationService } = await post();
    expect(translationService.handleNewMessage).toHaveBeenCalledWith(
      expect.objectContaining({ id: MSG_ID, conversationId: CONV_ID, senderId: PART_ID })
    );
  });

  it('traduit le contenu STOCKÉ (URLs réécrites), pas le corps reçu', async () => {
    mockProcessMessageLinks.mockResolvedValueOnce({
      processedContent: 'Regarde https://mshy.link/t/tok',
      trackingLinks: [],
    });
    const prisma = makeRoutePrisma();
    prisma.message.create = jest.fn<any>().mockResolvedValue({
      ...mockMessage,
      content: 'Regarde https://mshy.link/t/tok',
    });

    const { translationService } = await post({
      prisma,
      body: { content: 'Regarde https://example.com/article' },
    });

    expect(translationService.handleNewMessage).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Regarde https://mshy.link/t/tok' })
    );
  });

  it('pousse la langue source NORMALISÉE, celle qui est persistée', async () => {
    const { translationService } = await post({ body: { originalLanguage: 'pt-BR' } });
    expect(translationService.handleNewMessage).toHaveBeenCalledWith(
      expect.objectContaining({ originalLanguage: 'pt' })
    );
  });

  it('comptabilise le message dans les statistiques de langue', async () => {
    mockUpdateOnNewMessage.mockClear();
    await post({ body: { originalLanguage: 'de' } });
    expect(mockUpdateOnNewMessage).toHaveBeenCalledWith(expect.anything(), CONV_ID, 'de', expect.any(Function));
  });

  it('rend quand même 201 quand le translator est en panne', async () => {
    const { res, prisma } = await post({
      translationService: { handleNewMessage: jest.fn<any>().mockRejectedValue(new Error('ZMQ down')) },
    });
    expect(res.statusCode).toBe(201);
    expect(prisma.conversation.update).toHaveBeenCalled();
  });

  it('rend quand même 201 quand le bump de conversation échoue', async () => {
    const prisma = makeRoutePrisma();
    prisma.conversation.update = jest.fn<any>().mockRejectedValue(new Error('mongo down'));
    const { res, translationService } = await post({ prisma });
    expect(res.statusCode).toBe(201);
    expect(translationService.handleNewMessage).toHaveBeenCalled();
  });

  it('rend quand même 201 quand aucun service de traduction n\'est câblé', async () => {
    const prisma = makeRoutePrisma();
    const app = await buildApp({ prisma, translationService: null });
    const res = await app.inject({ method: 'POST', url, headers, payload: VALID_BODY });
    await flushPostSaveEffects();
    await app.close();

    expect(res.statusCode).toBe(201);
    expect(prisma.conversation.update).toHaveBeenCalled();
  });
});
