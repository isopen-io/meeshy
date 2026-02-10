/**
 * Composant pour l'aperçu et la lecture des fichiers audio
 */

'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Loader2, CheckCircle } from 'lucide-react';
import { AudioFilePreviewProps } from './types';

export const AudioFilePreview = React.memo(function AudioFilePreview({
  file,
  extension,
  isUploading,
  isUploaded,
  progress
}: AudioFilePreviewProps) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    // Créer le blob URL une seule fois et le stocker dans la ref
    const url = URL.createObjectURL(file);
    blobUrlRef.current = url;
    setAudioUrl(url);

    // Créer un audio element temporaire pour obtenir la durée
    const audio = new Audio(url);
    audio.addEventListener('loadedmetadata', () => {
      setAudioDuration(audio.duration || 0);
    });

    // Cleanup : révoquer le blob URL seulement au démontage du composant
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [file]);

  // Handler pour mettre à jour le temps actuel
  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const toggleAudioPlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (audioRef.current) {
      if (isPlayingAudio) {
        audioRef.current.pause();
        setIsPlayingAudio(false);
      } else {
        audioRef.current.play().catch(error => {
          console.error('Error playing audio:', error);
        });
        setIsPlayingAudio(true);
      }
    }
  };

  // Handler pour permettre de cliquer sur la barre de progression pour changer la position
  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (audioRef.current && audioDuration > 0) {
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const percentage = clickX / rect.width;
      const newTime = percentage * audioDuration;
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const formatTime = (seconds: number): string => {
    if (!isFinite(seconds) || isNaN(seconds)) return '0:00.00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100); // Centièmes de seconde
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  if (!audioUrl) return null;

  return (
    <>
      {/* Audio element caché */}
      <audio
        ref={audioRef}
        src={audioUrl}
        preload="metadata"
        onTimeUpdate={handleTimeUpdate}
        onEnded={() => {
          setIsPlayingAudio(false);
          setCurrentTime(0);
        }}
        onPause={() => setIsPlayingAudio(false)}
        onPlay={() => setIsPlayingAudio(true)}
        className="hidden"
      />

      {/* Container flex-col pour infos et barre de progression */}
      <div className="flex flex-col gap-1 flex-1 min-w-0">
        {/* Countdown et format */}
        <div className="flex items-center justify-between">
          <div className="text-sm font-bold text-green-600 dark:text-green-400 font-mono tabular-nums">
            {formatTime(isPlayingAudio ? audioDuration - currentTime : audioDuration)}
          </div>
          <div className="text-[11px] text-green-600 dark:text-green-400 font-medium">
            {extension.toUpperCase()}
          </div>
        </div>

        {/* Barre de progression - Interactive */}
        <div
          className="relative w-full h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden cursor-pointer hover:h-1.5 transition-[height]"
          onClick={handleProgressBarClick}
        >
          <div
            className="absolute top-0 left-0 h-full bg-green-600 dark:bg-green-500 rounded-full transition-[width] duration-100 pointer-events-none"
            style={{
              width: `${audioDuration > 0 ? (currentTime / audioDuration) * 100 : 0}%`
            }}
          />
        </div>

        {/* Taille et status */}
        <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400">
          <span>{(file.size / 1024).toFixed(0)} KB</span>
          <span>{isPlayingAudio ? 'Playing...' : 'Ready'}</span>
        </div>
      </div>

      {/* Bouton Play/Pause */}
      <button
        onClick={toggleAudioPlay}
        className="flex-shrink-0 w-10 h-10 bg-green-600 hover:bg-green-700 text-white rounded-full flex items-center justify-center transition-colors ml-2"
        disabled={isUploading}
      >
        {isPlayingAudio ? (
          <Pause className="w-4 h-4 fill-current" />
        ) : (
          <Play className="w-4 h-4 fill-current ml-0.5" />
        )}
      </button>

      {/* Indicateur d'upload pour audio */}
      {isUploading && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg">
          <div className="text-center">
            <Loader2 className="w-4 h-4 text-white animate-spin mx-auto mb-1" />
            <div className="text-white text-[11px] font-medium">
              {Math.round(progress || 0)}%
            </div>
          </div>
        </div>
      )}

      {/* Indicateur d'upload terminé pour audio */}
      {isUploaded && (
        <div className="absolute top-1 right-1">
          <CheckCircle className="w-3 h-3 text-green-500 bg-white rounded-full" />
        </div>
      )}
    </>
  );
});
