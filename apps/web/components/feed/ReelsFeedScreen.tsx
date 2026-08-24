'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useToast } from '@/components/v2';
import { FeedTabs } from '@/components/feed/PostsFeedScreen';
import { ReelPlayer } from '@/components/feed/ReelPlayer';
import { CommentList } from '@/components/v2/CommentList';
import { RepostModal } from '@/components/v2/RepostModal';
import { useReelsFeedQuery, useReelsFeedPosts } from '@/hooks/queries/use-reels-feed-query';
import {
  useLikePostMutation,
  useUnlikePostMutation,
  useBookmarkPostMutation,
  useUnbookmarkPostMutation,
  useRepostMutation,
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
import { usePreferredLanguage, usePreferredLanguages } from '@/hooks/use-post-translation';
import { useImpressionTracking } from '@/hooks/use-impression-tracking';
import { useI18n } from '@/hooks/use-i18n';
import { useAuthStore } from '@/stores/auth-store';
import type { Post } from '@meeshy/shared/types/post';
import { repostTargetId } from '@meeshy/shared/utils/repost-target';
import { isHeartLikedByMe } from '@/lib/reactions';
import { shareLink } from '@/lib/share-utils';
import { reportService } from '@/services/report.service';
import { postsService } from '@/services/posts.service';

function isReelLiked(post: Post): boolean {
  return isHeartLikedByMe(post);
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
  const preferredLanguages = usePreferredLanguages();
  const toastCtx = useToast();

  usePostSocketCacheSync();

  const reelsQuery = useReelsFeedQuery();
  const reels = useReelsFeedPosts(reelsQuery);

  const authUser = useAuthStore((s) => s.user);

  const likeMutation = useLikePostMutation();
  const unlikeMutation = useUnlikePostMutation();
  const bookmarkMutation = useBookmarkPostMutation();
  const unbookmarkMutation = useUnbookmarkPostMutation();
  const repostMutation = useRepostMutation();
  const createCommentMutation = useCreateCommentMutation();
  const likeCommentMutation = useLikeCommentMutation();
  const unlikeCommentMutation = useUnlikeCommentMutation();
  const deleteCommentMutation = useDeleteCommentMutation();

  const [index, setIndex] = useState(0);
  const [showComments, setShowComments] = useState(false);
  const [repostModalOpen, setRepostModalOpen] = useState(false);

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
    const localUrl = `${window.location.origin}/reel/${current.id}`;
    const title = current.author?.displayName ?? current.author?.username ?? 'Meeshy';
    const hasNativeShare = typeof navigator !== 'undefined' && !!navigator.share;
    try {
      const { shortUrl } = await postsService.sharePost(current.id, { generateLink: true });
      const shared = await shareLink(shortUrl ?? localUrl, title, current.content ?? '');
      if (shared) {
        toastCtx.addToast(t('shared', 'Shared!'), 'success');
      } else if (!hasNativeShare) {
        toastCtx.addToast(t('linkCopied', 'Link copied!'), 'success');
      }
      // else: native share sheet dismissed — nothing was copied, no toast
    } catch {
      toastCtx.addToast(t('linkCopyError', "Couldn't share the reel"), 'error');
    }
  }, [current, toastCtx, t]);

  const onComment = useCallback(() => {
    if (current) setShowComments(true);
  }, [current]);

  const onReport = useCallback(() => {
    if (!current) return;
    if (!window.confirm(t('report.confirm', 'Report this reel?'))) return;
    reportService
      .reportPost(current.id, 'inappropriate', '')
      .then(() => toastCtx.addToast(t('report.success', 'Reel reported'), 'success'))
      .catch(() => toastCtx.addToast(t('report.error', "Couldn't report the reel"), 'error'));
  }, [current, toastCtx, t]);

  const onRepost = useCallback(() => {
    if (current) setRepostModalOpen(true);
  }, [current]);

  const handleRepost = useCallback(() => {
    if (!current) return;
    repostMutation.mutate(
      // Loi du miroir : un réel repartagé RESTE un réel. Sans `targetType`, le
      // gateway retombait sur `?? POST` et le repost quittait le fil des réels.
      // Le format vient de la CARTE agie — ce fil affiche aussi des reposts, et
      // `current.repostOf` porterait le format de la RACINE, pas celui-ci.
      { postId: repostTargetId(current), data: { isQuote: false, targetType: current.type } },
      {
        onSuccess: () => {
          setRepostModalOpen(false);
          toastCtx.addToast(t('repost.success', 'Reposted!'), 'success');
        },
        onError: () => toastCtx.addToast(t('repost.error', "Couldn't repost"), 'error'),
      },
    );
  }, [current, repostMutation, toastCtx, t]);

  const handleQuote = useCallback(
    (quoteContent: string) => {
      if (!current) return;
      repostMutation.mutate(
        // La citation publie autant que le repost sec : elle porte la même loi.
        { postId: repostTargetId(current), data: { content: quoteContent, isQuote: true, targetType: current.type } },
        {
          onSuccess: () => {
            setRepostModalOpen(false);
            toastCtx.addToast(t('repost.quoted', 'Quoted!'), 'success');
          },
          onError: () => toastCtx.addToast(t('repost.error', "Couldn't repost"), 'error'),
        },
      );
    },
    [current, repostMutation, toastCtx, t],
  );

  const onDownload = useCallback((mediaId: string, owningPostId: string) => {
    postsService.recordMediaDownloads(owningPostId, [mediaId], 'reel');
  }, []);

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
          onReport={authUser?.id !== current.authorId ? onReport : undefined}
          onRepost={onRepost}
          onDownload={onDownload}
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
  }, [current, index, reels.length, userLanguage, close, onLike, onComment, onShare, onBookmark, onReport, onRepost, onDownload, reelsQuery, t, authUser]);

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
                  preferredLanguages={preferredLanguages}
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

      {/* Repost Modal */}
      {repostModalOpen && current && (
        <RepostModal
          open
          originalAuthor={current.author?.displayName ?? current.author?.username}
          originalContent={current.content ?? undefined}
          onRepost={handleRepost}
          onQuote={handleQuote}
          onClose={() => setRepostModalOpen(false)}
          saving={repostMutation.isPending}
        />
      )}
    </DashboardLayout>
  );
}

export default ReelsFeedScreen;
