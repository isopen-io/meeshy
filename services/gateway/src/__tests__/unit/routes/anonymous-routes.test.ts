/**
 * anonymous-routes.test.ts
 *
 * Unit tests for src/routes/anonymous.ts
 * Covers:
 *   POST  /anonymous/join/:linkId
 *   POST  /anonymous/refresh
 *   POST  /anonymous/leave
 *   GET   /anonymous/link/:identifier
 */

// ---------------------------------------------------------------------------
// Module mocks (BEFORE imports)
// ---------------------------------------------------------------------------

jest.mock('../../../utils/logger', () => ({
  logError: jest.fn(),
  logWarn: jest.fn(),
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  errorResponseSchema:          { type: 'object', additionalProperties: true },
  anonymousParticipantSchema:   { type: 'object', additionalProperties: true },
  conversationLinkSchema:       { type: 'object', additionalProperties: true },
  conversationMinimalSchema:    { type: 'object', additionalProperties: true },
  userMinimalSchema:            { type: 'object', additionalProperties: true },
}));

// The route does `await import('../utils/session-token')` dynamically.
// We mock the whole module so hashSessionToken always returns a stable value.
jest.mock('../../../utils/session-token', () => ({
  hashSessionToken: jest.fn((token: string) => `hash:${token}`),
  generateSessionToken: jest.fn(() => 'anon_mocked_session_token'),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { anonymousRoutes } from '../../../routes/anonymous';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LINK_DB_ID    = '507f1f77bcf86cd799439001';
const CONV_ID       = '507f1f77bcf86cd799439002';
const CREATOR_ID    = '507f1f77bcf86cd799439003';
const PARTICIPANT_ID = '507f1f77bcf86cd799439004';
const LINK_ID_STR   = 'mshy_test123';

// ---------------------------------------------------------------------------
// Mock Prisma models
// ---------------------------------------------------------------------------

const mockShareLink = {
  findFirst:  jest.fn<any>(),
  findUnique: jest.fn<any>(),
  update:     jest.fn<any>().mockResolvedValue({}),
};

const mockParticipant = {
  findFirst: jest.fn<any>(),
  findUnique: jest.fn<any>(),
  create:    jest.fn<any>(),
  update:    jest.fn<any>().mockResolvedValue({}),
  count:     jest.fn<any>().mockResolvedValue(0),
  findMany:  jest.fn<any>().mockResolvedValue([]),
};

const mockUser = {
  findFirst: jest.fn<any>(),
};

const mockPrisma: any = {
  conversationShareLink: mockShareLink,
  participant:           mockParticipant,
  user:                  mockUser,
};

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

function makeShareLink(overrides: Record<string, unknown> = {}) {
  return {
    id: LINK_DB_ID,
    linkId: LINK_ID_STR,
    identifier: 'test123',
    conversationId: CONV_ID,
    isActive: true,
    expiresAt: null,
    maxUses: null,
    currentUses: 0,
    maxConcurrentUsers: null,
    currentConcurrentUsers: 0,
    allowedCountries: [] as string[],
    allowedLanguages: [] as string[],
    allowedIpRanges: [] as string[],
    requireAccount: false,
    requireEmail: false,
    requireBirthday: false,
    requireNickname: false,
    allowAnonymousMessages: true,
    allowAnonymousFiles: false,
    allowAnonymousImages: false,
    allowViewHistory: false,
    name: 'Test Link',
    description: null,
    maxUses2: null,
    currentUniqueSessions: 0,
    conversation: {
      id: CONV_ID,
      title: 'Test Conversation',
      type: 'group',
    },
    creator: {
      id: CREATOR_ID,
      username: 'creator',
      firstName: 'Creator',
      lastName: 'User',
      displayName: 'Creator',
      avatar: null,
    },
    ...overrides,
  };
}

function makeParticipant(overrides: Record<string, unknown> = {}) {
  return {
    id: PARTICIPANT_ID,
    conversationId: CONV_ID,
    type: 'anonymous',
    displayName: 'testuser_ab001',
    language: 'fr',
    avatar: null,
    isActive: true,
    isOnline: false,
    sessionTokenHash: 'hash:anon_mocked_session_token',
    permissions: {
      canSendMessages: true,
      canSendFiles: false,
      canSendImages: false,
    },
    anonymousSession: {
      shareLinkId: LINK_DB_ID,
      profile: {
        firstName: 'Test',
        lastName: 'User',
        username: 'testuser_ab001',
        email: null,
        birthday: null,
      },
      session: {
        ipAddress: '127.0.0.1',
        country: 'FR',
      },
    },
    ...overrides,
  };
}

const VALID_JOIN_BODY = {
  firstName: 'Test',
  lastName: 'User',
  language: 'fr',
};

// ---------------------------------------------------------------------------
// App builder
// ---------------------------------------------------------------------------

function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate('prisma', mockPrisma);
  app.register(anonymousRoutes);
  return app;
}

// ===========================================================================
// POST /anonymous/join/:linkId
// ===========================================================================

describe('POST /anonymous/join/:linkId', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockShareLink.update.mockResolvedValue({});
    mockParticipant.update.mockResolvedValue({});
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 201 with sessionToken and participant on happy path', async () => {
    await app.ready();

    mockShareLink.findFirst.mockResolvedValue(makeShareLink());
    mockUser.findFirst.mockResolvedValue(null);               // username not taken
    mockParticipant.findFirst.mockResolvedValue(null);        // no conflict in conversation
    mockParticipant.create.mockResolvedValue(makeParticipant());

    const res = await app.inject({
      method: 'POST',
      url: `/anonymous/join/${LINK_ID_STR}`,
      payload: VALID_JOIN_BODY,
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.sessionToken).toBeDefined();
    expect(body.data.participant.id).toBe(PARTICIPANT_ID);
    expect(body.data.conversation.id).toBe(CONV_ID);
    expect(mockShareLink.update).toHaveBeenCalled();
  });

  it('returns 404 when share link does not exist', async () => {
    await app.ready();

    mockShareLink.findFirst.mockResolvedValue(null);

    const res = await app.inject({
      method: 'POST',
      url: '/anonymous/join/nonexistent_link',
      payload: VALID_JOIN_BODY,
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
  });

  it('returns 410 when link is inactive', async () => {
    await app.ready();

    mockShareLink.findFirst.mockResolvedValue(makeShareLink({ isActive: false }));

    const res = await app.inject({
      method: 'POST',
      url: `/anonymous/join/${LINK_ID_STR}`,
      payload: VALID_JOIN_BODY,
    });

    expect(res.statusCode).toBe(410);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
  });

  it('returns 410 when link is expired', async () => {
    await app.ready();

    const pastDate = new Date(Date.now() - 1000 * 60 * 60);
    mockShareLink.findFirst.mockResolvedValue(makeShareLink({ expiresAt: pastDate }));

    const res = await app.inject({
      method: 'POST',
      url: `/anonymous/join/${LINK_ID_STR}`,
      payload: VALID_JOIN_BODY,
    });

    expect(res.statusCode).toBe(410);
  });

  it('returns 410 when max uses reached', async () => {
    await app.ready();

    mockShareLink.findFirst.mockResolvedValue(makeShareLink({ maxUses: 10, currentUses: 10 }));

    const res = await app.inject({
      method: 'POST',
      url: `/anonymous/join/${LINK_ID_STR}`,
      payload: VALID_JOIN_BODY,
    });

    expect(res.statusCode).toBe(410);
  });

  it('returns 429 when max concurrent users reached', async () => {
    await app.ready();

    mockShareLink.findFirst.mockResolvedValue(makeShareLink({ maxConcurrentUsers: 5, currentConcurrentUsers: 5 }));

    const res = await app.inject({
      method: 'POST',
      url: `/anonymous/join/${LINK_ID_STR}`,
      payload: VALID_JOIN_BODY,
    });

    expect(res.statusCode).toBe(429);
  });

  it('returns 403 when requireAccount is true (anonymous not allowed)', async () => {
    await app.ready();

    mockShareLink.findFirst.mockResolvedValue(makeShareLink({ requireAccount: true }));

    const res = await app.inject({
      method: 'POST',
      url: `/anonymous/join/${LINK_ID_STR}`,
      payload: VALID_JOIN_BODY,
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.requiresAccount).toBe(true);
  });

  it('returns 400 when email is required but not provided', async () => {
    await app.ready();

    mockShareLink.findFirst.mockResolvedValue(makeShareLink({ requireEmail: true }));

    const res = await app.inject({
      method: 'POST',
      url: `/anonymous/join/${LINK_ID_STR}`,
      payload: VALID_JOIN_BODY, // no email
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
  });

  it('returns 400 when birthday is required but not provided', async () => {
    await app.ready();

    mockShareLink.findFirst.mockResolvedValue(makeShareLink({ requireBirthday: true }));

    const res = await app.inject({
      method: 'POST',
      url: `/anonymous/join/${LINK_ID_STR}`,
      payload: VALID_JOIN_BODY, // no birthday
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when nickname required but not provided', async () => {
    await app.ready();

    mockShareLink.findFirst.mockResolvedValue(makeShareLink({ requireNickname: true }));

    const res = await app.inject({
      method: 'POST',
      url: `/anonymous/join/${LINK_ID_STR}`,
      payload: VALID_JOIN_BODY, // no username
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 403 when client IP country is not in allowedCountries', async () => {
    await app.ready();

    mockShareLink.findFirst.mockResolvedValue(makeShareLink({ allowedCountries: ['US', 'GB'] }));

    const res = await app.inject({
      method: 'POST',
      url: `/anonymous/join/${LINK_ID_STR}`,
      headers: { 'x-forwarded-for': '127.0.0.1' }, // resolves to FR
      payload: VALID_JOIN_BODY,
    });

    expect(res.statusCode).toBe(403);
  });

  it('returns 403 when request language not in allowedLanguages', async () => {
    await app.ready();

    mockShareLink.findFirst.mockResolvedValue(makeShareLink({ allowedLanguages: ['en', 'de'] }));

    const res = await app.inject({
      method: 'POST',
      url: `/anonymous/join/${LINK_ID_STR}`,
      payload: { ...VALID_JOIN_BODY, language: 'fr' }, // fr not allowed
    });

    expect(res.statusCode).toBe(403);
  });

  it('returns 409 when username already taken by registered user', async () => {
    await app.ready();

    mockShareLink.findFirst.mockResolvedValue(makeShareLink());
    mockUser.findFirst
      .mockResolvedValueOnce({ id: 'existing_user_id' }) // username taken
      .mockResolvedValue(null);                          // suggestion available

    const res = await app.inject({
      method: 'POST',
      url: `/anonymous/join/${LINK_ID_STR}`,
      payload: { ...VALID_JOIN_BODY, username: 'takenuser' },
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.suggestedNickname).toBeDefined();
  });

  it('returns 400 when firstName is missing (zod validation fails)', async () => {
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: `/anonymous/join/${LINK_ID_STR}`,
      payload: { lastName: 'User', language: 'fr' }, // no firstName
    });

    // The zod schema requires firstName; the catch block returns 400 via sendBadRequest.
    // Fastify's JSON schema also declares firstName as required and may reject first
    // with its own 400 response (no success field). Either way we expect a 400.
    expect(res.statusCode).toBe(400);
  });

  it('returns 500 on DB error during share link lookup', async () => {
    await app.ready();

    mockShareLink.findFirst.mockRejectedValue(new Error('DB timeout'));

    const res = await app.inject({
      method: 'POST',
      url: `/anonymous/join/${LINK_ID_STR}`,
      payload: VALID_JOIN_BODY,
    });

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
  });
});

// ===========================================================================
// POST /anonymous/refresh
// ===========================================================================

describe('POST /anonymous/refresh', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockParticipant.update.mockResolvedValue({});
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with participant and conversation on happy path', async () => {
    await app.ready();

    const participant = makeParticipant();
    const shareLink = {
      ...makeShareLink(),
      conversation: { id: CONV_ID, title: 'Test Conversation', type: 'group' },
    };

    mockParticipant.findFirst.mockResolvedValue(participant);
    mockShareLink.findUnique.mockResolvedValue(shareLink);

    const res = await app.inject({
      method: 'POST',
      url: '/anonymous/refresh',
      payload: { sessionToken: 'anon_some_valid_token' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.participant.id).toBe(PARTICIPANT_ID);
    expect(body.data.conversation.id).toBe(CONV_ID);
    expect(mockParticipant.update).toHaveBeenCalled();
  });

  it('returns 401 when session token does not match any participant', async () => {
    await app.ready();

    mockParticipant.findFirst.mockResolvedValue(null);

    const res = await app.inject({
      method: 'POST',
      url: '/anonymous/refresh',
      payload: { sessionToken: 'invalid_token' },
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
  });

  it('returns 401 when participant is inactive', async () => {
    await app.ready();

    mockParticipant.findFirst.mockResolvedValue(makeParticipant({ isActive: false }));

    const res = await app.inject({
      method: 'POST',
      url: '/anonymous/refresh',
      payload: { sessionToken: 'some_token' },
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 410 when share link has been deactivated', async () => {
    await app.ready();

    mockParticipant.findFirst.mockResolvedValue(makeParticipant());
    mockShareLink.findUnique.mockResolvedValue(null);

    const res = await app.inject({
      method: 'POST',
      url: '/anonymous/refresh',
      payload: { sessionToken: 'some_token' },
    });

    expect(res.statusCode).toBe(410);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
  });

  it('returns 410 when share link is inactive', async () => {
    await app.ready();

    mockParticipant.findFirst.mockResolvedValue(makeParticipant());
    mockShareLink.findUnique.mockResolvedValue({
      ...makeShareLink({ isActive: false }),
      conversation: { id: CONV_ID, title: 'T', type: 'group' },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/anonymous/refresh',
      payload: { sessionToken: 'some_token' },
    });

    expect(res.statusCode).toBe(410);
  });

  it('returns 410 when share link has expired', async () => {
    await app.ready();

    const pastDate = new Date(Date.now() - 1000 * 60 * 60);
    mockParticipant.findFirst.mockResolvedValue(makeParticipant());
    mockShareLink.findUnique.mockResolvedValue({
      ...makeShareLink({ expiresAt: pastDate }),
      conversation: { id: CONV_ID, title: 'T', type: 'group' },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/anonymous/refresh',
      payload: { sessionToken: 'some_token' },
    });

    expect(res.statusCode).toBe(410);
  });

  it('returns 400 when sessionToken is missing', async () => {
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/anonymous/refresh',
      payload: {},
    });

    // Fastify JSON schema declares sessionToken as required → returns 400
    // before the zod parse in the handler even runs.
    expect(res.statusCode).toBe(400);
  });

  it('returns 500 on DB error', async () => {
    await app.ready();

    mockParticipant.findFirst.mockRejectedValue(new Error('DB error'));

    const res = await app.inject({
      method: 'POST',
      url: '/anonymous/refresh',
      payload: { sessionToken: 'some_token' },
    });

    expect(res.statusCode).toBe(500);
  });
});

// ===========================================================================
// POST /anonymous/leave
// ===========================================================================

describe('POST /anonymous/leave', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockParticipant.update.mockResolvedValue({});
    mockShareLink.update.mockResolvedValue({});
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 when session is closed successfully', async () => {
    await app.ready();

    const participant = makeParticipant();
    mockParticipant.findFirst.mockResolvedValue(participant);

    const res = await app.inject({
      method: 'POST',
      url: '/anonymous/leave',
      payload: { sessionToken: 'anon_some_valid_token' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.message).toBeDefined();
    expect(mockParticipant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: PARTICIPANT_ID },
        data: expect.objectContaining({ isActive: false, isOnline: false }),
      })
    );
  });

  it('decrements concurrent user counter on the share link', async () => {
    await app.ready();

    const participant = makeParticipant();
    mockParticipant.findFirst.mockResolvedValue(participant);

    await app.inject({
      method: 'POST',
      url: '/anonymous/leave',
      payload: { sessionToken: 'anon_some_valid_token' },
    });

    expect(mockShareLink.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: LINK_DB_ID },
        data: expect.objectContaining({ currentConcurrentUsers: { decrement: 1 } }),
      })
    );
  });

  it('returns 404 when session token not found', async () => {
    await app.ready();

    mockParticipant.findFirst.mockResolvedValue(null);

    const res = await app.inject({
      method: 'POST',
      url: '/anonymous/leave',
      payload: { sessionToken: 'invalid_token' },
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
  });

  it('returns 500 on DB error', async () => {
    await app.ready();

    mockParticipant.findFirst.mockRejectedValue(new Error('DB error'));

    const res = await app.inject({
      method: 'POST',
      url: '/anonymous/leave',
      payload: { sessionToken: 'some_token' },
    });

    expect(res.statusCode).toBe(500);
  });
});

// ===========================================================================
// GET /anonymous/link/:identifier
// ===========================================================================

describe('GET /anonymous/link/:identifier', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockParticipant.count.mockResolvedValue(0);
    mockParticipant.findMany.mockResolvedValue([]);
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with full link info when identifier starts with mshy_', async () => {
    await app.ready();

    const shareLink = {
      ...makeShareLink(),
      conversation: {
        id: CONV_ID,
        title: 'Test Conv',
        description: null,
        type: 'group',
        createdAt: new Date().toISOString(),
      },
      creator: {
        id: CREATOR_ID,
        username: 'creator',
        firstName: 'Creator',
        lastName: 'User',
        displayName: 'Creator',
        avatar: null,
      },
    };

    mockShareLink.findUnique.mockResolvedValue(shareLink);
    mockParticipant.count.mockResolvedValue(2);
    mockParticipant.findMany.mockResolvedValue([
      { type: 'user', language: 'fr', user: { systemLanguage: 'fr', regionalLanguage: null, customDestinationLanguage: null } },
      { type: 'anonymous', language: 'en', user: null },
    ]);

    const res = await app.inject({
      method: 'GET',
      url: `/anonymous/link/${LINK_ID_STR}`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(LINK_DB_ID);
    expect(body.data.linkId).toBe(LINK_ID_STR);
    expect(body.data.stats).toBeDefined();
    expect(body.data.stats.totalParticipants).toBeDefined();
    expect(body.data.stats.spokenLanguages).toBeInstanceOf(Array);
  });

  it('returns 200 with link info when identifier is a 24-char ObjectId', async () => {
    await app.ready();

    const shareLink = {
      ...makeShareLink(),
      conversation: {
        id: CONV_ID,
        title: 'Test Conv',
        description: null,
        type: 'group',
        createdAt: new Date().toISOString(),
      },
      creator: {
        id: CREATOR_ID,
        username: 'creator',
        firstName: 'Creator',
        lastName: 'User',
        displayName: 'Creator',
        avatar: null,
      },
    };

    // For ObjectId path: resolveShareLinkId finds it directly, then findUnique is called
    mockShareLink.findUnique.mockResolvedValue(shareLink);
    mockParticipant.count.mockResolvedValue(0);
    mockParticipant.findMany.mockResolvedValue([]);

    const res = await app.inject({
      method: 'GET',
      url: `/anonymous/link/${LINK_DB_ID}`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(LINK_DB_ID);
  });

  it('returns 200 with link info when identifier is a non-ObjectId string (uses findFirst)', async () => {
    await app.ready();

    const shareLink = {
      ...makeShareLink(),
      conversation: {
        id: CONV_ID,
        title: 'Test Conv',
        description: null,
        type: 'group',
        createdAt: new Date().toISOString(),
      },
      creator: {
        id: CREATOR_ID,
        username: 'creator',
        firstName: 'Creator',
        lastName: 'User',
        displayName: 'Creator',
        avatar: null,
      },
    };

    // resolveShareLinkId path: findFirst to look up by identifier field
    mockShareLink.findFirst.mockResolvedValue({ id: LINK_DB_ID });
    mockShareLink.findUnique.mockResolvedValue(shareLink);
    mockParticipant.count.mockResolvedValue(0);
    mockParticipant.findMany.mockResolvedValue([]);

    const res = await app.inject({
      method: 'GET',
      url: '/anonymous/link/some-custom-identifier',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
  });

  it('returns 404 when link does not exist (mshy_ prefix)', async () => {
    await app.ready();

    mockShareLink.findUnique.mockResolvedValue(null);

    const res = await app.inject({
      method: 'GET',
      url: '/anonymous/link/mshy_nonexistent',
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
  });

  it('returns 404 when identifier lookup fails (custom identifier not found)', async () => {
    await app.ready();

    // resolveShareLinkId returns null → 404
    mockShareLink.findFirst.mockResolvedValue(null);

    const res = await app.inject({
      method: 'GET',
      url: '/anonymous/link/unknown-identifier',
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
  });

  it('returns 410 when link is inactive', async () => {
    await app.ready();

    mockShareLink.findUnique.mockResolvedValue({
      ...makeShareLink({ isActive: false }),
      conversation: { id: CONV_ID, title: 'T', description: null, type: 'group', createdAt: new Date().toISOString() },
      creator: { id: CREATOR_ID, username: 'c', firstName: 'C', lastName: 'U', displayName: 'C', avatar: null },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/anonymous/link/${LINK_ID_STR}`,
    });

    expect(res.statusCode).toBe(410);
  });

  it('returns 410 when link has expired', async () => {
    await app.ready();

    const pastDate = new Date(Date.now() - 1000 * 60 * 60);
    mockShareLink.findUnique.mockResolvedValue({
      ...makeShareLink({ expiresAt: pastDate }),
      conversation: { id: CONV_ID, title: 'T', description: null, type: 'group', createdAt: new Date().toISOString() },
      creator: { id: CREATOR_ID, username: 'c', firstName: 'C', lastName: 'U', displayName: 'C', avatar: null },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/anonymous/link/${LINK_ID_STR}`,
    });

    expect(res.statusCode).toBe(410);
  });

  it('returns 410 when max uses reached', async () => {
    await app.ready();

    mockShareLink.findUnique.mockResolvedValue({
      ...makeShareLink({ maxUses: 5, currentUses: 5 }),
      conversation: { id: CONV_ID, title: 'T', description: null, type: 'group', createdAt: new Date().toISOString() },
      creator: { id: CREATOR_ID, username: 'c', firstName: 'C', lastName: 'U', displayName: 'C', avatar: null },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/anonymous/link/${LINK_ID_STR}`,
    });

    expect(res.statusCode).toBe(410);
  });

  it('returns 500 on DB error', async () => {
    await app.ready();

    mockShareLink.findUnique.mockRejectedValue(new Error('MongoDB error'));

    const res = await app.inject({
      method: 'GET',
      url: `/anonymous/link/${LINK_ID_STR}`,
    });

    expect(res.statusCode).toBe(500);
  });
});
