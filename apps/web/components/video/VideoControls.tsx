'use client';

import React, { memo } from 'react';
import { Play, Pause, AlertTriangle, Download, Maximize, Minimize } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { VolumeControl } from './VolumeControl';

interface VideoControlsProps {
  isPlaying: boolean;
  isLoading: boolean;
  hasError: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  isFullscreen: boolean;
  downloadUrl: string;
  downloadName: string;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onVolumeChange: (volume: number) => void;
  onToggleMute: () => void;
  onToggleFullscreen: () => void;
}

export const VideoControls = memo<VideoControlsProps>(function VideoControls({
  isPlaying,
  isLoading,
  hasError,
  currentTime,
  duration,
  volume,
  isMuted,
  isFullscreen,
  downloadUrl,
  downloadName,
  onTogglePlay,
  onSeek,
  onVolumeChange,
  onToggleMute,
  onToggleFullscreen
}) {
  const formatTime = (seconds: number): string => {
    if (!isFinite(seconds) || isNaN(seconds) || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 && isFinite(currentTime) && isFinite(duration)
    ? Math.min(Math.max((currentTime / duration) * 100, 0), 100)
    : 0;

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    onSeek(parseFloat(e.target.value));
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        onClick={onTogglePlay}
        disabled={isLoading || hasError}
        size="sm"
        className={`flex-shrink-0 w-9 h-9 rounded-full ${
          hasError
            ? 'bg-red-500 hover:bg-red-600'
            : 'bg-purple-600 hover:bg-purple-700'
        } text-white shadow-lg hover:shadow-xl transition-all duration-200 p-0 flex items-center justify-center disabled:opacity-50`}
      >
        {isLoading ? (
          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
        ) : hasError ? (
          <AlertTriangle className="w-4 h-4" />
        ) : isPlaying ? (
          <Pause className="w-4 h-4 fill-current" />
        ) : (
          <Play className="w-4 h-4 ml-0.5 fill-current" />
        )}
      </Button>

      <span className="text-xs font-mono text-gray-600 dark:text-gray-300 flex-shrink-0">
        {formatTime(currentTime)}
      </span>

      <div className="flex-1 relative h-[15px] bg-gray-200 dark:bg-gray-700 rounded-full overflow-visible group cursor-pointer">
        <div
          className={`absolute top-0 left-0 h-full rounded-full ${
            isPlaying
              ? 'bg-gradient-to-r from-purple-500 via-purple-600 to-purple-500 dark:from-purple-400 dark:via-purple-500 dark:to-purple-400'
              : 'bg-purple-600 dark:bg-purple-500'
          }`}
          style={{
            width: `${progress}%`,
            transition: 'none',
          }}
        />

        <div
          className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white dark:bg-gray-100 rounded-full shadow-lg border-2 border-purple-600 dark:border-purple-400 opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity duration-200 pointer-events-none"
          style={{
            left: `calc(${Math.min(progress, 100)}% - 8px)`,
          }}
        />

        {duration > 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-[9px] font-semibold text-white dark:text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
              {progress.toFixed(0)}%
            </span>
          </div>
        )}

        <input
          type="range"
          min="0"
          max={duration || 100}
          value={currentTime}
          onChange={handleSeek}
          className="absolute top-0 left-0 w-full h-full opacity-0 cursor-pointer z-10"
          style={{ touchAction: 'none' }}
        />
      </div>

      <span className="text-xs font-mono text-gray-600 dark:text-gray-300 flex-shrink-0">
        {formatTime(duration)}
      </span>

      <VolumeControl
        volume={volume}
        isMuted={isMuted}
        onVolumeChange={onVolumeChange}
        onToggleMute={onToggleMute}
      />

      <Button
        onClick={onToggleFullscreen}
        size="sm"
        variant="ghost"
        className="w-8 h-8 p-0"
        title={isFullscreen ? 'Quitter le plein écran' : 'Plein écran'}
      >
        {isFullscreen ? (
          <Minimize className="w-4 h-4" />
        ) : (
          <Maximize className="w-4 h-4" />
        )}
      </Button>

      <a
        href={downloadUrl}
        download={downloadName}
        className="flex-shrink-0 p-1.5 hover:bg-white/50 dark:hover:bg-gray-700/50 rounded-full transition-all duration-200"
        title="Télécharger"
        onClick={(e) => e.stopPropagation()}
      >
        <Download className="w-4 h-4 text-gray-600 dark:text-gray-300" />
      </a>
    </div>
  );
});
