/**
 * Route tests — translation-non-blocking routes
 *
 * Covers the module's only route via Fastify inject:
 *   POST /translate                          — submit async translation
 *
 * `GET /status/:messageId/:language` et `GET /conversation/:identifier`
 * (jamais appelées par aucun client — #5423) ont été retirées avec ce
 * module ; le résultat d'une traduction voyage désormais uniquement par le
 * pipeline temps réel (Socket.IO `translation:completed`).
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockHandleNewMessage = jest.fn();
const mockHandleMessage = jest.fn();

jest.mock('../../../utils/logger', () => ({
  logError: jest.fn(),
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: jest.fn().mockResolvedValue(RESOLVED_CONV_ID),
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  errorResponseSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      error: { type: 'string' },
    },
  },
}));

jest.mock('../../../middleware/auth', () => ({
  UnifiedAuthRequest: {},
}));

// ─── Constants ───────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const MSG_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const CONV_IDENTIFIER = 'conv_abc123';
const RESOLVED_CONV_ID = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const AUTH = { authorization: 'Bearer token' };

const DB_MESSAGE = {
  id: MSG_ID,
  content: 'Hello world',
  conversationId: RESOLVED_CONV_ID,
  originalLanguage: 'en',
  conversation: { participants: [] },
};

// ─── Prisma factory ───────────────────────────────────────────────────────────

type PrismaOpts = {
  messageFindUnique?: typeof DB_MESSAGE | null | Error;
  /** `null` = l'appelant ne participe pas à la conversation visée. */
  participantFindFirst?: { id: string } | null | Error;
};

function opt<T>(v: T | undefined, fallback: T): T {
  return v === undefined ? fallback : v;
}

function mockFn<T>(v: T | Error): jest.Mock {
  return v instanceof Error
    ? jest.fn().mockRejectedValue(v)
    : jest.fn().mockResolvedValue(v);
}

function makePrisma(opts: PrismaOpts = {}) {
  return {
    message: {
      findUnique: mockFn(opt(opts.messageFindUnique, DB_MESSAGE)),
    },
    // La traduction porte le contenu des messages : la route vérifie
    // désormais que l'appelant participe à la conversation.
    participant: {
      findFirst: mockFn(opt(opts.participantFindFirst, { id: 'part-1' })),
    },
  };
}

// ─── App builder ──────────────────────────────────────────────────────────────

async function buildApp(prismaOpts: PrismaOpts = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', makePrisma(prismaOpts) as unknown);
  app.decorate('translationService', {
    handleNewMessage: (...a: unknown[]) => mockHandleNewMessage(...(a as [])),
  } as unknown);
  app.decorate('messagingService', {
    handleMessage: (...a: unknown[]) => mockHandleMessage(...(a as [])),
  } as unknown);
  app.decorate('authenticate', async (req: FastifyRequest, reply: FastifyReply) => {
    const token = req.headers['authorization'];
    if (!token) {
      await reply.code(401).send({ success: false, error: 'Unauthorized' });
      return;
    }
    (req as unknown as Record<string, unknown>).authContext = {
      type: 'registered',
      userId: USER_ID,
      isAuthenticated: true,
      isAnonymous: false,
      hasFullAccess: true,
    };
  });

  const { translationRoutes } = await import('../../../routes/translation-non-blocking');
  await app.register(translationRoutes, { prefix: '' });
  await app.ready();
  return app;
}

// ─── POST /translate ─────────────────────────────────────────────────────────

describe('POST /translate', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(() => app.close());
  beforeEach(() => {
    jest.clearAllMocks();
    mockHandleNewMessage.mockResolvedValue(undefined);
    mockHandleMessage.mockResolvedValue(undefined);
  });

  it('returns 200 with processing status when retranslating an existing message', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/translate',
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({
        message_id: MSG_ID,
        target_language: 'fr',
      }),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('processing');
    expect(body.data.messageId).toBe(MSG_ID);
    expect(body.data.targetLanguage).toBe('fr');
  });

  it('triggers non-blocking translation without awaiting when retranslating', async () => {
    await app.inject({
      method: 'POST',
      url: '/translate',
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ message_id: MSG_ID, target_language: 'es' }),
    });
    expect(mockHandleNewMessage).toHaveBeenCalledTimes(1);
  });

  it('returns 200 with processing status when submitting new text', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/translate',
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({
        text: 'Hello world',
        target_language: 'fr',
        conversation_id: CONV_IDENTIFIER,
      }),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('processing');
  });

  it('returns 404 when message_id refers to a non-existent message', async () => {
    const appNoMsg = await buildApp({ messageFindUnique: null });
    const res = await appNoMsg.inject({
      method: 'POST',
      url: '/translate',
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ message_id: MSG_ID, target_language: 'fr' }),
    });
    expect(res.statusCode).toBe(404);
    await appNoMsg.close();
  });

  // Parité SSOT `CommonSchemas.language` (`.max(6)`) : un code ISO 639-3
  // régionalisé (`bas-CM`) traverse la frontière AJV/Zod et atteint le handler.
  it('accepts region-tagged 6-char language codes (SSOT max=6)', async () => {
    const appNoMsg = await buildApp({ messageFindUnique: null });
    const res = await appNoMsg.inject({
      method: 'POST',
      url: '/translate',
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ message_id: MSG_ID, source_language: 'bas-CM', target_language: 'ewo-CM' }),
    });
    expect(res.statusCode).not.toBe(400);
    expect(res.statusCode).toBe(404);
    await appNoMsg.close();
  });

  it('still rejects an over-long language code (7 chars)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/translate',
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ message_id: MSG_ID, target_language: 'abcd-CM' }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when neither text nor message_id is provided', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/translate',
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ target_language: 'fr' }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when text is provided without conversation_id', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/translate',
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'Hello', target_language: 'fr' }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when target_language is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/translate',
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ message_id: MSG_ID }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when conversation_id cannot be resolved', async () => {
    const { resolveConversationId } = jest.requireMock('../../../utils/conversation-id-cache') as {
      resolveConversationId: jest.Mock;
    };
    resolveConversationId.mockResolvedValueOnce(null);

    const res = await app.inject({
      method: 'POST',
      url: '/translate',
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({
        text: 'Hello',
        target_language: 'fr',
        conversation_id: 'unknown-conv',
      }),
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 401 when no auth header provided', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/translate',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message_id: MSG_ID, target_language: 'fr' }),
    });
    expect(res.statusCode).toBe(401);
  });
});

// ─── Cloisonnement : la traduction porte le CONTENU des messages ─────────────
//
// `/translate` chargeait bien les participants du message visé mais ne les
// consultait jamais, si bien qu'un compte quelconque déclenchait la
// retraduction d'un message d'autrui. Les deux autres trous de cette même
// chaîne (`/status`, sans aucune garde ; `/conversation/:identifier`, ouverte
// à toute identité) ont disparu avec les routes elles-mêmes (#5423).

describe('cloisonnement des conversations', () => {
  beforeEach(() => jest.clearAllMocks());

  it('refuse la retraduction d\'un message d\'une conversation étrangère', async () => {
    const app = await buildApp({ participantFindFirst: null });
    const res = await app.inject({
      method: 'POST',
      url: '/translate',
      headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ message_id: MSG_ID, target_language: 'fr' }),
    });
    expect(res.statusCode).toBe(403);
    expect(mockHandleNewMessage).not.toHaveBeenCalled();
    await app.close();
  });
});
