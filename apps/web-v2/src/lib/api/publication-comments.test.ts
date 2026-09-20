import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { postQueryKey } from './publication-detail';
import { STORY_FEED_QUERY_KEY, type StoryFeedPost } from './stories';
import {
  COMMENTS_PAGE_SIZE,
  COMMENT_FAILED_MESSAGE,
  COMMENT_PENDING_MESSAGE,
  COMMENT_UNCONFIRMED_MESSAGE,
  commentsQueryKey,
  dropComment,
  flattenCommentPages,
  insertComment,
  nextCommentCursor,
  performComment,
  replaceComment,
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
