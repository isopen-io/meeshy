/**
 * Unit tests for conversations stats route (stats.ts)
 * Tests GET /conversations/:id/stats.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockResolveConversationId = jest.fn<any>().mockResolvedValue('conv-resolved-id');
const mockCanAccessConversation = jest.fn<any>().mockResolvedValue(true);
const mockGetStats = jest.fn<any>().mockResolvedValue({
  totalMessages: 42,
  participantStats: {},
  dailyActivity: { '2024-01-01': 5, '2024-01-02': 8 },
  languageDistribution: { fr: 30, en: 12 },
});

jest.mock('../../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: any[]) => mockResolveConversationId(...args),
}));

jest.mock('../../../../routes/conversations/utils/access-control', () => ({
  canAccessConversation: (...args: any[]) => mockCanAccessConversation(...args),
}));

jest.mock('../../../../services/ConversationMessageStatsService', () => ({
  conversationMessageStatsService: {
    getStats: (...args: any[]) => mockGetStats(...args),
  },
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  errorResponseSchema: { type: 'object', properties: {} },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerStatsRoutes } from '../../../../routes/conversations/stats';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439022';

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
    user: {
      findMany: jest.fn<any>().mockResolvedValue([]),
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

  registerStatsRoutes(app, prisma as any, requiredAuth as any);
  await app.ready();
  return app;
}

// ─── GET /conversations/:id/stats ─────────────────────────────────────────────

describe('GET /conversations/:id/stats — conversation not found', () => {
  it('returns 404 when conversation ID cannot be resolved', async () => {
    mockResolveConversationId.mockResolvedValueOnce(null);
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/stats` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('GET /conversations/:id/stats — access denied', () => {
  it('returns 403 when user has no access to the conversation', async () => {
    mockCanAccessConversation.mockResolvedValueOnce(false);
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/stats` });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

describe('GET /conversations/:id/stats — success with empty stats', () => {
  it('returns 200 with formatted statistics', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/stats` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    await app.close();
  });
});

describe('GET /conversations/:id/stats — success with participant stats', () => {
  it('returns 200 and enriches participant stats with user info', async () => {
    mockGetStats.mockResolvedValueOnce({
      totalMessages: 10,
      participantStats: { [USER_ID]: { messageCount: 5 } },
      dailyActivity: {},
      languageDistribution: {},
    });
    const prisma = makePrisma({
      user: {
        findMany: jest.fn<any>().mockResolvedValue([
          { id: USER_ID, username: 'alice', displayName: 'Alice Smith', avatar: null },
        ]),
      },
    });
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/stats` });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('GET /conversations/:id/stats — service error', () => {
  it('returns 500 when getStats throws', async () => {
    mockGetStats.mockRejectedValueOnce(new Error('DB error'));
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/stats` });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// La charge utile atteint-elle le fil ?
//
// Les cinq témoins ci-dessus attestent que la route RÉPOND — `statusCode`,
// `success` — et pas un seul un champ de `data`. Ils sont restés verts pendant
// toute la vie du défaut : le schéma déclarait `data: { type: 'object' }`, sans
// `properties`, et fast-json-stringify applique `additionalProperties: false`
// par défaut. La réponse ENTIÈRE sortait en `{}`.
//
// Les deux clients (`ConversationMessageStatsResponse`, iOS et Android) typent
// `conversationId`, `totalMessages`, `contentTypes`… comme NON-optionnels : le
// `{}` ne dégradait pas l'affichage, il faisait échouer le décodage. Ces
// témoins traversent `app.inject()`, donc le VRAI sérialiseur — seul endroit où
// la panne était observable.
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /conversations/:id/stats — la charge utile atteint le fil', () => {
  const FULL_STATS = {
    conversationId: 'conv-resolved-id',
    totalMessages: 42,
    totalWords: 300,
    totalCharacters: 1500,
    contentTypes: { text: 40, image: 1, audio: 1, video: 0, file: 0, location: 0 },
    participantStats: {
      [USER_ID]: {
        messageCount: 5, wordCount: 30, characterCount: 150,
        imageCount: 1, audioCount: 0, videoCount: 0,
        firstMessageAt: '2024-01-01T10:00:00.000Z',
        lastMessageAt: '2024-01-02T10:00:00.000Z',
      },
    },
    dailyActivity: { '2024-01-01': 5, '2024-01-02': 8 },
    hourlyDistribution: { '9': 3, '14': 7 },
    languageDistribution: { fr: 30, en: 12 },
    updatedAt: '2024-01-02T12:00:00.000Z',
  };

  async function fetchStats() {
    mockGetStats.mockResolvedValueOnce(FULL_STATS);
    const prisma = makePrisma({
      user: {
        findMany: jest.fn<any>().mockResolvedValue([
          { id: USER_ID, username: 'alice', displayName: 'Alice Smith', avatar: null },
        ]),
      },
    });
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/stats` });
    await app.close();
    return res.json().data;
  }

  it('sert les compteurs de tête', async () => {
    const data = await fetchStats();

    expect(data.conversationId).toBe('conv-resolved-id');
    expect(data.totalMessages).toBe(42);
    expect(data.totalWords).toBe(300);
    expect(data.totalCharacters).toBe(1500);
  });

  it('sert `contentTypes`, un objet FERMÉ à six compteurs nommés', async () => {
    const data = await fetchStats();

    expect(data.contentTypes).toEqual({ text: 40, image: 1, audio: 1, video: 0, file: 0, location: 0 });
  });

  it('sert `participantStats` aplati et enrichi du profil', async () => {
    const data = await fetchStats();

    expect(data.participantStats).toHaveLength(1);
    expect(data.participantStats[0]).toMatchObject({
      userId: USER_ID,
      username: 'alice',
      displayName: 'Alice Smith',
      messageCount: 5,
      wordCount: 30,
      firstMessageAt: '2024-01-01T10:00:00.000Z',
    });
  });

  it('sert `dailyActivity` et `languageDistribution` en tableaux triés', async () => {
    const data = await fetchStats();

    expect(data.dailyActivity).toEqual([
      { date: '2024-01-01', count: 5 },
      { date: '2024-01-02', count: 8 },
    ]);
    expect(data.languageDistribution).toEqual([
      { language: 'fr', count: 30 },
      { language: 'en', count: 12 },
    ]);
  });

  // La distinction que `{ type: 'object' }` effaçait : une CARTE dont les clés
  // sont des données ne se déclare pas par `properties` (on ne les connaît
  // pas), mais par `additionalProperties`. C'est la seule forme qui laisse
  // passer un objet aux clés inconnues — et la raison pour laquelle « objet
  // libre » n'est pas synonyme de « pas de déclaration ».
  it('sert `hourlyDistribution` comme une CARTE aux clés inconnues', async () => {
    const data = await fetchStats();

    expect(data.hourlyDistribution).toEqual({ '9': 3, '14': 7 });
  });

  it('sert `updatedAt`', async () => {
    const data = await fetchStats();

    expect(data.updatedAt).toBe('2024-01-02T12:00:00.000Z');
  });
});
