'use client';

import { forwardRef, useRef, useState, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';

export interface VideoPlayerProps {
  /** Video source URL */
  src: string;
  /** Thumbnail/poster image URL */
  poster?: string;
  /** Video duration in seconds (displayed on thumbnail if provided) */
  duration?: number;
  /** Callback when video starts playing */
  onPlay?: () => void;
  /** Callback when video is paused */
  onPause?: () => void;
  /** Callback when video ends */
  onEnded?: () => void;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Format seconds to MM:SS or HH:MM:SS
 */
function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

const VideoPlayer = forwardRef<HTMLVideoElement, VideoPlayerProps>(
  ({ src, poster, duration, onPlay, onPause, onEnded, className }, ref) => {
    const internalRef = useRef<HTMLVideoElement>(null);
    const videoRef = (ref as React.RefObject<HTMLVideoElement>) || internalRef;
    const containerRef = useRef<HTMLDivElement>(null);

    const [isPlaying, setIsPlaying] = useState(false);
    const [showControls, setShowControls] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [videoDuration, setVideoDuration] = useState(duration || 0);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isSeeking, setIsSeeking] = useState(false);

    // Update duration when video metadata loads
    const handleLoadedMetadata = useCallback(() => {
      if (videoRef.current) {
        setVideoDuration(videoRef.current.duration);
      }
    }, [videoRef]);

    // Update current time during playback
    const handleTimeUpdate = useCallback(() => {
      if (videoRef.current && !isSeeking) {
        setCurrentTime(videoRef.current.currentTime);
      }
    }, [videoRef, isSeeking]);

    // Handle play
    const handlePlay = useCallback(() => {
      setIsPlaying(true);
      setShowControls(true);
      onPlay?.();
    }, [onPlay]);

    // Handle pause
    const handlePause = useCallback(() => {
      setIsPlaying(false);
      onPause?.();
    }, [onPause]);

    // Handle ended
    const handleEnded = useCallback(() => {
      setIsPlaying(false);
      setShowControls(false);
      onEnded?.();
    }, [onEnded]);

    // Toggle play/pause
    const togglePlay = useCallback(() => {
      if (videoRef.current) {
        if (isPlaying) {
          videoRef.current.pause();
        } else {
          videoRef.current.play();
        }
      }
    }, [videoRef, isPlaying]);

    // Start playback (from thumbnail view)
    const startPlayback = useCallback(() => {
      if (videoRef.current) {
        setShowControls(true);
        videoRef.current.play();
      }
    }, [videoRef]);

    // Handle progress bar click
    const handleProgressClick = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (videoRef.current) {
          const rect = e.currentTarget.getBoundingClientRect();
          const percent = (e.clientX - rect.left) / rect.width;
          const newTime = percent * videoDuration;
          videoRef.current.currentTime = newTime;
          setCurrentTime(newTime);
        }
      },
      [videoRef, videoDuration]
    );

    // Handle fullscreen toggle
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

    // Listen for fullscreen changes
    useEffect(() => {
      const handleFullscreenChange = () => {
        setIsFullscreen(!!document.fullscreenElement);
      };

      document.addEventListener('fullscreenchange', handleFullscreenChange);
      return () => {
        document.removeEventListener('fullscreenchange', handleFullscreenChange);
      };
    }, []);

    const progress = videoDuration > 0 ? (currentTime / videoDuration) * 100 : 0;

    return (
      <div
        ref={containerRef}
        className={cn(
          'relative overflow-hidden bg-[var(--gp-background)] transition-colors duration-300',
          'rounded-xl',
          isFullscreen ? 'w-full h-full' : 'aspect-video',
          className
        )}
      >
        {/* Video Element */}
        <video
          ref={videoRef}
          src={src}
          poster={poster}
          className="w-full h-full object-cover"
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onPlay={handlePlay}
          onPause={handlePause}
          onEnded={handleEnded}
          playsInline
        />

        {/* Thumbnail Overlay (shown when not playing and controls hidden) */}
        {!showControls && (
          <div
            className="absolute inset-0 flex items-center justify-center cursor-pointer group"
            onClick={startPlayback}
          >
            {/* Poster image fallback */}
            {poster && (
              <img
                src={poster}
                alt="Video thumbnail"
                width={1280}
                height={720}
                loading="eager"
                className="absolute inset-0 w-full h-full object-cover"
              />
            )}

            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

            {/* Play Button */}
            <div
              className={cn(
                'relative z-10 w-16 h-16 rounded-full flex items-center justify-center',
                'bg-[var(--gp-surface-elevated)]/90 backdrop-blur-sm',
                'shadow-[var(--gp-shadow-lg)]',
                'transition-all duration-300 ease-out',
                'group-hover:scale-110 group-hover:bg-[var(--gp-surface-elevated)]'
              )}
            >
              <svg
                className="w-7 h-7 text-[var(--gp-terracotta)] ml-1"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>

            {/* Duration Badge */}
            {(duration || videoDuration > 0) && (
              <div
                className={cn(
                  'absolute bottom-3 right-3 z-10',
                  'px-2 py-1 rounded-md',
                  'bg-black/70 backdrop-blur-sm',
                  'text-white text-sm font-medium',
                  'font-[var(--gp-font-body)]'
                )}
              >
                {formatDuration(duration || videoDuration)}
              </div>
            )}
          </div>
        )}

        {/* Video Controls (shown when playing or controls are visible) */}
        {showControls && (
          <div
            className={cn(
              'absolute inset-0 flex flex-col justify-end',
              'bg-gradient-to-t from-black/70 via-transparent to-transparent',
              'transition-opacity duration-300',
              isPlaying ? 'opacity-0 hover:opacity-100' : 'opacity-100'
            )}
          >
            {/* Center Play/Pause Button */}
            <div
              className="absolute inset-0 flex items-center justify-center cursor-pointer"
              onClick={togglePlay}
            >
              {!isPlaying && (
                <div
                  className={cn(
                    'w-16 h-16 rounded-full flex items-center justify-center',
                    'bg-[var(--gp-surface-elevated)]/90 backdrop-blur-sm',
                    'shadow-[var(--gp-shadow-lg)]',
                    'transition-all duration-300 ease-out',
                    'hover:scale-110 hover:bg-[var(--gp-surface-elevated)]'
                  )}
                >
                  <svg
                    className="w-7 h-7 text-[var(--gp-terracotta)] ml-1"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              )}
            </div>

            {/* Bottom Controls Bar */}
            <div className="relative z-10 p-3 space-y-2">
              {/* Progress Bar */}
              <div
                className="relative h-1 bg-[var(--gp-surface)]/30 rounded-full cursor-pointer group/progress"
                onClick={handleProgressClick}
                onMouseDown={() => setIsSeeking(true)}
                onMouseUp={() => setIsSeeking(false)}
                onMouseLeave={() => setIsSeeking(false)}
              >
                {/* Progress Fill */}
                <div
                  className="absolute inset-y-0 left-0 bg-[var(--gp-terracotta)] rounded-full transition-all"
                  style={{ width: `${progress}%` }}
                />
                {/* Progress Handle */}
                <div
                  className={cn(
                    'absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full',
                    'bg-[var(--gp-surface-elevated)] shadow-[var(--gp-shadow-md)]',
                    'transition-transform duration-150',
                    'opacity-0 group-hover/progress:opacity-100',
                    'scale-0 group-hover/progress:scale-100'
                  )}
                  style={{ left: `calc(${progress}% - 6px)` }}
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
                    {isPlaying ? (
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    )}
                  </button>

                  {/* Time Display */}
                  <span className="text-white text-sm font-medium tabular-nums">
                    {formatDuration(currentTime)} / {formatDuration(videoDuration)}
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
                  {isFullscreen ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 9L4 4m0 0v5m0-5h5m6 0l5-5m0 0v5m0-5h-5m-6 16l-5 5m0 0v-5m0 5h5m6 0l5 5m0 0v-5m0 5h-5"
                      />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5h-4m4 0v-4m0 4l-5-5"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
);

VideoPlayer.displayName = 'VideoPlayer';

export { VideoPlayer };
