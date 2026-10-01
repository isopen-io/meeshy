/**
 * Épingler ou dépingler un message est une ACTIVITÉ (#9026) : la conversation
 * remonte en tête de liste pour TOUS ses participants — `lastActivityAt` écrit
 * (rechargement) et `listRankAt` servi à chacun (direct), par
 * `announceConversationActivity`. Un refus (introuvable) n'en est pas une.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify from 'fastify';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
  performanceLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

const mockResolveConversationId = jest.fn<any>();
jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: unknown[]) => mockResolveConversationId(...args),
}));

const mockCanAccessConversation = jest.fn<any>();
jest.mock('../../../routes/conversations/utils/access-control', () => ({
  ...(jest.requireActual('../../../routes/conversations/utils/access-control') as Record<string, unknown>),
  canAccessConversation: (...args: unknown[]) => mockCanAccessConversation(...args),
}));

jest.mock('../../../services/engagement/EngagementService', () => ({
  EngagementService: jest.fn().mockImplementation(() => ({ recordActivity: jest.fn(async () => undefined) })),
}));

const mockAnnounce = jest.fn<any>();
jest.mock('../../../services/conversations/conversationActivity', () => ({
  announceConversationActivity: (...args: unknown[]) => mockAnnounce(...args),
}));

import { registerMessagePinRoutes } from '../../../routes/conversations/messages-pin';

const CONV_ID = '507f1f77bcf86cd799439011';
const USER_ID = '507f1f77bcf86cd799439022';
const MESSAGE_ID = '507f1f77bcf86cd799439033';

async function buildApp(options: { exists?: boolean; withSocket?: boolean } = {}) {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  const io = { to: jest.fn(() => ({ emit: jest.fn() })) };
  const manager = { getIO: () => io, enqueueOfflineMessageMutation: jest.fn(async () => undefined) };
  if (options.withSocket) app.decorate('socketIOHandler', { getManager: () => manager } as never);
  const prisma = {
    message: {
      findFirst: jest.fn<any>().mockResolvedValue(options.exists === false ? null : { id: MESSAGE_ID, pinnedAt: null }),
      update: jest.fn<any>().mockResolvedValue({}),
    },
  };
  const auth = async (req: any) => {
    req.authContext = { type: 'user', isAuthenticated: true, isAnonymous: false, userId: USER_ID };
  };
  registerMessagePinRoutes(app, prisma as any, auth, options.withSocket ? {} : null);
  await app.ready();
  return { app, prisma, io };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));
const url = `/conversations/${CONV_ID}/messages/${MESSAGE_ID}/pin`;

describe('épingler / dépingler remonte la conversation pour tous (#9026)', () => {
  beforeEach(() => {
    mockAnnounce.mockReset();
    mockAnnounce.mockResolvedValue(undefined);
    mockResolveConversationId.mockResolvedValue(CONV_ID);
    mockCanAccessConversation.mockResolvedValue(true);
  });

  it.each([
    ['PUT', 'épingler'],
    ['DELETE', 'dépingler'],
  ] as const)('%s (%s) annonce une activité, servie sur le io du gestionnaire', async (method) => {
    const { app, io } = await buildApp({ withSocket: true });
    try {
      const before = Date.now();
      const res = await app.inject({ method, url });
      await flush();
      expect(res.statusCode).toBe(200);
      expect(mockAnnounce).toHaveBeenCalledTimes(1);
      const [args] = mockAnnounce.mock.calls[0] as [Record<string, unknown>];
      expect(args).toMatchObject({ conversationId: CONV_ID, updatedByUserId: USER_ID, io });
      expect((args.at as Date).getTime()).toBeGreaterThanOrEqual(before);
    } finally {
      await app.close();
    }
  });

  it("sans transport temps réel, l'activité s'écrit quand même (la remontée survit au rechargement)", async () => {
    const { app } = await buildApp();
    try {
      await app.inject({ method: 'PUT', url });
      await flush();
      expect(mockAnnounce).toHaveBeenCalledWith(expect.objectContaining({ conversationId: CONV_ID, io: null }));
    } finally {
      await app.close();
    }
  });

  it("un message introuvable n'est pas une activité", async () => {
    const { app } = await buildApp({ exists: false, withSocket: true });
    try {
      const res = await app.inject({ method: 'PUT', url });
      await flush();
      expect(res.statusCode).toBe(404);
      expect(mockAnnounce).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it("une panne de l'annonce ne fait pas échouer l'épingle", async () => {
    mockAnnounce.mockRejectedValue(new Error('down'));
    const { app } = await buildApp({ withSocket: true });
    try {
      const res = await app.inject({ method: 'DELETE', url });
      await flush();
      expect(res.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});
