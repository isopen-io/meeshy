'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Avatar } from './Avatar';
import { LanguageOrb } from './LanguageOrb';
import { TranslationToggle } from './TranslationToggle';
import type { TranslationItem } from './TranslationToggle';
import { getLanguageName } from './flags';

export interface PostCardProps {
  author: { name: string; avatar?: string; emoji?: string };
  lang: string;
  content: string;
  translations?: TranslationItem[];
  userLanguage?: string;
  time: string;
  likes: number;
  comments: number;
  isLiked?: boolean;
  reactionSummary?: Record<string, number>;
  userReaction?: string;
  onLike?: () => void;
  onComment?: () => void;
  onShare?: () => void;
  onReact?: (emoji: string) => void;
  className?: string;
}

const REACTION_EMOJIS = ['\u2764\uFE0F', '\uD83D\uDD25', '\uD83D\uDE02', '\uD83D\uDE2E', '\uD83D\uDE22', '\uD83D\uDC4F'];

function PostCard({
  author,
  lang,
  content,
  translations,
  userLanguage,
  time,
  likes,
  comments,
  isLiked = false,
  reactionSummary,
  userReaction,
  onLike,
  onComment,
  onShare,
  onReact,
  className,
}: PostCardProps) {
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showReactionPicker) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowReactionPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showReactionPicker]);

  const handleLikePointerDown = useCallback(() => {
    longPressTimer.current = setTimeout(() => {
      setShowReactionPicker(true);
    }, 500);
  }, []);

  const handleLikePointerUp = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleReact = useCallback((emoji: string) => {
    onReact?.(emoji);
    setShowReactionPicker(false);
  }, [onReact]);

  const hasTranslations = translations && translations.length > 0;
  const hasReactions = reactionSummary && Object.keys(reactionSummary).length > 0;

  return (
    <div
      className={cn(
        'rounded-2xl border border-[var(--gp-border)] bg-[var(--gp-surface)] overflow-hidden transition-colors duration-300',
        className
      )}
    >
      <div className="p-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          {author.avatar ? (
            <Avatar src={author.avatar} name={author.name} size="md" />
          ) : (
            <Avatar name={author.emoji || author.name} size="md" />
          )}
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[var(--gp-text-primary)]">
                {author.name}
              </span>
              <LanguageOrb code={lang} size="sm" pulse={false} className="w-6 h-6 text-sm" />
            </div>
            <span className="text-sm text-[var(--gp-text-muted)]">{time}</span>
          </div>
        </div>

        {/* Content with TranslationToggle */}
        {hasTranslations ? (
          <div className="mb-3">
            <TranslationToggle
              originalContent={content}
              originalLanguage={lang}
              originalLanguageName={getLanguageName(lang)}
              translations={translations}
              userLanguage={userLanguage}
              variant="block"
            />
          </div>
        ) : (
          <p className="mb-3 text-[var(--gp-text-primary)]">{content}</p>
        )}

        {/* Reaction summary badges */}
        {hasReactions && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {Object.entries(reactionSummary).map(([emoji, count]) => (
              <button
                key={emoji}
                onClick={() => onReact?.(emoji)}
                className={cn(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-colors duration-300',
                  userReaction === emoji
                    ? 'bg-[var(--gp-terracotta)]/15 border border-[var(--gp-terracotta)]/30'
                    : 'bg-[var(--gp-parchment)] border border-transparent'
                )}
              >
                <span>{emoji}</span>
                <span className="text-[var(--gp-text-secondary)]">{count}</span>
              </button>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-6">
          <div className="relative" ref={pickerRef}>
            <button
              className="flex items-center gap-2 text-sm transition-colors duration-300"
              style={{ color: isLiked || userReaction ? 'var(--gp-terracotta)' : 'var(--gp-text-secondary)' }}
              onClick={onLike}
              onPointerDown={handleLikePointerDown}
              onPointerUp={handleLikePointerUp}
              onPointerLeave={handleLikePointerUp}
            >
              {userReaction ? (
                <span className="text-lg leading-none">{userReaction}</span>
              ) : (
                <svg
                  className="w-5 h-5"
                  fill={isLiked ? 'currentColor' : 'none'}
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              )}
              {likes}
            </button>

            {/* Reaction picker popup */}
            {showReactionPicker && (
              <div
                className="absolute bottom-full left-0 mb-2 z-30 flex items-center gap-1 px-2 py-1.5 rounded-full transition-colors duration-300"
                style={{
                  background: 'var(--gp-surface)',
                  border: '1px solid var(--gp-border)',
                  boxShadow: 'var(--gp-shadow-lg)',
                }}
              >
                {REACTION_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => handleReact(emoji)}
                    className={cn(
                      'text-xl p-1 rounded-full transition-transform duration-150 hover:scale-125',
                      userReaction === emoji && 'bg-[var(--gp-parchment)]'
                    )}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            className="flex items-center gap-2 text-sm text-[var(--gp-text-secondary)] transition-colors duration-300"
            onClick={onComment}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            {comments}
          </button>
          <button
            className="flex items-center gap-2 text-sm text-[var(--gp-text-secondary)] transition-colors duration-300"
            onClick={onShare}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            Partager
          </button>
        </div>
      </div>
    </div>
  );
}

PostCard.displayName = 'PostCard';

export { PostCard };
