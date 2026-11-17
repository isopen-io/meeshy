import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'bun:test';
import { QueryClient, dehydrate, hydrate } from '@tanstack/react-query';

import * as attachmentsEndpoints from '@meeshy/shared/api/endpoints/attachments';
import * as meEndpoints from '@meeshy/shared/api/endpoints/me';
import * as usersEndpoints from '@meeshy/shared/api/endpoints/users';

import { resolveReaderLanguages } from '../reader';
import { createAccountVault, type AccountVault } from './accounts';
import { createHttpTransport, type HttpTransport } from './http';
import { MY_PROFILE_QUERY_KEY, myProfileQueryOptions, type MyProfile } from './profile';
import { appProfileActionDeps } from './profile-action-deps';
import { performImageUpdate, performProfileEdit } from './profile-actions';
import { appQueryClient } from './query-client';
import { followServedProfile } from './served-profile-session';
import { createSessionStore, sessionStore, type SessionStorage, type SessionStoreApi, type SessionUser } from './session';

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

/** Une passerelle dont CHAQUE requête attend qu'on la libère, dans l'ordre que
 * le témoin choisit — `GET /me` compris. */
const heldGateway = () => {
  const held: Array<{ readonly method: string; readonly path: string; readonly release: (reply: Reply) => void }> = [];
  const fetchImpl = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
    new Promise((resolve) => {
      held.push({ method: init?.method ?? 'GET', path: new URL(String(input)).pathname, release: (reply) => resolve(replyOf(reply)) });
    });
  const transport: HttpTransport = createHttpTransport({ base: 'https://gate.test', fetchImpl: fetchImpl as typeof fetch, timeoutMs: 0 });
  const take = (method: string, path: string) => {
    const index = held.findIndex((request) => request.method === method && request.path === path);
    const [request] = index === -1 ? [] : held.splice(index, 1);
    if (request === undefined) throw new Error(`aucune requête ${method} ${path} en attente`);
    return request;
  };
  return { transport, take };
};

const servedUser = (wire: Readonly<Record<string, unknown>>): Reply => ({ status: 200, body: { success: true, data: { user: wire } } });

const tick = (): Promise<void> => new Promise((settled) => setTimeout(settled, 0));

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

  test('une relecture partie PENDANT le PATCH et arrivée après lui ne défait pas la langue enregistrée', async () => {
    const session = signedIn();
    const { queryClient, accounts, stop } = following({ session });
    const { transport, take } = heldGateway();
    const deps = { source: 'gateway' as const, transport, queryClient, session, accounts, isOnline: () => true };

    const edit = performProfileEdit({ patch: { systemLanguage: 'en' }, deps });
    await tick();
    const reread = readMe(queryClient, transport).catch(() => undefined);
    await tick();
    const getMe = take('GET', meEndpoints.root);
    take('PATCH', usersEndpoints.me).release(servedUser(wireUser({ systemLanguage: 'en' })));
    expect(await edit).toEqual({ status: 'saved' });

    getMe.release(servedUser(wireUser()));
    await reread;
    await tick();

    expect(readerOf(session)[0]).toBe('en');
    expect(accounts.list()[0]?.user.systemLanguage).toBe('en');
    stop();
  });

  test('une photo que je viens de poser n’est pas défaite par un GET /me parti avant elle', async () => {
    const session = signedIn({ ...ADA, avatar: '2026/01/u-ada/ancienne.webp' });
    const { queryClient, accounts, stop } = following({ session });
    const { transport, take } = heldGateway();
    const deps = { source: 'gateway' as const, transport, queryClient, session, accounts, isOnline: () => true, recompress: async (file: Blob) => file };

    const reread = readMe(queryClient, transport).catch(() => undefined);
    await tick();
    const getMe = take('GET', meEndpoints.root);
    const update = performImageUpdate({ kind: 'avatar', file: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' }), deps });
    for (const _ of [1, 2, 3, 4, 5]) await tick();
    take('POST', attachmentsEndpoints.upload).release({
      status: 200,
      body: { success: true, data: { attachments: [{ id: 'a-1', fileUrl: '2026/11/u-ada/nouvelle.webp' }] } },
    });
    for (const _ of [1, 2, 3, 4, 5]) await tick();
    take('PATCH', usersEndpoints.meAvatar).release(servedUser(wireUser({ avatar: '2026/11/u-ada/nouvelle.webp' })));
    expect((await update).status).toBe('saved');

    getMe.release(servedUser(wireUser({ avatar: '2026/01/u-ada/ancienne.webp' })));
    await reread;
    await tick();

    expect(sessionUser(session)?.avatar).toBe('2026/11/u-ada/nouvelle.webp');
    expect(accounts.list()[0]?.user.avatar).toBe('2026/11/u-ada/nouvelle.webp');
    stop();
  });

  test('une copie de GET /me plus ANCIENNE que l’écriture confirmée (service worker, cache de la passerelle) ne fait pas reculer la session', async () => {
    const session = signedIn();
    const { queryClient, accounts, stop } = following({ session });
    const { transport, take } = heldGateway();
    const deps = { source: 'gateway' as const, transport, queryClient, session, accounts, isOnline: () => true };
    const edit = performProfileEdit({ patch: { systemLanguage: 'en' }, deps });
    await tick();
    take('PATCH', usersEndpoints.me).release(servedUser(wireUser({ systemLanguage: 'en', updatedAt: '2026-11-17T09:00:05.000Z' })));
    expect(await edit).toEqual({ status: 'saved' });

    await queryClient.invalidateQueries({ queryKey: MY_PROFILE_QUERY_KEY });
    const reread = readMe(queryClient, transport);
    await tick();
    take('GET', meEndpoints.root).release(servedUser(wireUser({ systemLanguage: 'fr', updatedAt: '2026-11-17T08:00:00.000Z' })));
    await reread;
    await tick();

    expect(readerOf(session)[0]).toBe('en');
    expect(accounts.list()[0]?.user.systemLanguage).toBe('en');
    stop();
  });

  test('une copie plus ANCIENNE qu’une relecture déjà prise ne la défait pas, une plus RÉCENTE se projette', async () => {
    const session = signedIn();
    const { queryClient, stop } = following({ session });
    const served = { user: wireUser({ systemLanguage: 'en', updatedAt: '2026-11-17T09:00:00.000Z' }) };
    const { transport } = gateway(() => served.user);

    await readMe(queryClient, transport);
    served.user = wireUser({ systemLanguage: 'fr', updatedAt: '2026-11-10T09:00:00.000Z' });
    await queryClient.invalidateQueries({ queryKey: MY_PROFILE_QUERY_KEY });
    await readMe(queryClient, transport);
    expect(readerOf(session)[0]).toBe('en');

    served.user = wireUser({ systemLanguage: 'es', updatedAt: '2026-11-17T09:30:00.000Z' });
    await queryClient.invalidateQueries({ queryKey: MY_PROFILE_QUERY_KEY });
    await readMe(queryClient, transport);
    expect(readerOf(session)[0]).toBe('es');
    stop();
  });

  test('après un changement de compte, le profil de l’AUTRE compte se projette, même daté avant la dernière écriture du premier', async () => {
    const session = signedIn();
    const { queryClient, stop } = following({ session, accounts: vaultKnowing(ADA) });
    const served = { user: wireUser({ systemLanguage: 'en', updatedAt: '2026-11-17T09:00:00.000Z' }) };
    const { transport } = gateway(() => served.user);
    await readMe(queryClient, transport);

    session.getState().establish({ user: { id: 'u-bob', username: 'bob', systemLanguage: 'fr' }, token: 'jeton-bob', sessionToken: 'session-bob', expiresIn: 3600 });
    served.user = wireUser({ id: 'u-bob', username: 'bob', systemLanguage: 'es', regionalLanguage: null, updatedAt: '2026-11-01T09:00:00.000Z' });
    queryClient.clear();
    await readMe(queryClient, transport);

    expect(readerOf(session)[0]).toBe('es');
    stop();
  });

  test('deux onglets, deux comptes : la projection dans l’onglet d’Ada n’écrase pas la session persistée par l’onglet de Bob', async () => {
    const storage = memoryStorage();
    const adaTab = createSessionStore({ storage, now: () => NOW });
    adaTab.getState().establish({ user: ADA, token: 'jeton-ada', sessionToken: 'session-ada', expiresIn: 3600 });
    createSessionStore({ storage, now: () => NOW }).getState().establish({
      user: { id: 'u-bob', username: 'bob', displayName: 'Bob', systemLanguage: 'es' },
      token: 'jeton-bob',
      sessionToken: 'session-bob',
      expiresIn: 3600,
    });
    const { queryClient, stop } = following({ session: adaTab });
    const { transport } = gateway(() => wireUser({ systemLanguage: 'en' }));

    await readMe(queryClient, transport);

    expect(readerOf(adaTab)[0]).toBe('en');
    const bobTabReloaded = createSessionStore({ storage, now: () => NOW });
    bobTabReloaded.getState().restoreSession();
    expect(sessionUser(bobTabReloaded)?.id).toBe('u-bob');
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

/**
 * **LA PROJECTION EST BRANCHÉE** (WEB-01, P0). `followServedProfile` ne sert
 * à rien s'il n'est pas appelé : c'est `realtime.ts` qui l'appelle, au
 * chargement du module, avec le client et la session de l'application. Ce
 * module n'est importé par aucun témoin (ses abonnements de module
 * toucheraient les singletons de toute la suite) : on lit donc sa source,
 * motif `banner-revocation.test.ts`, en exigeant une instruction de PREMIER
 * niveau — ni commentée, ni enfermée dans une fonction.
 */
describe('la projection de GET /me est branchée dans l’application', () => {
  test('realtime.ts suit le profil servi, avec le client et la session de l’application', () => {
    const lines = readFileSync(new URL('./realtime.ts', import.meta.url), 'utf8').split('\n');

    expect(lines.filter((line) => line.includes('followServedProfile('))).toContain('followServedProfile(appProfileActionDeps());');
    const deps = appProfileActionDeps();
    expect(deps.queryClient).toBe(appQueryClient);
    expect(deps.session).toBe(sessionStore);
  });
});
