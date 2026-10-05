/**
 * GET /calls/history?type=&q= (#8203) — le type d'appel et la recherche par
 * nom arrivent jusqu'au journal ; une valeur inconnue ne casse pas la page.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockListHistory = jest.fn<any>();
jest.mock('../../../services/CallService', () => ({
  ...(jest.requireActual('../../../services/CallService') as object),
  CallService: jest.fn<any>().mockImplementation(() => ({ listHistory: (...args: any[]) => mockListHistory(...args) })),
}));
jest.mock('../../../middleware/auth', () => ({ createUnifiedAuthMiddleware: jest.fn<any>().mockReturnValue(jest.fn<any>()) }));
jest.mock('../../../middleware/validation', () => ({ createValidationMiddleware: jest.fn<any>().mockReturnValue(jest.fn<any>()) }));
jest.mock('../../../middleware/rate-limit', () => ({ ROUTE_RATE_LIMITS: { initiateCall: {}, joinCall: {}, callOperations: {} } }));
jest.mock('../../../utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));

import callRoutes from '../../../routes/calls';

const USER_ID = '507f1f77bcf86cd799439022';

type RouteHandler = (req: any, reply: any) => Promise<any>;

function historyRoute() {
  const routes: { method: string; path: string; opts: any; handler: RouteHandler }[] = [];
  const register = (method: string) =>
    jest.fn<any>((path: string, opts: any, handler: RouteHandler) => routes.push({ method, path, opts, handler }));
  const fastify: any = { prisma: {}, post: register('POST'), get: register('GET'), delete: register('DELETE') };
  callRoutes(fastify);
  const found = routes.find((r) => r.method === 'GET' && r.path === '/calls/history');
  if (found === undefined) throw new Error('GET /calls/history absent');
  const reply: any = { status: jest.fn<any>(), send: jest.fn<any>((body: any) => ((reply.body = body), reply)) };
  reply.status.mockReturnValue(reply);
  return { found, reply };
}

const request = (query: Record<string, unknown>) => ({
  params: {},
  query,
  body: {},
  authContext: { userId: USER_ID, type: 'user', registeredUser: { id: USER_ID, role: 'USER' } },
});

describe('GET /calls/history — filtre par type et recherche (#8203)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListHistory.mockResolvedValue({ items: [], hasMore: false });
  });

  it('déclare `type` et `q` dans sa querystring', () => {
    const { found } = historyRoute();
    const props = found.opts.schema.querystring.properties;
    expect(props.type).toEqual(expect.objectContaining({ enum: ['all', 'audio', 'video'] }));
    expect(props.q).toEqual(expect.objectContaining({ type: 'string', maxLength: 100 }));
  });

  it('transmet le type et la recherche au journal', async () => {
    const { found, reply } = historyRoute();
    await found.handler(request({ filter: 'missed', type: 'video', q: 'Éloi' }), reply);
    expect(mockListHistory).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ filter: 'missed', type: 'video', q: 'Éloi' }),
    );
  });

  it('sans type ni recherche, le journal entier', async () => {
    const { found, reply } = historyRoute();
    await found.handler(request({}), reply);
    expect(mockListHistory).toHaveBeenCalledWith(USER_ID, expect.objectContaining({ type: 'all', q: undefined }));
  });
});
