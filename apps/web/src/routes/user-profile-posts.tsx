import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';

import { FeedPostCard } from '@/components/feed-post-card';
import { authorPostsInfiniteOptions, flattenAuthorPosts } from '@/lib/api/author-posts';
import { apiDeps } from '@/lib/api/deps';
import type { PublicProfileStats } from '@/lib/api/public-profile';
import { appQueryClient } from '@/lib/api/query-client';
import { resolveFeedCardModel } from '@/lib/feed/card-model';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { filterPosts, showsEmptyState, toggledFilter, type ProfilePostsFilter, type ProfilePostsFilterTap } from '@/lib/profile/posts-filter';
import { useMinute } from '@/lib/view/use-minute';
import type { usePostGesture } from '@/lib/view/use-post-gesture';
import { useReaderLanguages } from '@/lib/view/use-reader';
import { ProfileStatsBand } from '@/routes/user-profile-sections';
import { ProfilePostsEmpty, ProfilePostsError, ProfilePostsMore } from '@/routes/user-profile-states';

export type ProfilePostGestures = Pick<ReturnType<typeof usePostGesture>, 'onGesture' | 'onShare' | 'onComment' | 'onRepost' | 'menu'>;

/**
 * **LES PUBLICATIONS D'UN AUTEUR** (#7083, #6330) — le panneau « Publications »
 * des deux profils, le sien et celui d'autrui. Extrait de `user-profile.tsx`
 * quand `/me` a reçu le même onglet : deux listings auraient été deux lois du
 * filtre, du « charger plus » et de son focus.
 *
 * La liste ne part que pour un `User.id` connu (`authorId` non vide) : jamais
 * sur un identifiant fabriqué depuis l'adresse (`PostFeedService.ts:869`).
 */
export function ProfilePostsPanel({
  language,
  authorId,
  stats,
  online,
  gestures,
  announce,
}: {
  readonly language: InterfaceLanguage;
  readonly authorId: string | null;
  readonly stats: PublicProfileStats | null;
  readonly online: boolean;
  readonly gestures: ProfilePostGestures;
  readonly announce: (text: string) => void;
}) {
  const minute = useMinute();
  const { languages: readerLanguages } = useReaderLanguages();
  const [filter, setFilter] = useState<ProfilePostsFilter>('all');

  const posts = useInfiniteQuery(
    { ...authorPostsInfiniteOptions({ ...apiDeps, authorId: authorId ?? '' }), enabled: authorId !== null && authorId !== '' },
    appQueryClient,
  );

  const models = useMemo(
    () =>
      filterPosts(flattenAuthorPosts(posts.data), filter).map((post) =>
        resolveFeedCardModel(post, { preferredLanguages: readerLanguages, now: new Date() }),
      ),
    // `minute` réévalue `new Date()` — même motif que `feed.tsx` et `hashtag.tsx`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [posts.data, filter, readerLanguages, minute],
  );

  const onFilter = useCallback((tap: ProfilePostsFilterTap) => setFilter((current) => toggledFilter(current, tap)), []);

  /**
   * **« CHARGER PLUS » REND LE FOCUS À LA PREMIÈRE CARTE NEUVE ET L'ANNONCE**
   * (revue #7083, défaut majeur 6). Le compte se prend sur le DOM, pas sur
   * `models` : ce qui a « bougé » pour le lecteur est ce qui est RENDU, et le
   * filtre client peut ne laisser passer aucune ligne de la page neuve. À
   * défaut de carte neuve, le focus retombe sur le bloc — jamais sur
   * `document.body`.
   */
  const postsRef = useRef<HTMLDivElement | null>(null);
  const pendingMore = useRef<number | null>(null);

  const cardsNow = useCallback(
    (): readonly HTMLElement[] => [...(postsRef.current?.querySelectorAll<HTMLElement>('[data-feed-card-id]') ?? [])],
    [],
  );

  const { fetchNextPage: fetchMorePosts } = posts;
  const onMore = useCallback(() => {
    pendingMore.current = cardsNow().length;
    void fetchMorePosts();
  }, [cardsNow, fetchMorePosts]);

  useEffect(() => {
    const before = pendingMore.current;
    if (before === null || posts.isFetchingNextPage) return;
    pendingMore.current = null;
    const cards = cardsNow();
    const added = cards.length - before;
    announce(
      added > 0
        ? translate(language, 'userProfile.posts.loaded', { count: String(added) })
        : translate(language, 'userProfile.posts.loadedNone'),
    );
    const landing = cards[before] ?? postsRef.current;
    if (landing === null || landing === undefined) return;
    landing.tabIndex = -1;
    landing.focus();
    /* `models` referme l'effet sur le rendu qui a POSÉ les cartes neuves. */
  }, [announce, cardsNow, language, models, posts.isFetchingNextPage]);

  return (
    <div data-profile-posts ref={postsRef} className="grid gap-3">
      <ProfileStatsBand language={language} stats={stats} filter={filter} onFilter={onFilter} />
      {posts.isError ? (
        <ProfilePostsError language={language} onRetry={() => void posts.refetch()} />
      ) : posts.isPending ? (
        <span
          aria-busy="true"
          aria-label={translate(language, 'userProfile.posts.loading')}
          className="block rounded-card"
          style={{ height: 140, backgroundColor: 'var(--color-ios-card)' }}
        />
      ) : /* UNE ABSENCE NE S'AFFIRME QUE QUAND PLUS RIEN N'EST À LIRE (revue
            #7083) — miroir de `ProfileUserPostsList.swift:497-510`. */
      showsEmptyState({ visible: models.length, filter, hasNextPage: posts.hasNextPage }) ? (
        <ProfilePostsEmpty language={language} filter={filter} />
      ) : models.length === 0 ? null : (
        models.map((model) => (
          <FeedPostCard
            key={model.id}
            model={model}
            onGesture={gestures.onGesture}
            onShare={gestures.onShare}
            onComment={gestures.onComment}
            onRepost={gestures.onRepost}
            menu={gestures.menu}
            preferredLanguages={readerLanguages}
          />
        ))
      )}
      {/* LA SUITE SE CHARGE SOUS UN FILTRE AUSSI (revue #7083) — iOS ne
          s'arrête pas non plus (`ProfileUserPostsList.swift:246-252`). */}
      {posts.hasNextPage ? <ProfilePostsMore language={language} loading={posts.isFetchingNextPage} online={online} onMore={onMore} /> : null}
    </div>
  );
}
