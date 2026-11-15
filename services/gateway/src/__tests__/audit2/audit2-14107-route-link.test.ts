/**
 * Contre-audit #14107 — témoin de ROUTE POST /links (newConversation.memberIds), decideOpenings réel
 * Tests POST /links.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../services/relations/pairAccess', () => ({
  pairAccessAmong: jest.fn(async (_p: unknown, params: any) =>
    new Map(params.otherIds.map((id: string) => [id, { allowed: params.feature === 'dm.request', effectiveLevel: 'PUBLIC', reason: 'level' }]))),
}));

jest.mock('../../utils/logger', () => ({
  logError: jest.fn(),
}));

// Directive porteur du 2026-11-01 : une conversation naît chiffrée au repos,
// sous une clé obtenue avant sa création.
jest.mock('../../services/EncryptionService', () => ({
  getEncryptionService: jest.fn(async () => ({ activationKeyId: async () => 'server-key' })),
}));

jest.mock('../../utils/sanitize', () => ({
  SecuritySanitizer: {
    sanitizeText: jest.fn((t: string) => t),
  },
}));

// #6437 — le double reproduit désormais les deux refus PRÉCOCES de la vraie
// `createUnifiedAuthMiddleware` (requireAuth / allowAnonymous), pour que
// `requireEmailVerification` — montée juste après sur la route réelle — ne
// voie jamais un appelant anonyme : c'est `authRequired` qui le refuse
// d'abord, exactement comme en production.
jest.mock('../../middleware/auth', () => ({
  ...(jest.requireActual('../../middleware/auth') as object),
  createUnifiedAuthMiddleware: jest.fn(
    (_prisma: unknown, options: { requireAuth?: boolean; allowAnonymous?: boolean } = {}) =>
      async (req: FastifyRequest, reply: FastifyReply) => {
        const ctx = (req as any)._testAuthContext;
        if (options.requireAuth && !ctx?.isAuthenticated) {
          reply.status(401).send({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
          return;
        }
        if (!options.allowAnonymous && ctx?.isAnonymous && ctx?.type !== 'user') {
          reply.status(403).send({ error: 'Registered user required', code: 'REGISTERED_USER_REQUIRED' });
          return;
        }
        (req as any).authContext = ctx;
      }
  ),
  isRegisteredUser: jest.fn((ctx: any) => ctx?.registeredUser != null),
  UnifiedAuthRequest: {},
}));

// PROLONGER le module, jamais le REMPLACER (CLAUDE.md § « Un double PARTIEL
// d'un module perd en silence tout ce que le module GAGNE »). Ce double listait
// quatre exports à la main ; le jour où la route en a appelé un cinquième
// (`generateUniqueShareLinkId`, 2026-08-23), elle a reçu `undefined` et rendu
// 500 — la panne du cycle 91 rejouée à l'identique. Seul le générateur de
// linkId est surchargé, pour que l'identifiant reste PRÉDICTIBLE dans les
// assertions ; sa vraie loi est testée dans `link-helpers.test.ts`.
jest.mock('../../routes/links/utils/link-helpers', () => ({
  ...(jest.requireActual('../../routes/links/utils/link-helpers') as object),
  generateUniqueShareLinkId: jest.fn<any>().mockResolvedValue('mshy_TestLnk1'),
  generateConversationIdentifier: jest.fn((title: string) => `conv_${title.toLowerCase().replace(/\s/g, '_')}`),
  ensureUniqueShareLinkIdentifier: jest.fn<any>().mockResolvedValue('mshy_unique_link'),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerCreationRoutes } from '../../routes/links/creation';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439022';
const LINK_ID = 'link-001';

const mockUser = { id: USER_ID, role: 'USER', username: 'alice', displayName: 'Alice', emailVerifiedAt: new Date() };

const mockShareLink = {
  id: LINK_ID,
  linkId: 'mshy_TestLnk1',
  name: null,
  description: null,
  expiresAt: null,
  isActive: true,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    conversation: {
      findFirst: jest.fn<any>().mockResolvedValue({ id: CONV_ID }),
      findUnique: jest.fn<any>().mockResolvedValue({ id: CONV_ID, type: 'group', title: 'Test Conv' }),
      create: jest.fn<any>().mockResolvedValue({ id: CONV_ID, title: 'New Conv' }),
    },
    participant: {
      // `Participant.role` est une colonne REQUISE : une ligne sans rang n'existe
      // pas, et la loi d'autorité lit son absence comme « aucune ligne » (#11217).
      findFirst: jest.fn<any>().mockResolvedValue({ id: 'part-1', role: 'member' }),
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    user: {
      findUnique: jest.fn<any>().mockResolvedValue({ displayName: 'Alice', username: 'alice' }),
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    conversationShareLink: {
      create: jest.fn<any>().mockResolvedValue(mockShareLink),
    },
    ...overrides,
  } as any;
}

async function buildApp(opts: {
  auth?: 'registered' | 'anonymous' | 'unauthenticated';
  role?: string;
  prisma?: ReturnType<typeof makePrisma>;
  socketIOHandler?: { getManager: jest.Mock<any> } | null;
  emailVerified?: boolean;
  activation?: { phase: 'quiet' | 'invite' | 'blocked' | 'done'; deadline: string | null; missing: string[] };
} = {}): Promise<{ app: FastifyInstance; prisma: ReturnType<typeof makePrisma> }> {
  const { auth = 'registered', role = 'USER', prisma = makePrisma(), socketIOHandler = null, emailVerified = true, activation } = opts;

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma);
  if (socketIOHandler) app.decorate('socketIOHandler', socketIOHandler);

  // Set _testAuthContext early (onRequest) so the mocked auth middleware can read it
  app.addHook('onRequest', async (req: FastifyRequest) => {
    if (auth === 'registered') {
      (req as any)._testAuthContext = {
        isAuthenticated: true,
        isAnonymous: false,
        userId: USER_ID,
        registeredUser: { ...mockUser, role, emailVerifiedAt: emailVerified ? new Date() : null, ...(activation ? { activation } : {}) },
        hasFullAccess: true,
      };
    } else if (auth === 'anonymous') {
      // #6437 — forme RÉELLE d'une session anonyme valide (`middleware/auth.ts`,
      // `createAuthContext`) : `isAuthenticated: true` ; c'est `isAnonymous`
      // qui la distingue d'un inscrit, jamais l'absence de session.
      (req as any)._testAuthContext = {
        isAuthenticated: true,
        isAnonymous: true,
        userId: 'anon-1',
        registeredUser: null,
      };
    } else {
      (req as any)._testAuthContext = null;
    }
  });

  await registerCreationRoutes(app);
  await app.ready();
  return { app, prisma };
}

describe('contre-audit #14107 — POST /links fait entrer un inconnu par sa boîte de demandes', () => {
  it('pose la demande sur la ligne du membre que le créateur y met', async () => {
    const MEMBER_ID = '507f1f77bcf86cd799439033';
    const prisma = makePrisma();
    prisma.user.findMany = jest.fn<any>().mockResolvedValue([{ id: MEMBER_ID, displayName: 'Member', username: 'member', birthDate: new Date('1990-01-01') }]);
    prisma.user.findUnique = jest.fn<any>().mockResolvedValue({ displayName: 'Alice', username: 'alice', createdAt: new Date('2025-01-01') });
    prisma.participant.count = jest.fn<any>().mockResolvedValue(0);
    const { app } = await buildApp({ prisma });
    const res = await app.inject({ method: 'POST', url: '/links', payload: { newConversation: { title: 'Brand New Group', memberIds: [MEMBER_ID] } } });
    await app.close();
    expect(res.statusCode).toBe(201);
    const created = prisma.conversation.create.mock.calls.map((c: any) => c[0]).find((a: any) => a?.data?.participants);
    const member = created.data.participants.create.find((p: any) => p.userId === MEMBER_ID);
    expect({ request: member.messageRequestAt instanceof Date, leaks: res.body.includes('messageRequest') }).toEqual({ request: true, leaks: false });
  });
});
