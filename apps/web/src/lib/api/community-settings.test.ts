import { describe, expect, test } from 'bun:test';
import { QueryClient, type InfiniteData } from '@tanstack/react-query';

import { communitiesQueryKey, communityQueryKey, type CommunityPage, type CommunitySummary } from './communities';
import type { CommunityActionDeps } from './community-actions';
import {
  canEditSettingsOf,
  performDeleteCommunity,
  performUpdateCommunitySettings,
  settingsChangesOf,
  settingsDraftOf,
} from './community-settings';
import { createHttpTransport } from './http';

/**
 * RÉGLER SA COMMUNAUTÉ (#6377) — miroir `CommunitySettingsViewModel` (iOS) :
 * seuls les champs changés partent ; l'écran et la liste montrent le nouveau
 * nom AU GESTE, et un refus rend exactement le cache d'avant. Supprimer retire
 * la communauté de chaque liste ; un refus la rend.
 */

const summary = (overrides: Partial<CommunitySummary> = {}): CommunitySummary => ({
  id: 'm-club',
  identifier: 'mshy_club',
  name: 'Club',
  description: 'Le jeudi',
  avatar: null,
  banner: null,
  isPrivate: true,
  createdBy: 'u1',
  memberCount: 4,
  conversationCount: 1,
  viewerRole: 'admin',
  ...overrides,
});

type Reply = { readonly status: number; readonly body: unknown };

const depsReplying = (reply: Reply, online = true, gate: Promise<void> = Promise.resolve()) => {
  const calls: { readonly url: string; readonly method: string; readonly body: unknown }[] = [];
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    await gate;
    calls.push({ url: String(input), method: init?.method ?? 'GET', body: typeof init?.body === 'string' ? JSON.parse(init.body) : null });
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

const seed = (queryClient: QueryClient, community: CommunitySummary) => {
  queryClient.setQueryData(communityQueryKey(community.id), community);
  queryClient.setQueryData(communityQueryKey(community.identifier), community);
  queryClient.setQueryData<InfiniteData<CommunityPage, number>>(communitiesQueryKey(''), {
    pages: [{ communities: [community, summary({ id: 'm-autre', identifier: 'mshy_autre', name: 'Autre' })], nextOffset: null }],
    pageParams: [0],
  });
};

const listNames = (queryClient: QueryClient) =>
  queryClient.getQueryData<InfiniteData<CommunityPage, number>>(communitiesQueryKey(''))?.pages.flatMap((page) => page.communities.map((c) => c.name));

describe('canEditSettingsOf', () => {
  test('le créateur seul règle sa communauté', () => {
    expect(canEditSettingsOf(summary(), 'u1')).toBe(true);
    expect(canEditSettingsOf(summary(), 'u2')).toBe(false);
    expect(canEditSettingsOf(summary(), null)).toBe(false);
    expect(canEditSettingsOf(summary({ createdBy: null }), 'u1')).toBe(false);
  });
});

describe('settingsChangesOf', () => {
  test('rien de changé : rien ne part', () => {
    expect(settingsChangesOf(summary(), settingsDraftOf(summary()))).toEqual({ ok: true, body: null });
  });

  test('seuls les champs changés partent, rognés', () => {
    const draft = { ...settingsDraftOf(summary()), name: '  Club de lecture ', isPrivate: false };
    expect(settingsChangesOf(summary(), draft)).toEqual({ ok: true, body: { name: 'Club de lecture', isPrivate: false } });
  });

  test('vider la description part comme une chaîne vide', () => {
    expect(settingsChangesOf(summary(), { ...settingsDraftOf(summary()), description: '  ' })).toEqual({ ok: true, body: { description: '' } });
  });

  test('un nom vide ou trop long nomme son champ', () => {
    expect(settingsChangesOf(summary(), { ...settingsDraftOf(summary()), name: ' ' })).toEqual({ ok: false, field: 'name' });
    expect(settingsChangesOf(summary(), { ...settingsDraftOf(summary()), name: 'x'.repeat(101) })).toEqual({ ok: false, field: 'name' });
    expect(settingsChangesOf(summary(), { ...settingsDraftOf(summary()), description: 'x'.repeat(501) })).toEqual({ ok: false, field: 'description' });
  });
});

describe('performUpdateCommunitySettings', () => {
  const draft = { ...settingsDraftOf(summary()), name: 'Club de lecture' };

  test('enregistrée : PUT des seuls champs changés, le détail garde le rôle servi', async () => {
    const { deps, calls, queryClient } = depsReplying({
      status: 200,
      body: { success: true, data: { id: 'm-club', identifier: 'mshy_club', name: 'Club de lecture', description: 'Le jeudi', isPrivate: true, createdBy: 'u1', _count: { members: 4, Conversation: 1 } } },
    });
    seed(queryClient, summary());
    const outcome = await performUpdateCommunitySettings({ community: summary(), draft, deps });
    expect(outcome).toEqual({ status: 'saved' });
    expect(calls).toEqual([{ url: 'https://gate.test/api/v1/communities/m-club', method: 'PUT', body: { name: 'Club de lecture' } }]);
    expect(queryClient.getQueryData<CommunitySummary>(communityQueryKey('m-club'))).toMatchObject({ name: 'Club de lecture', viewerRole: 'admin' });
    expect(queryClient.getQueryData<CommunitySummary>(communityQueryKey('mshy_club'))?.name).toBe('Club de lecture');
    expect(listNames(queryClient)).toEqual(['Club de lecture', 'Autre']);
  });

  test('le nouveau nom est peint AVANT la réponse', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { deps, queryClient } = depsReplying({ status: 200, body: { success: true, data: { id: 'm-club', name: 'Club de lecture' } } }, true, gate);
    seed(queryClient, summary());
    const pending = performUpdateCommunitySettings({ community: summary(), draft, deps });
    await Promise.resolve();
    expect(queryClient.getQueryData<CommunitySummary>(communityQueryKey('m-club'))?.name).toBe('Club de lecture');
    expect(listNames(queryClient)).toEqual(['Club de lecture', 'Autre']);
    release();
    expect(await pending).toEqual({ status: 'saved' });
  });

  test('un refus rend EXACTEMENT le cache d’avant', async () => {
    const { deps, queryClient } = depsReplying({ status: 403, body: { success: false, error: 'Only community creator can update community', code: 'COMMUNITY_CREATOR_ONLY' } });
    seed(queryClient, summary());
    expect(await performUpdateCommunitySettings({ community: summary(), draft, deps })).toEqual({ status: 'refused' });
    expect(queryClient.getQueryData<CommunitySummary>(communityQueryKey('m-club'))?.name).toBe('Club');
    expect(listNames(queryClient)).toEqual(['Club', 'Autre']);
  });

  test('une communauté disparue (404) se dit, et le cache est rendu', async () => {
    const { deps, queryClient } = depsReplying({ status: 404, body: { success: false, error: 'Community not found' } });
    seed(queryClient, summary());
    expect(await performUpdateCommunitySettings({ community: summary(), draft, deps })).toEqual({ status: 'gone' });
    expect(queryClient.getQueryData<CommunitySummary>(communityQueryKey('m-club'))?.name).toBe('Club');
  });

  test('un brouillon invalide ne part pas ; hors ligne non plus ; rien de changé non plus', async () => {
    const { deps, calls } = depsReplying({ status: 200, body: {} });
    expect(await performUpdateCommunitySettings({ community: summary(), draft: { ...draft, name: '' }, deps })).toEqual({ status: 'invalid', field: 'name' });
    expect(await performUpdateCommunitySettings({ community: summary(), draft: settingsDraftOf(summary()), deps })).toEqual({ status: 'unchanged' });
    const offline = depsReplying({ status: 200, body: {} }, false);
    expect(await performUpdateCommunitySettings({ community: summary(), draft, deps: offline.deps })).toEqual({ status: 'offline' });
    expect([...calls, ...offline.calls]).toHaveLength(0);
  });

  test('une panne se dit comme une panne, et rend le cache', async () => {
    const { deps, queryClient } = depsReplying({ status: 500, body: { success: false, error: 'boom' } });
    seed(queryClient, summary());
    expect(await performUpdateCommunitySettings({ community: summary(), draft, deps })).toEqual({ status: 'error' });
    expect(listNames(queryClient)).toEqual(['Club', 'Autre']);
  });
});

describe('performDeleteCommunity', () => {
  test('supprimée : DELETE, et la communauté quitte chaque liste et chaque détail', async () => {
    const { deps, calls, queryClient } = depsReplying({ status: 200, body: { success: true, data: { message: 'ok' } } });
    seed(queryClient, summary());
    expect(await performDeleteCommunity({ community: summary(), deps })).toEqual({ status: 'deleted' });
    expect(calls.map((call) => [call.method, call.url])).toEqual([['DELETE', 'https://gate.test/api/v1/communities/m-club']]);
    expect(listNames(queryClient)).toEqual(['Autre']);
    expect(queryClient.getQueryData(communityQueryKey('m-club'))).toBeUndefined();
    expect(queryClient.getQueryData(communityQueryKey('mshy_club'))).toBeUndefined();
  });

  test('déjà supprimée (404) : c’est l’état visé', async () => {
    const { deps, queryClient } = depsReplying({ status: 404, body: { success: false, error: 'Community not found' } });
    seed(queryClient, summary());
    expect(await performDeleteCommunity({ community: summary(), deps })).toEqual({ status: 'deleted' });
    expect(listNames(queryClient)).toEqual(['Autre']);
  });

  test('un refus rend la communauté à sa place', async () => {
    const { deps, queryClient } = depsReplying({ status: 403, body: { success: false, error: 'no', code: 'COMMUNITY_CREATOR_ONLY' } });
    seed(queryClient, summary());
    expect(await performDeleteCommunity({ community: summary(), deps })).toEqual({ status: 'refused' });
    expect(listNames(queryClient)).toEqual(['Club', 'Autre']);
    expect(queryClient.getQueryData<CommunitySummary>(communityQueryKey('m-club'))?.name).toBe('Club');
  });

  test('hors ligne, rien ne part', async () => {
    const { deps, calls } = depsReplying({ status: 200, body: {} }, false);
    expect(await performDeleteCommunity({ community: summary(), deps })).toEqual({ status: 'offline' });
    expect(calls).toHaveLength(0);
  });
});
