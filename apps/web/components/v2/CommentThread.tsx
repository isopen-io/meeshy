'use client';

import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { CommentItem } from './CommentItem';
import { Skeleton } from './Skeleton';
import type { PostComment } from '@meeshy/shared/types/post';

export interface CommentThreadProps {
  postId: string;
  parentComment: PostComment;
  replies: PostComment[];
  currentUserId?: string | null;
  userLanguage?: string;
  likedCommentIds?: Set<string>;
  isLoading?: boolean;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  onLikeComment?: (commentId: string) => void;
  onUnlikeComment?: (commentId: string) => void;
  onDeleteComment?: (commentId: string) => void;
  onReply?: (commentId: string) => void;
  className?: string;
}

function CommentThread({
  postId,
  parentComment,
  replies,
  currentUserId,
  userLanguage,
  likedCommentIds = new Set(),
  isLoading = false,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  onLikeComment,
  onUnlikeComment,
  onDeleteComment,
  onReply,
  className,
}: CommentThreadProps) {
  const [expanded, setExpanded] = useState(false);

  const handleExpand = useCallback(() => {
    setExpanded(true);
    onLoadMore?.();
  }, [onLoadMore]);

  if (!expanded && parentComment.replyCount > 0) {
    return (
      <div className={cn('', className)} data-testid={`comment-thread-${parentComment.id}`}>
        <button
          onClick={handleExpand}
          className="flex items-center gap-2 pl-11 py-1.5 text-xs text-[var(--gp-terracotta)] hover:underline transition-colors"
          data-testid="expand-thread"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
          </svg>
          {parentComment.replyCount} {parentComment.replyCount === 1 ? 'reply' : 'replies'}
        </button>
      </div>
    );
  }

  if (!expanded) return null;

  return (
    <div className={cn('', className)} data-testid={`comment-thread-${parentComment.id}`}>
      {isLoading && (
        <div className="pl-11 space-y-3 py-2" data-testid="thread-loading">
          {[1, 2].map((i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="w-6 h-6 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3.5 w-full" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && replies.length === 0 && (
        <p className="pl-11 text-xs text-[var(--gp-text-muted)] py-2">No replies yet.</p>
      )}

      {replies.map((reply) => (
        <CommentItem
          key={reply.id}
          comment={reply}
          userLanguage={userLanguage}
          isAuthor={currentUserId === reply.authorId}
          isLiked={likedCommentIds.has(reply.id)}
          onLike={onLikeComment}
          onUnlike={onUnlikeComment}
          onReply={onReply}
          onDelete={onDeleteComment}
          depth={1}
        />
      ))}

      {hasMore && (
        <button
          onClick={onLoadMore}
          disabled={isLoadingMore}
          className="pl-11 py-1.5 text-xs text-[var(--gp-terracotta)] hover:underline disabled:opacity-50"
          data-testid="load-more-replies"
        >
          {isLoadingMore ? 'Loading...' : 'Load more replies'}
        </button>
      )}
    </div>
  );
}

CommentThread.displayName = 'CommentThread';
export { CommentThread };
