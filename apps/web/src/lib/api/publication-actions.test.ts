import { describe, expect, test } from 'bun:test';
import { QueryClient, type QueryKey } from '@tanstack/react-query';

import { scriptedTransport } from '@/test-support/scripted-transport';

import { BOOKMARKS_QUERY_KEY } from './bookmarked-posts';
import { updateCardPost } from './card-caches';
import { FEED_QUERY_KEY } from './feed';
import type { FeedInfiniteData, FeedPost } from './feed-pages';
import type { HttpTransport } from './http';
import { deletePost, editPost, pinPost } from './publication-actions';
import { postQueryKey } from './publication-detail';
import { reelsQueryKey } from './reels';
import { reportPost } from './reports';
import { STORY_TRAY_QUERY_KEY, type StoryTrayPost } from './stories';

/** LES GESTES DE L'AUTEUR (#7533) — ce qui PART, et ce que le fil montre. */
const feedWith = (ids: readonly string[]) => {
  const queryClient = new QueryClient();
  queryClient.setQueryData(FEED_QUERY_KEY, {
    pages: [{ posts: ids.map((id) => ({ id, type: 'POST', createdAt: '2026-09-13T11:55:00.000Z' })) }],
    pageParams: [null],
  });
  return queryClient;
};

const idsOf = (queryClient: QueryClient): readonly string[] =>
  (queryClient.getQueryData(FEED_QUERY_KEY) as { pages: { posts: { id: string }[] }[] }).pages.flatMap((p) => p.posts.map((post) => post.id));

describe('deletePost', () => {
  test('la carte quitte le fil AVANT la réponse, et la requête est un DELETE sur la publication', async () => {
    const queryClient = feedWith(['p1', 'p2']);
    const { transport, calls } = scriptedTransport({ 'DELETE /api/v1/posts/p1': { ok: true, data: null } });

    const pending = deletePost({ postId: 'p1', deps: { source: 'gateway', transport, queryClient } });
    expect(idsOf(queryClient)).toEqual(['p2']);

    expect(await pending).toBe('done');
    expect(calls().map((c) => `${c.method} ${c.path}`)).toEqual(['DELETE /api/v1/posts/p1']);
  });

  test('un refus est un échec servi, et le fil est relu', async () => {
    const queryClient = feedWith(['p1']);
    const { transport } = scriptedTransport({ 'DELETE /api/v1/posts/p1': { ok: false, status: 403, error: 'FORBIDDEN' } });

    expect(await deletePost({ postId: 'p1', deps: { source: 'gateway', transport, queryClient } })).toBe('failed');
    expect(queryClient.getQueryState(FEED_QUERY_KEY)?.isInvalidated).toBe(true);
  });
});

/**
 * **UNE STORY SE SUPPRIME PAR LE MÊME GESTE** (#6149) — `deletePost` sert le
 * listing « Mes stories » comme il sert le menu « ⋯ » d'une carte du fil :
 * même route, même optimisme, même retour en arrière. Voir le doc-comment de
 * `story-caches.ts`.
 */
describe('deletePost — une story quitte le plateau AVANT la réponse, et y revient sur refus', () => {
  const trayWith = (ids: readonly string[]) => {
    const queryClient = new QueryClient();
    const stories: readonly StoryTrayPost[] = ids.map((id) => ({ id, type: 'STORY', createdAt: '2026-09-24T10:00:00.000Z' }));
    queryClient.setQueryData(STORY_TRAY_QUERY_KEY, stories);
    return queryClient;
  };
  const trayIdsOf = (queryClient: QueryClient): readonly string[] =>
    (queryClient.getQueryData(STORY_TRAY_QUERY_KEY) as readonly StoryTrayPost[]).map((s) => s.id);

  test('la story quitte le plateau avant même la réponse réseau', async () => {
    const queryClient = trayWith(['s1', 's2']);
    const { transport } = scriptedTransport({ 'DELETE /api/v1/posts/s1': { ok: true, data: null } });

    const pending = deletePost({ postId: 's1', deps: { source: 'gateway', transport, queryClient } });
    expect(trayIdsOf(queryClient)).toEqual(['s2']);

    expect(await pending).toBe('done');
  });

  test('un refus relit le plateau des stories, comme le Flux — la story revient', async () => {
    const queryClient = trayWith(['s1']);
    const { transport } = scriptedTransport({ 'DELETE /api/v1/posts/s1': { ok: false, status: 500, error: 'INTERNAL_ERROR' } });

    expect(await deletePost({ postId: 's1', deps: { source: 'gateway', transport, queryClient } })).toBe('offline');
    expect(queryClient.getQueryState(STORY_TRAY_QUERY_KEY)?.isInvalidated).toBe(true);
  });

  /**
   * **UNE RELECTURE PENDANT LE VOL NE RESSUSCITE PAS LA STORY** (revue-
   * correction #6149) — deux suppressions en vol, ou un `story:viewed` qui
   * invalide le plateau pendant le DELETE : la relecture rapporte la story
   * que le serveur n'a pas encore retirée. La confirmation RÉAPPLIQUE le
   * retrait ; sans elle, une story supprimée restait affichée jusqu'à la
   * relecture suivante, et le listing devait sérialiser ses suppressions.
   */
  test('une relecture qui ramène la story pendant le vol est défaite par la confirmation', async () => {
    const queryClient = trayWith(['s1', 's2']);
    const { transport } = scriptedTransport({ 'DELETE /api/v1/posts/s1': { ok: true, data: null } });

    const pending = deletePost({ postId: 's1', deps: { source: 'gateway', transport, queryClient } });
    queryClient.setQueryData(STORY_TRAY_QUERY_KEY, [
      { id: 's1', type: 'STORY', createdAt: '2026-09-24T10:00:00.000Z' },
      { id: 's2', type: 'STORY', createdAt: '2026-09-24T10:00:00.000Z' },
    ] satisfies readonly StoryTrayPost[]);

    expect(await pending).toBe('done');
    expect(trayIdsOf(queryClient)).toEqual(['s2']);
  });

  test('supprimer une carte du Flux ne touche à AUCUN corpus de stories', async () => {
    const stories: readonly StoryTrayPost[] = [{ id: 's1', type: 'STORY', createdAt: '2026-09-24T10:00:00.000Z' }];
    const queryClient = feedWith(['p1']);
    queryClient.setQueryData(STORY_TRAY_QUERY_KEY, stories);
    const { transport } = scriptedTransport({ 'DELETE /api/v1/posts/p1': { ok: true, data: null } });

    await deletePost({ postId: 'p1', deps: { source: 'gateway', transport, queryClient } });

    expect(queryClient.getQueryData(STORY_TRAY_QUERY_KEY)).toBe(stories);
  });
});

/**
 * **`editPost`** (#7534) — le TEXTE d'une publication, en optimiste avec
 * retour en arrière, miroir `FeedViewModel.updatePost` (`:1325-1370`) et la
 * route réelle `PUT /api/v1/posts/:postId` (`core.ts:513-661`) : corps
 * `{ content }` seul, `translations` remis à `{}` (le texte a changé, les
 * traductions décrivaient l'ANCIEN), l'état du LECTEUR (`isLikedByMe`…)
 * préservé à travers la réponse servie (`mergeServedPost`), et le fil GELÉ
 * des Réels jamais réécrit — même registre que `applyPostUpdated`.
 */
describe('editPost', () => {
  const post = (partial: Partial<FeedPost>): FeedPost => ({
    id: 'p1',
    type: 'POST',
    createdAt: '2026-09-24T10:00:00.000Z',
    content: 'Texte original',
    isLikedByMe: true,
    translations: { en: { text: 'Original text' } },
    ...partial,
  });

  const feedWithPost = (feedPost: FeedPost): QueryClient => {
    const queryClient = new QueryClient();
    const data: FeedInfiniteData = {
      pages: [{ posts: [feedPost], pagination: { limit: 20, hasMore: false, nextCursor: null } }],
      pageParams: [undefined],
    };
    queryClient.setQueryData(FEED_QUERY_KEY, data);
    return queryClient;
  };

  const cardIn = (queryClient: QueryClient, key: QueryKey = FEED_QUERY_KEY): FeedPost | undefined =>
    queryClient.getQueryData<FeedInfiniteData>(key)?.pages.flatMap((p) => p.posts)[0];

  test('la requête est un PUT avec `{ content }`, et le cache est patché AVANT la réponse', async () => {
    const queryClient = feedWithPost(post({}));
    const { transport, calls } = scriptedTransport({
      'PUT /api/v1/posts/p1': { ok: true, data: post({ content: 'Nouveau.', translations: {} }) },
    });

    const pending = editPost({ postId: 'p1', content: 'Nouveau', deps: { source: 'gateway', transport, queryClient } });
    /* PENDANT LE VOL — l'optimiste est déjà posé, sur le fil ET la fiche. */
    expect(cardIn(queryClient)?.content).toBe('Nouveau');
    expect(cardIn(queryClient)?.translations).toEqual({});

    expect(await pending).toBe('done');
    expect(calls().map((c) => `${c.method} ${c.path}`)).toEqual(['PUT /api/v1/posts/p1']);
    expect(calls()[0]?.body).toEqual({ content: 'Nouveau' });
    /* LA RÉPONSE SERVIE (texte assaini) remplace l'optimiste, et l'état du
       lecteur (`isLikedByMe`) SURVIT à travers elle. */
    expect(cardIn(queryClient)?.content).toBe('Nouveau.');
    expect(cardIn(queryClient)?.isLikedByMe).toBe(true);
  });

  test('la FICHE de la publication est patchée aussi', async () => {
    const queryClient = feedWithPost(post({}));
    queryClient.setQueryData(postQueryKey('p1'), post({}));
    const { transport } = scriptedTransport({ 'PUT /api/v1/posts/p1': { ok: true, data: post({ content: 'Nouveau' }) } });

    await editPost({ postId: 'p1', content: 'Nouveau', deps: { source: 'gateway', transport, queryClient } });

    expect((queryClient.getQueryData(postQueryKey('p1')) as FeedPost).content).toBe('Nouveau');
  });

  test('un refus PERMANENT restaure la carte à l’identique, et vaut `failed`', async () => {
    const original = post({});
    const queryClient = feedWithPost(original);
    const { transport } = scriptedTransport({ 'PUT /api/v1/posts/p1': { ok: false, status: 403, error: 'FORBIDDEN' } });

    expect(await editPost({ postId: 'p1', content: 'Nouveau', deps: { source: 'gateway', transport, queryClient } })).toBe('failed');
    expect(cardIn(queryClient)).toEqual(original);
  });

  test('un 500 restaure la carte, et vaut `offline`', async () => {
    const original = post({});
    const queryClient = feedWithPost(original);
    const { transport } = scriptedTransport({ 'PUT /api/v1/posts/p1': { ok: false, status: 500, error: 'INTERNAL_ERROR' } });

    expect(await editPost({ postId: 'p1', content: 'Nouveau', deps: { source: 'gateway', transport, queryClient } })).toBe('offline');
    expect(cardIn(queryClient)).toEqual(original);
  });

  test('un transport EN PANNE (rejet) restaure la carte, et vaut `offline`', async () => {
    const original = post({});
    const queryClient = feedWithPost(original);
    const transport = { request: () => Promise.reject(new TypeError('Failed to fetch')) } as unknown as HttpTransport;

    expect(await editPost({ postId: 'p1', content: 'Nouveau', deps: { source: 'gateway', transport, queryClient } })).toBe('offline');
    expect(cardIn(queryClient)).toEqual(original);
  });

  test('texte inchangé (après trim) : `done` SANS appel réseau', async () => {
    const queryClient = feedWithPost(post({ content: 'Déjà là' }));
    const { transport, calls } = scriptedTransport({});

    expect(await editPost({ postId: 'p1', content: '  Déjà là  ', deps: { source: 'gateway', transport, queryClient } })).toBe('done');
    expect(calls()).toHaveLength(0);
  });

  test('texte vide ou blanc : `failed` SANS appel réseau', async () => {
    const queryClient = feedWithPost(post({}));
    const { transport, calls } = scriptedTransport({});

    expect(await editPost({ postId: 'p1', content: '   ', deps: { source: 'gateway', transport, queryClient } })).toBe('failed');
    expect(calls()).toHaveLength(0);
  });

  test('une carte ABSENTE du cache (aucune caisse ne la tient) : `failed` SANS appel', async () => {
    const queryClient = new QueryClient();
    const { transport, calls } = scriptedTransport({});

    expect(await editPost({ postId: 'introuvable', content: 'Texte', deps: { source: 'gateway', transport, queryClient } })).toBe('failed');
    expect(calls()).toHaveLength(0);
  });

  test('un SECOND appel pendant le vol du premier n’envoie rien de plus', async () => {
    const queryClient = feedWithPost(post({}));
    const { transport, calls } = scriptedTransport({ 'PUT /api/v1/posts/p1': { ok: true, data: post({ content: 'Nouveau' }) } });

    const first = editPost({ postId: 'p1', content: 'Nouveau', deps: { source: 'gateway', transport, queryClient } });
    const second = editPost({ postId: 'p1', content: 'Autre texte', deps: { source: 'gateway', transport, queryClient } });

    await Promise.all([first, second]);
    expect(calls()).toHaveLength(1);
  });

  test('le fil GELÉ des Réels n’est JAMAIS réécrit — même registre que `applyPostUpdated`', async () => {
    const original = post({});
    const queryClient = new QueryClient();
    queryClient.setQueryData(reelsQueryKey('graine'), {
      pages: [{ posts: [original], pagination: { limit: 20, hasMore: false, nextCursor: null } }],
      pageParams: [undefined],
    });
    const { transport } = scriptedTransport({ 'PUT /api/v1/posts/p1': { ok: true, data: post({ content: 'Nouveau' }) } });

    /* La carte n'est tenue QUE par une caisse gelée — `findCardPost` la
       trouve quand même (la RECHERCHE parcourt tout le registre), et
       l'appel part normalement ; seule l'ÉCRITURE de l'optimiste évite les
       caisses gelées. */
    expect(await editPost({ postId: 'p1', content: 'Nouveau', deps: { source: 'gateway', transport, queryClient } })).toBe('done');
    expect(cardIn(queryClient, reelsQueryKey('graine'))?.content).toBe('Texte original');
  });

  /**
   * **LE RETOUR EN ARRIÈRE NE DÉFAIT QUE CE QUE LE GESTE A FAIT** (revue-
   * correction #7534). Le geste touche `content` et `translations` ; poser un
   * INSTANTANÉ ENTIER sur chaque caisse défaisait en plus tout ce qu'un autre
   * geste ou un écho avait posé PENDANT le vol — un cœur donné pendant que
   * la modification partait se dé-remplissait au refus.
   */
  test('un cœur posé PENDANT le vol survit au retour en arrière', async () => {
    const queryClient = feedWithPost(post({ isLikedByMe: false, likeCount: 0 }));
    let answer: (value: unknown) => void = () => {};
    const transport = {
      request: () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    } as unknown as HttpTransport;

    const pending = editPost({ postId: 'p1', content: 'Nouveau', deps: { source: 'gateway', transport, queryClient } });
    updateCardPost(queryClient, 'p1', (held) => ({ ...held, isLikedByMe: true, likeCount: 1 }));
    answer({ ok: false, status: 500, error: 'INTERNAL_ERROR' });

    expect(await pending).toBe('offline');
    expect(cardIn(queryClient)?.content).toBe('Texte original');
    expect(cardIn(queryClient)?.translations).toEqual({ en: { text: 'Original text' } });
    expect(cardIn(queryClient)?.isLikedByMe).toBe(true);
    expect(cardIn(queryClient)?.likeCount).toBe(1);
  });

  /**
   * **LE FIL GELÉ DES RÉELS N'EST JAMAIS LA RÉFÉRENCE DU TEXTE** (revue-
   * correction #7534). Il ne reçoit pas les modifications (D-66) : il peut
   * tenir un texte PÉRIMÉ que les caisses vivantes ont déjà remplacé. L'y
   * lire comme « l'état d'avant » faisait deux mensonges — un texte retapé à
   * l'identique du périmé rendait `done` SANS appel, et un refus recopiait le
   * périmé dans toutes les caisses vivantes.
   */
  const reelsAndBookmarks = (stale: FeedPost, live: FeedPost): QueryClient => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(reelsQueryKey('graine'), {
      pages: [{ posts: [stale], pagination: { limit: 20, hasMore: false, nextCursor: null } }],
      pageParams: [undefined],
    });
    queryClient.setQueryData(BOOKMARKS_QUERY_KEY, {
      pages: [{ posts: [live], pagination: { limit: 20, hasMore: false, nextCursor: null } }],
      pageParams: [undefined],
    });
    return queryClient;
  };

  test('le texte PÉRIMÉ du fil gelé, retapé, part quand même — la référence est la caisse vivante', async () => {
    const queryClient = reelsAndBookmarks(post({ content: 'Ancien texte' }), post({ content: 'Texte actuel' }));
    const { transport, calls } = scriptedTransport({ 'PUT /api/v1/posts/p1': { ok: true, data: post({ content: 'Ancien texte' }) } });

    expect(await editPost({ postId: 'p1', content: 'Ancien texte', deps: { source: 'gateway', transport, queryClient } })).toBe('done');
    expect(calls()).toHaveLength(1);
  });

  test('un refus remet le texte de la caisse VIVANTE, jamais celui du fil gelé', async () => {
    const queryClient = reelsAndBookmarks(post({ content: 'Ancien texte' }), post({ content: 'Texte actuel' }));
    const { transport } = scriptedTransport({ 'PUT /api/v1/posts/p1': { ok: false, status: 500, error: 'INTERNAL_ERROR' } });

    expect(await editPost({ postId: 'p1', content: 'Nouveau', deps: { source: 'gateway', transport, queryClient } })).toBe('offline');
    expect(cardIn(queryClient, BOOKMARKS_QUERY_KEY)?.content).toBe('Texte actuel');
    expect(cardIn(queryClient, reelsQueryKey('graine'))?.content).toBe('Ancien texte');
  });
});

describe('pinPost', () => {
  test('un POST sur `/pin`', async () => {
    const { transport, calls } = scriptedTransport({ 'POST /api/v1/posts/p1/pin': { ok: true, data: { pinned: true } } });

    expect(await pinPost({ postId: 'p1', deps: { source: 'gateway', transport, queryClient: new QueryClient() } })).toBe('done');
    expect(calls()).toHaveLength(1);
  });
});

describe('reportPost', () => {
  test('la même route que le signalement d’un compte, `reportedType: post`', async () => {
    const { transport, calls } = scriptedTransport({ 'POST /api/v1/reports': { ok: true, data: null } });

    expect(await reportPost({ postId: 'p1', reason: 'spam', deps: { source: 'gateway', transport } })).toBe('done');
    expect(calls()[0]?.body).toEqual({ reportedType: 'post', reportedEntityId: 'p1', reportType: 'spam' });
  });
});
