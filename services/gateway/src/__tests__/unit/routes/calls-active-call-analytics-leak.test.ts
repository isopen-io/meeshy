/**
 * calls-active-call-analytics-leak.test.ts
 *
 * Regression test for a real data-exposure bug: `GET
 * /conversations/:conversationId/active-call` declared its `response[200]`
 * schema with `additionalProperties: true` and no schema on `data` (worked
 * around a fast-json-stringify `oneOf + null` crash from 2026-05-12). That
 * disabled ALL field-level filtering on the route, so the raw Prisma
 * `CallSession` — including every participant's `CallParticipant.analytics`
 * (private end-of-call WebRTC telemetry: deviceModel, codec, packet loss,
 * platform… persisted per commit f4d75121170cb23b23245019666769e047d9d3ab) —
 * was serialized as-is to ANY conversation member polling this endpoint,
 * even for a participant who isn't (or never was) an active participant of
 * that specific call.
 *
 * Unlike `calls-routes.test.ts`, this suite boots a REAL Fastify instance
 * and uses `.inject()` so the actual response schema / fast-json-stringify
 * serializer runs — `calls-routes.test.ts` mocks both `sendSuccess` and
 * `@meeshy/shared/types/api-schemas` down to `{ type: 'object' }` stubs,
 * which bypasses serialization entirely and could not have caught this.
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.setTimeout(30000);

const CONV_ID = '507f1f77bcf86cd799439033';
const USER_ID = '507f1f77bcf86cd799439022';
const CALL_ID = '507f1f77bcf86cd799439011';
const OTHER_PARTICIPANT_ID = '507f1f77bcf86cd799439055';

const mockGetActiveCallForConversation = jest.fn<any>();

jest.mock('../../../services/CallService', () => ({
  CallService: jest.fn<any>().mockImplementation(() => ({
    getActiveCallForConversation: (...args: any[]) =>
      mockGetActiveCallForConversation(...args),
  })),
}));

// Middleware mocks below must be genuine `async (request) => {...}` functions
// (not a bare `jest.fn()`) — a zero-arity stub with no body left the
// preValidation chain hanging indefinitely under real Fastify dispatch, since
// this is invoked through `.inject()` rather than extracted and called
// directly like `calls-routes.test.ts` does.
jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn<any>().mockReturnValue(async (request: any) => {
    request.authContext = { isAuthenticated: true, userId: USER_ID };
  }),
}));

jest.mock('../../../middleware/validation', () => ({
  createValidationMiddleware: jest.fn<any>().mockReturnValue(async () => {}),
}));

jest.mock('../../../middleware/rate-limit', () => ({
  ROUTE_RATE_LIMITS: {
    initiateCall: {},
    joinCall: {},
    callOperations: {},
  },
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn<any>(),
    warn: jest.fn<any>(),
    error: jest.fn<any>(),
    debug: jest.fn<any>(),
  },
}));

// Real @meeshy/shared/types/api-schemas is used deliberately (NOT mocked) —
// this is the whole point of the test.

async function buildApp(activeCall: unknown): Promise<FastifyInstance> {
  mockGetActiveCallForConversation.mockReset().mockResolvedValue(activeCall);

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', {
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue({ id: 'p1', userId: USER_ID, conversationId: CONV_ID }),
    },
  } as unknown);

  const { default: callRoutes } = await import('../../../routes/calls');
  await app.register(callRoutes as any);
  await app.ready();
  return app;
}

describe('GET /conversations/:conversationId/active-call — response schema does not leak participant analytics', () => {
  it('strips CallParticipant.analytics (and any other undeclared field) from every participant', async () => {
    const activeCall = {
      id: CALL_ID,
      conversationId: CONV_ID,
      initiatorId: OTHER_PARTICIPANT_ID,
      mode: 'video',
      status: 'active',
      participants: [
        {
          id: 'cp-1',
          userId: OTHER_PARTICIPANT_ID,
          role: 'initiator',
          status: 'connected',
          isMuted: false,
          isVideoOff: false,
          // Private telemetry that must NEVER reach another conversation
          // member — this is exactly what leaked before the fix.
          analytics: {
            deviceModel: 'iPhone17,SECRET-INTERNAL-CODENAME',
            platform: 'ios',
            codec: 'opus',
            averageRtt: 42,
            negotiationTimeMs: 890,
          },
        },
        {
          id: 'cp-2',
          userId: USER_ID,
          role: 'participant',
          status: 'connected',
          isMuted: false,
          isVideoOff: false,
          analytics: null,
        },
      ],
      participantCount: 2,
    };

    const app = await buildApp(activeCall);

    const res = await app.inject({
      method: 'GET',
      url: `/conversations/${CONV_ID}/active-call`,
      headers: { authorization: 'Bearer x' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(CALL_ID);
    expect(body.data.participants).toHaveLength(2);
    for (const participant of body.data.participants) {
      expect(participant).not.toHaveProperty('analytics');
    }
    expect(JSON.stringify(body)).not.toContain('SECRET-INTERNAL-CODENAME');

    await app.close();
  });

  it('still serializes null when no active call exists (the bug this schema previously worked around)', async () => {
    const app = await buildApp(null);

    const res = await app.inject({
      method: 'GET',
      url: `/conversations/${CONV_ID}/active-call`,
      headers: { authorization: 'Bearer x' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true, data: null });

    await app.close();
  });
});
