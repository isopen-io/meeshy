/**
 * Unit tests for socketio/MeeshySocketIOHandler.ts
 * Covers: setupSocketIO, getManager, routes (stats + disconnect-user),
 *         sendNotificationToUser, broadcastMessage, getConnectedUsers
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../../socketio/MeeshySocketIOManager', () => ({
  MeeshySocketIOManager: jest.fn<any>().mockImplementation(() => ({
    initialize: jest.fn<any>().mockResolvedValue(undefined),
    getStats: jest.fn<any>().mockReturnValue({ connections: 5 }),
    disconnectUser: jest.fn<any>().mockReturnValue(true),
    sendToUser: jest.fn<any>().mockReturnValue(true),
    broadcastMessage: jest.fn<any>().mockResolvedValue(undefined),
    getConnectedUsers: jest.fn<any>().mockReturnValue(['user1', 'user2']),
  })),
}));

jest.mock('../../../services/message-translation/MessageTranslationService', () => ({
  MessageTranslationService: jest.fn(),
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../middleware/auth', () => ({
  requireAdmin: jest.fn<any>(),
}));

jest.mock('@meeshy/shared/prisma/client', () => ({}));

import { MeeshySocketIOHandler } from '../../../socketio/MeeshySocketIOHandler';
import { MeeshySocketIOManager } from '../../../socketio/MeeshySocketIOManager';
import { logger } from '../../../utils/logger';

// ── Fastify mock factory ──────────────────────────────────────────────────────

function makeFastify() {
  const capturedRoutes: Record<string, Function> = {};
  return {
    server: {},
    authenticate: jest.fn<any>(),
    get: jest.fn<any>().mockImplementation((path: string, opts: any, handler: Function) => {
      capturedRoutes[`GET ${path}`] = handler;
    }),
    post: jest.fn<any>().mockImplementation((path: string, opts: any, handler: Function) => {
      capturedRoutes[`POST ${path}`] = handler;
    }),
    getRoute: (method: string, path: string) => capturedRoutes[`${method} ${path}`],
  };
}

// ── Reply mock factory ────────────────────────────────────────────────────────

function makeReply() {
  const r: any = {
    send: jest.fn<any>().mockReturnThis(),
    status: jest.fn<any>(),
  };
  r.status.mockReturnValue(r);
  return r;
}

// ── Handler factory ───────────────────────────────────────────────────────────

function makeHandler() {
  return new MeeshySocketIOHandler({} as any, 'test-secret', {} as any);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getManagerMock(handler: MeeshySocketIOHandler) {
  return (handler as any).socketIOManager as jest.MockedObject<MeeshySocketIOManager>;
}

// =============================================================================

describe('MeeshySocketIOHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── setupSocketIO ───────────────────────────────────────────────────────────

  describe('setupSocketIO()', () => {
    it('creates MeeshySocketIOManager with the httpServer and calls initialize()', async () => {
      const handler = makeHandler();
      const fastify = makeFastify();

      await handler.setupSocketIO(fastify as any);

      expect(MeeshySocketIOManager).toHaveBeenCalledTimes(1);
      expect(MeeshySocketIOManager).toHaveBeenCalledWith(
        fastify.server,
        expect.anything(),
        expect.anything()
      );

      const managerInstance = (MeeshySocketIOManager as jest.Mock).mock.results[0].value;
      expect(managerInstance.initialize).toHaveBeenCalledTimes(1);
    });

    it('registers GET /api/socketio/stats route', async () => {
      const handler = makeHandler();
      const fastify = makeFastify();

      await handler.setupSocketIO(fastify as any);

      expect(fastify.get).toHaveBeenCalledWith(
        '/api/socketio/stats',
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('registers POST /api/socketio/disconnect-user route', async () => {
      const handler = makeHandler();
      const fastify = makeFastify();

      await handler.setupSocketIO(fastify as any);

      expect(fastify.post).toHaveBeenCalledWith(
        '/api/socketio/disconnect-user',
        expect.any(Object),
        expect.any(Function)
      );
    });
  });

  // ── getManager() ────────────────────────────────────────────────────────────

  describe('getManager()', () => {
    it('returns null before setupSocketIO() is called', () => {
      const handler = makeHandler();
      expect(handler.getManager()).toBeNull();
    });

    it('returns the manager instance after setupSocketIO()', async () => {
      const handler = makeHandler();
      const fastify = makeFastify();

      await handler.setupSocketIO(fastify as any);

      const manager = handler.getManager();
      expect(manager).not.toBeNull();
      // The returned instance should be the mock object created by the constructor
      const constructedInstance = (MeeshySocketIOManager as jest.Mock).mock.results[0].value;
      expect(manager).toBe(constructedInstance);
    });
  });

  // ── GET /api/socketio/stats ──────────────────────────────────────────────────

  describe('GET /api/socketio/stats route', () => {
    it('happy path: returns stats with timestamp', async () => {
      const handler = makeHandler();
      const fastify = makeFastify();
      await handler.setupSocketIO(fastify as any);

      const routeHandler = fastify.getRoute('GET', '/api/socketio/stats');
      expect(routeHandler).toBeDefined();

      const reply = makeReply();
      await routeHandler({} as any, reply);

      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            connections: 5,
            timestamp: expect.any(String),
          }),
        })
      );
    });

    it('returns 500 when getStats() throws', async () => {
      const handler = makeHandler();
      const fastify = makeFastify();
      await handler.setupSocketIO(fastify as any);

      // Make getStats throw after setup
      const manager = getManagerMock(handler);
      (manager.getStats as jest.Mock).mockImplementationOnce(() => {
        throw new Error('stats failure');
      });

      const routeHandler = fastify.getRoute('GET', '/api/socketio/stats');
      const reply = makeReply();
      await routeHandler({} as any, reply);

      expect(reply.status).toHaveBeenCalledWith(500);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ success: false })
      );
    });
  });

  // ── POST /api/socketio/disconnect-user ───────────────────────────────────────

  describe('POST /api/socketio/disconnect-user route', () => {
    async function setupAndGetRoute(handler: MeeshySocketIOHandler, fastify: ReturnType<typeof makeFastify>) {
      await handler.setupSocketIO(fastify as any);
      return fastify.getRoute('POST', '/api/socketio/disconnect-user');
    }

    it('happy path: disconnects user, returns 200 with success', async () => {
      const handler = makeHandler();
      const fastify = makeFastify();
      const routeHandler = await setupAndGetRoute(handler, fastify);

      const reply = makeReply();
      const request = { body: { userId: 'user-abc' } };

      await routeHandler(request as any, reply);

      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
      expect(reply.status).not.toHaveBeenCalledWith(400);
      expect(reply.status).not.toHaveBeenCalledWith(404);
      expect(reply.status).not.toHaveBeenCalledWith(500);
    });

    it('returns 400 when userId is missing from body', async () => {
      const handler = makeHandler();
      const fastify = makeFastify();
      const routeHandler = await setupAndGetRoute(handler, fastify);

      const reply = makeReply();
      const request = { body: {} };

      await routeHandler(request as any, reply);

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ success: false })
      );
    });

    it('returns 404 when disconnectUser() returns false (user not found)', async () => {
      const handler = makeHandler();
      const fastify = makeFastify();
      const routeHandler = await setupAndGetRoute(handler, fastify);

      const manager = getManagerMock(handler);
      (manager.disconnectUser as jest.Mock).mockReturnValueOnce(false);

      const reply = makeReply();
      const request = { body: { userId: 'absent-user' } };

      await routeHandler(request as any, reply);

      expect(reply.status).toHaveBeenCalledWith(404);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ success: false })
      );
    });

    it('returns 500 when socketIOManager is null', async () => {
      const handler = makeHandler();
      const fastify = makeFastify();
      const routeHandler = await setupAndGetRoute(handler, fastify);

      // Force manager to null after setup
      (handler as any).socketIOManager = null;

      const reply = makeReply();
      const request = { body: { userId: 'user-xyz' } };

      await routeHandler(request as any, reply);

      expect(reply.status).toHaveBeenCalledWith(500);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ success: false })
      );
    });

    it('returns 500 when disconnectUser() throws', async () => {
      const handler = makeHandler();
      const fastify = makeFastify();
      const routeHandler = await setupAndGetRoute(handler, fastify);

      const manager = getManagerMock(handler);
      (manager.disconnectUser as jest.Mock).mockImplementationOnce(() => {
        throw new Error('disconnect error');
      });

      const reply = makeReply();
      const request = { body: { userId: 'user-boom' } };

      await routeHandler(request as any, reply);

      expect(reply.status).toHaveBeenCalledWith(500);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ success: false })
      );
    });
  });

  // ── sendNotificationToUser() ─────────────────────────────────────────────────

  describe('sendNotificationToUser()', () => {
    it('logs info when manager successfully sends notification (returns true)', async () => {
      const handler = makeHandler();
      const fastify = makeFastify();
      await handler.setupSocketIO(fastify as any);

      const manager = getManagerMock(handler);
      (manager.sendToUser as jest.Mock).mockReturnValue(true);

      await handler.sendNotificationToUser('user-1', { title: 'Hello' });

      expect(logger.info).toHaveBeenCalled();
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('logs warn when manager cannot send (returns false)', async () => {
      const handler = makeHandler();
      const fastify = makeFastify();
      await handler.setupSocketIO(fastify as any);

      const manager = getManagerMock(handler);
      (manager.sendToUser as jest.Mock).mockReturnValue(false);

      await handler.sendNotificationToUser('user-offline', { title: 'Hello' });

      expect(logger.warn).toHaveBeenCalled();
    });

    it('is a no-op when manager is null (does not throw)', async () => {
      const handler = makeHandler();
      // Do NOT call setupSocketIO — manager stays null

      await expect(
        handler.sendNotificationToUser('user-1', { title: 'Hi' })
      ).resolves.toBeUndefined();
    });

    it('catches and logs errors when manager.sendToUser throws', async () => {
      const handler = makeHandler();
      const fastify = makeFastify();
      await handler.setupSocketIO(fastify as any);

      const manager = getManagerMock(handler);
      (manager.sendToUser as jest.Mock).mockImplementationOnce(() => {
        throw new Error('socket error');
      });

      await expect(
        handler.sendNotificationToUser('user-1', { title: 'Boom' })
      ).resolves.toBeUndefined();

      expect(logger.error).toHaveBeenCalled();
    });
  });

  // ── broadcastMessage() ───────────────────────────────────────────────────────

  describe('broadcastMessage()', () => {
    it('delegates to manager.broadcastMessage with message and conversationId', async () => {
      const handler = makeHandler();
      const fastify = makeFastify();
      await handler.setupSocketIO(fastify as any);

      const manager = getManagerMock(handler);
      const message = { id: 'm1', content: 'hello' };

      await handler.broadcastMessage(message, 'conv-123');

      expect(manager.broadcastMessage).toHaveBeenCalledTimes(1);
      expect(manager.broadcastMessage).toHaveBeenCalledWith(message, 'conv-123');
    });

    it('is a no-op when manager is null (does not throw)', async () => {
      const handler = makeHandler();
      // Do NOT call setupSocketIO

      await expect(
        handler.broadcastMessage({ id: 'm1' }, 'conv-1')
      ).resolves.toBeUndefined();
    });

    it('catches and logs errors when manager.broadcastMessage throws', async () => {
      const handler = makeHandler();
      const fastify = makeFastify();
      await handler.setupSocketIO(fastify as any);

      const manager = getManagerMock(handler);
      (manager.broadcastMessage as jest.Mock).mockRejectedValueOnce(new Error('broadcast fail'));

      await expect(
        handler.broadcastMessage({ id: 'm1' }, 'conv-1')
      ).resolves.toBeUndefined();

      expect(logger.error).toHaveBeenCalled();
    });
  });

  // ── getConnectedUsers() ──────────────────────────────────────────────────────

  describe('getConnectedUsers()', () => {
    it('returns the list of connected users from the manager', async () => {
      const handler = makeHandler();
      const fastify = makeFastify();
      await handler.setupSocketIO(fastify as any);

      const result = handler.getConnectedUsers();

      expect(result).toEqual(['user1', 'user2']);
    });

    it('returns empty array when manager is null', () => {
      const handler = makeHandler();
      // Do NOT call setupSocketIO

      expect(handler.getConnectedUsers()).toEqual([]);
    });

    it('catches errors and returns empty array when manager.getConnectedUsers throws', async () => {
      const handler = makeHandler();
      const fastify = makeFastify();
      await handler.setupSocketIO(fastify as any);

      const manager = getManagerMock(handler);
      (manager.getConnectedUsers as jest.Mock).mockImplementationOnce(() => {
        throw new Error('list error');
      });

      expect(handler.getConnectedUsers()).toEqual([]);
      expect(logger.error).toHaveBeenCalled();
    });
  });
});
