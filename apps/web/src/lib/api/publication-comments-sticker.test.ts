import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { commentRepliesQueryKey } from './comment-replies';
import { postQueryKey } from './publication-detail';
import {
  commentsQueryKey,
  flattenCommentPages,
  performComment,
  type CommentInfiniteData,
  type PostComment,
} from './publication-comments';

/**
 * ENVOYER UN COMMENTAIRE-STICKER (#9080) — la MÊME forme que le sticker d'un
 * message : le descripteur dans le champ `sticker` du corps, l'image rendue
 * (déjà téléversée en `PostMedia`, contexte `comment`) dans `attachmentIds`.
 * La feuille de sélection (#9081) appelle ce port ; il n'a pas d'UI.
 */

const author = { id: 'u-me', username: 'moi', displayName: 'Moi', avatar: null };
const MEE = { templateId: 'mee.mee-coucou', slots: { line1: 'Salut' }, animation: 'wobble' } as const;
const PICTURE = { postMediaId: '507f1f77bcf86cd799439055', fileUrl: 'https://cdn.meeshy.me/s/abc.png', mimeType: 'image/png' };

const served = (id: string, patch: Partial<PostComment> = {}): PostComment => ({
  id,
  content: '',
  createdAt: '2026-10-02T12:00:00.000Z',
  author,
  ...patch,
});

/** Le transport BOUCHONNÉ — il retient le corps, et ne répond qu'à la demande. */
const pendingTransport = () => {
  const calls: { method: string; path: string; body?: unknown }[] = [];
  let release: (value: unknown) => void = () => undefined;
  const transport = {
    request: (request: { method: string; path: string; body?: unknown }) => {
      calls.push(request);
      return new Promise((resolve) => {
        release = resolve;
      });
    },
  };
  return { calls, transport, answer: (data: unknown) => release({ ok: true, status: 201, data }) };
};

const freshCaches = (postId: string) => {
  const queryClient = new QueryClient();
  queryClient.setQueryData(commentsQueryKey(postId), { pages: [{ comments: [], pagination: { limit: 20, hasMore: false, nextCursor: null } }], pageParams: [undefined] });
  queryClient.setQueryData(postQueryKey(postId), { id: postId, commentCount: 0 });
  return queryClient;
};

describe('performComment — un sticker', () => {
  test('un sticker SEUL part : descripteur dans `sticker`, image dans `attachmentIds`, aucun texte', async () => {
    const queryClient = freshCaches('p1');
    const { calls, transport, answer } = pendingTransport();
    const sending = performComment({
      postId: 'p1',
      content: '',
      author,
      sticker: { sticker: MEE, picture: PICTURE },
      deps: { source: 'gateway', transport: transport as never, queryClient },
    });
    await Promise.resolve();
    expect(calls[0]?.body).toEqual({ content: '', sticker: MEE, attachmentIds: [PICTURE.postMediaId] });

    const optimistic = flattenCommentPages(queryClient.getQueryData<CommentInfiniteData>(commentsQueryKey('p1')))[0];
    expect(optimistic?.sticker).toEqual(MEE);
    expect(optimistic?.media?.[0]?.fileUrl).toBe(PICTURE.fileUrl);

    answer(served('c-served', { sticker: MEE }));
    expect((await sending).ok).toBe(true);
  });

  test('un sticker accompagné de texte garde le texte', async () => {
    const queryClient = freshCaches('p1');
    const { calls, transport, answer } = pendingTransport();
    const sending = performComment({
      postId: 'p1',
      content: ' pour toi ',
      author,
      sticker: { sticker: { emoji: '🔥' } },
      deps: { source: 'gateway', transport: transport as never, queryClient },
    });
    await Promise.resolve();
    expect(calls[0]?.body).toEqual({ content: 'pour toi', sticker: { emoji: '🔥' } });
    answer(served('c-served'));
    await sending;
  });

  test('une RÉPONSE porte son sticker par le même corps, avec son `parentId`', async () => {
    const queryClient = freshCaches('p1');
    const { calls, transport, answer } = pendingTransport();
    const sending = performComment({
      postId: 'p1',
      content: '',
      author,
      parentId: 'c-root',
      sticker: { sticker: MEE, picture: PICTURE },
      deps: { source: 'gateway', transport: transport as never, queryClient },
    });
    await Promise.resolve();
    expect(calls[0]?.body).toEqual({ content: '', parentId: 'c-root', sticker: MEE, attachmentIds: [PICTURE.postMediaId] });
    const reply = flattenCommentPages(queryClient.getQueryData<CommentInfiniteData>(commentRepliesQueryKey('p1', 'c-root')))[0];
    expect(reply?.sticker).toEqual(MEE);
    answer(served('c-reply', { parentId: 'c-root' }));
    await sending;
  });

  test('sans sticker ni texte, rien ne part — inchangé', async () => {
    const queryClient = freshCaches('p1');
    const { calls, transport } = pendingTransport();
    const result = await performComment({
      postId: 'p1',
      content: '  ',
      author,
      deps: { source: 'gateway', transport: transport as never, queryClient },
    });
    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });
});
