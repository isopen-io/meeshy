'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useToast } from '@/components/v2';
import { ReelPlayer } from '@/components/feed/ReelPlayer';
import { usePostQuery } from '@/hooks/queries/use-post-query';
import { useFeedQuery, useFeedPosts } from '@/hooks/queries/use-feed-query';
import {
  useLikePostMutation,
  useUnlikePostMutation,
  useBookmarkPostMutation,
  useUnbookmarkPostMutation,
  useSharePostMutation,
} from '@/hooks/queries/use-post-mutations';
import { usePostSocketCacheSync } from '@/hooks/queries/use-post-socket-cache-sync';
import { usePreferredLanguage } from '@/hooks/use-post-translation';
import type { Post } from '@meeshy/shared/types/post';

const LIKE_EMOJI = '❤️';

function isReelLiked(post: Post): boolean {
  return (post.currentUserReactions ?? []).includes(LIKE_EMOJI) || (post.isLikedByMe ?? false);
}

/**
 * Immersive reel thread (`/reel/:id`).
 *
 * Resolves the seed reel by id (guaranteed even for deep links) and threads the
 * other reels currently in the feed behind it. Arrow keys / wheel / on-screen
 * chevrons advance through the thread; reaching the tail pulls the next feed
 * page. The dedicated affinity thread (`/feed/reels`) lands in a later phase.
 */
export default function ReelPage() {
  const router = useRouter();
  const params = useParams<{ postId: string }>();
  const postId = params?.postId;
  const userLanguage = usePreferredLanguage();
  const toastCtx = useToast();

  usePostSocketCacheSync();

  const { data: seed, isLoading, isError } = usePostQuery(postId);
  const feedQuery = useFeedQuery();
  const feedPosts = useFeedPosts(feedQuery);

  const likeMutation = useLikePostMutation();
  const unlikeMutation = useUnlikePostMutation();
  const bookmarkMutation = useBookmarkPostMutation();
  const unbookmarkMutation = useUnbookmarkPostMutation();
  const shareMutation = useSharePostMutation();

  // Thread = seed reel first, then the other reels currently in the feed.
  const thread = useMemo(() => {
    if (!seed) return [] as Post[];
    const others = feedPosts.filter((p) => p.type === 'REEL' && p.id !== seed.id);
    return [seed, ...others];
  }, [seed, feedPosts]);

  const [index, setIndex] = useState(0);

  // Clamp index if the thread shrinks (e.g. cache eviction).
  useEffect(() => {
    if (index > thread.length - 1 && thread.length > 0) setIndex(thread.length - 1);
  }, [thread.length, index]);

  // Pull more feed pages as we approach the tail of the thread.
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = feedQuery;
  useEffect(() => {
    if (index >= thread.length - 2 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [index, thread.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const current = thread[index];

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
      toastCtx.addToast('Lien copié !', 'success');
    } catch {
      toastCtx.addToast('Impossible de copier le lien', 'error');
    }
  }, [current, shareMutation, toastCtx]);

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
          <p className="sr-only">Chargement du reel…</p>
        </>
      ) : (
        <>
          <h1 className="text-lg font-semibold">{isError ? 'Reel indisponible' : 'Ce reel n’existe plus'}</h1>
          <p className="max-w-sm text-center text-sm text-white/70">
            {isError ? 'Ce reel est privé ou a été supprimé.' : 'Le reel que vous cherchez est introuvable.'}
          </p>
          <button
            onClick={close}
            className="mt-2 rounded-full bg-white/15 px-6 py-2 text-sm font-medium hover:bg-white/25 transition-colors"
          >
            Retour au fil
          </button>
        </>
      )}
    </main>
  );
}
