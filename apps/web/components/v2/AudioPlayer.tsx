'use client';

import { HTMLAttributes, useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { theme } from './theme';

export interface AudioPlayerProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onPlay' | 'onPause'> {
  /** Audio source URL */
  src: string;
  /** Optional pre-known duration in seconds (avoids loading delay) */
  duration?: number;
  /** Callback when playback starts */
  onPlay?: () => void;
  /** Callback when playback pauses */
  onPause?: () => void;
  /** Callback when playback ends */
  onEnded?: () => void;
}

/**
 * Format seconds to mm:ss
 */
function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Generate pseudo-random waveform bar heights
 * Uses a seed based on src to ensure consistent waveform per audio
 */
function generateWaveform(src: string, barCount: number): number[] {
  // Simple hash function for consistent pseudo-random values
  let hash = 0;
  for (let i = 0; i < src.length; i++) {
    const char = src.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }

  const bars: number[] = [];
  for (let i = 0; i < barCount; i++) {
    // Generate pseudo-random heights between 0.3 and 1
    const seed = Math.abs(Math.sin(hash + i * 1.5) * 10000);
    const height = 0.3 + (seed % 1) * 0.7;
    bars.push(height);
  }
  return bars;
}

// Play icon SVG
function PlayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

// Pause icon SVG
function PauseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
    </svg>
  );
}

const BAR_COUNT = 32;
const BAR_GAP = 2;
const BAR_WIDTH = 3;

export function AudioPlayer({
  src,
  duration: propDuration,
  onPlay,
  onPause,
  onEnded,
  className,
  ...props
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(propDuration || 0);
  const [isLoading, setIsLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Generate consistent waveform based on src
  const waveformBars = useMemo(() => generateWaveform(src, BAR_COUNT), [src]);

  // Calculate progress percentage
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Update duration when audio metadata loads
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      if (!propDuration && audio.duration && isFinite(audio.duration)) {
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
  }, [propDuration, onPlay, onPause, onEnded]);

  // Use prop duration if provided
  useEffect(() => {
    if (propDuration && propDuration > 0) {
      setDuration(propDuration);
    }
  }, [propDuration]);

  // Toggle play/pause
  const togglePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(console.error);
    }
  }, [isPlaying]);

  // Seek to position
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

  // Handle click on progress bar
  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    seekTo(e.clientX);
  }, [seekTo]);

  // Handle drag start
  const handleDragStart = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
    seekTo(e.clientX);
  }, [seekTo]);

  // Handle drag move and end
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

  // Handle touch events for mobile
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

  return (
    <div
      className={cn(
        'flex items-center gap-3 p-3 rounded-xl',
        'bg-gradient-to-r from-[#F5EDE3] to-[#FFF8F3]',
        'border border-[#E5E5E5]',
        'min-w-[240px] max-w-[320px]',
        className
      )}
      style={{
        boxShadow: theme.shadows.sm,
      }}
      {...props}
    >
      {/* Hidden audio element */}
      <audio ref={audioRef} src={src} preload="metadata" />

      {/* Play/Pause button */}
      <button
        onClick={togglePlayPause}
        disabled={isLoading}
        className={cn(
          'flex-shrink-0 w-10 h-10 rounded-full',
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
          <div
            className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"
          />
        ) : isPlaying ? (
          <PauseIcon className="w-5 h-5 text-white" />
        ) : (
          <PlayIcon className="w-5 h-5 text-white ml-0.5" />
        )}
      </button>

      {/* Waveform and progress */}
      <div className="flex-1 flex flex-col gap-1.5">
        {/* Waveform visualization */}
        <div
          ref={progressRef}
          className="relative h-8 cursor-pointer select-none"
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
          {/* Waveform bars container */}
          <div className="absolute inset-0 flex items-center justify-between gap-[2px]">
            {waveformBars.map((height, index) => {
              const barProgress = (index / BAR_COUNT) * 100;
              const isPlayed = barProgress < progress;

              return (
                <div
                  key={index}
                  className="flex-1 transition-colors duration-150"
                  style={{
                    height: `${height * 100}%`,
                    minWidth: `${BAR_WIDTH}px`,
                    maxWidth: `${BAR_WIDTH + 1}px`,
                    borderRadius: '2px',
                    backgroundColor: isPlayed
                      ? theme.colors.terracotta
                      : theme.colors.textMuted,
                    opacity: isPlayed ? 1 : 0.4,
                  }}
                />
              );
            })}
          </div>

          {/* Invisible progress overlay for better click detection */}
          <div className="absolute inset-0" />
        </div>

        {/* Time display */}
        <div className="flex items-center justify-between text-xs font-medium">
          <span style={{ color: theme.colors.textSecondary }}>
            {formatTime(currentTime)}
          </span>
          <span style={{ color: theme.colors.textMuted }}>
            {formatTime(duration)}
          </span>
        </div>
      </div>
    </div>
  );
}
