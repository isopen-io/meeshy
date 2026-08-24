'use client';

import { Fragment, useState, useCallback, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { CommentItem } from './CommentItem';
import { CommentThread } from './CommentThread';
import { CommentComposer } from './CommentComposer';
import { Skeleton } from './Skeleton';
import { isHeartLikedByMe } from '@/lib/reactions';
import { useCommentRepliesQuery, useCommentRepliesList } from '@/hooks/queries/use-comments-query';
import type { PostComment } from '@meeshy/shared/types/post';

/** Borne de la « chasse » aux pages (top-level ET réponses) quand la cible
 *  d'une navigation notification n'est pas dans les pages déjà chargées :
 *  on suit le curseur au plus 15 pages, puis on abandonne (top-level) ou on
 *  retombe sur le parent (réponse). */
export const MAX_TARGET_HUNT_PAGES = 15;

const HIGHLIGHT_DURATION_MS = 2600;

export interface CommentListProps {
  postId: string;
  comments: PostComment[];
  currentUserId?: string | null;
  currentUser?: { username: string; avatar?: string | null } | null;
  userLanguage?: string;
  /** Prisme ORDONNÉ du lecteur (rangs 1→4 + fallback), descendu par chaque
   *  commentaire et réponse. Cf. `CommentItemProps.preferredLanguages`. */
  preferredLanguages?: string[];
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
  /** Parent top-level quand `targetCommentId` est une RÉPONSE : on chasse le
   *  parent dans les pages top-level, on déplie son thread, puis on chasse la
   *  réponse dans les pages du thread (fallback : le parent). */
  targetParentCommentId?: string | null;
  className?: string;
}

// ---------------------------------------------------------------------------
// CommentReplies — thread de réponses d'un commentaire top-level.
// Possède la query infinie des réponses (activée à l'expansion) et la chasse
// bornée de la réponse ciblée ; le rendu est délégué à CommentThread.
// ---------------------------------------------------------------------------

interface CommentRepliesProps {
  postId: string;
  parentComment: PostComment;
  expanded: boolean;
  currentUserId?: string | null;
  userLanguage?: string;
  preferredLanguages?: string[];
  likedCommentIds: Set<string>;
  highlightedReplyId: string | null;
  /** Réponse à atteindre dans ce thread (déjà filtrée sur le bon parent). */
  targetReplyId: string | null;
  onTargetReplyFound: (replyId: string) => void;
  onTargetReplyMissing: () => void;
  onLikeComment?: (commentId: string) => void;
  onUnlikeComment?: (commentId: string) => void;
  onDeleteComment?: (commentId: string) => void;
  onReply?: (commentId: string) => void;
}

function CommentReplies({
  postId,
  parentComment,
  expanded,
  currentUserId,
  userLanguage,
  preferredLanguages,
  likedCommentIds,
  highlightedReplyId,
  targetReplyId,
  onTargetReplyFound,
  onTargetReplyMissing,
  onLikeComment,
  onUnlikeComment,
  onDeleteComment,
  onReply,
}: CommentRepliesProps) {
  const repliesQuery = useCommentRepliesQuery({
    postId,
    commentId: parentComment.id,
    enabled: expanded,
  });
  const replies = useCommentRepliesList(repliesQuery);
  const { isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } = repliesQuery;
  const hasLoadedPages = repliesQuery.data !== undefined;

  const huntedPagesRef = useRef(0);
  const resolvedRef = useRef<'found' | 'missing' | null>(null);
  useEffect(() => {
    huntedPagesRef.current = 0;
    resolvedRef.current = null;
  }, [targetReplyId]);

  const targetInReplies =
    targetReplyId != null && replies.some((reply) => reply.id === targetReplyId);

  // Ciblage d'une réponse : les pages du thread sont ASC (curseur `gt`), une
  // réponse récente sur un long thread exige donc de suivre le curseur. Chasse
  // BORNÉE à MAX_TARGET_HUNT_PAGES ; épuisée → fallback sur le parent.
  useEffect(() => {
    if (!expanded || !targetReplyId || resolvedRef.current) return;
    if (targetInReplies) {
      resolvedRef.current = 'found';
      onTargetReplyFound(targetReplyId);
      return;
    }
    if (isLoading || isFetchingNextPage) return;
    if (hasNextPage && huntedPagesRef.current < MAX_TARGET_HUNT_PAGES) {
      huntedPagesRef.current += 1;
      fetchNextPage();
      return;
    }
    if (hasLoadedPages) {
      resolvedRef.current = 'missing';
      onTargetReplyMissing();
    }
  }, [
    expanded,
    targetReplyId,
    targetInReplies,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    hasLoadedPages,
    onTargetReplyFound,
    onTargetReplyMissing,
  ]);

  const handleLoadMore = useCallback(() => {
    if (hasNextPage) fetchNextPage();
  }, [hasNextPage, fetchNextPage]);

  return (
    <CommentThread
      postId={postId}
      parentComment={parentComment}
      replies={replies}
      currentUserId={currentUserId}
      userLanguage={userLanguage}
      preferredLanguages={preferredLanguages}
      likedCommentIds={likedCommentIds}
      isLoading={expanded && isLoading}
      hasMore={hasNextPage ?? false}
      isLoadingMore={isFetchingNextPage}
      onLoadMore={handleLoadMore}
      onLikeComment={onLikeComment}
      onUnlikeComment={onUnlikeComment}
      onDeleteComment={onDeleteComment}
      onReply={onReply}
      expanded={expanded}
      highlightedReplyId={highlightedReplyId}
    />
  );
}

// ---------------------------------------------------------------------------
// CommentList
// ---------------------------------------------------------------------------

function CommentList({
  postId,
  comments,
  currentUserId,
  currentUser,
  userLanguage,
  preferredLanguages,
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
  targetParentCommentId,
  className,
}: CommentListProps) {
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [replyToAuthor, setReplyToAuthor] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());

  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    },
    [],
  );

  const scrollAndHighlight = useCallback((commentId: string) => {
    const el = typeof document !== 'undefined'
      ? document.getElementById(`comment-${commentId}`)
      : null;
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedId(commentId);
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => setHighlightedId(null), HIGHLIGHT_DURATION_MS);
  }, []);

  // L'ancre à trouver dans les top-level : le parent quand la cible est une
  // réponse, la cible elle-même sinon.
  const anchorCommentId = targetParentCommentId ?? targetCommentId ?? null;
  const anchorInList =
    anchorCommentId != null && comments.some((c) => c.id === anchorCommentId);

  // Chasse top-level BORNÉE : l'ancre n'est pas dans les pages chargées → on
  // suit le curseur (fetchNextPage via onLoadMore), MAX_TARGET_HUNT_PAGES max.
  const huntedPagesRef = useRef(0);
  useEffect(() => {
    huntedPagesRef.current = 0;
  }, [anchorCommentId]);

  useEffect(() => {
    if (!anchorCommentId || anchorInList) return;
    if (!hasMore || isLoadingMore) return;
    if (huntedPagesRef.current >= MAX_TARGET_HUNT_PAGES) return;
    huntedPagesRef.current += 1;
    onLoadMore?.();
  }, [anchorCommentId, anchorInList, comments, hasMore, isLoadingMore, onLoadMore]);

  // Cible top-level : dès qu'elle est rendue, scroll + surlignage bref.
  // (La cible-réponse est résolue par son CommentReplies, plus bas.)
  useEffect(() => {
    if (!targetCommentId || targetParentCommentId) return;
    if (!comments.some((c) => c.id === targetCommentId)) return;
    scrollAndHighlight(targetCommentId);
  }, [targetCommentId, targetParentCommentId, comments, scrollAndHighlight]);

  // Cible-réponse : le parent est arrivé → expansion automatique de son thread.
  useEffect(() => {
    if (!targetParentCommentId || !targetCommentId || !anchorInList) return;
    setExpandedThreads((prev) =>
      prev.has(targetParentCommentId) ? prev : new Set(prev).add(targetParentCommentId),
    );
  }, [targetParentCommentId, targetCommentId, anchorInList]);

  const handleToggleReplies = useCallback(
    (commentId: string) => {
      setExpandedThreads((prev) => {
        const next = new Set(prev);
        if (next.has(commentId)) next.delete(commentId);
        else next.add(commentId);
        return next;
      });
      onShowReplies?.(commentId);
    },
    [onShowReplies],
  );

  const handleReplyTargetFound = useCallback(
    (replyId: string) => scrollAndHighlight(replyId),
    [scrollAndHighlight],
  );

  const handleReplyTargetMissing = useCallback(() => {
    if (targetParentCommentId) scrollAndHighlight(targetParentCommentId);
  }, [targetParentCommentId, scrollAndHighlight]);

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
        <Fragment key={comment.id}>
          <CommentItem
            comment={comment}
            userLanguage={userLanguage}
            preferredLanguages={preferredLanguages}
            isAuthor={currentUserId === comment.authorId}
            isLiked={likedCommentIds.has(comment.id) || isHeartLikedByMe(comment)}
            onLike={onLikeComment}
            onUnlike={onUnlikeComment}
            onReply={handleReply}
            onDelete={onDeleteComment}
            onShowReplies={handleToggleReplies}
            isHighlighted={highlightedId === comment.id}
          />
          {comment.replyCount > 0 && (
            <CommentReplies
              postId={postId}
              parentComment={comment}
              expanded={expandedThreads.has(comment.id)}
              currentUserId={currentUserId}
              userLanguage={userLanguage}
              preferredLanguages={preferredLanguages}
              likedCommentIds={likedCommentIds}
              highlightedReplyId={highlightedId}
              targetReplyId={
                targetParentCommentId === comment.id ? targetCommentId ?? null : null
              }
              onTargetReplyFound={handleReplyTargetFound}
              onTargetReplyMissing={handleReplyTargetMissing}
              onLikeComment={onLikeComment}
              onUnlikeComment={onUnlikeComment}
              onDeleteComment={onDeleteComment}
              onReply={() => handleReply(comment.id)}
            />
          )}
        </Fragment>
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
