/**
 * Unit tests for anonymous routes (anonymous.ts)
 * Uses shared Fastify instances per describe block to avoid per-test OOM.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../utils/logger', () => ({ logError: jest.fn() }));

jest.mock('../../../utils/sanitize', () => ({
  SecuritySanitizer: {
    sanitizeText: jest.fn((s) => s),
    sanitizeUsername: jest.fn((s) => s),
  },
}));

jest.mock('../../../utils/session-token', () => ({
  hashSessionToken: jest.fn((token) => 'hashed-' + token),
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  errorResponseSchema: { type: 'object', properties: {} },
  anonymousParticipantSchema: { type: 'object', additionalProperties: true },
  conversationLinkSchema: { type: 'object', additionalProperties: true },
  conversationMinimalSchema: { type: 'object', additionalProperties: true },
  userMinimalSchema: { type: 'object', additionalProperties: true },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { anonymousRoutes } from '../../../routes/anonymous';

// ─── Constants ────────────────────────────────────────────────────────────────

const LINK_ID = 'mshy_link_abc123';
const SHARE_LINK_DB_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439022';
const PART_ID = '507f1f77bcf86cd799439033';

const mockShareLink = {
  id: SHARE_LINK_DB_ID, linkId: LINK_ID, identifier: 'test-link',
  conversationId: CONV_ID, isActive: true, expiresAt: null, maxUses: null,
  currentUses: 0, maxConcurrentUsers: null, currentConcurrentUsers: 0,
  currentUniqueSessions: 0, requireAccount: false, requireNickname: false,
  requireEmail: false, requireBirthday: false, allowedCountries: [],
  allowedLanguages: [], allowedIpRanges: [], allowAnonymousMessages: true,
  allowAnonymousFiles: false, allowAnonymousImages: false, allowViewHistory: false,
  name: 'Test Link', description: null,
  conversation: { id: CONV_ID, title: 'Test Conv', type: 'group' },
  creator: { id: 'user-1', username: 'alice', firstName: 'Alice', lastName: 'Smith', displayName: 'Alice Smith', avatar: null },
};

const mockParticipant = {
  id: PART_ID, conversationId: CONV_ID, type: 'anonymous', displayName: 'bob_sm123',
  language: 'fr', sessionTokenHash: 'hashed-session', shareLinkId: SHARE_LINK_DB_ID,
  role: 'member', isActive: true, avatar: null,
  permissions: { canSendMessages: true, canSendFiles: false, canSendImages: false },
  anonymousSession: {
    shareLinkId: SHARE_LINK_DB_ID,
    profile: { firstName: 'Bob', lastName: 'Smith', username: 'bob_sm123', email: null, birthday: null },
    session: { sessionTokenHash: 'hashed-session' },
  },
};

// ─── App factory ──────────────────────────────────────────────────────────────

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', {
    conversationShareLink: {
      findFirst: jest.fn().mockResolvedValue(mockShareLink),
      findUnique: jest.fn().mockResolvedValue({ ...mockShareLink }),
      update: jest.fn().mockResolvedValue({}),
    },
    user: { findFirst: jest.fn().mockResolvedValue(null) },
    participant: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(mockParticipant),
      update: jest.fn().mockResolvedValue(mockParticipant),
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
  });
  await anonymousRoutes(app);
  await app.ready();
  return app;
}

// ─── POST /anonymous/join/:linkId ─────────────────────────────────────────────

describe('POST /anonymous/join/:linkId', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 404 when share link not found', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'POST', url: '/anonymous/join/' + LINK_ID, payload: { firstName: 'Bob', lastName: 'Smith', language: 'fr' } });
    expect(res.statusCode).toBe(404);
  });

  it('returns 410 when link is inactive', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce({ ...mockShareLink, isActive: false });
    const res = await app.inject({ method: 'POST', url: '/anonymous/join/' + LINK_ID, payload: { firstName: 'Bob', lastName: 'Smith', language: 'fr' } });
    expect(res.statusCode).toBe(410);
  });

  it('returns 410 when link is expired', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce({ ...mockShareLink, expiresAt: new Date(0) });
    const res = await app.inject({ method: 'POST', url: '/anonymous/join/' + LINK_ID, payload: { firstName: 'Bob', lastName: 'Smith', language: 'fr' } });
    expect(res.statusCode).toBe(410);
  });

  it('returns 410 when max uses exceeded', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce({ ...mockShareLink, maxUses: 5, currentUses: 5 });
    const res = await app.inject({ method: 'POST', url: '/anonymous/join/' + LINK_ID, payload: { firstName: 'Bob', lastName: 'Smith', language: 'fr' } });
    expect(res.statusCode).toBe(410);
  });

  it('returns 429 when max concurrent users reached', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce({ ...mockShareLink, maxConcurrentUsers: 10, currentConcurrentUsers: 10 });
    const res = await app.inject({ method: 'POST', url: '/anonymous/join/' + LINK_ID, payload: { firstName: 'Bob', lastName: 'Smith', language: 'fr' } });
    expect(res.statusCode).toBe(429);
  });

  it('returns 403 when language not allowed', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce({ ...mockShareLink, allowedLanguages: ['en', 'de'] });
    const res = await app.inject({ method: 'POST', url: '/anonymous/join/' + LINK_ID, payload: { firstName: 'Bob', lastName: 'Smith', language: 'fr' } });
    expect(res.statusCode).toBe(403);
  });

  it('allows a normalized language against a region-subtagged allowedLanguages entry', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce({ ...mockShareLink, allowedLanguages: ['EN-US'] });
    const res = await app.inject({ method: 'POST', url: '/anonymous/join/' + LINK_ID, payload: { firstName: 'Bob', lastName: 'Smith', language: 'en-US' } });
    expect(res.statusCode).not.toBe(403);
  });

  it('returns 403 when link requires account', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce({ ...mockShareLink, requireAccount: true });
    const res = await app.inject({ method: 'POST', url: '/anonymous/join/' + LINK_ID, payload: { firstName: 'Bob', lastName: 'Smith', language: 'fr' } });
    expect(res.statusCode).toBe(403);
  });

  it('returns 400 when email required but missing', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce({ ...mockShareLink, requireEmail: true });
    const res = await app.inject({ method: 'POST', url: '/anonymous/join/' + LINK_ID, payload: { firstName: 'Bob', lastName: 'Smith', language: 'fr' } });
    expect(res.statusCode).toBe(400);
  });

  it('returns 409 when username conflicts with registered user', async () => {
    (app as any).prisma.user.findFirst.mockResolvedValueOnce({ id: 'other', username: 'bob_sm123' });
    const res = await app.inject({ method: 'POST', url: '/anonymous/join/' + LINK_ID, payload: { firstName: 'Bob', lastName: 'Smith', username: 'bob_sm123', language: 'fr' } });
    expect(res.statusCode).toBe(409);
  });

  it('returns 201 on successful join', async () => {
    const res = await app.inject({ method: 'POST', url: '/anonymous/join/' + LINK_ID, payload: { firstName: 'Bob', lastName: 'Smith', language: 'fr' } });
    expect(res.statusCode).toBe(201);
    expect(res.json().success).toBe(true);
  });
});

// ─── POST /anonymous/refresh ──────────────────────────────────────────────────

describe('POST /anonymous/refresh', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp();
    (app as any).prisma.participant.findFirst.mockResolvedValue(mockParticipant);
  });
  afterAll(async () => { await app.close(); });

  it('returns 401 when session not found', async () => {
    (app as any).prisma.participant.findFirst.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'POST', url: '/anonymous/refresh', payload: { sessionToken: 'invalid-token' } });
    expect(res.statusCode).toBe(401);
  });

  it('returns 410 when share link not found', async () => {
    (app as any).prisma.participant.findFirst.mockResolvedValueOnce({ ...mockParticipant, anonymousSession: { shareLinkId: null } });
    const res = await app.inject({ method: 'POST', url: '/anonymous/refresh', payload: { sessionToken: 'some-token' } });
    expect(res.statusCode).toBe(410);
  });

  it('returns 410 when link is deactivated', async () => {
    (app as any).prisma.conversationShareLink.findUnique.mockResolvedValueOnce({ ...mockShareLink, isActive: false, conversation: mockShareLink.conversation });
    const res = await app.inject({ method: 'POST', url: '/anonymous/refresh', payload: { sessionToken: 'some-token' } });
    expect(res.statusCode).toBe(410);
  });

  it('returns 200 on successful refresh', async () => {
    const res = await app.inject({ method: 'POST', url: '/anonymous/refresh', payload: { sessionToken: 'some-token' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

// ─── POST /anonymous/leave ────────────────────────────────────────────────────

describe('POST /anonymous/leave', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp();
    (app as any).prisma.participant.findFirst.mockResolvedValue(mockParticipant);
  });
  afterAll(async () => { await app.close(); });

  it('returns 404 when participant not found', async () => {
    (app as any).prisma.participant.findFirst.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'POST', url: '/anonymous/leave', payload: { sessionToken: 'invalid-token' } });
    expect(res.statusCode).toBe(404);
  });

  it('returns 200 on successful leave', async () => {
    const res = await app.inject({ method: 'POST', url: '/anonymous/leave', payload: { sessionToken: 'some-token' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

// ─── GET /anonymous/link/:identifier ─────────────────────────────────────────

describe('GET /anonymous/link/:identifier', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp();
    (app as any).prisma.participant.count.mockResolvedValue(2);
    (app as any).prisma.participant.findMany.mockResolvedValue([
      { type: 'user', language: 'fr', user: { systemLanguage: 'fr', regionalLanguage: null, customDestinationLanguage: null } },
      { type: 'anonymous', language: 'en', user: null },
    ]);
  });
  afterAll(async () => { await app.close(); });

  it('returns 404 when mshy_ link not found', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce(null);
    (app as any).prisma.conversationShareLink.findUnique.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'GET', url: '/anonymous/link/mshy_nonexistent' });
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 when link by ObjectID not found', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce(null);
    (app as any).prisma.conversationShareLink.findUnique.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'GET', url: '/anonymous/link/507f1f77bcf86cd799439011' });
    expect(res.statusCode).toBe(404);
  });

  it('returns 410 when link is inactive', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce(null);
    (app as any).prisma.conversationShareLink.findUnique.mockResolvedValueOnce({
      ...mockShareLink, isActive: false,
      conversation: { id: CONV_ID, title: 'T', description: null, type: 'group', createdAt: new Date() },
    });
    const res = await app.inject({ method: 'GET', url: '/anonymous/link/' + LINK_ID });
    expect(res.statusCode).toBe(410);
  });

  it('returns 200 with link info on success', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce(null);
    (app as any).prisma.conversationShareLink.findUnique.mockResolvedValueOnce({
      ...mockShareLink,
      conversation: { id: CONV_ID, title: 'Conv', description: null, type: 'group', createdAt: new Date() },
    });
    const res = await app.inject({ method: 'GET', url: '/anonymous/link/' + LINK_ID });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('collapses region-subtagged prefs onto their base code in spokenLanguages', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce(null);
    (app as any).prisma.conversationShareLink.findUnique.mockResolvedValueOnce({
      ...mockShareLink,
      conversation: { id: CONV_ID, title: 'Conv', description: null, type: 'group', createdAt: new Date() },
    });
    (app as any).prisma.participant.findMany.mockResolvedValueOnce([
      { type: 'user', language: null, user: { systemLanguage: 'pt-BR', regionalLanguage: 'EN', customDestinationLanguage: null } },
      { type: 'user', language: null, user: { systemLanguage: 'pt', regionalLanguage: null, customDestinationLanguage: null } },
      { type: 'anonymous', language: 'en-US', user: null },
    ]);
    const res = await app.inject({ method: 'GET', url: '/anonymous/link/' + LINK_ID });
    expect(res.statusCode).toBe(200);
    const { spokenLanguages, languageCount } = res.json().data.stats;
    expect(spokenLanguages).toEqual(['en', 'pt']);
    expect(languageCount).toBe(2);
  });

  it('keeps unknown/legacy language codes visible in spokenLanguages', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce(null);
    (app as any).prisma.conversationShareLink.findUnique.mockResolvedValueOnce({
      ...mockShareLink,
      conversation: { id: CONV_ID, title: 'Conv', description: null, type: 'group', createdAt: new Date() },
    });
    (app as any).prisma.participant.findMany.mockResolvedValueOnce([
      { type: 'anonymous', language: 'ZZ', user: null },
    ]);
    const res = await app.inject({ method: 'GET', url: '/anonymous/link/' + LINK_ID });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.stats.spokenLanguages).toEqual(['zz']);
  });
});
