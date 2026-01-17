'use client';

import React, { memo } from 'react';
import { FileText, AlertTriangle, Globe } from 'lucide-react';
import { LANGUAGE_NAMES } from '@/utils/audio-effects-config';

interface AudioTranscriptionPanelProps {
  transcription?: { text: string; language: string; confidence?: number };
  isExpanded: boolean;
  transcriptionError: string | null;
  translationError: string | null;
  selectedLanguage: string;
  translatedAudiosCount: number;
  onRequestTranscription: () => void;
  onRequestTranslation: () => void;
}

/**
 * Panneau pour afficher la transcription et les erreurs de traduction
 */
export const AudioTranscriptionPanel = memo<AudioTranscriptionPanelProps>(({
  transcription,
  isExpanded,
  transcriptionError,
  translationError,
  selectedLanguage,
  translatedAudiosCount,
  onRequestTranscription,
  onRequestTranslation,
}) => {
  return (
    <>
      {/* Panneau de transcription (collapsible) */}
      {transcription && isExpanded && (
        <div
          className="mt-2 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
          aria-live="polite"
        >
          <div className="flex items-start gap-2">
            <FileText className="w-4 h-4 text-gray-500 dark:text-gray-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-700 dark:text-gray-300 break-words">
                {transcription.text}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {LANGUAGE_NAMES[transcription.language] || transcription.language}
                </span>
                {transcription.confidence && (
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    ({Math.round(transcription.confidence * 100)}% confiance)
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Erreur de transcription */}
      {transcriptionError && !transcription && (
        <div className="mt-1 flex items-center gap-1 text-xs text-red-500">
          <AlertTriangle className="w-3 h-3" />
          <span>Transcription: {transcriptionError}</span>
          <button
            onClick={onRequestTranscription}
            className="ml-1 text-blue-500 hover:underline"
          >
            Réessayer
          </button>
        </div>
      )}

      {/* Erreur de traduction */}
      {translationError && translatedAudiosCount === 0 && (
        <div className="mt-1 flex items-center gap-1 text-xs text-red-500">
          <AlertTriangle className="w-3 h-3" />
          <span>Traduction: {translationError}</span>
          <button
            onClick={onRequestTranslation}
            className="ml-1 text-blue-500 hover:underline"
          >
            Réessayer
          </button>
        </div>
      )}

      {/* Indicateur de langue sélectionnée */}
      {selectedLanguage !== 'original' && (
        <div className="mt-1 flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
          <Globe className="w-3 h-3" />
          <span>Audio traduit: {LANGUAGE_NAMES[selectedLanguage] || selectedLanguage}</span>
        </div>
      )}
    </>
  );
});

AudioTranscriptionPanel.displayName = 'AudioTranscriptionPanel';
