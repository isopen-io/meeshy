import { describe, expect, test } from 'bun:test';
import { QueryClient, QueryObserver, type InfiniteData } from '@tanstack/react-query';

import type { CommunityDeletedEventData } from '@meeshy/shared/types/socketio-events';

import {
  communitiesQueryKey,
  communityConversationsQueryKey,
  communityPostsQueryKey,
  communityQueryKey,
  type CommunityPage,
  type CommunitySummary,
} from './communities';
import { communityMembersQueryKey } from './community-members';
import { applyCommunityDeletedEvent } from './community-deleted-live';

/**
 * **UNE COMMUNAUTÉ DISPARUE QUITTE L'ÉCRAN DE SES MEMBRES** (#19590) —
 * `community:deleted`. La charge est celle que la passerelle émet, clé par clé
 * (`community-deleted-broadcast.ts`) ; chaque témoin assert sur ce que le cache
 * REND.
 */

const CLUB = '6650c0000000000000000001';
const OTHER = '6650c0000000000000000002';

const summary = (id: string, overrides: Partial<CommunitySummary> = {}): CommunitySummary => ({
  id, identifier: `mshy_${id}`, name: 'Club', description: null, avatar: null, banner: null, isPrivate: false,
  createdBy: 'u-creator', memberCount: 3, conversationCount: 2, viewerRole: 'member', ...overrides,
});
const listOf = (...communities: CommunitySummary[]): InfiniteData<CommunityPage, number> => ({
  pages: [{ communities, nextOffset: null }], pageParams: [0],
});
const deleted = (overrides: Partial<CommunityDeletedEventData> = {}): CommunityDeletedEventData => ({
  communityId: CLUB, reason: 'deleted', at: '2026-11-18T06:00:00.000Z', ...overrides,
});

const seeded = () => {
  const client = new QueryClient();
  client.setQueryData(communityQueryKey(CLUB), summary(CLUB));
  client.setQueryData(communityQueryKey(`mshy_${CLUB}`), summary(CLUB));
  client.setQueryData(communityQueryKey(OTHER), summary(OTHER));
  client.setQueryData(communitiesQueryKey(''), listOf(summary(OTHER), summary(CLUB)));
  client.setQueryData(communitiesQueryKey('club'), listOf(summary(CLUB)));
  client.setQueryData(communityMembersQueryKey(CLUB), { pages: [], pageParams: [] });
  client.setQueryData(communityConversationsQueryKey(CLUB), { pages: [], pageParams: [] });
  client.setQueryData(communityPostsQueryKey(CLUB), { pages: [], pageParams: [] });
  return client;
};
const ids = (client: QueryClient, search: string) =>
  client.getQueryData<InfiniteData<CommunityPage, number>>(communitiesQueryKey(search))?.pages.flatMap((p) => p.communities.map((c) => c.id));

describe('applyCommunityDeletedEvent', () => {
  test('la communauté sort de chaque liste en cache, la complète comme chaque recherche, et les autres restent', () => {
    const client = seeded();
    applyCommunityDeletedEvent(client, deleted());

    expect(ids(client, '')).toEqual([OTHER]);
    expect(ids(client, 'club')).toEqual([]);
  });

  test("le détail, les membres, les salons et les publications que personne ne regarde sont oubliés — par l'id comme par l'identifiant", () => {
    const client = seeded();
    applyCommunityDeletedEvent(client, deleted({ reason: 'deactivated' }));

    expect(client.getQueryData(communityQueryKey(CLUB))).toBeUndefined();
    expect(client.getQueryData(communityQueryKey(`mshy_${CLUB}`))).toBeUndefined();
    expect(client.getQueryData(communityMembersQueryKey(CLUB))).toBeUndefined();
    expect(client.getQueryData(communityConversationsQueryKey(CLUB))).toBeUndefined();
    expect(client.getQueryData(communityPostsQueryKey(CLUB))).toBeUndefined();
    expect(client.getQueryData(communityQueryKey(OTHER))).toEqual(summary(OTHER));
  });

  test('le détail REGARDÉ se relit (la passerelle rend 404, que l’écran dessine déjà) au lieu de disparaître sous les yeux', async () => {
    const client = seeded();
    const reads: string[] = [];
    const observer = new QueryObserver(client, {
      queryKey: communityQueryKey(CLUB),
      queryFn: async () => { reads.push(CLUB); throw new Error('404'); },
      retry: false,
      staleTime: Infinity,
    });
    const unsubscribe = observer.subscribe(() => undefined);

    applyCommunityDeletedEvent(client, deleted());
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(reads).toEqual([CLUB]);
    unsubscribe();
  });

  test('une charge malformée ne touche à rien', () => {
    const client = seeded();
    [null, 'x', {}, { communityId: '' }, { communityId: 42 }].forEach((payload) => applyCommunityDeletedEvent(client, payload));

    expect(ids(client, '')).toEqual([OTHER, CLUB]);
    expect(client.getQueryData(communityQueryKey(CLUB))).toEqual(summary(CLUB));
  });
});
