import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { STORY_FEED_QUERY_KEY, type StoryFeedPost } from './stories';
import { applyServedStoryReaction, applyStoryReactionEvent, isStoryReactionEvent } from './reaction-realtime';

/**
 * **`story:reacted` / `story:unreacted` — LE RAIL SUIT EN DIRECT (#7227,
 * W8).** Module SÉPARÉ de `lib/stories/reaction.ts` / `lib/api/story-
 * reactions.ts` (voir le doc-comment de tête de `reaction-realtime.ts`) :
 * ces témoins couvrent la jumelle SERVIE (`applyServedStoryReaction`), la
 * garde de forme (`isStoryReactionEvent`) et l'application PURE sur
 * `STORY_FEED_QUERY_KEY` (`applyStoryReactionEvent`), que `socket.ts` BRANCHE
 * par `import()` (D-98).
 */

const HEART = '❤️';

const story = (id: string, mine: readonly string[] | null, count = 0): StoryFeedPost => ({
  id,
  type: 'STORY',
  createdAt: '2026-09-21T09:00:00.000Z',
  currentUserReactions: mine,
  reactionCount: count,
});

const seeded = (stories: readonly StoryFeedPost[]): QueryClient => {
  const queryClient = new QueryClient();
  queryClient.setQueryData(STORY_FEED_QUERY_KEY, stories);
  return queryClient;
};

const cached = (queryClient: QueryClient, id = 'st-1'): StoryFeedPost | undefined =>
  queryClient.getQueryData<readonly StoryFeedPost[]>(STORY_FEED_QUERY_KEY)?.find((s) => s.id === id);

describe('applyServedStoryReaction — le compte ABSOLU, et la garde du lecteur', () => {
  test('une story AUTRE que la cible ne bouge pas — MÊME référence', () => {
    const s = story('st-2', [], 1);
    const next = applyServedStoryReaction(s, { storyId: 'st-1', emoji: HEART, likeCount: 9, plan: 'add', byViewer: true });
    expect(next).toBe(s);
  });

  test('le compte se POSE, jamais ne s’ADDITIONNE', () => {
    const s = story('st-1', [], 1);
    const next = applyServedStoryReaction(s, { storyId: 'st-1', emoji: HEART, likeCount: 9, plan: 'add', byViewer: false });
    expect(next.reactionCount).toBe(9);
  });

  test('la réaction d’un AUTRE lecteur pose le compte SANS remplir mon cœur', () => {
    const s = story('st-1', [], 1);
    const next = applyServedStoryReaction(s, { storyId: 'st-1', emoji: HEART, likeCount: 9, plan: 'add', byViewer: false });
    expect(next.currentUserReactions ?? []).toEqual([]);
  });

  test('ma PROPRE réaction (autre appareil) pose le compte ET mon cœur', () => {
    const s = story('st-1', [], 1);
    const ajout = applyServedStoryReaction(s, { storyId: 'st-1', emoji: HEART, likeCount: 2, plan: 'add', byViewer: true });
    expect(ajout.currentUserReactions).toEqual([HEART]);

    const retrait = applyServedStoryReaction(ajout, { storyId: 'st-1', emoji: HEART, likeCount: 1, plan: 'remove', byViewer: true });
    expect(retrait.currentUserReactions).toEqual([]);
    expect(retrait.reactionCount).toBe(1);
  });

  test('un retrait qui n’était pas mien ne le retire pas deux fois — idempotent', () => {
    const s = story('st-1', [], 0);
    const next = applyServedStoryReaction(s, { storyId: 'st-1', emoji: HEART, likeCount: 0, plan: 'remove', byViewer: true });
    expect(next.currentUserReactions).toEqual([]);
  });
});

describe('isStoryReactionEvent — la garde de forme', () => {
  test('accepte une charge complète, refuse ce qui manque', () => {
    const complete = { storyId: 's-1', userId: 'u-1', emoji: HEART, likeCount: 3, reactionSummary: {} };
    expect(isStoryReactionEvent(complete)).toBe(true);

    for (const charge of [null, {}, { ...complete, storyId: 42 }, { ...complete, likeCount: 'trois' }]) {
      expect(isStoryReactionEvent(charge)).toBe(false);
    }
  });
});

describe('applyStoryReactionEvent — application PURE sur STORY_FEED_QUERY_KEY', () => {
  test('une charge MALFORMÉE ne change rien, et ne lève pas', () => {
    const queryClient = seeded([story('st-1', [], 2)]);

    for (const charge of [null, {}, { storyId: 'st-1' }]) {
      expect(() => applyStoryReactionEvent(queryClient, charge, { viewerId: 'u-viewer', plan: 'add' })).not.toThrow();
    }
    expect(cached(queryClient)?.reactionCount).toBe(2);
  });

  test('un lecteur AUTRE pose le compte servi, ne remplit pas mon cœur', () => {
    const queryClient = seeded([story('st-1', [], 2)]);

    applyStoryReactionEvent(
      queryClient,
      { storyId: 'st-1', userId: 'u-other', emoji: HEART, likeCount: 5, reactionSummary: {} },
      { viewerId: 'u-viewer', plan: 'add' },
    );

    expect(cached(queryClient)?.reactionCount).toBe(5);
    expect(cached(queryClient)?.currentUserReactions ?? []).toEqual([]);
  });

  test('le LECTEUR (autre appareil) pose le compte servi ET son cœur', () => {
    const queryClient = seeded([story('st-1', [], 2)]);

    applyStoryReactionEvent(
      queryClient,
      { storyId: 'st-1', userId: 'u-viewer', emoji: HEART, likeCount: 3, reactionSummary: {} },
      { viewerId: 'u-viewer', plan: 'add' },
    );

    expect(cached(queryClient)?.currentUserReactions).toEqual([HEART]);
    expect(cached(queryClient)?.reactionCount).toBe(3);
  });

  test('sans corpus en cache, elle ne lève pas et n’en fabrique aucun', () => {
    const queryClient = new QueryClient();

    expect(() =>
      applyStoryReactionEvent(
        queryClient,
        { storyId: 'st-1', userId: 'u-other', emoji: HEART, likeCount: 5, reactionSummary: {} },
        { viewerId: 'u-viewer', plan: 'add' },
      ),
    ).not.toThrow();
    expect(queryClient.getQueryData(STORY_FEED_QUERY_KEY)).toBeUndefined();
  });
});
