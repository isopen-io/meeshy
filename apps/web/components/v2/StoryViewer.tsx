'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { formatTimeRemaining } from '@meeshy/shared/utils/time-remaining';
import { useI18n } from '@/hooks/use-i18n';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { Avatar } from './Avatar';
import { TranslationToggle } from './TranslationToggle';
import { CommentList } from './CommentList';
import { StoryViewersSheet } from './StoryViewersSheet';
import { useCommentsInfiniteQuery, useCommentsList } from '@/hooks/queries/use-comments-query';
import { useCreateCommentMutation, useLikeCommentMutation, useUnlikeCommentMutation, useDeleteCommentMutation } from '@/hooks/queries/use-comment-mutations';
import { useAuthStore } from '@/stores/auth-store';

// ============================================================================
// Types
// ============================================================================

/// Per-text overlay produced by the iOS composer (and eventually the web
/// composer). Positions are normalized 0-1 against the 9:16 canvas. Each text
/// carries its own translation map per Prisme — render time picks the best
/// available language match.
export interface StoryTextObjectData {
  id: string;
  content: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  translations?: Record<string, string>;
  sourceLanguage?: string;
  textStyle?: 'bold' | 'neon' | 'typewriter' | 'handwriting';
  textColor?: string;
  /// Legacy css-px size (old web payloads). Rendered as raw `px`.
  textSize?: number;
  /// Canonical iOS size in design pixels on the 1080-wide reference canvas.
  /// Rendered relative to the live canvas width (`cqw`) so a story authored on
  /// iOS keeps the same proportions on web instead of being ~2.25× too large.
  fontSizeDesign?: number;
  textAlign?: string;
  textBg?: string;
  zIndex?: number;
}

export interface StoryMediaObjectData {
  id: string;
  postMediaId: string;
  mediaType: 'image' | 'video';
  x: number;
  y: number;
  scale: number;
  rotation: number;
  isBackground?: boolean;
  zIndex?: number;
}

export interface StoryAudioObjectData {
  id: string;
  postMediaId: string;
  x: number;
  y: number;
  volume: number;
  isBackground?: boolean;
  zIndex?: number;
}

interface StoryData {
  id: string;
  authorId?: string;
  author: { name: string; avatar?: string };
  content?: string;
  originalLanguage?: string;
  translations?: Array<{ languageCode: string; languageName: string; content: string }>;
  storyEffects?: {
    background?: string; // "#hex" | "gradient:from,to" | "image_url"
    textStyle?: 'bold' | 'neon' | 'typewriter' | 'handwriting';
    textColor?: string;
    textPosition?: { x: number; y: number };
    filter?: 'vintage' | 'bw' | 'warm' | 'cool' | 'dramatic' | null;
    stickers?: Array<{ emoji: string; x: number; y: number; scale: number; rotation: number }>;
    /// Per-element overlays produced by the iOS composer. Web previously rendered
    /// `content` as a single flat block (audit T9), losing all positioning,
    /// styling, and per-element translations. These arrays mirror the iOS
    /// `StoryEffects.{textObjects, mediaObjects, audioPlayerObjects}` shape.
    textObjects?: StoryTextObjectData[];
    mediaObjects?: StoryMediaObjectData[];
    audioObjects?: StoryAudioObjectData[];
    /// Slide duration in milliseconds (5000 default if absent). Without this,
    /// every story fell to the hardcoded 5s STORY_DURATION even when the author
    /// set a longer duration to fit a 30s video.
    slideDurationMs?: number;
  };
  /// Lookup of `postMediaId -> { url, mimeType }` for resolving foreground
  /// `mediaObjects` / `audioObjects` URLs at render time.
  mediaById?: Map<string, { url: string; mimeType: string }>;
  mediaUrl?: string;
  mediaType?: 'image' | 'video';
  createdAt: string;
  expiresAt: string;
  viewCount: number;
}

interface StoryViewerProps {
  stories: StoryData[];
  initialIndex?: number;
  userLanguage?: string;
  currentUserId?: string;
  onClose: () => void;
  onView?: (storyId: string) => void;
  onReply?: (storyId: string, text: string) => void;
  onDelete?: (storyId: string) => void;
  /** Whether to show the comments panel (default: true) */
  enableComments?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_STORY_DURATION_MS = 6000;

/// Reference canvas width the iOS composer authors against (`CanvasGeometry`).
/// Design-pixel text sizes are projected back to the live canvas relative to it.
const STORY_DESIGN_WIDTH = 1080;

const FILTER_MAP: Record<string, string> = {
  vintage: 'sepia(0.5) saturate(1.3)',
  bw: 'grayscale(1)',
  warm: 'saturate(1.3) brightness(1.05)',
  cool: 'saturate(0.9) hue-rotate(15deg)',
  dramatic: 'contrast(1.3) saturate(1.2)',
};

// ============================================================================
// Helpers
// ============================================================================

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}min`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h`;
}

/// Resolve a Prisme-chain pick for a per-text translation map. The web side
/// receives a single `userLanguage` for now (audit B11B will plumb the full
/// chain). Returns the original `content` when no translation matches — never
/// falls back implicitly to "en", per CLAUDE.md "Prisme Linguistique".
function resolvePrismeText(obj: StoryTextObjectData, preferredLanguage?: string): string {
  if (preferredLanguage && obj.translations) {
    const exact = obj.translations[preferredLanguage];
    if (exact) return exact;
    // Fallback to a 2-letter prefix match (en-US → en) so users with locales
    // like "en-GB" still see English translations.
    const prefix = preferredLanguage.split('-')[0]?.toLowerCase();
    if (prefix && prefix !== preferredLanguage) {
      for (const [lang, text] of Object.entries(obj.translations)) {
        if (lang.toLowerCase() === prefix) return text;
      }
    }
  }
  return obj.content;
}

function textObjectClass(style?: StoryTextObjectData['textStyle']): string {
  switch (style) {
    case 'bold':
      return 'font-bold';
    case 'typewriter':
      return 'font-mono';
    case 'handwriting':
      return 'italic';
    case 'neon':
      return 'font-semibold';
    default:
      return '';
  }
}

function textObjectShadow(style?: StoryTextObjectData['textStyle']): string {
  return style === 'neon'
    ? '0 0 10px currentColor, 0 0 20px currentColor'
    : '0 1px 4px rgba(0,0,0,0.5)';
}

function parseBackground(bg?: string): React.CSSProperties {
  if (!bg) {
    return {
      background: 'linear-gradient(135deg, var(--gp-terracotta), var(--gp-deep-teal))',
    };
  }

  if (bg.startsWith('#')) {
    return { background: bg };
  }

  if (bg.startsWith('gradient:')) {
    const parts = bg.slice('gradient:'.length).split(',');
    const from = parts[0]?.trim() || 'var(--gp-terracotta)';
    const to = parts[1]?.trim() || 'var(--gp-deep-teal)';
    return { background: `linear-gradient(135deg, ${from}, ${to})` };
  }

  // Treat as image URL
  return {
    backgroundImage: `url(${bg})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  };
}

// ============================================================================
// Sub-components
// ============================================================================

/// Small wrapper around `<audio>` that respects the per-object volume from the
/// composer. React's native `<audio>` doesn't take `volume` as a prop — must be
/// set imperatively via a ref. Background-tagged audio renders display:none so
/// it plays silently in the background; foreground renders the `controls` UI.
function StoryAudioElement({
  audio,
  src,
}: {
  audio: StoryAudioObjectData;
  src: string;
}) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.volume = Math.max(0, Math.min(1, audio.volume));
    }
  }, [audio.volume]);

  if (audio.isBackground) {
    return <audio ref={ref} src={src} autoPlay loop style={{ display: 'none' }} />;
  }
  return (
    <audio
      ref={ref}
      src={src}
      autoPlay
      loop
      controls
      className="absolute pointer-events-auto"
      style={{
        left: `${audio.x * 100}%`,
        top: `${audio.y * 100}%`,
        transform: 'translate(-50%, -50%)',
        width: '60%',
        zIndex: audio.zIndex ?? 3,
      }}
    />
  );
}

function ProgressBar({
  total,
  current,
  isPaused,
  durationMs,
}: {
  total: number;
  current: number;
  isPaused: boolean;
  durationMs: number;
}) {
  return (
    <div className="flex gap-1 px-3 pt-3 pb-1">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className="flex-1 h-0.5 rounded-full bg-white/30 overflow-hidden"
        >
          <div
            className={cn(
              'h-full rounded-full bg-white',
              i < current && 'w-full',
              i > current && 'w-0',
              i === current && !isPaused && 'animate-story-progress',
              i === current && isPaused && 'story-progress-paused'
            )}
            style={
              i === current
                ? {
                    animationDuration: `${durationMs}ms`,
                    animationTimingFunction: 'linear',
                    animationFillMode: 'forwards',
                  }
                : undefined
            }
          />
        </div>
      ))}
    </div>
  );
}

function CloseIcon() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
      />
    </svg>
  );
}

// ============================================================================
// StoryViewer
// ============================================================================

function StoryViewer({
  stories,
  initialIndex = 0,
  userLanguage,
  currentUserId,
  onClose,
  onView,
  onReply,
  onDelete,
  enableComments = true,
}: StoryViewerProps) {
  const { t } = useI18n('common');
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [replyText, setReplyText] = useState('');
  const [isPaused, setIsPaused] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const viewedRef = useRef<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  const authUser = useAuthStore((s) => s.user);

  // Story comments — query is enabled only when a valid story is active and comments are enabled
  const currentStoryId = stories[currentIndex]?.id ?? '';
  const commentsQuery = useCommentsInfiniteQuery({
    postId: currentStoryId,
    enabled: enableComments && !!currentStoryId,
  });
  const comments = useCommentsList(commentsQuery);
  const createCommentMutation = useCreateCommentMutation();
  const likeCommentMutation = useLikeCommentMutation();
  const unlikeCommentMutation = useUnlikeCommentMutation();
  const deleteCommentMutation = useDeleteCommentMutation();

  const story = stories[currentIndex];

  // ---- Navigation ----
  const goNext = useCallback(() => {
    if (currentIndex < stories.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      onClose();
    }
  }, [currentIndex, stories.length, onClose]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  }, [currentIndex]);

  // ---- Mark as viewed ----
  useEffect(() => {
    if (!story) return;
    if (!viewedRef.current.has(story.id)) {
      viewedRef.current.add(story.id);
      onView?.(story.id);
    }
  }, [story, onView]);

  // ---- Auto-advance timer ----
  // Honor the per-story `slideDurationMs` (set by the composer to fit longer
  // videos / TTS narrations) instead of a global 5s constant.
  const storyDurationMs = stories[currentIndex]?.storyEffects?.slideDurationMs ?? DEFAULT_STORY_DURATION_MS;
  useEffect(() => {
    if (isPaused) return;

    timerRef.current = setTimeout(() => {
      goNext();
    }, storyDurationMs);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [currentIndex, isPaused, goNext, storyDurationMs]);

  // ---- Escape key ----
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowLeft') goPrev();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, goNext, goPrev]);

  // ---- Lock body scroll ----
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // ---- Pause when typing ----
  const handleInputFocus = useCallback(() => setIsPaused(true), []);
  const handleInputBlur = useCallback(() => setIsPaused(false), []);

  // ---- Reply ----
  const handleReply = useCallback(() => {
    const text = replyText.trim();
    if (!text || !story) return;
    onReply?.(story.id, text);
    setReplyText('');
    inputRef.current?.blur();
  }, [replyText, story, onReply]);

  const handleReplyKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleReply();
      }
    },
    [handleReply]
  );

  // ---- Click navigation ----
  const handleAreaClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Ignore if clicking on interactive elements
      const target = e.target as HTMLElement;
      if (
        target.closest('button') ||
        target.closest('input') ||
        target.closest('a') ||
        target.closest('[role="button"]')
      ) {
        return;
      }

      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const midpoint = rect.width / 2;

      if (clickX < midpoint) {
        goPrev();
      } else {
        goNext();
      }
    },
    [goPrev, goNext]
  );

  // Reset reply text and close comments / viewers panels on story change
  useEffect(() => {
    setReplyText('');
    setShowComments(false);
    setShowViewers(false);
  }, [currentIndex]);

  // Comments handlers
  const handleOpenComments = useCallback(() => {
    setShowComments(true);
    setIsPaused(true);
  }, []);

  const handleCloseComments = useCallback(() => {
    setShowComments(false);
    setIsPaused(false);
  }, []);

  // Viewers list (author only) — pause the timeline while it's open, mirroring
  // the comments panel.
  const handleOpenViewers = useCallback(() => {
    setShowViewers(true);
    setIsPaused(true);
  }, []);

  const handleCloseViewers = useCallback(() => {
    setShowViewers(false);
    setIsPaused(false);
  }, []);

  const handleSubmitComment = useCallback(
    (content: string, parentId?: string) => {
      if (!currentStoryId) return;
      createCommentMutation.mutate({ postId: currentStoryId, content, parentId });
    },
    [currentStoryId, createCommentMutation],
  );

  const handleLikeComment = useCallback(
    (commentId: string) => {
      likeCommentMutation.mutate({ postId: currentStoryId, commentId });
    },
    [currentStoryId, likeCommentMutation],
  );

  const handleUnlikeComment = useCallback(
    (commentId: string) => {
      unlikeCommentMutation.mutate({ postId: currentStoryId, commentId });
    },
    [currentStoryId, unlikeCommentMutation],
  );

  const handleDeleteComment = useCallback(
    (commentId: string) => {
      deleteCommentMutation.mutate({ postId: currentStoryId, commentId });
    },
    [currentStoryId, deleteCommentMutation],
  );

  // All hooks are declared above — safe to early-return here
  if (!story) {
    onClose();
    return null;
  }

  const effects = story.storyEffects;
  const bgStyles = parseBackground(effects?.background);
  const cssFilter = effects?.filter ? FILTER_MAP[effects.filter] : undefined;
  const textColor = effects?.textColor || '#ffffff';
  const textPos = effects?.textPosition || { x: 50, y: 50 };

  const textStyleClass = (() => {
    switch (effects?.textStyle) {
      case 'bold':
        return 'font-bold text-2xl';
      case 'typewriter':
        return 'font-mono text-lg';
      case 'handwriting':
        return 'italic text-xl';
      case 'neon':
        return 'font-semibold text-xl';
      default:
        return 'text-lg';
    }
  })();

  const textShadow =
    effects?.textStyle === 'neon'
      ? `0 0 10px currentColor, 0 0 20px currentColor`
      : '0 1px 4px rgba(0,0,0,0.5)';

  return createPortal(
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
      {/* Story container - constrained to mobile aspect ratio on desktop */}
      <div
        className="relative w-full h-full max-w-[480px] max-h-[100dvh] overflow-hidden"
        onClick={handleAreaClick}
        style={{
          ...bgStyles,
          filter: cssFilter,
        }}
      >
        {/* Media background */}
        {story.mediaUrl && story.mediaType === 'image' && (
          <img
            src={story.mediaUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        {story.mediaUrl && story.mediaType === 'video' && (
          <video
            src={story.mediaUrl}
            autoPlay
            muted
            playsInline
            loop
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}

        {/* Gradient overlay for readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60 pointer-events-none" />

        {/* Foreground media objects (iOS composer outputs normalized x/y in
            0-1 — multiply by 100 for CSS %). Resolved via the postMediaId
            lookup built in story-transforms. Background-tagged objects render
            full-bleed; foreground positioned. */}
        {effects?.mediaObjects?.map((m) => {
          const resolved = story.mediaById?.get(m.postMediaId);
          if (!resolved?.url) return null;
          if (m.isBackground) {
            return m.mediaType === 'video' ? (
              <video
                key={m.id}
                src={resolved.url}
                autoPlay
                muted
                playsInline
                loop
                className="absolute inset-0 w-full h-full object-cover"
                style={{ zIndex: m.zIndex ?? 0 }}
              />
            ) : (
              <img
                key={m.id}
                src={resolved.url}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
                style={{ zIndex: m.zIndex ?? 0 }}
              />
            );
          }
          // Foreground: 65% of canvas short-dimension at scale=1, matches iOS
          // `baseMediaSize = shortDim * 0.65` heuristic so cross-platform render
          // stays roughly consistent.
          const sizePct = 65 * m.scale;
          return m.mediaType === 'video' ? (
            <video
              key={m.id}
              src={resolved.url}
              autoPlay
              muted
              playsInline
              loop
              className="absolute pointer-events-none rounded-lg"
              style={{
                left: `${m.x * 100}%`,
                top: `${m.y * 100}%`,
                width: `${sizePct}%`,
                transform: `translate(-50%, -50%) rotate(${m.rotation}deg)`,
                zIndex: m.zIndex ?? 1,
              }}
            />
          ) : (
            <img
              key={m.id}
              src={resolved.url}
              alt=""
              className="absolute pointer-events-none rounded-lg"
              style={{
                left: `${m.x * 100}%`,
                top: `${m.y * 100}%`,
                width: `${sizePct}%`,
                transform: `translate(-50%, -50%) rotate(${m.rotation}deg)`,
                zIndex: m.zIndex ?? 1,
              }}
            />
          );
        })}

        {/* Per-text overlays produced by the iOS composer. Position is
            normalized 0-1; iOS sends actual normalized values so we multiply
            by 100 for CSS percentages. Each text picks its own translation
            via the Prisme chain (passed via `userLanguage` for now; full
            chain support ships in B11B). */}
        {/* `containerType: inline-size` scopes `cqw` units to the canvas width
            so iOS design-pixel font sizes (1080 reference) scale to the live
            canvas. Isolated to this full-bleed wrapper so it never becomes the
            containing block for the fixed-position overlays elsewhere. */}
        <div className="absolute inset-0 pointer-events-none" style={{ containerType: 'inline-size' }}>
        {effects?.textObjects?.map((t) => {
          const resolvedText = resolvePrismeText(t, userLanguage);
          if (!resolvedText) return null;
          // Canonical iOS size is design px on the 1080-wide canvas → express it
          // as a fraction of the live canvas width (`cqw`). Legacy `textSize` is
          // raw css px. Fallback default keeps old behaviour for untyped data.
          const fontSize = t.fontSizeDesign != null
            ? `${((t.fontSizeDesign / STORY_DESIGN_WIDTH) * 100).toFixed(4)}cqw`
            : `${t.textSize ?? 24}px`;
          return (
            <div
              key={t.id}
              className={cn(
                'absolute pointer-events-none select-none whitespace-pre-wrap text-center',
                textObjectClass(t.textStyle),
              )}
              style={{
                left: `${t.x * 100}%`,
                top: `${t.y * 100}%`,
                transform: `translate(-50%, -50%) scale(${t.scale}) rotate(${t.rotation}deg)`,
                fontSize,
                color: t.textColor ? (t.textColor.startsWith('#') ? t.textColor : `#${t.textColor}`) : '#ffffff',
                textShadow: textObjectShadow(t.textStyle),
                textAlign: (t.textAlign as 'left' | 'right' | 'center' | undefined) ?? 'center',
                background: t.textBg
                  ? (t.textBg.startsWith('#') ? t.textBg : `#${t.textBg}`)
                  : undefined,
                padding: t.textBg ? '4px 10px' : undefined,
                borderRadius: t.textBg ? '6px' : undefined,
                maxWidth: '85%',
                zIndex: t.zIndex ?? 2,
              }}
            >
              {resolvedText}
            </div>
          );
        })}
        </div>

        {/* Foreground / background audio players. Volume is set on mount via
            a ref because React's native `<audio>` doesn't accept `volume` as
            a prop. Background audio plays silently (display:none). */}
        {effects?.audioObjects?.map((a) => {
          const resolved = story.mediaById?.get(a.postMediaId);
          if (!resolved?.url) return null;
          return (
            <StoryAudioElement
              key={a.id}
              audio={a}
              src={resolved.url}
            />
          );
        })}

        {/* Stickers */}
        {effects?.stickers?.map((sticker, i) => (
          <div
            key={i}
            className="absolute pointer-events-none select-none"
            style={{
              left: `${sticker.x * 100}%`,
              top: `${sticker.y * 100}%`,
              transform: `translate(-50%, -50%) scale(${sticker.scale}) rotate(${sticker.rotation}deg)`,
              fontSize: '2rem',
            }}
          >
            {sticker.emoji}
          </div>
        ))}

        {/* Content layer - above background, below UI controls */}
        <div className="absolute inset-0 flex flex-col pointer-events-none">
          {/* Progress bars */}
          <div className="pointer-events-auto">
            <ProgressBar
              total={stories.length}
              current={currentIndex}
              isPaused={isPaused}
              durationMs={storyDurationMs}
            />
          </div>

          {/* Header */}
          <div className="flex items-center gap-3 px-3 py-2 pointer-events-auto">
            <Avatar
              src={story.author.avatar}
              name={story.author.name}
              size="sm"
            />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-semibold text-white drop-shadow-sm">
                {story.author.name}
              </span>
              <span className="text-xs text-white/70 ml-2">
                {timeAgo(story.createdAt)}
              </span>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="p-1 rounded-full text-white/90 hover:text-white hover:bg-white/10 transition-colors duration-300"
              aria-label={t('common.close')}
            >
              <CloseIcon />
            </button>
          </div>

          {/* Spacer to push text to its positioned location */}
          <div className="flex-1 relative">
            {/* Story text content */}
            {story.content && (
              <div
                className="absolute pointer-events-auto max-w-[85%]"
                style={{
                  left: `${textPos.x}%`,
                  top: `${textPos.y}%`,
                  transform: 'translate(-50%, -50%)',
                  color: textColor,
                  textShadow,
                }}
              >
                <p className={cn(textStyleClass, 'text-center leading-relaxed')}>
                  {story.content}
                </p>

                {/* Translation toggle */}
                {story.originalLanguage &&
                  story.translations &&
                  story.translations.length > 0 && (
                    <div className="mt-2 flex justify-center">
                      <TranslationToggle
                        originalContent={story.content}
                        originalLanguage={story.originalLanguage}
                        translations={story.translations}
                        userLanguage={userLanguage}
                        variant="inline"
                        showContent={false}
                      />
                    </div>
                  )}
              </div>
            )}
          </div>

          {/* View count & actions */}
          <div className="px-4 pb-1 flex items-center justify-between pointer-events-auto">
            <div className="flex items-center gap-3">
              {currentUserId && story.authorId === currentUserId ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (showViewers) handleCloseViewers();
                    else handleOpenViewers();
                  }}
                  className="text-xs text-white/60 hover:text-white transition-colors duration-300 underline-offset-2 hover:underline"
                  aria-label={t('viewers.open', 'See who viewed')}
                  aria-expanded={showViewers}
                >
                  {story.viewCount} vue{story.viewCount !== 1 ? 's' : ''}
                </button>
              ) : (
                <span className="text-xs text-white/50">
                  {story.viewCount} vue{story.viewCount !== 1 ? 's' : ''}
                </span>
              )}
              {story.expiresAt && (() => {
                const remaining = formatTimeRemaining(new Date(story.expiresAt).getTime(), Date.now());
                if (remaining === null) return null;
                return <span className="text-xs text-white/40">{remaining}</span>;
              })()}
            </div>
            {onDelete && currentUserId && story.authorId === currentUserId && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(story.id);
                  onClose();
                }}
                className="p-1.5 rounded-full text-white/40 hover:text-red-400 hover:bg-white/10 transition-colors duration-300"
                aria-label={t('delete')}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>

          {/* Reply / Comments row */}
          <div className="px-3 pb-4 pt-1 pointer-events-auto flex flex-col gap-2">
            {/* Viewers panel (author only) — slide up above the input */}
            {showViewers && currentUserId && story.authorId === currentUserId && (
              <StoryViewersSheet
                storyId={story.id}
                open={showViewers}
                onClose={handleCloseViewers}
              />
            )}

            {/* Comments panel — slide up above the input */}
            {enableComments && showComments && (
              <div
                className="bg-black/70 backdrop-blur-md rounded-2xl border border-white/10 p-3 max-h-64 overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white text-sm font-semibold">Comments</span>
                  <button
                    onClick={handleCloseComments}
                    className="text-white/60 hover:text-white text-xs"
                    aria-label="Close comments"
                  >
                    ✕
                  </button>
                </div>
                <CommentList
                  postId={currentStoryId}
                  comments={comments}
                  currentUserId={authUser?.id ?? null}
                  currentUser={authUser ? { username: authUser.username, avatar: authUser.avatar } : null}
                  userLanguage={userLanguage}
                  isLoading={commentsQuery.isLoading}
                  hasMore={commentsQuery.hasNextPage}
                  onLoadMore={() => commentsQuery.fetchNextPage()}
                  isLoadingMore={commentsQuery.isFetchingNextPage}
                  onLikeComment={handleLikeComment}
                  onUnlikeComment={handleUnlikeComment}
                  onDeleteComment={handleDeleteComment}
                  onSubmitComment={handleSubmitComment}
                  className="text-white"
                />
              </div>
            )}

            {/* Input row */}
            {onReply && (
              <div className="flex items-center gap-2 bg-white/15 backdrop-blur-sm rounded-full px-4 py-2 border border-white/20">
                {enableComments && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenComments();
                    }}
                    className="text-white/70 hover:text-white transition-colors"
                    aria-label="Show comments"
                    data-testid="story-comments-button"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </button>
                )}
                <input
                  ref={inputRef}
                  type="text"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                  onKeyDown={handleReplyKeyDown}
                  placeholder={t('replyPlaceholder')}
                  className="flex-1 bg-transparent text-white text-sm placeholder:text-white/50 outline-none"
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleReply();
                  }}
                  disabled={!replyText.trim()}
                  className={cn(
                    'p-1 rounded-full transition-colors duration-300',
                    replyText.trim()
                      ? 'text-white hover:bg-white/20'
                      : 'text-white/30'
                  )}
                  aria-label={t('send')}
                >
                  <SendIcon />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Keyframe animation style */}
      <style jsx global>{`
        @keyframes storyProgress {
          from {
            width: 0%;
          }
          to {
            width: 100%;
          }
        }
        .animate-story-progress {
          animation-name: storyProgress;
        }
        .story-progress-paused {
          animation-name: storyProgress;
          animation-play-state: paused;
        }
      `}</style>
    </div>,
    document.body
  );
}

StoryViewer.displayName = 'StoryViewer';

export { StoryViewer };
export type { StoryData, StoryViewerProps };
