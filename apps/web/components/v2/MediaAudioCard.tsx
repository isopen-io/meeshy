'use client';

import {
  HTMLAttributes,
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import { cn } from '@/lib/utils';
import { theme, getLanguageColor } from './theme';

// ============================================================================
// Types
// ============================================================================

export interface AudioTranslation {
  languageCode: string;
  languageName: string;
  audioSrc: string;
  transcription: string;
  isOriginal?: boolean;
}

export interface MediaAudioCardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onPlay' | 'onPause'> {
  /** Available audio translations */
  translations: AudioTranslation[];
  /** Default language code to select */
  defaultLanguage?: string;
  /** Caption/legend text below the card */
  caption?: string;
  /** Name of the sender */
  senderName?: string;
  /** Timestamp string */
  timestamp: string;
  /** Whether this was sent by current user */
  isSent?: boolean;
  /** Callback when transcription is clicked for expansion */
  onTranscriptionClick?: () => void;
  /** Callback when playback starts */
  onPlay?: () => void;
  /** Callback when playback pauses */
  onPause?: () => void;
  /** Callback when playback ends */
  onEnded?: () => void;
}

// ============================================================================
// Constants
// ============================================================================

const BAR_COUNT = 40;
const PLAYBACK_SPEEDS = [1, 1.5, 2] as const;
type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];

const TRANSCRIPTION_MAX_LENGTH = 100;

// Flag emoji map
const FLAG_MAP: Record<string, string> = {
  fr: '\u{1F1EB}\u{1F1F7}',
  en: '\u{1F1EC}\u{1F1E7}',
  es: '\u{1F1EA}\u{1F1F8}',
  zh: '\u{1F1E8}\u{1F1F3}',
  ja: '\u{1F1EF}\u{1F1F5}',
  ar: '\u{1F1F8}\u{1F1E6}',
  de: '\u{1F1E9}\u{1F1EA}',
  pt: '\u{1F1E7}\u{1F1F7}',
  ko: '\u{1F1F0}\u{1F1F7}',
  it: '\u{1F1EE}\u{1F1F9}',
  ru: '\u{1F1F7}\u{1F1FA}',
  hi: '\u{1F1EE}\u{1F1F3}',
  nl: '\u{1F1F3}\u{1F1F1}',
  pl: '\u{1F1F5}\u{1F1F1}',
  tr: '\u{1F1F9}\u{1F1F7}',
  vi: '\u{1F1FB}\u{1F1F3}',
  th: '\u{1F1F9}\u{1F1ED}',
  id: '\u{1F1EE}\u{1F1E9}',
  sv: '\u{1F1F8}\u{1F1EA}',
  uk: '\u{1F1FA}\u{1F1E6}',
};

// ============================================================================
// Utility Functions
// ============================================================================

function getFlag(code: string): string {
  const normalized = code.toLowerCase().slice(0, 2);
  return FLAG_MAP[normalized] || '\u{1F310}';
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function generateWaveform(src: string, barCount: number): number[] {
  let hash = 0;
  for (let i = 0; i < src.length; i++) {
    const char = src.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }

  const bars: number[] = [];
  for (let i = 0; i < barCount; i++) {
    const seed = Math.abs(Math.sin(hash + i * 1.5) * 10000);
    const height = 0.25 + (seed % 1) * 0.75;
    bars.push(height);
  }
  return bars;
}

function truncateText(text: string, maxLength: number): { truncated: string; isTruncated: boolean } {
  if (text.length <= maxLength) {
    return { truncated: text, isTruncated: false };
  }
  return { truncated: text.slice(0, maxLength).trim() + '...', isTruncated: true };
}

// ============================================================================
// Icon Components
// ============================================================================

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
    </svg>
  );
}

function ChevronIcon({ className, direction = 'down' }: { className?: string; direction?: 'down' | 'up' }) {
  return (
    <svg
      className={cn(className, direction === 'up' && 'rotate-180')}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function TranscriptIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h10M4 18h6" />
    </svg>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function MediaAudioCard({
  translations,
  defaultLanguage,
  caption,
  senderName,
  timestamp,
  isSent = false,
  onTranscriptionClick,
  onPlay,
  onPause,
  onEnded,
  className,
  ...props
}: MediaAudioCardProps) {
  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const isPlayingRef = useRef(false);

  // Find default translation
  const defaultTranslation = useMemo(() => {
    if (defaultLanguage) {
      const found = translations.find(
        t => t.languageCode.toLowerCase() === defaultLanguage.toLowerCase()
      );
      if (found) return found;
    }
    // Fall back to original or first
    return translations.find(t => t.isOriginal) || translations[0];
  }, [translations, defaultLanguage]);

  const [selectedTranslation, setSelectedTranslation] = useState<AudioTranslation>(defaultTranslation);
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Keep ref in sync with state
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // Waveform bars
  const waveformBars = useMemo(
    () => generateWaveform(selectedTranslation.audioSrc, BAR_COUNT),
    [selectedTranslation.audioSrc]
  );

  // Progress percentage
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Truncated transcription
  const { truncated: truncatedTranscription, isTruncated } = useMemo(
    () => truncateText(selectedTranslation.transcription, TRANSCRIPTION_MAX_LENGTH),
    [selectedTranslation.transcription]
  );

  // Language color
  const langColor = getLanguageColor(selectedTranslation.languageCode);

  // -------------------------------------------------------------------------
  // Audio Event Handlers
  // -------------------------------------------------------------------------
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
      setIsLoading(false);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      onEnded?.();
    };

    const handlePlay = () => {
      setIsPlaying(true);
      onPlay?.();
    };

    const handlePause = () => {
      setIsPlaying(false);
      onPause?.();
    };

    const handleWaiting = () => setIsLoading(true);
    const handleCanPlay = () => setIsLoading(false);

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('waiting', handleWaiting);
    audio.addEventListener('canplay', handleCanPlay);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('waiting', handleWaiting);
      audio.removeEventListener('canplay', handleCanPlay);
    };
  }, [onPlay, onPause, onEnded]);

  // Update playback rate when speed changes
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  // Reset audio when translation changes
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      const wasPlaying = isPlayingRef.current;
      audio.pause();
      audio.currentTime = 0;
      setCurrentTime(0);
      setDuration(0);
      audio.load();
      if (wasPlaying) {
        audio.play().catch(console.error);
      }
    }
  }, [selectedTranslation.audioSrc]);

  // -------------------------------------------------------------------------
  // Playback Controls
  // -------------------------------------------------------------------------
  const togglePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(console.error);
    }
  }, [isPlaying]);

  // -------------------------------------------------------------------------
  // Seek Controls
  // -------------------------------------------------------------------------
  const seekTo = useCallback((clientX: number) => {
    const audio = audioRef.current;
    const progressBar = progressRef.current;
    if (!audio || !progressBar || duration <= 0) return;

    const rect = progressBar.getBoundingClientRect();
    const x = clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    const newTime = percentage * duration;

    audio.currentTime = newTime;
    setCurrentTime(newTime);
  }, [duration]);

  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    seekTo(e.clientX);
  }, [seekTo]);

  const handleDragStart = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
    seekTo(e.clientX);
  }, [seekTo]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      seekTo(e.clientX);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, seekTo]);

  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    setIsDragging(true);
    seekTo(e.touches[0].clientX);
  }, [seekTo]);

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (isDragging) {
      seekTo(e.touches[0].clientX);
    }
  }, [isDragging, seekTo]);

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // -------------------------------------------------------------------------
  // Language Selection
  // -------------------------------------------------------------------------
  const handleSelectLanguage = useCallback((translation: AudioTranslation) => {
    setSelectedTranslation(translation);
    setShowLanguageMenu(false);
  }, []);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div
      className={cn(
        'w-full max-w-md mx-auto',
        className
      )}
      {...props}
    >
      {/* Main Card */}
      <div
        className={cn(
          'relative rounded-2xl overflow-hidden',
          'bg-gradient-to-br from-[#F5EDE3] to-[#FFF8F3]',
          'border border-[#E5E5E5]'
        )}
        style={{
          boxShadow: theme.shadows.md,
        }}
      >
        {/* Header with sender info and language selector */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          {/* Sender info */}
          <div className="flex items-center gap-2">
            {senderName && (
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium text-white flex-shrink-0"
                style={{ background: langColor }}
              >
                {senderName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex flex-col">
              {senderName && (
                <span
                  className="text-sm font-semibold"
                  style={{ color: theme.colors.charcoal, fontFamily: theme.fonts.body }}
                >
                  {senderName}
                </span>
              )}
              <span
                className="text-xs"
                style={{ color: theme.colors.textMuted }}
              >
                {timestamp}
              </span>
            </div>
          </div>

          {/* Language Selector - Right side */}
          <div className="relative">
            <button
              onClick={() => translations.length > 1 && setShowLanguageMenu(!showLanguageMenu)}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-full transition-all',
                'hover:opacity-90',
                translations.length > 1 && 'cursor-pointer'
              )}
              style={{
                background: `${langColor}15`,
                color: langColor,
              }}
              disabled={translations.length <= 1}
            >
              <span className="text-base">{getFlag(selectedTranslation.languageCode)}</span>
              <span className="text-sm font-medium">{selectedTranslation.languageName}</span>
              {selectedTranslation.isOriginal && (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded-full"
                  style={{ background: theme.colors.parchment }}
                >
                  Original
                </span>
              )}
              {translations.length > 1 && (
                <ChevronIcon
                  className="w-4 h-4 transition-transform"
                  direction={showLanguageMenu ? 'up' : 'down'}
                />
              )}
            </button>

            {/* Language Menu Dropdown */}
            {showLanguageMenu && translations.length > 1 && (
              <div
                className={cn(
                  'absolute top-full right-0 mt-2 z-30',
                  'min-w-[200px] max-h-[200px] overflow-y-auto',
                  'rounded-xl shadow-lg',
                  'bg-white border border-[#E5E5E5]'
                )}
                style={{
                  boxShadow: theme.shadows.lg,
                }}
              >
                {translations.map((translation, index) => {
                  const isSelected = translation.languageCode === selectedTranslation.languageCode;
                  const itemColor = getLanguageColor(translation.languageCode);

                  return (
                    <button
                      key={`${translation.languageCode}-${index}`}
                      onClick={() => handleSelectLanguage(translation)}
                      className={cn(
                        'w-full px-4 py-3 text-left flex items-center gap-3 transition-colors',
                        'hover:bg-gray-50',
                        isSelected && 'bg-gray-50'
                      )}
                    >
                      <span className="text-lg">{getFlag(translation.languageCode)}</span>
                      <div className="flex-1">
                        <span
                          className="text-sm font-medium block"
                          style={{ color: theme.colors.charcoal }}
                        >
                          {translation.languageName}
                        </span>
                      </div>
                      {translation.isOriginal && (
                        <span
                          className="text-[10px] px-2 py-0.5 rounded-full"
                          style={{ background: theme.colors.parchment, color: theme.colors.textMuted }}
                        >
                          Original
                        </span>
                      )}
                      {isSelected && (
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ background: itemColor }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Waveform Player Section */}
        <div className="px-4 py-3">
          {/* Hidden audio element */}
          <audio ref={audioRef} src={selectedTranslation.audioSrc} preload="metadata" />

          <div className="flex items-center gap-3">
            {/* Play/Pause Button */}
            <button
              onClick={togglePlayPause}
              disabled={isLoading}
              className={cn(
                'flex-shrink-0 w-12 h-12 rounded-full',
                'flex items-center justify-center',
                'transition-all duration-200',
                'hover:scale-105 active:scale-95',
                isLoading && 'opacity-50 cursor-wait'
              )}
              style={{
                background: theme.colors.terracotta,
                boxShadow: theme.shadows.terracotta,
              }}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : isPlaying ? (
                <PauseIcon className="w-6 h-6 text-white" />
              ) : (
                <PlayIcon className="w-6 h-6 text-white ml-0.5" />
              )}
            </button>

            {/* Waveform and Progress */}
            <div className="flex-1 flex flex-col gap-2">
              {/* Waveform visualization */}
              <div
                ref={progressRef}
                className="relative h-10 cursor-pointer select-none"
                onClick={handleProgressClick}
                onMouseDown={handleDragStart}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                role="slider"
                aria-label="Audio progress"
                aria-valuemin={0}
                aria-valuemax={duration}
                aria-valuenow={currentTime}
                tabIndex={0}
                onKeyDown={(e) => {
                  const audio = audioRef.current;
                  if (!audio) return;
                  if (e.key === 'ArrowRight') {
                    audio.currentTime = Math.min(duration, currentTime + 5);
                  } else if (e.key === 'ArrowLeft') {
                    audio.currentTime = Math.max(0, currentTime - 5);
                  } else if (e.key === ' ') {
                    e.preventDefault();
                    togglePlayPause();
                  }
                }}
              >
                <div className="absolute inset-0 flex items-center gap-[1px]">
                  {waveformBars.map((height, index) => {
                    const barProgress = (index / BAR_COUNT) * 100;
                    const isPlayed = barProgress < progress;

                    return (
                      <div
                        key={index}
                        className="flex-1 transition-colors duration-100"
                        style={{
                          height: `${height * 100}%`,
                          minWidth: '2px',
                          borderRadius: '1px',
                          backgroundColor: isPlayed
                            ? theme.colors.terracotta
                            : theme.colors.textMuted,
                          opacity: isPlayed ? 1 : 0.35,
                        }}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Time and Speed Controls */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-medium">
                  <span style={{ color: theme.colors.textSecondary }}>
                    {formatTime(currentTime)}
                  </span>
                  <span style={{ color: theme.colors.textMuted }}>/</span>
                  <span style={{ color: theme.colors.textMuted }}>
                    {formatTime(duration)}
                  </span>
                </div>

                {/* Speed Control Buttons */}
                <div className="flex items-center gap-1">
                  {PLAYBACK_SPEEDS.map((speed) => (
                    <button
                      key={speed}
                      onClick={() => setPlaybackSpeed(speed)}
                      className={cn(
                        'px-2 py-0.5 rounded-md text-xs font-semibold transition-all',
                        playbackSpeed === speed
                          ? 'text-white'
                          : 'hover:opacity-80'
                      )}
                      style={{
                        background: playbackSpeed === speed ? theme.colors.terracotta : `${theme.colors.terracotta}15`,
                        color: playbackSpeed === speed ? 'white' : theme.colors.terracotta,
                      }}
                    >
                      {speed}x
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Transcription Preview */}
        {selectedTranslation.transcription && (
          <div
            className="mx-4 mb-4 p-3 rounded-xl cursor-pointer transition-all hover:opacity-90"
            style={{
              background: 'rgba(255, 255, 255, 0.6)',
              border: `1px solid ${theme.colors.parchment}`,
            }}
            onClick={onTranscriptionClick}
          >
            <div className="flex items-start gap-2">
              <TranscriptIcon
                className="w-4 h-4 flex-shrink-0 mt-0.5"
                style={{ color: theme.colors.textMuted } as React.CSSProperties}
              />
              <div className="flex-1 min-w-0">
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: theme.colors.textSecondary }}
                >
                  {truncatedTranscription}
                </p>
                {isTruncated && (
                  <button
                    className="text-xs font-medium mt-1 hover:underline"
                    style={{ color: theme.colors.terracotta }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onTranscriptionClick?.();
                    }}
                  >
                    voir plus...
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Caption Below Card */}
      {caption && (
        <div
          className={cn(
            'mt-3 px-2',
            isSent ? 'text-right' : 'text-left'
          )}
        >
          <p
            className="text-sm leading-relaxed"
            style={{
              color: theme.colors.textSecondary,
              fontFamily: theme.fonts.body,
            }}
          >
            {caption}
          </p>
        </div>
      )}

      {/* Click outside to close language menu */}
      {showLanguageMenu && (
        <div
          className="fixed inset-0 z-20"
          onClick={() => setShowLanguageMenu(false)}
        />
      )}
    </div>
  );
}
