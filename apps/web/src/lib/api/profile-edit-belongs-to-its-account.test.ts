import { describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';

import { createAccountVault } from './accounts';
import { createHttpTransport } from './http';
import { MY_PROFILE_QUERY_KEY, type MyProfile } from './profile';
import { performImageUpdate, performProfileEdit, type ProfileActionDeps } from './profile-actions';
import { followServedProfile, takeProfileSnapshot } from './served-profile-session';
import { createSessionStore, sessionIdentityKey, type SessionStorage, type SessionStoreApi } from './session';

/**
 * UN GESTE DU PROFIL APPARTIENT AU COMPTE QUI L'A LANCÉ (revue de #19352).
 *
 * L'onglet suit l'appareil quand un autre onglet change de compte. Une réponse
 * qui arrive pour un compte quitté n'est jamais rendue par le transport : sa
 * promesse ne se résout pas. Le geste qui l'attendait ne finissait donc jamais,
 * et la retenue qu'il pose sur le profil servi (`holdProfileEdit`) restait
 * posée : tout profil servi ensuite au compte suivant — `GET /me`,
 * `profile:updated` d'un autre appareil — était retenu jusqu'au rechargement.
 * Et l'édition, qui attend l'annulation des lectures avant de partir, pouvait
 * partir sous le compte suivant.
 */

const NOW = Date.UTC(2026, 10, 18, 9, 0, 0);

const memoryStorage = (): SessionStorage => {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
};

const adaSignedIn = (): SessionStoreApi => {
  const store = createSessionStore({ storage: memoryStorage(), now: () => NOW });
  store.getState().establish({
    user: { id: 'u-ada', username: 'ada', displayName: 'Ada L.', systemLanguage: 'fr' },
    token: 'jeton-d-ada',
    sessionToken: 'session-d-ada',
    expiresIn: 3600,
  });
  return store;
};

const switchToBob = (session: SessionStoreApi): void =>
  session.getState().establish({
    user: { id: 'u-bob', username: 'bob', displayName: 'Bob', systemLanguage: 'fr' },
    token: 'jeton-de-bob',
    sessionToken: 'session-de-bob',
    expiresIn: 3600,
  });

const adaProfile = (): MyProfile => ({
  id: 'u-ada',
  username: 'ada',
  displayName: 'Ada L.',
  firstName: 'Ada',
  lastName: 'Lovelace',
  bio: '',
  avatar: null,
  banner: null,
  systemLanguage: 'fr',
  regionalLanguage: null,
  customDestinationLanguage: null,
  email: { masked: 'a•••@meeshy.example', verified: true },
  phone: null,
  createdAt: '2025-03-14T09:00:00.000Z',
});

const ADA_WIRE = { id: 'u-ada', username: 'ada', email: 'ada@meeshy.example', firstName: 'Ada', lastName: 'Lovelace', displayName: 'Ada Lovelace', bio: '', avatar: null, banner: null, systemLanguage: 'fr', regionalLanguage: null, customDestinationLanguage: null, createdAt: '2025-03-14T09:00:00.000Z' };
const UPLOADED = { success: true, data: { attachments: [{ id: 'a1', fileUrl: 'https://static.test/a1.webp', mimeType: 'image/webp', fileSize: 16 }] } };

type Seen = { readonly url: string; readonly method: string; readonly authorization: string | null };

/** Une passerelle dont chaque réponse attend qu'on la libère. */
const heldGateway = (session: SessionStoreApi) => {
  const seen: Seen[] = [];
  const waiting: Array<() => void> = [];
  const arrivals: Array<() => void> = [];
  const fetchImpl = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
    new Promise((resolve) => {
      const headers = new Headers(init?.headers);
      seen.push({ url: String(input), method: init?.method ?? 'GET', authorization: headers.get('Authorization') });
      const body = String(input).endsWith('/attachments/upload') ? UPLOADED : { success: true, data: { user: ADA_WIRE } };
      waiting.push(() => resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })));
      arrivals.shift()?.();
    });
  return {
    seen,
    transport: createHttpTransport({
      base: 'https://gate.test',
      fetchImpl: fetchImpl as typeof fetch,
      timeoutMs: 0,
      credential: () => {
        const held = session.getState().session;
        return held.status === 'authenticated' ? { kind: 'registered', token: held.token } : null;
      },
      identity: () => sessionIdentityKey(session.getState().session),
    }),
    arrival: (count: number): Promise<void> =>
      new Promise((wake) => {
        const check = (): void => (seen.length >= count ? wake() : void arrivals.push(check));
        check();
      }),
    releaseAll: () => waiting.splice(0).forEach((release) => release()),
  };
};

const depsOf = (session: SessionStoreApi, queryClient: QueryClient, transport: ProfileActionDeps['transport']): ProfileActionDeps => ({
  source: 'gateway',
  transport,
  session,
  queryClient,
  accounts: createAccountVault({ storage: memoryStorage(), now: () => NOW }),
  isOnline: () => true,
});

const displayNameOf = (session: SessionStoreApi): string | null | undefined => {
  const state = session.getState().session;
  return state.status === 'authenticated' ? state.user.displayName : undefined;
};

const bobSnapshotFromAnotherDevice = (queryClient: QueryClient): void =>
  takeProfileSnapshot(queryClient, {
    userId: 'u-bob',
    updatedAt: '2026-11-18T09:05:00.000Z',
    profile: {
      systemLanguage: 'fr',
      regionalLanguage: null,
      customDestinationLanguage: null,
      displayName: 'Bob B.',
      firstName: 'Bob',
      lastName: 'B',
      username: 'bob',
      avatar: null,
      banner: null,
    },
  });

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('un geste du profil appartient au compte qui l’a lancé', () => {
  test('l’édition d’Ada est en vol quand l’onglet passe à Bob : le profil servi à Bob lui parvient', async () => {
    const session = adaSignedIn();
    const queryClient = new QueryClient();
    queryClient.setQueryData(MY_PROFILE_QUERY_KEY, adaProfile());
    const gateway = heldGateway(session);
    const unfollow = followServedProfile({ queryClient, session, accounts: createAccountVault({ storage: memoryStorage(), now: () => NOW }) });

    void performProfileEdit({ patch: { displayName: 'Ada Lovelace' }, deps: depsOf(session, queryClient, gateway.transport) });
    await gateway.arrival(1);
    switchToBob(session);
    gateway.releaseAll();
    await flush();
    bobSnapshotFromAnotherDevice(queryClient);

    unfollow();
    expect(displayNameOf(session)).toBe('Bob B.');
  });

  test('la photo d’Ada est en vol quand l’onglet passe à Bob : le profil servi à Bob lui parvient', async () => {
    const session = adaSignedIn();
    const queryClient = new QueryClient();
    queryClient.setQueryData(MY_PROFILE_QUERY_KEY, adaProfile());
    const gateway = heldGateway(session);
    const unfollow = followServedProfile({ queryClient, session, accounts: createAccountVault({ storage: memoryStorage(), now: () => NOW }) });

    void performImageUpdate({
      kind: 'avatar',
      file: new Blob([new Uint8Array(16)], { type: 'image/webp' }),
      deps: { ...depsOf(session, queryClient, gateway.transport), recompress: async (file) => file },
    });
    await gateway.arrival(1);
    gateway.releaseAll();
    await gateway.arrival(2);
    switchToBob(session);
    gateway.releaseAll();
    await flush();
    bobSnapshotFromAnotherDevice(queryClient);

    unfollow();
    expect(gateway.seen.map((request) => request.url)).toEqual(['https://gate.test/api/v1/attachments/upload', 'https://gate.test/api/v1/users/me/avatar']);
    expect(displayNameOf(session)).toBe('Bob B.');
  });

  test('l’onglet passe à Bob pendant que l’édition d’Ada annule les lectures : rien ne part au nom de Bob', async () => {
    const session = adaSignedIn();
    const queryClient = new QueryClient();
    queryClient.setQueryData(MY_PROFILE_QUERY_KEY, adaProfile());
    const gateway = heldGateway(session);
    const cancelQueries = queryClient.cancelQueries.bind(queryClient);
    queryClient.cancelQueries = async (...args: Parameters<QueryClient['cancelQueries']>) => {
      switchToBob(session);
      return cancelQueries(...args);
    };

    const shownToBob: Array<string | null | undefined> = [];
    session.subscribe(() => shownToBob.push(displayNameOf(session)));

    const outcome = await Promise.race([
      performProfileEdit({ patch: { displayName: 'Ada Lovelace' }, deps: depsOf(session, queryClient, gateway.transport) }),
      gateway.arrival(1).then(() => ({ status: 'émise sous Bob' as const })),
    ]);

    expect(gateway.seen.map((request) => request.authorization)).toEqual([]);
    expect(outcome.status).not.toBe('saved');
    expect(displayNameOf(session)).toBe('Bob');
    expect(shownToBob).not.toContain('Ada Lovelace');
  });
});
