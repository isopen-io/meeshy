/**
 * Unit tests for links creation routes (creation.ts)
 * Tests POST /links.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../../utils/logger', () => ({
  logError: jest.fn(),
}));

jest.mock('../../../../utils/sanitize', () => ({
  SecuritySanitizer: {
    sanitizeText: jest.fn((t: string) => t),
  },
}));

jest.mock('../../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn(() => async (req: FastifyRequest) => {
    (req as any).authContext = (req as any)._testAuthContext;
  }),
  isRegisteredUser: jest.fn((ctx: any) => ctx?.registeredUser != null),
  UnifiedAuthRequest: {},
}));

jest.mock('../../../../routes/links/utils/link-helpers', () => ({
  generateInitialLinkId: jest.fn(() => 'mshy_initial_abc123'),
  generateConversationIdentifier: jest.fn((title: string) => `conv_${title.toLowerCase().replace(/\s/g, '_')}`),
  generateFinalLinkId: jest.fn((id: string, _initial: string) => `mshy_final_${id}`),
  ensureUniqueShareLinkIdentifier: jest.fn().mockResolvedValue('mshy_unique_link'),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerCreationRoutes } from '../../../../routes/links/creation';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439022';
const LINK_ID = 'link-001';

const mockUser = { id: USER_ID, role: 'USER', username: 'alice', displayName: 'Alice' };

const mockShareLink = {
  id: LINK_ID,
  linkId: 'mshy_initial_abc123',
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
      findFirst: jest.fn<any>().mockResolvedValue({ id: 'part-1' }),
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    user: {
      findUnique: jest.fn<any>().mockResolvedValue({ displayName: 'Alice', username: 'alice' }),
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    conversationShareLink: {
      create: jest.fn<any>().mockResolvedValue(mockShareLink),
      update: jest.fn<any>().mockResolvedValue({ ...mockShareLink, linkId: `mshy_final_${LINK_ID}` }),
    },
    ...overrides,
  } as any;
}

async function buildApp(opts: {
  auth?: 'registered' | 'anonymous' | 'unauthenticated';
  role?: string;
  prisma?: ReturnType<typeof makePrisma>;
  socketIOHandler?: { getManager: jest.Mock<any> } | null;
} = {}): Promise<{ app: FastifyInstance; prisma: ReturnType<typeof makePrisma> }> {
  const { auth = 'registered', role = 'USER', prisma = makePrisma(), socketIOHandler = null } = opts;

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
        registeredUser: { ...mockUser, role },
        hasFullAccess: true,
      };
    } else if (auth === 'anonymous') {
      (req as any)._testAuthContext = {
        isAuthenticated: false,
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

// ─── POST /links — not registered user ───────────────────────────────────────

describe('POST /links — anonymous user', () => {
  it('returns 403 when not a registered user', async () => {
    const { app } = await buildApp({ auth: 'anonymous' });
    const res = await app.inject({ method: 'POST', url: '/links', payload: {} });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

// ─── POST /links — with conversationId ───────────────────────────────────────

describe('POST /links — not a member of conversation', () => {
  it('returns 403 when user is not a conversation member', async () => {
    const prisma = makePrisma();
    prisma.participant.findFirst = jest.fn<any>().mockResolvedValue(null);
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'POST', url: '/links',
      payload: { conversationId: CONV_ID },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

describe('POST /links — conversation not found', () => {
  it('returns 404 when conversation does not exist', async () => {
    const prisma = makePrisma();
    prisma.conversation.findUnique = jest.fn<any>().mockResolvedValue(null);
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'POST', url: '/links',
      payload: { conversationId: CONV_ID },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('POST /links — direct conversation', () => {
  it('returns 403 for direct conversation type', async () => {
    const prisma = makePrisma();
    prisma.conversation.findUnique = jest.fn<any>().mockResolvedValue({ id: CONV_ID, type: 'direct', title: 'DM' });
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'POST', url: '/links',
      payload: { conversationId: CONV_ID },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

describe('POST /links — global conversation without admin role', () => {
  it('returns 403 when USER tries to create global link', async () => {
    const prisma = makePrisma();
    prisma.conversation.findUnique = jest.fn<any>().mockResolvedValue({ id: CONV_ID, type: 'global', title: 'Global' });
    const { app } = await buildApp({ prisma, role: 'USER' });
    const res = await app.inject({
      method: 'POST', url: '/links',
      payload: { conversationId: CONV_ID },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

describe('POST /links — global conversation with admin role', () => {
  it('returns 201 when ADMIN creates global link', async () => {
    const prisma = makePrisma();
    prisma.conversation.findUnique = jest.fn<any>().mockResolvedValue({ id: CONV_ID, type: 'global', title: 'Global' });
    const { app } = await buildApp({ prisma, role: 'ADMIN' });
    const res = await app.inject({
      method: 'POST', url: '/links',
      payload: { conversationId: CONV_ID },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});

describe('POST /links — success with existing conversation', () => {
  it('returns 201 with linkId when creating link for group conversation', async () => {
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'POST', url: '/links',
      payload: { conversationId: CONV_ID, name: 'My Link' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.conversationId).toBe(CONV_ID);
    await app.close();
  });
});

// ─── POST /links — create new conversation ────────────────────────────────────

describe('POST /links — creates new conversation from newConversation data', () => {
  it('returns 201 when creating link with new conversation', async () => {
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'POST', url: '/links',
      payload: { newConversation: { title: 'Brand New Group' } },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().success).toBe(true);
    await app.close();
  });

  it('auto-joins the creator and members to the new conversation socket room', async () => {
    const MEMBER_ID = '507f1f77bcf86cd799439033';
    const joinUserToConversationRoom = jest.fn<any>().mockResolvedValue(undefined);
    const prisma = makePrisma();
    prisma.user.findMany = jest.fn<any>().mockResolvedValue([
      { id: MEMBER_ID, displayName: 'Member', username: 'member' },
    ]);
    const { app } = await buildApp({
      prisma,
      socketIOHandler: { getManager: jest.fn<any>().mockReturnValue({ joinUserToConversationRoom }) },
    });
    const res = await app.inject({
      method: 'POST', url: '/links',
      payload: { newConversation: { title: 'Brand New Group', memberIds: [MEMBER_ID] } },
    });
    expect(res.statusCode).toBe(201);
    expect(joinUserToConversationRoom).toHaveBeenCalledWith(USER_ID, CONV_ID);
    expect(joinUserToConversationRoom).toHaveBeenCalledWith(MEMBER_ID, CONV_ID);
    await app.close();
  });
});

describe('POST /links — creates legacy conversation without conversationId', () => {
  it('returns 201 with auto-created conversation', async () => {
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'POST', url: '/links',
      payload: { name: 'Legacy Link', description: 'A shared chat' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});

// ─── POST /links — service error ─────────────────────────────────────────────

describe('POST /links — DB error', () => {
  it('returns 500 when conversationShareLink.create throws', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.create = jest.fn<any>().mockRejectedValue(new Error('DB failure'));
    const { app } = await buildApp({ prisma });
    const res = await app.inject({
      method: 'POST', url: '/links',
      payload: { conversationId: CONV_ID },
    });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});
