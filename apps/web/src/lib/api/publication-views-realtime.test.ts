import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { STORY_FEED_QUERY_KEY, storyPostQueryKey, type StoryFeedPost } from './stories';
import { applyStoryViewedEvent } from './publication-views-realtime';
import { storyViewersQueryKey } from './publication-viewers';

/**
 * `applyStoryViewedEvent` (#7116, revue — spécification Q8/T10) — « Vues »
 * suit le temps réel. La passerelle diffuse `story:viewed` à l'AUTEUR seul
 * (`SocialEventsHandler.broadcastStoryViewed` → `emitToUser(authorId)`,
 * émetteur `routes/social/events.ts:340-366`), charge `StoryViewedEventData`
 * (`packages/shared/types/post.ts:371-376`). `socket.ts` ne s'en servait que
 * pour invalider le PLATEAU : le compte du rail et la feuille ouverte
 * restaient figés sur l'état du chargement.
 *
 * Le compte est ABSOLU (`post.viewCount` relu après l'enregistrement de la
 * vue) — il REMPLACE, il ne s'ajoute pas, comme `post:liked.likeCount`.
 */
const story = (patch: Partial<StoryFeedPost> = {}): StoryFeedPost => ({
  id: 'st-mienne',
  type: 'STORY',
  createdAt: '2026-09-24T08:00:00.000Z',
  viewCount: 8,
  ...patch,
});

const event = { storyId: 'st-mienne', viewerId: 'u-noor', viewerUsername: 'noor.haddad', viewCount: 9 };

describe('applyStoryViewedEvent — le compte des vues et la liste suivent en direct', () => {
  test('le compte SERVI remplace celui du corpus ET celui de la story atteinte par lien', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(STORY_FEED_QUERY_KEY, [story(), story({ id: 'st-autre', viewCount: 2 })]);
    queryClient.setQueryData(storyPostQueryKey('st-mienne'), story());

    applyStoryViewedEvent(queryClient, event);

    expect(queryClient.getQueryData<readonly StoryFeedPost[]>(STORY_FEED_QUERY_KEY)?.map((s) => s.viewCount)).toEqual([9, 2]);
    expect(queryClient.getQueryData<StoryFeedPost>(storyPostQueryKey('st-mienne'))?.viewCount).toBe(9);
  });

  test('la liste des lecteurs est INVALIDÉE — la feuille ouverte se relit, sans squelette', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(storyViewersQueryKey('st-mienne'), { viewers: [], pagination: { total: 0, offset: 0, limit: 50, hasMore: false } });

    applyStoryViewedEvent(queryClient, event);

    expect(queryClient.getQueryState(storyViewersQueryKey('st-mienne'))?.isInvalidated).toBe(true);
  });

  test('une AUTRE story ne bouge pas : le corpus garde son IDENTITÉ (zéro re-rendu)', () => {
    const queryClient = new QueryClient();
    const corpus = [story({ id: 'st-autre', viewCount: 2 })];
    queryClient.setQueryData(STORY_FEED_QUERY_KEY, corpus);

    applyStoryViewedEvent(queryClient, event);

    expect(queryClient.getQueryData(STORY_FEED_QUERY_KEY)).toBe(corpus);
  });

  test('une charge MALFORMÉE ne change rien et ne lève pas', () => {
    const queryClient = new QueryClient();
    const corpus = [story()];
    queryClient.setQueryData(STORY_FEED_QUERY_KEY, corpus);

    for (const payload of [null, 'st-mienne', { storyId: 'st-mienne' }, { storyId: 'st-mienne', viewCount: Number.NaN }, { storyId: 7, viewCount: 9 }]) {
      applyStoryViewedEvent(queryClient, payload);
    }

    expect(queryClient.getQueryData(STORY_FEED_QUERY_KEY)).toBe(corpus);
  });

  test('un cache jamais chargé n’est pas FABRIQUÉ', () => {
    const queryClient = new QueryClient();
    applyStoryViewedEvent(queryClient, event);
    expect(queryClient.getQueryData(STORY_FEED_QUERY_KEY)).toBeUndefined();
    expect(queryClient.getQueryData(storyPostQueryKey('st-mienne'))).toBeUndefined();
  });
});
