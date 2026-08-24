/**
 * Unit tests for PreferencesSyncService.
 * Covers socket event forwarding and listener lifecycle.
 */

/**
 * Ce fichier portait une fabrique `jest.mock('@meeshy/shared/types/socketio-events')`
 * énumérant six constantes de `SERVER_EVENTS`. Elle était INERTE — le
 * `moduleNameMapper` réécrit `@meeshy/shared/*` vers `packages/shared/dist`,
 * donc le service recevait déjà les vraies valeurs (cf. `apps/web/CLAUDE.md`).
 *
 * Retirée plutôt que complétée : un double PARTIEL d'un module de constantes
 * PURES n'a aucune raison d'exister, et son énumération se lit comme une source
 * de vérité qui dérive du contrat en silence. Le jour où la fabrique
 * redeviendrait vivante, la septième constante — celle que ce lot ajoute —
 * sortirait à `undefined` sur ses DEUX adresses sans qu'un témoin d'écoute le
 * voie, puisqu'ils assertent le NOM depuis la même constante.
 */
import { PreferencesSyncService } from '@/services/socketio/preferences-sync.service';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

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

    /**
     * `user:preferences-reordered` PORTE une charge utile (`updates[]`), et la
     * router vers le seau des catégories — dont l'écouteur est `() => void` —
     * la jetait. Ce n'est pas non plus un événement de catégorie : un
     * réordonnancement de conversations ne change aucune `UserConversationCategory`.
     */
    it('does not route user:preferences-reordered to the payload-less category bucket', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      service.onCategoryChanged(listener);
      socket._trigger('user:preferences-reordered', { userId: 'u1', updates: [] });
      expect(listener).not.toHaveBeenCalled();
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

  describe('onPreferencesReordered', () => {
    it('registers user:preferences-reordered on the socket', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      expect(socket.on).toHaveBeenCalledWith('user:preferences-reordered', expect.any(Function));
    });

    it('forwards the updates payload verbatim to every listener', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const first = jest.fn();
      const second = jest.fn();
      service.onPreferencesReordered(first);
      service.onPreferencesReordered(second);

      const payload = {
        userId: 'u1',
        updates: [
          { conversationId: 'conv-a', orderInCategory: 2 },
          { conversationId: 'conv-b', orderInCategory: 5 },
        ],
      };
      socket._trigger('user:preferences-reordered', payload);

      expect(first).toHaveBeenCalledWith(payload);
      expect(second).toHaveBeenCalledWith(payload);
    });

    it('unsubscribe stops receiving reorder events', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      const unsub = service.onPreferencesReordered(listener);
      unsub();
      socket._trigger('user:preferences-reordered', { userId: 'u1', updates: [] });
      expect(listener).not.toHaveBeenCalled();
    });

    it('cleanup drops reorder listeners', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      service.onPreferencesReordered(listener);
      service.cleanup();
      socket._trigger('user:preferences-reordered', { userId: 'u1', updates: [] });
      expect(listener).not.toHaveBeenCalled();
    });
  });

  /**
   * `user:preferences-community-reordered` — le même geste sur l'autre table,
   * et un SEAU à part.
   *
   * Le nom vient de la constante partagée, jamais d'un littéral : c'est la seule
   * façon qu'un témoin d'écoute a de tomber si l'émetteur et le récepteur
   * cessent de nommer la même chose.
   */
  describe('onCommunityPreferencesReordered', () => {
    const COMMUNITY_REORDERED = SERVER_EVENTS.USER_PREFERENCES_COMMUNITY_REORDERED;

    it('registers the community reorder event on the socket', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      expect(socket.on).toHaveBeenCalledWith(COMMUNITY_REORDERED, expect.any(Function));
    });

    it('forwards the updates payload verbatim to every listener', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const first = jest.fn();
      const second = jest.fn();
      service.onCommunityPreferencesReordered(first);
      service.onCommunityPreferencesReordered(second);

      const payload = {
        userId: 'u1',
        updates: [
          { communityId: 'comm-a', orderInCategory: 2 },
          { communityId: 'comm-b', orderInCategory: 5 },
        ],
      };
      socket._trigger(COMMUNITY_REORDERED, payload);

      expect(first).toHaveBeenCalledWith(payload);
      expect(second).toHaveBeenCalledWith(payload);
    });

    /**
     * Les deux seaux sont DISJOINTS dans les deux sens. C'est la garde qui
     * porte la décision de contrat : les deux charges ne sont pas
     * interchangeables, et un décodeur qui reçoit l'autre ne le dit pas — il
     * échoue en silence (iOS) ou filtre (le magasin web).
     */
    it('keeps the two reorder buckets disjoint', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const conversationListener = jest.fn();
      const communityListener = jest.fn();
      service.onPreferencesReordered(conversationListener);
      service.onCommunityPreferencesReordered(communityListener);

      socket._trigger(COMMUNITY_REORDERED, {
        userId: 'u1',
        updates: [{ communityId: 'comm-a', orderInCategory: 0 }],
      });
      expect(conversationListener).not.toHaveBeenCalled();
      expect(communityListener).toHaveBeenCalledTimes(1);

      socket._trigger(SERVER_EVENTS.USER_PREFERENCES_REORDERED, {
        userId: 'u1',
        updates: [{ conversationId: 'conv-a', orderInCategory: 0 }],
      });
      expect(communityListener).toHaveBeenCalledTimes(1);
      expect(conversationListener).toHaveBeenCalledTimes(1);
    });

    it('does not route the community reorder to the payload-less category bucket', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      service.onCategoryChanged(listener);
      socket._trigger(COMMUNITY_REORDERED, { userId: 'u1', updates: [] });
      expect(listener).not.toHaveBeenCalled();
    });

    it('unsubscribe and cleanup both stop the community reorder listener', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);

      const unsubscribed = jest.fn();
      const unsub = service.onCommunityPreferencesReordered(unsubscribed);
      unsub();
      socket._trigger(COMMUNITY_REORDERED, { userId: 'u1', updates: [] });
      expect(unsubscribed).not.toHaveBeenCalled();

      const cleaned = jest.fn();
      service.onCommunityPreferencesReordered(cleaned);
      service.cleanup();
      socket._trigger(COMMUNITY_REORDERED, { userId: 'u1', updates: [] });
      expect(cleaned).not.toHaveBeenCalled();
    });
  });

});
