/**
 * DELETE /calls/history/:callId et DELETE /calls/history (#8066) — effacer
 * une ligne du journal, ou tout le journal, POUR SOI. Motif « mock Fastify »
 * de `calls-routes.test.ts` : les gestionnaires enregistrés sont capturés et
 * appelés directement.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockHide = jest.fn<any>();
const mockClear = jest.fn<any>();
jest.mock('../../../services/calls/callHistoryList', () => ({
  ...(jest.requireActual('../../../services/calls/callHistoryList') as object),
  hideCallFromHistory: (...args: any[]) => mockHide(...args),
  clearCallHistory: (...args: any[]) => mockClear(...args),
}));
jest.mock('../../../services/CallService', () => ({
  ...(jest.requireActual('../../../services/CallService') as object),
  CallService: jest.fn<any>().mockImplementation(() => ({})),
}));
jest.mock('../../../middleware/auth', () => ({ createUnifiedAuthMiddleware: jest.fn<any>().mockReturnValue(jest.fn<any>()) }));
jest.mock('../../../middleware/validation', () => ({ createValidationMiddleware: jest.fn<any>().mockReturnValue(jest.fn<any>()) }));
jest.mock('../../../middleware/rate-limit', () => ({ ROUTE_RATE_LIMITS: { initiateCall: {}, joinCall: {}, callOperations: {} } }));
jest.mock('../../../utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));

import callRoutes from '../../../routes/calls';

const CALL_ID = '507f1f77bcf86cd799439011';
const USER_ID = '507f1f77bcf86cd799439022';

type RouteHandler = (req: any, reply: any) => Promise<any>;

function setup() {
  const routes: { method: string; path: string; handler: RouteHandler }[] = [];
  const register = (method: string) => jest.fn<any>((path: string, _opts: any, handler: RouteHandler) => routes.push({ method, path, handler }));
  const fastify: any = { prisma: {}, post: register('POST'), get: register('GET'), delete: register('DELETE') };
  callRoutes(fastify);
  const reply: any = { status: jest.fn<any>(), send: jest.fn<any>((body: any) => ((reply.body = body), reply)) };
  reply.status.mockReturnValue(reply);
  const route = (method: string, path: string) => {
    const found = routes.find((r) => r.method === method && r.path === path);
    if (found === undefined) throw new Error(`${method} ${path} absent`);
    return found.handler;
  };
  return { route, reply };
}

const request = (overrides: Record<string, unknown> = {}) => ({
  params: {},
  query: {},
  body: {},
  authContext: { userId: USER_ID, type: 'user', registeredUser: { id: USER_ID, role: 'USER' } },
  ...overrides,
});

describe('effacer le journal des appels', () => {
  beforeEach(() => jest.clearAllMocks());

  it('DELETE /calls/history/:callId efface la ligne pour celui qui la demande', async () => {
    mockHide.mockResolvedValueOnce('hidden');
    const { route, reply } = setup();
    await route('DELETE', '/calls/history/:callId')(request({ params: { callId: CALL_ID } }), reply);
    expect(mockHide).toHaveBeenCalledWith(expect.anything(), USER_ID, CALL_ID);
    expect(reply.body).toMatchObject({ success: true, data: { callId: CALL_ID, hidden: true } });
  });

  it('un appel hors de ses conversations répond 404', async () => {
    mockHide.mockResolvedValueOnce('not-found');
    const { route, reply } = setup();
    await route('DELETE', '/calls/history/:callId')(request({ params: { callId: CALL_ID } }), reply);
    expect(reply.status).toHaveBeenCalledWith(404);
  });

  it('DELETE /calls/history vide tout son journal et dit combien de lignes', async () => {
    mockClear.mockResolvedValueOnce(7);
    const { route, reply } = setup();
    await route('DELETE', '/calls/history')(request(), reply);
    expect(mockClear).toHaveBeenCalledWith(expect.anything(), USER_ID);
    expect(reply.body).toMatchObject({ success: true, data: { cleared: 7 } });
  });

  it('sans utilisateur authentifié, rien n’est effacé', async () => {
    const { route, reply } = setup();
    await route('DELETE', '/calls/history')(request({ authContext: { type: 'anonymous' } }), reply);
    expect(mockClear).not.toHaveBeenCalled();
    expect(reply.status).toHaveBeenCalledWith(401);
    expect(reply.body).toMatchObject({ success: false, code: 'UNAUTHORIZED' });
  });
});
