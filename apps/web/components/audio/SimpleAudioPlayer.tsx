'use client';

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Play, Pause, AlertTriangle, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { UploadedAttachmentResponse } from '@meeshy/shared/types/attachment';
import type { AudioEffectType } from '@meeshy/shared/types/video-call';
import type { TranslatedAudioData } from '@meeshy/shared/types';

// Hooks personnalisés
import { useAudioPlayback } from '@/hooks/use-audio-playback';
import { useAudioTranslation } from '@/hooks/use-audio-translation';
import { useAudioEffectsAnalysis } from '@/hooks/use-audio-effects-analysis';
import { useAuth } from '@/hooks/use-auth';

// Composants UI
import { AudioProgressBar } from './AudioProgressBar';
import { AudioControls } from './AudioControls';
import { TranscriptionViewer } from './TranscriptionViewer';

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
  initialTranscription?: { text: string; language: string; confidence?: number; segments?: any[] };
  initialTranslations?: Record<string, any>; // Structure BD: { "en": { transcription: "...", url: "...", ... }, ... }
  className?: string;
}

/**
 * Lecteur audio moderne avec design amélioré
 *
 * Fonctionnalités:
 * - Lecture/pause avec gestion globale des médias
 * - Contrôle de vitesse de lecture
 * - Transcription avec effet fondu et surlignage dynamique
 * - Menu de traduction complet avec aperçu et lecture
 * - Visualisation des effets audio appliqués
 * - Design moderne et accessible
 */
export const SimpleAudioPlayer: React.FC<SimpleAudioPlayerProps> = ({
  attachment,
  messageId,
  initialTranscription,
  initialTranslations,
  className = '',
}) => {
  // Utilisateur connecté (pour afficher son avatar)
  const { user } = useAuth();

  // Langues préférées de l'utilisateur pour auto-sélection audio
  const userLanguages = useMemo(() => {
    if (!user) return undefined;
    const langs: string[] = [];
    if (user.systemLanguage) langs.push(user.systemLanguage);
    if (user.regionalLanguage && user.regionalLanguage !== user.systemLanguage)
      langs.push(user.regionalLanguage);
    if (user.customDestinationLanguage && !langs.includes(user.customDestinationLanguage))
      langs.push(user.customDestinationLanguage);
    return langs.length > 0 ? langs : undefined;
  }, [user]);

  // États UI locaux
  const [isSpeedPopoverOpen, setIsSpeedPopoverOpen] = useState(false);
  const [isLanguageDropdownOpen, setIsLanguageDropdownOpen] = useState(false);
  const [isTranslationDropdownOpen, setIsTranslationDropdownOpen] = useState(false);
  const [isEffectsDropdownOpen, setIsEffectsDropdownOpen] = useState(false);

  // Hook de traduction (doit être avant playback car il fournit currentAudioUrl)
  const {
    transcription,
    currentTranscription,
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
    currentAudioDuration, // Durée de l'audio actuellement sélectionné
    requestTranscription,
    requestTranslation,
  } = useAudioTranslation({
    attachmentId: attachment.id,
    messageId,
    initialTranscription,
    initialTranslations,
    attachmentFileUrl: attachment.fileUrl,
    userLanguages,
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
    // Utiliser la durée de l'audio traduit si disponible, sinon celle de l'original
    attachmentDuration: currentAudioDuration ?? (attachment.duration ? attachment.duration / 1000 : undefined),
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

  const handleRequestTranslation = useCallback((targetLanguages: string[]) => {
    requestTranslation({ targetLanguages });
  }, [requestTranslation]);

  // Handler pour toggle de l'expansion de la transcription
  const handleToggleTranscriptionExpanded = useCallback(() => {
    setIsTranscriptionExpanded(!isTranscriptionExpanded);
  }, [isTranscriptionExpanded, setIsTranscriptionExpanded]);

  return (
    <div
      className={`relative group flex flex-col gap-3 p-4 bg-gradient-to-br from-slate-50/80 via-blue-50/50 to-indigo-50/80 dark:from-slate-900/80 dark:via-slate-800/50 dark:to-indigo-950/80 rounded-2xl border ${
        hasError
          ? 'border-red-300/50 dark:border-red-700/50 shadow-red-100 dark:shadow-red-900/20'
          : 'border-slate-200/50 dark:border-slate-700/50 shadow-slate-100 dark:shadow-slate-900/20'
      } shadow-lg hover:shadow-xl transition-shadow duration-300 ease-out w-full max-w-[90vw] sm:max-w-2xl backdrop-blur-sm ${className}`}
    >
      {/* Ligne principale: Play + Zone centrale */}
      <div className="flex items-start gap-4">
        {/* Bouton Play/Pause avec design amélioré */}
        <div className="flex flex-col gap-1.5 items-center flex-shrink-0 pt-1">
          <Button
            onClick={togglePlay}
            disabled={isLoading || hasError}
            aria-label={isPlaying ? 'Pause' : 'Lecture'}
            size="sm"
            className={`relative w-10 h-10 rounded-full ${
              hasError
                ? 'bg-gradient-to-br from-red-500 to-red-600 hover:from-red-600 hover:to-red-700'
                : 'bg-gradient-to-br from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700'
            } text-white shadow-lg hover:shadow-2xl transition-[background-color,box-shadow] duration-200 p-0 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed`}
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
        </div>

        {/* Zone centrale: Controls + Barre de progression */}
        <div className="flex-1 min-w-0 flex flex-col gap-2.5">
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
            isTranslationDropdownOpen={isTranslationDropdownOpen}
            setIsTranslationDropdownOpen={setIsTranslationDropdownOpen}
            objectUrl={objectUrl}
            downloadFileName={attachment.originalName}
            onTogglePlay={togglePlay}
          />

          {/* Barre de progression */}
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
              className="relative z-10 flex-shrink-0 inline-flex items-center justify-center w-5 h-5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
              title="Télécharger l'audio"
              aria-label="Télécharger l'audio"
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

      {/* Transcription avec effet fondu et surlignage dynamique */}
      {currentTranscription && currentTranscription.text && (
        <TranscriptionViewer
          transcription={currentTranscription}
          isExpanded={isTranscriptionExpanded}
          onToggleExpanded={handleToggleTranscriptionExpanded}
          currentTime={currentTime}
          isPlaying={isPlaying}
          selectedLanguage={selectedLanguage}
          translatedAudios={translatedAudios}
          userAvatar={user?.avatar || null}
        />
      )}

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
        aria-label={isPlaying ? 'Pause' : 'Lecture'}
        className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center transition-colors duration-200 disabled:opacity-50"
      >
        {isPlaying ? (
          <Pause className="w-4 h-4 fill-current" />
        ) : (
          <Play className="w-4 h-4 ml-0.5 fill-current" />
        )}
      </button>

      {/* Durée */}
      <span className="text-sm font-mono tabular-nums text-blue-700 dark:text-blue-300">
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
