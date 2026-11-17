import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import * as conversationsEndpoints from '@meeshy/shared/api/endpoints/conversations';

import { createConversationStore } from '@/lib/conversation-store';
import { listPage, row } from '@/test-support/live-relecture';
import { pathOf, routedTransport } from '@/test-support/routed-transport';

import { createPreferencesSync } from './conversation-preferences-sync';
import { CONVERSATIONS_QUERY_KEY, conversationQuery, conversationQueryKey, conversationsInfiniteOptions, findCachedConversation } from './conversations';
import type { ApiResult, HttpRequest } from './http';
import { customNameOf, flagsOf, preferenceEntryOf } from './preferences';
import type { Conversation } from './types';

/**
 * **LA DIFFUSION ET LA RELECTURE S'ARBITRENT PAR `version`** (#18925) — la
 * passerelle sert désormais, sur `userPreferences[0]` de `GET /conversations`
 * et de `GET /conversations/:id`, la `version` des préférences du lecteur
 * (0 pour une ligne jamais écrite), `mentionsOnly`, `orderInCategory` et
 * `clearHistoryBefore`. `user:preferences-updated` diffuse la même `version`.
 * Le web ne savait pas les départager : une diffusion EN RETARD défaisait une
 * relecture plus fraîche, et une relecture servie avant une diffusion déjà
 * appliquée la faisait reculer. La plus récente gagne désormais, dans les deux
 * sens ; jamais un recul.
 */

const preferences = (version: number | undefined, overrides: Readonly<Record<string, unknown>> = {}) => ({
  isPinned: false,
  isMuted: false,
  isArchived: false,
  tags: [],
  categoryId: null,
  customName: null,
  reaction: null,
  ...(version === undefined ? {} : { version }),
  ...overrides,
});

/** La ligne telle que la production la sert aujourd'hui : SANS `updatedAt` (#9638), donc sans delta — chaque relecture est complète. */
const servedRow = (version: number | undefined, overrides: Readonly<Record<string, unknown>> = {}): Conversation => {
  const { updatedAt: _updatedAt, ...rest } = row({ userPreferences: [preferences(version, overrides)] } as Partial<Conversation>);
  return rest as Conversation;
};

/** La diffusion telle que `toPreferencesPayload` (passerelle) l'émet. */
const broadcast = (version: number, overrides: Readonly<Record<string, unknown>> = {}) => ({
  userId: 'u-ada',
  conversationId: 'c-a',
  version,
  reset: false,
  preferences: {
    ...preferences(undefined),
    mentionsOnly: false,
    orderInCategory: null,
    readingMode: 'auto',
    clearHistoryBefore: null,
    ...overrides,
  },
});

/** La passerelle : la liste et la fiche servent la ligne que le témoin choisit, à l'instant. */
function gateway(initial: Conversation) {
  const state = { row: initial };
  const { transport } = routedTransport((req: HttpRequest): ApiResult<unknown> | undefined => {
    if (req.method !== 'GET') return undefined;
    if (pathOf(req) === conversationsEndpoints.root) return { ok: true, data: [state.row], pagination: listPage([state.row]).pagination };
    if (pathOf(req) === conversationsEndpoints.byId('c-a')) return { ok: true, data: state.row };
    return undefined;
  });
  return { transport, serve: (next: Conversation) => (state.row = next) };
}

const deps = (transport: ReturnType<typeof gateway>['transport']) => ({ source: 'gateway' as const, transport });

const readList = (queryClient: QueryClient, transport: ReturnType<typeof gateway>['transport']) =>
  queryClient.fetchInfiniteQuery({ ...conversationsInfiniteOptions(deps(transport)), staleTime: 0 });

const readDetail = (queryClient: QueryClient, transport: ReturnType<typeof gateway>['transport']) =>
  queryClient.fetchQuery({ ...conversationQuery(deps(transport), 'c-a'), staleTime: 0 });

const listed = (queryClient: QueryClient): Conversation => {
  const found = findCachedConversation(queryClient, 'c-a');
  if (found === undefined) throw new Error('la ligne c-a doit être en cache');
  return found;
};

const detailed = (queryClient: QueryClient): Conversation => {
  const found = queryClient.getQueryData<Conversation>(conversationQueryKey('c-a'));
  if (found === undefined) throw new Error('la fiche c-a doit être en cache');
  return found;
};

const synced = (queryClient: QueryClient) => createPreferencesSync({ queryClient, conversations: createConversationStore() });

describe('une diffusion et une relecture REST se départagent par version (#18925)', () => {
  test('une diffusion EN RETARD sur la liste relue ne la fait pas reculer', async () => {
    const queryClient = new QueryClient();
    const api = gateway(servedRow(7, { isPinned: true }));
    await readList(queryClient, api.transport);

    synced(queryClient)(broadcast(6, { isPinned: false }));

    expect(flagsOf(listed(queryClient)).isPinned).toBe(true);
  });

  test('une diffusion de MÊME version que la ligne relue ne la réécrit pas', async () => {
    const queryClient = new QueryClient();
    const api = gateway(servedRow(7, { customName: 'Servi' }));
    await readList(queryClient, api.transport);

    synced(queryClient)(broadcast(7, { customName: 'Rejoué' }));

    expect(customNameOf(listed(queryClient))).toBe('Servi');
  });

  test('une relecture servie PLUS ANCIENNE qu’une diffusion déjà appliquée ne la fait pas reculer, sur la liste comme sur la fiche', async () => {
    const queryClient = new QueryClient();
    const api = gateway(servedRow(5));
    await readList(queryClient, api.transport);
    await readDetail(queryClient, api.transport);

    synced(queryClient)(broadcast(7, { isPinned: true, customName: 'Les miens' }));
    api.serve(servedRow(6, { isPinned: false }));
    await readList(queryClient, api.transport);
    await readDetail(queryClient, api.transport);

    for (const conversation of [listed(queryClient), detailed(queryClient)]) {
      expect(flagsOf(conversation).isPinned).toBe(true);
      expect(customNameOf(conversation)).toBe('Les miens');
    }
  });

  test('une relecture PLUS RÉCENTE que la diffusion l’emporte', async () => {
    const queryClient = new QueryClient();
    const api = gateway(servedRow(5));
    await readList(queryClient, api.transport);

    synced(queryClient)(broadcast(7, { isPinned: true }));
    api.serve(servedRow(8, { isPinned: false }));
    await readList(queryClient, api.transport);

    expect(flagsOf(listed(queryClient)).isPinned).toBe(false);
  });

  test('une diffusion plus récente que la ligne relue s’applique, et la ligne prend sa version', async () => {
    const queryClient = new QueryClient();
    const api = gateway(servedRow(3));
    await readList(queryClient, api.transport);

    synced(queryClient)(broadcast(4, { isMuted: true }));

    expect(flagsOf(listed(queryClient)).isMuted).toBe(true);
    expect(preferenceEntryOf(listed(queryClient))?.['version']).toBe(4);
  });

  test('une connexion NEUVE juge une diffusion en retard contre la ligne en cache, pas contre sa mémoire vide', async () => {
    const queryClient = new QueryClient();
    const api = gateway(servedRow(2));
    await readList(queryClient, api.transport);
    synced(queryClient)(broadcast(5, { isArchived: true }));

    synced(queryClient)(broadcast(4, { isArchived: false }));

    expect(flagsOf(listed(queryClient)).isArchived).toBe(true);
  });

  test('ce que la diffusion porte et que la ligne sert désormais se pose sur la ligne : mentions seulement, ordre, effacement d’historique', async () => {
    const queryClient = new QueryClient();
    const api = gateway(servedRow(1));
    await readList(queryClient, api.transport);

    synced(queryClient)(broadcast(2, { mentionsOnly: true, orderInCategory: 3, clearHistoryBefore: '2026-11-16T00:00:00.000Z', readingMode: 'focal' }));

    const entry = (listed(queryClient).userPreferences as readonly Readonly<Record<string, unknown>>[] | undefined)?.[0] ?? {};
    expect(entry).toMatchObject({ mentionsOnly: true, orderInCategory: 3, clearHistoryBefore: '2026-11-16T00:00:00.000Z', version: 2 });
    expect(Object.keys(entry)).not.toContain('readingMode');
  });

  test('une ligne d’un serveur antérieur, sans version, passe telle quelle', async () => {
    const queryClient = new QueryClient();
    const api = gateway(servedRow(undefined));
    await readList(queryClient, api.transport);

    synced(queryClient)(broadcast(3, { isArchived: true }));
    api.serve(servedRow(undefined, { isArchived: false }));
    await readList(queryClient, api.transport);

    expect(flagsOf(listed(queryClient)).isArchived).toBe(false);
  });

  test('une relecture d’une conversation que le cache ne tient pas passe telle quelle', async () => {
    const queryClient = new QueryClient();
    const api = gateway(servedRow(2, { isPinned: true }));

    await readList(queryClient, api.transport);

    expect(flagsOf(listed(queryClient)).isPinned).toBe(true);
    expect(queryClient.getQueryData(CONVERSATIONS_QUERY_KEY)).toBeDefined();
  });
});
