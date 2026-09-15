import { describe, expect, test } from 'bun:test';
import { QueryClient, type InfiniteData } from '@tanstack/react-query';

import { communitiesQueryKey, communityQueryKey, type CommunityPage, type CommunitySummary } from './communities';
import { performCreateCommunity, type CommunityActionDeps } from './community-actions';
import { createHttpTransport } from './http';

/**
 * CRÉER UNE COMMUNAUTÉ (#6364) — le geste écrit le cache que les écrans LISENT :
 * le détail s'ouvre sans squelette, la liste la montre en tête au retour. Un
 * refus ne laisse RIEN dans le cache : une carte qu'on ne pourrait pas ouvrir
 * serait un contrôle qui ment.
 */

const summary = (overrides: Partial<CommunitySummary> = {}): CommunitySummary => ({
  id: 'm-old',
  identifier: 'mshy_old',
  name: 'Ancienne',
  description: null,
  avatar: null,
  banner: null,
  isPrivate: true,
  createdBy: 'u1',
  memberCount: 4,
  conversationCount: 1,
  ...overrides,
});

const wire = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  id: 'm-new',
  identifier: 'mshy_club',
  name: 'Club',
  isPrivate: true,
  createdBy: 'u1',
  memberCount: 1,
  conversationCount: 0,
  ...overrides,
});

const depsReplying = (reply: { readonly status: number; readonly body: unknown }, online = true) => {
  const calls: string[] = [];
  const fetchImpl = async (input: RequestInfo | URL): Promise<Response> => {
    calls.push(String(input));
    return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { 'content-type': 'application/json' } });
  };
  const queryClient = new QueryClient();
  const deps: CommunityActionDeps = {
    source: 'gateway',
    transport: createHttpTransport({ base: 'https://gate.test', fetchImpl: fetchImpl as typeof fetch, timeoutMs: 0 }),
    queryClient,
    isOnline: () => online,
  };
  return { calls, deps, queryClient };
};

const draft = { name: 'Club', identifier: 'club', description: '', isPrivate: true };

const seedList = (queryClient: QueryClient) =>
  queryClient.setQueryData<InfiniteData<CommunityPage, number>>(communitiesQueryKey(''), {
    pages: [{ communities: [summary()], nextOffset: null }],
    pageParams: [0],
  });

describe('performCreateCommunity', () => {
  test('créée : le détail est en cache et la liste la montre EN TÊTE', async () => {
    const { deps, queryClient } = depsReplying({ status: 201, body: { success: true, data: wire() } });
    seedList(queryClient);
    const outcome = await performCreateCommunity({ draft, deps });
    expect(outcome.status).toBe('created');
    expect(outcome.status === 'created' ? [outcome.community.id, outcome.community.name] : null).toEqual(['m-new', 'Club']);
    expect(queryClient.getQueryData<CommunitySummary>(communityQueryKey('m-new'))?.name).toBe('Club');
    const list = queryClient.getQueryData<InfiniteData<CommunityPage, number>>(communitiesQueryKey(''));
    expect(list?.pages[0]?.communities.map((c) => c.id)).toEqual(['m-new', 'm-old']);
  });

  test('créée sans liste en cache : aucune liste n’est inventée', async () => {
    const { deps, queryClient } = depsReplying({ status: 201, body: { success: true, data: wire() } });
    await performCreateCommunity({ draft, deps });
    expect(queryClient.getQueryData(communitiesQueryKey(''))).toBeUndefined();
  });

  test('un identifiant déjà pris (409) se nomme sous son champ, et le cache reste intact', async () => {
    const { deps, queryClient } = depsReplying({ status: 409, body: { success: false, error: 'exists' } });
    seedList(queryClient);
    const outcome = await performCreateCommunity({ draft, deps });
    expect(outcome).toEqual({ status: 'conflict', field: 'identifier' });
    expect(queryClient.getQueryData<InfiniteData<CommunityPage, number>>(communitiesQueryKey(''))?.pages[0]?.communities).toHaveLength(1);
  });

  test('un brouillon invalide ne part pas et nomme son champ', async () => {
    const { deps, calls } = depsReplying({ status: 201, body: {} });
    expect(await performCreateCommunity({ draft: { ...draft, name: ' ' }, deps })).toEqual({ status: 'invalid', field: 'name' });
    expect(calls).toHaveLength(0);
  });

  test('hors ligne, rien ne part : la création est refusée, jamais simulée', async () => {
    const { deps, calls } = depsReplying({ status: 201, body: {} }, false);
    expect(await performCreateCommunity({ draft, deps })).toEqual({ status: 'offline' });
    expect(calls).toHaveLength(0);
  });

  test('une panne se dit comme une panne', async () => {
    const { deps } = depsReplying({ status: 500, body: { success: false, error: 'boom' } });
    expect(await performCreateCommunity({ draft, deps })).toEqual({ status: 'error' });
  });
});
