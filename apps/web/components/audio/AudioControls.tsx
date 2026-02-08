'use client';

import React, { memo, useState } from 'react';
import { Play, Pause, AlertTriangle, Gauge, Download, Globe, FileText, Loader2, Languages, Check, Sparkles, Volume2, Plus } from 'lucide-react';
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

// Langues disponibles pour la traduction
const AVAILABLE_LANGUAGES = [
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'it', name: 'Italiano', flag: '🇮🇹' },
  { code: 'pt', name: 'Português', flag: '🇵🇹' },
];

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
  requestTranslation: (targetLanguages: string[]) => void;
  isTranslationDropdownOpen: boolean;
  setIsTranslationDropdownOpen: (open: boolean) => void;

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
  isTranslationDropdownOpen,
  setIsTranslationDropdownOpen,
  objectUrl,
  downloadFileName,
  onTogglePlay,
}) => {
  return (
    <div className="flex items-center justify-center gap-2">
      {/* Timer */}
      <div className="text-[12px] font-mono tabular-nums text-gray-600 dark:text-gray-300">
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

      {/* Bouton Langue - Sélecteur de traduction audio avec menu complet */}
      {(transcription || translatedAudios.length > 0) && (
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
          <DropdownMenuContent className="min-w-[280px] max-w-[320px] p-0" side="top" align="center">
            {/* Langue originale - toujours afficher si transcription OU traductions disponibles */}
            {(transcription || translatedAudios.length > 0) && (
              <>
                <div className="px-2 py-1.5 bg-gray-100 dark:bg-gray-800">
                  <p className="text-[10px] font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                    Original
                  </p>
                </div>
                <DropdownMenuItem
                  onClick={() => setSelectedLanguage('original')}
                  className={`flex items-start gap-2 px-3 py-2 cursor-pointer ${
                    selectedLanguage === 'original' ? 'bg-blue-50 dark:bg-blue-900/30' : ''
                  }`}
                >
                  <div className="flex-shrink-0 w-6 h-6 rounded bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center mt-0.5">
                    <span className="text-sm">
                      {transcription
                        ? (AVAILABLE_LANGUAGES.find(l => l.code === transcription.language)?.flag || '🌐')
                        : '🎵'}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-xs font-semibold">
                        {transcription
                          ? (AVAILABLE_LANGUAGES.find(l => l.code === transcription.language)?.name || transcription.language)
                          : 'Audio original'}
                      </span>
                      {selectedLanguage === 'original' && (
                        <Check className="w-3 h-3 text-blue-600" />
                      )}
                    </div>
                    <p className="text-[10px] text-gray-600 dark:text-gray-400 line-clamp-2">
                      {transcription?.text
                        ? transcription.text.substring(0, 80) + '...'
                        : 'Cliquer pour écouter l\'audio original'}
                    </p>
                  </div>
                </DropdownMenuItem>
              </>
            )}

            {/* Traductions disponibles */}
            {translatedAudios.length > 0 && (
              <>
                <div className="px-2 py-1.5 bg-gray-100 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
                  <p className="text-[10px] font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                    Traductions ({translatedAudios.length})
                  </p>
                </div>
                {translatedAudios.map((audio, index) => {
                  const langInfo = AVAILABLE_LANGUAGES.find(l => l.code === audio.targetLanguage);
                  const isActive = selectedLanguage === audio.targetLanguage;
                  return (
                    <DropdownMenuItem
                      key={`${audio.targetLanguage}-${index}`}
                      onClick={() => setSelectedLanguage(audio.targetLanguage)}
                      className={`flex items-start gap-2 px-3 py-2 cursor-pointer ${
                        isActive ? 'bg-blue-50 dark:bg-blue-900/30' : ''
                      }`}
                    >
                      <div className="relative flex-shrink-0 w-6 h-6 rounded bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center mt-0.5">
                        <span className="text-sm">{langInfo?.flag || '🌐'}</span>
                        {audio.cloned && (
                          <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-purple-600 rounded-full flex items-center justify-center" title="Voix clonée">
                            <Sparkles className="w-2 h-2 text-white" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-xs font-semibold">
                            {langInfo?.name || audio.targetLanguage}
                          </span>
                          {isActive && (
                            <Check className="w-3 h-3 text-blue-600" />
                          )}
                        </div>
                        {(audio as any).translatedText && (
                          <p className="text-[10px] text-gray-600 dark:text-gray-400 line-clamp-2">
                            {(audio as any).translatedText.substring(0, 80)}...
                          </p>
                        )}
                      </div>
                    </DropdownMenuItem>
                  );
                })}
              </>
            )}

            {/* Langues disponibles non traduites */}
            {(() => {
              const translatedLanguageCodes = translatedAudios.map(t => t.targetLanguage);
              const availableForTranslation = AVAILABLE_LANGUAGES.filter(
                lang => !translatedLanguageCodes.includes(lang.code) && lang.code !== transcription?.language
              );

              if (availableForTranslation.length > 0) {
                return (
                  <>
                    <div className="px-2 py-1.5 bg-gray-100 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
                      <p className="text-[10px] font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                        Demander traduction
                      </p>
                    </div>
                    {availableForTranslation.map((lang) => (
                      <DropdownMenuItem
                        key={lang.code}
                        onClick={() => {
                          requestTranslation([lang.code]);
                          setIsLanguageDropdownOpen(false);
                        }}
                        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"
                      >
                        <div className="flex-shrink-0 w-6 h-6 rounded bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                          <span className="text-sm">{lang.flag}</span>
                        </div>
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{lang.name}</span>
                        <Plus className="w-3 h-3 text-gray-400 ml-auto" />
                      </DropdownMenuItem>
                    ))}
                  </>
                );
              }
              return null;
            })()}
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

    </div>
  );
});

AudioControls.displayName = 'AudioControls';
