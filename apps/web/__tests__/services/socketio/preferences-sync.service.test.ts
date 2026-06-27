/**
 * Unit tests for PreferencesSyncService.
 * Covers socket event forwarding and listener lifecycle.
 */

jest.mock('@meeshy/shared/types/socketio-events', () => ({
  SERVER_EVENTS: {
    USER_PREFERENCES_UPDATED: 'user:preferences-updated',
    USER_PREFERENCES_REORDERED: 'user:preferences-reordered',
    CATEGORY_CREATED: 'category:created',
    CATEGORY_UPDATED: 'category:updated',
    CATEGORY_DELETED: 'category:deleted',
    CATEGORIES_REORDERED: 'categories:reordered',
  },
  CLIENT_EVENTS: {},
}));

import { PreferencesSyncService } from '@/services/socketio/preferences-sync.service';

function makeSocket() {
  const handlers: Record<string, (...args: unknown[]) => void> = {};
  return {
    on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers[event] = handler;
    }),
    _trigger: (event: string, ...args: unknown[]) => handlers[event]?.(...args),
  };
}

function makePrefsEvent(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'user-1',
    conversationId: 'conv-1',
    version: 1,
    reset: false,
    preferences: null,
    ...overrides,
  };
}

describe('PreferencesSyncService', () => {
  let service: PreferencesSyncService;

  beforeEach(() => {
    service = new PreferencesSyncService();
  });

  afterEach(() => {
    service.cleanup();
  });

  describe('setupEventListeners', () => {
    it('registers user:preferences-updated on the socket', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      expect(socket.on).toHaveBeenCalledWith('user:preferences-updated', expect.any(Function));
    });

    it('forwards event data to all registered listeners', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      service.onPreferencesUpdated(listener1);
      service.onPreferencesUpdated(listener2);
      const event = makePrefsEvent();
      socket._trigger('user:preferences-updated', event);
      expect(listener1).toHaveBeenCalledWith(event);
      expect(listener2).toHaveBeenCalledWith(event);
    });

    it('does not call unsubscribed listeners', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      const unsub = service.onPreferencesUpdated(listener);
      unsub();
      socket._trigger('user:preferences-updated', makePrefsEvent());
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('onPreferencesUpdated', () => {
    it('returns a function that removes the listener', () => {
      const listener = jest.fn();
      const unsub = service.onPreferencesUpdated(listener);
      expect(typeof unsub).toBe('function');
      unsub();
      // Verify listener is gone by setting up a socket and triggering the event
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      socket._trigger('user:preferences-updated', makePrefsEvent());
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('removes all listeners so events are silently ignored', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      service.onPreferencesUpdated(listener);
      service.cleanup();
      socket._trigger('user:preferences-updated', makePrefsEvent());
      expect(listener).not.toHaveBeenCalled();
    });

    it('does not throw on a fresh instance', () => {
      expect(() => service.cleanup()).not.toThrow();
    });
  });

  describe('onCategoryChanged', () => {
    it('registers category:created handler and fires callback', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      service.onCategoryChanged(listener);
      socket._trigger('category:created', { userId: 'u1', category: { id: 'cat-1', name: 'Work' } });
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('registers category:updated handler and fires callback', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      service.onCategoryChanged(listener);
      socket._trigger('category:updated', { userId: 'u1', category: { id: 'cat-1', name: 'Friends' } });
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('registers category:deleted handler and fires callback', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      service.onCategoryChanged(listener);
      socket._trigger('category:deleted', { userId: 'u1', categoryId: 'cat-1' });
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('registers categories:reordered handler and fires callback', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      service.onCategoryChanged(listener);
      socket._trigger('categories:reordered', { userId: 'u1', updates: [] });
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('registers user:preferences-reordered handler and fires callback', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      service.onCategoryChanged(listener);
      socket._trigger('user:preferences-reordered', { userId: 'u1', updates: [] });
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('unsubscribe stops receiving category events', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      const unsub = service.onCategoryChanged(listener);
      unsub();
      socket._trigger('category:created', { userId: 'u1', category: {} });
      expect(listener).not.toHaveBeenCalled();
    });
  });
});
