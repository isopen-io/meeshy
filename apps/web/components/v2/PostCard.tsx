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
  isBookmarked?: boolean;
  isAuthor?: boolean;
  isPinned?: boolean;
  reactionSummary?: Record<string, number>;
  userReaction?: string;
  media?: readonly { id: string; mimeType: string; fileUrl: string; thumbnailUrl?: string | null; alt?: string | null }[];
  onLike?: () => void;
  onComment?: () => void;
  onShare?: () => void;
  onReact?: (emoji: string) => void;
  onBookmark?: () => void;
  onRepost?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onPin?: () => void;
  onTranslate?: () => void;
  onClick?: () => void;
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
  isBookmarked = false,
  isAuthor = false,
  isPinned = false,
  reactionSummary,
  userReaction,
  media,
  onLike,
  onComment,
  onShare,
  onReact,
  onBookmark,
  onRepost,
  onEdit,
  onDelete,
  onPin,
  onTranslate,
  onClick,
  className,
}: PostCardProps) {
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showReactionPicker && !showContextMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowReactionPicker(false);
      }
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowContextMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showReactionPicker, showContextMenu]);

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
  const hasMedia = media && media.length > 0;

  return (
    <div
      className={cn(
        'rounded-2xl border border-[var(--gp-border)] bg-[var(--gp-surface)] overflow-hidden transition-colors duration-300',
        className,
      )}
    >
      <div className="p-4">
        {/* Pinned badge */}
        {isPinned && (
          <div className="flex items-center gap-1.5 mb-2 text-xs text-[var(--gp-terracotta)]">
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
            </svg>
            Pinned
          </div>
        )}

        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          {author.avatar ? (
            <Avatar src={author.avatar} name={author.name} size="md" />
          ) : (
            <Avatar name={author.emoji || author.name} size="md" />
          )}
          <div className="flex-1 cursor-pointer" onClick={onClick}>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[var(--gp-text-primary)]">
                {author.name}
              </span>
              <LanguageOrb code={lang} size="sm" pulse={false} className="w-6 h-6 text-sm" />
            </div>
            <span className="text-sm text-[var(--gp-text-muted)]">{time}</span>
          </div>

          {/* Context menu (author only) */}
          {isAuthor && (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setShowContextMenu(!showContextMenu)}
                className="p-1.5 rounded-lg text-[var(--gp-text-muted)] hover:bg-[var(--gp-parchment)] transition-colors"
                aria-label="Post menu"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <circle cx="12" cy="5" r="1.5" />
                  <circle cx="12" cy="12" r="1.5" />
                  <circle cx="12" cy="19" r="1.5" />
                </svg>
              </button>

              {showContextMenu && (
                <div className="absolute right-0 top-full mt-1 bg-[var(--gp-surface)] border border-[var(--gp-border)] rounded-xl shadow-lg z-20 min-w-[140px] py-1">
                  {onEdit && (
                    <button
                      onClick={() => { onEdit(); setShowContextMenu(false); }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-[var(--gp-text-primary)] hover:bg-[var(--gp-parchment)] transition-colors"
                    >
                      Edit
                    </button>
                  )}
                  {onPin && (
                    <button
                      onClick={() => { onPin(); setShowContextMenu(false); }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-[var(--gp-text-primary)] hover:bg-[var(--gp-parchment)] transition-colors"
                    >
                      {isPinned ? 'Unpin' : 'Pin'}
                    </button>
                  )}
                  {onDelete && (
                    <button
                      onClick={() => { onDelete(); setShowContextMenu(false); }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-500 hover:bg-[var(--gp-parchment)] transition-colors"
                    >
                      Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Content with TranslationToggle */}
        <div className="cursor-pointer" onClick={onClick}>
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
            <div className="mb-3">
              <p className="text-[var(--gp-text-primary)]">{content}</p>
              {onTranslate && lang !== userLanguage && (
                <button
                  onClick={(e) => { e.stopPropagation(); onTranslate(); }}
                  className="mt-1 text-xs text-[var(--gp-terracotta)] hover:underline"
                  aria-label="Translate post"
                >
                  Translate
                </button>
              )}
            </div>
          )}
        </div>

        {/* Media grid */}
        {hasMedia && (
          <div
            className="mb-3 grid gap-1.5 rounded-xl overflow-hidden"
            style={{ gridTemplateColumns: media.length === 1 ? '1fr' : 'repeat(2, 1fr)' }}
          >
            {media.slice(0, 4).map((m) => (
              <div key={m.id} className="relative bg-[var(--gp-parchment)] aspect-square overflow-hidden">
                {m.mimeType.startsWith('image/') && (
                  <img
                    src={m.thumbnailUrl ?? m.fileUrl}
                    alt={m.alt ?? ''}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                )}
                {m.mimeType.startsWith('video/') && (
                  <video src={m.fileUrl} className="w-full h-full object-cover" muted />
                )}
              </div>
            ))}
          </div>
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
                    : 'bg-[var(--gp-parchment)] border border-transparent',
                )}
              >
                <span>{emoji}</span>
                <span className="text-[var(--gp-text-secondary)]">{count}</span>
              </button>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-4">
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
                <svg className="w-5 h-5" fill={isLiked ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              )}
              {likes}
            </button>

            {showReactionPicker && (
              <div
                className="absolute bottom-full left-0 mb-2 z-30 flex items-center gap-1 px-2 py-1.5 rounded-full transition-colors duration-300"
                style={{ background: 'var(--gp-surface)', border: '1px solid var(--gp-border)', boxShadow: 'var(--gp-shadow-lg)' }}
              >
                {REACTION_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => handleReact(emoji)}
                    className={cn('text-xl p-1 rounded-full transition-transform duration-150 hover:scale-125', userReaction === emoji && 'bg-[var(--gp-parchment)]')}
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

          {onRepost && (
            <button
              className="flex items-center gap-2 text-sm text-[var(--gp-text-secondary)] transition-colors duration-300"
              onClick={onRepost}
              aria-label="Repost"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          )}

          <button
            className="flex items-center gap-2 text-sm text-[var(--gp-text-secondary)] transition-colors duration-300"
            onClick={onShare}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
          </button>

          {/* Bookmark */}
          {onBookmark && (
            <button
              className={cn(
                'flex items-center gap-1 text-sm transition-colors duration-300 ml-auto',
                isBookmarked ? 'text-[var(--gp-terracotta)]' : 'text-[var(--gp-text-secondary)]',
              )}
              onClick={onBookmark}
              aria-label={isBookmarked ? 'Remove bookmark' : 'Bookmark'}
            >
              <svg className="w-5 h-5" fill={isBookmarked ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

PostCard.displayName = 'PostCard';

export { PostCard };
