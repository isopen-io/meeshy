/**
 * POST /calls — un refus d'ADMISSION (#10207) se lit comme tel : 403, avec le
 * code `CALL_NOT_ALLOWED` en `error` ET en `code` (enveloppe de `sendError`).
 * Les autres échecs d'initiation gardent leur 400 historique.
 */

import { describe, it, expect, jest } from '@jest/globals';

const mockInitiateCall = jest.fn<any>();

jest.mock('../../../services/CallService', () => ({
  ...(jest.requireActual('../../../services/CallService') as object),
  CallService: jest.fn<any>().mockImplementation(() => ({
    initiateCall: (...args: any[]) => mockInitiateCall(...args),
  })),
}));

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn<any>().mockReturnValue(jest.fn<any>()),
}));

jest.mock('../../../middleware/validation', () => ({
  createValidationMiddleware: jest.fn<any>().mockReturnValue(jest.fn<any>()),
}));

jest.mock('../../../middleware/rate-limit', () => ({
  ROUTE_RATE_LIMITS: { initiateCall: {}, joinCall: {}, callOperations: {} },
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn<any>(), warn: jest.fn<any>(), error: jest.fn<any>(), debug: jest.fn<any>() },
}));

import callRoutes from '../../../routes/calls';

type RouteHandler = (req: any, reply: any) => Promise<any>;

const USER_ID = '507f1f77bcf86cd799439022';
const CONV_ID = '507f1f77bcf86cd799439033';
const PART_ID = '507f1f77bcf86cd799439044';

const initiateHandler = (): RouteHandler => {
  const routes: { method: string; path: string; handler: RouteHandler }[] = [];
  const register = (method: string) => (path: string, _opts: unknown, handler: RouteHandler) => {
    routes.push({ method, path, handler });
  };
  const fastify: any = {
    prisma: { participant: { findFirst: jest.fn<any>().mockResolvedValue({ id: PART_ID }) } },
    post: register('POST'),
    get: register('GET'),
    delete: register('DELETE'),
    patch: register('PATCH'),
    put: register('PUT'),
  };
  callRoutes(fastify);
  const route = routes.find((r) => r.method === 'POST' && r.path === '/calls');
  if (!route) throw new Error('POST /calls not registered');
  return route.handler;
};

const reply = () => {
  const r: any = { statusCode: 200, body: undefined };
  r.status = (code: number) => { r.statusCode = code; return r; };
  r.code = r.status;
  r.send = (body: unknown) => { r.body = body; return r; };
  r.header = () => r;
  return r;
};

const request = () => ({
  body: { conversationId: CONV_ID, type: 'video' },
  authContext: { userId: USER_ID, participantId: PART_ID, type: 'registered', hasFullAccess: true },
});

describe('POST /calls — refus d’admission (#10207)', () => {
  it('répond 403 CALL_NOT_ALLOWED quand la loi canStartCall refuse', async () => {
    mockInitiateCall.mockRejectedValueOnce(
      new Error('CALL_NOT_ALLOWED: You are not allowed to start a call in this conversation')
    );
    const r = reply();

    await initiateHandler()(request(), r);

    expect(r.statusCode).toBe(403);
    expect(r.body).toMatchObject({
      success: false,
      error: 'CALL_NOT_ALLOWED',
      code: 'CALL_NOT_ALLOWED',
      message: 'You are not allowed to start a call in this conversation',
    });
  });

  it('garde le 400 historique pour un type de conversation sans appel', async () => {
    mockInitiateCall.mockRejectedValueOnce(
      new Error('VIDEO_CALLS_NOT_SUPPORTED: Video calls are only supported for DIRECT and GROUP conversations')
    );
    const r = reply();

    await initiateHandler()(request(), r);

    expect(r.statusCode).toBe(400);
    expect(r.body).toMatchObject({ success: false, error: 'VIDEO_CALLS_NOT_SUPPORTED' });
  });
});
