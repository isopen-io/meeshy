'use client';

import { useState, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Avatar } from './Avatar';

export interface CommentComposerProps {
  postId: string;
  parentId?: string | null;
  parentAuthor?: string | null;
  currentUser?: { username: string; avatar?: string | null } | null;
  onSubmit: (content: string, parentId?: string) => void;
  onCancelReply?: () => void;
  disabled?: boolean;
  className?: string;
}

function CommentComposer({
  postId,
  parentId,
  parentAuthor,
  currentUser,
  onSubmit,
  onCancelReply,
  disabled = false,
  className,
}: CommentComposerProps) {
  const [content, setContent] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback(() => {
    const trimmed = content.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed, parentId ?? undefined);
    setContent('');
  }, [content, disabled, onSubmit, parentId]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const isValid = content.trim().length > 0 && content.trim().length <= 2000;

  return (
    <div className={cn('flex gap-3 items-start', className)} data-testid="comment-composer">
      <Avatar
        name={currentUser?.username ?? '?'}
        src={currentUser?.avatar ?? undefined}
        size="sm"
      />

      <div className="flex-1 min-w-0">
        {parentId && parentAuthor && (
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-[var(--gp-text-muted)]">
              Replying to <span className="font-medium text-[var(--gp-text-secondary)]">{parentAuthor}</span>
            </span>
            <button
              onClick={onCancelReply}
              className="text-xs text-[var(--gp-text-muted)] hover:text-[var(--gp-text-primary)]"
              aria-label="Cancel reply"
            >
              ✕
            </button>
          </div>
        )}

        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={parentId ? 'Write a reply...' : 'Write a comment...'}
            rows={1}
            maxLength={2000}
            disabled={disabled}
            className={cn(
              'flex-1 resize-none border rounded-xl px-3 py-2 text-sm outline-none transition-colors',
              'bg-[var(--gp-parchment)] border-[var(--gp-border)]',
              'text-[var(--gp-text-primary)] placeholder:text-[var(--gp-text-muted)]',
              'focus:border-[var(--gp-terracotta)]',
              disabled && 'opacity-50 cursor-not-allowed',
            )}
            aria-label={parentId ? 'Reply input' : 'Comment input'}
          />

          <button
            onClick={handleSubmit}
            disabled={!isValid || disabled}
            className={cn(
              'flex-shrink-0 p-2 rounded-full transition-colors',
              isValid && !disabled
                ? 'text-[var(--gp-terracotta)] hover:bg-[var(--gp-terracotta)]/10'
                : 'text-[var(--gp-text-muted)] cursor-not-allowed',
            )}
            aria-label="Send comment"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

CommentComposer.displayName = 'CommentComposer';
export { CommentComposer };
