import { SocketNotificationService } from '../../../../services/notifications/SocketNotificationService';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

jest.mock('../../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

function makeNotification(overrides: Partial<Record<string, unknown>> = {}): any {
  return {
    id: 'notif-1',
    type: 'new_message',
    title: 'Test',
    content: 'Hello',
    ...overrides,
  };
}

function makeIO(emitFn = jest.fn()) {
  const inner = { emit: emitFn };
  const toFn = jest.fn().mockReturnValue(inner);
  return { to: toFn, _inner: inner } as any;
}

describe('SocketNotificationService', () => {
  describe('isInitialized', () => {
    it('returns false before setSocketIO', () => {
      const service = new SocketNotificationService();
      expect(service.isInitialized()).toBe(false);
    });

    it('returns true after setSocketIO', () => {
      const service = new SocketNotificationService();
      service.setSocketIO(makeIO(), new Map());
      expect(service.isInitialized()).toBe(true);
    });
  });

  describe('getUserSocketCount', () => {
    it('returns 0 for unknown user', () => {
      const service = new SocketNotificationService();
      expect(service.getUserSocketCount('unknown-user')).toBe(0);
    });

    it('returns 0 for user with empty socket set', () => {
      const service = new SocketNotificationService();
      const map = new Map([['user-1', new Set<string>()]]);
      service.setSocketIO(makeIO(), map);
      expect(service.getUserSocketCount('user-1')).toBe(0);
    });

    it('returns correct count for user with sockets', () => {
      const service = new SocketNotificationService();
      const map = new Map([['user-1', new Set(['s1', 's2', 's3'])]]);
      service.setSocketIO(makeIO(), map);
      expect(service.getUserSocketCount('user-1')).toBe(3);
    });

    it('returns 0 when called before setSocketIO (uses initial empty map)', () => {
      const service = new SocketNotificationService();
      expect(service.getUserSocketCount('any')).toBe(0);
    });
  });

  describe('emitNotification', () => {
    it('returns false when io is not initialized', () => {
      const service = new SocketNotificationService();
      const result = service.emitNotification('user-1', makeNotification());
      expect(result).toBe(false);
    });

    it('returns false when user has no entry in socket map', () => {
      const service = new SocketNotificationService();
      service.setSocketIO(makeIO(), new Map());
      expect(service.emitNotification('user-1', makeNotification())).toBe(false);
    });

    it('returns false when user has empty socket set', () => {
      const service = new SocketNotificationService();
      const map = new Map([['user-1', new Set<string>()]]);
      service.setSocketIO(makeIO(), map);
      expect(service.emitNotification('user-1', makeNotification())).toBe(false);
    });

    it('emits to single socket and returns true', () => {
      const emitFn = jest.fn();
      const io = makeIO(emitFn);
      const service = new SocketNotificationService();
      const map = new Map([['user-1', new Set(['socket-abc'])]]);
      service.setSocketIO(io, map);

      const notification = makeNotification({ id: 'n42' });
      const result = service.emitNotification('user-1', notification);

      expect(result).toBe(true);
      expect(io.to).toHaveBeenCalledWith('socket-abc');
      expect(emitFn).toHaveBeenCalledWith(SERVER_EVENTS.NOTIFICATION, notification);
    });

    it('emits to each socket when user has multiple sockets', () => {
      const emitFn = jest.fn();
      const io = makeIO(emitFn);
      const service = new SocketNotificationService();
      const map = new Map([['user-1', new Set(['s1', 's2', 's3'])]]);
      service.setSocketIO(io, map);

      const result = service.emitNotification('user-1', makeNotification());

      expect(result).toBe(true);
      expect(emitFn).toHaveBeenCalledTimes(3);
      expect(io.to).toHaveBeenCalledWith('s1');
      expect(io.to).toHaveBeenCalledWith('s2');
      expect(io.to).toHaveBeenCalledWith('s3');
    });

    it('catches an emit error and returns false without throwing', () => {
      const crashingEmit = jest.fn().mockImplementation(() => {
        throw new Error('socket error');
      });
      const io = {
        to: jest.fn().mockReturnValue({ emit: crashingEmit }),
      } as any;
      const service = new SocketNotificationService();
      const map = new Map([['user-1', new Set(['socket-abc'])]]);
      service.setSocketIO(io, map);

      expect(() => service.emitNotification('user-1', makeNotification())).not.toThrow();
      expect(service.emitNotification('user-1', makeNotification())).toBe(false);
    });
  });

  describe('setSocketIO', () => {
    it('replaces the existing socket map on re-initialization', () => {
      const service = new SocketNotificationService();
      const map1 = new Map([['user-a', new Set(['s1'])]]);
      const map2 = new Map([['user-b', new Set(['s2'])]]);

      service.setSocketIO(makeIO(), map1);
      expect(service.getUserSocketCount('user-a')).toBe(1);

      service.setSocketIO(makeIO(), map2);
      expect(service.getUserSocketCount('user-a')).toBe(0);
      expect(service.getUserSocketCount('user-b')).toBe(1);
    });
  });
});
