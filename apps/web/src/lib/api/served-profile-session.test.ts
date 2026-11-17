import { describe, expect, test } from 'bun:test';
import { QueryClient, dehydrate, hydrate } from '@tanstack/react-query';

import * as meEndpoints from '@meeshy/shared/api/endpoints/me';

import { resolveReaderLanguages } from '../reader';
import { createAccountVault, type AccountVault } from './accounts';
import { createHttpTransport, type HttpTransport } from './http';
import { MY_PROFILE_QUERY_KEY, myProfileQueryOptions, type MyProfile } from './profile';
import { performProfileEdit } from './profile-actions';
import { followServedProfile } from './served-profile-session';
import { createSessionStore, type SessionStorage, type SessionStoreApi, type SessionUser } from './session';

/**
 * **LA SESSION SUIT LE PROFIL SERVI** (#18914, WEB-01) — la langue, le nom et
 * la photo changés sur un AUTRE appareil arrivent sur le web par `GET /me`.
 * La session les tenait depuis la connexion et ne les relisait jamais : le
 * Prisme de tout le produit restait celui de la connexion, rechargement
 * compris. Les témoins de langue descendent le Prisme sur un rang AUTRE que le
 * premier (leçon 261).
 */

const NOW = Date.UTC(2026, 10, 17, 9, 0, 0);

const memoryStorage = (): SessionStorage => {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
};

const ADA: SessionUser = { id: 'u-ada', username: 'ada', displayName: 'Ada L.', systemLanguage: 'fr', regionalLanguage: 'de' };

const signedIn = (user: SessionUser = ADA): SessionStoreApi => {
  const store = createSessionStore({ storage: memoryStorage(), now: () => NOW });
  store.getState().establish({ user, token: 'jeton-de-test', sessionToken: 'session-de-test', expiresIn: 3600 });
  return store;
};

const wireUser = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  id: 'u-ada',
  username: 'ada',
  displayName: 'Ada L.',
  firstName: 'Ada',
  lastName: 'Lovelace',
  bio: '',
  avatar: null,
  banner: null,
  systemLanguage: 'fr',
  regionalLanguage: 'de',
  customDestinationLanguage: null,
  createdAt: '2025-03-14T09:00:00.000Z',
  ...overrides,
});

type Reply = { readonly status: number; readonly body: unknown };

const replyOf = (reply: Reply): Response =>
  new Response(JSON.stringify(reply.body), { status: reply.status, headers: { 'content-type': 'application/json' } });

/** La passerelle : `GET /me` sert `me()` à l'instant ; un `PATCH` attend qu'on
 * le LIBÈRE — ce qui laisse regarder la session pendant l'édition en vol. */
const gateway = (me: () => Readonly<Record<string, unknown>>) => {
  const held: Array<(reply: Reply) => void> = [];
  const fetchImpl = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if ((init?.method ?? 'GET') === 'GET' && new URL(String(input)).pathname === meEndpoints.root) {
      return Promise.resolve(replyOf({ status: 200, body: { success: true, data: { user: me() } } }));
    }
    return new Promise((resolve) => held.push((reply) => resolve(replyOf(reply))));
  };
  const transport: HttpTransport = createHttpTransport({ base: 'https://gate.test', fetchImpl: fetchImpl as typeof fetch, timeoutMs: 0 });
  return {
    transport,
    release: (reply: Reply) => held.shift()?.(reply),
    pending: () => held.length,
  };
};

const vaultKnowing = (user: SessionUser): AccountVault => {
  const vault = createAccountVault({ storage: memoryStorage(), now: () => NOW });
  vault.noteActive(user);
  return vault;
};

const following = (params: { readonly session: SessionStoreApi; readonly accounts?: AccountVault }) => {
  const queryClient = new QueryClient();
  const accounts = params.accounts ?? vaultKnowing(ADA);
  const stop = followServedProfile({ queryClient, session: params.session, accounts });
  return { queryClient, accounts, stop };
};

const sessionUser = (store: SessionStoreApi): SessionUser | undefined => {
  const state = store.getState().session;
  return state.status === 'authenticated' ? state.user : undefined;
};

const readerOf = (store: SessionStoreApi): readonly string[] =>
  resolveReaderLanguages({ source: 'gateway', session: { status: 'authenticated', user: { ...sessionUser(store) } } });

const readMe = (queryClient: QueryClient, transport: HttpTransport): Promise<MyProfile> =>
  queryClient.fetchQuery(myProfileQueryOptions({ source: 'gateway', transport }));

describe('la session suit le profil SERVI par GET /me (WEB-01)', () => {
  test('des langues changées sur un autre appareil deviennent le Prisme du lecteur, rang 2 compris', async () => {
    const session = signedIn();
    const { queryClient, stop } = following({ session });
    const { transport } = gateway(() => wireUser({ systemLanguage: 'en', regionalLanguage: 'es' }));

    await readMe(queryClient, transport);

    expect(readerOf(session).slice(0, 2)).toEqual(['en', 'es']);
    stop();
  });

  test('le nom et la photo servis rejoignent la session et la ligne du compte sur l’appareil', async () => {
    const session = signedIn();
    const { queryClient, accounts, stop } = following({ session });
    const { transport } = gateway(() => wireUser({ displayName: 'Ada Lovelace', avatar: '2026/11/u-ada/nouvelle.webp' }));

    await readMe(queryClient, transport);

    expect(sessionUser(session)?.displayName).toBe('Ada Lovelace');
    expect(sessionUser(session)?.avatar).toBe('2026/11/u-ada/nouvelle.webp');
    expect(accounts.list()[0]?.user.displayName).toBe('Ada Lovelace');
    stop();
  });

  test('un profil servi pour un AUTRE compte ne touche pas la session', async () => {
    const session = signedIn();
    const { queryClient, stop } = following({ session });
    const { transport } = gateway(() => wireUser({ id: 'u-bob', username: 'bob', systemLanguage: 'en' }));

    await readMe(queryClient, transport);

    expect(readerOf(session).slice(0, 2)).toEqual(['fr', 'de']);
    stop();
  });

  test('un cache RÉHYDRATÉ ne projette rien : seule une réponse du réseau fait foi', () => {
    const session = signedIn();
    const { queryClient, stop } = following({ session });
    const elsewhere = new QueryClient();
    elsewhere.setQueryData(MY_PROFILE_QUERY_KEY, { ...wireUser({ systemLanguage: 'en' }), email: null, phone: null });

    hydrate(queryClient, dehydrate(elsewhere));

    expect(queryClient.getQueryData<MyProfile>(MY_PROFILE_QUERY_KEY)?.systemLanguage).toBe('en');
    expect(readerOf(session).slice(0, 2)).toEqual(['fr', 'de']);
    stop();
  });

  test('une écriture LOCALE du cache ne projette rien : le geste qui l’écrit tient la session lui-même', () => {
    const session = signedIn();
    const { queryClient, stop } = following({ session });

    queryClient.setQueryData(MY_PROFILE_QUERY_KEY, { ...wireUser({ systemLanguage: 'en' }), email: null, phone: null });

    expect(readerOf(session)[0]).toBe('fr');
    stop();
  });

  test('une relecture servie pendant une édition EN VOL ne défait pas l’optimiste', async () => {
    const session = signedIn();
    const { queryClient, accounts, stop } = following({ session });
    const { transport, release, pending } = gateway(() => wireUser());
    const deps = { source: 'gateway' as const, transport, queryClient, session, accounts, isOnline: () => true };

    const edit = performProfileEdit({ patch: { systemLanguage: 'en' }, deps });
    await new Promise((settled) => setTimeout(settled, 0));
    expect(pending()).toBe(1);
    await readMe(queryClient, transport);

    expect(readerOf(session)[0]).toBe('en');
    release({ status: 200, body: { success: true, data: { user: wireUser({ systemLanguage: 'en' }) } } });
    expect(await edit).toEqual({ status: 'saved' });
    expect(readerOf(session)[0]).toBe('en');
    stop();
  });

  test('un profil servi identique à la session ne la réécrit pas', async () => {
    const session = signedIn();
    const { queryClient, stop } = following({ session });
    const { transport } = gateway(() => wireUser());
    const notified = { count: 0 };
    const unsubscribe = session.subscribe(() => {
      notified.count += 1;
    });

    await readMe(queryClient, transport);

    expect(notified.count).toBe(0);
    unsubscribe();
    stop();
  });

  test('l’abonnement retiré, la session ne suit plus', async () => {
    const session = signedIn();
    const { queryClient, stop } = following({ session });
    const { transport } = gateway(() => wireUser({ systemLanguage: 'en' }));

    stop();
    await readMe(queryClient, transport);

    expect(readerOf(session)[0]).toBe('fr');
  });
});
