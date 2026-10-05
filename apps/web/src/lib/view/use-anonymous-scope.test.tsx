import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { createSessionStore, type SessionState, type SessionStorage, type SessionStoreApi } from '@/lib/api/session';

import { anonymousConversationOf, useAnonymousScope } from './use-anonymous-scope';

/**
 * L'IDENTITÉ SUIT LA CONVERSATION LUE (#8816) — la garde de route pose la
 * session EFFECTIVE avant que l'écran ne rende : sur le fil d'une conversation
 * rejointe en anonyme, l'invité tenu ; partout ailleurs, le compte. Tant que
 * les deux ne concordent pas, l'écran n'est pas rendu — sa première requête
 * ne part jamais sous la mauvaise identité.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounted: Root[] = [];
afterEach(() => {
  act(() => mounted.splice(0).forEach((root) => root.unmount()));
});

function memoryStorage(): SessionStorage {
  const raw = new Map<string, string>();
  return {
    getItem: (key) => raw.get(key) ?? null,
    setItem: (key, value) => {
      raw.set(key, value);
    },
    removeItem: (key) => {
      raw.delete(key);
    },
  };
}

function accountWithAnonymous(): SessionStoreApi {
  const store = createSessionStore({ storage: memoryStorage(), now: () => Date.UTC(2026, 8, 30) });
  store.getState().establish({ user: { id: 'u-ada', username: 'ada' }, token: 'jwt-ada', sessionToken: 's', expiresIn: 86_400 });
  store.getState().adoptAnonymous({
    sessionToken: 'anon_1',
    guest: { participantId: 'p1', nickname: 'Masque', conversationId: 'c-anon', link: 'mshy_x', mayWrite: true },
  });
  store.getState().scopeAnonymous(null);
  return store;
}

type Seen = { settled: boolean; session: SessionState['status'] };

function mount(store: SessionStoreApi, route: { key: string; params: Record<string, string> }): Seen[] {
  const seen: Seen[] = [];
  function Probe() {
    const settled = useAnonymousScope(route, store);
    seen.push({ settled, session: store.getState().session.status });
    return null;
  }
  const container = document.createElement('div');
  const root = createRoot(container);
  mounted.push(root);
  act(() => root.render(<Probe />));
  return seen;
}

describe('anonymousConversationOf — la conversation que la route lit', () => {
  test('le fil nomme sa conversation ; toute autre route, aucune', () => {
    expect(anonymousConversationOf({ key: 'thread', params: { conversation: 'c-1' } })).toBe('c-1');
    expect(anonymousConversationOf({ key: 'list', params: {} })).toBeNull();
    expect(anonymousConversationOf({ key: 'chatJoin', params: { link: 'mshy_x' } })).toBeNull();
  });
});

describe('useAnonymousScope — la session effective suit la route', () => {
  test('le fil de la conversation anonyme passe sous l’invité, et l’écran n’est rendu qu’alors', () => {
    const store = accountWithAnonymous();
    const seen = mount(store, { key: 'thread', params: { conversation: 'c-anon' } });

    expect(seen.filter((entry) => entry.settled).every((entry) => entry.session === 'guest')).toBe(true);
    expect(seen.at(-1)).toEqual({ settled: true, session: 'guest' });
  });

  test('toute autre route rend le COMPTE', () => {
    const store = accountWithAnonymous();
    store.getState().scopeAnonymous('c-anon');
    const seen = mount(store, { key: 'list', params: {} });

    expect(seen.filter((entry) => entry.settled).every((entry) => entry.session === 'authenticated')).toBe(true);
    expect(seen.at(-1)).toEqual({ settled: true, session: 'authenticated' });
  });

  test('le fil d’une conversation du compte reste sous le compte, sans détour', () => {
    const store = accountWithAnonymous();
    const seen = mount(store, { key: 'thread', params: { conversation: 'c-mine' } });

    expect(seen).toEqual([{ settled: true, session: 'authenticated' }]);
  });

  test('sans compte, rien ne change (le visiteur invité garde sa session)', () => {
    const store = createSessionStore({ storage: memoryStorage(), now: () => Date.UTC(2026, 8, 30) });
    store.getState().establishGuest({
      sessionToken: 'anon_9',
      guest: { participantId: 'p9', nickname: 'Awa', conversationId: 'c-9', link: 'mshy_9', mayWrite: true },
    });
    const seen = mount(store, { key: 'thread', params: { conversation: 'c-9' } });

    expect(seen).toEqual([{ settled: true, session: 'guest' }]);
  });
});
