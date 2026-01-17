'use client';

import React, { memo } from 'react';

interface AudioProgressBarProps {
  currentTime: number;
  duration: number;
  progress: number;
  isPlaying: boolean;
  onSeek: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

/**
 * Barre de progression audio avec curseur interactif
 * Optimisée pour les mises à jour fréquentes (60fps)
 */
export const AudioProgressBar = memo<AudioProgressBarProps>(({
  currentTime,
  duration,
  progress,
  isPlaying,
  onSeek,
}) => {
  return (
    <div className="relative flex-1 h-[15px] bg-gray-200 dark:bg-gray-700 rounded-full overflow-visible group cursor-pointer">
      {/* Barre de progression remplie avec animation fluide */}
      <div
        className={`absolute top-0 left-0 h-full rounded-full ${
          isPlaying
            ? 'bg-gradient-to-r from-blue-500 via-blue-600 to-blue-500 dark:from-blue-400 dark:via-blue-500 dark:to-blue-400'
            : 'bg-blue-600 dark:bg-blue-500'
        }`}
        style={{
          width: `${progress}%`,
          transition: 'none',
        }}
      />

      {/* Curseur de position - Visible au survol */}
      <div
        className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white dark:bg-gray-100 rounded-full shadow-lg border-2 border-blue-600 dark:border-blue-400 opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity duration-200 pointer-events-none"
        style={{
          left: `calc(${progress}% - 8px)`,
        }}
      />

      {/* Pourcentage centré dans la barre */}
      {duration > 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-[9px] font-semibold text-white dark:text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
            {progress.toFixed(0)}%
          </span>
        </div>
      )}

      {/* Input range invisible pour le contrôle */}
      <input
        type="range"
        min="0"
        max={duration || 100}
        value={currentTime}
        onChange={onSeek}
        className="absolute top-0 left-0 w-full h-full opacity-0 cursor-pointer z-10"
        style={{ touchAction: 'none' }}
        aria-label="Position audio"
      />
    </div>
  );
});

AudioProgressBar.displayName = 'AudioProgressBar';
