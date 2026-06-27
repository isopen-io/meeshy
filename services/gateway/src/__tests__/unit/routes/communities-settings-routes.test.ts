/**
 * communities-settings-routes.test.ts
 *
 * Unit tests for src/routes/communities/settings.ts
 * Covers:
 *   PUT  /communities/:id — update community (creator only)
 *   DELETE /communities/:id — delete community (creator only)
 */

// ---------------------------------------------------------------------------
// Module mocks (ALL jest.mock calls BEFORE any imports)
// ---------------------------------------------------------------------------

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  communitySchema: { type: 'object', additionalProperties: true },
  updateCommunityRequestSchema: { type: 'object', additionalProperties: true },
  errorResponseSchema: { type: 'object', additionalProperties: true },
}));

jest.mock('../../../middleware/auth', () => ({
  UnifiedAuthRequest: {},
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { registerSettingsRoutes } from '../../../routes/communities/settings';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_ID = '507f1f77bcf86cd799439011';
const OTHER_USER_ID = '507f1f77bcf86cd799439099';
const COMM_ID = '507f1f77bcf86cd799439012';

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

const mockCommunity = {
  findFirst: jest.fn<any>(),
  findUnique: jest.fn<any>(),
  update: jest.fn<any>().mockResolvedValue({
    id: COMM_ID,
    name: 'Updated',
    identifier: 'mshy_updated',
    creator: {},
    _count: { members: 1, Conversation: 0 },
  }),
  delete: jest.fn<any>().mockResolvedValue({}),
};

const mockPrisma: any = { community: mockCommunity };

// ---------------------------------------------------------------------------
// App builder
// ---------------------------------------------------------------------------

function buildApp(authContext?: any): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate('prisma', mockPrisma);
  app.decorate('authenticate', async (req: any) => {
    req.authContext = authContext ?? {
      isAuthenticated: true,
      userId: USER_ID,
      registeredUser: { id: USER_ID },
    };
  });
  app.register(registerSettingsRoutes);
  return app;
}

// ---------------------------------------------------------------------------
// PUT /communities/:id
// ---------------------------------------------------------------------------

describe('PUT /communities/:id', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns 200 when update succeeds (user is creator, simple name change)', async () => {
    mockCommunity.findFirst.mockResolvedValue({
      createdBy: USER_ID,
      identifier: 'mshy_old',
    });

    const res = await app.inject({
      method: 'PUT',
      url: `/communities/${COMM_ID}`,
      payload: { name: 'Updated' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({ id: COMM_ID, name: 'Updated' });
  });

  it('returns 200 when update includes a new identifier that is unique', async () => {
    mockCommunity.findFirst.mockResolvedValue({
      createdBy: USER_ID,
      identifier: 'mshy_old',
    });
    mockCommunity.findUnique.mockResolvedValue(null); // new identifier not taken

    const res = await app.inject({
      method: 'PUT',
      url: `/communities/${COMM_ID}`,
      payload: { name: 'Updated', identifier: 'newhandle' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
  });

  it('returns 200 when new identifier equals the existing one (no uniqueness check)', async () => {
    // generateIdentifier('Updated', 'mshy_old') → 'mshy_old' (already prefixed)
    mockCommunity.findFirst.mockResolvedValue({
      createdBy: USER_ID,
      identifier: 'mshy_old',
    });

    const res = await app.inject({
      method: 'PUT',
      url: `/communities/${COMM_ID}`,
      payload: { name: 'Updated', identifier: 'mshy_old' },
    });

    expect(res.statusCode).toBe(200);
    // findUnique must NOT have been called — same identifier, skip uniqueness check
    expect(mockCommunity.findUnique).not.toHaveBeenCalled();
  });

  it('returns 401 when not authenticated (isAuthenticated: false)', async () => {
    const unauthApp = buildApp({
      isAuthenticated: false,
      userId: USER_ID,
      registeredUser: null,
    });

    const res = await unauthApp.inject({
      method: 'PUT',
      url: `/communities/${COMM_ID}`,
      payload: { name: 'Updated' },
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);

    await unauthApp.close();
  });

  it('returns 401 when authContext has no registeredUser', async () => {
    const unauthApp = buildApp({
      isAuthenticated: true,
      userId: USER_ID,
      registeredUser: null,
    });

    const res = await unauthApp.inject({
      method: 'PUT',
      url: `/communities/${COMM_ID}`,
      payload: { name: 'Updated' },
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);

    await unauthApp.close();
  });

  it('returns 404 when community not found', async () => {
    mockCommunity.findFirst.mockResolvedValue(null);

    const res = await app.inject({
      method: 'PUT',
      url: `/communities/${COMM_ID}`,
      payload: { name: 'Updated' },
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/not found/i);
  });

  it('returns 403 when user is not the creator', async () => {
    mockCommunity.findFirst.mockResolvedValue({
      createdBy: OTHER_USER_ID, // different user owns this community
      identifier: 'mshy_old',
    });

    const res = await app.inject({
      method: 'PUT',
      url: `/communities/${COMM_ID}`,
      payload: { name: 'Updated' },
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/creator/i);
  });

  it('returns 409 when new identifier is already taken', async () => {
    mockCommunity.findFirst.mockResolvedValue({
      createdBy: USER_ID,
      identifier: 'mshy_old',
    });
    // findUnique returns a community — identifier already exists
    mockCommunity.findUnique.mockResolvedValue({ id: 'existing-id', identifier: 'mshy_taken' });

    const res = await app.inject({
      method: 'PUT',
      url: `/communities/${COMM_ID}`,
      payload: { name: 'Updated', identifier: 'taken' },
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/already exists/i);
  });

  it('returns 500 on DB error in findFirst', async () => {
    mockCommunity.findFirst.mockRejectedValue(new Error('DB connection lost'));

    const res = await app.inject({
      method: 'PUT',
      url: `/communities/${COMM_ID}`,
      payload: { name: 'Updated' },
    });

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
  });

  it('returns 500 on DB error in update', async () => {
    mockCommunity.findFirst.mockResolvedValue({
      createdBy: USER_ID,
      identifier: 'mshy_old',
    });
    mockCommunity.update.mockRejectedValueOnce(new Error('Write failed'));

    const res = await app.inject({
      method: 'PUT',
      url: `/communities/${COMM_ID}`,
      payload: { name: 'Updated' },
    });

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
  });

  it('returns 200 with only optional fields updated (no name or identifier)', async () => {
    mockCommunity.findFirst.mockResolvedValue({
      createdBy: USER_ID,
      identifier: 'mshy_old',
    });

    const res = await app.inject({
      method: 'PUT',
      url: `/communities/${COMM_ID}`,
      payload: { description: 'New description', isPrivate: false },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    // identifier branch not entered when identifier is undefined
    expect(mockCommunity.findUnique).not.toHaveBeenCalled();
  });

  it('returns 200 with banner and avatar fields', async () => {
    mockCommunity.findFirst.mockResolvedValue({
      createdBy: USER_ID,
      identifier: 'mshy_old',
    });

    const res = await app.inject({
      method: 'PUT',
      url: `/communities/${COMM_ID}`,
      payload: {
        name: 'Updated',
        avatar: 'https://cdn.example.com/avatar.png',
        banner: 'https://cdn.example.com/banner.png',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(mockCommunity.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          avatar: 'https://cdn.example.com/avatar.png',
          banner: 'https://cdn.example.com/banner.png',
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// DELETE /communities/:id
// ---------------------------------------------------------------------------

describe('DELETE /communities/:id', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns 200 when delete succeeds', async () => {
    mockCommunity.findFirst.mockResolvedValue({ createdBy: USER_ID });

    const res = await app.inject({
      method: 'DELETE',
      url: `/communities/${COMM_ID}`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({ message: 'Community deleted successfully' });
    expect(mockCommunity.delete).toHaveBeenCalledWith({ where: { id: COMM_ID } });
  });

  it('returns 401 when not authenticated (isAuthenticated: false)', async () => {
    const unauthApp = buildApp({
      isAuthenticated: false,
      userId: USER_ID,
      registeredUser: null,
    });

    const res = await unauthApp.inject({
      method: 'DELETE',
      url: `/communities/${COMM_ID}`,
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);

    await unauthApp.close();
  });

  it('returns 401 when authContext is missing registeredUser', async () => {
    const unauthApp = buildApp({
      isAuthenticated: true,
      userId: USER_ID,
      registeredUser: undefined,
    });

    const res = await unauthApp.inject({
      method: 'DELETE',
      url: `/communities/${COMM_ID}`,
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);

    await unauthApp.close();
  });

  it('returns 403 when user is not the creator', async () => {
    mockCommunity.findFirst.mockResolvedValue({ createdBy: OTHER_USER_ID });

    const res = await app.inject({
      method: 'DELETE',
      url: `/communities/${COMM_ID}`,
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/creator/i);
  });

  it('returns 404 when community not found', async () => {
    mockCommunity.findFirst.mockResolvedValue(null);

    const res = await app.inject({
      method: 'DELETE',
      url: `/communities/${COMM_ID}`,
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/not found/i);
  });

  it('returns 500 on DB error in findFirst', async () => {
    mockCommunity.findFirst.mockRejectedValue(new Error('DB timeout'));

    const res = await app.inject({
      method: 'DELETE',
      url: `/communities/${COMM_ID}`,
    });

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
  });

  it('returns 500 on DB error in delete', async () => {
    mockCommunity.findFirst.mockResolvedValue({ createdBy: USER_ID });
    mockCommunity.delete.mockRejectedValueOnce(new Error('Delete failed'));

    const res = await app.inject({
      method: 'DELETE',
      url: `/communities/${COMM_ID}`,
    });

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
  });
});
