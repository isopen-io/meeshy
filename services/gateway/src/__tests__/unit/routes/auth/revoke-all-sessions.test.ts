/**
 * Unit tests for revoke-all-sessions auth route.
 * Tests GET /auth/revoke-all-sessions.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn(),
    })),
  },
}));

const mockInvalidateAllSessions = jest.fn<any>().mockResolvedValue(3);
jest.mock('../../../../services/SessionService', () => ({
  invalidateAllSessions: (...args: any[]) => mockInvalidateAllSessions(...args),
}));

// jsonwebtoken is mocked so we can control payload without real JWTs
const mockVerify = jest.fn<any>();
jest.mock('jsonwebtoken', () => ({
  default: { verify: (...args: any[]) => mockVerify(...args) },
  verify: (...args: any[]) => mockVerify(...args),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerRevokeAllSessionsRoute } from '../../../../routes/auth/revoke-all-sessions';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function buildApp(socketIOHandler?: unknown): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  if (socketIOHandler) (app as any).socketIOHandler = socketIOHandler;
  registerRevokeAllSessionsRoute({ fastify: app } as any);
  await app.ready();
  return app;
}

/**
 * A Socket.IO stand-in exposing only what the route reaches through:
 * `socketIOHandler.getManager().getIO().in(room).fetchSockets()`.
 */
function makeSocketIOHandler(sockets: Array<{ emit: any; disconnect: any }>) {
  const rooms: string[] = [];
  const io = {
    in: (room: string) => {
      rooms.push(room);
      return { fetchSockets: async () => sockets };
    },
  };
  return {
    rooms,
    handler: { getManager: () => ({ getIO: () => io }) },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /auth/revoke-all-sessions — invalid token', () => {
  it('returns 400 HTML when jwt.verify throws', async () => {
    mockVerify.mockImplementation(() => { throw new Error('invalid token'); });
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/revoke-all-sessions?token=bad-token' });
    expect(res.statusCode).toBe(400);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.body).toContain('expired or invalid');
    await app.close();
  });
});

describe('GET /auth/revoke-all-sessions — wrong action in payload', () => {
  it('returns 400 HTML when action is not revoke-all', async () => {
    mockVerify.mockReturnValue({ userId: 'user-1', action: 'other-action' });
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/revoke-all-sessions?token=valid-token' });
    expect(res.statusCode).toBe(400);
    expect(res.body).toContain('Invalid link');
    await app.close();
  });
});

describe('GET /auth/revoke-all-sessions — missing userId in payload', () => {
  it('returns 400 HTML when userId is absent', async () => {
    mockVerify.mockReturnValue({ action: 'revoke-all' });
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/revoke-all-sessions?token=valid-token' });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('GET /auth/revoke-all-sessions — success', () => {
  it('returns 200 HTML with session count and calls invalidateAllSessions', async () => {
    mockVerify.mockReturnValue({ userId: 'usr-123', action: 'revoke-all' });
    mockInvalidateAllSessions.mockResolvedValue(5);
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/revoke-all-sessions?token=valid-token' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.body).toContain('sessions disconnected');
    expect(mockInvalidateAllSessions).toHaveBeenCalledWith('usr-123', undefined, 'email_revoke_all');
    await app.close();
  });
});

describe('GET /auth/revoke-all-sessions — live sockets', () => {
  it('closes every live socket of the user, not only their database rows', async () => {
    mockVerify.mockReturnValue({ userId: 'usr-123', action: 'revoke-all' });
    mockInvalidateAllSessions.mockResolvedValue(2);
    const emitted: Array<{ event: string; payload: any }> = [];
    const closed: boolean[] = [];
    const socket = {
      emit: (event: string, payload: unknown) => emitted.push({ event, payload }),
      disconnect: (close?: boolean) => closed.push(close === true),
    };
    const { rooms, handler } = makeSocketIOHandler([socket, { ...socket }]);

    const app = await buildApp(handler);
    const res = await app.inject({ method: 'GET', url: '/revoke-all-sessions?token=valid-token' });

    expect(res.statusCode).toBe(200);
    expect(rooms).toEqual(['user:usr-123']);
    expect(closed).toEqual([true, true]);
    expect(emitted.map((e) => e.event)).toEqual(['auth:session-revoked', 'auth:session-revoked']);
    expect(emitted[0].payload.reason).toBe('logout_all_devices');
    await app.close();
  });

  it('still confirms the revocation when no Socket.IO server is wired', async () => {
    mockVerify.mockReturnValue({ userId: 'usr-123', action: 'revoke-all' });
    mockInvalidateAllSessions.mockResolvedValue(1);
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/revoke-all-sessions?token=valid-token' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('sessions disconnected');
    await app.close();
  });

  it('still confirms the revocation when the socket fanout fails', async () => {
    mockVerify.mockReturnValue({ userId: 'usr-123', action: 'revoke-all' });
    mockInvalidateAllSessions.mockResolvedValue(1);
    const handler = {
      getManager: () => ({
        getIO: () => ({
          in: () => ({
            fetchSockets: async () => {
              throw new Error('adapter unavailable');
            },
          }),
        }),
      }),
    };
    const app = await buildApp(handler);
    const res = await app.inject({ method: 'GET', url: '/revoke-all-sessions?token=valid-token' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('sessions disconnected');
    await app.close();
  });
});
