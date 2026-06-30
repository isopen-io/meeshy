import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify from 'fastify';
import { z } from 'zod';

// ─── mockUpdateLinkParse must be declared before jest.mock calls ──────────────
const mockUpdateLinkParse = jest.fn<any>((body: any) => body);

// ─── Module mocks (hoisted before imports) ───────────────────────────────────

jest.mock('../../../utils/logger', () => ({ logError: jest.fn() }));

jest.mock('../../../utils/sanitize', () => ({
  SecuritySanitizer: { sanitizeText: jest.fn<any>((t: string) => t) },
}));

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn<any>(() => async (req: any) => {
    (req as any).authContext = (req as any)._testAuthContext;
  }),
  isRegisteredUser: jest.fn<any>((ctx: any) => ctx?.registeredUser != null),
  UnifiedAuthRequest: {},
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  errorResponseSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      error: { type: 'string' },
      message: { type: 'string' },
      code: { type: 'string' },
    },
  },
}));

jest.mock('../../../routes/links/types', () => ({
  updateLinkSchema: { parse: (...args: any[]) => mockUpdateLinkParse(...args) },
  updateLinkBodySchema: { type: 'object', properties: {}, additionalProperties: true },
  shareLinkSchema: { type: 'object', properties: {}, additionalProperties: true },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerManagementRoutes } from '../../../routes/links/management';

// ─── Constants ───────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const OTHER_USER_ID = '507f1f77bcf86cd799439022';
const LINK_DB_ID = '507f1f77bcf86cd799439033';
const LINK_PUBLIC_ID = 'mshy_abc123_def456';
const CONV_ID = '507f1f77bcf86cd799439044';

// ─── Factories ────────────────────────────────────────────────────────────────

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    conversationShareLink: {
      findUnique: jest.fn<any>(),
      findFirst: jest.fn<any>(),
      update: jest.fn<any>().mockResolvedValue({ id: LINK_DB_ID, linkId: LINK_PUBLIC_ID }),
    },
    ...overrides,
  } as any;
}

function makeShareLink(overrides: Record<string, any> = {}) {
  return {
    id: LINK_DB_ID,
    linkId: LINK_PUBLIC_ID,
    createdBy: USER_ID,
    conversationId: CONV_ID,
    conversation: {
      id: CONV_ID,
      participants: [],
    },
    ...overrides,
  };
}

function makeParticipant(role: string) {
  return { userId: USER_ID, role, isActive: true };
}

async function buildApp({ auth = 'registered', prisma = makePrisma() }: { auth?: string; prisma?: any } = {}) {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma);

  app.addHook('onRequest', async (req) => {
    if (auth === 'registered') {
      (req as any)._testAuthContext = {
        isAuthenticated: true,
        isAnonymous: false,
        userId: USER_ID,
        registeredUser: { id: USER_ID, role: 'USER' },
        hasFullAccess: true,
      };
    } else {
      (req as any)._testAuthContext = null;
    }
  });

  await registerManagementRoutes(app);
  await app.ready();
  return app;
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT /links/:conversationShareLinkId
// ─────────────────────────────────────────────────────────────────────────────

describe('PUT /links/:conversationShareLinkId', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateLinkParse.mockImplementation((body: any) => body);
  });

  it('returns 403 when user is not a registered user', async () => {
    const app = await buildApp({ auth: 'anonymous' });
    const res = await app.inject({
      method: 'PUT',
      url: `/links/${LINK_DB_ID}`,
      payload: { isActive: false },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('returns 404 when share link not found', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findUnique.mockResolvedValue(null);
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PUT',
      url: `/links/${LINK_DB_ID}`,
      payload: {},
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('returns 403 when user is not creator and not conversation admin', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findUnique.mockResolvedValue(
      makeShareLink({
        createdBy: OTHER_USER_ID,
        conversation: { id: CONV_ID, participants: [] },
      })
    );
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PUT',
      url: `/links/${LINK_DB_ID}`,
      payload: { isActive: false },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('returns 403 when participant is a regular member (not admin/creator)', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findUnique.mockResolvedValue(
      makeShareLink({
        createdBy: OTHER_USER_ID,
        conversation: {
          id: CONV_ID,
          participants: [makeParticipant('member')],
        },
      })
    );
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PUT',
      url: `/links/${LINK_DB_ID}`,
      payload: { isActive: false },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('returns 200 when user is the link creator', async () => {
    const prisma = makePrisma();
    const updatedLink = { id: LINK_DB_ID, isActive: false, linkId: LINK_PUBLIC_ID };
    prisma.conversationShareLink.findUnique.mockResolvedValue(
      makeShareLink({ createdBy: USER_ID, conversation: { id: CONV_ID, participants: [] } })
    );
    prisma.conversationShareLink.update.mockResolvedValue(updatedLink);
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PUT',
      url: `/links/${LINK_DB_ID}`,
      payload: { isActive: false },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.shareLink).toMatchObject({ id: LINK_DB_ID });
    await app.close();
  });

  it('returns 200 when user is conversation admin', async () => {
    const prisma = makePrisma();
    const updatedLink = { id: LINK_DB_ID, isActive: true, linkId: LINK_PUBLIC_ID };
    prisma.conversationShareLink.findUnique.mockResolvedValue(
      makeShareLink({
        createdBy: OTHER_USER_ID,
        conversation: {
          id: CONV_ID,
          participants: [makeParticipant('admin')],
        },
      })
    );
    prisma.conversationShareLink.update.mockResolvedValue(updatedLink);
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PUT',
      url: `/links/${LINK_DB_ID}`,
      payload: { name: 'Updated Name' },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('returns 200 when user is conversation creator', async () => {
    const prisma = makePrisma();
    const updatedLink = { id: LINK_DB_ID, name: 'Creator Update', linkId: LINK_PUBLIC_ID };
    prisma.conversationShareLink.findUnique.mockResolvedValue(
      makeShareLink({
        createdBy: OTHER_USER_ID,
        conversation: {
          id: CONV_ID,
          participants: [makeParticipant('creator')],
        },
      })
    );
    prisma.conversationShareLink.update.mockResolvedValue(updatedLink);
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PUT',
      url: `/links/${LINK_DB_ID}`,
      payload: { name: 'Creator Update' },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('returns 400 on ZodError', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findUnique.mockResolvedValue(
      makeShareLink({ createdBy: USER_ID, conversation: { id: CONV_ID, participants: [] } })
    );
    mockUpdateLinkParse.mockImplementationOnce(() => {
      throw new z.ZodError([
        { code: 'custom', message: 'maxUses must be an integer', path: ['maxUses'] },
      ]);
    });
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PUT',
      url: `/links/${LINK_DB_ID}`,
      payload: { maxUses: 1.5 },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.message).toBe('Données invalides');
    await app.close();
  });

  it('returns 500 on unexpected DB error', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findUnique.mockRejectedValue(new Error('DB connection lost'));
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PUT',
      url: `/links/${LINK_DB_ID}`,
      payload: {},
    });
    expect(res.statusCode).toBe(500);
    await app.close();
  });

  it('returns 500 when update throws', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findUnique.mockResolvedValue(
      makeShareLink({ createdBy: USER_ID, conversation: { id: CONV_ID, participants: [] } })
    );
    prisma.conversationShareLink.update.mockRejectedValue(new Error('Write failed'));
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PUT',
      url: `/links/${LINK_DB_ID}`,
      payload: { name: 'Test' },
    });
    expect(res.statusCode).toBe(500);
    await app.close();
  });

  it('calls update with sanitized name and description', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findUnique.mockResolvedValue(
      makeShareLink({ createdBy: USER_ID, conversation: { id: CONV_ID, participants: [] } })
    );
    prisma.conversationShareLink.update.mockResolvedValue({ id: LINK_DB_ID });
    const app = await buildApp({ prisma });
    await app.inject({
      method: 'PUT',
      url: `/links/${LINK_DB_ID}`,
      payload: { name: 'My Link', description: 'A description' },
    });
    expect(prisma.conversationShareLink.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: LINK_DB_ID },
        data: expect.objectContaining({ name: 'My Link', description: 'A description' }),
      })
    );
    await app.close();
  });

  it('converts expiresAt string to Date on update', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findUnique.mockResolvedValue(
      makeShareLink({ createdBy: USER_ID, conversation: { id: CONV_ID, participants: [] } })
    );
    prisma.conversationShareLink.update.mockResolvedValue({ id: LINK_DB_ID });
    const expiresAt = '2030-12-31T00:00:00.000Z';
    const app = await buildApp({ prisma });
    await app.inject({
      method: 'PUT',
      url: `/links/${LINK_DB_ID}`,
      payload: { expiresAt },
    });
    const updateCall = prisma.conversationShareLink.update.mock.calls[0][0];
    expect(updateCall.data.expiresAt).toBeInstanceOf(Date);
    await app.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /links/:linkId
// ─────────────────────────────────────────────────────────────────────────────

describe('PATCH /links/:linkId', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateLinkParse.mockImplementation((body: any) => body);
  });

  it('returns 403 when user is not a registered user', async () => {
    const app = await buildApp({ auth: 'anonymous' });
    const res = await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_PUBLIC_ID}`,
      payload: { isActive: false },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('returns 404 when share link not found by linkId', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findFirst.mockResolvedValue(null);
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_PUBLIC_ID}`,
      payload: {},
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('returns 403 when user is not creator and not conversation admin/moderator', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findFirst.mockResolvedValue(
      makeShareLink({
        createdBy: OTHER_USER_ID,
        conversation: { id: CONV_ID, participants: [] },
      })
    );
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_PUBLIC_ID}`,
      payload: { isActive: false },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('returns 403 when participant has role "admin" (lowercase, PATCH uses uppercase ADMIN/MODERATOR)', async () => {
    const prisma = makePrisma();
    // PATCH route checks for 'ADMIN' and 'MODERATOR' (uppercase), not 'admin'/'creator'
    prisma.conversationShareLink.findFirst.mockResolvedValue(
      makeShareLink({
        createdBy: OTHER_USER_ID,
        conversation: {
          id: CONV_ID,
          participants: [{ userId: USER_ID, role: 'admin', isActive: true }],
        },
      })
    );
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_PUBLIC_ID}`,
      payload: { isActive: false },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('returns 200 when user is the link creator', async () => {
    const prisma = makePrisma();
    const updatedLink = {
      id: LINK_DB_ID,
      linkId: LINK_PUBLIC_ID,
      isActive: false,
      conversation: { id: CONV_ID, title: 'Test', description: null, type: 'group', isActive: true, createdAt: new Date(), updatedAt: new Date() },
      creator: { id: USER_ID, username: 'user', firstName: 'F', lastName: 'L', displayName: null, avatar: null },
    };
    prisma.conversationShareLink.findFirst.mockResolvedValue(
      makeShareLink({ createdBy: USER_ID, conversation: { id: CONV_ID, participants: [] } })
    );
    prisma.conversationShareLink.update.mockResolvedValue(updatedLink);
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_PUBLIC_ID}`,
      payload: { isActive: false },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    await app.close();
  });

  it('returns 200 when user has ADMIN role in conversation', async () => {
    const prisma = makePrisma();
    const updatedLink = {
      id: LINK_DB_ID,
      linkId: LINK_PUBLIC_ID,
      conversation: { id: CONV_ID, title: 'T', description: null, type: 'group', isActive: true, createdAt: new Date(), updatedAt: new Date() },
      creator: { id: OTHER_USER_ID, username: 'other', firstName: null, lastName: null, displayName: null, avatar: null },
    };
    prisma.conversationShareLink.findFirst.mockResolvedValue(
      makeShareLink({
        createdBy: OTHER_USER_ID,
        conversation: {
          id: CONV_ID,
          participants: [{ userId: USER_ID, role: 'ADMIN', isActive: true }],
        },
      })
    );
    prisma.conversationShareLink.update.mockResolvedValue(updatedLink);
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_PUBLIC_ID}`,
      payload: { name: 'Admin update' },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('returns 200 when user has MODERATOR role in conversation', async () => {
    const prisma = makePrisma();
    const updatedLink = {
      id: LINK_DB_ID,
      linkId: LINK_PUBLIC_ID,
      conversation: { id: CONV_ID, title: 'T', description: null, type: 'group', isActive: true, createdAt: new Date(), updatedAt: new Date() },
      creator: { id: OTHER_USER_ID, username: 'other', firstName: null, lastName: null, displayName: null, avatar: null },
    };
    prisma.conversationShareLink.findFirst.mockResolvedValue(
      makeShareLink({
        createdBy: OTHER_USER_ID,
        conversation: {
          id: CONV_ID,
          participants: [{ userId: USER_ID, role: 'MODERATOR', isActive: true }],
        },
      })
    );
    prisma.conversationShareLink.update.mockResolvedValue(updatedLink);
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_PUBLIC_ID}`,
      payload: { isActive: true },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('returns 400 on ZodError', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findFirst.mockResolvedValue(
      makeShareLink({ createdBy: USER_ID, conversation: { id: CONV_ID, participants: [] } })
    );
    mockUpdateLinkParse.mockImplementationOnce(() => {
      throw new z.ZodError([
        { code: 'custom', message: 'maxUses must be an integer', path: ['maxUses'] },
      ]);
    });
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_PUBLIC_ID}`,
      payload: { maxUses: 1.5 },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.message).toBe('Données invalides');
    await app.close();
  });

  it('returns 500 on unexpected DB error', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findFirst.mockRejectedValue(new Error('Network timeout'));
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_PUBLIC_ID}`,
      payload: {},
    });
    expect(res.statusCode).toBe(500);
    await app.close();
  });

  it('returns 500 when update throws', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findFirst.mockResolvedValue(
      makeShareLink({ createdBy: USER_ID, conversation: { id: CONV_ID, participants: [] } })
    );
    prisma.conversationShareLink.update.mockRejectedValue(new Error('Write failed'));
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_PUBLIC_ID}`,
      payload: { name: 'Test' },
    });
    expect(res.statusCode).toBe(500);
    await app.close();
  });

  it('only includes provided fields in update data', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findFirst.mockResolvedValue(
      makeShareLink({ createdBy: USER_ID, conversation: { id: CONV_ID, participants: [] } })
    );
    prisma.conversationShareLink.update.mockResolvedValue({ id: LINK_DB_ID });
    const app = await buildApp({ prisma });
    await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_PUBLIC_ID}`,
      payload: { name: 'OnlyName' },
    });
    const updateCall = prisma.conversationShareLink.update.mock.calls[0][0];
    expect(updateCall.data).toHaveProperty('name', 'OnlyName');
    expect(updateCall.data).not.toHaveProperty('description');
    expect(updateCall.data).not.toHaveProperty('maxUses');
    await app.close();
  });

  it('sets expiresAt to null when provided as null', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findFirst.mockResolvedValue(
      makeShareLink({ createdBy: USER_ID, conversation: { id: CONV_ID, participants: [] } })
    );
    prisma.conversationShareLink.update.mockResolvedValue({ id: LINK_DB_ID });
    const app = await buildApp({ prisma });
    await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_PUBLIC_ID}`,
      payload: { expiresAt: null },
    });
    const updateCall = prisma.conversationShareLink.update.mock.calls[0][0];
    expect(updateCall.data.expiresAt).toBeNull();
    await app.close();
  });

  it('converts expiresAt string to Date on update', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findFirst.mockResolvedValue(
      makeShareLink({ createdBy: USER_ID, conversation: { id: CONV_ID, participants: [] } })
    );
    prisma.conversationShareLink.update.mockResolvedValue({ id: LINK_DB_ID });
    const expiresAt = '2030-06-15T12:00:00.000Z';
    const app = await buildApp({ prisma });
    await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_PUBLIC_ID}`,
      payload: { expiresAt },
    });
    const updateCall = prisma.conversationShareLink.update.mock.calls[0][0];
    expect(updateCall.data.expiresAt).toBeInstanceOf(Date);
    await app.close();
  });

  it('uses findUnique for PUT and findFirst for PATCH (by linkId)', async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findFirst.mockResolvedValue(
      makeShareLink({ createdBy: USER_ID, conversation: { id: CONV_ID, participants: [] } })
    );
    prisma.conversationShareLink.update.mockResolvedValue({ id: LINK_DB_ID });
    const app = await buildApp({ prisma });
    await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_PUBLIC_ID}`,
      payload: {},
    });
    expect(prisma.conversationShareLink.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { linkId: LINK_PUBLIC_ID } })
    );
    expect(prisma.conversationShareLink.findUnique).not.toHaveBeenCalled();
    await app.close();
  });

  it('response includes message field on success', async () => {
    const prisma = makePrisma();
    const updatedLink = {
      id: LINK_DB_ID,
      linkId: LINK_PUBLIC_ID,
      conversation: { id: CONV_ID, title: 'T', description: null, type: 'group', isActive: true, createdAt: new Date(), updatedAt: new Date() },
      creator: { id: USER_ID, username: 'user', firstName: null, lastName: null, displayName: null, avatar: null },
    };
    prisma.conversationShareLink.findFirst.mockResolvedValue(
      makeShareLink({ createdBy: USER_ID, conversation: { id: CONV_ID, participants: [] } })
    );
    prisma.conversationShareLink.update.mockResolvedValue(updatedLink);
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'PATCH',
      url: `/links/${LINK_PUBLIC_ID}`,
      payload: { isActive: true },
    });
    const body = JSON.parse(res.body);
    expect(body.message).toBe('Lien mis à jour avec succès');
    await app.close();
  });
});
