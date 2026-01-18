'use client';

import React, { memo, useMemo } from 'react';
import { FileText, AlertTriangle, Globe, ChevronDown, ChevronUp } from 'lucide-react';
import { LANGUAGE_NAMES } from '@/utils/audio-effects-config';

interface AudioTranscriptionPanelProps {
  transcription?: { text: string; language: string; confidence?: number };
  isExpanded: boolean;
  onToggleExpanded?: () => void;
  transcriptionError: string | null;
  translationError: string | null;
  selectedLanguage: string;
  translatedAudiosCount: number;
  onRequestTranscription: () => void;
  onRequestTranslation: () => void;
}

/**
 * Panneau pour afficher la transcription et les erreurs de traduction
 * Conforme aux Web Interface Guidelines:
 * - Utilise l'ellipsis correcte (…)
 * - Boutons accessibles avec aria-labels
 * - text-wrap: balance pour éviter les orphelins
 * - États de focus visibles
 */
export const AudioTranscriptionPanel = memo<AudioTranscriptionPanelProps>(({
  transcription,
  isExpanded,
  onToggleExpanded,
  transcriptionError,
  translationError,
  selectedLanguage,
  translatedAudiosCount,
  onRequestTranscription,
  onRequestTranslation,
}) => {
  // Extraire les 10 premiers mots pour l'aperçu
  const transcriptionPreview = useMemo(() => {
    if (!transcription?.text) return null;

    const words = transcription.text.split(/\s+/);
    const shouldTruncate = words.length > 10;

    return {
      preview: shouldTruncate ? words.slice(0, 10).join(' ') : transcription.text,
      shouldTruncate,
      fullText: transcription.text,
    };
  }, [transcription?.text]);

  return (
    <>
      {/* Panneau de transcription (affichage permanent avec aperçu) */}
      {transcription && transcriptionPreview && (
        <div
          className="mt-2 p-2.5 bg-gradient-to-br from-gray-50 to-gray-100/50 dark:from-gray-800 dark:to-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm"
          aria-live="polite"
        >
          <div className="flex items-start gap-2.5">
            <FileText
              className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <div className="flex-1 min-w-0">
              {/* Texte de transcription avec text-wrap balance */}
              <p
                className="text-sm text-gray-700 dark:text-gray-300 break-words leading-relaxed"
                style={{ textWrap: 'balance' } as any}
              >
                {isExpanded ? transcriptionPreview.fullText : transcriptionPreview.preview}
                {!isExpanded && transcriptionPreview.shouldTruncate && (
                  <span className="text-gray-400 dark:text-gray-500">{' '}…</span>
                )}
              </p>

              {/* Barre d'actions: langue, confiance, bouton voir plus */}
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-200/50 dark:bg-gray-700/50 px-2 py-0.5 rounded-full">
                  <Globe className="w-3 h-3" aria-hidden="true" />
                  {LANGUAGE_NAMES[transcription.language] || transcription.language}
                </span>

                {transcription.confidence && (
                  <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                    {Math.round(transcription.confidence * 100)}%{' '}confiance
                  </span>
                )}

                {/* Bouton Voir plus/moins (conforme aux guidelines: <button> avec aria) */}
                {transcriptionPreview.shouldTruncate && onToggleExpanded && (
                  <button
                    type="button"
                    onClick={onToggleExpanded}
                    aria-expanded={isExpanded}
                    aria-label={isExpanded ? "Voir moins de transcription" : "Voir plus de transcription"}
                    className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 rounded px-1.5 py-0.5 transition-colors"
                  >
                    {isExpanded ? (
                      <>
                        Voir moins <ChevronUp className="w-3 h-3" aria-hidden="true" />
                      </>
                    ) : (
                      <>
                        Voir plus <ChevronDown className="w-3 h-3" aria-hidden="true" />
                      </>
                    )}
                  </button>
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
