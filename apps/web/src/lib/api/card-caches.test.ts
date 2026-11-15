import { QueryClient, type QueryKey } from '@tanstack/react-query';
import { afterEach, describe, expect, test } from 'bun:test';

import { authorPostsQueryKey } from './author-posts';
import { BOOKMARKS_QUERY_KEY } from './bookmarked-posts';
import { mergeServedPost } from './card-caches';
import { FEED_QUERY_KEY } from './feed';
import { BOOKMARK_FAILED_MESSAGE, LIKE_FAILED_MESSAGE, performPostGesture, type PostGestureDeps } from './feed-gestures';
import { FEED_NEW_COUNT_KEY } from './feed-new-count';
import type { FeedPost } from './feed-pages';
import { applyPostDeleted, applyPostUpdated } from './feed-realtime';
import { recordPostShare } from './feed-share';
import { hashtagQueryKey } from './hashtag-posts';
import type { ApiResult, HttpRequest, HttpTransport } from './http';
import { setCommentCountServed, shiftCommentCount } from './publication-comments';
import { postQueryKey } from './publication-detail';
import { reelsQueryKey } from './reels';

/**
 * **TOUTE CAISSE QUI PEINT UNE CARTE REÇOIT CE QUI LA CHANGE** (#7341).
 *
 * La page d'un hashtag et les publications d'un profil montent la MÊME carte
 * que le Flux, mais la peignent depuis LEUR caisse (`hashtagQueryKey`,
 * `authorPostsQueryKey`), qu'aucune écriture n'atteignait : toucher le cœur y
 * envoyait la requête et la carte ne bougeait pas (loi 4, contrôle inerte).
 *
 * Chaque témoin interroge ce que l'ÉCRAN lit — la carte dans sa caisse —,
 * jamais le Flux : un geste qui n'écrirait que le Flux les ferait tous tomber.
 */

type Screen = {
  readonly name: string;
  readonly key: QueryKey;
  readonly cache: (posts: readonly FeedPost[]) => unknown;
};

/** Les deux formes de page que ces écrans tiennent : le hashtag pagine par
 * DÉCALAGE (`nextCursor: number | null`), le profil par curseur keyset. */
const SCREENS: readonly Screen[] = [
  {
    name: 'la page d’un hashtag',
    key: hashtagQueryKey('voyage'),
    cache: (posts) => ({ pages: [{ posts, nextCursor: null }], pageParams: [0] }),
  },
  {
    name: 'les publications d’un profil',
    key: authorPostsQueryKey('u-auteur'),
    cache: (posts) => ({ pages: [{ posts, pagination: { limit: 20, hasMore: false, nextCursor: null } }], pageParams: [undefined] }),
  },
];

const feedCache = (posts: readonly FeedPost[]) => ({
  pages: [{ posts, pagination: { limit: 20, hasMore: false, nextCursor: null } }],
  pageParams: [undefined],
});

const post = (partial: Partial<FeedPost>): FeedPost => ({
  id: 'p1',
  type: 'POST',
  createdAt: '2026-09-21T10:00:00.000Z',
  ...partial,
});

const cardIn = (queryClient: QueryClient, key: QueryKey, id = 'p1'): FeedPost | undefined =>
  queryClient
    .getQueryData<{ readonly pages: readonly { readonly posts: readonly FeedPost[] }[] }>(key)
    ?.pages.flatMap((page) => page.posts)
    .find((p) => p.id === id);

const idsIn = (queryClient: QueryClient, key: QueryKey): readonly string[] =>
  queryClient
    .getQueryData<{ readonly pages: readonly { readonly posts: readonly FeedPost[] }[] }>(key)
    ?.pages.flatMap((page) => page.posts.map((p) => p.id)) ?? [];

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

/**
 * Une réponse TENUE en suspens : l'optimiste s'observe AVANT elle.
 *
 * `inFlight` vit au niveau du MODULE (`feed-gestures.ts`) : un témoin qui
 * tombe avant de relâcher sa réponse laisserait son geste en vol, et chaque
 * témoin suivant sur la même publication partirait en retour anticipé — son
 * rouge accuserait alors le harnais, pas le défaut. Toute réponse tenue est
 * donc relâchée après chaque témoin, qu'il soit vert ou rouge.
 */
const unreleased: ((r: ApiResult<unknown>) => void)[] = [];

afterEach(async () => {
  for (const release of unreleased.splice(0)) release({ ok: true, data: {} });
  await new Promise((resolve) => setTimeout(resolve, 0));
});

const held = () => {
  let release: (r: ApiResult<unknown>) => void = () => undefined;
  const script = scripted(
    () =>
      new Promise((resolve) => {
        release = resolve;
        unreleased.push(resolve);
      }),
  );
  return { ...script, release: (r: ApiResult<unknown>) => release(r) };
};

const deps = (queryClient: QueryClient, transport: HttpTransport): PostGestureDeps => ({ source: 'gateway', transport, queryClient });

const NOT_FOUND: ApiResult<unknown> = { ok: false, status: 404, error: 'Post not found', code: 'POST_NOT_FOUND' };

for (const screen of SCREENS) {
  const seeded = (posts: readonly FeedPost[]): QueryClient => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(screen.key, screen.cache(posts));
    return queryClient;
  };

  describe(`${screen.name} — le cœur et le signet ne sont plus inertes (#7341)`, () => {
    test('aimer remplit le cœur de SA carte AVANT la réponse, et un refus le vide', async () => {
      const queryClient = seeded([post({ isLikedByMe: false, likeCount: 4 })]);
      const { requests, transport, release } = held();

      const pending = performPostGesture({ postId: 'p1', kind: 'like', deps: deps(queryClient, transport) });
      expect(requests[0]?.method).toBe('POST');
      expect(cardIn(queryClient, screen.key)?.isLikedByMe).toBe(true);
      expect(cardIn(queryClient, screen.key)?.likeCount).toBe(5);

      release(NOT_FOUND);
      expect(await pending).toEqual({ ok: false, message: LIKE_FAILED_MESSAGE });
      expect(cardIn(queryClient, screen.key)?.isLikedByMe).toBe(false);
      expect(cardIn(queryClient, screen.key)?.likeCount).toBe(4);
    });

    test('enregistrer pose le signet de SA carte AVANT la réponse, et un refus le retire', async () => {
      const queryClient = seeded([post({ isBookmarkedByMe: false, bookmarkCount: 1 })]);
      const { transport, release } = held();

      const pending = performPostGesture({ postId: 'p1', kind: 'bookmark', deps: deps(queryClient, transport) });
      expect(cardIn(queryClient, screen.key)?.isBookmarkedByMe).toBe(true);
      expect(cardIn(queryClient, screen.key)?.bookmarkCount).toBe(2);

      release(NOT_FOUND);
      expect(await pending).toEqual({ ok: false, message: BOOKMARK_FAILED_MESSAGE });
      expect(cardIn(queryClient, screen.key)?.isBookmarkedByMe).toBe(false);
      expect(cardIn(queryClient, screen.key)?.bookmarkCount).toBe(1);
    });

    /**
     * L'ÉTAT « AVANT » SE LIT LÀ OÙ LA CARTE EST PEINTE — le défaut que #7286
     * a payé sur les enregistrées : n'y lire que le Flux déduisait « pas
     * aimée » d'une publication que SEUL cet écran montre, et le geste qui
     * voulait RETIRER partait en `POST`.
     */
    test('une publication que SEUL cet écran montre, déjà aimée, part en `DELETE` — jamais en `POST`', async () => {
      const queryClient = seeded([post({ isLikedByMe: true, likeCount: 3 })]);
      queryClient.setQueryData(FEED_QUERY_KEY, feedCache([post({ id: 'autre' })]));
      const { requests, transport } = scripted(async () => ({ ok: true, data: { liked: false } }));

      await performPostGesture({ postId: 'p1', kind: 'like', deps: deps(queryClient, transport) });

      expect(requests[0]?.method).toBe('DELETE');
      expect(cardIn(queryClient, screen.key)?.isLikedByMe).toBe(false);
      expect(cardIn(queryClient, screen.key)?.likeCount).toBe(2);
    });

    test('une publication que SEUL cet écran montre, déjà enregistrée, part en `DELETE`', async () => {
      const queryClient = seeded([post({ isBookmarkedByMe: true, bookmarkCount: 2 })]);
      const { requests, transport } = scripted(async () => ({ ok: true, data: { bookmarked: false, bookmarkCount: 1 } }));

      await performPostGesture({ postId: 'p1', kind: 'bookmark', deps: deps(queryClient, transport) });

      expect(requests[0]?.method).toBe('DELETE');
      expect(cardIn(queryClient, screen.key)?.isBookmarkedByMe).toBe(false);
      expect(cardIn(queryClient, screen.key)?.bookmarkCount).toBe(1);
    });

    test('le compte d’enregistrements SERVI remplace l’estimation sur SA carte', async () => {
      const queryClient = seeded([post({ isBookmarkedByMe: false, bookmarkCount: 1 })]);
      const { transport } = scripted(async () => ({ ok: true, data: { bookmarked: true, bookmarkCount: 12 } }));

      await performPostGesture({ postId: 'p1', kind: 'bookmark', deps: deps(queryClient, transport) });

      expect(cardIn(queryClient, screen.key)?.bookmarkCount).toBe(12);
    });

    test('un 409 sur « aimer » rend SA caisse périmée — sa carte était fausse', async () => {
      const queryClient = seeded([post({ isLikedByMe: false, likeCount: 5 })]);
      const { transport } = scripted(async () => ({ ok: false, status: 409, error: 'conflict' }));

      expect(await performPostGesture({ postId: 'p1', kind: 'like', deps: deps(queryClient, transport) })).toEqual({ ok: true });

      expect(cardIn(queryClient, screen.key)?.likeCount).toBe(5);
      expect(queryClient.getQueryState(screen.key)?.isInvalidated).toBe(true);
    });
  });

  describe(`${screen.name} — les compteurs de la carte suivent (#7341)`, () => {
    test('un commentaire écrit ailleurs décale le compteur de SA carte, et le compte servi le pose', () => {
      const queryClient = seeded([post({ commentCount: 2 })]);

      shiftCommentCount(queryClient, 'p1', 1);
      expect(cardIn(queryClient, screen.key)?.commentCount).toBe(3);

      setCommentCountServed(queryClient, 'p1', 7);
      expect(cardIn(queryClient, screen.key)?.commentCount).toBe(7);
    });

    test('un partage compté pose le compte SERVI sur SA carte', async () => {
      const queryClient = seeded([post({ shareCount: 2 })]);
      const { transport } = scripted(async () => ({ ok: true, data: { shared: true, shareCount: 9 } }));

      expect(await recordPostShare({ postId: 'p1', deps: { source: 'gateway', transport, queryClient } })).toBe(true);

      expect(cardIn(queryClient, screen.key)?.shareCount).toBe(9);
    });
  });

  describe(`${screen.name} — une publication modifiée ou supprimée ailleurs (#7341)`, () => {
    test('le texte modifié remplace l’ancien sur SA carte, sans vider le cœur du lecteur', () => {
      const queryClient = seeded([post({ content: 'avant', isLikedByMe: true, isBookmarkedByMe: true })]);

      applyPostUpdated(queryClient, { post: post({ content: 'après' }) });

      expect(cardIn(queryClient, screen.key)?.content).toBe('après');
      expect(cardIn(queryClient, screen.key)?.isLikedByMe).toBe(true);
      expect(cardIn(queryClient, screen.key)?.isBookmarkedByMe).toBe(true);
    });

    test('une publication supprimée quitte cet écran', () => {
      const queryClient = seeded([post({ id: 'p1' }), post({ id: 'p2' })]);

      applyPostDeleted(queryClient, { postId: 'p1' });

      expect(idsIn(queryClient, screen.key)).toEqual(['p2']);
    });
  });
}

/**
 * **LA MÊME PUBLICATION VIT DANS PLUSIEURS CAISSES À LA FOIS** — une photo de
 * voyage est dans le Flux, sous `#voyage`, sur le profil de son auteur et
 * dans les enregistrées du lecteur. Un geste les bascule TOUTES, chacune
 * UNE fois, et un refus les rétablit TOUTES : la même publication ne peut pas
 * porter deux cœurs selon l'écran qui la montre.
 */
describe('une publication montrée par plusieurs écrans à la fois (#7341)', () => {
  const EVERY_SCREEN: readonly QueryKey[] = [FEED_QUERY_KEY, BOOKMARKS_QUERY_KEY, ...SCREENS.map((screen) => screen.key)];

  const everywhere = (partial: Partial<FeedPost>): QueryClient => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(FEED_QUERY_KEY, feedCache([post(partial)]));
    queryClient.setQueryData(BOOKMARKS_QUERY_KEY, feedCache([post({ ...partial, isBookmarkedByMe: true })]));
    for (const screen of SCREENS) queryClient.setQueryData(screen.key, screen.cache([post(partial)]));
    return queryClient;
  };

  test('aimer bascule chaque carte UNE fois, et un refus les rétablit toutes', async () => {
    const queryClient = everywhere({ isLikedByMe: false, likeCount: 4 });
    const { transport, release } = held();

    const pending = performPostGesture({ postId: 'p1', kind: 'like', deps: deps(queryClient, transport) });
    expect(EVERY_SCREEN.map((key) => cardIn(queryClient, key)?.likeCount)).toEqual([5, 5, 5, 5]);
    expect(EVERY_SCREEN.every((key) => cardIn(queryClient, key)?.isLikedByMe === true)).toBe(true);

    release(NOT_FOUND);
    await pending;
    expect(EVERY_SCREEN.map((key) => cardIn(queryClient, key)?.likeCount)).toEqual([4, 4, 4, 4]);
    expect(EVERY_SCREEN.every((key) => cardIn(queryClient, key)?.isLikedByMe === false)).toBe(true);
  });

  /* Un second tap pendant l'appel est ignoré (`inFlight`), et une
     confirmation qui arrive sur un optimiste déjà posé ne compte pas deux
     fois : `togglePost` ne décale que si l'état BASCULE. */
  test('un double tap ne décale aucun compteur deux fois, sur aucun écran', async () => {
    const queryClient = everywhere({ isLikedByMe: false, likeCount: 4 });
    const { transport, release } = held();

    const first = performPostGesture({ postId: 'p1', kind: 'like', deps: deps(queryClient, transport) });
    await performPostGesture({ postId: 'p1', kind: 'like', deps: deps(queryClient, transport) });
    release({ ok: true, data: { liked: true } });
    await first;

    expect(EVERY_SCREEN.map((key) => cardIn(queryClient, key)?.likeCount)).toEqual([5, 5, 5, 5]);
  });

  test('un commentaire décale le compteur de chaque écran UNE fois — enregistrées comprises', () => {
    const queryClient = everywhere({ commentCount: 1 });

    shiftCommentCount(queryClient, 'p1', 1);

    expect(EVERY_SCREEN.map((key) => cardIn(queryClient, key)?.commentCount)).toEqual([2, 2, 2, 2]);
  });

  test('un partage compté pose le même compte servi sur chaque écran, fiche et Réels compris', async () => {
    const queryClient = everywhere({ shareCount: 1 });
    queryClient.setQueryData(reelsQueryKey(), feedCache([post({ shareCount: 1 })]));
    queryClient.setQueryData(postQueryKey('p1'), post({ shareCount: 1 }));
    const { transport } = scripted(async () => ({ ok: true, data: { shared: true, shareCount: 6 } }));

    await recordPostShare({ postId: 'p1', deps: { source: 'gateway', transport, queryClient } });

    expect(EVERY_SCREEN.map((key) => cardIn(queryClient, key)?.shareCount)).toEqual([6, 6, 6, 6]);
    expect(cardIn(queryClient, reelsQueryKey())?.shareCount).toBe(6);
    expect(queryClient.getQueryData<FeedPost>(postQueryKey('p1'))?.shareCount).toBe(6);
  });
});

/**
 * **CE QUE LES CAISSES DE CARTES NE SONT PAS.** Trois propriétés qu'un
 * registre parcouru par préfixe casserait sans qu'aucun témoin d'écran ne
 * rougisse.
 */
describe('les caisses de cartes et leurs voisines (#7341)', () => {
  /* `['feed', 'new-count']` est un ENTIER rangé sous le MÊME préfixe que le
     Flux (`feed-new-count.ts`) : le prendre pour une caisse de cartes lèverait
     sur `data.pages`. */
  test('le compteur de nouvelles publications, rangé sous le préfixe du Flux, n’est jamais pris pour une caisse de cartes', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(FEED_QUERY_KEY, feedCache([post({ isLikedByMe: false, likeCount: 0 })]));
    queryClient.setQueryData(FEED_NEW_COUNT_KEY, 3);
    const { transport } = scripted(async () => ({ ok: true, data: { liked: true } }));

    await performPostGesture({ postId: 'p1', kind: 'like', deps: deps(queryClient, transport) });
    shiftCommentCount(queryClient, 'p1', 1);
    applyPostDeleted(queryClient, { postId: 'p1' });

    expect(queryClient.getQueryData(FEED_NEW_COUNT_KEY)).toBe(3);
  });

  /* LE FIL DES RÉELS EST GELÉ À L'OUVERTURE (D-66) : il ne se relit ni au
     focus ni à la reconnexion. Un 409 le rend faux sur UNE carte, que le
     rollback a déjà remise ; le relire déplacerait le réel regardé. */
  test('un 409 ne relit jamais le fil des Réels, même quand il montre la carte', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(reelsQueryKey('graine'), feedCache([post({ isLikedByMe: false, likeCount: 5 })]));
    const { transport } = scripted(async () => ({ ok: false, status: 409, error: 'conflict' }));

    await performPostGesture({ postId: 'p1', kind: 'like', deps: deps(queryClient, transport) });

    expect(cardIn(queryClient, reelsQueryKey('graine'))?.likeCount).toBe(5);
    expect(queryClient.getQueryState(reelsQueryKey('graine'))?.isInvalidated).toBe(false);
  });

  /**
   * UNE CAISSE QUI NE MONTRE PAS LA PUBLICATION N'EST PAS RÉÉCRITE. Réécrire
   * une donnée IDENTIQUE n'est pas neutre chez TanStack : `setQueryData` pose
   * `isInvalidated: false` et une date neuve (`successState`). Le corpus des
   * enregistrées qu'un écho vient de rendre périmé (`post:bookmarked`,
   * `feed-realtime.ts`) redevenait donc FRAIS au premier cœur posé sur une
   * autre publication — et l'écran s'ouvrait sans l'enregistrement fait sur
   * l'autre appareil.
   */
  test('une caisse rendue périmée le reste après un geste sur une AUTRE publication', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(FEED_QUERY_KEY, feedCache([post({ id: 'p1', isLikedByMe: false, likeCount: 0 })]));
    queryClient.setQueryData(BOOKMARKS_QUERY_KEY, feedCache([post({ id: 'p-enregistree', isBookmarkedByMe: true })]));
    await queryClient.invalidateQueries({ queryKey: BOOKMARKS_QUERY_KEY });
    const { transport } = scripted(async () => ({ ok: true, data: { liked: true } }));

    await performPostGesture({ postId: 'p1', kind: 'like', deps: deps(queryClient, transport) });

    expect(cardIn(queryClient, FEED_QUERY_KEY)?.isLikedByMe).toBe(true);
    expect(queryClient.getQueryState(BOOKMARKS_QUERY_KEY)?.isInvalidated).toBe(true);
  });
});

/**
 * `mergeServedPost` (#7534) — extraite de `feed-realtime.ts#merged`, SITE
 * UNIQUE désormais partagé par le temps réel (`applyPostCreated`,
 * `applyPostUpdated`) ET le port du menu « ⋯ » (`publication-actions.ts#editPost`,
 * qui en a besoin pour hydrater son optimiste avec la réponse SERVIE sans
 * importer le chunk `realtime`, différé). Le comportement n'a pas changé —
 * ces témoins couvrent ce que `feed-realtime.test.ts` couvrait déjà
 * indirectement, par l'API publique de la loi extraite.
 */
describe('mergeServedPost — ce qui appartient au LECTEUR ne vient pas du serveur', () => {
  test('un `isLikedByMe` TENU survit au remplacement par le servi', () => {
    const incoming = post({ id: 'p1', content: 'texte servi' });
    const held = post({ id: 'p1', content: 'texte optimiste', isLikedByMe: true });

    expect(mergeServedPost(incoming, held).isLikedByMe).toBe(true);
    expect(mergeServedPost(incoming, held).content).toBe('texte servi');
  });

  test('un `false` TENU est une réponse du lecteur, et survit aussi', () => {
    const incoming = post({ id: 'p1' });
    const held = post({ id: 'p1', isBookmarkedByMe: false });

    expect(mergeServedPost(incoming, held).isBookmarkedByMe).toBe(false);
  });

  test('`likeCount` n’est PAS préservé — le compte servi remplace toujours l’estimation', () => {
    const incoming = post({ id: 'p1', likeCount: 9 });
    const held = post({ id: 'p1', likeCount: 3 });

    expect(mergeServedPost(incoming, held).likeCount).toBe(9);
  });

  test('sans état tenu (`null`), le servi gagne sans rien inventer', () => {
    const incoming = post({ id: 'p1', isLikedByMe: true, isBookmarkedByMe: true });
    const held = post({ id: 'p1', isLikedByMe: null, isBookmarkedByMe: null });

    expect(mergeServedPost(incoming, held).isLikedByMe).toBe(true);
    expect(mergeServedPost(incoming, held).isBookmarkedByMe).toBe(true);
  });
});
