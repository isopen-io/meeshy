import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo, type RefObject } from 'react';

import { FeedPostCard } from '@/components/feed-post-card';
import { Glyph } from '@/components/glyph';
import { LiveAnnouncement } from '@/components/live-announcement';
import { SECTION_CARD_STYLE, SECTION_INK, SECTION_INK_2 } from '@/components/grouped-section';
import { communityPostsInfiniteOptions, flattenCommunityPosts } from '@/lib/api/community-posts';
import { apiDeps } from '@/lib/api/deps';
import { appQueryClient } from '@/lib/api/query-client';
import { resolveFeedCardModel } from '@/lib/feed/card-model';
import { translateCommunityPosts } from '@/lib/i18n-community-posts-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { useListingSessionId } from '@/lib/telemetry/listing-session';
import { listingAt } from '@/lib/telemetry/served-listing';
import { useLoadMoreSentinel } from '@/lib/view/use-load-more-sentinel';
import { useMinute } from '@/lib/view/use-minute';
import { usePostGesture } from '@/lib/view/use-post-gesture';
import { useReaderLanguages } from '@/lib/view/use-reader';
import { communityPanelId, communityTabId } from '@/routes/community-tabs';

/**
 * **LES PUBLICATIONS D'UNE COMMUNAUTÉ** (#6379) — l'onglet « Publications » du
 * détail, miroir de `postsSection` (`CommunityDetailScreen.swift`), servi par
 * le port `community-posts.ts`. Chargé à la demande : ouvrir le détail ne tire
 * ni le fil ni ses cartes tant que l'onglet n'est pas choisi.
 *
 * **Cache d'abord.** La caisse est au registre des cartes ; revenir sur
 * l'onglet repeint ce qu'elle tient et se revalide en fond. Le squelette n'est
 * dessiné que sur un cache vide.
 *
 * **La même carte que le Flux** (`FeedPostCard`), les mêmes gestes
 * (`usePostGesture` : cœur, signet, partage, commentaire, republication, menu)
 * et le même Prisme : chaque carte descend les langues du lecteur
 * (`resolveFeedCardModel`).
 *
 * **États dessinés** : chargement, vide (« Aucune publication pour
 * l'instant »), échec avec « Réessayer », hors ligne sur un cache vide, et la
 * suite chargée à l'approche du bas, comme les conversations.
 */
export default function CommunityPostsPanel({
  language,
  communityId,
  online,
  scroller,
}: {
  readonly language: InterfaceLanguage;
  readonly communityId: string;
  readonly online: boolean;
  readonly scroller: RefObject<HTMLElement | null>;
}) {
  const minute = useMinute();
  const listingSessionId = useListingSessionId();
  const { languages: readerLanguages } = useReaderLanguages();
  const { announcement, onGesture, onShare, onComment, onRepost, repostConfirm, menu } = usePostGesture();

  const posts = useInfiniteQuery({ ...communityPostsInfiniteOptions({ ...apiDeps, communityId }) }, appQueryClient);

  const models = useMemo(
    () => flattenCommunityPosts(posts.data).map((post) => resolveFeedCardModel(post, { preferredLanguages: readerLanguages, now: new Date() })),
    // `minute` réévalue `new Date()` — même motif que `feed.tsx` et `user-profile-posts.tsx`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [posts.data, readerLanguages, minute],
  );

  const sentinel = useLoadMoreSentinel({
    root: scroller,
    rootMargin: '0px 0px 480px 0px',
    enabled: posts.hasNextPage && !posts.isFetchingNextPage && !posts.isFetchNextPageError,
    onReach: () => void posts.fetchNextPage(),
  });

  const body =
    posts.data === undefined ? (
      posts.isError ? (
        <CommunityPostsFailure language={language} online={online} onRetry={() => void posts.refetch()} />
      ) : (
        <span
          aria-busy="true"
          aria-label={translateCommunityPosts(language, 'community.posts.loading')}
          data-community-posts-loading
          className="block rounded-card"
          style={{ ...SECTION_CARD_STYLE, height: 160 }}
        />
      )
    ) : models.length === 0 && !posts.hasNextPage ? (
      <CommunityPostsEmpty language={language} />
    ) : (
      <>
        {models.map((model, index) => (
          <FeedPostCard
            key={model.id}
            model={model}
            listing={listingAt({ position: index, fallbackSource: 'other', listingSessionId })}
            impressionSource="feed"
            impressionSurface="community"
            onGesture={onGesture}
            onShare={onShare}
            onComment={onComment}
            onRepost={onRepost}
            menu={menu}
            preferredLanguages={readerLanguages}
          />
        ))}
        {posts.hasNextPage ? <span ref={sentinel.observe} aria-hidden="true" style={{ display: 'block', height: 1 }} /> : null}
        {posts.isFetchingNextPage ? (
          <p role="status" className="text-center text-caption" style={{ color: SECTION_INK_2 }}>
            {translateCommunityPosts(language, 'community.posts.loadingMore')}
          </p>
        ) : null}
        {posts.isFetchNextPageError ? (
          <CommunityPostsFailure language={language} online={online} onRetry={() => void posts.fetchNextPage()} />
        ) : null}
      </>
    );

  return (
    <section id={communityPanelId('posts')} role="tabpanel" aria-labelledby={communityTabId('posts')} data-community-posts className="grid gap-3">
      {body}
      <LiveAnnouncement text={announcement} tone="neutral" marker="communityPosts" />
      {repostConfirm}
    </section>
  );
}

export function CommunityPostsEmpty({ language }: { readonly language: InterfaceLanguage }) {
  return (
    <div data-community-posts-empty className="grid justify-items-center gap-2 rounded-card px-6 py-8 text-center" style={SECTION_CARD_STYLE}>
      <span aria-hidden="true" style={{ color: SECTION_INK_2 }}>
        <Glyph name="image" size={28} />
      </span>
      <p className="text-body font-semibold" style={{ color: SECTION_INK }}>
        {translateCommunityPosts(language, 'community.posts.empty.title')}
      </p>
      <p className="text-caption" style={{ color: SECTION_INK_2 }}>
        {translateCommunityPosts(language, 'community.posts.empty.body')}
      </p>
    </div>
  );
}

export function CommunityPostsFailure({ language, online, onRetry }: { readonly language: InterfaceLanguage; readonly online: boolean; readonly onRetry: () => void }) {
  return (
    <div role="alert" data-community-posts-error className="grid justify-items-center gap-3 rounded-card px-6 py-8 text-center" style={SECTION_CARD_STYLE}>
      <span aria-hidden="true" style={{ color: online ? 'var(--color-error)' : 'var(--color-warning)' }}>
        <Glyph name="warningCircle" size={28} />
      </span>
      <p className="text-body font-semibold" style={{ color: SECTION_INK }}>
        {translateCommunityPosts(language, online ? 'community.posts.error.title' : 'community.posts.error.offline')}
      </p>
      <button
        type="button"
        data-community-posts-retry
        onClick={onRetry}
        className="grid place-items-center rounded-chip px-5 text-caption font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ minHeight: 44, backgroundColor: 'var(--ios-indigo-600)', color: 'var(--color-ios-on-brand)', outlineColor: 'var(--color-ios-brand)' }}
      >
        {translateCommunityPosts(language, 'community.posts.retry')}
      </button>
    </div>
  );
}
