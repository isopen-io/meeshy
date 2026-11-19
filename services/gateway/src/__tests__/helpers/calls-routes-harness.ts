/**
 * Le harnais des routes d'appel : fabriques de lignes, faux Fastify, faux reply,
 * requête nominale, et `setup()` qui ENREGISTRE les routes.
 *
 * #19808 — il vivait dans `calls-routes.test.ts`, qui portait ainsi 228 lignes
 * de harnais pour 93 témoins, et dont la taille (2 175 lignes) a fini par faire
 * rougir la règle 3 du budget de taille — sur `dev`, donc sur toute branche qui
 * le contient. Le sortir ne déplace aucun témoin : c'est la réparation qui ne
 * touche à aucun comportement.
 *
 * Ce module importe le module SOUS TEST (`routes/calls`). C'est volontaire et
 * sans danger : les `jest.mock` du fichier de test sont HOISTÉS au-dessus de
 * tous ses imports, donc le registre de doubles est déjà posé quand ce fichier
 * se charge. Les DOUBLES, eux, vivent dans `calls-routes-mocks.ts` — s'ils
 * vivaient ici, le premier `require` de `CallService` rentrerait dans ce module
 * à moitié chargé (cycle).
 */
import { jest } from '@jest/globals';
import callRoutes from '../../routes/calls';

export const CALL_ID = '507f1f77bcf86cd799439011';
export const USER_ID = '507f1f77bcf86cd799439022';
export const CONV_ID = '507f1f77bcf86cd799439033';
export const PART_ID = '507f1f77bcf86cd799439044';
export const TARGET_PART_ID = '507f1f77bcf86cd799439055';

export type RouteHandler = (req: any, reply: any) => Promise<any>;
export type RouteReg = { method: string; path: string; handler: RouteHandler };

export function makeCallSession(overrides: Record<string, any> = {}) {
  return {
    id: CALL_ID,
    conversationId: CONV_ID,
    initiatorId: USER_ID,
    status: 'active',
    type: 'video',
    startedAt: new Date('2026-06-21T00:00:00.000Z'),
    participants: [],
    ...overrides,
  };
}

export function makeMembership(overrides: Record<string, any> = {}) {
  return {
    id: PART_ID,
    userId: USER_ID,
    conversationId: CONV_ID,
    role: 'member',
    isActive: true,
    ...overrides,
  };
}

export function makeActiveCall(overrides: Record<string, any> = {}) {
  return {
    id: CALL_ID,
    conversationId: CONV_ID,
    status: 'active',
    participants: [],
    startedAt: new Date('2026-06-21T00:00:00.000Z'),
    ...overrides,
  };
}

export function createMockFastify(prismaOverrides?: Record<string, any>) {
  const routes: RouteReg[] = [];
  const defaultPrisma = {
    participant: { findFirst: jest.fn<any>().mockResolvedValue(null) },
    callSession: { findFirst: jest.fn<any>().mockResolvedValue(null) },
    conversation: { findUnique: jest.fn<any>().mockResolvedValue({ activeCallId: null }) },
  };
  const prisma = prismaOverrides ? { ...defaultPrisma, ...prismaOverrides } : defaultPrisma;

  const fastify: any = {
    prisma,
    post: jest.fn<any>((path: string, _opts: any, handler: RouteHandler) => {
      routes.push({ method: 'POST', path, handler });
    }),
    get: jest.fn<any>((path: string, _opts: any, handler: RouteHandler) => {
      routes.push({ method: 'GET', path, handler });
    }),
    delete: jest.fn<any>((path: string, _opts: any, handler: RouteHandler) => {
      routes.push({ method: 'DELETE', path, handler });
    }),
  };

  return { fastify, routes, prisma };
}

export function createMockReply(): any {
  const reply: any = {
    _body: undefined,
    statusCode: 200,
    status: jest.fn<any>(),
    send: jest.fn<any>((body: any) => {
      reply._body = body;
      return reply;
    }),
  };
  reply.status.mockReturnValue(reply);
  return reply;
}

export function makeRequest(overrides: Record<string, any> = {}) {
  return {
    params: {},
    body: {},
    query: {},
    authContext: {
      userId: USER_ID,
      participantId: PART_ID,
      type: 'user',
      hasFullAccess: true,
      registeredUser: { id: USER_ID, role: 'USER' },
    },
    ...overrides,
  };
}

export function getRoute(routes: RouteReg[], method: string, pathFragment: string): RouteHandler {
  const found = routes.find((route) => route.method === method && route.path.includes(pathFragment));
  if (!found) throw new Error(`Route ${method} *${pathFragment}* not found`);
  return found.handler;
}

export function setup(prismaOverrides?: Record<string, any>) {
  const { fastify, routes, prisma } = createMockFastify(prismaOverrides);
  callRoutes(fastify);
  return { routes, prisma, reply: createMockReply() };
}
