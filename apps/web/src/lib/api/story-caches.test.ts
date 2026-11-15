import { describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';

import { removeStoryFromCaches } from './story-caches';
import { STORY_FEED_QUERY_KEY, STORY_TRAY_QUERY_KEY, storyPostQueryKey, type StoryTrayPost } from './stories';

/** **LES TROIS CORPUS DE STORIES** (#6149) — voir le doc-comment de
 * `story-caches.ts`. */

const story = (id: string): StoryTrayPost => ({ id, type: 'STORY', createdAt: '2026-09-24T10:00:00.000Z' });

describe('removeStoryFromCaches — la story quitte le plateau, le fil et sa fiche', () => {
  test('elle sort des deux corpus, et sa fiche unitaire est retirée', () => {
    const queryClient = new QueryClient();
    const a = story('a');
    const b = story('b');
    queryClient.setQueryData(STORY_TRAY_QUERY_KEY, [a, b]);
    queryClient.setQueryData(STORY_FEED_QUERY_KEY, [a, b]);
    queryClient.setQueryData(storyPostQueryKey('a'), a);

    removeStoryFromCaches(queryClient, 'a');

    expect(queryClient.getQueryData(STORY_TRAY_QUERY_KEY)).toEqual([b]);
    expect(queryClient.getQueryData(STORY_FEED_QUERY_KEY)).toEqual([b]);
    expect(queryClient.getQueryData(storyPostQueryKey('a'))).toBeUndefined();
  });

  test('une caisse SANS la story garde la MÊME référence — rien à réécrire', () => {
    const queryClient = new QueryClient();
    const tray: readonly StoryTrayPost[] = [story('b')];
    queryClient.setQueryData(STORY_TRAY_QUERY_KEY, tray);

    removeStoryFromCaches(queryClient, 'a');

    expect(queryClient.getQueryData(STORY_TRAY_QUERY_KEY)).toBe(tray);
  });

  test('une caisse absente reste absente — aucune requête inventée', () => {
    const queryClient = new QueryClient();

    removeStoryFromCaches(queryClient, 'a');

    expect(queryClient.getQueryData(STORY_TRAY_QUERY_KEY)).toBeUndefined();
    expect(queryClient.getQueryData(STORY_FEED_QUERY_KEY)).toBeUndefined();
  });

  test('un `postId` qui n’est la story d’AUCUNE caisse (une carte du Flux) n’y écrit rien', () => {
    const queryClient = new QueryClient();
    const tray: readonly StoryTrayPost[] = [story('s1')];
    const feed: readonly StoryTrayPost[] = [story('s1')];
    queryClient.setQueryData(STORY_TRAY_QUERY_KEY, tray);
    queryClient.setQueryData(STORY_FEED_QUERY_KEY, feed);

    removeStoryFromCaches(queryClient, 'p-feed-post');

    expect(queryClient.getQueryData(STORY_TRAY_QUERY_KEY)).toBe(tray);
    expect(queryClient.getQueryData(STORY_FEED_QUERY_KEY)).toBe(feed);
  });
});
