/**
 * Témoin — la promesse des tombstones est créée en HAUT du handler et attendue
 * tout en bas. Entre les deux, n'importe quel `throw` (la page principale qui
 * rejette, une lecture de préférences en panne) la laisserait sans écouteur.
 *
 * Sous le `--unhandled-rejections=throw` par défaut de Node 22, un rejet non
 * écouté termine le PROCESS : toutes les WebSockets de la gateway tombées parce
 * qu'une purge de liste n'a pas su se calculer. Que `loadConversationTombstones`
 * avale déjà ses erreurs est une propriété du COLLABORATEUR, pas une garantie de
 * ce site d'appel — le double ci-dessous la retire pour le prouver.
 *
 * Le témoin ne peut pas s'écrire dans `conversation-core.test.ts` : il exige que
 * le module des tombstones soit doublé, alors que toute la suite voisine le veut
 * RÉEL (c'est sa règle de calcul qu'elle vérifie).
 */

import { describe, it, expect, jest } from '@jest/globals';

const tombstonesRejects = jest.fn<any>();

jest.mock('../../../../routes/conversations/utils/delta-tombstones', () => ({
  CONVERSATION_TOMBSTONE_LIMIT: 500,
  loadConversationTombstones: (...args: unknown[]) => tombstonesRejects(...args),
}));

jest.mock('../../../../utils/etag', () => ({ sendWithETag: () => false }));

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }),
  },
}));

jest.mock('../../../../services/MessageReadStatusService', () => ({
  MessageReadStatusService: jest.fn().mockImplementation(() => ({
    getUnreadCountsForUser: jest.fn<any>().mockResolvedValue(new Map()),
    getUnreadCount: jest.fn<any>().mockResolvedValue(0),
  })),
}));

jest.mock('../../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({ resolveForTargets: jest.fn<any>().mockResolvedValue(new Map()) }),
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  conversationListResponseSchema: { type: 'object' },
  conversationResponseSchema: { type: 'object' },
  errorResponseSchema: { type: 'object' },
  createConversationRequestSchema: { type: 'object' },
  updateConversationRequestSchema: { type: 'object' },
}));

import { registerCoreRoutes } from '../../../../routes/conversations/core';

const USER_ID = '507f1f77bcf86cd799439022';

const makePrisma = (): any => ({
  conversation: {
    findMany: jest.fn<any>().mockResolvedValue([]),
    findFirst: jest.fn<any>().mockResolvedValue(null),
    count: jest.fn<any>().mockResolvedValue(0),
  },
  participant: { findMany: jest.fn<any>().mockResolvedValue([]), findFirst: jest.fn<any>().mockResolvedValue(null) },
  message: { findMany: jest.fn<any>().mockResolvedValue([]), findFirst: jest.fn<any>().mockResolvedValue(null) },
  user: { findMany: jest.fn<any>().mockResolvedValue([]) },
});

const captureListHandler = (prisma: unknown): Function => {
  let handler: Function | undefined;
  const fastify: any = {
    get: jest.fn((path: string, _opts: unknown, fn: Function) => {
      if (path === '/conversations') handler = fn;
    }),
    post: jest.fn(),
    put: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
    // Multi-verbes (`fastify.route`). Absent, il faisait tomber la suite entière
    // sur `fastify.route is not a function` dès qu'une route l'employait —
    // cette suite ne s'intéresse qu'au GET, mais elle enregistre TOUT le module.
    route: jest.fn(),
    socketIOHandler: { getManager: () => ({ getIO: () => ({ to: () => ({ emit: jest.fn() }) }) }) },
  };
  registerCoreRoutes(fastify, prisma as never, jest.fn() as never, jest.fn() as never);
  if (!handler) throw new Error('GET /conversations was not registered');
  return handler;
};

describe('GET /conversations — la promesse des tombstones ne peut pas rester orpheline', () => {
  it('sert la liste et demande une réconciliation quand la lecture des tombstones REJETTE', async () => {
    tombstonesRejects.mockRejectedValue(new Error('mongo down'));
    const prisma = makePrisma();
    const handler = captureListHandler(prisma);

    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);

    const reply: any = {
      _body: null,
      status: jest.fn().mockReturnThis(),
      code: jest.fn().mockReturnThis(),
      header: jest.fn().mockReturnThis(),
      send: jest.fn((body?: unknown) => { if (body !== undefined) reply._body = body; return reply; }),
    };

    await handler(
      {
        authContext: { isAuthenticated: true, userId: USER_ID, registeredUser: { id: USER_ID, role: 'USER' } },
        params: {},
        query: { updatedSince: '2026-08-01T00:00:00.000Z' },
        headers: {},
      },
      reply
    );

    // Vidange de la file de microtâches : un rejet orphelin ne se manifeste
    // qu'après, jamais dans le retour de l'appel.
    await new Promise((resolve) => setImmediate(resolve));
    process.off('unhandledRejection', onUnhandled);

    expect(unhandled).toHaveLength(0);
    expect(reply._body.success).toBe(true);
    expect(reply._body.meta).toEqual({
      deletedConversationIds: [],
      deletedConversationIdsTruncated: true,
    });
  });
});
