/**
 * Extended unit tests for links/messages routes.
 * Covers branches missing from messages.test.ts:
 * - anonymous route: inactive link, expired link, canSendMessages=false, 201 success
 * - auth route: expired link, meeshy conversation path, non-registered user
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));

jest.mock('../../../../utils/session-token', () => ({
  hashSessionToken: jest.fn((token: string) => 'hashed-' + token),
}));

const mockProcessMessageLinks = jest.fn().mockResolvedValue({ processedContent: 'Hi!', trackingLinks: [] } as any);
jest.mock('../../../../services/TrackingLinkService', () => ({
  TrackingLinkService: jest.fn().mockImplementation(() => ({
    processMessageLinks: (...a: any[]) => mockProcessMessageLinks(...a),
    updateTrackingLinksMessageId: jest.fn().mockResolvedValue(undefined),
  })),
}));

const mockAuthMiddleware = jest.fn();
jest.mock('../../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: () => mockAuthMiddleware,
  isRegisteredUser: (ctx: any) => ctx?.type === 'registered',
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  errorResponseSchema: { type: 'object', properties: {} },
}));

jest.mock('@meeshy/shared/types/socketio-events', () => ({
  SERVER_EVENTS: { LINK_MESSAGE_NEW: 'link:message-new' },
}));

jest.mock('../../../../routes/links/types', () => ({
  sendMessageSchema: {
    parse: (body: any) => ({
      content: body.content,
      originalLanguage: body.originalLanguage || 'fr',
      messageType: body.messageType || 'text',
      clientMessageId: body.clientMessageId || 'cid_test',
    }),
  },
  sendMessageBodySchema: { type: 'object', properties: {}, additionalProperties: true },
  messageSenderSchema: { type: 'object', additionalProperties: true },
  SendMessageInput: {},
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerMessageRoutes } from '../../../../routes/links/messages';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = 'user-abc123';
const IDENTIFIER = 'mshy_link_abc123';
const CONV_ID = '507f1f77bcf86cd799439022';
const PART_ID = '507f1f77bcf86cd799439033';
const LINK_DB_ID = '507f1f77bcf86cd799439011';
const MSG_ID = '507f1f77bcf86cd799439044';
const SESSION_TOKEN = 'anon_session_token';

const mockShareLink = {
  id: LINK_DB_ID, linkId: IDENTIFIER, conversationId: CONV_ID,
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
  permissions: { canSendMessages: true, canSendFiles: false, canSendImages: false },
  anonymousSession: { shareLinkId: LINK_DB_ID },
};

const mockMessage = {
  id: MSG_ID, content: 'Hi!', originalLanguage: 'fr', messageType: 'text',
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

// ─── App factory ──────────────────────────────────────────────────────────────

async function buildApp(): Promise<FastifyInstance> {
  mockAuthMiddleware.mockImplementation(async (req: any) => {
    req.authContext = mockAuthContext;
  });

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', {
    conversationShareLink: {
      findUnique: jest.fn().mockImplementation(async (opts: any) => {
        if (opts?.where?.id === LINK_DB_ID) return mockParticipantShareLink;
        return mockShareLink;
      }),
    },
    participant: {
      findFirst: jest.fn().mockResolvedValue(mockAnonParticipant),
    },
    message: {
      create: jest.fn().mockResolvedValue(mockMessage),
    },
  });
  app.decorate('socketIOHandler', { getManager: () => null });
  await registerMessageRoutes(app);
  await app.ready();
  return app;
}

const VALID_BODY = { content: 'Hi!', clientMessageId: 'cid_550e8400-e29b-41d4-a716-446655440000' };
const ANON_HEADERS = { 'x-session-token': SESSION_TOKEN };

// ─── Anonymous route — inactive participantShareLink ─────────────────────────

describe('POST /links/:identifier/messages — inactive participant share link', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 410 when participantShareLink is inactive', async () => {
    (app as any).prisma.conversationShareLink.findUnique
      .mockResolvedValueOnce(mockShareLink)
      .mockResolvedValueOnce({ ...mockParticipantShareLink, isActive: false });
    const res = await app.inject({ method: 'POST', url: `/links/${IDENTIFIER}/messages`, headers: ANON_HEADERS, payload: VALID_BODY });
    expect(res.statusCode).toBe(410);
  });
});

// ─── Anonymous route — expired participantShareLink ───────────────────────────

describe('POST /links/:identifier/messages — expired participant share link', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 410 when participantShareLink has expired', async () => {
    (app as any).prisma.conversationShareLink.findUnique
      .mockResolvedValueOnce(mockShareLink)
      .mockResolvedValueOnce({ ...mockParticipantShareLink, expiresAt: new Date('2020-01-01') });
    const res = await app.inject({ method: 'POST', url: `/links/${IDENTIFIER}/messages`, headers: ANON_HEADERS, payload: VALID_BODY });
    expect(res.statusCode).toBe(410);
  });
});

// ─── Anonymous route — canSendMessages=false ──────────────────────────────────

describe('POST /links/:identifier/messages — canSendMessages=false', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 403 when participant cannot send messages', async () => {
    (app as any).prisma.participant.findFirst.mockResolvedValueOnce({
      ...mockAnonParticipant,
      permissions: { canSendMessages: false },
    });
    const res = await app.inject({ method: 'POST', url: `/links/${IDENTIFIER}/messages`, headers: ANON_HEADERS, payload: VALID_BODY });
    expect(res.statusCode).toBe(403);
  });
});

// ─── Anonymous route — success 201 ───────────────────────────────────────────

describe('POST /links/:identifier/messages — success', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 201 on successful anonymous message send', async () => {
    const res = await app.inject({ method: 'POST', url: `/links/${IDENTIFIER}/messages`, headers: ANON_HEADERS, payload: VALID_BODY });
    expect(res.statusCode).toBe(201);
    expect(res.json().success).toBe(true);
    expect(res.json().data.messageId).toBe(MSG_ID);
  });
});

// ─── Auth route — expired share link ─────────────────────────────────────────

describe('POST /links/:identifier/messages/auth — expired share link', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 410 when share link has expired', async () => {
    (app as any).prisma.conversationShareLink.findUnique.mockResolvedValueOnce({
      ...mockShareLink, isActive: true, expiresAt: new Date('2020-01-01'),
    });
    const res = await app.inject({ method: 'POST', url: `/links/${IDENTIFIER}/messages/auth`, payload: VALID_BODY });
    expect(res.statusCode).toBe(410);
  });
});

// ─── Auth route — meeshy global conversation ──────────────────────────────────

describe('POST /links/:identifier/messages/auth — meeshy global conversation', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('auto-creates participant when conversation is meeshy and participant not found', async () => {
    (app as any).prisma.conversationShareLink.findUnique.mockResolvedValueOnce({
      ...mockShareLink,
      conversation: { id: CONV_ID, identifier: 'meeshy', title: 'Meeshy', type: 'group' },
    });
    (app as any).prisma.participant.findFirst.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'POST', url: `/links/${IDENTIFIER}/messages/auth`, payload: VALID_BODY });
    expect(res.statusCode).toBe(201);
  });
});

// ─── Auth route — non-registered user ────────────────────────────────────────

describe('POST /links/:identifier/messages/auth — non-registered user', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const _app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    mockAuthMiddleware.mockImplementation(async (req: any) => {
      req.authContext = { type: 'anonymous', userId: 'anon', hasFullAccess: false, registeredUser: null };
    });
    _app.decorate('prisma', {
      conversationShareLink: { findUnique: jest.fn().mockResolvedValue(mockShareLink) },
      participant: { findFirst: jest.fn().mockResolvedValue(null) },
      message: { create: jest.fn() },
    });
    _app.decorate('socketIOHandler', { getManager: () => null });
    await registerMessageRoutes(_app);
    await _app.ready();
    app = _app;
  });
  afterAll(async () => { await app.close(); });

  it('returns 403 when auth user is not registered', async () => {
    const res = await app.inject({ method: 'POST', url: `/links/${IDENTIFIER}/messages/auth`, payload: VALID_BODY });
    expect(res.statusCode).toBe(403);
  });
});
