import { describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';

import { commentsClosed } from '@/lib/feed/comments-closed';
import { scriptedTransport } from '@/test-support/scripted-transport';

import { applyServedCommentSetting, readCommentsClosed, setCommentsDisabled } from './comment-settings';
import { FEED_QUERY_KEY } from './feed';
import type { FeedPost } from './feed-pages';
import type { ApiResult, HttpTransport } from './http';
import { postQueryKey } from './publication-detail';
import { REELS_QUERY_ROOT } from './reels-query-key';
import { STORY_FEED_QUERY_KEY, type StoryFeedPost } from './stories';

/**
 * **LES COMMENTAIRES D'UNE PUBLICATION SE FERMENT ET SE ROUVRENT** (#16541) —
 * une loi (`commentsClosed`), un port optimiste (`PATCH …/comment-settings`)
 * et les diffusions, sur les cartes ET les stories, Réels gelés compris.
 */
const post = (patch: Partial<FeedPost> = {}): FeedPost => ({ id: 'p1', type: 'POST', createdAt: '2026-11-01T10:00:00.000Z', ...patch });

const cachesWith = (card: FeedPost) => {
  const queryClient = new QueryClient();
  queryClient.setQueryData(FEED_QUERY_KEY, { pages: [{ posts: [card] }], pageParams: [null] });
  queryClient.setQueryData([...REELS_QUERY_ROOT, 'feed'], { pages: [{ posts: [card] }], pageParams: [null] });
  queryClient.setQueryData(postQueryKey(card.id), card);
  return queryClient;
};

const reelCard = (queryClient: QueryClient): FeedPost =>
  (queryClient.getQueryData([...REELS_QUERY_ROOT, 'feed']) as { pages: { posts: FeedPost[] }[] }).pages[0]!.posts[0]!;

describe('commentsClosed — la loi unique', () => {
  test('ouverts par défaut, fermés par la publication ou par l’original qu’elle republie', () => {
    expect(commentsClosed(undefined)).toBe(false);
    expect(commentsClosed(post())).toBe(false);
    expect(commentsClosed(post({ commentsDisabled: null }))).toBe(false);
    expect(commentsClosed(post({ commentsDisabled: true }))).toBe(true);
    expect(commentsClosed(post({ commentsDisabled: false, repostOf: { id: 'o1', commentsDisabled: true } }))).toBe(true);
  });
});

describe('setCommentsDisabled — optimiste, puis confirmé ou défait', () => {
  test('PATCH sur la route du catalogue, corps { commentsDisabled }', async () => {
    const queryClient = cachesWith(post());
    const { transport, calls } = scriptedTransport({
      'PATCH /api/v1/posts/p1/comment-settings': { ok: true, data: { postId: 'p1', commentsDisabled: true } },
    });
    expect(await setCommentsDisabled({ postId: 'p1', disabled: true, deps: { source: 'gateway', transport, queryClient } })).toBe('done');
    expect(calls()[0]?.method).toBe('PATCH');
    expect(calls()[0]?.body).toEqual({ commentsDisabled: true });
    expect(readCommentsClosed(queryClient, 'p1')).toBe(true);
  });

  test('la fermeture se voit AVANT la réponse, jusque dans le fil gelé des Réels', async () => {
    const queryClient = cachesWith(post());
    let release: () => void = () => undefined;
    const { transport } = scriptedTransport({});
    transport.request = (() =>
      new Promise<ApiResult<unknown>>((resolve) => {
        release = () => resolve({ ok: true, data: { postId: 'p1', commentsDisabled: true } });
      })) as HttpTransport['request'];
    const pending = setCommentsDisabled({ postId: 'p1', disabled: true, deps: { source: 'gateway', transport, queryClient } });
    expect(readCommentsClosed(queryClient, 'p1')).toBe(true);
    expect(reelCard(queryClient).commentsDisabled).toBe(true);
    release();
    await pending;
  });

  test('un 403 rend l’état d’avant et se dit « forbidden »', async () => {
    const queryClient = cachesWith(post({ commentsDisabled: true }));
    const { transport } = scriptedTransport({
      'PATCH /api/v1/posts/p1/comment-settings': { ok: false, status: 403, error: 'Forbidden', code: 'FORBIDDEN' },
    });
    expect(await setCommentsDisabled({ postId: 'p1', disabled: false, deps: { source: 'gateway', transport, queryClient } })).toBe('forbidden');
    expect(readCommentsClosed(queryClient, 'p1')).toBe(true);
  });

  test('une panne réseau défait aussi, et se dit « offline »', async () => {
    const queryClient = cachesWith(post());
    const { transport } = scriptedTransport({});
    transport.request = (() => Promise.reject(new Error('network'))) as HttpTransport['request'];
    expect(await setCommentsDisabled({ postId: 'p1', disabled: true, deps: { source: 'gateway', transport, queryClient } })).toBe('offline');
    expect(readCommentsClosed(queryClient, 'p1')).toBe(false);
  });
});

describe('les stories et les diffusions', () => {
  const story: StoryFeedPost = { id: 's1', type: 'STORY', createdAt: '2026-11-01T10:00:00.000Z' };

  test('une story du corpus du lecteur se ferme comme une carte', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(STORY_FEED_QUERY_KEY, [story]);
    const { transport } = scriptedTransport({ 'PATCH /api/v1/posts/s1/comment-settings': { ok: true, data: { postId: 's1', commentsDisabled: true } } });
    await setCommentsDisabled({ postId: 's1', disabled: true, deps: { source: 'gateway', transport, queryClient } });
    expect(readCommentsClosed(queryClient, 's1')).toBe(true);
  });

  test('une publication diffusée pose son réglage ; un champ absent ne décide rien', () => {
    const queryClient = cachesWith(post());
    queryClient.setQueryData(STORY_FEED_QUERY_KEY, [story]);
    applyServedCommentSetting(queryClient, { id: 'p1', commentsDisabled: true });
    applyServedCommentSetting(queryClient, { id: 's1', commentsDisabled: true });
    expect(readCommentsClosed(queryClient, 'p1')).toBe(true);
    expect(readCommentsClosed(queryClient, 's1')).toBe(true);
    applyServedCommentSetting(queryClient, { id: 'p1' });
    expect(readCommentsClosed(queryClient, 'p1')).toBe(true);
  });
});
