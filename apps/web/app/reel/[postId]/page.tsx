'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useToast } from '@/components/v2';
import { ReelPlayer } from '@/components/feed/ReelPlayer';
import { usePostQuery } from '@/hooks/queries/use-post-query';
import { useReelsFeedQuery, useReelsFeedPosts } from '@/hooks/queries/use-reels-feed-query';
import {
  useLikePostMutation,
  useUnlikePostMutation,
  useBookmarkPostMutation,
  useUnbookmarkPostMutation,
  useSharePostMutation,
} from '@/hooks/queries/use-post-mutations';
import { usePostSocketCacheSync } from '@/hooks/queries/use-post-socket-cache-sync';
import { usePostRoom } from '@/hooks/social/use-post-room';
import { usePreferredLanguage } from '@/hooks/use-post-translation';
import { useImpressionTracking } from '@/hooks/use-impression-tracking';
import { useI18n } from '@/hooks/useI18n';
import type { Post } from '@meeshy/shared/types/post';

const LIKE_EMOJI = '❤️';

function isReelLiked(post: Post): boolean {
  return (post.currentUserReactions ?? []).includes(LIKE_EMOJI) || (post.isLikedByMe ?? false);
}

/**
 * Immersive reel thread (`/reel/:id`).
 *
 * Resolves the seed reel by id (guaranteed even for deep links) and threads the
 * affinity-ranked reels behind it (`/posts/feed/reels?seed=:id`). The gateway
 * excludes the seed from its results, so we prepend it here. Arrow keys / wheel
 * / on-screen chevrons advance through the thread; reaching the tail pulls the
 * next affinity page.
 */
export default function ReelPage() {
  const router = useRouter();
  const params = useParams<{ postId: string }>();
  const postId = params?.postId;
  const userLanguage = usePreferredLanguage();
  const toastCtx = useToast();
  const { t } = useI18n('reel');

  usePostSocketCacheSync();

  const { data: seed, isLoading, isError } = usePostQuery(postId);
  const reelsQuery = useReelsFeedQuery({ seed: postId, enabled: !!postId });
  const affinityReels = useReelsFeedPosts(reelsQuery);

  const likeMutation = useLikePostMutation();
  const unlikeMutation = useUnlikePostMutation();
  const bookmarkMutation = useBookmarkPostMutation();
  const unbookmarkMutation = useUnbookmarkPostMutation();
  const shareMutation = useSharePostMutation();

  // Only a REEL seeds the immersive player; any other post type (stale/scraped
  // link) is treated as unavailable rather than forced into reel chrome.
  const seedIsReel = seed?.type === 'REEL';

  // Thread = seed reel first (excluded by the gateway), then the affinity reels.
  const thread = useMemo(() => {
    if (!seed || !seedIsReel) return [] as Post[];
    const others = affinityReels.filter((p) => p.id !== seed.id);
    return [seed, ...others];
  }, [seed, seedIsReel, affinityReels]);

  const [index, setIndex] = useState(0);

  // Reset to the seed when the route changes — Next.js reuses this mounted
  // component when navigating between two /reel/:id deep links.
  useEffect(() => {
    setIndex(0);
  }, [postId]);

  // Clamp index if the thread shrinks (e.g. cache eviction).
  useEffect(() => {
    if (index > thread.length - 1 && thread.length > 0) setIndex(thread.length - 1);
  }, [thread.length, index]);

  // Pull more affinity pages as we reach i = N - 3 in the thread.
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = reelsQuery;
  useEffect(() => {
    if (thread.length > 0 && index >= thread.length - 3 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [index, thread.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const current = thread[index];
  const currentId = current?.id ?? '';

  // Join the room of the reel currently on screen so live comments / reactions
  // broadcast to `ROOMS.post(currentId)` reach the viewer. Re-joins as the
  // thread advances (leave previous reel, join next).
  usePostRoom(currentId || null);

  // Record an impression for whichever reel is on screen (source: 'feed', as iOS).
  const { record: recordImpression } = useImpressionTracking({ source: 'feed' });
  useEffect(() => {
    if (currentId) recordImpression(currentId);
  }, [currentId, recordImpression]);

  const close = useCallback(() => {
    if (window.history.length > 1) router.back();
    else router.push('/feed/posts');
  }, [router]);

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

  if (current) {
    return (
      <ReelPlayer
        key={current.id}
        reel={current}
        index={index}
        total={thread.length}
        hasPrev={index > 0}
        hasNext={index < thread.length - 1}
        isLiked={isReelLiked(current)}
        isBookmarked={!!current.bookmarkedAt}
        userLanguage={userLanguage}
        onPrev={() => setIndex((i) => Math.max(0, i - 1))}
        onNext={() => setIndex((i) => Math.min(thread.length - 1, i + 1))}
        onClose={close}
        onLike={onLike}
        onComment={onComment}
        onShare={onShare}
        onBookmark={onBookmark}
      />
    );
  }

  return (
    <main className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black text-white">
      {isLoading ? (
        <>
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-white" aria-hidden="true" />
          <p className="sr-only">{t('loading', 'Loading reel…')}</p>
        </>
      ) : (
        <>
          <h1 className="text-lg font-semibold">
            {isError
              ? t('unavailableTitle', 'Reel unavailable')
              : seed && !seedIsReel
                ? t('notAReelTitle', "This content isn't a reel")
                : t('goneTitle', 'This reel no longer exists')}
          </h1>
          <p className="max-w-sm text-center text-sm text-white/70">
            {isError
              ? t('unavailableBody', 'This reel is private or has been deleted.')
              : seed && !seedIsReel
                ? t('notAReelBody', 'The link points to a post, not a reel.')
                : t('goneBody', "The reel you're looking for can't be found.")}
          </p>
          <button
            onClick={close}
            className="mt-2 rounded-full bg-white/15 px-6 py-2 text-sm font-medium hover:bg-white/25 transition-colors"
          >
            {t('backToFeed', 'Back to feed')}
          </button>
        </>
      )}
    </main>
  );
}
