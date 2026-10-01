import { describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';

import { resolveReaderLanguages } from '../reader';
import { participantAvatarOf } from '../view/conversation';
import { createAccountVault, type AccountVault } from './accounts';
import { CONVERSATIONS_QUERY_KEY } from './conversations';
import { createHttpTransport } from './http';
import { MY_PROFILE_QUERY_KEY, type MyProfile } from './profile';
import { performImageUpdate, performProfileEdit, type ProfileActionDeps } from './profile-actions';
import { publicProfileQueryKey, type PublicProfileView } from './public-profile';
import { served } from './prism';
import { createSessionStore, type SessionStorage, type SessionUser } from './session';

/**
 * LES GESTES DU PROFIL, OPTIMISTES (#6289) — instantané, application locale,
 * réseau, retour arrière. Le profil vit à DEUX endroits que ces gestes
 * écrivent ensemble : le cache de requêtes (ce que l'écran peint) et le magasin
 * de session (ce que le Prisme de TOUT le produit lit). Les témoins de langue
 * descendent le Prisme sur un rang AUTRE que le premier (leçon 261).
 */

const NOW = Date.UTC(2026, 8, 13, 12, 0, 0);

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

const signedIn = (params: { readonly storage?: SessionStorage; readonly user?: Partial<SessionUser> } = {}) => {
  const store = createSessionStore({ storage: params.storage ?? memoryStorage(), now: () => NOW });
  store.getState().establish({
    user: { id: 'u-ada', username: 'ada', displayName: 'Ada L.', systemLanguage: 'fr', regionalLanguage: 'de', ...params.user },
    token: 'jeton-de-test',
    sessionToken: 'session-de-test',
    expiresIn: 3600,
  });
  return store;
};

const profileOf = (overrides: Partial<MyProfile> = {}): MyProfile => ({
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
  email: { masked: 'a•••@meeshy.example', verified: true },
  phone: null,
  createdAt: '2025-03-14T09:00:00.000Z',
  ...overrides,
});

const wireUser = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  id: 'u-ada',
  username: 'ada',
  email: 'ada@meeshy.example',
  firstName: 'Ada',
  lastName: 'Lovelace',
  displayName: 'Ada L.',
  bio: '',
  avatar: null,
  banner: null,
  systemLanguage: 'fr',
  regionalLanguage: 'de',
  customDestinationLanguage: null,
  emailVerifiedAt: '2026-01-02T00:00:00.000Z',
  createdAt: '2025-03-14T09:00:00.000Z',
  ...overrides,
});

/** Ma fiche publique telle que `/u/ada` l'a mise en cache (#8881). */
const myPublicView = (): PublicProfileView => ({
  profile: {
    id: 'u-ada',
    username: 'ada',
    displayName: 'Ada L.',
    avatar: '2026/08/u-ada/ancien.webp',
    banner: '2026/08/u-ada/ancienne.webp',
    bio: null,
    createdAt: null,
  },
  stats: null,
  relation: 'self',
  isSelf: true,
  blockedByViewer: false,
  relationRequestId: null,
  presence: null,
});

type Reply = { readonly status: number; readonly body: unknown };
type Seen = { readonly url: string; readonly method: string; readonly body: unknown };

/** Une passerelle dont chaque réponse attend qu'on la LIBÈRE — ce qui permet
 * de regarder l'écran ENTRE le geste et la réponse. */
const heldGateway = () => {
  const seen: Seen[] = [];
  const waiting: Array<(reply: Reply) => void> = [];
  const watchers: Array<{ readonly index: number; readonly wake: () => void }> = [];
  const awaited = { count: 0 };
  const wakeArrived = () => {
    watchers.filter((watcher) => watcher.index < seen.length).forEach((watcher) => watcher.wake());
    watchers.splice(0, watchers.length, ...watchers.filter((watcher) => watcher.index >= seen.length));
  };
  const fetchImpl = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
    new Promise((resolve, reject) => {
      const rawBody = init?.body;
      seen.push({ url: String(input), method: init?.method ?? 'GET', body: typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody });
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      waiting.push((reply) =>
        resolve(new Response(JSON.stringify(reply.body), { status: reply.status, headers: { 'content-type': 'application/json' } })),
      );
      wakeArrived();
    });
  return {
    seen,
    transport: createHttpTransport({ base: 'https://gate.test', fetchImpl: fetchImpl as typeof fetch, timeoutMs: 0 }),
    arrival: (): Promise<void> => {
      const index = awaited.count;
      awaited.count += 1;
      return index < seen.length ? Promise.resolve() : new Promise((wake) => watchers.push({ index, wake }));
    },
    release: (reply: Reply) => waiting.shift()?.(reply),
  };
};

const depsOf = (params: {
  readonly transport: ProfileActionDeps['transport'];
  readonly session: ProfileActionDeps['session'];
  readonly queryClient?: QueryClient;
  readonly online?: boolean;
  readonly accounts?: AccountVault;
}): ProfileActionDeps => ({
  source: 'gateway',
  transport: params.transport,
  session: params.session,
  queryClient: params.queryClient ?? new QueryClient(),
  accounts: params.accounts ?? createAccountVault({ storage: memoryStorage(), now: () => NOW }),
  isOnline: () => params.online ?? true,
});

const sessionUser = (store: ReturnType<typeof signedIn>) => {
  const state = store.getState().session;
  return state.status === 'authenticated' ? state.user : undefined;
};

const readerOf = (store: ReturnType<typeof signedIn>) =>
  resolveReaderLanguages({ source: 'gateway', session: { status: 'authenticated', user: { ...sessionUser(store) } } });

describe('modifier son nom — optimiste, puis confirmé ou défait', () => {
  test('le nom change AVANT la réponse, et revient sur un refus 4xx', async () => {
    const gateway = heldGateway();
    const session = signedIn();
    const queryClient = new QueryClient();
    queryClient.setQueryData(MY_PROFILE_QUERY_KEY, profileOf());

    const outcome = performProfileEdit({
      patch: { displayName: 'Ada Lovelace' },
      deps: depsOf({ transport: gateway.transport, session, queryClient }),
    });
    await gateway.arrival();

    expect(sessionUser(session)?.displayName).toBe('Ada Lovelace');
    expect(queryClient.getQueryData<MyProfile>(MY_PROFILE_QUERY_KEY)?.displayName).toBe('Ada Lovelace');

    gateway.release({ status: 400, body: { success: false, error: 'Invalid data' } });

    expect(await outcome).toEqual({ status: 'refused', error: 'Invalid data' });
    expect(sessionUser(session)?.displayName).toBe('Ada L.');
    expect(queryClient.getQueryData<MyProfile>(MY_PROFILE_QUERY_KEY)?.displayName).toBe('Ada L.');
  });

  test('confirmé, la forme SERVIE remplace la forme tapée — et la session s’en souvient au rechargement', async () => {
    const gateway = heldGateway();
    const storage = memoryStorage();
    const session = signedIn({ storage });
    const queryClient = new QueryClient();

    const outcome = performProfileEdit({
      patch: { displayName: 'ada lovelace' },
      deps: depsOf({ transport: gateway.transport, session, queryClient }),
    });
    await gateway.arrival();
    gateway.release({ status: 200, body: { success: true, data: { user: wireUser({ displayName: 'Ada Lovelace' }) } } });

    expect(await outcome).toEqual({ status: 'saved' });
    expect(gateway.seen).toEqual([{ url: 'https://gate.test/api/v1/users/me', method: 'PATCH', body: { displayName: 'ada lovelace' } }]);
    expect(queryClient.getQueryData<MyProfile>(MY_PROFILE_QUERY_KEY)?.displayName).toBe('Ada Lovelace');

    const reloaded = createSessionStore({ storage, now: () => NOW });
    reloaded.getState().restoreSession();
    const restored = reloaded.getState().session;
    expect(restored.status === 'authenticated' ? restored.user.displayName : undefined).toBe('Ada Lovelace');
  });

  test('confirmé, ma fiche PUBLIQUE en cache porte le nom et la bio servis', async () => {
    const gateway = heldGateway();
    const queryClient = new QueryClient();
    queryClient.setQueryData(publicProfileQueryKey('ada'), myPublicView());

    const outcome = performProfileEdit({
      patch: { displayName: 'Ada Lovelace', bio: 'Pionnière' },
      deps: depsOf({ transport: gateway.transport, session: signedIn(), queryClient }),
    });
    await gateway.arrival();
    gateway.release({
      status: 200,
      body: { success: true, data: { user: wireUser({ displayName: 'Ada Lovelace', bio: 'Pionnière', avatar: '2026/08/u-ada/ancien.webp' }) } },
    });

    expect(await outcome).toEqual({ status: 'saved' });
    const cached = queryClient.getQueryData<PublicProfileView>(publicProfileQueryKey('ada'))?.profile;
    expect(cached?.displayName).toBe('Ada Lovelace');
    expect(cached?.bio).toBe('Pionnière');
    expect(cached?.avatar).toBe('2026/08/u-ada/ancien.webp');
  });

  test('HORS LIGNE, l’édition est refusée sans toucher à rien ni appeler personne', async () => {
    const gateway = heldGateway();
    const session = signedIn();
    const queryClient = new QueryClient();
    queryClient.setQueryData(MY_PROFILE_QUERY_KEY, profileOf());

    const outcome = await performProfileEdit({
      patch: { bio: 'Pionnière' },
      deps: depsOf({ transport: gateway.transport, session, queryClient, online: false }),
    });

    expect(outcome).toEqual({ status: 'offline' });
    expect(gateway.seen).toHaveLength(0);
    expect(queryClient.getQueryData<MyProfile>(MY_PROFILE_QUERY_KEY)?.bio).toBe('');
  });

  test('un champ invalide est nommé, et rien n’est appliqué', async () => {
    const gateway = heldGateway();
    const session = signedIn();
    const queryClient = new QueryClient();
    queryClient.setQueryData(MY_PROFILE_QUERY_KEY, profileOf());

    const outcome = await performProfileEdit({
      patch: { bio: 'x'.repeat(501) },
      deps: depsOf({ transport: gateway.transport, session, queryClient }),
    });

    expect(outcome).toEqual({ status: 'invalid', field: 'bio' });
    expect(gateway.seen).toHaveLength(0);
    expect(queryClient.getQueryData<MyProfile>(MY_PROFILE_QUERY_KEY)?.bio).toBe('');
  });

  test('sans session (source de recette), le cache suit quand même', async () => {
    const gateway = heldGateway();
    const session = createSessionStore({ storage: memoryStorage(), now: () => NOW });
    const queryClient = new QueryClient();
    queryClient.setQueryData(MY_PROFILE_QUERY_KEY, profileOf());

    const outcome = performProfileEdit({ patch: { bio: 'Pionnière' }, deps: depsOf({ transport: gateway.transport, session, queryClient }) });
    await gateway.arrival();
    expect(queryClient.getQueryData<MyProfile>(MY_PROFILE_QUERY_KEY)?.bio).toBe('Pionnière');
    gateway.release({ status: 200, body: { success: true, data: { user: wireUser({ bio: 'Pionnière' }) } } });
    expect(await outcome).toEqual({ status: 'saved' });
  });
});

describe('changer une langue du Prisme — TOUT le produit la lit, sans rechargement', () => {
  const preview = { originalLanguage: 'es', original: 'Hola', translations: { en: 'Hello', de: 'Hallo' } };
  const servedTo = (languages: readonly string[]) =>
    served({ preferredLanguages: languages, originalLanguage: preview.originalLanguage, translations: preview.translations, original: preview.original });

  test('langue principale fr → en : le lecteur rend [en, de], et l’aperçu quitte l’allemand (rang 2) pour l’anglais', async () => {
    const gateway = heldGateway();
    const session = signedIn();

    expect(readerOf(session)).toEqual(['fr', 'de']);
    expect(servedTo(readerOf(session))).toEqual({ text: 'Hallo', language: 'de', translated: true });

    const outcome = performProfileEdit({ patch: { systemLanguage: 'en' }, deps: depsOf({ transport: gateway.transport, session }) });
    await gateway.arrival();

    expect(readerOf(session)).toEqual(['en', 'de']);
    expect(servedTo(readerOf(session))).toEqual({ text: 'Hello', language: 'en', translated: true });

    gateway.release({ status: 200, body: { success: true, data: { user: wireUser({ systemLanguage: 'en' }) } } });
    expect(await outcome).toEqual({ status: 'saved' });
    expect(readerOf(session)).toEqual(['en', 'de']);
  });

  test('langue régionale de → en sous une principale SANS traduction : l’anglais est servi au rang 2', async () => {
    const gateway = heldGateway();
    const session = signedIn({ user: { systemLanguage: 'pt', regionalLanguage: 'de' } });

    const outcome = performProfileEdit({ patch: { regionalLanguage: 'en' }, deps: depsOf({ transport: gateway.transport, session }) });
    await gateway.arrival();

    expect(readerOf(session)).toEqual(['pt', 'en']);
    expect(servedTo(readerOf(session))).toEqual({ text: 'Hello', language: 'en', translated: true });

    gateway.release({ status: 200, body: { success: true, data: { user: wireUser({ systemLanguage: 'pt', regionalLanguage: 'en' }) } } });
    await outcome;
  });

  test('retirer la langue régionale la RETIRE du Prisme', async () => {
    const gateway = heldGateway();
    const session = signedIn();

    const outcome = performProfileEdit({ patch: { regionalLanguage: '' }, deps: depsOf({ transport: gateway.transport, session }) });
    await gateway.arrival();

    expect(readerOf(session)).toEqual(['fr']);
    expect(gateway.seen[0]?.body).toEqual({ regionalLanguage: '' });

    gateway.release({ status: 200, body: { success: true, data: { user: wireUser({ regionalLanguage: null }) } } });
    await outcome;
    expect(readerOf(session)).toEqual(['fr']);
  });

  test('la liste des conversations est RELUE après une langue confirmée — la passerelle ne sert que les traductions du Prisme qu’elle connaît', async () => {
    const gateway = heldGateway();
    const session = signedIn();
    const queryClient = new QueryClient();
    queryClient.setQueryData(CONVERSATIONS_QUERY_KEY, { pages: [], pageParams: [] });

    const outcome = performProfileEdit({ patch: { systemLanguage: 'en' }, deps: depsOf({ transport: gateway.transport, session, queryClient }) });
    await gateway.arrival();
    expect(queryClient.getQueryState(CONVERSATIONS_QUERY_KEY)?.isInvalidated).toBe(false);
    gateway.release({ status: 200, body: { success: true, data: { user: wireUser({ systemLanguage: 'en' }) } } });
    await outcome;

    expect(queryClient.getQueryState(CONVERSATIONS_QUERY_KEY)?.isInvalidated).toBe(true);
  });

  test('un nom seul ne relit PAS la liste, et une langue REFUSÉE non plus — le Prisme revient', async () => {
    const nameGateway = heldGateway();
    const nameClient = new QueryClient();
    nameClient.setQueryData(CONVERSATIONS_QUERY_KEY, { pages: [], pageParams: [] });
    const renamed = performProfileEdit({
      patch: { displayName: 'Ada' },
      deps: depsOf({ transport: nameGateway.transport, session: signedIn(), queryClient: nameClient }),
    });
    await nameGateway.arrival();
    nameGateway.release({ status: 200, body: { success: true, data: { user: wireUser({ displayName: 'Ada' }) } } });
    await renamed;
    expect(nameClient.getQueryState(CONVERSATIONS_QUERY_KEY)?.isInvalidated).toBe(false);

    const refusedGateway = heldGateway();
    const refusedClient = new QueryClient();
    refusedClient.setQueryData(CONVERSATIONS_QUERY_KEY, { pages: [], pageParams: [] });
    const session = signedIn();
    const refused = performProfileEdit({
      patch: { systemLanguage: 'en' },
      deps: depsOf({ transport: refusedGateway.transport, session, queryClient: refusedClient }),
    });
    await refusedGateway.arrival();
    refusedGateway.release({ status: 500, body: { success: false, error: 'Internal server error' } });
    await refused;
    expect(refusedClient.getQueryState(CONVERSATIONS_QUERY_KEY)?.isInvalidated).toBe(false);
    expect(readerOf(session)).toEqual(['fr', 'de']);
  });
});

describe('changer sa photo — recompressée avant de partir', () => {
  const heavyPhoto = () => new File([new Uint8Array(5_000_000)], 'IMG_0042.jpg', { type: 'image/jpeg' });
  const recompressed = new Blob([new Uint8Array(48_000)], { type: 'image/webp' });

  const uploaded = (url: string): Reply => ({
    status: 200,
    body: { success: true, data: { attachments: [{ id: 'a1', fileUrl: url, mimeType: 'image/webp', fileSize: 48_000 }] } },
  });

  test('les octets MONTÉS sont ceux de l’image recompressée, puis l’avatar est posé par sa route', async () => {
    const gateway = heldGateway();
    const session = signedIn();
    const queryClient = new QueryClient();
    queryClient.setQueryData(MY_PROFILE_QUERY_KEY, profileOf());
    const kinds: string[] = [];

    const outcome = performImageUpdate({
      kind: 'avatar',
      file: heavyPhoto(),
      deps: {
        ...depsOf({ transport: gateway.transport, session, queryClient }),
        recompress: async (_file, kind) => {
          kinds.push(kind);
          return recompressed;
        },
      },
    });

    await gateway.arrival();
    const form = gateway.seen[0]?.body;
    expect(gateway.seen[0]?.url).toBe('https://gate.test/api/v1/attachments/upload');
    expect(form instanceof FormData ? (form.get('files') as File | null)?.size : undefined).toBe(48_000);
    gateway.release(uploaded('https://static.test/a1.webp'));

    await gateway.arrival();
    expect(gateway.seen[1]).toEqual({
      url: 'https://gate.test/api/v1/users/me/avatar',
      method: 'PATCH',
      body: { avatar: 'https://static.test/a1.webp' },
    });
    gateway.release({ status: 200, body: { success: true, data: { user: wireUser({ avatar: 'https://static.test/a1.webp' }) } } });

    expect(await outcome).toEqual({ status: 'saved', url: 'https://static.test/a1.webp', bytesSent: 48_000 });
    expect(kinds).toEqual(['avatar']);
    expect(sessionUser(session)?.avatar).toBe('https://static.test/a1.webp');
    expect(queryClient.getQueryData<MyProfile>(MY_PROFILE_QUERY_KEY)?.avatar).toBe('https://static.test/a1.webp');
  });

  /**
   * #8881 — CE QUE LA PASSERELLE REND VRAIMENT. `POST /attachments/upload`
   * sert la CLÉ de stockage relative (`UploadProcessor.getAttachmentPath` est
   * l'identité sur le chemin disque), jamais une adresse `https://`. Le témoin
   * ci-dessus nourrit une adresse absolue que la passerelle ne sert plus : il
   * restait vert pendant que chaque photo du web était refusée AVANT de
   * partir, par une règle locale plus étroite que celle du serveur.
   */
  test('la CLÉ de stockage rendue par le téléversement est posée, et le profil comme la session la montrent', async () => {
    const key = '2026/09/u-ada/avatar_1727690000.webp';
    const gateway = heldGateway();
    const session = signedIn({ user: { avatar: '2026/08/u-ada/ancien.webp' } });
    const queryClient = new QueryClient();
    queryClient.setQueryData(MY_PROFILE_QUERY_KEY, profileOf({ avatar: '2026/08/u-ada/ancien.webp' }));
    const outcome = performImageUpdate({
      kind: 'avatar',
      file: heavyPhoto(),
      deps: { ...depsOf({ transport: gateway.transport, session, queryClient }), recompress: async () => recompressed },
    });
    await gateway.arrival();
    gateway.release(uploaded(key));
    await gateway.arrival();
    expect(gateway.seen[1]).toEqual({ url: 'https://gate.test/api/v1/users/me/avatar', method: 'PATCH', body: { avatar: key } });
    gateway.release({ status: 200, body: { success: true, data: { user: wireUser({ avatar: key }) } } });

    expect(await outcome).toEqual({ status: 'saved', url: key, bytesSent: 48_000 });
    expect(queryClient.getQueryData<MyProfile>(MY_PROFILE_QUERY_KEY)?.avatar).toBe(key);
    expect(sessionUser(session)?.avatar).toBe(key);
  });

  /**
   * #8886 — AILLEURS QUE SUR LE PROFIL. Ma photo est recopiée dans chaque
   * charge qui me montre (participants, expéditeurs…) et dans la liste des
   * comptes de l'appareil ; la confirmation les fait toutes suivre, et un
   * refus n'en touche aucune.
   */
  test('confirmée, la nouvelle photo me montre aussi dans mes conversations en cache et dans la liste des comptes', async () => {
    const key = '2026/09/u-ada/avatar_3.webp';
    const gateway = heldGateway();
    const session = signedIn({ user: { avatar: '2026/08/u-ada/ancien.webp' } });
    const accounts = createAccountVault({ storage: memoryStorage(), now: () => NOW });
    const held = sessionUser(session);
    if (held !== undefined) accounts.noteActive(held);
    const queryClient = new QueryClient();
    const me = { id: 'p-ada', userId: 'u-ada', avatar: '2026/08/u-ada/ancien.webp', user: { id: 'u-ada', avatar: '2026/08/u-ada/ancien.webp' } };
    queryClient.setQueryData(CONVERSATIONS_QUERY_KEY, { pages: [{ conversations: [{ id: 'c-1', participants: [me] }] }], pageParams: [null] });

    const outcome = performImageUpdate({
      kind: 'avatar',
      file: heavyPhoto(),
      deps: { ...depsOf({ transport: gateway.transport, session, queryClient, accounts }), recompress: async () => recompressed },
    });
    await gateway.arrival();
    gateway.release(uploaded(key));
    await gateway.arrival();
    gateway.release({ status: 200, body: { success: true, data: { user: wireUser({ avatar: key }) } } });
    expect((await outcome).status).toBe('saved');

    const cached = queryClient.getQueryData<{ pages: { conversations: { participants: (typeof me)[] }[] }[] }>(CONVERSATIONS_QUERY_KEY);
    expect(participantAvatarOf(cached?.pages[0]?.conversations[0]?.participants[0])).toBe(key);
    expect(accounts.list()[0]?.user.avatar).toBe(key);
  });

  test('refusée, aucune copie de ma photo ne bouge', async () => {
    const gateway = heldGateway();
    const session = signedIn({ user: { avatar: '2026/08/u-ada/ancien.webp' } });
    const queryClient = new QueryClient();
    const conversations = { pages: [{ conversations: [{ id: 'c-1', participants: [{ id: 'p-ada', userId: 'u-ada', avatar: '2026/08/u-ada/ancien.webp' }] }] }] };
    queryClient.setQueryData(CONVERSATIONS_QUERY_KEY, conversations);
    const outcome = performImageUpdate({
      kind: 'avatar',
      file: heavyPhoto(),
      deps: { ...depsOf({ transport: gateway.transport, session, queryClient }), recompress: async () => recompressed },
    });
    await gateway.arrival();
    gateway.release(uploaded('2026/09/u-ada/avatar_4.webp'));
    await gateway.arrival();
    gateway.release({ status: 400, body: { success: false, error: 'Invalid image format' } });

    expect((await outcome).status).toBe('refused');
    expect(queryClient.getQueryData(CONVERSATIONS_QUERY_KEY)).toBe(conversations);
    expect(sessionUser(session)?.avatar).toBe('2026/08/u-ada/ancien.webp');
  });

  test('la bannière posée par sa clé de stockage remplace l’ancienne dans le profil', async () => {
    const key = '2026/09/u-ada/banner_1727690000.webp';
    const gateway = heldGateway();
    const queryClient = new QueryClient();
    queryClient.setQueryData(MY_PROFILE_QUERY_KEY, profileOf({ banner: '2026/08/u-ada/ancienne.webp' }));
    const outcome = performImageUpdate({
      kind: 'banner',
      file: heavyPhoto(),
      deps: { ...depsOf({ transport: gateway.transport, session: signedIn(), queryClient }), recompress: async () => recompressed },
    });
    await gateway.arrival();
    gateway.release(uploaded(key));
    await gateway.arrival();
    expect(gateway.seen[1]?.body).toEqual({ banner: key });
    gateway.release({ status: 200, body: { success: true, data: { user: wireUser({ banner: key }) } } });

    expect((await outcome).status).toBe('saved');
    expect(queryClient.getQueryData<MyProfile>(MY_PROFILE_QUERY_KEY)?.banner).toBe(key);
  });

  test('ma fiche PUBLIQUE en cache (`/u/ada`) montre aussitôt la photo et la bannière servies', async () => {
    const gateway = heldGateway();
    const queryClient = new QueryClient();
    queryClient.setQueryData(publicProfileQueryKey('ada'), myPublicView());
    const outcome = performImageUpdate({
      kind: 'banner',
      file: heavyPhoto(),
      deps: { ...depsOf({ transport: gateway.transport, session: signedIn(), queryClient }), recompress: async () => recompressed },
    });
    await gateway.arrival();
    gateway.release(uploaded('https://static.test/banner_2.webp'));
    await gateway.arrival();
    gateway.release({
      status: 200,
      body: { success: true, data: { user: wireUser({ avatar: '2026/08/u-ada/ancien.webp', banner: 'https://static.test/banner_2.webp' }) } },
    });

    expect((await outcome).status).toBe('saved');
    const cached = queryClient.getQueryData<PublicProfileView>(publicProfileQueryKey('ada'));
    expect(cached?.profile.banner).toBe('https://static.test/banner_2.webp');
    expect(cached?.profile.avatar).toBe('2026/08/u-ada/ancien.webp');
    expect(cached?.relation).toBe('self');
  });

  test('la bannière a SA route', async () => {
    const gateway = heldGateway();
    const outcome = performImageUpdate({
      kind: 'banner',
      file: heavyPhoto(),
      deps: { ...depsOf({ transport: gateway.transport, session: signedIn() }), recompress: async () => recompressed },
    });
    await gateway.arrival();
    gateway.release(uploaded('https://static.test/b1.webp'));
    await gateway.arrival();
    expect(gateway.seen[1]?.url).toBe('https://gate.test/api/v1/users/me/banner');
    gateway.release({ status: 200, body: { success: true, data: { user: wireUser({ banner: 'https://static.test/b1.webp' }) } } });
    expect((await outcome).status).toBe('saved');
  });

  test('un envoi refusé ne pose rien : aucune seconde requête, l’avatar reste', async () => {
    const gateway = heldGateway();
    const session = signedIn({ user: { avatar: 'https://static.test/ancien.webp' } });
    const outcome = performImageUpdate({
      kind: 'avatar',
      file: heavyPhoto(),
      deps: { ...depsOf({ transport: gateway.transport, session }), recompress: async () => recompressed },
    });
    await gateway.arrival();
    gateway.release({ status: 413, body: { success: false, error: 'File too large' } });

    expect(await outcome).toEqual({ status: 'refused', error: 'File too large' });
    expect(gateway.seen).toHaveLength(1);
    expect(sessionUser(session)?.avatar).toBe('https://static.test/ancien.webp');
  });

  test('ANNULÉ en vol, l’envoi s’arrête et le dit', async () => {
    const gateway = heldGateway();
    const controller = new AbortController();
    const outcome = performImageUpdate({
      kind: 'avatar',
      file: heavyPhoto(),
      signal: controller.signal,
      deps: { ...depsOf({ transport: gateway.transport, session: signedIn() }), recompress: async () => recompressed },
    });
    await gateway.arrival();
    controller.abort();

    expect(await outcome).toEqual({ status: 'cancelled' });
    expect(gateway.seen).toHaveLength(1);
  });

  test('hors ligne, rien n’est recompressé ni envoyé', async () => {
    const gateway = heldGateway();
    const recompressions: string[] = [];
    const outcome = await performImageUpdate({
      kind: 'avatar',
      file: heavyPhoto(),
      deps: {
        ...depsOf({ transport: gateway.transport, session: signedIn(), online: false }),
        recompress: async (_file, kind) => {
          recompressions.push(kind);
          return recompressed;
        },
      },
    });
    expect(outcome).toEqual({ status: 'offline' });
    expect(recompressions).toHaveLength(0);
    expect(gateway.seen).toHaveLength(0);
  });

  test('une image illisible est refusée avant tout envoi', async () => {
    const gateway = heldGateway();
    const outcome = await performImageUpdate({
      kind: 'avatar',
      file: heavyPhoto(),
      deps: {
        ...depsOf({ transport: gateway.transport, session: signedIn() }),
        recompress: async () => {
          throw new Error('image illisible');
        },
      },
    });
    expect(outcome).toEqual({ status: 'unreadable' });
    expect(gateway.seen).toHaveLength(0);
  });
});
