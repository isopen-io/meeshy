import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import type { FeedPost } from './feed-pages';
import type { ApiResult, HttpRequest, HttpTransport } from './http';
import { commentsQueryKey, type CommentInfiniteData, type PostComment } from './publication-comments';
import { postQueryKey } from './publication-detail';
import {
  COMMENT_DELETE_FAILED_MESSAGE,
  COMMENT_EDIT_FAILED_MESSAGE,
  COMMENT_GESTURE_PENDING_MESSAGE,
  COMMENT_LIKE_FAILED_MESSAGE,
  performCommentDelete,
  performCommentEdit,
  performCommentLike,
  type CommentGestureDeps,
} from './comment-gestures';

/**
 * LES GESTES D'UNE RANGÉE DE COMMENTAIRE (#7133, première tranche de #7118) —
 * même forme que `feed-gestures.test.ts` : le cache bouge AVANT la réponse, et
 * un refus PERMANENT le remet EXACTEMENT où il était.
 *
 * Ce que ces témoins mesurent et qu'aucun rendu ne mesure : la VALEUR de
 * retour du cache après rollback. Un rollback « à peu près » — un compteur
 * remis à 0, une rangée réinsérée en tête — passerait tous les témoins de
 * composant et se verrait au premier usage.
 */

const comment = (partial: Partial<PostComment> = {}): PostComment => ({
  id: 'cm1',
  content: 'Superbe photo',
  createdAt: '2026-09-19T11:40:00.000Z',
  author: { id: 'u-noa', displayName: 'Noa Berger', username: 'noa' },
  likeCount: 0,
  ...partial,
});

const seeded = (pages: readonly (readonly PostComment[])[]): QueryClient => {
  const queryClient = new QueryClient();
  const data: CommentInfiniteData = {
    pages: pages.map((comments, i) => ({
      comments,
      pagination: { limit: 20, hasMore: i < pages.length - 1, nextCursor: i < pages.length - 1 ? `c${i}` : null },
    })),
    pageParams: pages.map((_, i) => (i === 0 ? undefined : `c${i - 1}`)),
  };
  queryClient.setQueryData(commentsQueryKey('p1'), data);
  return queryClient;
};

const rows = (queryClient: QueryClient): readonly PostComment[] =>
  (queryClient.getQueryData<CommentInfiniteData>(commentsQueryKey('p1'))?.pages ?? []).flatMap((p) => p.comments);

const cached = (queryClient: QueryClient, id = 'cm1'): PostComment | undefined => rows(queryClient).find((c) => c.id === id);

/** Un transport qui ENREGISTRE ce qu'on lui demande — `scripted` de `feed-gestures.test.ts`. */
const scripted = (respond: (req: HttpRequest) => Promise<ApiResult<unknown>>) => {
  const requests: HttpRequest[] = [];
  const transport = {
    request: (req: HttpRequest) => {
      requests.push(req);
      return respond(req);
    },
  } as unknown as HttpTransport;
  return { requests, transport };
};

const gatewayDeps = (queryClient: QueryClient, transport: HttpTransport): CommentGestureDeps => ({
  source: 'gateway',
  transport,
  queryClient,
});

const MUTATION_ID = /^cmid_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('performCommentLike — le compteur bouge AVANT la réponse, et REVIENT au refus', () => {
  test('le cœur et le compte basculent avant toute réponse réseau', async () => {
    const queryClient = seeded([[comment({ likeCount: 3 })]]);
    let release: (r: ApiResult<unknown>) => void = () => undefined;
    const { transport } = scripted(() => new Promise((resolve) => (release = resolve)));

    const pending = performCommentLike({ postId: 'p1', commentId: 'cm1', deps: gatewayDeps(queryClient, transport) });
    expect(cached(queryClient)?.isLikedByMe).toBe(true);
    expect(cached(queryClient)?.likeCount).toBe(4);

    release({ ok: true, data: { liked: true, likeCount: 4 } });
    expect(await pending).toEqual({ ok: true });
  });

  test('aimer ⇒ `POST /api/v1/posts/:postId/comments/:commentId/like`', async () => {
    const queryClient = seeded([[comment()]]);
    const { requests, transport } = scripted(async () => ({ ok: true, data: { liked: true, likeCount: 1 } }));

    await performCommentLike({ postId: 'p1', commentId: 'cm1', deps: gatewayDeps(queryClient, transport) });

    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe('POST');
    expect(requests[0]?.path).toBe('/api/v1/posts/p1/comments/cm1/like');
  });

  test('un commentaire DÉJÀ aimé ⇒ `DELETE …/like`, cœur vide, compte −1', async () => {
    const queryClient = seeded([[comment({ isLikedByMe: true, likeCount: 5 })]]);
    const { requests, transport } = scripted(async () => ({ ok: true, data: { liked: false, likeCount: 4 } }));

    await performCommentLike({ postId: 'p1', commentId: 'cm1', deps: gatewayDeps(queryClient, transport) });

    expect(requests[0]?.method).toBe('DELETE');
    expect(cached(queryClient)?.isLikedByMe).toBe(false);
    expect(cached(queryClient)?.likeCount).toBe(4);
  });

  test('le `likeCount` SERVI fait foi — il remplace l’estimation optimiste', async () => {
    const queryClient = seeded([[comment({ likeCount: 3 })]]);
    const { transport } = scripted(async () => ({ ok: true, data: { liked: true, likeCount: 11 } }));

    await performCommentLike({ postId: 'p1', commentId: 'cm1', deps: gatewayDeps(queryClient, transport) });

    expect(cached(queryClient)?.likeCount).toBe(11);
  });

  /* `isLikedByMe: false` EXPLICITE — c'est ce que la passerelle sert
     (`PostCommentService.ts:471-483`), et le rollback doit rendre la rangée
     TELLE QU'ELLE ÉTAIT, pas une rangée « à peu près pareille ». */
  test('404 ⇒ le compteur REVIENT à sa valeur EXACTE, et l’échec est annoncé', async () => {
    const queryClient = seeded([[comment({ isLikedByMe: false, likeCount: 3 })]]);
    const { transport } = scripted(async () => ({ ok: false, status: 404, error: 'Comment not found' }));

    const result = await performCommentLike({ postId: 'p1', commentId: 'cm1', deps: gatewayDeps(queryClient, transport) });

    expect(result).toEqual({ ok: false, message: COMMENT_LIKE_FAILED_MESSAGE });
    expect(cached(queryClient)?.likeCount).toBe(3);
    expect(cached(queryClient)?.isLikedByMe).toBe(false);
  });

  test('panne réseau ⇒ l’optimiste RESTE, et le geste non confirmé est ANNONCÉ', async () => {
    const queryClient = seeded([[comment({ likeCount: 1 })]]);
    const { transport } = scripted(() => Promise.reject(new TypeError('Failed to fetch')));

    const result = await performCommentLike({ postId: 'p1', commentId: 'cm1', deps: gatewayDeps(queryClient, transport) });

    expect(result).toEqual({ ok: true, notice: COMMENT_GESTURE_PENDING_MESSAGE });
    expect(cached(queryClient)?.likeCount).toBe(2);
  });

  /** Miroir `commentHeartInFlightIds` (`PostDetailViewModel.swift:494`). */
  test('un second tap pendant l’appel est ignoré — une seule requête part', async () => {
    const queryClient = seeded([[comment({ likeCount: 0 })]]);
    let release: (r: ApiResult<unknown>) => void = () => undefined;
    const { requests, transport } = scripted(() => new Promise((resolve) => (release = resolve)));
    const deps = gatewayDeps(queryClient, transport);

    const first = performCommentLike({ postId: 'p1', commentId: 'cm1', deps });
    expect(await performCommentLike({ postId: 'p1', commentId: 'cm1', deps })).toEqual({ ok: true });

    expect(requests).toHaveLength(1);
    expect(cached(queryClient)?.likeCount).toBe(1);
    release({ ok: true, data: { liked: true, likeCount: 1 } });
    await first;
  });

  test('une rangée de la SECONDE page est aimée elle aussi — le geste ne connaît pas les pages', async () => {
    const queryClient = seeded([[comment()], [comment({ id: 'cm9', likeCount: 2 })]]);
    const { transport } = scripted(async () => ({ ok: true, data: { liked: true, likeCount: 3 } }));

    await performCommentLike({ postId: 'p1', commentId: 'cm9', deps: gatewayDeps(queryClient, transport) });

    expect(cached(queryClient, 'cm9')?.likeCount).toBe(3);
    expect(cached(queryClient, 'cm1')?.likeCount).toBe(0);
  });
});

describe('performCommentEdit — le texte change AVANT la réponse, et REVIENT au refus', () => {
  test('le texte est remplacé avant toute réponse, puis le servi prend sa place', async () => {
    const queryClient = seeded([[comment({ content: 'Superbe photo' })]]);
    let release: (r: ApiResult<unknown>) => void = () => undefined;
    const { transport } = scripted(() => new Promise((resolve) => (release = resolve)));

    const pending = performCommentEdit({
      postId: 'p1',
      commentId: 'cm1',
      content: 'Superbe photo !',
      deps: gatewayDeps(queryClient, transport),
    });
    expect(cached(queryClient)?.content).toBe('Superbe photo !');

    release({ ok: true, data: comment({ content: 'Superbe photo !', originalLanguage: 'fr' }) });
    expect(await pending).toEqual({ ok: true });
    expect(cached(queryClient)?.originalLanguage).toBe('fr');
  });

  test('modifier ⇒ `PATCH …/comments/:commentId`, corps et en-tête d’idempotence de la passerelle', async () => {
    const queryClient = seeded([[comment()]]);
    const { requests, transport } = scripted(async () => ({ ok: true, data: comment({ content: 'Corrigé' }) }));

    await performCommentEdit({
      postId: 'p1',
      commentId: 'cm1',
      content: 'Corrigé',
      originalLanguage: 'fr',
      deps: gatewayDeps(queryClient, transport),
    });

    expect(requests[0]?.method).toBe('PATCH');
    expect(requests[0]?.path).toBe('/api/v1/posts/p1/comments/cm1');
    expect(requests[0]?.body).toEqual({ content: 'Corrigé', originalLanguage: 'fr' });
    expect(requests[0]?.headers?.['X-Client-Mutation-Id']).toMatch(MUTATION_ID);
  });

  test('403 (pas l’auteur) ⇒ le texte d’ORIGINE revient, et l’échec est annoncé', async () => {
    const queryClient = seeded([[comment({ content: 'Superbe photo' })]]);
    const { transport } = scripted(async () => ({ ok: false, status: 403, error: 'Not authorized', code: 'FORBIDDEN' }));

    const result = await performCommentEdit({
      postId: 'p1',
      commentId: 'cm1',
      content: 'Autre chose',
      deps: gatewayDeps(queryClient, transport),
    });

    expect(result).toEqual({ ok: false, message: COMMENT_EDIT_FAILED_MESSAGE });
    expect(cached(queryClient)?.content).toBe('Superbe photo');
  });

  test('un texte VIDE n’est pas un appel — la passerelle refuserait en 400 sans rien dire de précis', async () => {
    const queryClient = seeded([[comment({ content: 'Superbe photo' })]]);
    const { requests, transport } = scripted(async () => ({ ok: true, data: comment() }));

    const result = await performCommentEdit({
      postId: 'p1',
      commentId: 'cm1',
      content: '   ',
      deps: gatewayDeps(queryClient, transport),
    });

    expect(result).toEqual({ ok: false, message: COMMENT_EDIT_FAILED_MESSAGE });
    expect(requests).toHaveLength(0);
    expect(cached(queryClient)?.content).toBe('Superbe photo');
  });

  test('un texte INCHANGÉ n’est pas un appel non plus', async () => {
    const queryClient = seeded([[comment({ content: 'Superbe photo' })]]);
    const { requests, transport } = scripted(async () => ({ ok: true, data: comment() }));

    expect(
      await performCommentEdit({
        postId: 'p1',
        commentId: 'cm1',
        content: 'Superbe photo',
        deps: gatewayDeps(queryClient, transport),
      }),
    ).toEqual({ ok: true });
    expect(requests).toHaveLength(0);
  });

  test('panne réseau ⇒ le texte modifié RESTE, non confirmé et ANNONCÉ', async () => {
    const queryClient = seeded([[comment({ content: 'Superbe photo' })]]);
    const { transport } = scripted(() => Promise.reject(new TypeError('Failed to fetch')));

    expect(
      await performCommentEdit({
        postId: 'p1',
        commentId: 'cm1',
        content: 'Superbe photo !',
        deps: gatewayDeps(queryClient, transport),
      }),
    ).toEqual({ ok: true, notice: COMMENT_GESTURE_PENDING_MESSAGE });
    expect(cached(queryClient)?.content).toBe('Superbe photo !');
  });
});

describe('performCommentDelete — la rangée part AVANT la réponse, et REVIENT à sa place au refus', () => {
  const trois = () => [comment({ id: 'a' }), comment({ id: 'b' }), comment({ id: 'c' })];

  test('la rangée disparaît avant toute réponse, et le compteur de la publication suit', async () => {
    const queryClient = seeded([trois()]);
    queryClient.setQueryData<FeedPost>(postQueryKey('p1'), { id: 'p1', type: 'POST', createdAt: '', commentCount: 3 });
    let release: (r: ApiResult<unknown>) => void = () => undefined;
    const { transport } = scripted(() => new Promise((resolve) => (release = resolve)));

    const pending = performCommentDelete({ postId: 'p1', commentId: 'b', deps: gatewayDeps(queryClient, transport) });
    expect(rows(queryClient).map((c) => c.id)).toEqual(['a', 'c']);
    expect(queryClient.getQueryData<FeedPost>(postQueryKey('p1'))?.commentCount).toBe(2);

    release({ ok: true, data: { deleted: true } });
    expect(await pending).toEqual({ ok: true });
    expect(rows(queryClient).map((c) => c.id)).toEqual(['a', 'c']);
  });

  test('supprimer ⇒ `DELETE …/comments/:commentId`, avec l’en-tête d’idempotence', async () => {
    const queryClient = seeded([trois()]);
    const { requests, transport } = scripted(async () => ({ ok: true, data: { deleted: true } }));

    await performCommentDelete({ postId: 'p1', commentId: 'b', deps: gatewayDeps(queryClient, transport) });

    expect(requests[0]?.method).toBe('DELETE');
    expect(requests[0]?.path).toBe('/api/v1/posts/p1/comments/b');
    expect(requests[0]?.headers?.['X-Client-Mutation-Id']).toMatch(MUTATION_ID);
  });

  /** LE CŒUR DE CE LOT : réinsérer « quelque part » passerait pour un rollback. */
  test('403 ⇒ la rangée est RÉINSÉRÉE À SA PLACE, et le compteur remonte', async () => {
    const queryClient = seeded([trois()]);
    queryClient.setQueryData<FeedPost>(postQueryKey('p1'), { id: 'p1', type: 'POST', createdAt: '', commentCount: 3 });
    const { transport } = scripted(async () => ({ ok: false, status: 403, error: 'Not authorized' }));

    const result = await performCommentDelete({ postId: 'p1', commentId: 'b', deps: gatewayDeps(queryClient, transport) });

    expect(result).toEqual({ ok: false, message: COMMENT_DELETE_FAILED_MESSAGE });
    expect(rows(queryClient).map((c) => c.id)).toEqual(['a', 'b', 'c']);
    expect(queryClient.getQueryData<FeedPost>(postQueryKey('p1'))?.commentCount).toBe(3);
  });

  test('une rangée de la SECONDE page revient DANS SA PAGE, pas en tête du fil', async () => {
    const queryClient = seeded([[comment({ id: 'a' })], [comment({ id: 'x' }), comment({ id: 'y' })]]);
    const { transport } = scripted(async () => ({ ok: false, status: 404, error: 'Comment not found' }));

    await performCommentDelete({ postId: 'p1', commentId: 'x', deps: gatewayDeps(queryClient, transport) });

    const data = queryClient.getQueryData<CommentInfiniteData>(commentsQueryKey('p1'));
    expect(data?.pages[0]?.comments.map((c) => c.id)).toEqual(['a']);
    expect(data?.pages[1]?.comments.map((c) => c.id)).toEqual(['x', 'y']);
  });

  test('un second geste sur la MÊME rangée pendant l’appel est ignoré', async () => {
    const queryClient = seeded([trois()]);
    let release: (r: ApiResult<unknown>) => void = () => undefined;
    const { requests, transport } = scripted(() => new Promise((resolve) => (release = resolve)));
    const deps = gatewayDeps(queryClient, transport);

    const first = performCommentDelete({ postId: 'p1', commentId: 'b', deps });
    expect(await performCommentDelete({ postId: 'p1', commentId: 'b', deps })).toEqual({ ok: true });

    expect(requests).toHaveLength(1);
    release({ ok: true, data: { deleted: true } });
    await first;
  });
});

describe('source `fixtures` — les trois gestes basculent sans jamais toucher au transport', () => {
  const fixtureDeps = (queryClient: QueryClient): CommentGestureDeps => ({
    source: 'fixtures',
    transport: {} as HttpTransport,
    queryClient,
  });

  test('aimer, modifier et supprimer aboutissent hors réseau', async () => {
    const queryClient = seeded([[comment({ likeCount: 1 })]]);

    expect(await performCommentLike({ postId: 'p1', commentId: 'cm1', deps: fixtureDeps(queryClient) })).toEqual({ ok: true });
    expect(cached(queryClient)?.likeCount).toBe(2);

    expect(
      await performCommentEdit({ postId: 'p1', commentId: 'cm1', content: 'Corrigé', deps: fixtureDeps(queryClient) }),
    ).toEqual({ ok: true });
    expect(cached(queryClient)?.content).toBe('Corrigé');

    expect(await performCommentDelete({ postId: 'p1', commentId: 'cm1', deps: fixtureDeps(queryClient) })).toEqual({ ok: true });
    expect(cached(queryClient)).toBeUndefined();
  });
});
