'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { Play, Pause, AlertTriangle, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { UploadedAttachmentResponse } from '@meeshy/shared/types/attachment';
import type { AudioEffectType } from '@meeshy/shared/types/video-call';

// Hooks personnalisés
import { useAudioPlayback } from '@/hooks/use-audio-playback';
import { useAudioTranslation } from '@/hooks/use-audio-translation';
import { useAudioEffectsAnalysis } from '@/hooks/use-audio-effects-analysis';

// Composants UI
import { AudioProgressBar } from './AudioProgressBar';
import { AudioControls } from './AudioControls';
import { AudioTranscriptionPanel } from './AudioTranscriptionPanel';

// Utilitaires
import { snapPlaybackRate } from '@/utils/audio-formatters';

// Import dynamique pour le panneau d'effets (optimisation)
import dynamic from 'next/dynamic';

const AudioEffectsPanel = dynamic(
  () => import('./AudioEffectsPanel').then(mod => ({ default: mod.AudioEffectsPanel })),
  { ssr: false }
);

interface SimpleAudioPlayerProps {
  attachment: UploadedAttachmentResponse;
  messageId?: string;
  initialTranscription?: { text: string; language: string; confidence?: number };
  initialTranslatedAudios?: readonly any[];
  className?: string;
}

/**
 * Lecteur audio moderne et performant
 * Refactorisé pour séparer la logique de l'UI
 *
 * Fonctionnalités:
 * - Lecture/pause avec gestion globale des médias
 * - Contrôle de vitesse de lecture
 * - Transcription et traduction audio
 * - Visualisation des effets audio appliqués
 * - Responsive et accessible
 */
export const SimpleAudioPlayer: React.FC<SimpleAudioPlayerProps> = ({
  attachment,
  messageId,
  initialTranscription,
  initialTranslatedAudios,
  className = '',
}) => {
  // États UI locaux
  const [isSpeedPopoverOpen, setIsSpeedPopoverOpen] = useState(false);
  const [isLanguageDropdownOpen, setIsLanguageDropdownOpen] = useState(false);
  const [isEffectsDropdownOpen, setIsEffectsDropdownOpen] = useState(false);

  // Hook de traduction (doit être avant playback car il fournit currentAudioUrl)
  const {
    transcription,
    isTranscribing,
    transcriptionError,
    isTranscriptionExpanded,
    setIsTranscriptionExpanded,
    translatedAudios,
    isTranslating,
    translationError,
    selectedLanguage,
    setSelectedLanguage,
    currentAudioUrl,
    requestTranscription,
    requestTranslation,
  } = useAudioTranslation({
    attachmentId: attachment.id,
    messageId,
    initialTranscription,
    initialTranslatedAudios,
    attachmentFileUrl: attachment.fileUrl,
  });

  // Hook de lecture audio
  const {
    audioRef,
    isPlaying,
    isLoading,
    hasError,
    errorMessage,
    currentTime,
    duration,
    objectUrl,
    playbackRate,
    togglePlay,
    handleSeek,
    handleSeekToTime,
    setPlaybackRate,
    handleLoadedMetadata,
    handleEnded,
    handleAudioError,
  } = useAudioPlayback({
    audioUrl: currentAudioUrl,
    attachmentId: attachment.id,
    attachmentDuration: attachment.duration ? attachment.duration / 1000 : undefined,
    mimeType: attachment.mimeType,
  });

  // Hook d'analyse des effets
  const {
    appliedEffects,
    effectsTimeline,
    effectsConfigurations,
    selectedEffectTab,
    setSelectedEffectTab,
    visibleCurves,
    setVisibleCurves,
    visibleOverviewCurves,
    setVisibleOverviewCurves,
  } = useAudioEffectsAnalysis({
    attachment,
    duration,
    attachmentDuration: attachment.duration ? attachment.duration / 1000 : undefined,
  });

  // Handler pour la vitesse de lecture avec points d'accroche
  const handlePlaybackRateChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    const finalValue = snapPlaybackRate(value);
    setPlaybackRate(finalValue);
  }, [setPlaybackRate]);

  // Calculer le pourcentage de progression
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Handlers de transcription/traduction avec reset des erreurs
  const handleRequestTranscription = useCallback(() => {
    requestTranscription();
  }, [requestTranscription]);

  const handleRequestTranslation = useCallback(() => {
    requestTranslation();
  }, [requestTranslation]);

  return (
    <div
      className={`relative flex flex-col gap-1.5 p-2 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-900 rounded-lg border ${
        hasError ? 'border-red-300 dark:border-red-700' : 'border-blue-200 dark:border-gray-700'
      } shadow-md hover:shadow-lg transition-all duration-200 w-full max-w-[90vw] sm:max-w-2xl ${className}`}
    >
      {/* Ligne principale: Play + Zone centrale */}
      <div className="flex items-center gap-3">
        {/* Bouton Play/Pause */}
        <div className="flex flex-col gap-1 items-center">
          <Button
            onClick={togglePlay}
            disabled={isLoading || hasError}
            size="sm"
            className={`flex-shrink-0 w-7 h-7 rounded-full ${
              hasError
                ? 'bg-red-500 hover:bg-red-600'
                : 'bg-blue-600 hover:bg-blue-700'
            } text-white shadow-lg hover:shadow-xl transition-all duration-200 p-0 flex items-center justify-center disabled:opacity-50`}
          >
            {isLoading ? (
              <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : hasError ? (
              <AlertTriangle className="w-3 h-3" />
            ) : isPlaying ? (
              <Pause className="w-3 h-3 fill-current" />
            ) : (
              <Play className="w-3 h-3 ml-0.5 fill-current" />
            )}
          </Button>
        </div>

        {/* Zone centrale: Controls + Barre de progression */}
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          {/* Ligne de contrôles */}
          <AudioControls
            isPlaying={isPlaying}
            isLoading={isLoading}
            hasError={hasError}
            errorMessage={errorMessage}
            duration={duration}
            currentTime={currentTime}
            playbackRate={playbackRate}
            isSpeedPopoverOpen={isSpeedPopoverOpen}
            setIsSpeedPopoverOpen={setIsSpeedPopoverOpen}
            onPlaybackRateChange={handlePlaybackRateChange}
            selectedLanguage={selectedLanguage}
            setSelectedLanguage={setSelectedLanguage}
            translatedAudios={translatedAudios}
            isLanguageDropdownOpen={isLanguageDropdownOpen}
            setIsLanguageDropdownOpen={setIsLanguageDropdownOpen}
            transcription={transcription}
            isTranscribing={isTranscribing}
            transcriptionError={transcriptionError}
            isTranscriptionExpanded={isTranscriptionExpanded}
            setIsTranscriptionExpanded={setIsTranscriptionExpanded}
            requestTranscription={handleRequestTranscription}
            isTranslating={isTranslating}
            translationError={translationError}
            requestTranslation={handleRequestTranslation}
            objectUrl={objectUrl}
            downloadFileName={attachment.originalName}
            onTogglePlay={togglePlay}
          />

          {/* Barre de progression + Download */}
          <div className="flex items-center gap-2">
            <AudioProgressBar
              currentTime={currentTime}
              duration={duration}
              progress={progress}
              isPlaying={isPlaying}
              onSeek={handleSeek}
            />

            {/* Bouton Download */}
            <a
              href={objectUrl || '#'}
              download={attachment.originalName}
              className="relative z-10 flex-shrink-0 inline-flex items-center justify-center w-5 h-5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-all"
              title="Télécharger l'audio"
              onClick={(e) => {
                if (!objectUrl) {
                  e.preventDefault();
                }
              }}
            >
              <Download className="w-3 h-3 text-gray-700 dark:text-gray-200" />
            </a>
          </div>
        </div>
      </div>

      {/* Panneau de transcription et erreurs */}
      <AudioTranscriptionPanel
        transcription={transcription}
        isExpanded={isTranscriptionExpanded}
        onToggleExpanded={() => setIsTranscriptionExpanded(!isTranscriptionExpanded)}
        transcriptionError={transcriptionError}
        translationError={translationError}
        selectedLanguage={selectedLanguage}
        translatedAudiosCount={translatedAudios.length}
        onRequestTranscription={handleRequestTranscription}
        onRequestTranslation={handleRequestTranslation}
      />

      {/* Panneau d'effets (chargé dynamiquement) */}
      {appliedEffects.length > 0 && (
        <AudioEffectsPanel
          appliedEffects={appliedEffects}
          effectsTimeline={effectsTimeline}
          effectsConfigurations={effectsConfigurations}
          duration={duration}
          attachmentDuration={attachment.duration ? attachment.duration / 1000 : undefined}
          selectedEffectTab={selectedEffectTab}
          setSelectedEffectTab={setSelectedEffectTab}
          visibleCurves={visibleCurves}
          setVisibleCurves={setVisibleCurves}
          visibleOverviewCurves={visibleOverviewCurves}
          setVisibleOverviewCurves={setVisibleOverviewCurves}
          isOpen={isEffectsDropdownOpen}
          setIsOpen={setIsEffectsDropdownOpen}
          onSeekToTime={handleSeekToTime}
        />
      )}

      {/* Audio element caché */}
      <audio
        ref={audioRef}
        src={objectUrl || undefined}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        onError={handleAudioError}
        preload="metadata"
      >
        Votre navigateur ne supporte pas la lecture audio.
      </audio>
    </div>
  );
};

/**
 * Version compacte pour les petits écrans
 */
export const CompactAudioPlayer: React.FC<SimpleAudioPlayerProps> = ({
  attachment,
  className = '',
}) => {
  const attachmentDuration = attachment.duration ? attachment.duration / 1000 : undefined;

  const {
    audioRef,
    isPlaying,
    objectUrl,
    duration,
    togglePlay,
    handleLoadedMetadata,
    handleEnded,
  } = useAudioPlayback({
    audioUrl: attachment.fileUrl,
    attachmentId: attachment.id,
    attachmentDuration,
    mimeType: attachment.mimeType,
  });

  const formatDuration = (seconds: number): string => {
    if (!seconds || !isFinite(seconds)) return '0:00';
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-2 bg-blue-100 dark:bg-blue-900/30 rounded-full ${className}`}
    >
      {/* Bouton Play/Pause compact */}
      <button
        onClick={togglePlay}
        disabled={!objectUrl}
        className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center transition-all duration-200 disabled:opacity-50"
      >
        {isPlaying ? (
          <Pause className="w-4 h-4 fill-current" />
        ) : (
          <Play className="w-4 h-4 ml-0.5 fill-current" />
        )}
      </button>

      {/* Durée */}
      <span className="text-sm font-mono text-blue-700 dark:text-blue-300">
        {formatDuration(duration)}
      </span>

      {/* Audio element caché */}
      <audio
        ref={audioRef}
        src={objectUrl || undefined}
        onEnded={handleEnded}
        onLoadedMetadata={handleLoadedMetadata}
        preload="metadata"
      />
    </div>
  );
};
