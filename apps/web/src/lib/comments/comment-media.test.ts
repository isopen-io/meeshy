import { describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';

import { MAX_POST_MEDIA } from '@meeshy/shared/types/attachment';

import { postQueryKey } from '@/lib/api/publication-detail';
import { commentsQueryKey, flattenCommentPages, performComment, type CommentInfiniteData } from '@/lib/api/publication-comments';
import type { ApiResult } from '@/lib/api/http';
import type { PostMediaUploadResult } from '@/lib/api/post-media-upload';
import { pendingAttachmentOf } from '@/lib/send/attachments';

import { COMMENT_MEDIA_ACCEPT, acceptCommentFiles, uploadCommentMedia } from './comment-media';

/**
 * #9167 — UN COMMENTAIRE WEB JOINT UNE PHOTO OU UNE VIDÉO, par le MÊME contrat
 * que `CommentMediaUploader` iOS : chaque pièce part en TUS sous
 * `uploadContext: comment`, puis ses ids voyagent dans `attachmentIds` de
 * `POST /posts/:postId/comments` (`CreateCommentSchema`, borné à `MAX_POST_MEDIA`).
 */

const file = (name: string, type: string) => new File([new Uint8Array([1, 2, 3])], name, { type });

describe('acceptCommentFiles — la photothèque', () => {
  test('n’ouvre que les photos et les vidéos', () => {
    expect(COMMENT_MEDIA_ACCEPT).toBe('image/*,video/*');
  });

  test('garde images et vidéos, écarte le reste', () => {
    const accepted = acceptCommentFiles([], [file('a.jpg', 'image/jpeg'), file('b.pdf', 'application/pdf'), file('c.mp4', 'video/mp4'), file('d.mp3', 'audio/mpeg')]);
    expect(accepted.map((piece) => piece.name)).toEqual(['a.jpg', 'c.mp4']);
    expect(accepted.map((piece) => piece.kind)).toEqual(['image', 'video']);
  });

  test('s’ajoute à la sélection, jamais au-delà de MAX_POST_MEDIA', () => {
    const déjà = [pendingAttachmentOf(file('x.jpg', 'image/jpeg'))];
    const many = Array.from({ length: MAX_POST_MEDIA + 3 }, (_, i) => file(`p${i}.jpg`, 'image/jpeg'));
    const accepted = acceptCommentFiles(déjà, many);
    expect(accepted).toHaveLength(MAX_POST_MEDIA);
    expect(accepted[0]).toBe(déjà[0]);
  });
});

describe('uploadCommentMedia — chaque pièce en contexte « comment »', () => {
  test('téléverse dans l’ordre et rend les accusés', async () => {
    const seen: string[] = [];
    const upload = async (f: File): Promise<ApiResult<PostMediaUploadResult>> => {
      seen.push(f.name);
      return { ok: true, status: 201, data: { postMediaId: `pm-${f.name}`, fileUrl: `/u/${f.name}`, mimeType: f.type } };
    };
    const pending = [pendingAttachmentOf(file('a.jpg', 'image/jpeg')), pendingAttachmentOf(file('b.mp4', 'video/mp4'))];
    const result = await uploadCommentMedia(pending, upload);
    expect(seen).toEqual(['a.jpg', 'b.mp4']);
    expect(result).toEqual({
      ok: true,
      media: [
        { postMediaId: 'pm-a.jpg', fileUrl: '/u/a.jpg', mimeType: 'image/jpeg' },
        { postMediaId: 'pm-b.mp4', fileUrl: '/u/b.mp4', mimeType: 'video/mp4' },
      ],
    });
  });

  test('une seule pièce refusée : rien ne part, et les suivantes ne montent pas', async () => {
    const seen: string[] = [];
    const upload = async (f: File): Promise<ApiResult<PostMediaUploadResult>> => {
      seen.push(f.name);
      return { ok: false, status: 413, error: 'trop gros' };
    };
    const pending = [pendingAttachmentOf(file('a.jpg', 'image/jpeg')), pendingAttachmentOf(file('b.mp4', 'video/mp4'))];
    expect(await uploadCommentMedia(pending, upload)).toEqual({ ok: false });
    expect(seen).toEqual(['a.jpg']);
  });
});

describe('performComment — les médias joints', () => {
  const author = { id: 'u-me', username: 'moi', displayName: 'Moi', avatar: null };
  const PHOTO = { postMediaId: '507f1f77bcf86cd799439011', fileUrl: '/u/a.jpg', mimeType: 'image/jpeg' };
  const VIDEO = { postMediaId: '507f1f77bcf86cd799439012', fileUrl: '/u/b.mp4', mimeType: 'video/mp4' };

  const fresh = () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(commentsQueryKey('p1'), { pages: [{ comments: [], pagination: { limit: 20, hasMore: false, nextCursor: null } }], pageParams: [undefined] });
    queryClient.setQueryData(postQueryKey('p1'), { id: 'p1', commentCount: 0 });
    return queryClient;
  };

  test('un commentaire MÉDIA SEUL part : ses ids dans `attachmentIds`, la rangée provisoire les montre', async () => {
    const queryClient = fresh();
    const calls: { body?: unknown }[] = [];
    const transport = { request: (request: { body?: unknown }) => (calls.push(request), new Promise<never>(() => undefined)) };
    void performComment({ postId: 'p1', content: '', author, media: [PHOTO, VIDEO], deps: { source: 'gateway', transport: transport as never, queryClient } });
    await Promise.resolve();
    expect(calls[0]?.body).toEqual({ content: '', attachmentIds: [PHOTO.postMediaId, VIDEO.postMediaId] });
    const [optimistic] = flattenCommentPages(queryClient.getQueryData<CommentInfiniteData>(commentsQueryKey('p1')));
    expect(optimistic?.media?.map((m) => m.id)).toEqual([PHOTO.postMediaId, VIDEO.postMediaId]);
  });

  test('sans texte ni média ni sticker, rien ne part', async () => {
    const queryClient = fresh();
    const calls: unknown[] = [];
    const transport = { request: (request: unknown) => (calls.push(request), new Promise<never>(() => undefined)) };
    const result = await performComment({ postId: 'p1', content: '  ', author, media: [], deps: { source: 'gateway', transport: transport as never, queryClient } });
    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });
});
