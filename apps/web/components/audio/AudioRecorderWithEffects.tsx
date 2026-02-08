'use client';

import React, { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import { Square, X, Mic, Loader2, Radio, Sliders } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@/hooks/useI18n';
import { useAudioEffects } from '@/hooks/use-audio-effects';
import { useAudioEffectsTimeline, type InitialEffectState } from '@/hooks/use-audio-effects-timeline';
import { AudioEffectsCarousel } from '@/components/video-calls/AudioEffectsCarousel';
import type { AudioEffectType } from '@meeshy/shared/types/video-call';
import type { AudioEffectsTimeline } from '@meeshy/shared/types/audio-effects-timeline';

// Types
interface AudioMetadata {
  duration: number;
  codec: string;
  mimeType: string;
  bitrate?: number;
  sampleRate?: number;
  channels?: number;
  audioEffectsTimeline?: AudioEffectsTimeline;
}

interface AudioRecorderWithEffectsProps {
  onRecordingComplete: (audioBlob: Blob, duration: number, metadata?: AudioMetadata) => void;
  onRemove: () => void;
  maxDuration?: number;
  onRecordingStateChange?: (isRecording: boolean) => void;
  onStop?: () => void;
}

export interface AudioRecorderWithEffectsRef {
  stopRecording: () => void;
  isRecording: () => boolean;
}

const MAX_ALLOWED_DURATION = 600; // 10 minutes

// Codecs audio
const UNIVERSAL_CODEC_PRIORITIES = [
  'audio/mp4',
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
] as const;

const getBestAudioCodec = (): string => {
  for (const codec of UNIVERSAL_CODEC_PRIORITIES) {
    if (MediaRecorder.isTypeSupported(codec)) {
      return codec;
    }
  }
  throw new Error('No supported audio codec found');
};

export const AudioRecorderWithEffects = forwardRef<AudioRecorderWithEffectsRef, AudioRecorderWithEffectsProps>(({
  onRecordingComplete,
  onRemove,
  maxDuration = 600,
  onRecordingStateChange,
  onStop
}, ref) => {
  const { t } = useI18n('audioEffects');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [audioFormat, setAudioFormat] = useState<string>('WEBM');
  const [showEffectsPanel, setShowEffectsPanel] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [panelPosition, setPanelPosition] = useState({ top: 0, left: 0 });
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const buttonEffectsRef = useRef<HTMLButtonElement>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const animationFrameRef = useRef<number | null>(null);
  const selectedCodecRef = useRef<string>('');
  const requestDataIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const rawStreamRef = useRef<MediaStream | null>(null); // Stream du micro brut
  const [rawStream, setRawStream] = useState<MediaStream | null>(null); // State pour trigger useAudioEffects
  const processedAudioStreamRef = useRef<MediaStream | null>(null); // Ref pour accéder à la dernière valeur
  const previousEffectsStateRef = useRef<typeof effectsState | null>(null); // Pour détecter les changements d'effets
  const recordedDurationRef = useRef<number>(0); // Stocker la durée enregistrée pour éviter problème de closure

  // Refs pour stocker les fonctions du hook timeline (éviter problème de closure)
  const startTrackingRef = useRef<any>(null);
  const stopTrackingRef = useRef<any>(null);
  const recordActivationRef = useRef<any>(null);
  const recordDeactivationRef = useRef<any>(null);
  const recordUpdateRef = useRef<any>(null);

  const effectiveDuration = Math.min(maxDuration, MAX_ALLOWED_DURATION);

  // Initialiser useAudioEffects avec le stream brut (state, pas ref)
  const {
    outputStream: processedAudioStream,
    effectsState,
    toggleEffect,
    updateEffectParams,
    loadPreset,
    currentPreset,
    availableBackSounds,
    availablePresets,
  } = useAudioEffects({
    inputStream: rawStream,
  });

  // Initialiser le tracking de la timeline des effets
  const {
    startTracking,
    stopTracking,
    recordActivation,
    recordDeactivation,
    recordUpdate,
  } = useAudioEffectsTimeline();

  // Mettre à jour les refs à chaque render pour éviter les problèmes de closure
  useEffect(() => {
    startTrackingRef.current = startTracking;
    stopTrackingRef.current = stopTracking;
    recordActivationRef.current = recordActivation;
    recordDeactivationRef.current = recordDeactivation;
    recordUpdateRef.current = recordUpdate;
  }, [startTracking, stopTracking, recordActivation, recordDeactivation, recordUpdate]);

  // Vérifier si des effets sont actifs
  const audioEffectsActive = Object.values(effectsState).some(effect => effect.enabled);

  // Formater le temps
  const formatTime = (milliseconds: number): string => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const ms = Math.floor((milliseconds % 1000) / 10);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  // Timer précis
  const updateTimer = useCallback(() => {
    if (!startTimeRef.current || !mediaRecorderRef.current || mediaRecorderRef.current.state !== 'recording') {
      return;
    }

    const elapsed = performance.now() - startTimeRef.current;
    setRecordingTime(elapsed);

    if (elapsed >= effectiveDuration * 1000) {
      stopRecording();
      return;
    }

    animationFrameRef.current = requestAnimationFrame(updateTimer);
  }, [effectiveDuration]);


  // Arrêter l'enregistrement
  const stopRecording = useCallback(() => {
    if (onStop) {
      onStop();
    }

    // IMPORTANT: Capturer la durée AVANT de réinitialiser startTimeRef
    // Car mediaRecorder.onstop s'exécute de manière asynchrone
    if (startTimeRef.current) {
      recordedDurationRef.current = performance.now() - startTimeRef.current;
    }

    if (requestDataIntervalRef.current) {
      clearInterval(requestDataIntervalRef.current);
      requestDataIntervalRef.current = null;
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    startTimeRef.current = 0;

    // Arrêter le stream brut
    if (rawStreamRef.current) {
      rawStreamRef.current.getTracks().forEach(track => track.stop());
      rawStreamRef.current = null;
    }
    setRawStream(null); // Reset le state

    // Arrêter le media recorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }

    // Reset de previousEffectsStateRef pour le prochain enregistrement
    previousEffectsStateRef.current = null;

    setIsRecording(false);

    if (onRecordingStateChange) {
      onRecordingStateChange(false);
    }
  }, [onRecordingStateChange, onStop]);

  // Démarrer l'enregistrement
  const startRecording = useCallback(async () => {
    setPermissionError(null);
    setIsInitializing(true);
    recordedDurationRef.current = 0; // Reset la durée

    try {
      if (!window.isSecureContext) {
        toast.error(t('recorder.errors.httpsRequired'));
        setPermissionError('HTTPS required');
        setIsInitializing(false);
        return;
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        toast.error(t('recorder.errors.browserNotSupported'));
        setPermissionError('Browser not supported');
        setIsInitializing(false);
        return;
      }

      const mimeType = getBestAudioCodec();
      selectedCodecRef.current = mimeType;

      // Obtenir le stream brut du microphone
      const newRawStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false, // Désactiver pour laisser useAudioEffects gérer
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 48000,
          channelCount: 2, // Stéréo pour une meilleure qualité audio
        }
      });

      rawStreamRef.current = newRawStream;
      setRawStream(newRawStream); // Trigger useAudioEffects

      // Attendre TOUJOURS que useAudioEffects initialise le stream de sortie
      // Cela permet d'activer les effets PENDANT l'enregistrement
      console.log('🎭 [AudioRecorder] Waiting for processedAudioStream to be ready...');

      const maxWaitTime = 3000; // 3 secondes maximum
      const checkInterval = 100; // Vérifier toutes les 100ms
      const startWait = Date.now();

      let streamToRecord = newRawStream;

      while (Date.now() - startWait < maxWaitTime) {
        // Vérifier la ref pour avoir la valeur la plus récente
        const currentProcessedStream = processedAudioStreamRef.current;

        // Vérifier si processedAudioStream existe et a des audio tracks
        if (currentProcessedStream && currentProcessedStream.getAudioTracks().length > 0) {
          console.log('✅ [AudioRecorder] processedAudioStream is ready!', {
            tracks: currentProcessedStream.getAudioTracks().length,
            waitTime: Date.now() - startWait
          });
          streamToRecord = currentProcessedStream;
          break;
        }

        // Attendre avant de vérifier à nouveau
        await new Promise(resolve => setTimeout(resolve, checkInterval));
      }

      // Si après le timeout le stream n'est pas prêt, avertir et utiliser le stream brut
      if (streamToRecord === newRawStream) {
        const currentProcessedStream = processedAudioStreamRef.current;
        console.warn('⚠️ [AudioRecorder] processedAudioStream not ready after 3s, using raw stream', {
          processedAudioStreamExists: !!currentProcessedStream,
          audioTracksCount: currentProcessedStream?.getAudioTracks().length || 0
        });
        toast.warning(t('recorder.errors.effectsNotAvailable'));

        // iOS Safari: si le raw stream est mono, upmixer en stéréo
        const rawChannels = newRawStream.getAudioTracks()[0]?.getSettings?.()?.channelCount || 1;
        if (rawChannels < 2) {
          try {
            const ctx = new AudioContext({ sampleRate: 48000 });
            const src = ctx.createMediaStreamSource(newRawStream);
            const splitter = ctx.createChannelSplitter(1);
            const merger = ctx.createChannelMerger(2);
            const dest = ctx.createMediaStreamDestination();
            dest.channelCount = 2;
            dest.channelCountMode = 'explicit';
            src.connect(splitter);
            splitter.connect(merger, 0, 0);
            splitter.connect(merger, 0, 1);
            merger.connect(dest);
            streamToRecord = dest.stream;
            console.log('🔊 [AudioRecorder] Mono raw stream upmixed to stereo for iOS');
          } catch (e) {
            console.warn('⚠️ [AudioRecorder] Failed to upmix mono stream, recording in mono', e);
          }
        }
      }

      const mediaRecorder = new MediaRecorder(streamToRecord, {
        mimeType,
        audioBitsPerSecond: 128000,
        bitsPerSecond: 128000
      });

      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });

        // Arrêter le tracking et récupérer la timeline des effets
        // Utiliser la ref pour éviter le problème de closure
        const audioEffectsTimeline = stopTrackingRef.current?.();

        console.log('🎬 [AudioRecorder] Recording stopped - Timeline data:', {
          hasTimeline: !!audioEffectsTimeline,
          timelineEvents: audioEffectsTimeline?.events?.length || 0,
          timelineData: audioEffectsTimeline,
          recordingDuration: recordingTime / 1000
        });

        // Arrêter tous les tracks du stream brut
        newRawStream.getTracks().forEach(track => track.stop());
        setRawStream(null); // Reset le state

        const format = mimeType.includes('webm') ? 'WEBM' :
                      mimeType.includes('mp4') ? 'MP4' :
                      mimeType.includes('ogg') ? 'OGG' : 'AUDIO';
        setAudioFormat(format);

        // APPROCHE HYBRIDE: Utiliser le timer ET extraire la durée du blob pour vérification
        // IMPORTANT: Tout est calculé en MILLISECONDES pour préserver la précision
        const timerDurationMs = recordedDurationRef.current;

        // Blob extraction: Plus précis mais peut échouer sur certains navigateurs
        let blobDurationMs = 0;
        let durationSource = 'timer';

        try {
          // Créer un audio temporaire pour extraire la durée
          const tempAudioUrl = URL.createObjectURL(blob);
          const tempAudio = new Audio(tempAudioUrl);

          // Attendre le chargement des métadonnées avec timeout de 2 secondes
          await Promise.race([
            new Promise<void>((resolve) => {
              tempAudio.addEventListener('loadedmetadata', () => {
                // Convertir secondes du blob en millisecondes (arrondi pour éviter 0.999999...)
                blobDurationMs = Math.round(tempAudio.duration * 1000);
                resolve();
              }, { once: true });
              tempAudio.load();
            }),
            new Promise<void>((_, reject) =>
              setTimeout(() => reject(new Error('Timeout')), 2000)
            )
          ]);

          // Nettoyer l'URL temporaire
          URL.revokeObjectURL(tempAudioUrl);

          // Comparer les deux sources: utiliser blob si valide et proche du timer (< 1000ms de différence)
          if (blobDurationMs > 0 && isFinite(blobDurationMs)) {
            const differenceMs = Math.abs(blobDurationMs - timerDurationMs);
            if (differenceMs < 1000) {
              durationSource = 'blob (verified)';
            } else {
              durationSource = 'timer (blob mismatch)';
              console.warn('⚠️ [AudioRecorder] Blob duration differs from timer:', {
                timerMs: timerDurationMs,
                blobMs: blobDurationMs,
                differenceMs
              });
            }
          }
        } catch (error) {
          console.warn('⚠️ [AudioRecorder] Failed to extract duration from blob, using timer:', error);
          durationSource = 'timer (blob extraction failed)';
        }

        // Utiliser la meilleure source disponible (EN MILLISECONDES)
        const finalDurationMs = (blobDurationMs > 0 && isFinite(blobDurationMs) && Math.abs(blobDurationMs - timerDurationMs) < 1000)
          ? blobDurationMs
          : timerDurationMs;

        // Calculer bitrate (nécessite conversion en secondes)
        const finalDurationSec = finalDurationMs / 1000;
        const estimatedBitrate = finalDurationSec > 0
          ? Math.round((blob.size * 8) / finalDurationSec) // bits per second
          : 0;

        console.log('⏱️ [AudioRecorderWithEffects] Duration calculation:', {
          recordingTimeState: recordingTime,
          timerDurationMs,
          blobDurationMs,
          finalDurationMs,
          finalDurationSec,
          durationSource,
          blobSize: blob.size,
          estimatedBitrate,
          bitrateKbps: Math.round(estimatedBitrate / 1000)
        });

        const metadata: AudioMetadata = {
          duration: finalDurationMs, // ✅ STOCKÉ EN MILLISECONDES
          codec: format,
          mimeType: mimeType,
          bitrate: estimatedBitrate,
          sampleRate: 48000, // Sample rate utilisé dans getUserMedia
          channels: 2, // Stéréo (défini dans getUserMedia)
          ...(audioEffectsTimeline && { audioEffectsTimeline }),
        };

        console.log('📦 [AudioRecorder] Metadata prepared for upload:', {
          metadata,
          hasAudioEffectsTimeline: !!metadata.audioEffectsTimeline,
          audioEffectsTimelineEvents: metadata.audioEffectsTimeline?.events?.length || 0,
          bitrate: estimatedBitrate,
          bitrateKbps: Math.round(estimatedBitrate / 1000),
          sampleRate: 48000,
          channels: 2
        });

        onRecordingComplete(blob, metadata.duration, metadata);
      };

      mediaRecorder.start();

      // IMPORTANT: Capturer l'état initial des effets AVANT de démarrer le tracking
      // Cela permet d'enregistrer les effets déjà actifs au moment du clic sur le micro
      const initialEffects: InitialEffectState[] = Object.entries(effectsState).map(([effectType, state]) => ({
        effectType: effectType as AudioEffectType,
        enabled: state.enabled,
        params: state.enabled ? state.params : undefined,
      }));

      console.log('🎬 [AudioRecorder] Starting tracking with initial effects:', {
        initialEffects: initialEffects.filter(e => e.enabled),
        totalEffects: initialEffects.filter(e => e.enabled).length
      });

      // IMPORTANT: Initialiser previousEffectsStateRef AVANT de démarrer le tracking
      // Cela permet de détecter les changements dès la première activation
      previousEffectsStateRef.current = effectsState;

      // Démarrer le tracking de la timeline des effets audio avec l'état initial
      // Utiliser la ref pour éviter le problème de closure
      startTrackingRef.current?.({
        sampleRate: 48000, // Même sample rate que le stream
        channels: 2,
        initialEffects, // Passer les effets déjà actifs
      });

      // requestData() manuel
      requestDataIntervalRef.current = setInterval(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.requestData();
        }
      }, 1000);

      setIsRecording(true);
      setIsInitializing(false);
      setRecordingTime(0);

      if (onRecordingStateChange) {
        onRecordingStateChange(true);
      }

      startTimeRef.current = performance.now();
      animationFrameRef.current = requestAnimationFrame(updateTimer);

    } catch (error: any) {
      setIsInitializing(false);

      if (error instanceof DOMException) {
        if (error.name === 'NotAllowedError') {
          setPermissionError('Microphone access denied');
          toast.error(t('recorder.errors.microphoneAccessDenied'));
        } else if (error.name === 'NotFoundError') {
          setPermissionError('No microphone found');
          toast.error(t('recorder.errors.noMicrophoneFound'));
        } else {
          setPermissionError('Microphone error');
          toast.error(t('recorder.errors.microphoneError'));
        }
      } else {
        toast.error(t('recorder.errors.cannotAccessMicrophone'));
        setPermissionError('Recording error');
      }
    }
  }, [effectiveDuration, onRecordingComplete, updateTimer, onRecordingStateChange]);

  // Exposer les méthodes via ref
  useImperativeHandle(ref, () => ({
    stopRecording,
    isRecording: () => isRecording
  }), [stopRecording, isRecording]);

  // Détecter le montage du composant pour le portail
  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

  // Mettre à jour la ref processedAudioStream pour y accéder dans les closures
  useEffect(() => {
    processedAudioStreamRef.current = processedAudioStream;
  }, [processedAudioStream]);

  // Calculer et mettre à jour la position du panneau
  const updatePanelPosition = useCallback(() => {
    if (!buttonEffectsRef.current) return;

    const rect = buttonEffectsRef.current.getBoundingClientRect();
    setPanelPosition({
      top: rect.top - 10,
      left: rect.left,
    });
  }, []);

  // Mettre à jour la position lors de l'ouverture du panneau et lors du scroll/resize
  useEffect(() => {
    if (!showEffectsPanel) return;

    // Mettre à jour la position immédiatement
    updatePanelPosition();

    // Puis lors du scroll/resize
    window.addEventListener('scroll', updatePanelPosition, true);
    window.addEventListener('resize', updatePanelPosition);

    return () => {
      window.removeEventListener('scroll', updatePanelPosition, true);
      window.removeEventListener('resize', updatePanelPosition);
    };
  }, [showEffectsPanel, updatePanelPosition]);

  // Tracker les changements d'effets audio pour la timeline
  useEffect(() => {
    // Ne pas tracker si on n'est pas en train d'enregistrer
    if (!isRecording) return;

    // Vérifier qu'on a un état précédent (normalement initialisé dans startRecording)
    if (!previousEffectsStateRef.current) {
      console.warn('⚠️ [AudioRecorder] No previous state, skipping tracking');
      return;
    }

    const previousState = previousEffectsStateRef.current;

    // Vérifier les changements pour chaque effet
    Object.keys(effectsState).forEach((key) => {
      const effectKey = key as keyof typeof effectsState;
      const currentEffect = effectsState[effectKey];
      const previousEffect = previousState[effectKey];

      // Détection activation/désactivation
      if (currentEffect.enabled !== previousEffect.enabled) {
        if (currentEffect.enabled) {
          // Effet activé
          console.log('✅ [AudioRecorder] Effect activated:', currentEffect.type);
          recordActivationRef.current?.(currentEffect.type);
        } else {
          // Effet désactivé
          console.log('❌ [AudioRecorder] Effect deactivated:', currentEffect.type);
          recordDeactivationRef.current?.(currentEffect.type);
        }
      }
      // Détection changement de paramètres (seulement si l'effet est actif)
      else if (currentEffect.enabled && JSON.stringify(currentEffect.params) !== JSON.stringify(previousEffect.params)) {
        // Paramètres modifiés
        console.log('🔧 [AudioRecorder] Effect params updated:', {
          type: currentEffect.type,
          params: currentEffect.params
        });
        recordUpdateRef.current?.(currentEffect.type, currentEffect.params);
      }
    });

    // Mettre à jour l'état précédent
    previousEffectsStateRef.current = effectsState;
  }, [effectsState, isRecording]); // Retirer les fonctions des dépendances car on utilise les refs maintenant

  // Cleanup
  useEffect(() => {
    return () => {
      if (requestDataIntervalRef.current) {
        clearInterval(requestDataIntervalRef.current);
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (rawStreamRef.current) {
        rawStreamRef.current.getTracks().forEach(track => track.stop());
        rawStreamRef.current = null;
      }
      setRawStream(null);
    };
  }, []);

  // État: Initialisation
  if (isInitializing) {
    return (
      <div className="relative group pt-2 pb-1">
        <div className="relative flex flex-col items-center justify-center w-full h-24 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30 border-2 border-blue-400 dark:border-blue-500 rounded-lg">
          <Loader2 className="w-6 h-6 text-blue-600 dark:text-blue-400 animate-spin" />
          <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
            {t('recorder.initializing')}
          </div>
        </div>
        <button
          onClick={onRemove}
          className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow-md z-10"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    );
  }

  // État: Erreur
  if (permissionError) {
    return (
      <div className="relative group pt-2 pb-1">
        <div className="relative flex flex-col items-center justify-center w-full h-24 bg-red-50 dark:bg-red-900/20 border-2 border-red-400 dark:border-red-500 rounded-lg">
          <Mic className="w-6 h-6 text-red-600 dark:text-red-400 mb-1" />
          <div className="text-xs text-red-600 dark:text-red-400 text-center px-2">
            {permissionError}
          </div>
        </div>
        <button
          onClick={onRemove}
          className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow-md z-10"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    );
  }

  // État: Prêt à enregistrer OU En cours d'enregistrement
  return (
    <>
      {/* Panneau des effets audio - Portail pour afficher au-dessus de tout */}
      {isMounted && showEffectsPanel && createPortal(
        <>
          {/* Overlay pour fermer au clic à l'extérieur */}
          <div
            className="fixed inset-0 bg-black/50 z-[9998]"
            onClick={() => setShowEffectsPanel(false)}
          />

          {/* Panneau centré sur mobile, positionné près du bouton sur desktop */}
          <div
            className="fixed z-[9999] md:absolute w-[95vw] md:w-[800px]"
            style={{
              // Mobile: centré horizontalement et verticalement
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              maxWidth: '95vw',
              maxHeight: '85vh',
            }}
          >
            <AudioEffectsCarousel
              effectsState={effectsState}
              onToggleEffect={toggleEffect}
              onUpdateParams={updateEffectParams}
              onLoadPreset={loadPreset}
              currentPreset={currentPreset}
              availablePresets={availablePresets}
              availableBackSounds={availableBackSounds}
              onClose={() => setShowEffectsPanel(false)}
            />
          </div>
        </>,
        document.body
      )}

      <div className="relative group pt-2 pb-1">
        {/* Composant principal */}
      <div className={`relative flex flex-row items-center justify-between gap-2 w-full h-16 rounded-lg px-2 py-1.5 border-2 ${
        isRecording
          ? 'bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-900/30 dark:to-orange-900/30 border-red-400 dark:border-red-500'
          : 'bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800/30 dark:to-gray-900/30 border-gray-300 dark:border-gray-600'
      }`}>
        {/* Gauche: Bouton effets audio */}
        <button
          ref={buttonEffectsRef}
          onClick={() => setShowEffectsPanel(!showEffectsPanel)}
          onTouchStart={() => setShowEffectsPanel(!showEffectsPanel)}
          className={`relative flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all ${
            audioEffectsActive
              ? 'bg-gradient-to-br from-purple-500 to-pink-500 shadow-lg shadow-purple-500/50'
              : 'bg-gradient-to-br from-gray-300 to-gray-400 dark:from-gray-600 dark:to-gray-700'
          } hover:scale-105 active:scale-95`}
          title={t('recorder.audioEffects')}
        >
          <Sliders className="w-5 h-5 text-white" />
          {audioEffectsActive && (
            <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-white" />
          )}
        </button>

        {/* Centre: Timer centré verticalement avec barre de progression */}
        <div className="flex flex-col items-center justify-center flex-1 gap-1.5">
          <div className={`text-2xl font-bold font-mono tabular-nums ${
            isRecording ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-400'
          }`}>
            {formatTime(recordingTime)}
          </div>

          {/* Barre de progression (visible uniquement en enregistrement) */}
          {isRecording && (
            <div className="w-full max-w-[200px] h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-red-500 to-orange-500 transition-all duration-300 ease-linear"
                style={{
                  width: `${Math.min((recordingTime / (effectiveDuration * 1000)) * 100, 100)}%`
                }}
              />
            </div>
          )}
        </div>

        {/* Droite: Bouton Start/Stop */}
        {!isRecording ? (
          <button
            onClick={startRecording}
            onTouchStart={(e) => {
              e.preventDefault();
              startRecording();
            }}
            className="flex-shrink-0 w-10 h-10 bg-blue-500 hover:bg-blue-600 active:bg-blue-700 rounded-full flex items-center justify-center transition-all shadow-lg active:scale-95"
            title={t('recorder.startRecording')}
          >
            <Radio className="w-5 h-5 text-white" />
          </button>
        ) : (
          <button
            onClick={stopRecording}
            onTouchStart={(e) => {
              e.preventDefault();
              stopRecording();
            }}
            className="flex-shrink-0 w-10 h-10 bg-red-500 hover:bg-red-600 active:bg-red-700 rounded-full flex items-center justify-center transition-all shadow-lg active:scale-95"
            title={t('recorder.stopRecording')}
          >
            <Square className="w-4 h-4 fill-white stroke-white" />
          </button>
        )}
      </div>

      {/* Badge durée max */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 bg-gray-700 text-white text-[8px] px-2 py-0.5 rounded-full whitespace-nowrap shadow-sm">
        {t('recorder.maxDuration', { duration: Math.floor(effectiveDuration / 60) })}
      </div>

      {/* Bouton supprimer */}
      {!isRecording && (
        <button
          onClick={onRemove}
          className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-md z-10"
        >
          <X className="w-5 h-5" />
        </button>
      )}
      </div>
    </>
  );
});

AudioRecorderWithEffects.displayName = 'AudioRecorderWithEffects';
