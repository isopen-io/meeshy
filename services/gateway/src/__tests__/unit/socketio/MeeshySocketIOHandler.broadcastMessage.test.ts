/**
 * Régression temps réel — MeeshySocketIOHandler.broadcastMessage
 *
 * Bug : un message envoyé via la route REST `POST /conversations/:id/messages`
 * n'atteignait jamais les autres participants en temps réel. La route appelle
 * `socketIOHandler.broadcastMessage(message, conversationId)`, mais
 * l'implémentation du handler ignorait `conversationId` et émettait
 * `system:message` à TOUS les sockets connectés au lieu de `message:new` dans
 * la room de la conversation. Les clients (iOS, web) n'écoutent que
 * `message:new` — le message n'apparaissait donc qu'après un rechargement
 * manuel (quitter puis revenir dans la conversation).
 *
 * Le handler DOIT déléguer à `MeeshySocketIOManager.broadcastMessage(message,
 * conversationId)`, le broadcast par-conversation prévu à cet effet, qui émet
 * `message:new` vers `ROOMS.conversation(id)`.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../socketio/MeeshySocketIOManager', () => ({
  MeeshySocketIOManager: jest.fn(),
}));
jest.mock('../../../services/message-translation/MessageTranslationService', () => ({
  MessageTranslationService: jest.fn(),
}));
jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { MeeshySocketIOHandler } from '../../../socketio/MeeshySocketIOHandler';

function makeManager(overrides: Record<string, unknown> = {}) {
  return {
    broadcastMessage: jest.fn<(...args: unknown[]) => Promise<void>>().mockResolvedValue(undefined),
    broadcast: jest.fn<any>(),
    sendToUser: jest.fn<any>().mockReturnValue(true),
    getConnectedUsers: jest.fn<any>().mockReturnValue(['user-1', 'user-2']),
    ...overrides,
  };
}

function makeHandler(manager = makeManager()) {
  const handler = new MeeshySocketIOHandler({} as any, 'test-secret', {} as any);
  (handler as any).socketIOManager = manager;
  return { handler, manager };
}

function makeHandlerNoManager() {
  const handler = new MeeshySocketIOHandler({} as any, 'test-secret', {} as any);
  return { handler };
}

describe('MeeshySocketIOHandler.broadcastMessage', () => {
  const message = { id: 'm_1', conversationId: 'c_1', content: 'hello' };

  it('délègue au broadcast par-conversation du manager (message:new dans la room)', async () => {
    const { handler, manager } = makeHandler();

    await (handler as any).broadcastMessage(message, 'c_1');

    expect(manager.broadcastMessage).toHaveBeenCalledTimes(1);
    expect(manager.broadcastMessage).toHaveBeenCalledWith(message, 'c_1');
  });

  it('ne retombe PAS sur un broadcast global system:message', async () => {
    const { handler, manager } = makeHandler();

    await (handler as any).broadcastMessage(message, 'c_1');

    expect(manager.broadcast).not.toHaveBeenCalled();
  });

  it('swallows manager error without throwing', async () => {
    const { handler } = makeHandler(makeManager({
      broadcastMessage: jest.fn<any>().mockRejectedValue(new Error('manager down')),
    }));

    await expect((handler as any).broadcastMessage(message, 'c_1')).resolves.toBeUndefined();
  });

  it('is a no-op when socketIOManager is null', async () => {
    const { handler } = makeHandlerNoManager();

    await expect((handler as any).broadcastMessage(message, 'c_1')).resolves.toBeUndefined();
  });
});

describe('MeeshySocketIOHandler.sendNotificationToUser', () => {
  const notification = { type: 'message', body: 'hello' };

  it('calls sendToUser with userId and notification', async () => {
    const { handler, manager } = makeHandler();

    await (handler as any).sendNotificationToUser('user-1', notification);

    expect(manager.sendToUser).toHaveBeenCalledWith('user-1', expect.any(String), notification);
  });

  it('resolves without throwing when user not connected (sendToUser returns false)', async () => {
    const { handler } = makeHandler(makeManager({ sendToUser: jest.fn<any>().mockReturnValue(false) }));

    await expect((handler as any).sendNotificationToUser('user-1', notification)).resolves.toBeUndefined();
  });

  it('swallows error without throwing', async () => {
    const { handler } = makeHandler(makeManager({
      sendToUser: jest.fn<any>().mockImplementation(() => { throw new Error('send failed'); }),
    }));

    await expect((handler as any).sendNotificationToUser('user-1', notification)).resolves.toBeUndefined();
  });

  it('is a no-op when socketIOManager is null', async () => {
    const { handler } = makeHandlerNoManager();

    await expect((handler as any).sendNotificationToUser('user-1', notification)).resolves.toBeUndefined();
  });
});

describe('MeeshySocketIOHandler.getConnectedUsers', () => {
  it('returns array from manager', () => {
    const { handler } = makeHandler();

    const result = (handler as any).getConnectedUsers();

    expect(result).toEqual(['user-1', 'user-2']);
  });

  it('returns empty array when socketIOManager is null', () => {
    const { handler } = makeHandlerNoManager();

    const result = (handler as any).getConnectedUsers();

    expect(result).toEqual([]);
  });

  it('returns empty array and swallows error when manager throws', () => {
    const { handler } = makeHandler(makeManager({
      getConnectedUsers: jest.fn<any>().mockImplementation(() => { throw new Error('state corrupted'); }),
    }));

    const result = (handler as any).getConnectedUsers();

    expect(result).toEqual([]);
  });
});

describe('MeeshySocketIOHandler.getManager', () => {
  it('returns null before setupSocketIO', () => {
    const { handler } = makeHandlerNoManager();

    expect((handler as any).getManager()).toBeNull();
  });

  it('returns the injected manager after setup', () => {
    const manager = makeManager();
    const { handler } = makeHandler(manager);

    expect((handler as any).getManager()).toBe(manager);
  });
});
