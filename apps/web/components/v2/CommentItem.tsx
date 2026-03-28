'use client';

import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Avatar } from './Avatar';
import { TranslationToggle } from './TranslationToggle';
import type { TranslationItem } from './TranslationToggle';
import type { PostComment } from '@meeshy/shared/types/post';

export interface CommentItemProps {
  comment: PostComment;
  userLanguage?: string;
  isAuthor?: boolean;
  onLike?: (commentId: string) => void;
  onUnlike?: (commentId: string) => void;
  onReply?: (commentId: string) => void;
  onDelete?: (commentId: string) => void;
  onShowReplies?: (commentId: string) => void;
  isLiked?: boolean;
  depth?: number;
  className?: string;
}

function formatTimestamp(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = Date.now();
  const diff = now - d.getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function translationsToItems(translations: unknown): TranslationItem[] {
  if (!translations || typeof translations !== 'object') return [];
  return Object.entries(translations as Record<string, { text?: string }>)
    .filter(([, v]) => v && typeof v.text === 'string')
    .map(([lang, v]) => ({
      languageCode: lang,
      languageName: lang.toUpperCase(),
      content: v.text!,
    }));
}

function CommentItem({
  comment,
  userLanguage,
  isAuthor = false,
  onLike,
  onUnlike,
  onReply,
  onDelete,
  onShowReplies,
  isLiked = false,
  depth = 0,
  className,
}: CommentItemProps) {
  const [showActions, setShowActions] = useState(false);
  const translationItems = translationsToItems(comment.translations);
  const hasTranslations = translationItems.length > 0;
  const indentPx = Math.min(depth * 24, 72);

  const handleLikeToggle = useCallback(() => {
    if (isLiked) {
      onUnlike?.(comment.id);
    } else {
      onLike?.(comment.id);
    }
  }, [isLiked, onLike, onUnlike, comment.id]);

  return (
    <div
      className={cn('flex gap-3 py-3', className)}
      style={{ paddingLeft: indentPx }}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      data-testid={`comment-item-${comment.id}`}
    >
      <Avatar
        name={comment.author?.username ?? '?'}
        src={comment.author?.avatar ?? undefined}
        size="sm"
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-semibold text-sm text-[var(--gp-text-primary)]">
            {comment.author?.displayName ?? comment.author?.username ?? 'Unknown'}
          </span>
          <span className="text-xs text-[var(--gp-text-muted)]">
            {formatTimestamp(comment.createdAt)}
          </span>
          {comment.isEdited && (
            <span className="text-xs text-[var(--gp-text-muted)] italic">edited</span>
          )}
        </div>

        {hasTranslations ? (
          <TranslationToggle
            originalContent={comment.content}
            originalLanguage={comment.originalLanguage ?? 'unknown'}
            translations={translationItems}
            userLanguage={userLanguage}
            variant="inline"
          />
        ) : (
          <p className="text-sm text-[var(--gp-text-primary)] whitespace-pre-wrap break-words">
            {comment.content}
          </p>
        )}

        {/* Actions row */}
        <div className="flex items-center gap-4 mt-1.5">
          <button
            onClick={handleLikeToggle}
            className={cn(
              'flex items-center gap-1 text-xs transition-colors',
              isLiked ? 'text-[var(--gp-terracotta)]' : 'text-[var(--gp-text-muted)]',
            )}
            aria-label={isLiked ? 'Unlike comment' : 'Like comment'}
          >
            <svg className="w-3.5 h-3.5" fill={isLiked ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
            {comment.likeCount > 0 && <span>{comment.likeCount}</span>}
          </button>

          <button
            onClick={() => onReply?.(comment.id)}
            className="text-xs text-[var(--gp-text-muted)] hover:text-[var(--gp-text-primary)] transition-colors"
            aria-label="Reply to comment"
          >
            Reply
          </button>

          {comment.replyCount > 0 && (
            <button
              onClick={() => onShowReplies?.(comment.id)}
              className="text-xs text-[var(--gp-terracotta)] hover:underline transition-colors"
            >
              {comment.replyCount} {comment.replyCount === 1 ? 'reply' : 'replies'}
            </button>
          )}

          {isAuthor && showActions && (
            <button
              onClick={() => onDelete?.(comment.id)}
              className="text-xs text-[var(--gp-text-muted)] hover:text-red-500 transition-colors"
              aria-label="Delete comment"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

CommentItem.displayName = 'CommentItem';
export { CommentItem };
