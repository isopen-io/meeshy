/**
 * Extended unit tests for anonymous routes.
 * Covers branches missing from anonymous.test.ts:
 * - join: IP restriction, requireBirthday, requireNickname, participant username conflict
 * - refresh: expired link, null shareLinkId path
 * - leave: participant with anonymousSession.shareLinkId (decrement path)
 * - link: mshy_ lookup via findFirst, expired link
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../utils/logger', () => ({ logError: jest.fn() }));

jest.mock('../../../utils/sanitize', () => ({
  SecuritySanitizer: {
    sanitizeText: jest.fn((s: string) => s),
    sanitizeUsername: jest.fn((s: string) => s),
  },
}));

jest.mock('../../../utils/session-token', () => ({
  hashSessionToken: jest.fn((token: string) => 'hashed-' + token),
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
const SESSION_TOKEN = 'anon_session_token';

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
  language: 'fr', sessionTokenHash: 'hashed-' + SESSION_TOKEN,
  role: 'member', isActive: true, avatar: null,
  permissions: { canSendMessages: true, canSendFiles: false, canSendImages: false },
  anonymousSession: {
    shareLinkId: SHARE_LINK_DB_ID,
    profile: { firstName: 'Bob', lastName: 'Smith', username: 'bob_sm123', email: null, birthday: null },
    session: { sessionTokenHash: 'hashed-' + SESSION_TOKEN },
  },
};

const VALID_BODY = { firstName: 'Bob', lastName: 'Smith', language: 'fr' };

// ─── App factory ──────────────────────────────────────────────────────────────

async function buildApp(prismaOverrides: Record<string, any> = {}): Promise<FastifyInstance> {
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
    ...prismaOverrides,
  });
  await anonymousRoutes(app);
  await app.ready();
  return app;
}

// ─── JOIN: IP range restriction ───────────────────────────────────────────────

describe('POST /anonymous/join/:linkId — IP range restriction', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp();
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValue({
      ...mockShareLink,
      allowedIpRanges: ['192.168.1.0/24'],
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 403 when client IP not in allowed ranges', async () => {
    const res = await app.inject({
      method: 'POST', url: `/anonymous/join/${LINK_ID}`,
      payload: VALID_BODY,
    });
    expect(res.statusCode).toBe(403);
  });
});

// ─── JOIN: requireBirthday ────────────────────────────────────────────────────

describe('POST /anonymous/join/:linkId — requireBirthday', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp();
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValue({
      ...mockShareLink,
      requireBirthday: true,
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 400 when birthday required but missing', async () => {
    const res = await app.inject({
      method: 'POST', url: `/anonymous/join/${LINK_ID}`,
      payload: VALID_BODY,
    });
    expect(res.statusCode).toBe(400);
  });
});

// ─── JOIN: requireNickname ────────────────────────────────────────────────────

describe('POST /anonymous/join/:linkId — requireNickname', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp();
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValue({
      ...mockShareLink,
      requireNickname: true,
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 400 when nickname required but missing', async () => {
    const res = await app.inject({
      method: 'POST', url: `/anonymous/join/${LINK_ID}`,
      payload: VALID_BODY,
    });
    expect(res.statusCode).toBe(400);
  });
});

// ─── JOIN: username conflict with existing participant ────────────────────────

describe('POST /anonymous/join/:linkId — participant username conflict', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp();
    (app as any).prisma.participant.findFirst
      .mockResolvedValueOnce({ id: 'other-part', displayName: 'bob_sm123' })
      .mockResolvedValue(null);
  });
  afterAll(async () => { await app.close(); });

  it('returns 409 when username already taken by participant in this conversation', async () => {
    const res = await app.inject({
      method: 'POST', url: `/anonymous/join/${LINK_ID}`,
      payload: { ...VALID_BODY, username: 'bob_sm123' },
    });
    expect(res.statusCode).toBe(409);
  });
});

// ─── REFRESH: expired share link ─────────────────────────────────────────────

describe('POST /anonymous/refresh — expired share link', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp();
    (app as any).prisma.participant.findFirst.mockResolvedValue(mockParticipant);
    (app as any).prisma.conversationShareLink.findUnique.mockResolvedValue({
      ...mockShareLink, isActive: true, expiresAt: new Date('2020-01-01'),
      conversation: { id: CONV_ID, title: 'Test', type: 'group' },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 410 when share link has expired', async () => {
    const res = await app.inject({
      method: 'POST', url: '/anonymous/refresh',
      payload: { sessionToken: SESSION_TOKEN },
    });
    expect(res.statusCode).toBe(410);
  });
});

// ─── REFRESH: participant with no shareLinkId ─────────────────────────────────

describe('POST /anonymous/refresh — no shareLinkId', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp();
    (app as any).prisma.participant.findFirst.mockResolvedValue({
      ...mockParticipant,
      anonymousSession: { shareLinkId: null, profile: null, session: null },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 410 when participant has no shareLinkId', async () => {
    const res = await app.inject({
      method: 'POST', url: '/anonymous/refresh',
      payload: { sessionToken: SESSION_TOKEN },
    });
    expect(res.statusCode).toBe(410);
  });
});

// ─── LEAVE: with shareLinkId (decrement path) ─────────────────────────────────

describe('POST /anonymous/leave — with shareLinkId', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp();
    (app as any).prisma.participant.findFirst.mockResolvedValue(mockParticipant);
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 and decrements concurrent users count', async () => {
    const res = await app.inject({
      method: 'POST', url: '/anonymous/leave',
      payload: { sessionToken: SESSION_TOKEN },
    });
    expect(res.statusCode).toBe(200);
    expect((app as any).prisma.conversationShareLink.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { currentConcurrentUsers: { decrement: 1 } } })
    );
  });
});

// ─── LINK: mshy_ link found via findFirst ────────────────────────────────────

describe('GET /anonymous/link/:identifier — found via findFirst', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp();
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValue({
      ...mockShareLink,
      conversation: { id: CONV_ID, title: 'Test Conv', description: null, type: 'group', createdAt: new Date() },
    });
    (app as any).prisma.participant.count.mockResolvedValue(3);
    (app as any).prisma.participant.findMany.mockResolvedValue([]);
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 when mshy_ link found via findFirst', async () => {
    const res = await app.inject({ method: 'GET', url: `/anonymous/link/${LINK_ID}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

// ─── LINK: expired link ───────────────────────────────────────────────────────

describe('GET /anonymous/link/:identifier — expired link', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp();
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValue(null);
    (app as any).prisma.conversationShareLink.findUnique.mockResolvedValue({
      ...mockShareLink, isActive: true, expiresAt: new Date('2020-01-01'),
      conversation: { id: CONV_ID, title: 'T', description: null, type: 'group', createdAt: new Date() },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 410 when link has expired', async () => {
    const res = await app.inject({ method: 'GET', url: `/anonymous/link/${SHARE_LINK_DB_ID}` });
    expect(res.statusCode).toBe(410);
  });
});
