/**
 * Le HARNAIS des suites de `routes/calls.ts` — constantes de cas et fabriques de
 * doubles (session d'appel, appartenance, instance Fastify, `request`, `reply`).
 *
 * ─── Pourquoi un fichier ────────────────────────────────────────────────────
 *
 * `calls-routes.test.ts` portait 2 154 lignes de dette héritée, et deux témoins
 * du join (#19778) l'ont fait grossir : le cliquet de budget des suites (#4531)
 * refuse qu'un fichier hors budget grandisse. Les témoins du join et du retrait
 * sont partis dans leurs propres suites, et ce montage commun vit ici plutôt
 * que d'être recopié trois fois.
 *
 * Les `jest.mock` NE sont pas ici, et ne peuvent pas l'être : ils sont hissés
 * par suite, dans le registre de modules de la suite. Ce fichier ne porte que
 * ce qui est SANS ÉTAT partagé — des fabriques qui rendent un objet neuf à
 * chaque appel. Le montage de la route (`setup`) reste dans chaque suite, qui
 * importe `routes/calls` APRÈS ses propres `jest.mock`.
 */

import { jest } from '@jest/globals';

// ─── Constants ────────────────────────────────────────────────────────────────

export const CALL_ID = '507f1f77bcf86cd799439011';
export const USER_ID = '507f1f77bcf86cd799439022';
export const CONV_ID = '507f1f77bcf86cd799439033';
export const PART_ID = '507f1f77bcf86cd799439044';
export const TARGET_PART_ID = '507f1f77bcf86cd799439055';

// ─── Factories ────────────────────────────────────────────────────────────────

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
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
    },
    callSession: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
    },
    conversation: {
      findUnique: jest.fn<any>().mockResolvedValue({ activeCallId: null }),
    },
  };
  const prisma = prismaOverrides
    ? { ...defaultPrisma, ...prismaOverrides }
    : defaultPrisma;

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
  const r = routes.find(
    (r) => r.method === method && r.path.includes(pathFragment)
  );
  if (!r) throw new Error(`Route ${method} *${pathFragment}* not found`);
  return r.handler;
}
