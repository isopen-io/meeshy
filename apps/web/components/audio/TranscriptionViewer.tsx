'use client';

import React, { useMemo, useRef, useEffect, useState, memo } from 'react';
import { User, Users } from 'lucide-react';
import type { TranscriptionSegment, SpeakerAnalysis } from '@meeshy/shared/types/attachment-transcription';

interface TranscriptionViewerProps {
  transcription: {
    text: string;
    language: string;
    confidence?: number;
    segments?: readonly TranscriptionSegment[];
    speakerCount?: number;
    primarySpeakerId?: string;
    senderVoiceIdentified?: boolean;
    senderSpeakerId?: string | null;
    speakerAnalysis?: SpeakerAnalysis;
  };
  isExpanded: boolean;
  onToggleExpanded: () => void;
  currentTime: number;
  isPlaying: boolean;
  selectedLanguage: string;
  /** Afficher les scores de similarité vocale */
  showScores?: boolean;
}

/**
 * Palette de couleurs pour les différents speakers
 * Règle: Utilisateur = bleu, autres speakers = couleurs différenciées
 */
const SPEAKER_COLORS = {
  user: {
    text: 'text-blue-700 dark:text-blue-300',
    bg: 'bg-blue-100 dark:bg-blue-900/40',
    border: 'border-blue-300 dark:border-blue-700',
  },
  speakers: [
    {
      text: 'text-purple-700 dark:text-purple-300',
      bg: 'bg-purple-100 dark:bg-purple-900/40',
      border: 'border-purple-300 dark:border-purple-700',
    },
    {
      text: 'text-green-700 dark:text-green-300',
      bg: 'bg-green-100 dark:bg-green-900/40',
      border: 'border-green-300 dark:border-green-700',
    },
    {
      text: 'text-orange-700 dark:text-orange-300',
      bg: 'bg-orange-100 dark:bg-orange-900/40',
      border: 'border-orange-300 dark:border-orange-700',
    },
    {
      text: 'text-pink-700 dark:text-pink-300',
      bg: 'bg-pink-100 dark:bg-pink-900/40',
      border: 'border-pink-300 dark:border-pink-700',
    },
    {
      text: 'text-teal-700 dark:text-teal-300',
      bg: 'bg-teal-100 dark:bg-teal-900/40',
      border: 'border-teal-300 dark:border-teal-700',
    },
  ],
};

/**
 * Obtient les classes de couleur pour un speaker donné
 * (règle rerender-memo: mémoisation via useMemo dans le parent)
 */
const getSpeakerColor = (
  speakerId: string | undefined,
  senderSpeakerId: string | null | undefined,
  voiceScore: number | null | undefined
) => {
  // Pas de speaker ID
  if (!speakerId) {
    return SPEAKER_COLORS.speakers[0];
  }

  // Utilisateur identifié avec score suffisant
  if (senderSpeakerId === speakerId && voiceScore !== null && voiceScore !== undefined && voiceScore >= 0.6) {
    return SPEAKER_COLORS.user;
  }

  // Autre speaker - couleur basée sur le numéro
  const speakerNum = parseInt(speakerId.replace(/\D/g, ''), 10) || 0;
  return SPEAKER_COLORS.speakers[speakerNum % SPEAKER_COLORS.speakers.length];
};

/**
 * Détermine le label à afficher pour un speaker
 * (règle rerender-memo: mémoisation via useMemo)
 */
const getSpeakerLabel = (
  speakerId: string | undefined,
  voiceScore: number | null | undefined,
  senderSpeakerId: string | null | undefined
): { label: string; isUser: boolean; confidence: string } => {
  // Pas de speaker ID
  if (!speakerId) {
    return { label: '?', isUser: false, confidence: '' };
  }

  // Pas de profil vocal (score null)
  if (voiceScore === null || voiceScore === undefined) {
    return { label: speakerId, isUser: false, confidence: '(pas de profil vocal)' };
  }

  // Utilisateur identifié avec score élevé
  if (senderSpeakerId === speakerId && voiceScore >= 0.6) {
    return {
      label: 'Vous',
      isUser: true,
      confidence: voiceScore >= 0.8 ? 'Haute confiance' : 'Confiance moyenne',
    };
  }

  // Score faible
  if (voiceScore < 0.3) {
    return { label: speakerId, isUser: false, confidence: 'Très faible' };
  }

  // Score incertain
  return { label: `${speakerId} (?)`, isUser: false, confidence: 'Incertain' };
};

/**
 * Composant optimisé pour afficher la transcription avec coloration des speakers
 *
 * Fonctionnalités:
 * - Coloration différente par speaker (s0, s1, s2, ...)
 * - Identification visuelle de l'utilisateur (bleu + "Vous")
 * - Surlignage du segment actuel pendant la lecture
 * - Affichage des scores de similarité vocale (optionnel)
 * - Auto-scroll intelligent vers le segment actif
 * - Support des segments avec timestamps
 *
 * Optimisations (Vercel React Best Practices):
 * - React.memo pour éviter les re-renders inutiles
 * - useMemo pour les calculs coûteux (segments actifs, couleurs)
 * - content-visibility pour les segments hors vue (rendering-content-visibility)
 * - Dérivation du segment actif depuis currentTime (rerender-derived-state)
 */
export const TranscriptionViewer = memo<TranscriptionViewerProps>(({
  transcription,
  isExpanded,
  onToggleExpanded,
  currentTime,
  isPlaying,
  selectedLanguage,
  showScores = false,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const transcriptionRef = useRef<HTMLDivElement>(null);

  // Effet fondu au montage
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  // Trouver le segment actuel basé sur le temps de lecture
  // (règle rerender-derived-state: dérivé de currentTime)
  const activeSegmentIndex = useMemo(() => {
    if (!transcription.segments || transcription.segments.length === 0) {
      return -1;
    }

    const currentTimeMs = currentTime * 1000;

    for (let i = 0; i < transcription.segments.length; i++) {
      const segment = transcription.segments[i];
      if (currentTimeMs >= segment.startMs && currentTimeMs <= segment.endMs) {
        return i;
      }
    }
    return -1;
  }, [transcription.segments, currentTime]);

  // Auto-scroll vers le segment actif
  useEffect(() => {
    if (!isPlaying || activeSegmentIndex === -1 || !transcriptionRef.current) {
      return;
    }

    const container = transcriptionRef.current;
    const activeElement = container.querySelector(`[data-segment-index="${activeSegmentIndex}"]`) as HTMLElement;

    if (activeElement) {
      const elementRect = activeElement.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const elementTopRelativeToContainer = elementRect.top - containerRect.top;
      const currentScroll = container.scrollTop;
      const targetScroll = currentScroll + elementTopRelativeToContainer - 10;

      if (Math.abs(targetScroll - currentScroll) > 5) {
        container.scrollTo({
          top: Math.max(0, targetScroll),
          behavior: 'smooth',
        });
      }
    }
  }, [activeSegmentIndex, isPlaying, isExpanded]);

  // Calculer les métadonnées des speakers
  // (règle rerender-memo: mémorisé pour éviter recalcul)
  const speakerMetadata = useMemo(() => {
    if (!transcription.speakerAnalysis) return null;

    return {
      totalSpeakers: transcription.speakerAnalysis.speakers.length,
      method: transcription.speakerAnalysis.method,
      speakers: transcription.speakerAnalysis.speakers,
    };
  }, [transcription.speakerAnalysis]);

  // Rendre le texte avec surlignage coloré du segment actif
  // (règle rerender-memo: mémorisé pour éviter re-calcul à chaque render)
  const renderSegments = useMemo(() => {
    if (!transcription.text) {
      return (
        <span className="text-slate-500 dark:text-slate-400 italic">
          Transcription en cours...
        </span>
      );
    }

    if (!transcription.segments || transcription.segments.length === 0) {
      return (
        <span className="text-slate-700 dark:text-slate-300">
          {transcription.text}
        </span>
      );
    }

    return transcription.segments.map((segment, index) => {
      const isActive = index === activeSegmentIndex && isPlaying;
      const colors = getSpeakerColor(
        segment.speakerId,
        transcription.senderSpeakerId,
        segment.voiceSimilarityScore
      );

      return (
        <span
          key={`${segment.startMs}-${segment.endMs}-${index}`}
          data-segment-index={index}
          className={`inline transition-all duration-200 ${
            isActive
              ? `font-bold ${colors.text}`
              : 'text-slate-700 dark:text-slate-300'
          }`}
          style={{
            // Utilise content-visibility pour optimiser le rendu des segments hors vue
            // (règle rendering-content-visibility)
            contentVisibility: 'auto',
          }}
        >
          {segment.text}{' '}
        </span>
      );
    });
  }, [
    transcription.text,
    transcription.segments,
    transcription.senderSpeakerId,
    activeSegmentIndex,
    isPlaying,
  ]);

  // Calculer si on a besoin d'un bouton "Voir plus"
  const needsExpansion = useMemo(() => {
    return (transcription.segments?.length ?? 0) > 10;
  }, [transcription.segments]);

  return (
    <div
      className={`relative transition-all duration-300 ease-out ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
      }`}
      role="region"
      aria-label="Transcription audio avec speakers"
      aria-live="polite"
    >
      {/* En-tête avec info sur les speakers */}
      {speakerMetadata && speakerMetadata.totalSpeakers > 0 && (
        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-200 dark:border-gray-700">
          <Users className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          <span className="text-xs text-gray-600 dark:text-gray-400">
            {speakerMetadata.totalSpeakers} locuteur{speakerMetadata.totalSpeakers > 1 ? 's' : ''} détecté{speakerMetadata.totalSpeakers > 1 ? 's' : ''}
          </span>
          {!transcription.senderSpeakerId && (
            <span className="text-xs text-amber-600 dark:text-amber-400 ml-auto">
              Créez un profil vocal pour vous identifier
            </span>
          )}
        </div>
      )}

      {/* Contenu de la transcription avec coloration par speaker */}
      <div
        id="transcription-content"
        ref={transcriptionRef}
        className={`text-sm leading-relaxed transition-all duration-300 ${
          isExpanded ? 'max-h-96 overflow-y-auto' : 'max-h-32 overflow-y-scroll'
        }`}
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
        aria-expanded={isExpanded}
      >
        {renderSegments}
      </div>

      {/* Cacher la scrollbar sur WebKit */}
      <style jsx>{`
        #transcription-content::-webkit-scrollbar {
          display: none;
        }
      `}</style>

      {/* Gradient fade-out + bouton "voir plus" */}
      {!isExpanded && needsExpansion && (
        <div className="absolute bottom-0 left-0 right-0 pointer-events-none">
          <div className="h-8 bg-gradient-to-t from-white via-white/70 to-transparent dark:from-slate-900 dark:via-slate-900/70 dark:to-transparent" />
          <div className="bg-white dark:bg-slate-900 pt-1 pb-1">
            <button
              onClick={onToggleExpanded}
              type="button"
              className="pointer-events-auto text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 rounded transition-colors"
              aria-expanded={false}
              aria-label="Développer la transcription complète"
              aria-controls="transcription-content"
            >
              voir plus
            </button>
          </div>
        </div>
      )}

      {/* Bouton "Voir moins" */}
      {isExpanded && needsExpansion && (
        <button
          onClick={onToggleExpanded}
          type="button"
          className="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 rounded transition-colors"
          aria-expanded={true}
          aria-label="Réduire la transcription"
          aria-controls="transcription-content"
        >
          voir moins
        </button>
      )}

      {/* Légende compacte des speakers */}
      {speakerMetadata && speakerMetadata.totalSpeakers > 1 && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <span>Locuteurs:</span>
          {speakerMetadata.speakers.map((speaker) => {
            const colors = getSpeakerColor(
              speaker.sid,
              transcription.senderSpeakerId,
              speaker.voice_similarity_score
            );
            const { label, isUser } = getSpeakerLabel(
              speaker.sid,
              speaker.voice_similarity_score,
              transcription.senderSpeakerId
            );

            return (
              <span
                key={speaker.sid}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md ${colors.bg} ${colors.text} text-xs font-medium`}
              >
                {isUser ? <User className="w-3 h-3" /> : <Users className="w-3 h-3" />}
                {label}
                {showScores && speaker.voice_similarity_score !== null && (
                  <span className="tabular-nums opacity-70">
                    {Math.round(speaker.voice_similarity_score * 100)}%
                  </span>
                )}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
});

TranscriptionViewer.displayName = 'TranscriptionViewer';
