/**
 * #19650 — un appel lancé en tête-à-tête puis rattaché à un groupe par la
 * première invitation reste lisible depuis le tête-à-tête d'origine :
 * `GET /conversations/:id/active-call` y sert l'appel (sa conversation est
 * désormais le groupe). C'est ce que lisent « Rejoindre » sur la bulle
 * d'origine et la reprise d'un ANCIEN client. La garde ne change pas : un
 * non-membre reçoit le 404 d'une conversation inexistante (#8116).
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.setTimeout(30000);

const DIRECT_ID = '507f1f77bcf86cd799439033';
const GROUP_ID = '507f1f77bcf86cd799439044';
const USER_ID = '507f1f77bcf86cd799439022';
const CALL_ID = '507f1f77bcf86cd799439011';

const mockGetActiveCallForConversation = jest.fn<any>();
const mockGetCallSession = jest.fn<any>();

jest.mock('../../../services/CallService', () => ({
  ...(jest.requireActual('../../../services/CallService') as object),
  CallService: jest.fn<any>().mockImplementation(() => ({
    getActiveCallForConversation: (...args: any[]) => mockGetActiveCallForConversation(...args),
    getCallSession: (...args: any[]) => mockGetCallSession(...args),
  })),
}));
jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn<any>().mockReturnValue(async (request: any) => {
    request.authContext = { isAuthenticated: true, userId: USER_ID };
  }),
}));
jest.mock('../../../middleware/validation', () => ({
  createValidationMiddleware: jest.fn<any>().mockReturnValue(async () => {}),
}));
jest.mock('../../../middleware/rate-limit', () => ({
  ROUTE_RATE_LIMITS: { initiateCall: {}, joinCall: {}, callOperations: {} },
}));
jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn<any>(), warn: jest.fn<any>(), error: jest.fn<any>(), debug: jest.fn<any>() },
}));

const session = {
  id: CALL_ID,
  conversationId: GROUP_ID,
  initiatorId: USER_ID,
  mode: 'mesh',
  status: 'active',
  participants: [],
};

async function buildApp(options: { member: boolean; activeCallId: string | null; origin: string | null }): Promise<{ app: FastifyInstance; findFirst: jest.Mock<any> }> {
  mockGetActiveCallForConversation.mockReset().mockResolvedValue(null);
  mockGetCallSession.mockReset().mockResolvedValue(session);
  const findFirst = jest.fn<any>(async ({ where }: any) =>
    where.id === options.activeCallId && where.originConversationId === options.origin ? { id: CALL_ID } : null
  );
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', {
    participant: { findFirst: jest.fn<any>().mockResolvedValue(options.member ? { id: 'p1', userId: USER_ID, conversationId: DIRECT_ID } : null) },
    conversation: { findUnique: jest.fn<any>().mockResolvedValue({ activeCallId: options.activeCallId }) },
    callSession: { findFirst },
  } as unknown);
  const { default: callRoutes } = await import('../../../routes/calls');
  await app.register(callRoutes as any);
  await app.ready();
  return { app, findFirst };
}

const get = (app: FastifyInstance) =>
  app.inject({ method: 'GET', url: `/conversations/${DIRECT_ID}/active-call`, headers: { authorization: 'Bearer x' } });

describe('GET /conversations/:id/active-call — le tête-à-tête d’origine sert l’appel parti dans son groupe (#19650)', () => {
  it('sert l’appel vivant qui tient sa réservation et en est parti, avec la conversation du groupe', async () => {
    const { app } = await buildApp({ member: true, activeCallId: CALL_ID, origin: DIRECT_ID });
    const res = await get(app);

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ id: CALL_ID, conversationId: GROUP_ID });
    expect(mockGetCallSession).toHaveBeenCalledWith(CALL_ID);
    await app.close();
  });

  it('rend null quand la réservation n’est tenue par aucun appel parti de ce tête-à-tête', async () => {
    const { app } = await buildApp({ member: true, activeCallId: CALL_ID, origin: null });
    const res = await get(app);
    expect(res.json()).toEqual({ success: true, data: null });
    await app.close();
  });

  it('un non-membre reçoit toujours le 404, sans lecture de l’appel', async () => {
    const { app, findFirst } = await buildApp({ member: false, activeCallId: CALL_ID, origin: DIRECT_ID });
    const res = await get(app);
    expect(res.statusCode).toBe(404);
    expect(findFirst).not.toHaveBeenCalled();
    await app.close();
  });
});
