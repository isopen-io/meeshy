/**
 * Unit tests for conversations/threads.ts
 * Tests GET /conversations/:id/threads/:messageId
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn() }) },
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  errorResponseSchema: {
    type: 'object',
    properties: { success: { type: 'boolean' }, error: { type: 'string' }, message: { type: 'string' } },
  },
}));

jest.mock('../../../services/attachments/attachmentIncludes', () => ({
  attachmentMediaSelect: { id: true, fileName: true, mimeType: true, fileUrl: true },
}));

const mockResolveConversationId = jest.fn<any>().mockResolvedValue('conv-resolved-id');
jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...a: any[]) => mockResolveConversationId(...a),
}));

const mockCanAccessConversation = jest.fn<any>().mockResolvedValue(true);
jest.mock('../../../routes/conversations/utils/access-control', () => ({
  canAccessConversation: (...a: any[]) => mockCanAccessConversation(...a),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerThreadsRoutes } from '../../../routes/conversations/threads';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const CONV_ID = 'conv-aabbcc';
const CONV_RESOLVED_ID = 'conv-resolved-id';
const MESSAGE_ID = 'msg-111';

const MOCK_PARENT_MESSAGE = {
  id: MESSAGE_ID,
  content: 'Parent message',
  originalLanguage: 'fr',
  conversationId: CONV_RESOLVED_ID,
  senderId: 'part-1',
  messageType: 'text',
  messageSource: 'user',
  editedAt: null,
  deletedAt: null,
  replyToId: null,
  reactionSummary: {},
  reactionCount: 0,
  translations: [],
  validatedMentions: [],
  createdAt: new Date('2025-01-01T00:00:00Z'),
  updatedAt: new Date('2025-01-01T00:00:00Z'),
  sender: null,
  attachments: [],
  replyTo: null,
  _count: { reactions: 0, statusEntries: 0 },
};

// ─── Factory ─────────────────────────────────────────────────────────────────

function makePrisma(overrides: any = {}) {
  return {
    message: {
      findFirst: jest.fn<any>().mockResolvedValue(MOCK_PARENT_MESSAGE),
      findMany: jest.fn<any>().mockResolvedValue([]),
      ...overrides.message,
    },
    // La ligne du LECTEUR, lue pour son plancher d'historique. `null` = pas de
    // ligne, donc rien ne borne — le défaut de tout ce fichier.
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      ...overrides.participant,
    },
    conversationShareLink: {
      findUnique: jest.fn<any>().mockResolvedValue(null),
      ...overrides.conversationShareLink,
    },
    ...overrides,
  };
}

async function buildApp({ authenticated = true, prismaOverrides = {} as any } = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  const requiredAuth = async (req: any, reply: any) => {
    if (!authenticated) {
      return reply.status(401).send({ success: false, error: 'Unauthorized' });
    }
    (req as any).authContext = {
      isAuthenticated: true,
      isAnonymous: false,
      userId: USER_ID,
      registeredUser: { id: USER_ID, role: 'USER' },
    };
  };

  const prisma = makePrisma(prismaOverrides);
  registerThreadsRoutes(app, prisma as any, requiredAuth);
  await app.ready();
  return app;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GET /conversations/:id/threads/:messageId — not authenticated', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp({ authenticated: false }); });
  afterAll(async () => { await app.close(); });

  it('returns 401 when not authenticated', async () => {
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/threads/${MESSAGE_ID}` });
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /conversations/:id/threads/:messageId — conversation not found', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockResolveConversationId.mockResolvedValue(null);
    app = await buildApp();
  });
  afterAll(async () => {
    mockResolveConversationId.mockResolvedValue(CONV_RESOLVED_ID);
    await app.close();
  });

  it('returns 404 when conversation is not found', async () => {
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/threads/${MESSAGE_ID}` });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /conversations/:id/threads/:messageId — access denied', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockResolveConversationId.mockResolvedValue(CONV_RESOLVED_ID);
    mockCanAccessConversation.mockResolvedValue(false);
    app = await buildApp();
  });
  afterAll(async () => {
    mockCanAccessConversation.mockResolvedValue(true);
    await app.close();
  });

  it('returns 403 when user has no access to the conversation', async () => {
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/threads/${MESSAGE_ID}` });
    expect(res.statusCode).toBe(403);
  });
});

describe('GET /conversations/:id/threads/:messageId — message not found', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockResolveConversationId.mockResolvedValue(CONV_RESOLVED_ID);
    mockCanAccessConversation.mockResolvedValue(true);
    app = await buildApp({
      prismaOverrides: {
        message: {
          findFirst: jest.fn<any>().mockResolvedValue(null),
          findMany: jest.fn<any>().mockResolvedValue([]),
        },
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 404 when parent message is not found', async () => {
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/threads/${MESSAGE_ID}` });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /conversations/:id/threads/:messageId — success (no replies)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockResolveConversationId.mockResolvedValue(CONV_RESOLVED_ID);
    mockCanAccessConversation.mockResolvedValue(true);
    app = await buildApp({
      prismaOverrides: {
        message: {
          findFirst: jest.fn<any>().mockResolvedValue(MOCK_PARENT_MESSAGE),
          findMany: jest.fn<any>().mockResolvedValue([]),
        },
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with parent message and empty replies', async () => {
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/threads/${MESSAGE_ID}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('GET /conversations/:id/threads/:messageId — success (with replies)', () => {
  let app: FastifyInstance;
  const mockFindFirst = jest.fn<any>().mockResolvedValue(MOCK_PARENT_MESSAGE);
  const mockFindMany = jest.fn<any>().mockResolvedValueOnce([
    { ...MOCK_PARENT_MESSAGE, id: 'reply-1', replyToId: MESSAGE_ID, createdAt: new Date('2025-01-02') },
  ]).mockResolvedValue([]); // depth 2: no more replies
  beforeAll(async () => {
    mockResolveConversationId.mockResolvedValue(CONV_RESOLVED_ID);
    mockCanAccessConversation.mockResolvedValue(true);
    app = await buildApp({
      prismaOverrides: {
        message: { findFirst: mockFindFirst, findMany: mockFindMany },
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with parent and collected replies', async () => {
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/threads/${MESSAGE_ID}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('GET /conversations/:id/threads/:messageId — service error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockResolveConversationId.mockResolvedValue(CONV_RESOLVED_ID);
    mockCanAccessConversation.mockResolvedValue(true);
    app = await buildApp({
      prismaOverrides: {
        message: {
          findFirst: jest.fn<any>().mockRejectedValue(new Error('DB crash')),
          findMany: jest.fn<any>().mockResolvedValue([]),
        },
      },
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on service error', async () => {
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/threads/${MESSAGE_ID}` });
    expect(res.statusCode).toBe(500);
  });
});

// ─── Plancher d'historique ────────────────────────────────────────────────────
//
// Un fil est une porte sur l'historique comme une autre : sa racine et ses
// réponses obéissent au plancher du lecteur (`services/historyFloor`), le même
// que `GET messages`. Une racine d'AVANT l'arrivée n'existe pas pour lui — 404,
// comme pour un message masqué.

describe('GET /conversations/:id/threads/:messageId — plancher d’historique du lecteur', () => {
  const JOINED_AT = new Date('2026-06-15T00:00:00Z');
  const memberRow = (over: Record<string, unknown> = {}) => ({
    role: 'member',
    joinedAt: JOINED_AT,
    shareLinkId: null,
    historyVisibleFrom: null,
    permissions: { canViewHistory: false },
    anonymousSession: null,
    ...over,
  });

  it('borne la racine ET les réponses à `joinedAt` pour un membre au droit figé fermé', async () => {
    const findFirst = jest.fn<any>().mockResolvedValue(MOCK_PARENT_MESSAGE);
    const findMany = jest.fn<any>().mockResolvedValue([]);
    const app = await buildApp({
      prismaOverrides: {
        message: { findFirst, findMany },
        participant: { findFirst: jest.fn<any>().mockResolvedValue(memberRow()) },
      },
    });

    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/threads/${MESSAGE_ID}` });
    expect(res.statusCode).toBe(200);
    expect(findFirst.mock.calls[0][0].where).toMatchObject({ id: MESSAGE_ID, createdAt: { gte: JOINED_AT } });
    expect(findMany.mock.calls[0][0].where).toMatchObject({ replyToId: { in: [MESSAGE_ID] }, createdAt: { gte: JOINED_AT } });
    await app.close();
  });

  it('cherche la ligne du lecteur INSCRIT par `userId`', async () => {
    const participantFindFirst = jest.fn<any>().mockResolvedValue(memberRow());
    const app = await buildApp({ prismaOverrides: { participant: { findFirst: participantFindFirst } } });

    await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/threads/${MESSAGE_ID}` });
    expect(participantFindFirst.mock.calls[0][0].where).toEqual({ userId: USER_ID, conversationId: CONV_RESOLVED_ID, isActive: true });
    await app.close();
  });

  it('ouvre tout à un administrateur de la conversation', async () => {
    const findFirst = jest.fn<any>().mockResolvedValue(MOCK_PARENT_MESSAGE);
    const app = await buildApp({
      prismaOverrides: {
        message: { findFirst, findMany: jest.fn<any>().mockResolvedValue([]) },
        participant: { findFirst: jest.fn<any>().mockResolvedValue(memberRow({ role: 'admin' })) },
      },
    });

    await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/threads/${MESSAGE_ID}` });
    expect(findFirst.mock.calls[0][0].where.createdAt).toBeUndefined();
    await app.close();
  });

  it('ouvre depuis la DATE octroyée par un administrateur', async () => {
    const GRANTED_FROM = new Date('2026-01-01T00:00:00Z');
    const findFirst = jest.fn<any>().mockResolvedValue(MOCK_PARENT_MESSAGE);
    const app = await buildApp({
      prismaOverrides: {
        message: { findFirst, findMany: jest.fn<any>().mockResolvedValue([]) },
        participant: { findFirst: jest.fn<any>().mockResolvedValue(memberRow({ historyVisibleFrom: GRANTED_FROM })) },
      },
    });

    await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/threads/${MESSAGE_ID}` });
    expect(findFirst.mock.calls[0][0].where.createdAt).toEqual({ gte: GRANTED_FROM });
    await app.close();
  });

  it('rend 500, jamais le fil, quand le plancher est ILLISIBLE — contrôle d’accès fail-closed', async () => {
    const findFirst = jest.fn<any>().mockResolvedValue(MOCK_PARENT_MESSAGE);
    const app = await buildApp({
      prismaOverrides: {
        message: { findFirst, findMany: jest.fn<any>().mockResolvedValue([]) },
        participant: { findFirst: jest.fn<any>().mockRejectedValue(new Error('mongo down')) },
      },
    });

    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/threads/${MESSAGE_ID}` });
    expect(res.statusCode).toBe(500);
    expect(findFirst).not.toHaveBeenCalled();
    await app.close();
  });
});
