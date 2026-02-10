'use client';

import React, { useMemo, useRef, useEffect, useState, memo } from 'react';
import { User, Users, UserCircle2, Baby } from 'lucide-react';
import type { TranscriptionSegment, SpeakerAnalysis } from '@meeshy/shared/types/attachment-transcription';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface TranslatedAudio {
  targetLanguage: string;
  translatedText: string;
  segments?: readonly TranscriptionSegment[];
}

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
  /** Audios traduits avec leurs segments */
  translatedAudios?: readonly TranslatedAudio[];
  /** Afficher les scores de similarité vocale */
  showScores?: boolean;
  /** Avatar de l'utilisateur connecté (pour l'afficher si identifié) */
  userAvatar?: string | null;
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
 * Obtient l'icône de genre basée sur voiceCharacteristics
 */
const getGenderIcon = (voiceCharacteristics: any) => {
  if (!voiceCharacteristics?.classification?.estimated_gender) {
    return UserCircle2;
  }

  const gender = voiceCharacteristics.classification.estimated_gender;

  if (gender === 'child') {
    return Baby;
  } else if (gender === 'female') {
    return User; // Icône féminine
  } else if (gender === 'male') {
    return Users; // Icône masculine
  }

  return UserCircle2; // Unknown
};

/**
 * Formate les détails vocaux pour l'affichage dans le tooltip
 */
const formatVoiceDetails = (voiceCharacteristics: any) => {
  if (!voiceCharacteristics) return null;

  const { pitch, classification, spectral, energy, quality } = voiceCharacteristics;

  return {
    pitch: pitch?.mean_hz ? `${Math.round(pitch.mean_hz)} Hz` : 'N/A',
    pitchRange: pitch?.min_hz && pitch?.max_hz
      ? `${Math.round(pitch.min_hz)}-${Math.round(pitch.max_hz)} Hz`
      : 'N/A',
    gender: classification?.estimated_gender || 'inconnu',
    ageRange: classification?.estimated_age_range || 'inconnu',
    voiceType: classification?.voice_type || 'inconnu',
    brightness: spectral?.brightness ? Math.round(spectral.brightness) : null,
    warmth: spectral?.warmth ? Math.round(spectral.warmth) : null,
    quality: quality?.harmonics_to_noise ? quality.harmonics_to_noise.toFixed(2) : null,
  };
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
  translatedAudios,
  showScores = false,
  userAvatar,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const transcriptionRef = useRef<HTMLDivElement>(null);

  // Effet fondu au montage
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  // Déterminer quelle transcription/segments afficher (original ou traduite)
  const activeTranscription = useMemo(() => {
    if (selectedLanguage === 'original' || !translatedAudios) {
      return {
        text: transcription.text,
        segments: transcription.segments,
        language: transcription.language
      };
    }

    const translated = translatedAudios.find(t => t.targetLanguage === selectedLanguage);
    if (translated) {
      // Enrichir les segments traduits avec les informations de speaker de l'original
      const enrichedSegments = (translated.segments || []).map((translatedSegment, index) => {
        // Trouver le segment original correspondant par timestamp ou par index
        const originalSegment = transcription.segments?.find(
          orig => Math.abs(orig.startMs - translatedSegment.startMs) < 100
        ) || transcription.segments?.[index];

        // Copier les informations de speaker de l'original si disponibles
        if (originalSegment) {
          return {
            ...translatedSegment,
            speakerId: translatedSegment.speakerId || originalSegment.speakerId,
            voiceSimilarityScore: translatedSegment.voiceSimilarityScore !== undefined
              ? translatedSegment.voiceSimilarityScore
              : originalSegment.voiceSimilarityScore,
          };
        }
        return translatedSegment;
      });

      return {
        text: translated.translatedText,
        segments: enrichedSegments,
        language: translated.targetLanguage
      };
    }

    // Fallback vers l'original si la traduction n'existe pas
    return {
      text: transcription.text,
      segments: transcription.segments,
      language: transcription.language
    };
  }, [transcription, selectedLanguage, translatedAudios]);

  // Trouver le segment actuel basé sur le temps de lecture
  // (règle rerender-derived-state: dérivé de currentTime)
  const activeSegmentIndex = useMemo(() => {
    if (!activeTranscription.segments || activeTranscription.segments.length === 0) {
      return -1;
    }

    const currentTimeMs = currentTime * 1000;

    for (let i = 0; i < activeTranscription.segments.length; i++) {
      const segment = activeTranscription.segments[i];
      if (currentTimeMs >= segment.startMs && currentTimeMs <= segment.endMs) {
        return i;
      }
    }
    return -1;
  }, [activeTranscription.segments, currentTime]);

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
  // Ne retient que les speakers effectivement présents dans les segments affichés
  const speakerMetadata = useMemo(() => {
    if (!transcription.speakerAnalysis) return null;

    const segments = activeTranscription.segments;
    if (!segments || segments.length === 0) return null;

    const speakerIdsInSegments = new Set(
      segments.map(s => s.speakerId).filter(Boolean)
    );

    const presentSpeakers = transcription.speakerAnalysis.speakers.filter(
      s => speakerIdsInSegments.has(s.sid)
    );

    return {
      totalSpeakers: presentSpeakers.length,
      method: transcription.speakerAnalysis.method,
      speakers: presentSpeakers,
    };
  }, [transcription.speakerAnalysis, activeTranscription.segments]);

  // Rendre le texte avec surlignage coloré du segment actif
  // (règle rerender-memo: mémorisé pour éviter re-calcul à chaque render)
  const renderSegments = useMemo(() => {
    if (!activeTranscription.text) {
      return (
        <span className="text-slate-500 dark:text-slate-400 italic">
          Transcription en cours...
        </span>
      );
    }

    if (!activeTranscription.segments || activeTranscription.segments.length === 0) {
      return (
        <span className="text-slate-700 dark:text-slate-300">
          {activeTranscription.text}
        </span>
      );
    }

    return activeTranscription.segments.map((segment, index) => {
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
          className={`inline transition-[color,font-weight] duration-200 ${
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
    activeTranscription.text,
    activeTranscription.segments,
    transcription.senderSpeakerId,
    activeSegmentIndex,
    isPlaying,
  ]);

  return (
    <div
      className={`transition-[opacity,transform] duration-300 ease-out ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
      }`}
      role="region"
      aria-label="Transcription audio avec speakers"
      aria-live="polite"
    >
      {/* Contenu de la transcription avec coloration par speaker */}
      <div
        id="transcription-content"
        ref={transcriptionRef}
        className={`text-sm leading-relaxed transition-[max-height] duration-300 ${
          isExpanded ? 'max-h-96 overflow-y-auto' : 'max-h-32 overflow-y-auto'
        }`}
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(148, 163, 184, 0.5) transparent',
        }}
        aria-expanded={isExpanded}
      >
        {renderSegments}
      </div>

      {/* Scrollbar visible sur WebKit */}
      <style jsx>{`
        #transcription-content::-webkit-scrollbar {
          width: 6px;
        }
        #transcription-content::-webkit-scrollbar-track {
          background: transparent;
        }
        #transcription-content::-webkit-scrollbar-thumb {
          background-color: rgba(148, 163, 184, 0.5);
          border-radius: 3px;
        }
        #transcription-content::-webkit-scrollbar-thumb:hover {
          background-color: rgba(148, 163, 184, 0.7);
        }
      `}</style>

      {/* Badges des speakers avec détails vocaux au survol - Afficher uniquement si plusieurs locuteurs */}
      {speakerMetadata && speakerMetadata.totalSpeakers > 1 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <TooltipProvider>
            {speakerMetadata.speakers.map((speaker) => {
              const colors = getSpeakerColor(
                speaker.sid,
                transcription.senderSpeakerId,
                speaker.voiceSimilarityScore
              );
              const { label, isUser } = getSpeakerLabel(
                speaker.sid,
                speaker.voiceSimilarityScore,
                transcription.senderSpeakerId
              );
              const GenderIcon = getGenderIcon(speaker.voiceCharacteristics);
              const voiceDetails = formatVoiceDetails(speaker.voiceCharacteristics);
              const hasVoiceProfile = !!speaker.voiceCharacteristics;

              return (
                <Tooltip key={speaker.sid} delayDuration={200}>
                  <TooltipTrigger asChild>
                    <span
                      className={`inline-flex items-center justify-center w-8 h-8 rounded-full ${colors.bg} ${colors.border} border-2 ${colors.text} cursor-pointer transition-[transform,box-shadow] hover:shadow-md hover:scale-110`}
                    >
                      {/* Avatar de l'utilisateur ou icône de genre avec couleur */}
                      {isUser && userAvatar ? (
                        <div className="relative w-full h-full rounded-full overflow-hidden">
                          <img
                            src={userAvatar}
                            alt="Vous"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ) : (
                        <GenderIcon className="w-4 h-4" />
                      )}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    {hasVoiceProfile && voiceDetails ? (
                      <div className="space-y-2 text-xs">
                        <div className="font-semibold border-b pb-1">
                          Profil vocal{isUser ? ' - Vous' : ''}
                        </div>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                          <div className="text-gray-500">Pitch moyen:</div>
                          <div className="font-mono">{voiceDetails.pitch}</div>

                          <div className="text-gray-500">Plage:</div>
                          <div className="font-mono text-[10px]">{voiceDetails.pitchRange}</div>

                          <div className="text-gray-500">Genre:</div>
                          <div className="capitalize">{voiceDetails.gender}</div>

                          <div className="text-gray-500">Âge:</div>
                          <div className="capitalize">{voiceDetails.ageRange}</div>

                          <div className="text-gray-500">Type vocal:</div>
                          <div className="capitalize text-[10px]">{voiceDetails.voiceType}</div>

                          {voiceDetails.quality && (
                            <>
                              <div className="text-gray-500">Qualité (HNR):</div>
                              <div className="font-mono">{voiceDetails.quality}</div>
                            </>
                          )}
                        </div>
                        <div className="text-[10px] text-gray-400 pt-1 border-t">
                          Temps de parole: {Math.round(speaker.speakingTimeMs / 1000)}s
                          {speaker.isPrimary && ' • Locuteur principal'}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2 text-xs">
                        <div className="font-semibold">Locuteur inconnu</div>
                        <div className="text-gray-400 italic">
                          Créez une identité vocale pour vous identifier et voir les détails
                        </div>
                        <div className="text-[10px] text-gray-400 pt-1 border-t">
                          Temps de parole: {Math.round(speaker.speakingTimeMs / 1000)}s
                          {speaker.isPrimary && ' • Locuteur principal'}
                        </div>
                      </div>
                    )}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </TooltipProvider>
        </div>
      )}
    </div>
  );
});

TranscriptionViewer.displayName = 'TranscriptionViewer';
