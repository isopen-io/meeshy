import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { STARRED_MESSAGES_MAX_LIMIT, type StarredMessageItem } from '@meeshy/shared/types/message-star';

import type { ApiResult, HttpRequest, HttpTransport } from './http';
import {
  STARRED_LIST_QUERY_KEY,
  STARRED_MEMBERSHIP_QUERY_KEY,
  starredStateOf,
  type StarredListData,
  type StarredMembership,
} from './starred-messages-cache';
import {
  STARRED_MEMBERSHIP_PAGE_SIZE,
  loadStarredMembership,
  performStarGesture,
  starredMembershipQueryOptions,
} from './starred-messages';

/**
 * **LE PORT DES FAVORIS DE MESSAGES, CÔTÉ FIL** (#7378) — l'ensemble qui dit
 * si un message affiché est en favori, et le geste qui le change.
 *
 * L'ensemble se lit en parcourant la liste `GET /me/starred-messages` jusqu'au
 * bout (`hasMore`), à la limite MAXIMALE du contrat : c'est la seule source
 * d'état que sert #7377, et une page courte n'est pas une fin de liste
 * (décision serveur, § Conséquences).
 */

const row = (messageId: string, starredAt = '2026-09-21T10:00:00.000Z'): StarredMessageItem => ({
  id: `star-${messageId}`,
  starredAt,
  message: {
    id: messageId,
    conversationId: 'c-1',
    messageType: 'text',
    createdAt: '2026-09-20T10:00:00.000Z',
    editedAt: null,
    isProtected: false,
    content: `texte ${messageId}`,
    originalLanguage: 'fr',
    translations: [],
    attachments: [],
  },
  sender: { id: 'p-1', userId: 'u-1', displayName: 'Amina', avatar: null, username: 'amina' },
  conversation: { id: 'c-1', identifier: 'equipe', type: 'group', name: 'Équipe', avatar: null },
});

/**
 * Ce que le FIL rend — la pagination keyset (`{ limit, hasMore, nextCursor,
 * form }`), que `ApiSuccess.pagination` (typée sur la forme décalage) ne
 * déclare pas : le transport la transmet telle quelle, le port la lit.
 */
type WireReply = ApiResult<unknown> | { readonly ok: true; readonly status: number; readonly data: unknown; readonly pagination: unknown };
type Reply = WireReply | Promise<WireReply> | 'throw';

/** Un transport qui répond dans l'ORDRE des appels et garde chaque requête. */
function sequenceTransport(replies: readonly Reply[]): { readonly transport: HttpTransport; readonly calls: HttpRequest[] } {
  const calls: HttpRequest[] = [];
  const transport = {
    request: async (req: HttpRequest) => {
      const reply = replies[calls.length] ?? { ok: false, status: 404, error: 'non prévu' };
      calls.push(req);
      if (reply === 'throw') throw new Error('réseau coupé');
      return reply;
    },
  } as unknown as HttpTransport;
  return { transport, calls };
}

const page = (ids: readonly string[], next: string | null): WireReply => ({
  ok: true,
  status: 200,
  data: ids.map((id) => row(id)),
  pagination: { limit: STARRED_MEMBERSHIP_PAGE_SIZE, hasMore: next !== null, nextCursor: next, form: 'keyset' },
});

describe('loadStarredMembership — l’ensemble se lit JUSQU’AU BOUT', () => {
  test('la limite est le MAXIMUM du contrat (une seule source : le schéma partagé)', () => {
    expect(STARRED_MEMBERSHIP_PAGE_SIZE).toBe(STARRED_MESSAGES_MAX_LIMIT);
  });

  test('il suit le curseur tant que `hasMore`, même sur une page COURTE, et rend l’ensemble complet', async () => {
    const { transport, calls } = sequenceTransport([page(['m1', 'm2'], 'k2'), page(['m3'], 'k3'), page([], null)]);
    const result = await loadStarredMembership({ source: 'gateway', transport });

    expect(calls.map((c) => c.path)).toEqual([
      `/api/v1/me/starred-messages?limit=${STARRED_MEMBERSHIP_PAGE_SIZE}`,
      `/api/v1/me/starred-messages?limit=${STARRED_MEMBERSHIP_PAGE_SIZE}&cursor=k2`,
      `/api/v1/me/starred-messages?limit=${STARRED_MEMBERSHIP_PAGE_SIZE}&cursor=k3`,
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.data).sort()).toEqual(['m1', 'm2', 'm3']);
  });

  test('une page en panne au MILIEU rend l’échec — jamais un ensemble partiel qui mentirait sur les autres', async () => {
    const { transport } = sequenceTransport([page(['m1'], 'k2'), { ok: false, status: 503, error: 'indisponible' }]);
    const result = await loadStarredMembership({ source: 'gateway', transport });
    expect(result.ok).toBe(false);
  });

  test('un curseur qui se RÉPÈTE arrête le parcours en échec, jamais en boucle', async () => {
    const { transport, calls } = sequenceTransport([page(['m1'], 'k2'), page(['m2'], 'k2'), page(['m3'], null)]);
    const result = await loadStarredMembership({ source: 'gateway', transport });
    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(2);
  });

  test('la requête d’options porte la clé de l’ensemble — celle que le geste et l’écho écrivent', () => {
    expect(starredMembershipQueryOptions({ source: 'gateway', transport: {} as HttpTransport }).queryKey).toBe(
      STARRED_MEMBERSHIP_QUERY_KEY,
    );
  });
});

const MESSAGE = { id: '66f0a1b2c3d4e5f6a7b8c9d0', conversationId: 'c-1' } as const;

function seededClient(membership: StarredMembership | undefined, listData?: StarredListData): QueryClient {
  const queryClient = new QueryClient();
  if (membership !== undefined) queryClient.setQueryData(STARRED_MEMBERSHIP_QUERY_KEY, membership);
  if (listData !== undefined) queryClient.setQueryData(STARRED_LIST_QUERY_KEY, listData);
  return queryClient;
}

const listOf = (...ids: string[]): StarredListData => ({
  pages: [{ items: ids.map((id) => row(id)), pagination: { limit: 20, hasMore: false, nextCursor: null } }],
  pageParams: [undefined],
});

const stateIn = (queryClient: QueryClient, messageId: string) =>
  starredStateOf(queryClient.getQueryData<StarredMembership>(STARRED_MEMBERSHIP_QUERY_KEY), messageId);

const listIds = (queryClient: QueryClient) =>
  (queryClient.getQueryData<StarredListData>(STARRED_LIST_QUERY_KEY)?.pages ?? []).flatMap((p) => p.items.map((r) => r.message.id));

/** Une réponse qu'on libère à la main — pour lire l'état PENDANT l'aller-retour. */
function deferred(): { readonly promise: Promise<WireReply>; readonly resolve: (reply: WireReply) => void } {
  let resolve: (reply: WireReply) => void = () => undefined;
  const promise = new Promise<WireReply>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('performStarGesture — optimiste, avec retour arrière', () => {
  test('AJOUTER : l’étoile s’allume AVANT la réponse, puis `PUT` sur la route du contrat', async () => {
    const reply = deferred();
    const { transport, calls } = sequenceTransport([reply.promise]);
    const queryClient = seededClient({});

    const pending = performStarGesture({ message: MESSAGE, on: true, deps: { source: 'gateway', transport, queryClient } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(stateIn(queryClient, MESSAGE.id)).toBe(true);
    expect(calls[0]?.method).toBe('PUT');
    expect(calls[0]?.path).toBe(`/api/v1/me/starred-messages/${MESSAGE.id}`);

    reply.resolve({
      ok: true,
      status: 200,
      data: { messageId: MESSAGE.id, conversationId: 'c-1', starred: true, starredAt: '2026-09-01T00:00:00.000Z' },
    });
    const result = await pending;
    expect(result).toEqual({ ok: true, message: 'announce.messageStarred' });
    expect(queryClient.getQueryData<StarredMembership>(STARRED_MEMBERSHIP_QUERY_KEY)?.[MESSAGE.id]).toBe(
      '2026-09-01T00:00:00.000Z',
    );
  });

  test('AJOUTER confirmé marque la liste de l’écran périmée : la ligne se relira, jamais inventée', async () => {
    const { transport } = sequenceTransport([
      { ok: true, status: 200, data: { messageId: MESSAGE.id, conversationId: 'c-1', starred: true, starredAt: '2026-09-01T00:00:00.000Z' } },
    ]);
    const queryClient = seededClient({}, listOf('m-autre'));
    await performStarGesture({ message: MESSAGE, on: true, deps: { source: 'gateway', transport, queryClient } });
    expect(listIds(queryClient)).toEqual(['m-autre']);
    expect(queryClient.getQueryState(STARRED_LIST_QUERY_KEY)?.isInvalidated).toBe(true);
  });

  test('AJOUTER refusé (404) : l’étoile s’éteint, et l’échec est annoncé', async () => {
    const { transport } = sequenceTransport([{ ok: false, status: 404, error: 'Not found', code: 'MESSAGE_NOT_FOUND' }]);
    const queryClient = seededClient({});
    const result = await performStarGesture({ message: MESSAGE, on: true, deps: { source: 'gateway', transport, queryClient } });
    expect(stateIn(queryClient, MESSAGE.id)).toBe(false);
    expect(result).toEqual({ ok: false, message: 'starred.messages.error' });
  });

  test('AJOUTER sur une vue unique (409 `MESSAGE_NOT_STARRABLE`) : retour arrière, et la raison est dite', async () => {
    const { transport } = sequenceTransport([{ ok: false, status: 409, error: 'Conflict', code: 'MESSAGE_NOT_STARRABLE' }]);
    const queryClient = seededClient({});
    const result = await performStarGesture({ message: MESSAGE, on: true, deps: { source: 'gateway', transport, queryClient } });
    expect(stateIn(queryClient, MESSAGE.id)).toBe(false);
    expect(result).toEqual({ ok: false, message: 'starred.messages.notStarrable' });
  });

  test('RETIRER : l’étoile s’éteint et la ligne quitte l’écran AVANT la réponse, puis `DELETE`', async () => {
    const reply = deferred();
    const { transport, calls } = sequenceTransport([reply.promise]);
    const queryClient = seededClient({ [MESSAGE.id]: '2026-09-01T00:00:00.000Z' }, listOf('m-a', MESSAGE.id, 'm-b'));

    const pending = performStarGesture({ message: MESSAGE, on: false, deps: { source: 'gateway', transport, queryClient } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(stateIn(queryClient, MESSAGE.id)).toBe(false);
    expect(listIds(queryClient)).toEqual(['m-a', 'm-b']);
    expect(calls[0]?.method).toBe('DELETE');

    reply.resolve({ ok: true, status: 200, data: { messageId: MESSAGE.id, starred: false } });
    expect(await pending).toEqual({ ok: true, message: 'announce.messageUnstarred' });
  });

  test('RETIRER refusé : l’étoile se rallume avec SA date, et la ligne revient À SA PLACE', async () => {
    const { transport } = sequenceTransport([{ ok: false, status: 403, error: 'Forbidden' }]);
    const queryClient = seededClient({ [MESSAGE.id]: '2026-09-01T00:00:00.000Z' }, listOf('m-a', MESSAGE.id, 'm-b'));
    const result = await performStarGesture({ message: MESSAGE, on: false, deps: { source: 'gateway', transport, queryClient } });
    expect(result).toEqual({ ok: false, message: 'starred.messages.error' });
    expect(queryClient.getQueryData<StarredMembership>(STARRED_MEMBERSHIP_QUERY_KEY)?.[MESSAGE.id]).toBe(
      '2026-09-01T00:00:00.000Z',
    );
    expect(listIds(queryClient)).toEqual(['m-a', MESSAGE.id, 'm-b']);
  });

  test('panne PASSAGÈRE (réseau coupé, 5xx) : l’optimiste reste, et il est ANNONCÉ non confirmé', async () => {
    const coupe = sequenceTransport(['throw']);
    const queryClient = seededClient({});
    expect(await performStarGesture({ message: MESSAGE, on: true, deps: { source: 'gateway', transport: coupe.transport, queryClient } })).toEqual({
      ok: true,
      message: 'starred.messages.pending',
    });
    expect(stateIn(queryClient, MESSAGE.id)).toBe(true);

    const indisponible = sequenceTransport([{ ok: false, status: 503, error: 'indisponible' }]);
    const autre = seededClient({});
    expect(
      await performStarGesture({ message: MESSAGE, on: true, deps: { source: 'gateway', transport: indisponible.transport, queryClient: autre } }),
    ).toEqual({ ok: true, message: 'starred.messages.pending' });
    expect(stateIn(autre, MESSAGE.id)).toBe(true);
  });

  test('UN geste à la fois par message : un second tap pendant l’aller-retour ne croise pas le premier', async () => {
    const reply = deferred();
    const { transport, calls } = sequenceTransport([reply.promise]);
    const queryClient = seededClient({});
    const deps = { source: 'gateway' as const, transport, queryClient };

    const first = performStarGesture({ message: MESSAGE, on: true, deps });
    const second = await performStarGesture({ message: MESSAGE, on: false, deps });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const sent = calls.map((c) => c.method);

    reply.resolve({ ok: true, status: 200, data: { messageId: MESSAGE.id, conversationId: 'c-1', starred: true, starredAt: '2026-09-01T00:00:00.000Z' } });
    await first;
    expect(second).toEqual({ ok: true });
    expect(sent).toEqual(['PUT']);
    expect(stateIn(queryClient, MESSAGE.id)).toBe(true);
  });

  test('une relecture de l’ensemble EN VOL ne rend pas l’état d’avant le geste', async () => {
    const lecture = deferred();
    const { transport } = sequenceTransport([
      lecture.promise,
      { ok: true, status: 200, data: { messageId: MESSAGE.id, conversationId: 'c-1', starred: true, starredAt: '2026-09-01T00:00:00.000Z' } },
    ]);
    const queryClient = seededClient({});
    const deps = { source: 'gateway' as const, transport, queryClient };

    const relecture = queryClient.fetchQuery({ ...starredMembershipQueryOptions(deps), staleTime: 0 }).catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const geste = performStarGesture({ message: MESSAGE, on: true, deps });
    lecture.resolve(page([], null));
    await Promise.all([relecture, geste]);

    expect(stateIn(queryClient, MESSAGE.id)).toBe(true);
  });
});
