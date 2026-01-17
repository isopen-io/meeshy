'use client';

import React, { memo } from 'react';
import { Play, Pause, AlertTriangle, Gauge, Download, Globe, FileText, Loader2, Languages } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { formatTime, snapPlaybackRate } from '@/utils/audio-formatters';
import { LANGUAGE_NAMES } from '@/utils/audio-effects-config';
import type { TranslatedAudioData } from '@meeshy/shared/types/socketio-events';

interface AudioControlsProps {
  // État de lecture
  isPlaying: boolean;
  isLoading: boolean;
  hasError: boolean;
  errorMessage: string;
  duration: number;
  currentTime: number;

  // Vitesse de lecture
  playbackRate: number;
  isSpeedPopoverOpen: boolean;
  setIsSpeedPopoverOpen: (open: boolean) => void;
  onPlaybackRateChange: (e: React.ChangeEvent<HTMLInputElement>) => void;

  // Traductions
  selectedLanguage: string;
  setSelectedLanguage: (language: string) => void;
  translatedAudios: readonly TranslatedAudioData[];
  isLanguageDropdownOpen: boolean;
  setIsLanguageDropdownOpen: (open: boolean) => void;

  // Transcription
  transcription?: { text: string; language: string; confidence?: number };
  isTranscribing: boolean;
  transcriptionError: string | null;
  isTranscriptionExpanded: boolean;
  setIsTranscriptionExpanded: (expanded: boolean) => void;
  requestTranscription: () => void;

  // Traduction audio
  isTranslating: boolean;
  translationError: string | null;
  requestTranslation: () => void;

  // Download
  objectUrl: string | null;
  downloadFileName: string;

  // Actions
  onTogglePlay: () => void;
}

/**
 * Contrôles audio avec boutons play/pause, vitesse, langue, transcription
 * Optimisé avec React.memo pour éviter les re-renders inutiles
 */
export const AudioControls = memo<AudioControlsProps>(({
  isPlaying,
  isLoading,
  hasError,
  errorMessage,
  duration,
  currentTime,
  playbackRate,
  isSpeedPopoverOpen,
  setIsSpeedPopoverOpen,
  onPlaybackRateChange,
  selectedLanguage,
  setSelectedLanguage,
  translatedAudios,
  isLanguageDropdownOpen,
  setIsLanguageDropdownOpen,
  transcription,
  isTranscribing,
  transcriptionError,
  isTranscriptionExpanded,
  setIsTranscriptionExpanded,
  requestTranscription,
  isTranslating,
  translationError,
  requestTranslation,
  objectUrl,
  downloadFileName,
  onTogglePlay,
}) => {
  return (
    <div className="flex items-center justify-center gap-2">
      {/* Timer */}
      <div className="text-[12px] font-mono text-gray-600 dark:text-gray-300">
        {hasError ? (
          <span className="font-semibold text-red-600 dark:text-red-400 text-[10px]">
            {errorMessage}
          </span>
        ) : duration > 0 ? (
          <span className="font-bold text-blue-600 dark:text-blue-400 tracking-wider">
            {formatTime(Math.max(0, duration - currentTime))}
          </span>
        ) : (
          <span className="font-semibold text-gray-400 dark:text-gray-500 text-[10px]">
            Chargement...
          </span>
        )}
      </div>

      {/* Bouton Gauge - Vitesse de lecture */}
      <DropdownMenu open={isSpeedPopoverOpen} onOpenChange={setIsSpeedPopoverOpen}>
        <DropdownMenuTrigger asChild>
          <button
            className="relative z-10 flex-shrink-0 inline-flex items-center justify-center w-5 h-5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-all cursor-pointer"
            title={`Vitesse: ${playbackRate}x`}
            aria-label={`Vitesse de lecture: ${playbackRate}x`}
          >
            <Gauge className="w-3 h-3 text-gray-700 dark:text-gray-200" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="min-w-0 w-auto p-0.5" side="top" align="center">
          <div className="flex flex-col items-center gap-0.5 px-1">
            <div className="relative h-16 flex items-center justify-center">
              <input
                type="range"
                min="0.1"
                max="5"
                step="0.01"
                value={playbackRate}
                onChange={onPlaybackRateChange}
                onInput={onPlaybackRateChange}
                className="h-full appearance-none bg-gray-200 dark:bg-gray-600 rounded-full cursor-pointer"
                style={{
                  writingMode: 'vertical-lr' as const,
                  WebkitAppearance: 'slider-vertical',
                  width: '4px',
                  touchAction: 'none',
                }}
                aria-label="Ajuster la vitesse de lecture"
              />
            </div>
            <div className="text-[8px] font-bold text-blue-600 dark:text-blue-400 whitespace-nowrap">
              {playbackRate.toFixed(1)}x
            </div>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Bouton Langue - Sélecteur de traduction audio */}
      {translatedAudios.length > 0 && (
        <DropdownMenu open={isLanguageDropdownOpen} onOpenChange={setIsLanguageDropdownOpen}>
          <DropdownMenuTrigger asChild>
            <button
              className="relative z-10 flex-shrink-0 inline-flex items-center justify-center w-5 h-5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-all cursor-pointer"
              title={`Langue: ${LANGUAGE_NAMES[selectedLanguage] || selectedLanguage}`}
              aria-label={`Sélectionner la langue audio (${LANGUAGE_NAMES[selectedLanguage] || selectedLanguage})`}
            >
              <Globe className="w-3 h-3 text-gray-700 dark:text-gray-200" />
              {selectedLanguage !== 'original' && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full" />
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-[120px]" side="top" align="center">
            <DropdownMenuItem
              onClick={() => setSelectedLanguage('original')}
              className={selectedLanguage === 'original' ? 'bg-blue-50 dark:bg-blue-900/30' : ''}
            >
              <span className="text-sm">{LANGUAGE_NAMES['original']}</span>
              {selectedLanguage === 'original' && <span className="ml-auto text-blue-600">✓</span>}
            </DropdownMenuItem>
            {translatedAudios.map((audio) => (
              <DropdownMenuItem
                key={audio.language}
                onClick={() => setSelectedLanguage(audio.language)}
                className={selectedLanguage === audio.language ? 'bg-blue-50 dark:bg-blue-900/30' : ''}
              >
                <span className="text-sm">{LANGUAGE_NAMES[audio.language] || audio.language}</span>
                {audio.voiceCloned && (
                  <span className="ml-1 text-xs text-purple-500" title="Voix clonée">🎭</span>
                )}
                {selectedLanguage === audio.language && <span className="ml-auto text-blue-600">✓</span>}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Bouton Transcription */}
      {isTranscribing ? (
        <button
          className="relative z-10 flex-shrink-0 inline-flex items-center justify-center w-5 h-5 cursor-wait"
          title="Transcription en cours..."
          aria-label="Transcription en cours"
          disabled
        >
          <Loader2 className="w-3 h-3 text-blue-500 animate-spin" />
        </button>
      ) : transcription ? (
        <button
          onClick={() => setIsTranscriptionExpanded(!isTranscriptionExpanded)}
          className="relative z-10 flex-shrink-0 inline-flex items-center justify-center w-5 h-5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-all cursor-pointer"
          title="Voir la transcription"
          aria-label="Afficher/masquer la transcription"
          aria-expanded={isTranscriptionExpanded}
        >
          <FileText className="w-3 h-3 text-green-600 dark:text-green-400" />
        </button>
      ) : (
        <button
          onClick={requestTranscription}
          className="relative z-10 flex-shrink-0 inline-flex items-center justify-center w-5 h-5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-all cursor-pointer"
          title={transcriptionError || "Transcrire l'audio (texte)"}
          aria-label="Demander la transcription"
        >
          <FileText className={`w-3 h-3 ${transcriptionError ? 'text-red-500' : 'text-gray-500 dark:text-gray-400'}`} />
        </button>
      )}

      {/* Bouton Traduction */}
      {isTranslating ? (
        <button
          className="relative z-10 flex-shrink-0 inline-flex items-center justify-center w-5 h-5 cursor-wait"
          title="Traduction en cours..."
          aria-label="Traduction en cours"
          disabled
        >
          <Loader2 className="w-3 h-3 text-purple-500 animate-spin" />
        </button>
      ) : translatedAudios.length === 0 && (
        <button
          onClick={requestTranslation}
          className="relative z-10 flex-shrink-0 inline-flex items-center justify-center w-5 h-5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-all cursor-pointer"
          title={translationError || "Traduire l'audio"}
          aria-label="Demander la traduction audio"
        >
          <Languages className={`w-3 h-3 ${translationError ? 'text-red-500' : 'text-gray-500 dark:text-gray-400'}`} />
        </button>
      )}
    </div>
  );
});

AudioControls.displayName = 'AudioControls';
