/**
 * MeeshySocketIOHandler.setupSocketIO — route-level unit tests
 *
 * Exercises the two admin routes registered by setupSocketIO:
 *   GET  /api/socketio/stats
 *   POST /api/socketio/disconnect-user
 *
 * MeeshySocketIOManager and requireAdmin are fully mocked so there is
 * no real Socket.IO or JWT validation in these tests.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

// ─── Mocks (hoisted) ─────────────────────────────────────────────────────────

const mockManagerInstance = {
  initialize: jest.fn<any>().mockResolvedValue(undefined),
  getStats: jest.fn<any>().mockReturnValue({ connectedUsers: 3, rooms: 5 }),
  disconnectUser: jest.fn<any>().mockReturnValue(true),
};

jest.mock('../../../socketio/MeeshySocketIOManager', () => ({
  MeeshySocketIOManager: jest.fn().mockImplementation(() => mockManagerInstance),
}));

jest.mock('../../../services/message-translation/MessageTranslationService', () => ({
  MessageTranslationService: jest.fn(),
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// requireAdmin is a preHandler — mock it as a passthrough
jest.mock('../../../middleware/auth', () => ({
  requireAdmin: jest.fn<any>(async (_req: unknown, _rep: unknown) => undefined),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { MeeshySocketIOHandler } from '../../../socketio/MeeshySocketIOHandler';

// ─── App builder ──────────────────────────────────────────────────────────────

async function buildApp(opts: {
  managerOverrides?: Partial<typeof mockManagerInstance>;
} = {}): Promise<FastifyInstance> {
  // Apply any per-test overrides
  if (opts.managerOverrides) {
    Object.assign(mockManagerInstance, opts.managerOverrides);
  }

  const app = Fastify({ logger: false });

  // Satisfy the `fastify.authenticate` decorator used in route preHandlers
  app.decorate('authenticate', async (_req: FastifyRequest, _rep: FastifyReply) => undefined);

  const handler = new MeeshySocketIOHandler({} as any, 'secret', {} as any);
  await handler.setupSocketIO(app);

  await app.ready();
  return app;
}

// ─── GET /api/socketio/stats ──────────────────────────────────────────────────

describe('GET /api/socketio/stats', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(() => app.close());

  beforeEach(() => jest.clearAllMocks());

  it('returns 200 with stats from the manager', async () => {
    mockManagerInstance.getStats.mockReturnValue({ connectedUsers: 3, rooms: 5 });

    const res = await app.inject({ method: 'GET', url: '/api/socketio/stats' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.connectedUsers).toBe(3);
    expect(body.data.timestamp).toBeDefined();
  });

  it('returns 500 when getStats throws', async () => {
    mockManagerInstance.getStats.mockImplementation(() => { throw new Error('stats error'); });

    const res = await app.inject({ method: 'GET', url: '/api/socketio/stats' });

    expect(res.statusCode).toBe(500);
    expect(res.json().success).toBe(false);
  });
});

// ─── POST /api/socketio/disconnect-user ──────────────────────────────────────

describe('POST /api/socketio/disconnect-user', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(() => app.close());

  beforeEach(() => {
    jest.clearAllMocks();
    mockManagerInstance.disconnectUser.mockReturnValue(true);
    mockManagerInstance.getStats.mockReturnValue({ connectedUsers: 3, rooms: 5 });
  });

  it('returns 200 when user is found and disconnected', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/socketio/disconnect-user',
      headers: { 'content-type': 'application/json' },
      payload: { userId: 'user-abc' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.message).toContain('user-abc');
  });

  it('returns 404 when user is not connected (disconnectUser returns false)', async () => {
    mockManagerInstance.disconnectUser.mockReturnValue(false);

    const res = await app.inject({
      method: 'POST', url: '/api/socketio/disconnect-user',
      headers: { 'content-type': 'application/json' },
      payload: { userId: 'user-xyz' },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().success).toBe(false);
  });

  it('returns 400 when userId is missing from body', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/socketio/disconnect-user',
      headers: { 'content-type': 'application/json' },
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().success).toBe(false);
  });

  it('returns 500 when disconnectUser throws', async () => {
    mockManagerInstance.disconnectUser.mockImplementation(() => { throw new Error('disconnect failed'); });

    const res = await app.inject({
      method: 'POST', url: '/api/socketio/disconnect-user',
      headers: { 'content-type': 'application/json' },
      payload: { userId: 'user-abc' },
    });

    expect(res.statusCode).toBe(500);
    expect(res.json().success).toBe(false);
  });

  it('returns 500 when socketIOManager is null', async () => {
    // Build a fresh handler where we never assign the manager
    const nullApp = Fastify({ logger: false });
    nullApp.decorate('authenticate', async (_req: FastifyRequest, _rep: FastifyReply) => undefined);

    const handler = new MeeshySocketIOHandler({} as any, 'secret', {} as any);
    // Override: make initialize() NOT set socketIOManager
    mockManagerInstance.initialize.mockResolvedValueOnce(undefined);
    // Manually clear the internal manager after setup
    await handler.setupSocketIO(nullApp);
    (handler as any).socketIOManager = null;
    await nullApp.ready();

    const res = await nullApp.inject({
      method: 'POST', url: '/api/socketio/disconnect-user',
      headers: { 'content-type': 'application/json' },
      payload: { userId: 'user-abc' },
    });

    expect(res.statusCode).toBe(500);
    await nullApp.close();
  });
});
