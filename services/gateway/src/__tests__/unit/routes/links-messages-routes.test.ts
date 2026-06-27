/**
 * links-messages-routes.test.ts
 *
 * Unit tests for src/routes/links/messages.ts
 * Covers: POST /links/:identifier/messages (anonymous),
 *         POST /links/:identifier/messages/auth (registered)
 */

import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module mocks (before imports)
// ---------------------------------------------------------------------------

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  errorResponseSchema: { type: 'object', additionalProperties: true },
}));

jest.mock('../../../utils/logger', () => ({
  logError: jest.fn(),
}));

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn(() => async () => {}),
  isRegisteredUser: jest.fn((ctx: any) => ctx?.type === 'registered'),
  UnifiedAuthRequest: {},
}));

jest.mock('@meeshy/shared/types/socketio-events', () => ({
  SERVER_EVENTS: { LINK_MESSAGE_NEW: 'link:message-new' },
}));

jest.mock('@meeshy/shared/utils/client-message-id', () => ({
  CLIENT_MESSAGE_ID_REGEX: /^cid_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
}));

jest.mock('../../../routes/links/types', () => {
  const z = require('zod');
  const CLIENT_MESSAGE_ID_REGEX = /^cid_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const schema = z.object({
    content: z.string().max(1000).optional(),
    clientMessageId: z.string().regex(CLIENT_MESSAGE_ID_REGEX),
    originalLanguage: z.string().default('fr'),
    messageType: z.string().default('text'),
    attachments: z.array(z.string()).optional(),
  }).refine((d: any) => (d.content && d.content.trim().length > 0) || (d.attachments && d.attachments.length > 0));

  return {
    sendMessageSchema: schema,
    sendMessageBodySchema: {
      type: 'object',
      properties: {
        content: { type: 'string' },
        clientMessageId: { type: 'string' },
        originalLanguage: { type: 'string' },
        messageType: { type: 'string' },
        attachments: { type: 'array', items: { type: 'string' } },
      },
    },
    messageSenderSchema: { type: 'object', additionalProperties: true },
  };
});

jest.mock('../../../utils/session-token', () => ({
  hashSessionToken: jest.fn((t: string) => `hashed_${t}`),
}));

const mockProcessMessageLinks = jest.fn<any>();
const mockUpdateTrackingLinksMessageId = jest.fn<any>();
jest.mock('../../../services/TrackingLinkService', () => ({
  TrackingLinkService: jest.fn().mockImplementation(() => ({
    processMessageLinks: (...args: any[]) => mockProcessMessageLinks(...args),
    updateTrackingLinksMessageId: (...args: any[]) => mockUpdateTrackingLinksMessageId(...args),
  })),
}));

// ---------------------------------------------------------------------------
// Import route under test (after mocks)
// ---------------------------------------------------------------------------

import { registerMessageRoutes } from '../../../routes/links/messages';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_ID    = '507f1f77bcf86cd799439011';
const LINK_ID    = 'mshy_507f1f77bcf86cd799439012_abc';
const LINK_DB_ID = '507f1f77bcf86cd799439012';
const CONV_ID    = '507f1f77bcf86cd799439013';
const MSG_ID     = '507f1f77bcf86cd799439014';
const SESSION    = 'my-session-token';
const VALID_CID  = 'cid_550e8400-e29b-4d00-a456-426614174000';

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

const mockConversationShareLink = {
  findUnique: jest.fn<any>(),
};

const mockParticipant = {
  findFirst: jest.fn<any>(),
};

const mockMessage = {
  create: jest.fn<any>(),
};

const mockPrisma: any = {
  conversationShareLink: mockConversationShareLink,
  participant: mockParticipant,
  message: mockMessage,
};

// ---------------------------------------------------------------------------
// App builder
// ---------------------------------------------------------------------------

function buildApp(authContext?: any): FastifyInstance {
  const authModule = require('../../../middleware/auth');
  (authModule.createUnifiedAuthMiddleware as jest.Mock).mockImplementation(() =>
    async (req: any) => {
      req.authContext = authContext ?? {
        type: 'registered',
        registeredUser: { id: USER_ID, role: 'USER' },
        userId: USER_ID,
        hasFullAccess: true,
      };
    }
  );

  const app = Fastify({
    logger: false,
    ajv: { customOptions: { strict: 'log' as const, keywords: ['example'] } },
  });
  app.decorate('prisma', mockPrisma);
  app.decorate('socketIOHandler', { getManager: () => null });
  app.register(registerMessageRoutes);
  return app;
}

function makeShareLink(overrides: any = {}) {
  return {
    id: LINK_DB_ID,
    linkId: LINK_ID,
    conversationId: CONV_ID,
    isActive: true,
    expiresAt: null,
    allowAnonymousMessages: true,
    conversation: { id: CONV_ID, identifier: 'test-conv', title: 'Test', type: 'public' },
    ...overrides,
  };
}

function makeParticipantLink(overrides: any = {}) {
  return {
    id: LINK_DB_ID,
    conversationId: CONV_ID,
    isActive: true,
    allowAnonymousMessages: true,
    expiresAt: null,
    ...overrides,
  };
}

function makeAnonymousParticipant(overrides: any = {}) {
  return {
    id: 'anon-part-1',
    type: 'anonymous',
    isActive: true,
    sessionTokenHash: `hashed_${SESSION}`,
    permissions: { canSendMessages: true },
    anonymousSession: { shareLinkId: LINK_DB_ID },
    ...overrides,
  };
}

function makeCreatedMessage() {
  return {
    id: MSG_ID,
    content: 'Hello',
    originalLanguage: 'en',
    messageType: 'text',
    isEdited: false,
    editedAt: null,
    deletedAt: null,
    replyToId: null,
    createdAt: new Date('2024-01-15T10:00:00Z'),
    updatedAt: new Date('2024-01-15T10:00:00Z'),
    sender: null,
  };
}

function validBody() {
  return { content: 'Hello', clientMessageId: VALID_CID, originalLanguage: 'en', messageType: 'text' };
}

// ---------------------------------------------------------------------------
// POST /links/:identifier/messages  (anonymous route)
// ---------------------------------------------------------------------------

describe('POST /links/:identifier/messages (anonymous)', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    // mockReset clears Once queues and implementations to prevent bleed between tests
    mockConversationShareLink.findUnique.mockReset();
    mockParticipant.findFirst.mockReset();
    mockMessage.create.mockReset();
    mockUpdateTrackingLinksMessageId.mockReset();

    app = buildApp();

    // Happy-path defaults:
    // findUnique is called TWICE in anonymous route:
    //   call 1 → main share link (no 'select')
    //   call 2 → participant's link (has 'select' with specific fields)
    mockConversationShareLink.findUnique.mockImplementation(({ select }: any) =>
      Promise.resolve(select ? makeParticipantLink() : makeShareLink())
    );
    mockParticipant.findFirst.mockResolvedValue(makeAnonymousParticipant());
    mockProcessMessageLinks.mockResolvedValue({ processedContent: 'Hello', trackingLinks: [] });
    mockMessage.create.mockResolvedValue(makeCreatedMessage());
    mockUpdateTrackingLinksMessageId.mockResolvedValue(undefined);
  });

  afterEach(async () => { await app.close(); });

  it('returns 201 when anonymous user sends message via linkId', async () => {
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: `/links/${LINK_ID}/messages`,
      headers: { 'x-session-token': SESSION },
      payload: validBody(),
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
  });

  it('returns 201 when anonymous user sends message via DB id', async () => {
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: `/links/${LINK_DB_ID}/messages`,
      headers: { 'x-session-token': SESSION },
      payload: validBody(),
    });

    expect(res.statusCode).toBe(201);
  });

  it('returns 400 when session token header is missing', async () => {
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: `/links/${LINK_ID}/messages`,
      payload: validBody(),
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 401 when session token is empty string', async () => {
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: `/links/${LINK_ID}/messages`,
      headers: { 'x-session-token': '' },
      payload: validBody(),
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when share link not found', async () => {
    await app.ready();
    mockConversationShareLink.findUnique.mockResolvedValue(null);

    const res = await app.inject({
      method: 'POST',
      url: `/links/${LINK_ID}/messages`,
      headers: { 'x-session-token': SESSION },
      payload: validBody(),
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 401 when anonymous participant not found', async () => {
    await app.ready();
    mockParticipant.findFirst.mockResolvedValue(null);

    const res = await app.inject({
      method: 'POST',
      url: `/links/${LINK_ID}/messages`,
      headers: { 'x-session-token': SESSION },
      payload: validBody(),
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 401 when participant has no shareLinkId', async () => {
    await app.ready();
    mockParticipant.findFirst.mockResolvedValue(makeAnonymousParticipant({ anonymousSession: {} }));

    const res = await app.inject({
      method: 'POST',
      url: `/links/${LINK_ID}/messages`,
      headers: { 'x-session-token': SESSION },
      payload: validBody(),
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 410 when participant share link is inactive', async () => {
    await app.ready();
    mockConversationShareLink.findUnique.mockImplementation(({ select }: any) =>
      Promise.resolve(select ? makeParticipantLink({ isActive: false }) : makeShareLink())
    );

    const res = await app.inject({
      method: 'POST',
      url: `/links/${LINK_ID}/messages`,
      headers: { 'x-session-token': SESSION },
      payload: validBody(),
    });

    expect(res.statusCode).toBe(410);
  });

  it('returns 410 when participant share link has expired', async () => {
    await app.ready();
    mockConversationShareLink.findUnique.mockImplementation(({ select }: any) =>
      Promise.resolve(select ? makeParticipantLink({ expiresAt: new Date('2020-01-01') }) : makeShareLink())
    );

    const res = await app.inject({
      method: 'POST',
      url: `/links/${LINK_ID}/messages`,
      headers: { 'x-session-token': SESSION },
      payload: validBody(),
    });

    expect(res.statusCode).toBe(410);
  });

  it('returns 403 when anonymous messages not allowed', async () => {
    await app.ready();
    mockConversationShareLink.findUnique.mockImplementation(({ select }: any) =>
      Promise.resolve(select ? makeParticipantLink({ allowAnonymousMessages: false }) : makeShareLink())
    );

    const res = await app.inject({
      method: 'POST',
      url: `/links/${LINK_ID}/messages`,
      headers: { 'x-session-token': SESSION },
      payload: validBody(),
    });

    expect(res.statusCode).toBe(403);
  });

  it('returns 403 when participant cannot send messages', async () => {
    await app.ready();
    mockParticipant.findFirst.mockResolvedValue(
      makeAnonymousParticipant({ permissions: { canSendMessages: false } })
    );

    const res = await app.inject({
      method: 'POST',
      url: `/links/${LINK_ID}/messages`,
      headers: { 'x-session-token': SESSION },
      payload: validBody(),
    });

    expect(res.statusCode).toBe(403);
  });

  it('returns 400 when request body fails validation', async () => {
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: `/links/${LINK_ID}/messages`,
      headers: { 'x-session-token': SESSION },
      payload: { clientMessageId: 'bad-format' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('calls processMessageLinks and creates message with processed content', async () => {
    await app.ready();
    mockProcessMessageLinks.mockResolvedValue({ processedContent: 'Processed Hello', trackingLinks: [] });

    await app.inject({
      method: 'POST',
      url: `/links/${LINK_ID}/messages`,
      headers: { 'x-session-token': SESSION },
      payload: validBody(),
    });

    expect(mockProcessMessageLinks).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Hello', conversationId: CONV_ID })
    );
    expect(mockMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ content: 'Processed Hello' }) })
    );
  });

  it('updates tracking links when trackingLinks are returned', async () => {
    await app.ready();
    mockProcessMessageLinks.mockResolvedValue({
      processedContent: 'Hello',
      trackingLinks: [{ token: 'tok1' }],
    });

    await app.inject({
      method: 'POST',
      url: `/links/${LINK_ID}/messages`,
      headers: { 'x-session-token': SESSION },
      payload: validBody(),
    });

    expect(mockUpdateTrackingLinksMessageId).toHaveBeenCalledWith(['tok1'], MSG_ID);
  });

  it('returns 500 on DB error', async () => {
    await app.ready();
    mockConversationShareLink.findUnique.mockRejectedValue(new Error('DB error'));

    const res = await app.inject({
      method: 'POST',
      url: `/links/${LINK_ID}/messages`,
      headers: { 'x-session-token': SESSION },
      payload: validBody(),
    });

    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /links/:identifier/messages/auth  (authenticated route)
// ---------------------------------------------------------------------------

describe('POST /links/:identifier/messages/auth (registered)', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConversationShareLink.findUnique.mockReset();
    mockParticipant.findFirst.mockReset();
    mockMessage.create.mockReset();
    mockUpdateTrackingLinksMessageId.mockReset();

    app = buildApp();

    mockConversationShareLink.findUnique.mockResolvedValue(makeShareLink());
    mockParticipant.findFirst.mockResolvedValue({ id: 'part-1', userId: USER_ID });
    mockProcessMessageLinks.mockResolvedValue({ processedContent: 'Hello', trackingLinks: [] });
    mockMessage.create.mockResolvedValue(makeCreatedMessage());
    mockUpdateTrackingLinksMessageId.mockResolvedValue(undefined);
  });

  afterEach(async () => { await app.close(); });

  it('returns 201 when registered user sends message via linkId', async () => {
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: `/links/${LINK_ID}/messages/auth`,
      payload: validBody(),
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
  });

  it('returns 201 when registered user sends message via DB id', async () => {
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: `/links/${LINK_DB_ID}/messages/auth`,
      payload: validBody(),
    });

    expect(res.statusCode).toBe(201);
  });

  it('returns 403 when auth context is not registered type', async () => {
    const anonApp = buildApp({ type: 'anonymous', anonymousUser: {}, userId: 'anon-1', hasFullAccess: false });
    await anonApp.ready();

    const res = await anonApp.inject({
      method: 'POST',
      url: `/links/${LINK_ID}/messages/auth`,
      payload: validBody(),
    });
    await anonApp.close();

    expect(res.statusCode).toBe(403);
  });

  it('returns 404 when share link not found', async () => {
    await app.ready();
    mockConversationShareLink.findUnique.mockResolvedValue(null);

    const res = await app.inject({
      method: 'POST',
      url: `/links/${LINK_ID}/messages/auth`,
      payload: validBody(),
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 410 when share link is inactive', async () => {
    await app.ready();
    mockConversationShareLink.findUnique.mockResolvedValue(makeShareLink({ isActive: false }));

    const res = await app.inject({
      method: 'POST',
      url: `/links/${LINK_ID}/messages/auth`,
      payload: validBody(),
    });

    expect(res.statusCode).toBe(410);
  });

  it('returns 410 when share link has expired', async () => {
    await app.ready();
    mockConversationShareLink.findUnique.mockResolvedValue(
      makeShareLink({ expiresAt: new Date('2020-01-01') })
    );

    const res = await app.inject({
      method: 'POST',
      url: `/links/${LINK_ID}/messages/auth`,
      payload: validBody(),
    });

    expect(res.statusCode).toBe(410);
  });

  it('returns 403 when user is not a member of the conversation', async () => {
    await app.ready();
    mockParticipant.findFirst.mockResolvedValue(null);

    const res = await app.inject({
      method: 'POST',
      url: `/links/${LINK_ID}/messages/auth`,
      payload: validBody(),
    });

    expect(res.statusCode).toBe(403);
  });

  it('allows meeshy global conversation when user has no participant record', async () => {
    await app.ready();
    mockConversationShareLink.findUnique.mockResolvedValue(
      makeShareLink({ conversation: { id: CONV_ID, identifier: 'meeshy', title: 'Meeshy', type: 'public' } })
    );
    mockParticipant.findFirst.mockResolvedValue(null);

    const res = await app.inject({
      method: 'POST',
      url: `/links/${LINK_ID}/messages/auth`,
      payload: validBody(),
    });

    expect(res.statusCode).toBe(201);
  });

  it('returns 400 on invalid body', async () => {
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: `/links/${LINK_ID}/messages/auth`,
      payload: { clientMessageId: 'not-valid-cid' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('updates tracking links when present', async () => {
    await app.ready();
    mockProcessMessageLinks.mockResolvedValue({
      processedContent: 'Hello',
      trackingLinks: [{ token: 'tok-abc' }],
    });

    await app.inject({
      method: 'POST',
      url: `/links/${LINK_ID}/messages/auth`,
      payload: validBody(),
    });

    expect(mockUpdateTrackingLinksMessageId).toHaveBeenCalledWith(['tok-abc'], MSG_ID);
  });

  it('returns 500 on DB error', async () => {
    await app.ready();
    mockConversationShareLink.findUnique.mockRejectedValue(new Error('DB error'));

    const res = await app.inject({
      method: 'POST',
      url: `/links/${LINK_ID}/messages/auth`,
      payload: validBody(),
    });

    expect(res.statusCode).toBe(500);
  });
});
