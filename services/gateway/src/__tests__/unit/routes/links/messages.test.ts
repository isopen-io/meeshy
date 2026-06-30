/**
 * Unit tests for links/messages routes
 * Tests POST /links/:identifier/messages (anonymous) and
 * POST /links/:identifier/messages/auth (authenticated).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));

jest.mock('../../../../utils/session-token', () => ({
  hashSessionToken: jest.fn((token) => 'hashed-' + token),
}));

const mockProcessMessageLinks = jest.fn().mockResolvedValue({ processedContent: 'Hello!', trackingLinks: [] } as any);
const mockUpdateTrackingLinks = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../../services/TrackingLinkService', () => ({
  TrackingLinkService: jest.fn().mockImplementation(() => ({
    processMessageLinks: (...args: any[]) => mockProcessMessageLinks(...args),
    updateTrackingLinksMessageId: (...args: any[]) => mockUpdateTrackingLinks(...args),
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
  sendMessageSchema: { parse: (body: any) => ({ content: body.content, originalLanguage: body.originalLanguage || 'fr', messageType: body.messageType || 'text', clientMessageId: body.clientMessageId || 'cid_test', attachments: body.attachments }) },
  sendMessageBodySchema: { type: 'object', properties: {}, additionalProperties: true },
  messageSenderSchema: { type: 'object', additionalProperties: true },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerMessageRoutes } from '../../../../routes/links/messages';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = 'user-abc123';
const IDENTIFIER = 'mshy_link_abc123';
const CONV_ID = '507f1f77bcf86cd799439022';
const PART_ID = '507f1f77bcf86cd799439033';
const SESSION_TOKEN = 'anon_session_token';
const MSG_ID = '507f1f77bcf86cd799439044';

const mockShareLink = {
  id: '507f1f77bcf86cd799439011',
  linkId: IDENTIFIER,
  conversationId: CONV_ID,
  isActive: true,
  expiresAt: null,
  allowAnonymousMessages: true,
  conversation: { id: CONV_ID, identifier: 'some-conv', title: 'Test', type: 'group' },
};

const mockAnonParticipant = {
  id: PART_ID,
  conversationId: CONV_ID,
  type: 'anonymous',
  displayName: 'anon',
  language: 'fr',
  sessionTokenHash: 'hashed-' + SESSION_TOKEN,
  isActive: true,
  permissions: { canSendMessages: true, canSendFiles: false, canSendImages: false },
  anonymousSession: { shareLinkId: '507f1f77bcf86cd799439011' },
};

const mockParticipantShareLink = {
  id: '507f1f77bcf86cd799439011',
  conversationId: CONV_ID,
  isActive: true,
  allowAnonymousMessages: true,
  expiresAt: null,
};

const mockMessage = {
  id: MSG_ID,
  content: 'Hello!',
  originalLanguage: 'fr',
  messageType: 'text',
  isEdited: false,
  editedAt: null,
  deletedAt: null,
  replyToId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  sender: { id: PART_ID, userId: null, displayName: 'anon', avatar: null, type: 'anonymous', language: 'fr', user: null },
};

const mockAuthContext = {
  type: 'registered' as const,
  userId: USER_ID,
  hasFullAccess: true,
  registeredUser: { id: USER_ID, username: 'alice', firstName: 'Alice', lastName: 'Smith', displayName: 'Alice Smith', avatar: null, role: 'USER' },
};

// ─── App factory ──────────────────────────────────────────────────────────────

async function buildApp(): Promise<FastifyInstance> {
  mockAuthMiddleware.mockImplementation(async (req: any) => {
    req.authContext = mockAuthContext;
  });

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', {
    conversationShareLink: {
      findUnique: jest.fn().mockResolvedValue(mockShareLink),
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

const VALID_BODY = { content: 'Hello!', clientMessageId: 'cid_550e8400-e29b-41d4-a716-446655440000' };

// ─── POST /links/:identifier/messages (anonymous) ────────────────────────────

describe('POST /links/:identifier/messages — anonymous', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp();
    (app as any).prisma.conversationShareLink.findUnique.mockResolvedValue(mockShareLink);
    (app as any).prisma.participant.findFirst.mockResolvedValue(mockAnonParticipant);
    (app as any).prisma.conversationShareLink.findUnique.mockImplementation(async (opts: any) => {
      if (opts?.where?.id === mockAnonParticipant.anonymousSession.shareLinkId) return mockParticipantShareLink;
      return mockShareLink;
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 400 when session token missing (schema validation)', async () => {
    const res = await app.inject({ method: 'POST', url: '/links/' + IDENTIFIER + '/messages', payload: VALID_BODY });
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when share link not found', async () => {
    (app as any).prisma.conversationShareLink.findUnique.mockResolvedValueOnce(null);
    const res = await app.inject({
      method: 'POST', url: '/links/' + IDENTIFIER + '/messages',
      headers: { 'x-session-token': SESSION_TOKEN },
      payload: VALID_BODY,
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 401 when anonymous participant not found', async () => {
    (app as any).prisma.conversationShareLink.findUnique.mockResolvedValueOnce(mockShareLink);
    (app as any).prisma.participant.findFirst.mockResolvedValueOnce(null);
    const res = await app.inject({
      method: 'POST', url: '/links/' + IDENTIFIER + '/messages',
      headers: { 'x-session-token': SESSION_TOKEN },
      payload: VALID_BODY,
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 when anonymous messages not allowed', async () => {
    (app as any).prisma.conversationShareLink.findUnique.mockImplementationOnce(async () => mockShareLink)
      .mockImplementationOnce(async () => ({ ...mockParticipantShareLink, allowAnonymousMessages: false }));
    (app as any).prisma.participant.findFirst.mockResolvedValueOnce(mockAnonParticipant);
    const res = await app.inject({
      method: 'POST', url: '/links/' + IDENTIFIER + '/messages',
      headers: { 'x-session-token': SESSION_TOKEN },
      payload: VALID_BODY,
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 500 on service error', async () => {
    (app as any).prisma.conversationShareLink.findUnique.mockRejectedValueOnce(new Error('DB'));
    const res = await app.inject({
      method: 'POST', url: '/links/' + IDENTIFIER + '/messages',
      headers: { 'x-session-token': SESSION_TOKEN },
      payload: VALID_BODY,
    });
    expect(res.statusCode).toBe(500);
  });
});

// ─── POST /links/:identifier/messages/auth (authenticated) ───────────────────

describe('POST /links/:identifier/messages/auth — authenticated', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp();
    (app as any).prisma.conversationShareLink.findUnique.mockResolvedValue(mockShareLink);
    (app as any).prisma.participant.findFirst.mockResolvedValue({ id: PART_ID, conversationId: CONV_ID });
  });
  afterAll(async () => { await app.close(); });

  it('returns 404 when share link not found', async () => {
    (app as any).prisma.conversationShareLink.findUnique.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'POST', url: '/links/' + IDENTIFIER + '/messages/auth', payload: VALID_BODY });
    expect(res.statusCode).toBe(404);
  });

  it('returns 410 when share link is inactive', async () => {
    (app as any).prisma.conversationShareLink.findUnique.mockResolvedValueOnce({ ...mockShareLink, isActive: false });
    const res = await app.inject({ method: 'POST', url: '/links/' + IDENTIFIER + '/messages/auth', payload: VALID_BODY });
    expect(res.statusCode).toBe(410);
  });

  it('returns 403 when user is not a participant', async () => {
    (app as any).prisma.participant.findFirst.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'POST', url: '/links/' + IDENTIFIER + '/messages/auth', payload: VALID_BODY });
    expect(res.statusCode).toBe(403);
  });

  it('returns 201 on successful message send', async () => {
    const res = await app.inject({ method: 'POST', url: '/links/' + IDENTIFIER + '/messages/auth', payload: VALID_BODY });
    expect(res.statusCode).toBe(201);
    expect(res.json().success).toBe(true);
  });

  it('returns 500 on service error', async () => {
    (app as any).prisma.conversationShareLink.findUnique.mockRejectedValueOnce(new Error('DB'));
    const res = await app.inject({ method: 'POST', url: '/links/' + IDENTIFIER + '/messages/auth', payload: VALID_BODY });
    expect(res.statusCode).toBe(500);
  });
});
