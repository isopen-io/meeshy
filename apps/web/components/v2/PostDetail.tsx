'use client';

import { useCallback, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { Avatar } from './Avatar';
import { LanguageOrb } from './LanguageOrb';
import { TranslationToggle } from './TranslationToggle';
import { CommentList } from './CommentList';
import type { TranslationItem } from './TranslationToggle';
import type { Post, PostComment } from '@meeshy/shared/types/post';
import { getLanguageName } from './flags';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const REACTION_EMOJIS = ['❤️', '🔥', '😂', '😮', '😢', '👏'];

function formatTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function postTranslationsToItems(translations: unknown): TranslationItem[] {
  if (!translations || typeof translations !== 'object') return [];
  return Object.entries(translations as Record<string, { text?: string }>)
    .filter(([, v]) => v && typeof v.text === 'string')
    .map(([lang, v]) => ({
      languageCode: lang,
      languageName: lang.toUpperCase(),
      content: v.text!,
    }));
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PostDetailProps {
  post: Post;
  comments: PostComment[];
  currentUserId?: string | null;
  currentUser?: { username: string; avatar?: string | null } | null;
  userLanguage?: string;
  isLiked?: boolean;
  isBookmarked?: boolean;
  userReaction?: string;
  likedCommentIds?: Set<string>;
  commentsLoading?: boolean;
  commentsHasMore?: boolean;
  commentsLoadingMore?: boolean;
  onLike?: () => void;
  onUnlike?: () => void;
  onReact?: (emoji: string) => void;
  onBookmark?: () => void;
  onUnbookmark?: () => void;
  onShare?: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
  onSubmitComment?: (content: string, parentId?: string) => void;
  onLoadMoreComments?: () => void;
  onLikeComment?: (commentId: string) => void;
  onUnlikeComment?: (commentId: string) => void;
  onDeleteComment?: (commentId: string) => void;
  onShowReplies?: (commentId: string) => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function PostDetail({
  post,
  comments,
  currentUserId,
  currentUser,
  userLanguage,
  isLiked = false,
  isBookmarked = false,
  userReaction,
  likedCommentIds,
  commentsLoading = false,
  commentsHasMore = false,
  commentsLoadingMore = false,
  onLike,
  onUnlike,
  onReact,
  onBookmark,
  onUnbookmark,
  onShare,
  onDelete,
  onEdit,
  onSubmitComment,
  onLoadMoreComments,
  onLikeComment,
  onUnlikeComment,
  onDeleteComment,
  onShowReplies,
  className,
}: PostDetailProps) {
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const translationItems = useMemo(() => postTranslationsToItems(post.translations), [post.translations]);
  const isAuthor = currentUserId === post.authorId;
  const hasReactions = post.reactionSummary && Object.keys(post.reactionSummary).length > 0;

  const handleLikeToggle = useCallback(() => {
    if (isLiked) onUnlike?.();
    else onLike?.();
  }, [isLiked, onLike, onUnlike]);

  const handleBookmarkToggle = useCallback(() => {
    if (isBookmarked) onUnbookmark?.();
    else onBookmark?.();
  }, [isBookmarked, onBookmark, onUnbookmark]);

  return (
    <div className={cn('max-w-2xl mx-auto', className)} data-testid="post-detail">
      {/* Post content */}
      <div className="rounded-2xl border border-[var(--gp-border)] bg-[var(--gp-surface)] overflow-hidden mb-4">
        <div className="p-5">
          {/* Header */}
          <div className="flex items-center gap-3 mb-4">
            <Avatar
              name={post.author?.username ?? '?'}
              src={post.author?.avatar ?? undefined}
              size="lg"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[var(--gp-text-primary)]">
                  {post.author?.displayName ?? post.author?.username ?? 'Unknown'}
                </span>
                {post.originalLanguage && (
                  <LanguageOrb code={post.originalLanguage} size="sm" pulse={false} className="w-6 h-6 text-sm" />
                )}
                {post.isPinned && (
                  <span className="text-xs bg-[var(--gp-terracotta)]/10 text-[var(--gp-terracotta)] px-2 py-0.5 rounded-full">
                    Pinned
                  </span>
                )}
              </div>
              <span className="text-sm text-[var(--gp-text-muted)]">{formatTime(post.createdAt)}</span>
            </div>

            {isAuthor && (
              <div className="flex gap-1">
                {onEdit && (
                  <button onClick={onEdit} className="p-2 text-[var(--gp-text-muted)] hover:text-[var(--gp-text-primary)]" aria-label="Edit post">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                )}
                {onDelete && (
                  <button onClick={onDelete} className="p-2 text-[var(--gp-text-muted)] hover:text-red-500" aria-label="Delete post">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Content */}
          {post.content && (
            <div className="mb-4">
              {translationItems.length > 0 ? (
                <TranslationToggle
                  originalContent={post.content}
                  originalLanguage={post.originalLanguage ?? 'unknown'}
                  originalLanguageName={post.originalLanguage ? getLanguageName(post.originalLanguage) : undefined}
                  translations={translationItems}
                  userLanguage={userLanguage}
                  variant="block"
                />
              ) : (
                <p className="text-[var(--gp-text-primary)] whitespace-pre-wrap">{post.content}</p>
              )}
            </div>
          )}

          {/* Media */}
          {post.media && post.media.length > 0 && (
            <div className="mb-4 grid gap-2" style={{ gridTemplateColumns: post.media.length === 1 ? '1fr' : 'repeat(2, 1fr)' }}>
              {post.media.map((m) => (
                <div key={m.id} className="rounded-xl overflow-hidden bg-[var(--gp-parchment)]">
                  {m.mimeType.startsWith('image/') && (
                    <img src={m.fileUrl} alt={m.alt ?? ''} className="w-full object-cover max-h-96" loading="lazy" />
                  )}
                  {m.mimeType.startsWith('video/') && (
                    <video src={m.fileUrl} controls className="w-full max-h-96" />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Reaction summary */}
          {hasReactions && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {Object.entries(post.reactionSummary!).map(([emoji, count]) => (
                <button
                  key={emoji}
                  onClick={() => onReact?.(emoji)}
                  className={cn(
                    'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-colors',
                    userReaction === emoji
                      ? 'bg-[var(--gp-terracotta)]/15 border border-[var(--gp-terracotta)]/30'
                      : 'bg-[var(--gp-parchment)] border border-transparent',
                  )}
                >
                  <span>{emoji}</span>
                  <span className="text-[var(--gp-text-secondary)]">{count}</span>
                </button>
              ))}
            </div>
          )}

          {/* Stats bar */}
          <div className="flex items-center gap-4 py-2 border-t border-b border-[var(--gp-border)] text-xs text-[var(--gp-text-muted)] mb-3">
            {post.likeCount > 0 && <span>{formatCount(post.likeCount)} likes</span>}
            {post.commentCount > 0 && <span>{formatCount(post.commentCount)} comments</span>}
            {post.repostCount > 0 && <span>{formatCount(post.repostCount)} reposts</span>}
            {post.viewCount > 0 && <span>{formatCount(post.viewCount)} views</span>}
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-between relative">
            <div className="relative">
              <button
                onClick={handleLikeToggle}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
                  isLiked || userReaction
                    ? 'text-[var(--gp-terracotta)]'
                    : 'text-[var(--gp-text-secondary)] hover:bg-[var(--gp-parchment)]',
                )}
                onContextMenu={(e) => { e.preventDefault(); setShowReactionPicker(!showReactionPicker); }}
                aria-label={isLiked ? 'Unlike' : 'Like'}
              >
                {userReaction ? (
                  <span className="text-lg leading-none">{userReaction}</span>
                ) : (
                  <svg className="w-5 h-5" fill={isLiked ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                )}
                Like
              </button>

              {showReactionPicker && (
                <div className="absolute bottom-full left-0 mb-2 z-30 flex items-center gap-1 px-2 py-1.5 rounded-full bg-[var(--gp-surface)] border border-[var(--gp-border)]" style={{ boxShadow: 'var(--gp-shadow-lg)' }}>
                  {REACTION_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => { onReact?.(emoji); setShowReactionPicker(false); }}
                      className={cn('text-xl p-1 rounded-full transition-transform hover:scale-125', userReaction === emoji && 'bg-[var(--gp-parchment)]')}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={onShare}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-[var(--gp-text-secondary)] hover:bg-[var(--gp-parchment)] transition-colors"
              aria-label="Share"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              Share
            </button>

            <button
              onClick={handleBookmarkToggle}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
                isBookmarked
                  ? 'text-[var(--gp-terracotta)]'
                  : 'text-[var(--gp-text-secondary)] hover:bg-[var(--gp-parchment)]',
              )}
              aria-label={isBookmarked ? 'Remove bookmark' : 'Bookmark'}
            >
              <svg className="w-5 h-5" fill={isBookmarked ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
              Save
            </button>
          </div>
        </div>
      </div>

      {/* Comments section */}
      <div className="rounded-2xl border border-[var(--gp-border)] bg-[var(--gp-surface)] overflow-hidden p-5">
        <h3 className="font-semibold text-[var(--gp-text-primary)] mb-4">
          Comments ({formatCount(post.commentCount)})
        </h3>
        <CommentList
          postId={post.id}
          comments={comments}
          currentUserId={currentUserId}
          currentUser={currentUser}
          userLanguage={userLanguage}
          likedCommentIds={likedCommentIds}
          isLoading={commentsLoading}
          hasMore={commentsHasMore}
          onLoadMore={onLoadMoreComments}
          isLoadingMore={commentsLoadingMore}
          onLikeComment={onLikeComment}
          onUnlikeComment={onUnlikeComment}
          onDeleteComment={onDeleteComment}
          onSubmitComment={onSubmitComment}
          onShowReplies={onShowReplies}
        />
      </div>
    </div>
  );
}

PostDetail.displayName = 'PostDetail';
export { PostDetail };
