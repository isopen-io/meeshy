/**
 * #10205 — `GET /links/:identifier` lu par un lecteur SANS COMPTE Meeshy
 * (visiteur de l'aperçu public) : ni la liste des membres, ni les autres
 * invités, ni aucun effectif. Les messages et leurs auteurs restent servis.
 * Un compte garde tout. Même harnais que `retrieval.test.ts`.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../../utils/logger', () => ({
  logError: jest.fn(),
}));

jest.mock('../../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn(() => async (req: FastifyRequest) => {
    (req as any).authContext = (req as any)._testAuthContext;
  }),
  isRegisteredUser: jest.fn((ctx: any) => ctx?.registeredUser != null),
  UnifiedAuthRequest: {},
}));

const mockFindShareLinkByIdentifier = jest.fn<any>();
const mockGetConversationMessages = jest.fn<any>().mockResolvedValue([]);
const mockCountConversationMessages = jest.fn<any>().mockResolvedValue(0);
// #4165 — cinq requêtes CIBLÉES qui remplacent l'ancienne relation
// `participants` chargée en bloc SANS `take` (voir `prisma-queries.ts`).
// `findActiveUserParticipant` gouverne `userType`/`hasAccess` (le repli par
// défaut est `null` = « non membre », le cas le plus restrictif) ; les
// autres n'affectent que `members`/`anonymousParticipants`/`stats`, non
// assertés par ce fichier.
const mockFindActiveUserParticipant = jest.fn<any>().mockResolvedValue(null);
const mockFindLinkMembers = jest.fn<any>().mockResolvedValue([
  {
    id: 'part-member', role: 'member', joinedAt: new Date('2024-01-02'),
    user: { id: '507f1f77bcf86cd7994390bb', username: 'bob', firstName: 'Bob', lastName: 'B', displayName: 'Bob', avatar: null },
  },
]);
const mockFindLinkAnonymousParticipants = jest.fn<any>().mockResolvedValue([
  {
    id: 'part-guest', displayName: 'Invité', avatar: null, language: 'fr', isOnline: false,
    lastActiveAt: null, joinedAt: new Date('2024-01-03'), permissions: { canSendMessages: true },
    anonymousSession: { profile: { username: 'invite', firstName: 'In', lastName: 'Vité' } },
  },
]);
const mockCountLinkParticipantsByType = jest.fn<any>().mockResolvedValue({ totalMembers: 12, totalAnonymousParticipants: 3 });
const mockCountOnlineAnonymousParticipants = jest.fn<any>().mockResolvedValue(2);

jest.mock('../../../../routes/links/utils/prisma-queries', () => ({
  findShareLinkByIdentifier: (...args: any[]) => mockFindShareLinkByIdentifier(...args),
  getConversationMessages: (...args: any[]) => mockGetConversationMessages(...args),
  countConversationMessages: (...args: any[]) => mockCountConversationMessages(...args),
  findActiveUserParticipant: (...args: any[]) => mockFindActiveUserParticipant(...args),
  findLinkMembers: (...args: any[]) => mockFindLinkMembers(...args),
  findLinkAnonymousParticipants: (...args: any[]) => mockFindLinkAnonymousParticipants(...args),
  countLinkParticipantsByType: (...args: any[]) => mockCountLinkParticipantsByType(...args),
  countOnlineAnonymousParticipants: (...args: any[]) => mockCountOnlineAnonymousParticipants(...args),
}));

// `loadReaderHistoryFloor` fait sa PROPRE lecture Prisma (`participant.findFirst`,
// indépendante de `prisma-queries.ts`) — `historyReaderFromAuthContext` reste
// RÉEL (fonction pure, patron `jest.requireActual` du dépôt : ne pas
// redéclarer ce qui n'a pas besoin de l'être).
jest.mock('../../../../services/historyFloor', () => {
  const actual = jest.requireActual('../../../../services/historyFloor') as object;
  return {
    ...actual,
    loadReaderHistoryFloor: jest.fn<any>().mockResolvedValue(null),
  };
});

jest.mock('../../../../routes/links/utils/message-formatters', () => ({
  formatMessageWithUnifiedSender: jest.fn((m: any) => m),
}));

jest.mock('../../../../routes/links/utils/link-helpers', () => ({
  createLegacyHybridRequest: jest.fn((req: any) => {
    const ctx = req.authContext;
    if (ctx?.registeredUser) {
      return { isAuthenticated: true, isAnonymous: false, user: ctx.registeredUser, anonymousParticipant: null };
    }
    return { isAuthenticated: false, isAnonymous: false, user: null, anonymousParticipant: null };
  }),
  generateInitialLinkId: jest.fn(() => 'mshy_initial_abc123'),
  generateConversationIdentifier: jest.fn((t: string) => `conv_${t}`),
  generateFinalLinkId: jest.fn((id: string) => `mshy_final_${id}`),
  ensureUniqueShareLinkIdentifier: jest.fn().mockResolvedValue('mshy_unique_link'),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerRetrievalRoutes } from '../../../../routes/links/retrieval';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439022';
const LINK_ID = 'mshy_abc123';

const mockRegisteredUser = {
  id: USER_ID,
  username: 'alice',
  firstName: 'Alice',
  lastName: 'Smith',
  displayName: 'Alice Smith',
  systemLanguage: 'fr',
};

function makeShareLink(overrides: Record<string, any> = {}) {
  return {
    id: 'link-001',
    linkId: LINK_ID,
    conversationId: CONV_ID,
    name: 'Test Link',
    description: null,
    isActive: true,
    allowViewHistory: true,
    allowAnonymousMessages: true,
    allowAnonymousFiles: false,
    allowAnonymousImages: false,
    requireEmail: false,
    requireNickname: false,
    expiresAt: null,
    conversation: {
      id: CONV_ID,
      identifier: 'test-conv',
      title: 'Test Conversation',
      description: null,
      type: 'group',
      createdAt: new Date('2024-01-01'),
      participants: [
        {
          id: 'part-1',
          userId: USER_ID,
          type: 'user',
          role: 'member',
          isActive: true,
          isOnline: false,
          joinedAt: new Date('2024-01-01'),
          canSendMessages: true,
          canSendFiles: true,
          canSendImages: true,
          username: 'alice',
          firstName: 'Alice',
          lastName: 'Smith',
          language: 'fr',
          user: mockRegisteredUser,
        },
      ],
    },
    ...overrides,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function buildApp(opts: {
  auth?: 'registered' | 'none';
  userId?: string;
  prisma?: any;
} = {}): Promise<{ app: FastifyInstance }> {
  const { auth = 'registered', userId = USER_ID, prisma = {} as any } = opts;

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma);

  app.addHook('onRequest', async (req: FastifyRequest) => {
    if (auth === 'registered') {
      (req as any)._testAuthContext = {
        isAuthenticated: true,
        isAnonymous: false,
        userId,
        registeredUser: { ...mockRegisteredUser, id: userId },
        hasFullAccess: true,
      };
    } else {
      (req as any)._testAuthContext = {
        isAuthenticated: false,
        isAnonymous: false,
        userId: null,
        registeredUser: null,
      };
    }
  });

  await registerRetrievalRoutes(app);
  await app.ready();
  return { app };
}

const serve = async (auth: 'registered' | 'none') => {
  mockFindShareLinkByIdentifier.mockResolvedValueOnce(makeShareLink({ isActive: true, allowViewHistory: true }));
  const { app } = await buildApp({ auth, userId: '507f1f77bcf86cd7994390cc' });
  const res = await app.inject({ method: 'GET', url: `/links/${LINK_ID}` });
  await app.close();
  expect(res.statusCode).toBe(200);
  return res.json().data as Record<string, any>;
};

describe('#10205 — GET /links/:identifier lu sans compte Meeshy', () => {
  it('ne sert ni membres ni autres invités', async () => {
    const data = await serve('none');
    expect(data.members).toEqual([]);
    expect(data.anonymousParticipants).toEqual([]);
  });

  it('ne sert aucun effectif — seuls les compteurs de messages restent', async () => {
    const data = await serve('none');
    expect(Object.keys(data.stats).sort()).toEqual(['hasMore', 'totalMessages']);
  });

  it('un compte Meeshy garde les membres et les effectifs', async () => {
    const data = await serve('registered');
    expect(data.members).toHaveLength(1);
    expect(data.anonymousParticipants).toHaveLength(1);
    expect(data.stats).toMatchObject({ totalMembers: 12, totalAnonymousParticipants: 3 });
    expect(data.stats).toHaveProperty('onlineAnonymousParticipants');
  });
});
