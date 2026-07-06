/**
 * Unit tests for SocketNotificationService
 *
 * Covers: setSocketIO, emitNotification, isInitialized, getUserSocketCount
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@meeshy/shared/types/socketio-events', () => ({
  SERVER_EVENTS: {
    NOTIFICATION: 'notification:new',
  },
}));

import { SocketNotificationService } from '../../../../services/notifications/SocketNotificationService';
import type { NotificationEventData } from '../../../../services/notifications/types';

// ─── Factories ────────────────────────────────────────────────────────────────

function makeNotification(overrides: Partial<NotificationEventData> = {}): NotificationEventData {
  return {
    id: 'notif-001',
    userId: 'user-001',
    type: 'new_message',
    title: 'New message',
    content: 'Hello!',
    priority: 'normal',
    isRead: false,
    createdAt: new Date('2024-01-15T10:00:00.000Z'),
    ...overrides,
  };
}

function makeIo(socketEmit = jest.fn()) {
  const toFn = jest.fn().mockReturnValue({ emit: socketEmit });
  return {
    to: toFn,
    _emit: socketEmit,
  } as unknown as any;
}

// ─── isInitialized ────────────────────────────────────────────────────────────

describe('SocketNotificationService.isInitialized', () => {
  it('returns false before setSocketIO is called', () => {
    const svc = new SocketNotificationService();
    expect(svc.isInitialized()).toBe(false);
  });

  it('returns true after setSocketIO is called', () => {
    const svc = new SocketNotificationService();
    const io = makeIo();
    const map = new Map<string, Set<string>>();
    svc.setSocketIO(io, map);
    expect(svc.isInitialized()).toBe(true);
  });
});

// ─── setSocketIO ─────────────────────────────────────────────────────────────

describe('SocketNotificationService.setSocketIO', () => {
  it('sets io and replaces the userSocketsMap', () => {
    const svc = new SocketNotificationService();
    const io = makeIo();
    const map = new Map<string, Set<string>>([['u1', new Set(['s1'])]]);
    svc.setSocketIO(io, map);
    expect(svc.isInitialized()).toBe(true);
    expect(svc.getUserSocketCount('u1')).toBe(1);
  });
});

// ─── getUserSocketCount ───────────────────────────────────────────────────────

describe('SocketNotificationService.getUserSocketCount', () => {
  it('returns 0 for unknown userId', () => {
    const svc = new SocketNotificationService();
    expect(svc.getUserSocketCount('unknown-user')).toBe(0);
  });

  it('returns 0 after setSocketIO with empty map', () => {
    const svc = new SocketNotificationService();
    svc.setSocketIO(makeIo(), new Map());
    expect(svc.getUserSocketCount('u1')).toBe(0);
  });

  it('returns correct count for userId with one socket', () => {
    const svc = new SocketNotificationService();
    const map = new Map<string, Set<string>>([['u1', new Set(['s1'])]]);
    svc.setSocketIO(makeIo(), map);
    expect(svc.getUserSocketCount('u1')).toBe(1);
  });

  it('returns correct count for userId with multiple sockets', () => {
    const svc = new SocketNotificationService();
    const map = new Map<string, Set<string>>([['u1', new Set(['s1', 's2', 's3'])]]);
    svc.setSocketIO(makeIo(), map);
    expect(svc.getUserSocketCount('u1')).toBe(3);
  });
});

// ─── emitNotification ────────────────────────────────────────────────────────

describe('SocketNotificationService.emitNotification', () => {
  it('returns false and logs warning when io not initialized', () => {
    const svc = new SocketNotificationService();
    const notif = makeNotification();
    const result = svc.emitNotification('user-001', notif);
    expect(result).toBe(false);
  });

  it('returns false when userId not in userSocketsMap', () => {
    const svc = new SocketNotificationService();
    svc.setSocketIO(makeIo(), new Map());
    const result = svc.emitNotification('unknown-user', makeNotification());
    expect(result).toBe(false);
  });

  it('returns false when user has an empty socket set', () => {
    const svc = new SocketNotificationService();
    const map = new Map<string, Set<string>>([['u1', new Set<string>()]]);
    svc.setSocketIO(makeIo(), map);
    const result = svc.emitNotification('u1', makeNotification());
    expect(result).toBe(false);
  });

  it('emits to a single socket and returns true', () => {
    const socketEmit = jest.fn();
    const io = makeIo(socketEmit);
    const svc = new SocketNotificationService();
    const map = new Map<string, Set<string>>([['u1', new Set(['socket-1'])]]);
    svc.setSocketIO(io, map);

    const notif = makeNotification({ id: 'n1' });
    const result = svc.emitNotification('u1', notif);

    expect(result).toBe(true);
    expect(io.to).toHaveBeenCalledWith('socket-1');
    expect(socketEmit).toHaveBeenCalledWith('notification:new', notif);
  });

  it('emits to all sockets for user with multiple sockets and returns true', () => {
    const socketEmit = jest.fn();
    const io = makeIo(socketEmit);
    const svc = new SocketNotificationService();
    const map = new Map<string, Set<string>>([['u1', new Set(['s1', 's2'])]]);
    svc.setSocketIO(io, map);

    const notif = makeNotification({ id: 'n2' });
    const result = svc.emitNotification('u1', notif);

    expect(result).toBe(true);
    expect(io.to).toHaveBeenCalledTimes(2);
    expect(socketEmit).toHaveBeenCalledTimes(2);
  });

  it('catches error from io.to and returns false', () => {
    const svc = new SocketNotificationService();
    const errorIo = {
      to: jest.fn().mockImplementation(() => {
        throw new Error('Socket error');
      }),
    } as unknown as any;
    const map = new Map<string, Set<string>>([['u1', new Set(['s1'])]]);
    svc.setSocketIO(errorIo, map);

    const result = svc.emitNotification('u1', makeNotification());
    expect(result).toBe(false);
  });

  it('handles errors from emit inside forEach and returns false', () => {
    const svc = new SocketNotificationService();
    const badEmit = jest.fn().mockImplementation(() => {
      throw new Error('emit error');
    });
    const errorIo = {
      to: jest.fn().mockReturnValue({ emit: badEmit }),
    } as unknown as any;
    const map = new Map<string, Set<string>>([['u1', new Set(['s1'])]]);
    svc.setSocketIO(errorIo, map);

    const result = svc.emitNotification('u1', makeNotification());
    expect(result).toBe(false);
  });
});
