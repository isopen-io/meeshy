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

const PLAYBACK_SPEEDS = [1, 1.25, 1.5, 1.75, 2, 2.5, 3] as const;
type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];

const CONTROLS_HIDE_DELAY_MS = 2500;

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
    const progressRef = useRef<HTMLDivElement>(null);
    const hideControlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [isPlaying, setIsPlaying] = useState(false);
    const [hasStarted, setHasStarted] = useState(false);
    const [overlayVisible, setOverlayVisible] = useState(true);
    const [currentTime, setCurrentTime] = useState(0);
    const [videoDuration, setVideoDuration] = useState(duration || 0);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isSeeking, setIsSeeking] = useState(false);
    const [seekHover, setSeekHover] = useState(false);
    const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>(1);

    const progress = videoDuration > 0 ? (currentTime / videoDuration) * 100 : 0;
    const progressPct = Math.round(progress);

    const scheduleHideControls = useCallback(() => {
      if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
      hideControlsTimer.current = setTimeout(() => {
        setOverlayVisible(false);
      }, CONTROLS_HIDE_DELAY_MS);
    }, []);

    const revealControls = useCallback(() => {
      setOverlayVisible(true);
      if (isPlaying) scheduleHideControls();
    }, [isPlaying, scheduleHideControls]);

    useEffect(() => {
      return () => {
        if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
      };
    }, []);

    const handleLoadedMetadata = useCallback(() => {
      if (videoRef.current) {
        setVideoDuration(videoRef.current.duration);
      }
    }, [videoRef]);

    const handleTimeUpdate = useCallback(() => {
      if (videoRef.current && !isSeeking) {
        setCurrentTime(videoRef.current.currentTime);
      }
    }, [videoRef, isSeeking]);

    const handlePlay = useCallback(() => {
      setIsPlaying(true);
      setHasStarted(true);
      setOverlayVisible(true);
      scheduleHideControls();
      onPlay?.();
    }, [onPlay, scheduleHideControls]);

    const handlePause = useCallback(() => {
      setIsPlaying(false);
      setOverlayVisible(true);
      if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
      onPause?.();
    }, [onPause]);

    const handleEnded = useCallback(() => {
      setIsPlaying(false);
      setHasStarted(false);
      setOverlayVisible(true);
      setCurrentTime(0);
      if (videoRef.current) {
        videoRef.current.currentTime = 0;
      }
      if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
      onEnded?.();
    }, [onEnded, videoRef]);

    const togglePlay = useCallback(() => {
      if (!videoRef.current) return;
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play().catch(() => {});
      }
    }, [videoRef, isPlaying]);

    const startPlayback = useCallback(() => {
      if (!videoRef.current) return;
      videoRef.current.play().catch(() => {});
    }, [videoRef]);

    const cycleSpeed = useCallback(() => {
      const idx = PLAYBACK_SPEEDS.indexOf(playbackSpeed);
      const next = PLAYBACK_SPEEDS[(idx + 1) % PLAYBACK_SPEEDS.length];
      setPlaybackSpeed(next);
      if (videoRef.current) {
        videoRef.current.playbackRate = next;
      }
      revealControls();
    }, [playbackSpeed, videoRef, revealControls]);

    const seekFromClientX = useCallback(
      (clientX: number) => {
        if (!videoRef.current || !progressRef.current || videoDuration <= 0) return;
        const rect = progressRef.current.getBoundingClientRect();
        const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        const newTime = percent * videoDuration;
        videoRef.current.currentTime = newTime;
        setCurrentTime(newTime);
      },
      [videoRef, videoDuration],
    );

    const handleProgressMouseDown = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsSeeking(true);
        seekFromClientX(e.clientX);
      },
      [seekFromClientX],
    );

    useEffect(() => {
      if (!isSeeking) return;
      const onMove = (e: MouseEvent) => seekFromClientX(e.clientX);
      const onUp = () => setIsSeeking(false);
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      return () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
    }, [isSeeking, seekFromClientX]);

    const handleTouchStart = useCallback(
      (e: React.TouchEvent<HTMLDivElement>) => {
        setIsSeeking(true);
        seekFromClientX(e.touches[0].clientX);
      },
      [seekFromClientX],
    );

    const handleTouchMove = useCallback(
      (e: React.TouchEvent<HTMLDivElement>) => {
        if (isSeeking) seekFromClientX(e.touches[0].clientX);
      },
      [isSeeking, seekFromClientX],
    );

    const handleTouchEnd = useCallback(() => {
      setIsSeeking(false);
    }, []);

    const toggleFullscreen = useCallback(() => {
      if (!containerRef.current) return;
      if (!document.fullscreenElement) {
        containerRef.current.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen();
      }
    }, []);

    useEffect(() => {
      const onChange = () => setIsFullscreen(!!document.fullscreenElement);
      document.addEventListener('fullscreenchange', onChange);
      return () => document.removeEventListener('fullscreenchange', onChange);
    }, []);

    const thumbSize = isSeeking ? 28 : seekHover ? 25 : 14;
    const thumbScale = isSeeking ? 'scale-100' : seekHover ? 'scale-100' : 'scale-0 group-hover/progress:scale-100';

    return (
      <div
        ref={containerRef}
        className={cn(
          'relative overflow-hidden bg-[var(--gp-background)] transition-colors duration-300',
          'rounded-xl group/player',
          isFullscreen ? 'w-full h-full' : 'aspect-video',
          className,
        )}
        onMouseMove={revealControls}
        onClick={() => {
          if (hasStarted) revealControls();
        }}
      >
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

        {/* IDLE / END STATE: thumbnail + center play */}
        {!hasStarted && (
          <div
            className="absolute inset-0 flex items-center justify-center cursor-pointer group"
            onClick={startPlayback}
          >
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

            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

            <div
              className={cn(
                'relative z-10 w-16 h-16 rounded-full flex items-center justify-center',
                'bg-white/15 backdrop-blur-xl backdrop-saturate-150',
                'border border-white/25',
                'shadow-[0_8px_32px_rgba(0,0,0,0.35)]',
                'transition-all duration-300 ease-out',
                'group-hover:scale-110 group-hover:bg-white/25',
              )}
            >
              <svg className="w-7 h-7 text-white ml-1 drop-shadow-md" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>

            {(duration || videoDuration > 0) && (
              <div
                className={cn(
                  'absolute bottom-3 right-3 z-10',
                  'px-2.5 py-1 rounded-full',
                  'bg-black/40 backdrop-blur-md border border-white/10',
                  'text-white text-xs font-semibold tabular-nums',
                )}
              >
                {formatDuration(duration || videoDuration)}
              </div>
            )}
          </div>
        )}

        {/* PLAYING/PAUSED STATE: FAB-style controls */}
        {hasStarted && (
          <div
            className={cn(
              'absolute inset-0 flex flex-col justify-between pointer-events-none',
              'bg-gradient-to-t from-black/55 via-transparent to-black/25',
              'transition-opacity duration-300',
              overlayVisible || !isPlaying || isSeeking ? 'opacity-100' : 'opacity-0',
            )}
          >
            {/* Top-right: Speed FAB */}
            <div className="flex justify-end p-3 pointer-events-auto">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  cycleSpeed();
                }}
                className={cn(
                  'min-w-[44px] h-9 px-3 rounded-full',
                  'flex items-center justify-center',
                  'bg-white/15 backdrop-blur-xl backdrop-saturate-150',
                  'border border-white/25',
                  'shadow-[0_4px_16px_rgba(0,0,0,0.3)]',
                  'text-white text-xs font-bold tabular-nums',
                  'transition-all duration-200',
                  'hover:bg-white/25 hover:scale-105 active:scale-95',
                )}
                aria-label={`Vitesse de lecture ${playbackSpeed}x`}
              >
                {playbackSpeed}x
              </button>
            </div>

            {/* Center: play/pause FAB (visible only when paused) */}
            <div
              className="absolute inset-0 flex items-center justify-center pointer-events-auto"
              onClick={(e) => {
                e.stopPropagation();
                togglePlay();
              }}
            >
              {!isPlaying && (
                <div
                  className={cn(
                    'w-16 h-16 rounded-full flex items-center justify-center cursor-pointer',
                    'bg-white/15 backdrop-blur-xl backdrop-saturate-150',
                    'border border-white/25',
                    'shadow-[0_8px_32px_rgba(0,0,0,0.4)]',
                    'transition-all duration-300 ease-out',
                    'hover:scale-110 hover:bg-white/25',
                  )}
                >
                  <svg className="w-7 h-7 text-white ml-1 drop-shadow-md" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              )}
            </div>

            {/* Bottom controls bar */}
            <div className="relative z-10 p-3 space-y-2 pointer-events-auto" onClick={(e) => e.stopPropagation()}>
              {/* Progress bar with chunky thumb + % label */}
              <div
                ref={progressRef}
                className="relative h-7 flex items-center cursor-pointer group/progress select-none"
                onMouseDown={handleProgressMouseDown}
                onMouseEnter={() => setSeekHover(true)}
                onMouseLeave={() => setSeekHover(false)}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                role="slider"
                aria-label="Video progress"
                aria-valuemin={0}
                aria-valuemax={videoDuration || 0}
                aria-valuenow={currentTime}
              >
                <div className="relative w-full h-1.5 bg-white/25 rounded-full overflow-visible">
                  <div
                    className="absolute inset-y-0 left-0 bg-white rounded-full"
                    style={{ width: `${progress}%` }}
                  />
                  {/* Chunky thumb with % label */}
                  <div
                    className={cn(
                      'absolute top-1/2 -translate-x-1/2 -translate-y-1/2',
                      'rounded-full flex items-center justify-center',
                      'bg-white/95 backdrop-blur-md border border-white/40',
                      'shadow-[0_4px_14px_rgba(0,0,0,0.45)]',
                      'transition-[width,height,opacity] duration-150 ease-out',
                      thumbScale,
                    )}
                    style={{
                      left: `${progress}%`,
                      width: `${thumbSize}px`,
                      height: `${thumbSize}px`,
                    }}
                  >
                    {(isSeeking || seekHover) && (
                      <span
                        className={cn(
                          'text-[9px] font-bold tabular-nums leading-none',
                          'text-black',
                          'transition-opacity duration-150',
                        )}
                      >
                        {progressPct}%
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Bottom row: play/pause + time + fullscreen */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={togglePlay}
                    className={cn(
                      'w-9 h-9 flex items-center justify-center rounded-full',
                      'bg-white/15 backdrop-blur-xl backdrop-saturate-150',
                      'border border-white/25',
                      'shadow-[0_4px_12px_rgba(0,0,0,0.3)]',
                      'text-white hover:bg-white/25 hover:scale-105 active:scale-95',
                      'transition-all duration-200',
                    )}
                    aria-label={isPlaying ? 'Pause' : 'Play'}
                  >
                    {isPlaying ? (
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    )}
                  </button>

                  <span className="text-white text-xs font-semibold tabular-nums drop-shadow-md">
                    {formatDuration(currentTime)} / {formatDuration(videoDuration)}
                  </span>
                </div>

                <button
                  onClick={toggleFullscreen}
                  className={cn(
                    'w-9 h-9 flex items-center justify-center rounded-full',
                    'bg-white/15 backdrop-blur-xl backdrop-saturate-150',
                    'border border-white/25',
                    'shadow-[0_4px_12px_rgba(0,0,0,0.3)]',
                    'text-white hover:bg-white/25 hover:scale-105 active:scale-95',
                    'transition-all duration-200',
                  )}
                  aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                >
                  {isFullscreen ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 9L4 4m0 0v5m0-5h5m6 0l5-5m0 0v5m0-5h-5m-6 16l-5 5m0 0v-5m0 5h5m6 0l5 5m0 0v-5m0 5h-5"
                      />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
  },
);

VideoPlayer.displayName = 'VideoPlayer';

export { VideoPlayer };
