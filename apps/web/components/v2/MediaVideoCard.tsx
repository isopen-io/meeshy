'use client';

import { useState, useRef, useCallback, useEffect, memo, CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { theme, getLanguageColor } from './theme';

// ============================================================================
// Types
// ============================================================================

export interface VideoTranslation {
  languageCode: string;
  languageName: string;
  videoSrc: string;
  transcription: string;
  isOriginal?: boolean;
}

export interface MediaVideoCardProps {
  /** Available video translations */
  translations: VideoTranslation[];
  /** Default language code to display */
  defaultLanguage?: string;
  /** Video poster/thumbnail image */
  poster?: string;
  /** Caption text displayed below the video */
  caption?: string;
  /** Name of the sender */
  senderName?: string;
  /** Message timestamp */
  timestamp: string;
  /** Whether this card is from the current user (sent) */
  isSent?: boolean;
  /** Callback when transcription "voir plus" is clicked */
  onTranscriptionClick?: () => void;
  /** Additional CSS classes */
  className?: string;
}

// ============================================================================
// Constants
// ============================================================================

const FLAG_MAP: Record<string, string> = {
  fr: '\u{1F1EB}\u{1F1F7}',
  en: '\u{1F1EC}\u{1F1E7}',
  es: '\u{1F1EA}\u{1F1F8}',
  zh: '\u{1F1E8}\u{1F1F3}',
  ja: '\u{1F1EF}\u{1F1F5}',
  ar: '\u{1F1F8}\u{1F1E6}',
  de: '\u{1F1E9}\u{1F1EA}',
  pt: '\u{1F1E7}\u{1F1F7}',
  ru: '\u{1F1F7}\u{1F1FA}',
  ko: '\u{1F1F0}\u{1F1F7}',
  it: '\u{1F1EE}\u{1F1F9}',
  nl: '\u{1F1F3}\u{1F1F1}',
  tr: '\u{1F1F9}\u{1F1F7}',
  hi: '\u{1F1EE}\u{1F1F3}',
  vi: '\u{1F1FB}\u{1F1F3}',
  th: '\u{1F1F9}\u{1F1ED}',
  pl: '\u{1F1F5}\u{1F1F1}',
  uk: '\u{1F1FA}\u{1F1E6}',
  sv: '\u{1F1F8}\u{1F1EA}',
  no: '\u{1F1F3}\u{1F1F4}',
};

const PLAYBACK_SPEEDS = [1, 1.5, 2] as const;
type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];

const TRANSCRIPTION_MAX_LENGTH = 100;

// ============================================================================
// Helper Functions
// ============================================================================

function getFlag(code: string): string {
  const normalized = code.toLowerCase().slice(0, 2);
  return FLAG_MAP[normalized] || '\u{1F310}';
}

function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function truncateText(text: string, maxLength: number): { truncated: string; isTruncated: boolean } {
  if (text.length <= maxLength) {
    return { truncated: text, isTruncated: false };
  }
  return { truncated: text.slice(0, maxLength).trim() + '...', isTruncated: true };
}

// ============================================================================
// Icon Props Type
// ============================================================================

interface IconProps {
  className?: string;
  style?: CSSProperties;
}

// ============================================================================
// Sub-Components
// ============================================================================

// Chevron Icon
function ChevronIcon({ className = 'w-4 h-4', direction = 'down' }: { className?: string; direction?: 'down' | 'up' }) {
  return (
    <svg
      className={cn(className, 'transition-transform duration-200', direction === 'up' && 'rotate-180')}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

// Play Icon
function PlayIcon({ className = 'w-6 h-6', style }: IconProps) {
  return (
    <svg className={className} style={style} fill="currentColor" viewBox="0 0 24 24">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

// Pause Icon
function PauseIcon({ className = 'w-6 h-6', style }: IconProps) {
  return (
    <svg className={className} style={style} fill="currentColor" viewBox="0 0 24 24">
      <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
    </svg>
  );
}

// Fullscreen Icon
function FullscreenIcon({ className = 'w-5 h-5', isFullscreen = false, style }: IconProps & { isFullscreen?: boolean }) {
  if (isFullscreen) {
    return (
      <svg className={className} style={style} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 9L4 4m0 0v5m0-5h5m6 0l5-5m0 0v5m0-5h-5m-6 16l-5 5m0 0v-5m0 5h5m6 0l5 5m0 0v-5m0 5h-5"
        />
      </svg>
    );
  }
  return (
    <svg className={className} style={style} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5h-4m4 0v-4m0 4l-5-5"
      />
    </svg>
  );
}

// Globe/Language Icon
function LanguageIcon({ className = 'w-4 h-4', style }: IconProps) {
  return (
    <svg className={className} style={style} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
      />
    </svg>
  );
}

// Document/Transcription Icon
function TranscriptionIcon({ className = 'w-4 h-4', style }: IconProps) {
  return (
    <svg className={className} style={style} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  );
}

// ============================================================================
// Language Selector Popup
// ============================================================================

interface LanguageSelectorProps {
  translations: VideoTranslation[];
  selectedLanguage: string;
  onSelect: (translation: VideoTranslation) => void;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}

const LanguageSelector = memo(function LanguageSelector({
  translations,
  selectedLanguage,
  onSelect,
  isOpen,
  onToggle,
  onClose,
}: LanguageSelectorProps) {
  const selectedTranslation = translations.find(t => t.languageCode === selectedLanguage);

  return (
    <div className="relative">
      {/* Trigger Button */}
      <button
        onClick={onToggle}
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg',
          'bg-white/90 backdrop-blur-sm',
          'border border-[#E5E5E5]',
          'hover:bg-white hover:border-[#D0D0D0]',
          'transition-all duration-200',
          'text-sm font-medium'
        )}
        style={{ color: theme.colors.charcoal }}
      >
        <LanguageIcon className="w-4 h-4" />
        <span>{getFlag(selectedLanguage)}</span>
        <span className="hidden sm:inline">{selectedTranslation?.languageName || selectedLanguage}</span>
        <ChevronIcon className="w-3.5 h-3.5" direction={isOpen ? 'up' : 'down'} />
      </button>

      {/* Dropdown Menu - positioned on RIGHT */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={onClose} />

          {/* Menu */}
          <div
            className={cn(
              'absolute right-0 top-full mt-2 z-50',
              'min-w-[200px] max-h-[280px] overflow-y-auto',
              'bg-white rounded-xl',
              'border border-[#E5E5E5]',
              'shadow-lg'
            )}
            style={{ boxShadow: theme.shadows.lg }}
          >
            <div className="py-2">
              {translations.map((translation) => {
                const isSelected = translation.languageCode === selectedLanguage;
                const itemColor = getLanguageColor(translation.languageCode);

                return (
                  <button
                    key={translation.languageCode}
                    onClick={() => onSelect(translation)}
                    className={cn(
                      'w-full px-4 py-2.5 flex items-center gap-3',
                      'hover:bg-gray-50 transition-colors duration-150',
                      'text-left',
                      isSelected && 'bg-gray-50'
                    )}
                  >
                    {/* Flag */}
                    <span className="text-xl flex-shrink-0">{getFlag(translation.languageCode)}</span>

                    {/* Language Name */}
                    <div className="flex-1 min-w-0">
                      <span
                        className="font-medium text-sm"
                        style={{ color: isSelected ? itemColor : theme.colors.charcoal }}
                      >
                        {translation.languageName}
                      </span>
                      {translation.isOriginal && (
                        <span
                          className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full"
                          style={{ background: theme.colors.parchment, color: theme.colors.textMuted }}
                        >
                          Original
                        </span>
                      )}
                    </div>

                    {/* Selected Indicator */}
                    {isSelected && (
                      <div
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ background: itemColor }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
});

// ============================================================================
// Speed Control
// ============================================================================

interface SpeedControlProps {
  currentSpeed: PlaybackSpeed;
  onSpeedChange: (speed: PlaybackSpeed) => void;
}

const SpeedControl = memo(function SpeedControl({ currentSpeed, onSpeedChange }: SpeedControlProps) {
  return (
    <div className="flex items-center gap-1 bg-black/50 backdrop-blur-sm rounded-lg p-1">
      {PLAYBACK_SPEEDS.map((speed) => (
        <button
          key={speed}
          onClick={() => onSpeedChange(speed)}
          className={cn(
            'px-2 py-1 rounded-md text-xs font-medium transition-all duration-200',
            currentSpeed === speed
              ? 'bg-white text-[#2B2D42]'
              : 'text-white/80 hover:text-white hover:bg-white/10'
          )}
        >
          {speed}x
        </button>
      ))}
    </div>
  );
});

// ============================================================================
// Transcription Preview
// ============================================================================

interface TranscriptionPreviewProps {
  transcription: string;
  languageCode: string;
  languageName: string;
  onViewMore?: () => void;
}

const TranscriptionPreview = memo(function TranscriptionPreview({
  transcription,
  languageCode,
  languageName,
  onViewMore,
}: TranscriptionPreviewProps) {
  const { truncated, isTruncated } = truncateText(transcription, TRANSCRIPTION_MAX_LENGTH);
  const langColor = getLanguageColor(languageCode);

  return (
    <div
      className={cn(
        'p-3 rounded-xl',
        'bg-gradient-to-r from-gray-50 to-white',
        'border border-[#E5E5E5]'
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <TranscriptionIcon className="w-4 h-4" style={{ color: langColor }} />
        <span className="text-xs font-semibold" style={{ color: theme.colors.charcoal }}>
          Transcription
        </span>
        <span className="text-xs" style={{ color: theme.colors.textMuted }}>
          ({languageName})
        </span>
      </div>

      {/* Content */}
      <p
        className="text-sm leading-relaxed"
        style={{ color: theme.colors.textSecondary }}
      >
        {truncated}
        {isTruncated && onViewMore && (
          <button
            onClick={onViewMore}
            className="ml-1 font-medium hover:underline transition-all"
            style={{ color: theme.colors.terracotta }}
          >
            voir plus...
          </button>
        )}
      </p>
    </div>
  );
});

// ============================================================================
// Main Component: MediaVideoCard
// ============================================================================

export const MediaVideoCard = memo(function MediaVideoCard({
  translations,
  defaultLanguage,
  poster,
  caption,
  senderName,
  timestamp,
  isSent = false,
  onTranscriptionClick,
  className,
}: MediaVideoCardProps) {
  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Find initial translation
  const initialTranslation = defaultLanguage
    ? translations.find(t => t.languageCode === defaultLanguage) || translations[0]
    : translations.find(t => t.isOriginal) || translations[0];

  const [selectedTranslation, setSelectedTranslation] = useState<VideoTranslation>(initialTranslation);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>(1);
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  // -------------------------------------------------------------------------
  // Video Event Handlers
  // -------------------------------------------------------------------------
  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  }, []);

  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current && !isSeeking) {
      setCurrentTime(videoRef.current.currentTime);
    }
  }, [isSeeking]);

  const handlePlay = useCallback(() => {
    setIsPlaying(true);
    setShowControls(true);
  }, []);

  const handlePause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
  }, []);

  // -------------------------------------------------------------------------
  // Control Handlers
  // -------------------------------------------------------------------------
  const togglePlay = useCallback(() => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
    }
  }, [isPlaying]);

  const startPlayback = useCallback(() => {
    if (videoRef.current) {
      setShowControls(true);
      videoRef.current.play();
    }
  }, []);

  const handleProgressClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (videoRef.current) {
        const rect = e.currentTarget.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        const newTime = percent * duration;
        videoRef.current.currentTime = newTime;
        setCurrentTime(newTime);
      }
    },
    [duration]
  );

  const handleSpeedChange = useCallback((speed: PlaybackSpeed) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;

    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {
        // Fullscreen not supported
      });
    } else {
      document.exitFullscreen();
    }
  }, []);

  const handleLanguageSelect = useCallback((translation: VideoTranslation) => {
    setSelectedTranslation(translation);
    setIsLanguageMenuOpen(false);

    // Reset video state when changing language
    if (videoRef.current) {
      const wasPlaying = isPlaying;
      const currentPosition = videoRef.current.currentTime;
      videoRef.current.src = translation.videoSrc;
      videoRef.current.load();

      // Restore position after source change
      videoRef.current.onloadeddata = () => {
        if (videoRef.current) {
          videoRef.current.currentTime = Math.min(currentPosition, videoRef.current.duration);
          if (wasPlaying) {
            videoRef.current.play();
          }
        }
      };
    }
  }, [isPlaying]);

  // -------------------------------------------------------------------------
  // Effects
  // -------------------------------------------------------------------------
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div
      className={cn(
        'w-full max-w-lg mx-auto',
        isSent ? 'ml-auto mr-0' : 'ml-0 mr-auto',
        className
      )}
    >
      {/* Main Card Container */}
      <div
        className={cn(
          'rounded-2xl overflow-hidden',
          'bg-white',
          'border border-[#E5E5E5]'
        )}
        style={{ boxShadow: theme.shadows.sm }}
      >
        {/* Header: Sender + Language Selector */}
        <div className="px-4 py-3 flex items-center justify-between border-b border-[#F0F0F0]">
          {/* Sender Info */}
          <div className="flex items-center gap-2">
            {senderName && (
              <>
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium text-white"
                  style={{ background: getLanguageColor(selectedTranslation.languageCode) }}
                >
                  {senderName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <span
                    className="text-sm font-semibold"
                    style={{ color: theme.colors.charcoal }}
                  >
                    {senderName}
                  </span>
                  <span
                    className="text-xs ml-2"
                    style={{ color: theme.colors.textMuted }}
                  >
                    {timestamp}
                  </span>
                </div>
              </>
            )}
            {!senderName && (
              <span
                className="text-xs"
                style={{ color: theme.colors.textMuted }}
              >
                {timestamp}
              </span>
            )}
          </div>

          {/* Language Selector (RIGHT side) */}
          {translations.length > 1 && (
            <LanguageSelector
              translations={translations}
              selectedLanguage={selectedTranslation.languageCode}
              onSelect={handleLanguageSelect}
              isOpen={isLanguageMenuOpen}
              onToggle={() => setIsLanguageMenuOpen(!isLanguageMenuOpen)}
              onClose={() => setIsLanguageMenuOpen(false)}
            />
          )}
        </div>

        {/* Video Player Container */}
        <div
          ref={containerRef}
          className={cn(
            'relative bg-[#16161A]',
            isFullscreen ? 'w-full h-full' : 'aspect-video'
          )}
        >
          {/* Video Element */}
          <video
            ref={videoRef}
            src={selectedTranslation.videoSrc}
            poster={poster}
            className="w-full h-full object-cover"
            onLoadedMetadata={handleLoadedMetadata}
            onTimeUpdate={handleTimeUpdate}
            onPlay={handlePlay}
            onPause={handlePause}
            onEnded={handleEnded}
            playsInline
          />

          {/* Thumbnail Overlay (when not playing) */}
          {!showControls && (
            <div
              className="absolute inset-0 flex items-center justify-center cursor-pointer group"
              onClick={startPlayback}
            >
              {/* Poster fallback */}
              {poster && (
                <img
                  src={poster}
                  alt="Video thumbnail"
                  className="absolute inset-0 w-full h-full object-cover"
                />
              )}

              {/* Gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

              {/* Play Button */}
              <div
                className={cn(
                  'relative z-10 w-16 h-16 rounded-full flex items-center justify-center',
                  'bg-white/90 backdrop-blur-sm',
                  'shadow-lg',
                  'transition-all duration-300 ease-out',
                  'group-hover:scale-110 group-hover:bg-white'
                )}
                style={{ boxShadow: theme.shadows.terracotta }}
              >
                <PlayIcon className="w-7 h-7 ml-1" style={{ color: theme.colors.terracotta }} />
              </div>

              {/* Duration Badge */}
              {duration > 0 && (
                <div
                  className={cn(
                    'absolute bottom-3 left-3 z-10',
                    'px-2 py-1 rounded-md',
                    'bg-black/70 backdrop-blur-sm',
                    'text-white text-sm font-medium'
                  )}
                >
                  {formatDuration(duration)}
                </div>
              )}

              {/* Speed Control (top right) */}
              <div className="absolute top-3 right-3 z-10">
                <SpeedControl currentSpeed={playbackSpeed} onSpeedChange={handleSpeedChange} />
              </div>
            </div>
          )}

          {/* Video Controls (when playing) */}
          {showControls && (
            <div
              className={cn(
                'absolute inset-0 flex flex-col justify-between',
                'bg-gradient-to-t from-black/70 via-transparent to-black/30',
                'transition-opacity duration-300',
                isPlaying ? 'opacity-0 hover:opacity-100' : 'opacity-100'
              )}
            >
              {/* Top Controls */}
              <div className="p-3 flex items-center justify-end">
                <SpeedControl currentSpeed={playbackSpeed} onSpeedChange={handleSpeedChange} />
              </div>

              {/* Center Play/Pause */}
              <div
                className="absolute inset-0 flex items-center justify-center cursor-pointer"
                onClick={togglePlay}
              >
                {!isPlaying && (
                  <div
                    className={cn(
                      'w-16 h-16 rounded-full flex items-center justify-center',
                      'bg-white/90 backdrop-blur-sm',
                      'shadow-lg',
                      'transition-all duration-300 ease-out',
                      'hover:scale-110 hover:bg-white'
                    )}
                  >
                    <PlayIcon className="w-7 h-7 ml-1" style={{ color: theme.colors.terracotta }} />
                  </div>
                )}
              </div>

              {/* Bottom Controls Bar */}
              <div className="relative z-10 p-3 space-y-2">
                {/* Progress Bar */}
                <div
                  className="relative h-1.5 bg-white/30 rounded-full cursor-pointer group/progress"
                  onClick={handleProgressClick}
                  onMouseDown={() => setIsSeeking(true)}
                  onMouseUp={() => setIsSeeking(false)}
                  onMouseLeave={() => setIsSeeking(false)}
                >
                  {/* Progress Fill */}
                  <div
                    className="absolute inset-y-0 left-0 rounded-full transition-all"
                    style={{ width: `${progress}%`, background: theme.colors.terracotta }}
                  />
                  {/* Progress Handle */}
                  <div
                    className={cn(
                      'absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full',
                      'bg-white shadow-md',
                      'transition-transform duration-150',
                      'opacity-0 group-hover/progress:opacity-100',
                      'scale-0 group-hover/progress:scale-100'
                    )}
                    style={{ left: `calc(${progress}% - 7px)` }}
                  />
                </div>

                {/* Control Buttons */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {/* Play/Pause Button */}
                    <button
                      onClick={togglePlay}
                      className={cn(
                        'w-8 h-8 flex items-center justify-center rounded-full',
                        'text-white hover:bg-white/20',
                        'transition-colors duration-200'
                      )}
                      aria-label={isPlaying ? 'Pause' : 'Play'}
                    >
                      {isPlaying ? <PauseIcon className="w-5 h-5" /> : <PlayIcon className="w-5 h-5 ml-0.5" />}
                    </button>

                    {/* Time Display */}
                    <span className="text-white text-sm font-medium tabular-nums">
                      {formatDuration(currentTime)} / {formatDuration(duration)}
                    </span>
                  </div>

                  {/* Fullscreen Button */}
                  <button
                    onClick={toggleFullscreen}
                    className={cn(
                      'w-8 h-8 flex items-center justify-center rounded-full',
                      'text-white hover:bg-white/20',
                      'transition-colors duration-200'
                    )}
                    aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                  >
                    <FullscreenIcon className="w-5 h-5" isFullscreen={isFullscreen} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Transcription Preview */}
        {selectedTranslation.transcription && (
          <div className="px-4 py-3 border-t border-[#F0F0F0]">
            <TranscriptionPreview
              transcription={selectedTranslation.transcription}
              languageCode={selectedTranslation.languageCode}
              languageName={selectedTranslation.languageName}
              onViewMore={onTranscriptionClick}
            />
          </div>
        )}

        {/* Caption */}
        {caption && (
          <div className="px-4 py-3 border-t border-[#F0F0F0]">
            <p
              className="text-sm leading-relaxed"
              style={{ color: theme.colors.textPrimary }}
            >
              {caption}
            </p>
          </div>
        )}
      </div>
    </div>
  );
});

MediaVideoCard.displayName = 'MediaVideoCard';

export default MediaVideoCard;
