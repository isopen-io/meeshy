'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useToast } from '@/components/v2';
import { ReelPlayer } from '@/components/feed/ReelPlayer';
import { useReelsFeedQuery, useReelsFeedPosts } from '@/hooks/queries/use-reels-feed-query';
import {
  useLikePostMutation,
  useUnlikePostMutation,
  useBookmarkPostMutation,
  useUnbookmarkPostMutation,
  useSharePostMutation,
} from '@/hooks/queries/use-post-mutations';
import { usePostSocketCacheSync } from '@/hooks/queries/use-post-socket-cache-sync';
import { usePreferredLanguage } from '@/hooks/use-post-translation';
import { useI18n } from '@/hooks/use-i18n';
import type { Post } from '@meeshy/shared/types/post';

const LIKE_EMOJI = '❤️';

function isReelLiked(post: Post): boolean {
  return (post.currentUserReactions ?? []).includes(LIKE_EMOJI) || (post.isLikedByMe ?? false);
}

/**
 * ReelsFeedScreen — the `/feed/reels` tab.
 *
 * A near-full-screen, autoplaying vertical reel player fed by the personalised
 * affinity thread (`/posts/feed/reels` without a seed → "Pour toi"). Scroll,
 * arrow keys and on-screen chevrons advance one reel at a time; reaching the
 * tail pulls the next page. The player sits inside the shared
 * {@link DashboardLayout} chrome (header + nav) for visual parity with the rest
 * of the web app, hence `embedded`.
 */
export function ReelsFeedScreen() {
  const router = useRouter();
  const { t } = useI18n('reel');
  const userLanguage = usePreferredLanguage();
  const toastCtx = useToast();

  usePostSocketCacheSync();

  const reelsQuery = useReelsFeedQuery();
  const reels = useReelsFeedPosts(reelsQuery);

  const likeMutation = useLikePostMutation();
  const unlikeMutation = useUnlikePostMutation();
  const bookmarkMutation = useBookmarkPostMutation();
  const unbookmarkMutation = useUnbookmarkPostMutation();
  const shareMutation = useSharePostMutation();

  const [index, setIndex] = useState(0);

  // Clamp the cursor if the thread shrinks (cache eviction / refetch).
  useEffect(() => {
    if (index > reels.length - 1 && reels.length > 0) setIndex(reels.length - 1);
  }, [reels.length, index]);

  // Pull more reels as we reach i = N - 3 in the thread.
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = reelsQuery;
  useEffect(() => {
    if (reels.length > 0 && index >= reels.length - 3 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [index, reels.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const current = reels[index];

  const close = useCallback(() => router.push('/feed/posts'), [router]);

  const onLike = useCallback(() => {
    if (!current) return;
    if (isReelLiked(current)) unlikeMutation.mutate({ postId: current.id });
    else likeMutation.mutate({ postId: current.id });
  }, [current, likeMutation, unlikeMutation]);

  const onBookmark = useCallback(() => {
    if (!current) return;
    if (current.bookmarkedAt) unbookmarkMutation.mutate(current.id);
    else bookmarkMutation.mutate(current.id);
  }, [current, bookmarkMutation, unbookmarkMutation]);

  const onShare = useCallback(async () => {
    if (!current) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/reel/${current.id}`);
      shareMutation.mutate({ postId: current.id });
      toastCtx.addToast(t('linkCopied', 'Link copied!'), 'success');
    } catch {
      toastCtx.addToast(t('linkCopyError', "Couldn't copy the link"), 'error');
    }
  }, [current, shareMutation, toastCtx, t]);

  const onComment = useCallback(() => {
    if (current) router.push(`/feeds/post/${current.id}`);
  }, [current, router]);

  const content = useMemo(() => {
    if (current) {
      return (
        <ReelPlayer
          key={current.id}
          reel={current}
          index={index}
          total={reels.length}
          hasPrev={index > 0}
          hasNext={index < reels.length - 1}
          isLiked={isReelLiked(current)}
          isBookmarked={!!current.bookmarkedAt}
          userLanguage={userLanguage}
          embedded
          onPrev={() => setIndex((i) => Math.max(0, i - 1))}
          onNext={() => setIndex((i) => Math.min(reels.length - 1, i + 1))}
          onClose={close}
          onLike={onLike}
          onComment={onComment}
          onShare={onShare}
          onBookmark={onBookmark}
        />
      );
    }

    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black text-white">
        {reelsQuery.isLoading ? (
          <>
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-white" aria-hidden="true" />
            <p className="sr-only">{t('feed.loadingReels', 'Loading reels…')}</p>
          </>
        ) : reelsQuery.isError ? (
          <>
            <h1 className="text-lg font-semibold">{t('feed.errorTitle', 'Reels unavailable')}</h1>
            <button
              onClick={() => reelsQuery.refetch()}
              className="mt-2 rounded-full bg-white/15 px-6 py-2 text-sm font-medium transition-colors hover:bg-white/25"
            >
              {t('feed.retry', 'Try again')}
            </button>
          </>
        ) : (
          <>
            <h1 className="text-lg font-semibold">{t('feed.emptyTitle', 'No reels yet')}</h1>
            <p className="max-w-sm text-center text-sm text-white/70">
              {t('feed.emptyBody', "Come back later or explore your network's posts.")}
            </p>
            <button
              onClick={close}
              className="mt-2 rounded-full bg-white/15 px-6 py-2 text-sm font-medium transition-colors hover:bg-white/25"
            >
              {t('feed.seePosts', 'See posts')}
            </button>
          </>
        )}
      </div>
    );
  }, [current, index, reels.length, userLanguage, close, onLike, onComment, onShare, onBookmark, reelsQuery, t]);

  return (
    <DashboardLayout title="Reels" hideSearch className="!max-w-none !px-0 !overflow-hidden !h-full">
      <div className="relative h-full w-full">{content}</div>
    </DashboardLayout>
  );
}

export default ReelsFeedScreen;
