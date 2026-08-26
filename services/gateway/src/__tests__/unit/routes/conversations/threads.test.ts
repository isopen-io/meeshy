/**
 * Unit tests for conversations threads route (threads.ts)
 * Tests GET /conversations/:id/threads/:messageId.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockResolveConversationId = jest.fn<any>().mockResolvedValue('conv-resolved-id');
const mockCanAccessConversation = jest.fn<any>().mockResolvedValue(true);

jest.mock('../../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: any[]) => mockResolveConversationId(...args),
}));

jest.mock('../../../../routes/conversations/utils/access-control', () => ({
  canAccessConversation: (...args: any[]) => mockCanAccessConversation(...args),
}));

jest.mock('../../../../services/attachments/attachmentIncludes', () => ({
  attachmentMediaSelect: {
    id: true,
    fileName: true,
    mimeType: true,
    fileUrl: true,
    thumbnailUrl: true,
  },
}));

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() })),
  },
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  errorResponseSchema: { type: 'object', properties: {} },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerThreadsRoutes } from '../../../../routes/conversations/threads';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439022';
const MSG_ID = '507f1f77bcf86cd799439033';
const REPLY_ID = '507f1f77bcf86cd799439044';

const mockParentMessage = {
  id: MSG_ID,
  content: 'Parent message',
  originalLanguage: 'en',
  conversationId: CONV_ID,
  senderId: 'part-1',
  messageType: 'text',
  messageSource: null,
  editedAt: null,
  deletedAt: null,
  replyToId: null,
  reactionSummary: {},
  reactionCount: 0,
  // Cycle 67 — forme RÉELLE de la colonne : une carte Mongo indexée par langue.
  // Ce fixture portait `[]`, une forme que Prisma ne rend jamais ; le fil
  // servait donc la carte brute sans qu'aucun témoin ne puisse le voir.
  translations: {
    fr: { text: 'Bonjour', translationModel: 'medium', createdAt: new Date('2026-08-11T00:00:00Z') },
  },
  validatedMentions: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  sender: null,
  attachments: [],
  replyTo: null,
  _count: { reactions: 0, statusEntries: 0 },
};

const mockReplyMessage = {
  ...mockParentMessage,
  id: REPLY_ID,
  content: 'Reply message',
  replyToId: MSG_ID,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePreValidationAuth(authenticated: boolean) {
  return async (req: FastifyRequest) => {
    if (authenticated) {
      (req as any).authContext = {
        isAuthenticated: true,
        userId: USER_ID,
        registeredUser: { id: USER_ID, role: 'USER' },
      };
    } else {
      (req as any).authContext = { isAuthenticated: false, userId: null };
    }
  };
}

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    message: {
      findFirst: jest.fn<any>().mockResolvedValue(mockParentMessage),
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    // La ligne du LECTEUR, lue pour son plancher d'historique
    // (`loadReaderHistoryFloor`). `null` = aucune ligne, donc aucun plancher :
    // ce fichier-ci porte sur la MISE EN FORME du fil, et la règle du plancher
    // a son propre témoin dans `conversations-threads.test.ts`.
    //
    // Sans ce double, `prisma.participant` valait `undefined` et la lecture du
    // plancher levait — fail-closed, donc 500 sur CHAQUE requête : les huit
    // témoins de format n'atteignaient plus une seule ligne du sérialiseur.
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
    },
    conversationShareLink: {
      findUnique: jest.fn<any>().mockResolvedValue(null),
    },
    ...overrides,
  };
}

async function buildApp(opts: {
  authenticated?: boolean;
  prisma?: any;
} = {}): Promise<FastifyInstance> {
  const { authenticated = true, prisma = makePrisma() } = opts;

  const app = Fastify({ logger: false });
  const requiredAuth = makePreValidationAuth(authenticated);

  registerThreadsRoutes(app, prisma as any, requiredAuth);
  await app.ready();
  return app;
}

// ─── GET /conversations/:id/threads/:messageId ────────────────────────────────

describe('GET threads — conversation not found', () => {
  it('returns 404 when conversation ID cannot be resolved', async () => {
    mockResolveConversationId.mockResolvedValueOnce(null);
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/threads/${MSG_ID}` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('GET threads — access denied', () => {
  it('returns 403 when user cannot access conversation', async () => {
    mockCanAccessConversation.mockResolvedValueOnce(false);
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/threads/${MSG_ID}` });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

describe('GET threads — parent message not found', () => {
  it('returns 404 when the parent message does not exist', async () => {
    const prisma = makePrisma({
      message: {
        findFirst: jest.fn<any>().mockResolvedValue(null),
        findMany: jest.fn<any>().mockResolvedValue([]),
      },
    });
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/threads/${MSG_ID}` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('GET threads — success with no replies', () => {
  it('returns 200 when parent has no replies', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/threads/${MSG_ID}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    await app.close();
  });
});

describe('GET threads — success with replies', () => {
  it('returns 200 when parent has nested replies', async () => {
    const prisma = makePrisma({
      message: {
        findFirst: jest.fn<any>().mockResolvedValue(mockParentMessage),
        findMany: jest.fn<any>()
          .mockResolvedValueOnce([mockReplyMessage]) // first level replies
          .mockResolvedValueOnce([]),                // no deeper replies
      },
    });
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/threads/${MSG_ID}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    await app.close();
  });
});

describe('GET threads — service error', () => {
  it('returns 500 when prisma throws', async () => {
    const prisma = makePrisma({
      message: {
        findFirst: jest.fn<any>().mockRejectedValue(new Error('DB failure')),
        findMany: jest.fn<any>().mockResolvedValue([]),
      },
    });
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/threads/${MSG_ID}` });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── Lot 1 : le message affiché en entier restitue sa position ────────────────
// (racine du thread ET replyTo imbriqué — les deux affichent une vraie bulle).

describe('GET threads — position hoist', () => {
  it('restitue `location` sur le message racine géolocalisé ET sur son replyTo imbriqué', async () => {
    const GEO = { latitude: 48.8566, longitude: 2.3522, name: 'Tour Eiffel', address: null, category: null };
    const geoParent = {
      ...mockParentMessage,
      metadata: { location: GEO },
      replyTo: {
        id: 'quoted-1',
        content: 'quoted message',
        originalLanguage: 'en',
        createdAt: new Date(),
        senderId: 'part-2',
        validatedMentions: [],
        metadata: { location: { ...GEO, name: 'Louvre' } },
        sender: null,
        attachments: [],
      },
    };
    const prisma = makePrisma({
      message: {
        findFirst: jest.fn<any>().mockResolvedValue(geoParent),
        findMany: jest.fn<any>().mockResolvedValue([]),
      },
    });
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/threads/${MSG_ID}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.parent.location).toMatchObject({ latitude: 48.8566, name: 'Tour Eiffel' });
    expect(body.data.parent.replyTo.location).toMatchObject({ name: 'Louvre' });
    await app.close();
  });

  it('restitue `location` sur une réponse géolocalisée du fil', async () => {
    const GEO = { latitude: 40.7128, longitude: -74.006, name: 'Times Square', address: null, category: null };
    const geoReply = { ...mockReplyMessage, metadata: { location: GEO } };
    const prisma = makePrisma({
      message: {
        findFirst: jest.fn<any>().mockResolvedValue(mockParentMessage),
        findMany: jest.fn<any>()
          .mockResolvedValueOnce([geoReply])
          .mockResolvedValueOnce([]),
      },
    });
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/threads/${MSG_ID}` });
    const body = res.json();
    expect(body.data.replies[0].location).toMatchObject({ name: 'Times Square' });
    await app.close();
  });
});

// ─── Cycle 67 : le fil sert le MÊME format de traductions que les autres routes ─
//
// `threadMessageSelect` sélectionne `translations` et la route renvoyait le
// résultat Prisma verbatim — donc la carte Mongo. Le schéma de réponse du fil
// est `additionalProperties: true` : pas de 500 comme sur `pinned-messages`,
// mais la carte part telle quelle sur le fil. `APIMessage.init(from:)` décode
// `translations` avec `try` et non `try?` (SDK iOS) : un message de fil serait
// indécodable EN ENTIER, pas seulement privé de ses traductions.

describe('GET threads — format des traductions', () => {
  const expectApiTranslation = (id: string) =>
    expect.objectContaining({
      id: `${id}-fr`,
      messageId: id,
      targetLanguage: 'fr',
      translatedContent: 'Bonjour',
    });

  it('sérialise les traductions du message racine au format API', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/threads/${MSG_ID}` });
    expect(res.json().data.parent.translations).toEqual([expectApiTranslation(MSG_ID)]);
    await app.close();
  });

  it('sérialise les traductions de chaque réponse du fil au format API', async () => {
    const prisma = makePrisma({
      message: {
        findFirst: jest.fn<any>().mockResolvedValue(mockParentMessage),
        findMany: jest.fn<any>()
          .mockResolvedValueOnce([mockReplyMessage])
          .mockResolvedValueOnce([]),
      },
    });
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/threads/${MSG_ID}` });
    expect(res.json().data.replies[0].translations).toEqual([expectApiTranslation(REPLY_ID)]);
    await app.close();
  });

  it('rend un tableau vide quand la colonne est nulle', async () => {
    const prisma = makePrisma({
      message: {
        findFirst: jest.fn<any>().mockResolvedValue({ ...mockParentMessage, translations: null }),
        findMany: jest.fn<any>().mockResolvedValue([]),
      },
    });
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/threads/${MSG_ID}` });
    expect(res.json().data.parent.translations).toEqual([]);
    await app.close();
  });
});
