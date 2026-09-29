import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { performCommentGesture } from './comment-gestures';
import { appendReply, commentRepliesQueryKey, dropReply, settleReply } from './comment-replies';
import { postQueryKey } from './publication-detail';
import {
  COMMENTS_PAGE_SIZE,
  COMMENT_FAILED_MESSAGE,
  applyCommentAdded,
  applyCommentDeleted,
  applyCommentLikeEvent,
  applyCommentTranslation,
  applyCommentUpdated,
  commentsQueryKey,
  flattenCommentPages,
  performComment,
  type CommentInfiniteData,
  type PostComment,
} from './publication-comments';

/**
 * **RÉPONDRE À UN COMMENTAIRE** (#8583) — la caisse des réponses d'une
 * racine, l'envoi optimiste d'une réponse, et les lois temps réel qui la
 * trouvent désormais. Miroir de `FeedCommentsSheet.submitComment` (iOS) :
 * `parentId` = la RACINE, la réponse en QUEUE (ordre ASC), trois compteurs
 * qui bougent ensemble.
 */
const author = { id: 'u-me', username: 'moi', displayName: 'Moi', avatar: null };

const comment = (id: string, patch: Partial<PostComment> = {}): PostComment => ({
  id,
  content: `texte ${id}`,
  createdAt: '2026-09-28T10:00:00.000Z',
  author,
  ...patch,
});

const pageData = (...comments: readonly PostComment[]): CommentInfiniteData => ({
  pages: [{ comments, pagination: { limit: COMMENTS_PAGE_SIZE, hasMore: false, nextCursor: null } }],
  pageParams: [undefined],
});

type Reply = { readonly ok: true; readonly data: unknown } | { readonly ok: false; readonly status?: number };

const transportOf = (reply: Reply) => {
  const calls: { method: string; path: string; body?: unknown }[] = [];
  return {
    calls,
    transport: {
      request: (request: { method: string; path: string; body?: unknown }) => {
        calls.push(request);
        return Promise.resolve(
          reply.ok
            ? { ok: true as const, status: 201, data: reply.data }
            : { ok: false as const, status: reply.status ?? 500, error: 'refus' },
        );
      },
    },
  };
};

const withThread = (patch: Partial<PostComment> = {}) => {
  const queryClient = new QueryClient();
  queryClient.setQueryData(commentsQueryKey('p1'), pageData(comment('root', { replyCount: 1, ...patch })));
  queryClient.setQueryData(postQueryKey('p1'), { id: 'p1', commentCount: 2 });
  return queryClient;
};

const repliesOf = (queryClient: QueryClient, parentId = 'root'): readonly PostComment[] =>
  flattenCommentPages(queryClient.getQueryData<CommentInfiniteData>(commentRepliesQueryKey('p1', parentId)));

const rootOf = (queryClient: QueryClient): PostComment | undefined =>
  flattenCommentPages(queryClient.getQueryData<CommentInfiniteData>(commentsQueryKey('p1'))).find((c) => c.id === 'root');

const postCountOf = (queryClient: QueryClient): number | undefined =>
  (queryClient.getQueryData(postQueryKey('p1')) as { readonly commentCount?: number } | undefined)?.commentCount;

describe('la caisse des réponses — même forme, même préfixe que le fil', () => {
  test('la clé est préfixée par celle du fil', () => {
    expect(commentRepliesQueryKey('p1', 'root').slice(0, 3)).toEqual([...commentsQueryKey('p1')]);
  });

  test('une réponse neuve va en QUEUE (ordre ASC) et n’est jamais doublée', () => {
    const data = appendReply(pageData(comment('r1')), comment('r2'));
    expect(flattenCommentPages(data).map((c) => c.id)).toEqual(['r1', 'r2']);
    expect(appendReply(data, comment('r2'))).toBe(data);
  });

  test('une caisse absente est AMORCÉE de la seule réponse posée', () => {
    expect(flattenCommentPages(appendReply(undefined, comment('r1'))).map((c) => c.id)).toEqual(['r1']);
  });

  test('le servi prend la place du provisoire ; s’il n’y est plus, il est ajouté, jamais perdu', () => {
    expect(flattenCommentPages(settleReply(pageData(comment('tmp')), 'tmp', comment('r9'))).map((c) => c.id)).toEqual(['r9']);
    expect(flattenCommentPages(settleReply(pageData(comment('r1')), 'tmp', comment('r9'))).map((c) => c.id)).toEqual(['r1', 'r9']);
    expect(flattenCommentPages(settleReply(pageData(comment('tmp'), comment('r9')), 'tmp', comment('r9'))).map((c) => c.id)).toEqual([
      'r9',
    ]);
  });

  test('dropReply retire le provisoire et garde l’identité quand rien ne change', () => {
    const data = pageData(comment('r1'));
    expect(dropReply(data, 'absent')).toBe(data);
    expect(flattenCommentPages(dropReply(pageData(comment('tmp'), comment('r1')), 'tmp')).map((c) => c.id)).toEqual(['r1']);
  });
});

describe('performComment avec `parentId` — la réponse se range sous sa racine', () => {
  test('optimiste en queue, `parentId` envoyé, trois compteurs montent, puis le servi prend la place', async () => {
    const queryClient = withThread();
    queryClient.setQueryData(commentRepliesQueryKey('p1', 'root'), pageData(comment('r1', { parentId: 'root' })));
    const { transport, calls } = transportOf({ ok: true, data: comment('r-served', { parentId: 'root' }) });

    const pending = performComment({
      postId: 'p1',
      content: 'je réponds',
      author,
      parentId: 'root',
      deps: { source: 'gateway', transport: transport as never, queryClient },
    });
    const optimistic = repliesOf(queryClient);
    expect(optimistic.map((c) => c.pending === true)).toEqual([false, true]);
    expect(rootOf(queryClient)?.replyCount).toBe(2);
    expect(postCountOf(queryClient)).toBe(3);
    expect(flattenCommentPages(queryClient.getQueryData<CommentInfiniteData>(commentsQueryKey('p1'))).map((c) => c.id)).toEqual([
      'root',
    ]);

    const result = await pending;
    expect(result.ok).toBe(true);
    expect(calls[0]?.path).toBe('/api/v1/posts/p1/comments');
    expect((calls[0]?.body as { readonly parentId?: string }).parentId).toBe('root');
    expect(repliesOf(queryClient).map((c) => c.id)).toEqual(['r1', 'r-served']);
  });

  test('un refus PERMANENT défait la réponse ET les trois compteurs', async () => {
    const queryClient = withThread();
    const { transport } = transportOf({ ok: false, status: 403 });

    const result = await performComment({
      postId: 'p1',
      content: 'je réponds',
      author,
      parentId: 'root',
      deps: { source: 'gateway', transport: transport as never, queryClient },
    });

    expect(result).toEqual({ ok: false, message: COMMENT_FAILED_MESSAGE });
    expect(repliesOf(queryClient)).toEqual([]);
    expect(rootOf(queryClient)?.replyCount).toBe(1);
    expect(postCountOf(queryClient)).toBe(2);
  });
});

describe('les gestes d’une RÉPONSE visent la caisse de sa racine', () => {
  test('aimer une réponse bascule son cœur dans la caisse des réponses', async () => {
    const queryClient = withThread();
    queryClient.setQueryData(commentRepliesQueryKey('p1', 'root'), pageData(comment('r1', { parentId: 'root', likeCount: 0 })));
    const { transport } = transportOf({ ok: true, data: { liked: true, likeCount: 1 } });

    const result = await performCommentGesture(
      { kind: 'like', postId: 'p1', commentId: 'r1', on: true, parentId: 'root' },
      { source: 'gateway', transport: transport as never, queryClient },
    );

    expect(result.ok).toBe(true);
    expect(repliesOf(queryClient)[0]?.isLikedByMe).toBe(true);
    expect(repliesOf(queryClient)[0]?.likeCount).toBe(1);
  });

  test('supprimer une réponse la retire et décompte sa racine', async () => {
    const queryClient = withThread();
    queryClient.setQueryData(commentRepliesQueryKey('p1', 'root'), pageData(comment('r1', { parentId: 'root' })));
    const { transport } = transportOf({ ok: true, data: { deleted: true } });

    await performCommentGesture(
      { kind: 'delete', postId: 'p1', commentId: 'r1', parentId: 'root' },
      { source: 'gateway', transport: transport as never, queryClient },
    );

    expect(repliesOf(queryClient)).toEqual([]);
    expect(rootOf(queryClient)?.replyCount).toBe(0);
    expect(postCountOf(queryClient)).toBe(1);
  });
});

describe('le temps réel trouve les réponses', () => {
  const added = (reply: PostComment, clientMutationId?: string) => ({
    postId: 'p1',
    commentCount: 3,
    comment: reply,
    ...(clientMutationId === undefined ? {} : { clientMutationId }),
  });

  test('`comment:added` d’une RÉPONSE rejoint sa racine, jamais le premier niveau', () => {
    const queryClient = withThread();
    queryClient.setQueryData(commentRepliesQueryKey('p1', 'root'), pageData(comment('r1', { parentId: 'root' })));

    applyCommentAdded(queryClient, added(comment('r2', { parentId: 'root' })));

    expect(repliesOf(queryClient).map((c) => c.id)).toEqual(['r1', 'r2']);
    expect(flattenCommentPages(queryClient.getQueryData<CommentInfiniteData>(commentsQueryKey('p1'))).map((c) => c.id)).toEqual([
      'root',
    ]);
    expect(rootOf(queryClient)?.replyCount).toBe(2);
    expect(postCountOf(queryClient)).toBe(3);
  });

  test('l’écho de SA propre réponse remplace le provisoire sans rien recompter', () => {
    const queryClient = withThread();
    queryClient.setQueryData(commentRepliesQueryKey('p1', 'root'), pageData(comment('cid_abc', { parentId: 'root', pending: true })));

    applyCommentAdded(queryClient, added(comment('r-served', { parentId: 'root' }), 'cmid_abc'));

    expect(repliesOf(queryClient).map((c) => c.id)).toEqual(['r-served']);
    expect(rootOf(queryClient)?.replyCount).toBe(1);
  });

  test('une caisse de réponses jamais ouverte n’est pas fabriquée, mais la racine compte', () => {
    const queryClient = withThread();
    applyCommentAdded(queryClient, added(comment('r2', { parentId: 'root' })));
    expect(queryClient.getQueryData(commentRepliesQueryKey('p1', 'root'))).toBeUndefined();
    expect(rootOf(queryClient)?.replyCount).toBe(2);
  });

  test('édition, cœur et traduction atteignent une réponse', () => {
    const queryClient = withThread();
    queryClient.setQueryData(commentRepliesQueryKey('p1', 'root'), pageData(comment('r1', { parentId: 'root' })));

    applyCommentUpdated(queryClient, { postId: 'p1', comment: comment('r1', { parentId: 'root', content: 'corrigé' }) });
    applyCommentLikeEvent(queryClient, { postId: 'p1', commentId: 'r1', userId: 'u-autre', emoji: '❤️', likeCount: 4 }, 'u-me', true);
    applyCommentTranslation(queryClient, {
      postId: 'p1',
      commentId: 'r1',
      language: 'en',
      translation: { text: 'fixed', translationModel: 'nllb-200', createdAt: '2026-09-28T10:01:00.000Z' },
    });

    const reply = repliesOf(queryClient)[0];
    expect(reply?.content).toBe('corrigé');
    expect(reply?.likeCount).toBe(4);
    expect(JSON.stringify(reply?.translations)).toContain('fixed');
  });

  test('`comment:deleted` d’une réponse la retire et décompte sa racine', () => {
    const queryClient = withThread();
    queryClient.setQueryData(commentRepliesQueryKey('p1', 'root'), pageData(comment('r1', { parentId: 'root' })));

    applyCommentDeleted(queryClient, { postId: 'p1', commentId: 'r1', commentCount: 1 });

    expect(repliesOf(queryClient)).toEqual([]);
    expect(rootOf(queryClient)?.replyCount).toBe(0);
    expect(postCountOf(queryClient)).toBe(1);
  });
});
