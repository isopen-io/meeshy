/**
 * Unit tests for MeeshySocketIOHandler — methods other than broadcastMessage.
 * Covers: getManager, sendNotificationToUser (sent/not-connected/error),
 * getConnectedUsers (no manager, with manager, error).
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeHandler(managerOverrides: Record<string, any> = {}) {
  const handler = new MeeshySocketIOHandler({} as any, 'secret', {} as any);
  const manager = {
    sendToUser: jest.fn<any>().mockReturnValue(true),
    getConnectedUsers: jest.fn<any>().mockReturnValue(['u-1', 'u-2']),
    broadcastMessage: jest.fn<any>().mockResolvedValue(undefined),
    ...managerOverrides,
  };
  // Inject manager via setupSocketIO shortcut: set private field directly
  (handler as any).socketIOManager = manager;
  return { handler, manager };
}

function makeHandlerNoManager() {
  return new MeeshySocketIOHandler({} as any, 'secret', {} as any);
}

// ─── getManager ───────────────────────────────────────────────────────────────

describe('getManager', () => {
  it('returns null when setup has not been called', () => {
    const handler = makeHandlerNoManager();
    expect(handler.getManager()).toBeNull();
  });

  it('returns the manager after it has been set', () => {
    const { handler, manager } = makeHandler();
    expect(handler.getManager()).toBe(manager);
  });
});

// ─── sendNotificationToUser ───────────────────────────────────────────────────

describe('sendNotificationToUser', () => {
  it('does nothing when the manager is not initialized', async () => {
    const handler = makeHandlerNoManager();
    await expect(handler.sendNotificationToUser('u-1', { type: 'test' })).resolves.toBeUndefined();
  });

  it('calls manager.sendToUser with the correct event and payload', async () => {
    const { handler, manager } = makeHandler();
    await handler.sendNotificationToUser('u-42', { type: 'message' });
    expect(manager.sendToUser).toHaveBeenCalledWith('u-42', expect.any(String), { type: 'message' });
  });

  it('does not throw when the user is not connected (sendToUser returns false)', async () => {
    const { handler } = makeHandler({ sendToUser: jest.fn<any>().mockReturnValue(false) });
    await expect(handler.sendNotificationToUser('u-offline', {})).resolves.toBeUndefined();
  });

  it('catches and swallows errors thrown by the manager', async () => {
    const { handler } = makeHandler({ sendToUser: jest.fn<any>().mockImplementation(() => { throw new Error('crash'); }) });
    await expect(handler.sendNotificationToUser('u-1', {})).resolves.toBeUndefined();
  });
});

// ─── getConnectedUsers ────────────────────────────────────────────────────────

describe('getConnectedUsers', () => {
  it('returns an empty array when the manager is not initialized', () => {
    const handler = makeHandlerNoManager();
    expect(handler.getConnectedUsers()).toEqual([]);
  });

  it('returns the user list from the manager', () => {
    const { handler } = makeHandler();
    expect(handler.getConnectedUsers()).toEqual(['u-1', 'u-2']);
  });

  it('returns an empty array when the manager throws', () => {
    const { handler } = makeHandler({
      getConnectedUsers: jest.fn<any>().mockImplementation(() => { throw new Error('boom'); }),
    });
    expect(handler.getConnectedUsers()).toEqual([]);
  });
});
