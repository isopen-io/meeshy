/**
 * Le HARNAIS des routes `messages-advanced` — constantes de cas et fabriques de
 * doubles (Prisma, instance Fastify, `request`, `reply`, le message existant).
 *
 * ─── Pourquoi un fichier ────────────────────────────────────────────────────
 *
 * `conversation-messages-advanced.delete.test.ts` était à 997 lignes, pour un
 * plafond de 1 000, et le cliquet de budget refuse toute ligne de plus à une
 * suite qui le dépasse : « on extrait d'abord, on ajoute ensuite ». Deux témoins
 * de course (#17079) ont donc rougi le cliquet AVANT de pouvoir entrer, et la
 * réponse n'était pas dans eux — elle était dans ce fichier-ci, qui n'existait
 * pas encore.
 *
 * Les `jest.mock` NE sont pas ici, et ne peuvent pas l'être : ils sont hissés
 * par suite, dans le registre de modules de la suite. Ce fichier ne porte que
 * ce qui est SANS ÉTAT partagé — des fabriques qui rendent un objet neuf à
 * chaque appel.
 */

import { jest } from '@jest/globals';

// ─── Constantes de cas ───────────────────────────────────────────────────────

export const CONV_ID = '507f1f77bcf86cd799439011';
export const USER_ID = '507f1f77bcf86cd799439022';
export const OTHER_USER_ID = '507f1f77bcf86cd799439033';
export const MSG_ID = '507f1f77bcf86cd799439044';
export const PART_ID = '507f1f77bcf86cd799439055';

// ─── Factories ────────────────────────────────────────────────────────────────

export const makePrisma = (): any => ({
  message: {
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockResolvedValue({
      id: MSG_ID,
      content: 'hello',
      validatedMentions: [],
      translations: null,
      createdAt: new Date(),
    }),
    delete: jest.fn(),
  },
  participant: {
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
  },
  mention: {
    findMany: jest.fn().mockResolvedValue([]),
    deleteMany: jest.fn().mockResolvedValue({}),
  },
  user: {
    findUnique: jest.fn().mockResolvedValue(null),
  },
  conversation: {
    findUnique: jest.fn().mockResolvedValue(null),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  },
  trackingLink: {
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
});

export const createMockFastify = () => {
  const routes: Record<string, Record<string, Function>> = {};
  const mockEmit = jest.fn();
  const mockTo = jest.fn().mockReturnValue({ emit: mockEmit });
  const mockGetIO = jest.fn().mockReturnValue({ to: mockTo });
  const mockEnqueueOfflineMutation = jest.fn().mockResolvedValue(undefined);
  const mockGetManager = jest.fn().mockReturnValue({
    getIO: mockGetIO,
    enqueueOfflineMessageMutation: mockEnqueueOfflineMutation,
  });

  const fastify: any = {
    get: jest.fn((path: string, _opts: any, handler: Function) => {
      (routes['GET'] = routes['GET'] || {})[path] = handler;
    }),
    post: jest.fn((path: string, _opts: any, handler: Function) => {
      (routes['POST'] = routes['POST'] || {})[path] = handler;
    }),
    put: jest.fn((path: string, _opts: any, handler: Function) => {
      (routes['PUT'] = routes['PUT'] || {})[path] = handler;
    }),
    delete: jest.fn((path: string, _opts: any, handler: Function) => {
      (routes['DELETE'] = routes['DELETE'] || {})[path] = handler;
    }),
    patch: jest.fn((path: string, _opts: any, handler: Function) => {
      (routes['PATCH'] = routes['PATCH'] || {})[path] = handler;
    }),
    socketIOHandler: {
      getManager: mockGetManager,
    },
    notificationService: null,
    mentionService: null,
    translationService: {
      retranslateMessageAsync: jest.fn().mockResolvedValue(undefined),
    },
    _routes: routes,
    _mockTo: mockTo,
    _mockEmit: mockEmit,
    _mockGetManager: mockGetManager,
    _mockEnqueueOfflineMutation: mockEnqueueOfflineMutation,
  };
  return fastify;
};

export const getHandler = (fastify: any, method: string, pathFragment: string): Function => {
  const methodRoutes = fastify._routes[method] || {};
  const key = Object.keys(methodRoutes).find(k => k.includes(pathFragment));
  if (!key) throw new Error(`No ${method} route matching '${pathFragment}'. Available: ${Object.keys(methodRoutes).join(', ')}`);
  return methodRoutes[key];
};

export const makeRequest = (overrides: any = {}): any => ({
  authContext: {
    isAuthenticated: true,
    userId: USER_ID,
    registeredUser: { id: USER_ID, role: 'USER' },
    isAnonymous: false,
    sessionToken: null,
    participantId: PART_ID,
  },
  params: {},
  query: {},
  body: {},
  headers: {},
  ...overrides,
});

export const makeReply = () => {
  const reply: any = {
    _body: null,
    status: jest.fn().mockReturnThis(),
    send: jest.fn((body?: any) => { if (body !== undefined) reply._body = body; return reply; }),
    code: jest.fn().mockReturnThis(),
    header: jest.fn().mockReturnThis(),
  };
  return reply;
};

export const makeExistingMessage = (overrides: any = {}) => ({
  id: MSG_ID,
  conversationId: CONV_ID,
  content: 'Original content',
  createdAt: new Date(), // recent = within 24h
  senderId: PART_ID,
  deletedAt: null,
  isEdited: false,
  sender: {
    id: PART_ID,
    userId: USER_ID,
    role: 'USER',
  },
  attachments: [],
  ...overrides,
});
