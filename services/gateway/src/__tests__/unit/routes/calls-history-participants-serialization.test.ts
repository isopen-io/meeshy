/**
 * GET /calls/history (#8066) — les participants d'un appel de groupe
 * TRAVERSENT le sérialiseur de la route, et rien de ce qu'on n'y déclare pas
 * n'en sort (ni présence ni moyen de contact).
 */
import { describe, it, expect, jest } from '@jest/globals';
import fastJson from 'fast-json-stringify';

jest.mock('../../../services/CallService', () => ({
  ...(jest.requireActual('../../../services/CallService') as object),
  CallService: jest.fn<any>().mockImplementation(() => ({})),
}));
jest.mock('../../../middleware/auth', () => ({ createUnifiedAuthMiddleware: jest.fn<any>().mockReturnValue(jest.fn<any>()) }));
jest.mock('../../../middleware/validation', () => ({ createValidationMiddleware: jest.fn<any>().mockReturnValue(jest.fn<any>()) }));
jest.mock('../../../middleware/rate-limit', () => ({ ROUTE_RATE_LIMITS: { initiateCall: {}, joinCall: {}, callOperations: {} } }));
jest.mock('../../../utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));

import callRoutes from '../../../routes/calls';

function historyResponseSchema(): Record<string, unknown> {
  const routes: { method: string; path: string; opts: any }[] = [];
  const register = (method: string) => jest.fn<any>((path: string, opts: any) => routes.push({ method, path, opts }));
  const fastify: any = { prisma: {}, post: register('POST'), get: register('GET'), delete: register('DELETE') };
  callRoutes(fastify);
  const found = routes.find((r) => r.method === 'GET' && r.path === '/calls/history');
  if (found === undefined) throw new Error('GET /calls/history absent');
  return found.opts.schema.response[200];
}

describe('GET /calls/history — participants d’un appel de groupe', () => {
  it('sert les participants déclarés, sans présence ni contact', () => {
    const stringify = fastJson(historyResponseSchema() as any);
    const body = JSON.parse(
      stringify({
        success: true,
        data: [
          {
            callId: 'call-g',
            conversationId: 'conv-g',
            conversationType: 'group',
            direction: 'outgoing',
            isVideo: false,
            startedAt: '2026-09-20T10:00:00.000Z',
            durationSec: 60,
            peer: null,
            participants: [
              {
                participantId: 'p-alice',
                userId: 'u-alice',
                username: 'alice',
                displayName: 'Alice',
                avatar: null,
                isOnline: true,
                lastActiveAt: '2026-09-20T10:00:00.000Z',
                phoneNumber: '+33600000000',
              },
            ],
          },
        ],
      }),
    );
    expect(body.data[0].participants).toEqual([
      { participantId: 'p-alice', userId: 'u-alice', username: 'alice', displayName: 'Alice', avatar: null },
    ]);
  });
});
