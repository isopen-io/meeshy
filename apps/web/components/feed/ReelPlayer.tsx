'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Post } from '@meeshy/shared/types/post';
import { useI18n } from '@/hooks/use-i18n';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import {
  X,
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
  ChevronUp,
  ChevronDown,
  Volume2,
  VolumeX,
  Play,
} from 'lucide-react';

// ─── Helpers ───────────────────────────────────────────────────────────────

function authorName(post: Post): string {
  return post.author?.displayName ?? post.author?.username ?? 'Meeshy';
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

/**
 * Prisme Linguistique pick: prefer a translation matching `userLanguage`,
 * otherwise the original content. Never falls back to an arbitrary language.
 */
function resolveCaption(post: Post, userLanguage?: string): string {
  const original = post.content ?? '';
  if (!userLanguage || !post.translations || typeof post.translations !== 'object') return original;
  const entry = (post.translations as Record<string, { text?: string }>)[userLanguage];
  return entry?.text ?? original;
}

function firstVideo(post: Post) {
  return post.media?.find((m) => m.mimeType.startsWith('video/'));
}
function firstImage(post: Post) {
  return post.media?.find((m) => m.mimeType.startsWith('image/'));
}

// ─── Action rail button ──────────────────────────────────────────────────

interface RailButtonProps {
  label: string;
  count?: number;
  active?: boolean;
  activeColor?: string;
  onClick: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}

function RailButton({
  label,
  count,
  active,
  activeColor,
  onClick,
  children,
}: RailButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className="flex flex-col items-center gap-1 text-white group"
    >
      <span
        className="flex h-12 w-12 items-center justify-center rounded-full bg-black/35 backdrop-blur-sm transition-all group-active:scale-90 group-hover:bg-black/50"
        style={active && activeColor ? { color: activeColor } : undefined}
      >
        {children}
      </span>
      {typeof count === 'number' && <span className="text-xs font-medium tabular-nums drop-shadow-sm">{count}</span>}
    </button>
  );
}

// ─── Player ────────────────────────────────────────────────────────────────

export interface ReelPlayerProps {
  reel: Post;
  index: number;
  total: number;
  hasPrev: boolean;
  hasNext: boolean;
  isLiked: boolean;
  isBookmarked: boolean;
  userLanguage?: string;
  /** When true the player fills its (relatively-positioned) parent instead of the viewport. */
  embedded?: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onLike: () => void;
  onComment: () => void;
  onShare: () => void;
  onBookmark: () => void;
}

/**
 * Full-screen immersive reel. Renders a single reel (the parent remounts it via
 * a `key` on reel id so each video autoplays cleanly). Navigation: Arrow
 * Up/Down/Left/Right keys, mouse wheel, and on-screen chevrons all advance to
 * the adjacent reel; Escape closes. Tap toggles play/pause; a dedicated control
 * toggles sound (videos start muted to satisfy autoplay policies).
 */
export function ReelPlayer({
  reel,
  index,
  total,
  hasPrev,
  hasNext,
  isLiked,
  isBookmarked,
  userLanguage,
  embedded = false,
  onPrev,
  onNext,
  onClose,
  onLike,
  onComment,
  onShare,
  onBookmark,
}: ReelPlayerProps) {
  const { t } = useI18n('reel');
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [paused, setPaused] = useState(false);

  const video = firstVideo(reel);
  const image = firstImage(reel);
  const name = authorName(reel);
  const caption = resolveCaption(reel, userLanguage);

  const goNext = useCallback(() => {
    if (hasNext) onNext();
  }, [hasNext, onNext]);
  const goPrev = useCallback(() => {
    if (hasPrev) onPrev();
  }, [hasPrev, onPrev]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
        case 'ArrowRight':
          e.preventDefault();
          goNext();
          break;
        case 'ArrowUp':
        case 'ArrowLeft':
          e.preventDefault();
          goPrev();
          break;
        case 'Escape':
          onClose();
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goNext, goPrev, onClose]);

  // Wheel / trackpad navigation (debounced via a moving lock)
  const wheelLock = useRef(false);
  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      if (wheelLock.current || Math.abs(e.deltaY) < 24) return;
      wheelLock.current = true;
      if (e.deltaY > 0) goNext();
      else goPrev();
      setTimeout(() => {
        wheelLock.current = false;
      }, 500);
    },
    [goNext, goPrev]
  );

  const togglePlay = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play();
      setPaused(false);
    } else {
      el.pause();
      setPaused(true);
    }
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      if (videoRef.current) videoRef.current.muted = next;
      return next;
    });
  }, []);

  return (
    <section
      className={`${
        embedded ? 'absolute inset-0' : 'fixed inset-0 z-50'
      } flex items-center justify-center bg-black select-none`}
      aria-label={t('player.position', { current: index + 1, total })}
      onWheel={onWheel}
    >
      <h1 className="sr-only">{t('player.byAuthor', { name })}</h1>

      {/* Media stage (9:16) */}
      <div className="relative h-full w-full max-w-[min(100vw,calc(100vh*9/16))]">
        {video ? (
          <>
            <video
              ref={videoRef}
              src={video.fileUrl}
              poster={video.thumbnailUrl ?? undefined}
              className="h-full w-full object-contain bg-black"
              autoPlay
              loop
              playsInline
              muted={muted}
              onClick={togglePlay}
              aria-label={video.alt ?? t('player.byAuthor', { name })}
            />
            {paused && (
              <button
                type="button"
                onClick={togglePlay}
                aria-label={t('player.play', 'Play')}
                className="absolute inset-0 flex items-center justify-center"
              >
                <Play className="h-16 w-16 text-white/90 drop-shadow-lg" fill="currentColor" />
              </button>
            )}
          </>
        ) : image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image.fileUrl}
            alt={image.alt ?? t('player.byAuthor', { name })}
            className="h-full w-full object-contain bg-black"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-700 to-purple-800 p-8 text-center text-2xl font-semibold text-white">
            {caption || name}
          </div>
        )}

        {/* Top bar */}
        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4 z-10">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            aria-label={t('player.close', 'Close')}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm hover:bg-black/50 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
          {/* Navigation arrows (replace the i/N counter) */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); goPrev(); }}
              disabled={!hasPrev}
              aria-label={t('player.previous', 'Previous reel')}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm transition-all disabled:opacity-30 hover:bg-black/50"
            >
              <ChevronUp className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); goNext(); }}
              disabled={!hasNext}
              aria-label={t('player.next', 'Next reel')}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm transition-all disabled:opacity-30 hover:bg-black/50"
            >
              <ChevronDown className="h-5 w-5" />
            </button>
          </div>
          {video ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); toggleMute(); }}
              aria-label={muted ? t('player.unmute', 'Unmute') : t('player.mute', 'Mute')}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm hover:bg-black/50 transition-colors"
            >
              {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </button>
          ) : (
            <span className="h-10 w-10" aria-hidden="true" />
          )}
        </div>

        {/* Action rail */}
        <div className="absolute bottom-28 right-3 flex flex-col items-center gap-5 z-10">
          <RailButton label={t('player.like', 'Like')} count={reel.likeCount} active={isLiked} activeColor="#fb7185" onClick={(e) => { e.stopPropagation(); onLike(); }}>
            <Heart className="h-6 w-6" fill={isLiked ? 'currentColor' : 'none'} />
          </RailButton>
          <RailButton label={t('player.comment', 'Comment')} count={reel.commentCount} onClick={(e) => { e.stopPropagation(); onComment(); }}>
            <MessageCircle className="h-6 w-6" />
          </RailButton>
          <RailButton label={t('player.share', 'Share')} onClick={(e) => { e.stopPropagation(); onShare(); }}>
            <Share2 className="h-6 w-6" />
          </RailButton>
          <RailButton label={t('player.save', 'Save')} active={isBookmarked} activeColor="#fbbf24" onClick={(e) => { e.stopPropagation(); onBookmark(); }}>
            <Bookmark className="h-6 w-6" fill={isBookmarked ? 'currentColor' : 'none'} />
          </RailButton>
        </div>

        {/* Author + caption */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4 pb-8 pr-20 text-white z-10">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 ring-2 ring-white/50">
              {reel.author?.avatar ? <AvatarImage src={reel.author.avatar} alt="" /> : null}
              <AvatarFallback className="bg-indigo-600">{initials(name)}</AvatarFallback>
            </Avatar>
            <span className="font-semibold text-lg drop-shadow-sm">{name}</span>
          </div>
          {caption && <p className="mt-3 line-clamp-3 text-sm text-white/90 leading-relaxed drop-shadow-sm">{caption}</p>}
        </div>

      </div>
    </section>
  );
}

export default ReelPlayer;
