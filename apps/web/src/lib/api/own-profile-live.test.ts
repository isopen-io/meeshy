import { readFileSync } from 'node:fs';

import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import type { SocketClient } from '../net/socket';
import { resolveReaderLanguages } from '../reader';
import { createAccountVault, type AccountVault } from './accounts';
import { CONVERSATIONS_QUERY_KEY } from './conversations';
import { bindOwnProfileLive } from './own-profile-live';
import { bindOwnProfileLiveLazily } from './own-profile-live-binding';
import { MY_PROFILE_QUERY_KEY, type MyProfile } from './profile';
import { followServedProfile, holdProfileEdit, noteProfileTaken } from './served-profile-session';
import { createSessionStore, type SessionStorage, type SessionStoreApi, type SessionUser } from './session';

/**
 * **MON PROFIL SE SYNCHRONISE ENTRE MES APPAREILS** (#18924) — la passerelle
 * pousse `profile:updated` sur `user:<moi>` après chaque écriture de ma
 * langue, de mon nom, de ma photo, de ma bannière ou de mon pseudo, avec
 * l'INSTANTANÉ de ces neuf champs et la date de l'écriture. Le web l'applique à
 * la session (le Prisme de tout le produit) et au cache `['me', 'profile']`,
 * sans relire `GET /me`, sous les gardes de la projection de `GET /me`
 * (`served-profile-session.ts`) : même compte, aucune édition en vol, jamais
 * plus ancien que ce qui est tenu. Les témoins de langue descendent le Prisme
 * sur un rang AUTRE que le premier (leçon 261).
 */

const NOW = Date.UTC(2026, 10, 17, 9, 0, 0);
const T0 = '2026-11-17T09:00:00.000Z';
const T1 = '2026-11-17T09:05:00.000Z';
const T2 = '2026-11-17T09:10:00.000Z';

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

const heldProfile = (overrides: Partial<MyProfile> = {}): MyProfile => ({
  id: 'u-ada',
  username: 'ada',
  displayName: 'Ada L.',
  firstName: 'Ada',
  lastName: 'Lovelace',
  bio: 'Première programmeuse',
  avatar: null,
  banner: null,
  systemLanguage: 'fr',
  regionalLanguage: 'de',
  customDestinationLanguage: null,
  email: null,
  phone: null,
  createdAt: '2025-03-14T09:00:00.000Z',
  updatedAt: T0,
  ...overrides,
});

/** La charge telle que la passerelle l'émet (`own-profile-sync.ts`). */
const pushed = (params: { readonly updatedAt?: string; readonly userId?: string; readonly profile?: Readonly<Record<string, unknown>> } = {}) => ({
  userId: params.userId ?? 'u-ada',
  updatedAt: params.updatedAt ?? T1,
  profile: {
    systemLanguage: 'fr',
    regionalLanguage: 'de',
    customDestinationLanguage: null,
    displayName: 'Ada L.',
    firstName: 'Ada',
    lastName: 'Lovelace',
    username: 'ada',
    avatar: null,
    banner: null,
    ...params.profile,
  },
});

const fakeSocket = () => {
  const handlers = new Map<string, (value: unknown) => void>();
  const socket: SocketClient = {
    connected: true,
    connect: () => undefined,
    disconnect: () => undefined,
    emit: () => undefined,
    on: (name, handler) => {
      handlers.set(name, handler as (value: unknown) => void);
    },
    off: (name) => {
      handlers.delete(name);
    },
  };
  const deliver = (payload: unknown): void => handlers.get(SERVER_EVENTS.PROFILE_UPDATED)?.(payload);
  return { handlers, socket, deliver };
};

const vaultKnowing = (user: SessionUser): AccountVault => {
  const vault = createAccountVault({ storage: memoryStorage(), now: () => NOW });
  vault.noteActive(user);
  return vault;
};

/** Le web d'Ada, branché : la projection du profil servi, et l'écoute de `profile:updated`. */
const live = (params: { readonly held?: MyProfile | null } = {}) => {
  const session = signedIn();
  const queryClient = new QueryClient();
  if (params.held !== null) queryClient.setQueryData(MY_PROFILE_QUERY_KEY, params.held ?? heldProfile());
  const accounts = vaultKnowing(ADA);
  const unfollow = followServedProfile({ queryClient, session, accounts });
  const { socket, deliver } = fakeSocket();
  const unbind = bindOwnProfileLive({ socket, queryClient });
  return {
    session,
    queryClient,
    accounts,
    deliver,
    stop: () => {
      unbind();
      unfollow();
    },
  };
};

const sessionUser = (store: SessionStoreApi): SessionUser | undefined => {
  const state = store.getState().session;
  return state.status === 'authenticated' ? state.user : undefined;
};

const readerOf = (store: SessionStoreApi): readonly string[] =>
  resolveReaderLanguages({ source: 'gateway', session: { status: 'authenticated', user: { ...sessionUser(store) } } });

const cached = (queryClient: QueryClient): MyProfile | undefined => queryClient.getQueryData<MyProfile>(MY_PROFILE_QUERY_KEY);

describe('profile:updated applique mon profil changé sur un autre appareil (#18924)', () => {
  test('des langues changées ailleurs deviennent le Prisme du lecteur, rang 2 compris, sans relire GET /me', () => {
    const { session, queryClient, deliver, stop } = live();

    deliver(pushed({ profile: { systemLanguage: 'en', regionalLanguage: 'es' } }));

    expect(readerOf(session).slice(0, 2)).toEqual(['en', 'es']);
    expect(cached(queryClient)).toMatchObject({ systemLanguage: 'en', regionalLanguage: 'es', updatedAt: T1, bio: 'Première programmeuse' });
    expect(queryClient.getQueryState(MY_PROFILE_QUERY_KEY)?.isInvalidated).toBe(false);
    stop();
  });

  test('le nom, le pseudo, la photo et la bannière rejoignent la session, le cache du profil et la ligne du compte', () => {
    const { session, queryClient, accounts, deliver, stop } = live();

    deliver(
      pushed({
        profile: { displayName: 'Ada Lovelace', firstName: 'Augusta', lastName: 'King', username: 'ada.king', avatar: '2026/11/u-ada/a.webp', banner: '2026/11/u-ada/b.webp' },
      }),
    );

    expect(sessionUser(session)).toMatchObject({ displayName: 'Ada Lovelace', username: 'ada.king', avatar: '2026/11/u-ada/a.webp' });
    expect(cached(queryClient)).toMatchObject({ firstName: 'Augusta', lastName: 'King', banner: '2026/11/u-ada/b.webp', username: 'ada.king' });
    expect(accounts.list()[0]?.user.displayName).toBe('Ada Lovelace');
    stop();
  });

  test('un champ EFFACÉ ailleurs (null) s’efface ici aussi', () => {
    const { session, queryClient, deliver, stop } = live({ held: heldProfile({ avatar: '2026/11/u-ada/ancienne.webp', customDestinationLanguage: 'pt' }) });

    deliver(pushed({ profile: { avatar: null, regionalLanguage: null, customDestinationLanguage: null } }));

    expect(sessionUser(session)?.avatar ?? null).toBeNull();
    expect(sessionUser(session)?.regionalLanguage ?? null).toBeNull();
    expect(cached(queryClient)).toMatchObject({ avatar: null, regionalLanguage: null, customDestinationLanguage: null });
    stop();
  });

  test('sans profil en cache, la session prend quand même le Prisme, et aucun profil partiel n’est inventé', () => {
    const { session, queryClient, deliver, stop } = live({ held: null });

    deliver(pushed({ profile: { systemLanguage: 'en', regionalLanguage: 'es' } }));

    expect(readerOf(session).slice(0, 2)).toEqual(['en', 'es']);
    expect(cached(queryClient)).toBeUndefined();
    stop();
  });

  test('un instantané plus ANCIEN que le profil tenu est ignoré', () => {
    const { session, queryClient, deliver, stop } = live({ held: heldProfile({ updatedAt: T2 }) });

    deliver(pushed({ updatedAt: T1, profile: { systemLanguage: 'en', regionalLanguage: 'es' } }));

    expect(readerOf(session).slice(0, 2)).toEqual(['fr', 'de']);
    expect(cached(queryClient)?.systemLanguage).toBe('fr');
    stop();
  });

  test('deux instantanés reçus dans le désordre : le plus récent reste, même sans profil en cache', () => {
    const { session, deliver, stop } = live({ held: null });

    deliver(pushed({ updatedAt: T2, profile: { systemLanguage: 'en', regionalLanguage: 'es' } }));
    deliver(pushed({ updatedAt: T1, profile: { systemLanguage: 'it', regionalLanguage: 'pt' } }));

    expect(readerOf(session).slice(0, 2)).toEqual(['en', 'es']);
    stop();
  });

  test('un instantané d’un AUTRE compte ne touche ni la session ni le cache', () => {
    const { session, queryClient, deliver, stop } = live();

    deliver(pushed({ userId: 'u-bob', profile: { systemLanguage: 'en', regionalLanguage: 'es', username: 'bob' } }));

    expect(readerOf(session).slice(0, 2)).toEqual(['fr', 'de']);
    expect(cached(queryClient)?.username).toBe('ada');
    stop();
  });

  test('les clés d’un serveur plus récent sont tolérées ; une charge mal formée est ignorée', () => {
    const { session, queryClient, deliver, stop } = live();

    deliver({ ...pushed({ profile: { systemLanguage: 'en', regionalLanguage: 'es', pronouns: 'elle' } }), origin: 'ios' });
    expect(readerOf(session).slice(0, 2)).toEqual(['en', 'es']);
    expect(Object.keys(cached(queryClient) ?? {})).not.toContain('pronouns');

    deliver({ userId: 'u-ada', updatedAt: T2, profile: { systemLanguage: '' } });
    deliver({ userId: 'u-ada', updatedAt: 'hier', profile: pushed().profile });
    deliver(null);
    expect(readerOf(session).slice(0, 2)).toEqual(['en', 'es']);
    stop();
  });

  test('un Prisme changé relit la liste des conversations (ses aperçus sont servis dans mes langues) ; un nom seul ne la relit pas', () => {
    const { queryClient, deliver, stop } = live();
    queryClient.setQueryData(CONVERSATIONS_QUERY_KEY, { pages: [], pageParams: [] });

    deliver(pushed({ updatedAt: T1, profile: { displayName: 'Ada Lovelace' } }));
    expect(queryClient.getQueryState(CONVERSATIONS_QUERY_KEY)?.isInvalidated).toBe(false);

    deliver(pushed({ updatedAt: T2, profile: { displayName: 'Ada Lovelace', regionalLanguage: 'es' } }));
    expect(queryClient.getQueryState(CONVERSATIONS_QUERY_KEY)?.isInvalidated).toBe(true);
    stop();
  });
});

describe('profile:updated pendant une édition de profil en vol', () => {
  test('l’instantané est retenu pendant l’édition, puis appliqué si elle échoue', () => {
    const { session, queryClient, deliver, stop } = live();
    const end = holdProfileEdit(queryClient);

    deliver(pushed({ profile: { systemLanguage: 'en', regionalLanguage: 'es' } }));
    expect(readerOf(session).slice(0, 2)).toEqual(['fr', 'de']);

    end();
    expect(readerOf(session).slice(0, 2)).toEqual(['en', 'es']);
    stop();
  });

  test('une édition qui confirme un profil plus ANCIEN que l’instantané retenu ne le perd pas', () => {
    const { session, queryClient, deliver, stop } = live();
    const end = holdProfileEdit(queryClient);

    deliver(pushed({ updatedAt: T2, profile: { systemLanguage: 'en', regionalLanguage: 'es', displayName: 'Ada (écrit ailleurs)' } }));
    const confirmed = heldProfile({ displayName: 'Ada (écrit ici)', updatedAt: T1 });
    noteProfileTaken(queryClient, confirmed);
    queryClient.setQueryData(MY_PROFILE_QUERY_KEY, confirmed);
    end();

    expect(readerOf(session).slice(0, 2)).toEqual(['en', 'es']);
    expect(cached(queryClient)).toMatchObject({ systemLanguage: 'en', displayName: 'Ada (écrit ailleurs)', updatedAt: T2 });
    stop();
  });

  test('une édition qui confirme un profil plus RÉCENT que l’instantané retenu l’emporte', () => {
    const { session, queryClient, deliver, stop } = live();
    const end = holdProfileEdit(queryClient);

    deliver(pushed({ updatedAt: T1, profile: { systemLanguage: 'en', regionalLanguage: 'es' } }));
    const confirmed = heldProfile({ systemLanguage: 'it', regionalLanguage: 'pt', updatedAt: T2 });
    noteProfileTaken(queryClient, confirmed);
    queryClient.setQueryData(MY_PROFILE_QUERY_KEY, confirmed);
    end();

    expect(cached(queryClient)).toMatchObject({ systemLanguage: 'it', regionalLanguage: 'pt', updatedAt: T2 });
    expect(readerOf(session)[0]).not.toBe('en');
    stop();
  });
});

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const until = async (ready: () => boolean) => {
  for (let i = 0; i < 100 && !ready(); i += 1) await settle();
  expect(ready()).toBe(true);
};

describe('l’écoute de profile:updated est branchée avec la connexion', () => {
  test('le chargement paresseux abonne profile:updated, et le disposer le retire', async () => {
    const { socket, handlers } = fakeSocket();

    const off = bindOwnProfileLiveLazily({ socket, queryClient: new QueryClient() });
    await until(() => handlers.has(SERVER_EVENTS.PROFILE_UPDATED));
    off();

    expect(handlers.has(SERVER_EVENTS.PROFILE_UPDATED)).toBe(false);
  });

  test('realtime.ts monte l’écoute sur chaque connexion, avec le client de l’application, et la retire avec elle', () => {
    const realtime = readFileSync(new URL('./realtime.ts', import.meta.url), 'utf8');

    expect(realtime).toContain('bindOwnProfileLiveLazily({ socket: next.socket, queryClient: appQueryClient })');
    expect(realtime).toContain('unprofile();');
  });
});
