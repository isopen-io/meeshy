'use client';

import { useState, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { CommentItem } from './CommentItem';
import { CommentComposer } from './CommentComposer';
import { Skeleton } from './Skeleton';
import type { PostComment } from '@meeshy/shared/types/post';

export interface CommentListProps {
  postId: string;
  comments: PostComment[];
  currentUserId?: string | null;
  currentUser?: { username: string; avatar?: string | null } | null;
  userLanguage?: string;
  likedCommentIds?: Set<string>;
  isLoading?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
  onLikeComment?: (commentId: string) => void;
  onUnlikeComment?: (commentId: string) => void;
  onDeleteComment?: (commentId: string) => void;
  onSubmitComment?: (content: string, parentId?: string) => void;
  onShowReplies?: (commentId: string) => void;
  /** Commentaire ciblé par une navigation depuis une notification : on défile
   *  jusqu'à lui et on le surligne brièvement dès qu'il est rendu. */
  targetCommentId?: string | null;
  className?: string;
}

function CommentList({
  postId,
  comments,
  currentUserId,
  currentUser,
  userLanguage,
  likedCommentIds = new Set(),
  isLoading = false,
  hasMore = false,
  onLoadMore,
  isLoadingMore = false,
  onLikeComment,
  onUnlikeComment,
  onDeleteComment,
  onSubmitComment,
  onShowReplies,
  targetCommentId,
  className,
}: CommentListProps) {
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [replyToAuthor, setReplyToAuthor] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  // Notification → comment navigation: once the target comment is in the list,
  // scroll to it and pulse a highlight. Re-runs if the target changes or the
  // comment arrives in a later page load. No-op when the id isn't (yet) present.
  useEffect(() => {
    if (!targetCommentId) return;
    if (!comments.some((c) => c.id === targetCommentId)) return;

    const el = typeof document !== 'undefined'
      ? document.getElementById(`comment-${targetCommentId}`)
      : null;
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedId(targetCommentId);
    const timer = setTimeout(() => setHighlightedId(null), 2600);
    return () => clearTimeout(timer);
  }, [targetCommentId, comments]);

  const handleReply = useCallback(
    (commentId: string) => {
      const comment = comments.find((c) => c.id === commentId);
      setReplyToId(commentId);
      setReplyToAuthor(comment?.author?.displayName ?? comment?.author?.username ?? null);
    },
    [comments],
  );

  const handleCancelReply = useCallback(() => {
    setReplyToId(null);
    setReplyToAuthor(null);
  }, []);

  const handleSubmit = useCallback(
    (content: string, parentId?: string) => {
      onSubmitComment?.(content, parentId);
      handleCancelReply();
    },
    [onSubmitComment, handleCancelReply],
  );

  if (isLoading) {
    return (
      <div className={cn('space-y-3', className)} data-testid="comments-loading">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-4 w-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={cn('', className)} data-testid="comment-list">
      {comments.length === 0 && (
        <p className="text-sm text-[var(--gp-text-muted)] text-center py-6" data-testid="comments-empty">
          No comments yet. Be the first to comment!
        </p>
      )}

      {comments.map((comment) => (
        <CommentItem
          key={comment.id}
          comment={comment}
          userLanguage={userLanguage}
          isAuthor={currentUserId === comment.authorId}
          isLiked={likedCommentIds.has(comment.id)}
          onLike={onLikeComment}
          onUnlike={onUnlikeComment}
          onReply={handleReply}
          onDelete={onDeleteComment}
          onShowReplies={onShowReplies}
          isHighlighted={highlightedId === comment.id}
        />
      ))}

      {hasMore && (
        <button
          onClick={onLoadMore}
          disabled={isLoadingMore}
          className="w-full py-2 text-sm text-[var(--gp-terracotta)] hover:underline disabled:opacity-50"
          data-testid="load-more-comments"
        >
          {isLoadingMore ? 'Loading...' : 'Load more comments'}
        </button>
      )}

      {onSubmitComment && (
        <div className="pt-3 border-t border-[var(--gp-border)]">
          <CommentComposer
            postId={postId}
            parentId={replyToId}
            parentAuthor={replyToAuthor}
            currentUser={currentUser}
            onSubmit={handleSubmit}
            onCancelReply={handleCancelReply}
          />
        </div>
      )}
    </div>
  );
}

CommentList.displayName = 'CommentList';
export { CommentList };
