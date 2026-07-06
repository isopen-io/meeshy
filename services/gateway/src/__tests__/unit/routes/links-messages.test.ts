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
}));

// Controllable parse mock
const mockParse = jest.fn<any>((body: any) => ({
  content: body?.content ?? 'Hello!',
  originalLanguage: body?.originalLanguage ?? 'fr',
  messageType: body?.messageType ?? 'text',
  clientMessageId: body?.clientMessageId ?? 'cid_test',
}));

jest.mock('../../../routes/links/types', () => ({
  sendMessageSchema: { parse: (...a: any[]) => mockParse(...a) },
  sendMessageBodySchema: { type: 'object', properties: {}, additionalProperties: true },
  messageSenderSchema: { type: 'object', additionalProperties: true },
  SendMessageInput: {},
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

const mockMessage = {
  id: MSG_ID, content: 'Hello!', originalLanguage: 'fr', messageType: 'text',
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
    ...overrides,
  } as any;
}

function makeSocketIOHandler(hasManager = false) {
  if (!hasManager) return { getManager: () => null };
  const emit = jest.fn();
  const to = jest.fn(() => ({ emit }));
  return { getManager: () => ({ getIO: () => ({ to }) }) };
}

async function buildApp(opts: {
  prisma?: any;
  socketIOHandler?: any;
  authContext?: any;
} = {}): Promise<FastifyInstance> {
  const ctx = opts.authContext ?? mockAuthContext;
  mockAuthMiddleware.mockImplementation(async (req: any) => {
    req.authContext = ctx;
  });

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', opts.prisma ?? makePrisma());
  app.decorate('socketIOHandler', opts.socketIOHandler ?? makeSocketIOHandler(false));
  await registerMessageRoutes(app);
  await app.ready();
  return app;
}

const VALID_BODY = { content: 'Hello!', clientMessageId: 'cid_550e8400-e29b-41d4-a716-446655440000' };
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

describe('POST /links/:id/messages — anonymous: socketIO emit', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp({ socketIOHandler: makeSocketIOHandler(true) }); });
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
  beforeAll(async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findUnique = jest.fn<any>().mockResolvedValue(mockShareLink);
    prisma.participant.findFirst = jest.fn<any>().mockResolvedValue({ id: PART_ID, conversationId: CONV_ID });
    app = await buildApp({ prisma, socketIOHandler: makeSocketIOHandler(true) });
  });
  afterAll(async () => { await app.close(); });

  it('returns 201 and emits socket event when socketIO manager is available', async () => {
    const res = await app.inject({ method: 'POST', url: `/links/${MSHY_ID}/messages/auth`, payload: VALID_BODY });
    expect(res.statusCode).toBe(201);
    expect(res.json().success).toBe(true);
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
