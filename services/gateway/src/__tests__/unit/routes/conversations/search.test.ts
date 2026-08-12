/**
 * Unit tests for conversations search route (search.ts)
 * Tests GET /conversations/search.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockResolveConversationId = jest.fn<any>().mockResolvedValue('conv-resolved-id');
const mockGetUnreadCounts = jest.fn<any>().mockResolvedValue(new Map());
const mockGenerateDefaultConversationTitle = jest.fn<any>().mockReturnValue('Default Title');

jest.mock('../../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: any[]) => mockResolveConversationId(...args),
}));

jest.mock('../../../../services/MessageReadStatusService.js', () => ({
  MessageReadStatusService: jest.fn().mockImplementation(() => ({
    getUnreadCountsForUser: (...args: any[]) => mockGetUnreadCounts(...args),
  })),
}));

// `resolveUserLanguagesOrdered` garde son implémentation RÉELLE : c'est la
// seule autorité du dépôt sur l'ordre du Prisme (systemLanguage →
// regionalLanguage → customDestinationLanguage → deviceLocale) et sur la
// normalisation des codes. Le doubler ici transformerait les témoins d'aperçu
// traduit en tautologies. Même choix que `conversation-core.test.ts`.
jest.mock('@meeshy/shared/utils/conversation-helpers', () => ({
  ...(jest.requireActual('@meeshy/shared/utils/conversation-helpers') as Record<string, unknown>),
  generateDefaultConversationTitle: (...args: any[]) => mockGenerateDefaultConversationTitle(...args),
}));

jest.mock('../../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() })),
  },
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  conversationMinimalSchema: { type: 'object', additionalProperties: true },
  errorResponseSchema: { type: 'object', properties: {} },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerSearchRoutes } from '../../../../routes/conversations/search';
import { LAST_MESSAGE_PREVIEW_MAX_LENGTH } from '../../../../routes/conversations/utils/last-message-preview';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439022';

const mockConversation = {
  id: CONV_ID,
  identifier: 'test-conv',
  title: 'Test Conversation',
  type: 'group',
  avatar: null,
  banner: null,
  isActive: true,
  communityId: null,
  lastMessageAt: new Date(),
  createdAt: new Date(),
  _count: { participants: 3 },
  participants: [
    {
      id: 'part-1',
      userId: USER_ID,
      displayName: 'Alice',
      user: { id: USER_ID, username: 'alice', displayName: 'Alice Smith' },
    },
  ],
  messages: [],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePreValidationAuth(authenticated: boolean, registeredUser?: Record<string, unknown>) {
  return async (req: FastifyRequest) => {
    if (authenticated) {
      (req as any).authContext = {
        isAuthenticated: true,
        userId: USER_ID,
        registeredUser: { id: USER_ID, role: 'USER', ...(registeredUser ?? {}) },
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
    conversation: {
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    ...overrides,
  };
}

async function buildApp(opts: {
  authenticated?: boolean;
  prisma?: any;
  registeredUser?: Record<string, unknown>;
} = {}): Promise<FastifyInstance> {
  const { authenticated = true, prisma = makePrisma(), registeredUser } = opts;

  const app = Fastify({ logger: false });
  const requiredAuth = makePreValidationAuth(authenticated, registeredUser);

  registerSearchRoutes(app, prisma as any, requiredAuth);
  await app.ready();
  return app;
}

// ─── GET /conversations/search ────────────────────────────────────────────────

describe('GET /conversations/search — missing query param', () => {
  it('returns 400 when q is missing', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/conversations/search' });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('GET /conversations/search — no matching users or conversations', () => {
  it('returns 200 with empty array when prisma returns nothing', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/conversations/search?q=xyz' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data).toEqual([]);
    await app.close();
  });
});


describe('GET /conversations/search — conversations found', () => {
  it('returns 200 with list of matching conversations', async () => {
    const prisma = makePrisma({
      user: { findMany: jest.fn<any>().mockResolvedValue([{ id: USER_ID }]) },
      conversation: { findMany: jest.fn<any>().mockResolvedValue([mockConversation]) },
    });
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/conversations/search?q=alice' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(1);
    await app.close();
  });
});

describe('GET /conversations/search — conversation with last message', () => {
  it('returns 200 and includes lastMessage with sender info', async () => {
    const convWithMessage = {
      ...mockConversation,
      messages: [
        {
          id: 'msg-1',
          content: 'Hello world',
          senderId: 'part-1',
          messageType: 'text',
          createdAt: new Date(),
          sender: {
            id: 'part-1',
            userId: USER_ID,
            displayName: 'Alice',
            avatar: null,
            user: { id: USER_ID, username: 'alice', displayName: 'Alice Smith', avatar: null, isOnline: true },
          },
          attachments: [],
          _count: { attachments: 0 },
        },
      ],
    };
    const prisma = makePrisma({
      conversation: { findMany: jest.fn<any>().mockResolvedValue([convWithMessage]) },
    });
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/conversations/search?q=hello' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data[0].lastMessage).toBeDefined();
    await app.close();
  });
});

describe('GET /conversations/search — lastMessage geolocalise', () => {
  it('Lot 3 : restitue `location` sur lastMessage (metadata fetche mais jete par le mapping manuel avant correctif)', async () => {
    const GEO = { latitude: 48.8566, longitude: 2.3522, name: 'Tour Eiffel', address: null, category: null };
    const convWithGeoMessage = {
      ...mockConversation,
      messages: [
        {
          id: 'msg-geo-1',
          content: '',
          senderId: 'part-1',
          messageType: 'text',
          createdAt: new Date(),
          metadata: { location: GEO },
          sender: {
            id: 'part-1',
            userId: USER_ID,
            displayName: 'Alice',
            avatar: null,
            user: { id: USER_ID, username: 'alice', displayName: 'Alice Smith', avatar: null, isOnline: true },
          },
          attachments: [],
          _count: { attachments: 0 },
        },
      ],
    };
    const prisma = makePrisma({
      conversation: { findMany: jest.fn<any>().mockResolvedValue([convWithGeoMessage]) },
    });
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/conversations/search?q=hello' });
    const body = res.json();
    expect(body.data[0].lastMessage.location).toMatchObject({ latitude: 48.8566, name: 'Tour Eiffel' });
    await app.close();
  });
});

describe('GET /conversations/search — direct conversation without title', () => {
  it('returns 200 with null title for direct conversation with no title', async () => {
    const directConv = {
      ...mockConversation,
      type: 'direct',
      title: null,
    };
    const prisma = makePrisma({
      conversation: { findMany: jest.fn<any>().mockResolvedValue([directConv]) },
    });
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/conversations/search?q=alice' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    await app.close();
  });
});

describe('GET /conversations/search — group conversation without title', () => {
  it('calls generateDefaultConversationTitle for group with no title', async () => {
    const noTitleConv = {
      ...mockConversation,
      type: 'group',
      title: '',
    };
    const prisma = makePrisma({
      conversation: { findMany: jest.fn<any>().mockResolvedValue([noTitleConv]) },
    });
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/conversations/search?q=group' });
    expect(res.statusCode).toBe(200);
    expect(mockGenerateDefaultConversationTitle).toHaveBeenCalled();
    await app.close();
  });
});

describe('GET /conversations/search — with unread counts', () => {
  it('returns 200 and includes unread counts from service', async () => {
    const unreadMap = new Map([[CONV_ID, 5]]);
    mockGetUnreadCounts.mockResolvedValueOnce(unreadMap);

    const prisma = makePrisma({
      conversation: { findMany: jest.fn<any>().mockResolvedValue([mockConversation]) },
    });
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/conversations/search?q=test' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data[0].unreadCount).toBe(5);
    await app.close();
  });
});

describe('GET /conversations/search — service error', () => {
  it('returns 500 when prisma throws', async () => {
    const prisma = makePrisma({
      user: { findMany: jest.fn<any>().mockRejectedValue(new Error('DB failure')) },
    });
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/conversations/search?q=alice' });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

describe('GET /conversations/search — last-message preview excludes soft-deleted messages', () => {
  it('gates the nested messages preview with deletedAt: null (mirror of conversations/core.ts)', async () => {
    const findMany = jest.fn<any>().mockResolvedValue([mockConversation]);
    const prisma = makePrisma({
      user: { findMany: jest.fn<any>().mockResolvedValue([{ id: USER_ID }]) },
      conversation: { findMany },
    });
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'GET', url: '/conversations/search?q=alice' });
    expect(res.statusCode).toBe(200);

    const queryArg = findMany.mock.calls[0][0];
    expect(queryArg.include.messages.where).toEqual({ deletedAt: null });
    await app.close();
  });
});

// ─── Prisme Linguistique de la ligne de liste ────────────────────────────────
//
// `GET /conversations` (core.ts) pose `lastMessageOriginalLanguage` et
// `lastMessageTranslations` depuis le cycle 60 ; `conversationMinimalSchema` —
// le schéma de réponse de CETTE route — les déclare depuis le même cycle. La
// recherche était la dernière surface à servir une ligne de conversation sans
// prisme : son `include` Prisma rapporte déjà les deux colonnes (aucun `select`
// restrictif sur `messages`), et son mapping manuel les jetait — la donnée était
// payée puis perdue, exactement comme `metadata.location` avant le Lot 3.

const PRISME_MESSAGE = {
  id: 'msg-prisme-1',
  content: 'Hello everyone',
  senderId: 'part-1',
  messageType: 'text',
  createdAt: new Date(),
  originalLanguage: 'en',
  translations: {
    fr: { text: 'Bonjour tout le monde', isEncrypted: false },
    es: { text: 'Hola a todos', isEncrypted: false },
    it: { text: 'Ciao a tutti', isEncrypted: false },
  },
  sender: {
    id: 'part-1',
    userId: USER_ID,
    displayName: 'Alice',
    avatar: null,
    user: { id: USER_ID, username: 'alice', displayName: 'Alice Smith', avatar: null, isOnline: true },
  },
  attachments: [],
  _count: { attachments: 0 },
};

function makePrismeApp(opts: {
  message?: Record<string, unknown> | null;
  registeredUser?: Record<string, unknown>;
} = {}) {
  const { message = PRISME_MESSAGE, registeredUser = { systemLanguage: 'fr', regionalLanguage: 'es' } } = opts;
  const prisma = makePrisma({
    conversation: {
      findMany: jest.fn<any>().mockResolvedValue([
        { ...mockConversation, messages: message ? [message] : [] },
      ]),
    },
  });
  return buildApp({ prisma, registeredUser });
}

describe('GET /conversations/search — Prisme Linguistique de l\'apercu', () => {
  it('sert lastMessageOriginalLanguage depuis le dernier message', async () => {
    const app = await makePrismeApp();
    const res = await app.inject({ method: 'GET', url: '/conversations/search?q=hello' });
    expect(res.json().data[0].lastMessageOriginalLanguage).toBe('en');
    await app.close();
  });

  it('restreint lastMessageTranslations aux langues du prisme du lecteur', async () => {
    const app = await makePrismeApp();
    const res = await app.inject({ method: 'GET', url: '/conversations/search?q=hello' });
    const row = res.json().data[0];
    expect(row.lastMessageTranslations).toEqual({
      fr: 'Bonjour tout le monde',
      es: 'Hola a todos',
    });
    // `it` existe et n'est pas chiffree : seule son absence du prisme du lecteur
    // l'exclut. Sans cette entree, le temoin ne distinguerait pas « restreint au
    // prisme » de « recopie toute la carte ».
    expect(row.lastMessageTranslations.it).toBeUndefined();
    await app.close();
  });

  it('fait entrer deviceLocale en 4e priorite (jamais en remplacement des preferences in-app)', async () => {
    const app = await makePrismeApp({ registeredUser: { systemLanguage: 'fr', deviceLocale: 'it-IT' } });
    const res = await app.inject({ method: 'GET', url: '/conversations/search?q=hello' });
    expect(res.json().data[0].lastMessageTranslations).toEqual({
      fr: 'Bonjour tout le monde',
      it: 'Ciao a tutti',
    });
    await app.close();
  });

  it('rend null — jamais {} — quand aucune traduction du prisme n\'est servie', async () => {
    const app = await makePrismeApp({
      message: { ...PRISME_MESSAGE, translations: null },
      registeredUser: { systemLanguage: 'fr' },
    });
    const res = await app.inject({ method: 'GET', url: '/conversations/search?q=hello' });
    expect(res.json().data[0].lastMessageTranslations).toBeNull();
    await app.close();
  });

  it('ne fait jamais fuiter le blob translations brut dans lastMessage', async () => {
    const app = await makePrismeApp();
    const res = await app.inject({ method: 'GET', url: '/conversations/search?q=hello' });
    const lastMessage = res.json().data[0].lastMessage;
    expect(lastMessage.translations).toBeUndefined();
    expect(lastMessage.originalLanguage).toBeUndefined();
    await app.close();
  });

  it('tronque l\'apercu original a la meme borne que GET /conversations', async () => {
    const long = 'a'.repeat(LAST_MESSAGE_PREVIEW_MAX_LENGTH + 50);
    const app = await makePrismeApp({
      message: { ...PRISME_MESSAGE, content: long, translations: null },
      registeredUser: { systemLanguage: 'fr' },
    });
    const res = await app.inject({ method: 'GET', url: '/conversations/search?q=hello' });
    expect(res.json().data[0].lastMessage.content).toHaveLength(LAST_MESSAGE_PREVIEW_MAX_LENGTH);
    await app.close();
  });

  it('laisse lastMessageTranslations a null quand le lecteur n\'a aucune langue configuree', async () => {
    const app = await makePrismeApp({ registeredUser: {} });
    const res = await app.inject({ method: 'GET', url: '/conversations/search?q=hello' });
    const row = res.json().data[0];
    expect(row.lastMessageTranslations).toBeNull();
    expect(row.lastMessageOriginalLanguage).toBe('en');
    await app.close();
  });

  it('rend les deux champs null quand la conversation n\'a aucun message', async () => {
    const app = await makePrismeApp({ message: null });
    const res = await app.inject({ method: 'GET', url: '/conversations/search?q=hello' });
    const row = res.json().data[0];
    expect(row.lastMessage).toBeNull();
    expect(row.lastMessageTranslations).toBeNull();
    expect(row.lastMessageOriginalLanguage).toBeNull();
    await app.close();
  });
});
