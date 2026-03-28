'use client';

import { useState, useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Avatar } from './Avatar';
import { Button } from './Button';
import type { PostType, PostVisibility } from '@meeshy/shared/types/post';

export interface PostComposerProps {
  currentUser?: { username: string; avatar?: string | null } | null;
  onPublish: (data: {
    content: string;
    type: PostType;
    visibility: PostVisibility;
    visibilityUserIds?: string[];
    mediaIds?: string[];
  }) => void;
  disabled?: boolean;
  className?: string;
}

const VISIBILITY_OPTIONS: { value: PostVisibility; label: string; icon: string }[] = [
  { value: 'PUBLIC', label: 'Public', icon: '🌍' },
  { value: 'FRIENDS', label: 'Friends', icon: '👥' },
  { value: 'EXCEPT', label: 'Friends except...', icon: '🚫' },
  { value: 'ONLY', label: 'Only...', icon: '🎯' },
  { value: 'PRIVATE', label: 'Private', icon: '🔒' },
];

function PostComposer({
  currentUser,
  onPublish,
  disabled = false,
  className,
}: PostComposerProps) {
  const [content, setContent] = useState('');
  const [visibility, setVisibility] = useState<PostVisibility>('PUBLIC');
  const [showVisibilityPicker, setShowVisibilityPicker] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handlePublish = useCallback(() => {
    const trimmed = content.trim();
    if (!trimmed || disabled) return;

    onPublish({
      content: trimmed,
      type: 'POST',
      visibility,
    });

    setContent('');
    setIsExpanded(false);
  }, [content, disabled, onPublish, visibility]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handlePublish();
      }
    },
    [handlePublish],
  );

  const isValid = content.trim().length > 0 && content.trim().length <= 5000;
  const charCount = content.length;
  const selectedVisibility = VISIBILITY_OPTIONS.find((v) => v.value === visibility) ?? VISIBILITY_OPTIONS[0];

  return (
    <div
      className={cn(
        'rounded-2xl border border-[var(--gp-border)] bg-[var(--gp-surface)] overflow-hidden transition-all',
        className,
      )}
      data-testid="post-composer"
    >
      <div className="p-4">
        <div className="flex gap-3">
          <Avatar
            name={currentUser?.username ?? '?'}
            src={currentUser?.avatar ?? undefined}
            size="md"
          />

          <div className="flex-1 min-w-0">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsExpanded(true)}
              placeholder="What's on your mind?"
              rows={isExpanded ? 4 : 2}
              maxLength={5000}
              disabled={disabled}
              className={cn(
                'w-full resize-none border-0 bg-transparent text-base outline-none',
                'text-[var(--gp-text-primary)] placeholder:text-[var(--gp-text-muted)]',
                disabled && 'opacity-50 cursor-not-allowed',
              )}
              aria-label="Post content"
            />

            {isExpanded && (
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--gp-border)]">
                <div className="flex items-center gap-2">
                  {/* Media buttons */}
                  <button className="p-2 rounded-lg text-[var(--gp-text-muted)] hover:bg-[var(--gp-parchment)] transition-colors" aria-label="Add photo">
                    📷
                  </button>
                  <button className="p-2 rounded-lg text-[var(--gp-text-muted)] hover:bg-[var(--gp-parchment)] transition-colors" aria-label="Add video">
                    🎥
                  </button>

                  {/* Visibility picker */}
                  <div className="relative">
                    <button
                      onClick={() => setShowVisibilityPicker(!showVisibilityPicker)}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-[var(--gp-text-secondary)] hover:bg-[var(--gp-parchment)] transition-colors"
                      aria-label="Change visibility"
                    >
                      <span>{selectedVisibility.icon}</span>
                      <span>{selectedVisibility.label}</span>
                    </button>

                    {showVisibilityPicker && (
                      <div className="absolute bottom-full left-0 mb-1 bg-[var(--gp-surface)] border border-[var(--gp-border)] rounded-xl shadow-lg z-20 min-w-[160px]">
                        {VISIBILITY_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => {
                              setVisibility(opt.value);
                              setShowVisibilityPicker(false);
                            }}
                            className={cn(
                              'flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-[var(--gp-parchment)] transition-colors first:rounded-t-xl last:rounded-b-xl',
                              visibility === opt.value && 'text-[var(--gp-terracotta)] font-medium',
                            )}
                          >
                            <span>{opt.icon}</span>
                            <span>{opt.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Character count */}
                  {charCount > 4500 && (
                    <span className={cn(
                      'text-xs',
                      charCount > 4900 ? 'text-red-500' : 'text-[var(--gp-text-muted)]',
                    )}>
                      {5000 - charCount}
                    </span>
                  )}
                </div>

                <Button
                  variant="primary"
                  size="sm"
                  onClick={handlePublish}
                  disabled={!isValid || disabled}
                >
                  Publish
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

PostComposer.displayName = 'PostComposer';
export { PostComposer };
