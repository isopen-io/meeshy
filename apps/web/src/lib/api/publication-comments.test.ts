import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { FEED_QUERY_KEY } from './feed';
import type { FeedInfiniteData, FeedPost } from './feed-pages';
import { postQueryKey } from './publication-detail';
import { REELS_QUERY_ROOT, reelsQueryKey } from './reels-query-key';
import { STORY_FEED_QUERY_KEY, storyPostQueryKey, type StoryFeedPost } from './stories';
import {
  COMMENTS_PAGE_SIZE,
  COMMENT_FAILED_MESSAGE,
  COMMENT_PENDING_MESSAGE,
  COMMENT_UNCONFIRMED_MESSAGE,
  applyCommentDeleted,
  applyCommentLikeEvent,
  applyCommentUpdated,
  commentsQueryKey,
  dropComment,
  flattenCommentPages,
  insertComment,
  isCommentDeleted,
  isCommentLikeEvent,
  isCommentUpdated,
  nextCommentCursor,
  performComment,
  replaceComment,
  setCommentCountServed,
  type CommentInfiniteData,
  type PostComment,
} from './publication-comments';

const author = { id: 'u-me', username: 'moi', displayName: 'Moi', avatar: null };

const comment = (id: string, patch: Partial<PostComment> = {}): PostComment => ({
  id,
  content: `texte ${id}`,
  createdAt: '2026-09-19T10:00:00.000Z',
  author,
  ...patch,
});

const pageData = (...pages: readonly (readonly PostComment[])[]): CommentInfiniteData => ({
  pages: pages.map((comments, i) => ({
    comments,
    pagination: { limit: COMMENTS_PAGE_SIZE, hasMore: i < pages.length - 1, nextCursor: i < pages.length - 1 ? `c${i}` : null },
  })),
  pageParams: pages.map((_, i) => (i === 0 ? undefined : `c${i - 1}`)),
});

describe('la pagination — `GET /posts/:postId/comments` (posts/comments.ts:66)', () => {
  test('les pages s’aplatissent dans l’ordre servi, sans doublon d’identifiant', () => {
    const data = pageData([comment('c1'), comment('c2')], [comment('c2'), comment('c3')]);
    expect(flattenCommentPages(data).map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);
  });

  test('`nextCursor` absent ⇒ plus de page — un curseur `null` ne se redemande pas', () => {
    expect(nextCommentCursor({ comments: [], pagination: { limit: 20, hasMore: false, nextCursor: null } })).toBeUndefined();
    expect(nextCommentCursor({ comments: [], pagination: { limit: 20, hasMore: true, nextCursor: 'k' } })).toBe('k');
    /* `hasMore` FAUX avec un curseur : la passerelle a tranché, on s'arrête —
       sinon la liste redemanderait sans fin la même dernière page. */
    expect(nextCommentCursor({ comments: [], pagination: { limit: 20, hasMore: false, nextCursor: 'k' } })).toBeUndefined();
  });
});

describe('le cache des commentaires — pur, immuable', () => {
  test('un commentaire s’insère EN TÊTE de la première page — la passerelle sert `createdAt desc`', () => {
    const data = pageData([comment('c1')]);
    const next = insertComment(data, comment('tmp', { pending: true }));
    expect(next?.pages[0]?.comments.map((c) => c.id)).toEqual(['tmp', 'c1']);
    /* Les pages SUIVANTES ne sont pas recopiées : leur identité survit, donc
       aucune rangée déjà peinte ne se re-rend (Zero Unnecessary Re-render). */
    const deux = pageData([comment('c1')], [comment('c2')]);
    const apres = insertComment(deux, comment('tmp'));
    expect(apres?.pages[1]).toBe(deux.pages[1]);
  });

  test('un cache VIDE reste vide — on n’invente pas une page que la liste n’a pas chargée', () => {
    expect(insertComment(undefined, comment('tmp'))).toBeUndefined();
  });

  test('le commentaire servi REMPLACE le provisoire à sa place, il ne s’ajoute pas à côté', () => {
    const data = insertComment(pageData([comment('c1')]), comment('tmp', { pending: true }));
    const next = replaceComment(data, 'tmp', comment('c9'));
    expect(next?.pages[0]?.comments.map((c) => c.id)).toEqual(['c9', 'c1']);
    expect(flattenCommentPages(next).find((c) => c.id === 'c9')?.pending).toBeUndefined();
  });

  test('un provisoire abandonné DISPARAÎT — il ne reste pas un fantôme que rien ne confirmera', () => {
    const data = insertComment(pageData([comment('c1')]), comment('tmp', { pending: true }));
    expect(dropComment(data, 'tmp')?.pages[0]?.comments.map((c) => c.id)).toEqual(['c1']);
  });
});

/** Le transport BOUCHONNÉ — la forme d'`ApiResult`, jamais un objet inventé. */
const transportOf = (reply: { readonly ok: boolean; readonly status?: number; readonly data?: unknown }) => {
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

const withCaches = (postId: string) => {
  const queryClient = new QueryClient();
  queryClient.setQueryData(commentsQueryKey(postId), pageData([comment('c1')]));
  queryClient.setQueryData(postQueryKey(postId), { id: postId, commentCount: 1 });
  return queryClient;
};

const countOf = (queryClient: QueryClient, postId: string): number | undefined =>
  (queryClient.getQueryData(postQueryKey(postId)) as { readonly commentCount?: number } | undefined)?.commentCount;

/** Ce que le RAIL du lecteur de stories lit — `currentStory.commentCount`,
 * servi par `STORY_FEED_QUERY_KEY`, jamais par `postQueryKey`. */
const railCountOf = (queryClient: QueryClient, storyId: string): number | null | undefined =>
  queryClient.getQueryData<readonly StoryFeedPost[]>(STORY_FEED_QUERY_KEY)?.find((s) => s.id === storyId)?.commentCount;

const story = (id: string, commentCount: number | null): StoryFeedPost => ({
  id,
  type: 'STORY',
  createdAt: '2026-09-19T09:00:00.000Z',
  commentCount,
});

describe('performComment — optimiste, puis l’issue (`POST /posts/:postId/comments`, :179)', () => {
  test('le commentaire APPARAÎT avant le réseau et le compteur monte dans le même geste', async () => {
    const queryClient = withCaches('p1');
    const { transport, calls } = transportOf({ ok: true, data: comment('c-served') });

    const result = await performComment({
      postId: 'p1',
      content: 'bonjour',
      author,
      deps: { source: 'gateway', transport: transport as never, queryClient },
    });

    expect(result.ok).toBe(true);
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.path).toBe('/api/v1/posts/p1/comments');
    expect((calls[0]?.body as { readonly content: string }).content).toBe('bonjour');
    const ids = flattenCommentPages(queryClient.getQueryData<CommentInfiniteData>(commentsQueryKey('p1'))).map((c) => c.id);
    expect(ids).toEqual(['c-served', 'c1']);
    expect(countOf(queryClient, 'p1')).toBe(2);
  });

  test('un REFUS PERMANENT défait tout — le texte s’en va ET le compteur redescend', async () => {
    const queryClient = withCaches('p1');
    const { transport } = transportOf({ ok: false, status: 403 });

    const result = await performComment({
      postId: 'p1',
      content: 'bonjour',
      author,
      deps: { source: 'gateway', transport: transport as never, queryClient },
    });

    expect(result).toEqual({ ok: false, message: COMMENT_FAILED_MESSAGE });
    expect(flattenCommentPages(queryClient.getQueryData<CommentInfiniteData>(commentsQueryKey('p1'))).map((c) => c.id)).toEqual(['c1']);
    expect(countOf(queryClient, 'p1')).toBe(1);
  });

  /** UN 503 EST UNE PANNE DE PASSERELLE, PAS UNE COUPURE RÉSEAU
   * (revue-correction #7135, défaut majeur 4) — `comment.send.pending` NOMME
   * le réseau, et l'annoncer ici envoyait l'utilisateur vérifier son wifi
   * alors que sa connexion était bonne. La distinction se mesure sur un rang
   * AUTRE que le hors-ligne, seul cas couvert jusqu'ici. */
  test('une panne PASSAGÈRE garde l’optimiste et l’ANNONCE — sans accuser le réseau', async () => {
    const queryClient = withCaches('p1');
    const { transport } = transportOf({ ok: false, status: 503 });

    const result = await performComment({
      postId: 'p1',
      content: 'bonjour',
      author,
      deps: { source: 'gateway', transport: transport as never, queryClient },
    });

    expect(result).toEqual({ ok: true, notice: COMMENT_UNCONFIRMED_MESSAGE });
    expect(COMMENT_PENDING_MESSAGE).not.toBe(COMMENT_UNCONFIRMED_MESSAGE);
    const servis = flattenCommentPages(queryClient.getQueryData<CommentInfiniteData>(commentsQueryKey('p1')));
    expect(servis).toHaveLength(2);
    expect(servis[0]?.pending).toBe(true);
    expect(countOf(queryClient, 'p1')).toBe(2);
  });

  test('un contenu VIDE ne part pas — aucun appel, aucun optimiste', async () => {
    const queryClient = withCaches('p1');
    const { transport, calls } = transportOf({ ok: true, data: comment('c-served') });

    const result = await performComment({
      postId: 'p1',
      content: '   ',
      author,
      deps: { source: 'gateway', transport: transport as never, queryClient },
    });

    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(0);
    expect(countOf(queryClient, 'p1')).toBe(1);
  });

  test('la liste JAMAIS OUVERTE laisse quand même monter le compteur de la publication', async () => {
    /* Le rail d'une story commente sans que la liste ait été montée : sans
       ce cas, le compteur du rail resterait à son ancienne valeur pendant que
       le commentaire est bien parti. */
    const queryClient = new QueryClient();
    queryClient.setQueryData(postQueryKey('p2'), { id: 'p2', commentCount: 4 });
    const { transport } = transportOf({ ok: true, data: comment('c-served') });

    await performComment({
      postId: 'p2',
      content: 'salut',
      author,
      deps: { source: 'gateway', transport: transport as never, queryClient },
    });

    expect(countOf(queryClient, 'p2')).toBe(5);
  });
});

describe('le compteur bouge LÀ OÙ LE RAIL LE LIT — `STORY_FEED_QUERY_KEY` (#7112, revue)', () => {
  /* Le témoin voisin (« la liste JAMAIS OUVERTE… ») mesure `postQueryKey` :
     il verdissait pendant que la pastille du rail restait au chiffre d'avant,
     parce que le rail lit un AUTRE corpus. Ces vecteurs mesurent celui-là. */

  test('commenter une story monte le compteur du CORPUS DES STORIES, celui que le rail lit', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(STORY_FEED_QUERY_KEY, [story('st-1', 3), story('st-2', 9)]);
    const { transport } = transportOf({ ok: true, data: comment('c-served') });

    await performComment({
      postId: 'st-1',
      content: 'joli',
      author,
      deps: { source: 'gateway', transport: transport as never, queryClient },
    });

    expect(railCountOf(queryClient, 'st-1')).toBe(4);
    /* La story VOISINE garde son identité : aucune rangée du plateau ne se
       re-rend pour un commentaire qui ne la concerne pas. */
    expect(railCountOf(queryClient, 'st-2')).toBe(9);
  });

  test('un REFUS PERMANENT redescend le compteur du rail — jamais une pastille menteuse derrière un fil vide', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(STORY_FEED_QUERY_KEY, [story('st-1', 3)]);
    const { transport } = transportOf({ ok: false, status: 403 });

    const result = await performComment({
      postId: 'st-1',
      content: 'joli',
      author,
      deps: { source: 'gateway', transport: transport as never, queryClient },
    });

    expect(result).toEqual({ ok: false, message: COMMENT_FAILED_MESSAGE });
    expect(railCountOf(queryClient, 'st-1')).toBe(3);
  });

  test('`commentCount` ABSENT du corpus part de zéro — la passerelle le sert `null` quand personne n’a commenté', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(STORY_FEED_QUERY_KEY, [story('st-1', null)]);
    const { transport } = transportOf({ ok: true, data: comment('c-served') });

    await performComment({
      postId: 'st-1',
      content: 'le premier',
      author,
      deps: { source: 'gateway', transport: transport as never, queryClient },
    });

    expect(railCountOf(queryClient, 'st-1')).toBe(1);
  });

  test('une publication ÉTRANGÈRE au corpus des stories le laisse INTACT — pas de ligne fabriquée', async () => {
    const queryClient = new QueryClient();
    const corpus = [story('st-1', 3)];
    queryClient.setQueryData(STORY_FEED_QUERY_KEY, corpus);
    const { transport } = transportOf({ ok: true, data: comment('c-served') });

    await performComment({
      postId: 'p-du-flux',
      content: 'ailleurs',
      author,
      deps: { source: 'gateway', transport: transport as never, queryClient },
    });

    expect(queryClient.getQueryData(STORY_FEED_QUERY_KEY)).toBe(corpus);
  });
});

/**
 * **`comment:updated` / `comment:deleted` / `comment:liked` / `comment:unliked`
 * (#7227, W8)** — LE FIL DE COMMENTAIRES SUIT LA PASSERELLE EN DIRECT, sur
 * TOUTES les pages (`mapAllPages`, contrairement à `mapFirstPage` qui ne sert
 * que l'insertion en tête d'une rangée neuve).
 */
const feedWithPost = (post: Partial<FeedPost>): FeedInfiniteData => ({
  pages: [{ posts: [{ id: 'p1', type: 'POST', createdAt: '2026-09-19T09:00:00.000Z', ...post }], pagination: { limit: 20, hasMore: false, nextCursor: null } }],
  pageParams: [undefined],
});

describe('isCommentUpdated / isCommentDeleted / isCommentLikeEvent — les gardes de forme', () => {
  test('acceptent une charge complète, refusent ce qui manque', () => {
    expect(isCommentUpdated({ postId: 'p1', comment: comment('c1') })).toBe(true);
    for (const charge of [null, {}, { postId: 'p1' }, { postId: 'p1', comment: { id: 'c1' } }]) {
      expect(isCommentUpdated(charge)).toBe(false);
    }

    expect(isCommentDeleted({ postId: 'p1', commentId: 'c1', commentCount: 0 })).toBe(true);
    for (const charge of [null, {}, { postId: 'p1', commentId: 'c1' }, { postId: 'p1', commentCount: 0 }]) {
      expect(isCommentDeleted(charge)).toBe(false);
    }

    const like = { postId: 'p1', commentId: 'c1', userId: 'u-1', emoji: '❤️', likeCount: 2 };
    expect(isCommentLikeEvent(like)).toBe(true);
    for (const charge of [null, {}, { ...like, likeCount: 'deux' }, { ...like, userId: 7 }]) {
      expect(isCommentLikeEvent(charge)).toBe(false);
    }
  });
});

describe('applyCommentUpdated — l’édition REMPLACE la ligne, sur TOUTES les pages', () => {
  test('une charge malformée ne change rien, et ne lève pas', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(commentsQueryKey('p1'), pageData([comment('c1', { content: 'intact' })]));

    for (const charge of [null, {}, { postId: 'p1' }]) {
      expect(() => applyCommentUpdated(queryClient, charge)).not.toThrow();
    }
    expect(flattenCommentPages(queryClient.getQueryData(commentsQueryKey('p1')))[0]?.content).toBe('intact');
  });

  test('remplace la ligne EN PLACE, même sur la DEUXIÈME page', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(commentsQueryKey('p1'), pageData([comment('c1')], [comment('c2', { content: 'avant' })]));

    applyCommentUpdated(queryClient, { postId: 'p1', comment: comment('c2', { content: 'après édition' }) });

    const rows = flattenCommentPages(queryClient.getQueryData(commentsQueryKey('p1')));
    expect(rows.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(rows.find((c) => c.id === 'c2')?.content).toBe('après édition');
  });

  test('une liste JAMAIS OUVERTE n’est pas fabriquée', () => {
    const queryClient = new QueryClient();
    expect(() => applyCommentUpdated(queryClient, { postId: 'p1', comment: comment('c1') })).not.toThrow();
    expect(queryClient.getQueryData(commentsQueryKey('p1'))).toBeUndefined();
  });
});

describe('applyCommentDeleted — la ligne QUITTE le fil, le compte ABSOLU se pose aux QUATRE caisses', () => {
  test('une charge malformée ne change rien, et ne lève pas', () => {
    const queryClient = withCaches('p1');
    for (const charge of [null, {}, { postId: 'p1', commentId: 'c1' }]) {
      expect(() => applyCommentDeleted(queryClient, charge)).not.toThrow();
    }
    expect(flattenCommentPages(queryClient.getQueryData(commentsQueryKey('p1')))).toHaveLength(1);
  });

  test('retire la cible ET les descendants nommés, sur TOUTES les pages', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(commentsQueryKey('p1'), pageData([comment('c1'), comment('c2')], [comment('c3')]));

    applyCommentDeleted(queryClient, { postId: 'p1', commentId: 'c1', deletedCommentIds: ['c1', 'c3'], commentCount: 1 });

    const rows = flattenCommentPages(queryClient.getQueryData(commentsQueryKey('p1')));
    expect(rows.map((c) => c.id)).toEqual(['c2']);
  });

  test('un id inconnu ne retire rien', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(commentsQueryKey('p1'), pageData([comment('c1')]));

    applyCommentDeleted(queryClient, { postId: 'p1', commentId: 'c-inconnu', commentCount: 1 });

    expect(flattenCommentPages(queryClient.getQueryData(commentsQueryKey('p1'))).map((c) => c.id)).toEqual(['c1']);
  });

  test('pose le compte ABSOLU sur les QUATRE caisses (#7135 + #7227 pour les Réels)', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(FEED_QUERY_KEY, feedWithPost({ commentCount: 4 }));
    queryClient.setQueriesData<FeedInfiniteData>({ queryKey: REELS_QUERY_ROOT }, () => feedWithPost({ commentCount: 4 }));
    queryClient.setQueryData(reelsQueryKey(), feedWithPost({ commentCount: 4 }));
    queryClient.setQueryData(postQueryKey('p1'), { id: 'p1', commentCount: 4 });
    queryClient.setQueryData(STORY_FEED_QUERY_KEY, [story('p1', 4)]);
    queryClient.setQueryData(commentsQueryKey('p1'), pageData([comment('c1')]));

    applyCommentDeleted(queryClient, { postId: 'p1', commentId: 'c1', commentCount: 3 });

    expect(queryClient.getQueryData<FeedInfiniteData>(FEED_QUERY_KEY)?.pages[0]?.posts[0]?.commentCount).toBe(3);
    expect(queryClient.getQueryData<FeedInfiniteData>(reelsQueryKey())?.pages[0]?.posts[0]?.commentCount).toBe(3);
    expect(countOf(queryClient, 'p1')).toBe(3);
    expect(railCountOf(queryClient, 'p1')).toBe(3);
  });

  test('un post absent d’une racine y est laissé tel quel — rien n’est fabriqué', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(commentsQueryKey('p1'), pageData([comment('c1')]));

    expect(() => applyCommentDeleted(queryClient, { postId: 'p1', commentId: 'c1', commentCount: 0 })).not.toThrow();
    expect(queryClient.getQueryData(FEED_QUERY_KEY)).toBeUndefined();
    expect(queryClient.getQueryData(REELS_QUERY_ROOT)).toBeUndefined();
  });
});

describe('applyCommentLikeEvent — le compte ABSOLU, `isLikedByMe` réservé au LECTEUR', () => {
  test('une charge malformée ne change rien, et ne lève pas', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(commentsQueryKey('p1'), pageData([comment('c1', { likeCount: 1, isLikedByMe: false })]));

    for (const charge of [null, {}, { postId: 'p1', commentId: 'c1' }]) {
      expect(() => applyCommentLikeEvent(queryClient, charge, 'u-viewer', true)).not.toThrow();
    }
    expect(flattenCommentPages(queryClient.getQueryData(commentsQueryKey('p1')))[0]?.likeCount).toBe(1);
  });

  test('la réaction d’un AUTRE pose le compte servi, sans toucher MON cœur', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(commentsQueryKey('p1'), pageData([comment('c1', { likeCount: 1, isLikedByMe: false })]));

    applyCommentLikeEvent(queryClient, { postId: 'p1', commentId: 'c1', userId: 'u-other', emoji: '❤️', likeCount: 4 }, 'u-viewer', true);

    const row = flattenCommentPages(queryClient.getQueryData(commentsQueryKey('p1')))[0];
    expect(row?.likeCount).toBe(4);
    expect(row?.isLikedByMe).toBe(false);
  });

  test('ma PROPRE réaction (autre appareil) pose le compte ET mon cœur, sur TOUTES les pages', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(commentsQueryKey('p1'), pageData([comment('c1', { likeCount: 1, isLikedByMe: false })], [comment('c2', { likeCount: 0, isLikedByMe: false })]));

    applyCommentLikeEvent(queryClient, { postId: 'p1', commentId: 'c1', userId: 'u-viewer', emoji: '❤️', likeCount: 2 }, 'u-viewer', true);

    const rows = flattenCommentPages(queryClient.getQueryData(commentsQueryKey('p1')));
    expect(rows.find((c) => c.id === 'c1')?.isLikedByMe).toBe(true);
    expect(rows.find((c) => c.id === 'c1')?.likeCount).toBe(2);
    /* La ligne voisine garde son identité — aucune rangée qu'elle ne concerne
       pas ne se re-rend. */
    expect(rows.find((c) => c.id === 'c2')?.isLikedByMe).toBe(false);
  });

  test('`comment:unliked` du lecteur VIDE son cœur', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(commentsQueryKey('p1'), pageData([comment('c1', { likeCount: 2, isLikedByMe: true })]));

    applyCommentLikeEvent(queryClient, { postId: 'p1', commentId: 'c1', userId: 'u-viewer', emoji: '❤️', likeCount: 1 }, 'u-viewer', false);

    const row = flattenCommentPages(queryClient.getQueryData(commentsQueryKey('p1')))[0];
    expect(row?.isLikedByMe).toBe(false);
    expect(row?.likeCount).toBe(1);
  });
});

describe('setCommentCountServed — le jumeau ABSOLU de `shiftCommentCount` (delta)', () => {
  test('pose le compte sur les QUATRE caisses, y compris les Réels (#7227)', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(FEED_QUERY_KEY, feedWithPost({ commentCount: 1 }));
    queryClient.setQueryData(reelsQueryKey('seed-x'), feedWithPost({ commentCount: 1 }));
    queryClient.setQueryData(postQueryKey('p1'), { id: 'p1', commentCount: 1 });
    queryClient.setQueryData(STORY_FEED_QUERY_KEY, [story('p1', 1)]);

    setCommentCountServed(queryClient, 'p1', 7);

    expect(queryClient.getQueryData<FeedInfiniteData>(FEED_QUERY_KEY)?.pages[0]?.posts[0]?.commentCount).toBe(7);
    expect(queryClient.getQueryData<FeedInfiniteData>(reelsQueryKey('seed-x'))?.pages[0]?.posts[0]?.commentCount).toBe(7);
    expect(countOf(queryClient, 'p1')).toBe(7);
    expect(railCountOf(queryClient, 'p1')).toBe(7);
  });

  test('une racine sans ce post reste INTACTE — MÊME référence', () => {
    const queryClient = new QueryClient();
    const data = feedWithPost({ id: 'p-autre', commentCount: 1 });
    queryClient.setQueryData(FEED_QUERY_KEY, data);

    setCommentCountServed(queryClient, 'p1', 9);

    expect(queryClient.getQueryData(FEED_QUERY_KEY)).toBe(data);
  });
});

/**
 * **CE QUI APPARTIENT AU LECTEUR NE VIENT PAS DU SERVEUR** (revue-correction
 * W8, #7227) — la loi est déjà écrite pour les PUBLICATIONS
 * (`feed-realtime.ts#merged`, « un auteur corrigeant une faute de frappe
 * dé-remplirait le cœur de tous ceux qui avaient aimé »), et
 * `comment:updated` la rejouait à l'envers sur les COMMENTAIRES.
 *
 * La charge diffusée est MESURÉE : `PostCommentService.getCommentAsUpdateResult`
 * (`services/gateway/src/services/PostCommentService.ts:375-399`) sélectionne
 * `likeCount` mais NI `isLikedByMe` NI `currentUserReactions` — un événement
 * envoyé à tout le fil ne peut pas les porter justes pour chacun. Remplacer la
 * rangée EN BLOC effaçait donc le cœur de chaque lecteur à chaque édition.
 */
describe('applyCommentUpdated — l’édition d’un AUTRE ne touche pas ce qui est MIEN', () => {
  test('mon cœur SURVIT à l’édition — la charge ne le porte pas', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(commentsQueryKey('p1'), pageData([comment('c1', { content: 'avant', likeCount: 5, isLikedByMe: true })]));

    applyCommentUpdated(queryClient, { postId: 'p1', comment: comment('c1', { content: 'après édition', likeCount: 5 }) });

    const row = flattenCommentPages(queryClient.getQueryData(commentsQueryKey('p1')))[0];
    expect(row?.content).toBe('après édition');
    expect(row?.isLikedByMe).toBe(true);
  });

  test('un `false` TENU est une réponse du lecteur, pas une absence — il survit aussi', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(commentsQueryKey('p1'), pageData([comment('c1', { isLikedByMe: false })]));

    applyCommentUpdated(queryClient, { postId: 'p1', comment: comment('c1', { content: 'corrigé' }) });

    expect(flattenCommentPages(queryClient.getQueryData(commentsQueryKey('p1')))[0]?.isLikedByMe).toBe(false);
  });

  test('mes réactions emoji survivent elles aussi', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(commentsQueryKey('p1'), pageData([comment('c1', { currentUserReactions: ['🔥'] })]));

    applyCommentUpdated(queryClient, { postId: 'p1', comment: comment('c1', { content: 'corrigé' }) });

    expect(flattenCommentPages(queryClient.getQueryData(commentsQueryKey('p1')))[0]?.currentUserReactions).toEqual(['🔥']);
  });

  test('une page SANS la ligne éditée garde son IDENTITÉ — elle ne se re-rend pas', () => {
    const queryClient = new QueryClient();
    const data = pageData([comment('c1')], [comment('c2', { content: 'avant' })]);
    queryClient.setQueryData(commentsQueryKey('p1'), data);

    applyCommentUpdated(queryClient, { postId: 'p1', comment: comment('c2', { content: 'après' }) });

    const après = queryClient.getQueryData<CommentInfiniteData>(commentsQueryKey('p1'));
    expect(après?.pages[0]).toBe(data.pages[0]);
    expect(après?.pages[1]).not.toBe(data.pages[1]);
  });
});

/**
 * **LA CINQUIÈME CAISSE** — `storyPostQueryKey`, le cache de la TROISIÈME
 * MARCHE du lecteur de stories. Le doc-comment de `shiftCommentCount` en
 * énumérait QUATRE, trouvées l'une après l'autre en demandant « qui
 * l'AFFICHE ? ». La réponse a changé une fois de plus : une story ouverte par
 * LIEN, hors des 50 plus récentes, n'est dans AUCUN des quatre — le lecteur
 * la tient de `useStoryPost` et la fusionne dans ses groupes
 * (`routes/story.tsx`). Le rail peint donc sa pastille depuis ce cache-là.
 *
 * Symptôme, identique à celui que #7112 a corrigé un cache plus haut : on
 * commente la story d'un lien, la ligne apparaît dans le fil, et la pastille
 * du rail reste au chiffre d'avant — puis y reste à la fermeture du fil.
 */
const railLinkCountOf = (queryClient: QueryClient, storyId: string): number | null | undefined =>
  queryClient.getQueryData<StoryFeedPost>(storyPostQueryKey(storyId))?.commentCount;

describe('le compteur bouge AUSSI sur la story ouverte par LIEN — `storyPostQueryKey`', () => {
  test('commenter une story de lien monte la pastille que le rail lit', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(storyPostQueryKey('st-lien'), story('st-lien', 3));
    const { transport } = transportOf({ ok: true, data: comment('c-served') });

    await performComment({
      postId: 'st-lien',
      content: 'joli',
      author,
      deps: { source: 'gateway', transport: transport as never, queryClient },
    });

    expect(railLinkCountOf(queryClient, 'st-lien')).toBe(4);
  });

  test('un REFUS PERMANENT y redescend le compteur comme ailleurs', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(storyPostQueryKey('st-lien'), story('st-lien', 3));
    let refuse: (r: unknown) => void = () => undefined;
    const transport = { request: () => new Promise((resolve) => (refuse = resolve)) };

    const vol = performComment({
      postId: 'st-lien',
      content: 'joli',
      author,
      deps: { source: 'gateway', transport: transport as never, queryClient },
    });

    /* L'optimiste EST posé — sans ce relevé À MI-VOL, le témoin verdirait sur
       un cache que rien n'a jamais touché. */
    expect(railLinkCountOf(queryClient, 'st-lien')).toBe(4);

    refuse({ ok: false, status: 403, error: 'refus' });
    expect(await vol).toEqual({ ok: false, message: COMMENT_FAILED_MESSAGE });
    expect(railLinkCountOf(queryClient, 'st-lien')).toBe(3);
  });

  test('une publication que ce cache ne porte PAS n’y fabrique aucune ligne', async () => {
    const queryClient = new QueryClient();
    const { transport } = transportOf({ ok: true, data: comment('c-served') });

    await performComment({
      postId: 'p-du-flux',
      content: 'ailleurs',
      author,
      deps: { source: 'gateway', transport: transport as never, queryClient },
    });

    expect(queryClient.getQueryData(storyPostQueryKey('p-du-flux'))).toBeUndefined();
  });
});

/**
 * **LE JUMEAU ABSOLU DOIT TENIR LES MÊMES CAISSES QUE LE JUMEAU DELTA**
 * (revue-correction W8, #7227). `setCommentCountServed` a été écrit comme
 * « la jumelle de `shiftCommentCount` », et son doc-comment en annonçait
 * QUATRE — le chiffre du TITRE de `shiftCommentCount`, resté au compte
 * d'avant #7120 pendant que son ÉNUMÉRATION en porte CINQ. La cinquième,
 * `storyPostQueryKey`, est justement celle qu'aucune des quatre autres
 * n'atteint : une story ouverte par LIEN, hors des 50 plus récentes, n'est
 * QUE là (`routes/story.tsx` la tient de `useStoryPost` et la fusionne dans
 * ses groupes ; le rail peint sa pastille depuis ce cache).
 *
 * Symptôme sans ce témoin : quelqu'un supprime son commentaire sous la story
 * qu'on regarde par lien, la ligne disparaît du fil, **et la pastille du rail
 * reste au chiffre d'avant** — exactement le défaut que #7120 avait payé sur
 * la voie ADDITIVE, rejoué sur la voie SERVIE.
 *
 * Un TITRE se recompte, il ne se cite pas : c'est l'énumération qui fait foi.
 */
describe('setCommentCountServed — la CINQUIÈME caisse, la story ouverte par LIEN', () => {
  test('pose le compte ABSOLU sur `storyPostQueryKey`', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(storyPostQueryKey('st-lien'), story('st-lien', 3));

    setCommentCountServed(queryClient, 'st-lien', 9);

    expect(railLinkCountOf(queryClient, 'st-lien')).toBe(9);
  });

  test('`comment:deleted` sur une story de lien redescend la pastille du rail', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(storyPostQueryKey('st-lien'), story('st-lien', 4));
    queryClient.setQueryData(commentsQueryKey('st-lien'), pageData([comment('c1')]));

    applyCommentDeleted(queryClient, { postId: 'st-lien', commentId: 'c1', commentCount: 3 });

    expect(railLinkCountOf(queryClient, 'st-lien')).toBe(3);
    expect(flattenCommentPages(queryClient.getQueryData(commentsQueryKey('st-lien')))).toEqual([]);
  });

  test('une story que ce cache ne porte PAS n’y est pas fabriquée', () => {
    const queryClient = new QueryClient();

    setCommentCountServed(queryClient, 'p-du-flux', 2);

    expect(queryClient.getQueryData(storyPostQueryKey('p-du-flux'))).toBeUndefined();
  });
});

/**
 * **UNE GARDE QUI LAISSE PASSER CE QU'ELLE VA DÉPLIER NE GARDE RIEN**
 * (revue-correction W8, #7227) — `isCommentDeleted` déclarait la charge
 * conforme à `CommentDeletedEventData` sans jamais regarder
 * `deletedCommentIds`, que `applyCommentDeleted` DÉPLIE aussitôt
 * (`[...payload.deletedCommentIds ?? []]`). Une charge d'une version voisine
 * portant autre chose qu'un tableau levait donc un `TypeError` — dans un
 * `import().then()`, soit un rejet non intercepté, alors que le module
 * promet l'inverse : « une charge invalide ne change rien et ne lève pas ».
 */
describe('isCommentDeleted — ce que la garde DÉPLIE, elle doit le vérifier', () => {
  test('refuse un `deletedCommentIds` qui n’est pas un tableau de chaînes', () => {
    const base = { postId: 'p1', commentId: 'c1', commentCount: 0 };
    expect(isCommentDeleted({ ...base, deletedCommentIds: ['c1', 'c2'] })).toBe(true);
    expect(isCommentDeleted({ ...base, deletedCommentIds: undefined })).toBe(true);
    for (const charge of [7, 'c1', { 0: 'c1' }, ['c1', 9], null]) {
      expect(isCommentDeleted({ ...base, deletedCommentIds: charge })).toBe(false);
    }
  });

  test('une charge dont `deletedCommentIds` est malformé ne lève pas et ne change rien', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(commentsQueryKey('p1'), pageData([comment('c1')]));

    expect(() =>
      applyCommentDeleted(queryClient, { postId: 'p1', commentId: 'c1', commentCount: 0, deletedCommentIds: 7 }),
    ).not.toThrow();
    expect(flattenCommentPages(queryClient.getQueryData(commentsQueryKey('p1'))).map((c) => c.id)).toEqual(['c1']);
  });
});
