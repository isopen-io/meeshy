import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { endRevokedSession } from './account-end';
import { endRefusedSession } from './client';
import { endGuestAccess } from './guest-access-end';
import { createSessionStore, heldAccountOf, type GuestIdentity, type SessionStorage, type SessionUser } from './session';
import { useAnonymousScope, type ScopeRoute } from '@/lib/view/use-anonymous-scope';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

/**
 * LA FIN D'UN ACCÈS D'INVITÉ TENU PAR UN COMPTE NE FERME QUE L'INVITÉ (#8816, #10442, audit #19352).
 * Le transport branche `onGuestAccessEnded` sur `endGuestAccess({ end: endSessionOf })`, et la fin d'une
 * session refusée se charge à la demande. `endGuestAccess` navigue aussitôt après `end` : la nouvelle route
 * ne lit aucune conversation, et la garde de portée (`useAnonymousScope`) rend la session au COMPTE en une
 * micro-tâche. Une fin qui attendrait son morceau s'appliquerait alors au compte : il quitterait l'appareil,
 * ce qu'il y a laissé serait effacé, et l'identité refusée resterait tenue.
 */
const ADA: SessionUser = { id: 'u-ada', username: 'ada' };
const GUEST: GuestIdentity = { participantId: 'p-1', nickname: 'Anonyme', conversationId: 'c-1', link: 'mshy_lien', mayWrite: true };
const NOW = Date.UTC(2026, 10, 18, 12, 0, 0);
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

function fakeStorage(): SessionStorage {
  const raw = new Map<string, string>();
  return { getItem: (k) => raw.get(k) ?? null, setItem: (k, v) => void raw.set(k, v), removeItem: (k) => void raw.delete(k) };
}

function heldByAccount() {
  const storage = fakeStorage();
  const store = createSessionStore({ storage, now: () => NOW });
  store.getState().establish({ user: ADA, token: 'jwt-ada', sessionToken: 'sess-ada', expiresIn: 3600 });
  store.getState().adoptAnonymous({ sessionToken: 'anon-1', guest: GUEST });
  return { storage, store };
}

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/conversations/c-1' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

describe('la fin d’un accès d’invité tenu par un compte ne ferme que l’invité', () => {
  test('fin chargée à la demande puis garde de portée en micro-tâche : le compte reste sur l’appareil', async () => {
    const { storage, store } = heldByAccount();
    expect(store.getState().session.status).toBe('guest');

    endGuestAccess({
      reason: 'revoked',
      store,
      end: (s) => endRefusedSession(s, { storage: storage as never }),
      navigate: () => queueMicrotask(() => store.getState().scopeAnonymous(null)),
    });
    await settle();

    const session = store.getState().session;
    expect(session.status).toBe('authenticated');
    expect(heldAccountOf(store.getState().deviceSession())?.user.id).toBe('u-ada');
  });

  test('garde de portée montée (useAnonymousScope) et route du lien : le compte reste sur l’appareil', async () => {
    const { storage, store } = heldByAccount();
    let go: (route: ScopeRoute) => void = () => undefined;
    function Root() {
      const [route, setRoute] = useState<ScopeRoute>({ key: 'thread', params: { conversation: 'c-1' } });
      go = setRoute;
      useAnonymousScope(route, store);
      return null;
    }
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(<Root />));
    expect(store.getState().session.status).toBe('guest');

    act(() =>
      endGuestAccess({
        reason: 'revoked',
        store,
        end: (s) => endRefusedSession(s, { storage: storage as never }),
        navigate: () => go({ key: 'link-chat', params: { link: 'mshy_lien' } }),
      }),
    );
    await act(settle);

    const session = store.getState().session;
    act(() => root.unmount());
    container.remove();
    expect(session.status).toBe('authenticated');
    expect(heldAccountOf(store.getState().deviceSession())?.user.id).toBe('u-ada');
  });
  test('ce que le compte a laissé sur l’appareil (publications non envoyées du studio) n’est pas effacé', async () => {
    const { storage, store } = heldByAccount();
    const erased: string[] = [];
    endGuestAccess({
      reason: 'expired',
      store,
      end: (s) =>
        endRefusedSession(s, {
          storage: storage as never,
          load: () => import('./account-end').then((module) => ({ endRevokedSession: (st) => module.endRevokedSession(st, { storage: storage as never, cacheStorage: { keys: async () => [], delete: async () => true }, publications: { clear: async (id: string) => void erased.push(id) } }) })),
        }),
      navigate: () => queueMicrotask(() => store.getState().scopeAnonymous(null)),
    });
    await settle();
    expect(erased).toEqual([]);
  });
});

describe('l’identité retirée ne reste pas tenue par le compte', () => {
  test('après la fin, Ada se reconnecte : la conversation retirée ne la remet pas sous l’identité refusée', async () => {
    const { storage, store } = heldByAccount();
    endGuestAccess({
      reason: 'revoked',
      store,
      end: (s) => endRefusedSession(s, { storage: storage as never }),
      navigate: () => queueMicrotask(() => store.getState().scopeAnonymous(null)),
    });
    await settle();
    store.getState().establish({ user: ADA, token: 'jwt-ada-2', sessionToken: 'sess-ada-2', expiresIn: 3600 });
    const scope = store.getState().anonymousScopeFor('c-1');
    expect(scope).toBeNull();
  });
});

describe('câblage de l’application : la fin de l’accès d’un invité tenu par un compte ne déconnecte pas le compte', () => {
  test('le vrai gestionnaire du transport, le vrai routeur, le vrai magasin et la vraie garde : l’invité part, Ada reste connectée', async () => {
    const { onTabGuestAccessEnded } = await import('./client');
    const { sessionStore } = await import('./session');
    const { useIsCurrentPath } = await import('@/lib/router');
    window.history.replaceState(null, '', '/c/c-1');
    sessionStore.getState().establish({ user: ADA, token: 'jwt-ada', sessionToken: 'sess-ada', expiresIn: 3600 });
    sessionStore.getState().adoptAnonymous({ sessionToken: 'anon-1', guest: GUEST });

    function Root() {
      const onThread = useIsCurrentPath('/c/c-1');
      useAnonymousScope(onThread ? { key: 'thread', params: { conversation: 'c-1' } } : { key: 'chatJoin', params: { link: 'mshy_lien' } }, sessionStore);
      return null;
    }
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      act(() => root.render(<Root />));
      expect(sessionStore.getState().session.status).toBe('guest');

      act(() => onTabGuestAccessEnded('revoked'));
      await act(() => new Promise((resolve) => setTimeout(resolve, 50)));

      expect(window.location.pathname + window.location.search).toBe('/chat/mshy_lien?ended=revoked');
      expect(sessionStore.getState().session.status).toBe('authenticated');
      expect(heldAccountOf(sessionStore.getState().deviceSession())?.user.id).toBe('u-ada');
      expect(sessionStore.getState().anonymousScopeFor('c-1')).toBeNull();
    } finally {
      act(() => root.unmount());
      container.remove();
      sessionStore.getState().clearSession();
    }
  });
});
