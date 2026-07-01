'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useToast } from '@/components/v2';
import { FeedTabs } from '@/components/feed/PostsFeedScreen';
import { ReelPlayer } from '@/components/feed/ReelPlayer';
import { CommentList } from '@/components/v2/CommentList';
import { useReelsFeedQuery, useReelsFeedPosts } from '@/hooks/queries/use-reels-feed-query';
import {
  useLikePostMutation,
  useUnlikePostMutation,
  useBookmarkPostMutation,
  useUnbookmarkPostMutation,
  useSharePostMutation,
} from '@/hooks/queries/use-post-mutations';
import { useCommentsInfiniteQuery, useCommentsList } from '@/hooks/queries/use-comments-query';
import {
  useCreateCommentMutation,
  useLikeCommentMutation,
  useUnlikeCommentMutation,
  useDeleteCommentMutation,
} from '@/hooks/queries/use-comment-mutations';
import { usePostSocketCacheSync } from '@/hooks/queries/use-post-socket-cache-sync';
import { usePostRoom } from '@/hooks/social/use-post-room';
import { usePreferredLanguage } from '@/hooks/use-post-translation';
import { useImpressionTracking } from '@/hooks/use-impression-tracking';
import { useI18n } from '@/hooks/use-i18n';
import { useAuthStore } from '@/stores/auth-store';
import type { Post } from '@meeshy/shared/types/post';
import { copyToClipboard } from '@/lib/clipboard';

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

  const authUser = useAuthStore((s) => s.user);

  const likeMutation = useLikePostMutation();
  const unlikeMutation = useUnlikePostMutation();
  const bookmarkMutation = useBookmarkPostMutation();
  const unbookmarkMutation = useUnbookmarkPostMutation();
  const shareMutation = useSharePostMutation();
  const createCommentMutation = useCreateCommentMutation();
  const likeCommentMutation = useLikeCommentMutation();
  const unlikeCommentMutation = useUnlikeCommentMutation();
  const deleteCommentMutation = useDeleteCommentMutation();

  const [index, setIndex] = useState(0);
  const [showComments, setShowComments] = useState(false);

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
  const currentId = current?.id ?? '';

  // Join the room of the reel on screen so live comments / reactions broadcast
  // to `ROOMS.post(currentId)` surface in the inline comments overlay.
  usePostRoom(currentId || null);

  // Record an impression for whichever reel is on screen (source: 'feed', as iOS).
  const { record: recordImpression } = useImpressionTracking({ source: 'feed' });
  useEffect(() => {
    if (currentId) recordImpression(currentId);
  }, [currentId, recordImpression]);

  // Comments overlay — scoped to the reel in view; reset when the reel changes.
  useEffect(() => setShowComments(false), [currentId]);
  const commentsQuery = useCommentsInfiniteQuery({ postId: currentId, enabled: showComments && !!currentId });
  const comments = useCommentsList(commentsQuery);

  const close = useCallback(() => router.push('/feed/posts'), [router]);

  const handleCloseComments = useCallback(() => setShowComments(false), []);
  const handleSubmitComment = useCallback(
    (content: string, parentId?: string) => {
      if (currentId) createCommentMutation.mutate({ postId: currentId, content, parentId });
    },
    [currentId, createCommentMutation],
  );
  const handleLikeComment = useCallback(
    (commentId: string) => { if (currentId) likeCommentMutation.mutate({ postId: currentId, commentId }); },
    [currentId, likeCommentMutation],
  );
  const handleUnlikeComment = useCallback(
    (commentId: string) => { if (currentId) unlikeCommentMutation.mutate({ postId: currentId, commentId }); },
    [currentId, unlikeCommentMutation],
  );
  const handleDeleteComment = useCallback(
    (commentId: string) => { if (currentId) deleteCommentMutation.mutate({ postId: currentId, commentId }); },
    [currentId, deleteCommentMutation],
  );

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
    const { success } = await copyToClipboard(`${window.location.origin}/reel/${current.id}`);
    if (success) {
      shareMutation.mutate({ postId: current.id });
      toastCtx.addToast(t('linkCopied', 'Link copied!'), 'success');
    } else {
      toastCtx.addToast(t('linkCopyError', "Couldn't copy the link"), 'error');
    }
  }, [current, shareMutation, toastCtx, t]);

  const onComment = useCallback(() => {
    if (current) setShowComments(true);
  }, [current]);

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
    <DashboardLayout title="Reels" hideSearch className="!max-w-none !px-0 !overflow-hidden !h-full relative">
      <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[60] w-full max-w-md px-4">
        <FeedTabs active="reels" />
      </div>
      <div className="relative h-full w-full">
        {content}

        {/* Comments overlay — slides up over the reel instead of navigating away */}
        {showComments && current && (
          <div
            className="absolute inset-0 z-[70] flex flex-col justify-end"
            onClick={handleCloseComments}
            role="dialog"
            aria-modal="true"
            aria-label={t('feed.comments', 'Comments')}
          >
            <div className="absolute inset-0 bg-black/50" />
            <div
              className="relative flex max-h-[70%] flex-col rounded-t-2xl bg-[var(--gp-surface)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-[var(--gp-border)] px-4 py-3">
                <span className="font-semibold text-[var(--gp-text-primary)]">
                  {t('feed.comments', 'Comments')}
                </span>
                <button
                  onClick={handleCloseComments}
                  className="text-[var(--gp-text-muted)] transition-colors hover:text-[var(--gp-text-primary)]"
                  aria-label={t('feed.closeComments', 'Close comments')}
                >
                  ✕
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-3">
                <CommentList
                  postId={currentId}
                  comments={comments}
                  currentUserId={authUser?.id ?? null}
                  currentUser={authUser ? { username: authUser.username, avatar: authUser.avatar } : null}
                  userLanguage={userLanguage}
                  isLoading={commentsQuery.isLoading}
                  hasMore={commentsQuery.hasNextPage}
                  onLoadMore={() => commentsQuery.fetchNextPage()}
                  isLoadingMore={commentsQuery.isFetchingNextPage}
                  onLikeComment={handleLikeComment}
                  onUnlikeComment={handleUnlikeComment}
                  onDeleteComment={handleDeleteComment}
                  onSubmitComment={handleSubmitComment}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

export default ReelsFeedScreen;
