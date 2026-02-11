'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { Avatar } from './Avatar';
import { TranslationToggle } from './TranslationToggle';

// ============================================================================
// Types
// ============================================================================

interface StoryData {
  id: string;
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
  };
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
  onClose: () => void;
  onView?: (storyId: string) => void;
  onReply?: (storyId: string, text: string) => void;
}

// ============================================================================
// Constants
// ============================================================================

const STORY_DURATION = 5000;

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

function ProgressBar({
  total,
  current,
  isPaused,
}: {
  total: number;
  current: number;
  isPaused: boolean;
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
                    animationDuration: `${STORY_DURATION}ms`,
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
  onClose,
  onView,
  onReply,
}: StoryViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [replyText, setReplyText] = useState('');
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const viewedRef = useRef<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  const story = stories[currentIndex];
  if (!story) {
    onClose();
    return null;
  }

  const effects = story.storyEffects;
  const bgStyles = parseBackground(effects?.background);
  const cssFilter = effects?.filter ? FILTER_MAP[effects.filter] : undefined;
  const textColor = effects?.textColor || '#ffffff';
  const textPos = effects?.textPosition || { x: 50, y: 50 };

  // Text style class
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
  useEffect(() => {
    if (isPaused) return;

    timerRef.current = setTimeout(() => {
      goNext();
    }, STORY_DURATION);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [currentIndex, isPaused, goNext]);

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

  // Reset reply text on story change
  useEffect(() => {
    setReplyText('');
  }, [currentIndex]);

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

        {/* Stickers */}
        {effects?.stickers?.map((sticker, i) => (
          <div
            key={i}
            className="absolute pointer-events-none select-none"
            style={{
              left: `${sticker.x}%`,
              top: `${sticker.y}%`,
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
              aria-label="Fermer"
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
                      />
                    </div>
                  )}
              </div>
            )}
          </div>

          {/* View count */}
          <div className="px-4 pb-1 pointer-events-none">
            <span className="text-xs text-white/50">
              {story.viewCount} vue{story.viewCount !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Reply input */}
          {onReply && (
            <div className="px-3 pb-4 pt-1 pointer-events-auto">
              <div className="flex items-center gap-2 bg-white/15 backdrop-blur-sm rounded-full px-4 py-2 border border-white/20">
                <input
                  ref={inputRef}
                  type="text"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                  onKeyDown={handleReplyKeyDown}
                  placeholder="Repondre..."
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
                  aria-label="Envoyer"
                >
                  <SendIcon />
                </button>
              </div>
            </div>
          )}
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
