'use client';

import React, { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Square, Play, Pause, X, Mic, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

// Types pour les métadonnées audio extraites
interface AudioMetadata {
  duration: number; // Durée exacte en secondes avec millisecondes
  codec: string; // Codec utilisé
  mimeType: string; // Type MIME complet
  bitrate?: number; // Bitrate si disponible
  sampleRate?: number; // Sample rate si disponible
}

interface AudioRecorderCardProps {
  onRecordingComplete: (audioBlob: Blob, duration: number, metadata?: AudioMetadata) => void;
  onRemove: () => void;
  autoStart?: boolean;
  maxDuration?: number; // en secondes, défaut: 600 (10 min)
  onRecordingStateChange?: (isRecording: boolean) => void; // Callback pour synchroniser l'état
  onStop?: () => void; // Callback appelé AVANT d'arrêter l'enregistrement (pour permettre au parent de préparer l'upload)
}

export interface AudioRecorderCardRef {
  stopRecording: () => void;
  isRecording: () => boolean;
}

// Constantes
const MAX_ALLOWED_DURATION = 600; // 10 minutes - HARD LIMIT

// Détection du navigateur pour adapter le codec audio
const getBrowserInfo = () => {
  const ua = navigator.userAgent.toLowerCase();
  return {
    isSafari: /^((?!chrome|android).)*safari/i.test(navigator.userAgent),
    isChrome: ua.includes('chrome') && !ua.includes('edge'),
    isFirefox: ua.includes('firefox'),
    isEdge: ua.includes('edge') || ua.includes('edg/'),
  };
};

// NOUVEAU: Codecs audio UNIVERSELS compatibles avec TOUS les navigateurs
// Ordre de préférence: MP4/AAC en premier car compatible Safari, Chrome, Firefox, Edge, Brave
const UNIVERSAL_CODEC_PRIORITIES = [
  'audio/mp4',               // MP4/AAC - Compatible PARTOUT ✓
  'audio/webm;codecs=opus',  // WebM/Opus - Chrome, Firefox, Edge, Brave (pas Safari)
  'audio/webm',              // WebM générique
  'audio/ogg;codecs=opus',   // OGG/Opus - Firefox, Chrome
] as const;

/**
 * Carte d'enregistrement audio compacte pour le carrousel d'attachments
 * - Auto-démarre l'enregistrement
 * - Affiche timer et visualisation pendant l'enregistrement
 * - Lecteur audio après l'enregistrement
 */
export const AudioRecorderCard = forwardRef<AudioRecorderCardRef, AudioRecorderCardProps>(({
  onRecordingComplete,
  onRemove,
  autoStart = true,
  maxDuration = 600,
  onRecordingStateChange,
  onStop
}, ref) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0); // En millisecondes
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(autoStart);
  const [audioFormat, setAudioFormat] = useState<string>('WEBM');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0); // Utiliser performance.now() pour précision
  const animationFrameRef = useRef<number | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const selectedCodecRef = useRef<string>('');
  const requestDataIntervalRef = useRef<NodeJS.Timeout | null>(null); // Pour requestData() manuel sur TOUS les navigateurs

  // Enforce hard limit
  const effectiveDuration = Math.min(maxDuration, MAX_ALLOWED_DURATION);

  // Fonction pour obtenir le meilleur codec UNIVERSEL compatible avec tous les navigateurs
  const getBestAudioCodec = (): { mimeType: string; browserType: string } => {
    const browserInfo = getBrowserInfo();
    const browserType = browserInfo.isSafari ? 'Safari' :
                       browserInfo.isChrome ? 'Chrome' :
                       browserInfo.isFirefox ? 'Firefox' :
                       browserInfo.isEdge ? 'Edge' : 'Unknown';

    // Tester chaque codec dans l'ordre de préférence UNIVERSEL
    for (const codec of UNIVERSAL_CODEC_PRIORITIES) {
      if (MediaRecorder.isTypeSupported(codec)) {
        return { mimeType: codec, browserType };
      }
    }

    throw new Error(`No supported audio codec found for ${browserType}. Please use a modern browser.`);
  };

  // Fonction pour extraire les métadonnées audio d'un blob
  // SIMPLIFIÉ: Utilise le temps d'enregistrement mesuré (le plus fiable pour tous les navigateurs)
  const extractAudioMetadata = async (blob: Blob, mimeType: string): Promise<AudioMetadata> => {
    const codec = mimeType.includes('opus') ? 'Opus' :
                 mimeType.includes('aac') ? 'AAC' :
                 mimeType.includes('mp4') ? 'MP4/AAC' :
                 mimeType.includes('webm') ? 'WebM' : 'Unknown';

    const metadata: AudioMetadata = {
      duration: recordingTime / 1000, // Utiliser le temps mesuré avec performance.now() (très précis)
      codec: codec,
      mimeType: mimeType,
    };

    return metadata;
  };

  // Arrêter l'enregistrement
  const stopRecording = useCallback(() => {
    // Appeler le callback onStop AVANT d'arrêter (pour permettre au parent de préparer l'upload)
    if (onStop) {
      onStop();
    }

    // Arrêter l'interval requestData
    if (requestDataIntervalRef.current) {
      clearInterval(requestDataIntervalRef.current);
      requestDataIntervalRef.current = null;
    }

    // Arrêter le timer d'animation
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    startTimeRef.current = 0;

    // IMPORTANT: Arrêter IMMÉDIATEMENT tous les tracks du stream pour couper le microphone
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
      });
    }

    // Arrêter le media recorder
    if (mediaRecorderRef.current) {
      if (mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    }

    setIsRecording(false);

    // Notifier le parent du changement d'état
    if (onRecordingStateChange) {
      onRecordingStateChange(false);
    }
  }, [onRecordingStateChange, onStop]);

  // Timer précis utilisant requestAnimationFrame pour les millisecondes
  const updateTimer = useCallback(() => {
    if (!startTimeRef.current || !mediaRecorderRef.current || mediaRecorderRef.current.state !== 'recording') {
      return;
    }

    const elapsed = performance.now() - startTimeRef.current;
    setRecordingTime(elapsed);

    // Vérifier si on a atteint la durée maximale
    if (elapsed >= effectiveDuration * 1000) {
      stopRecording();
      return;
    }

    // Continuer l'animation
    animationFrameRef.current = requestAnimationFrame(updateTimer);
  }, [effectiveDuration, stopRecording]);

  // Démarrer l'enregistrement
  const startRecording = useCallback(async () => {
    setPermissionError(null);
    setIsInitializing(true);

    try {
      // Vérifier le contexte sécurisé
      if (!window.isSecureContext) {
        toast.error('Audio recording requires HTTPS.');
        setPermissionError('HTTPS required');
        setIsInitializing(false);
        return;
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        toast.error('Your browser does not support audio recording.');
        setPermissionError('Browser not supported');
        setIsInitializing(false);
        return;
      }

      // Obtenir le meilleur codec pour le navigateur
      const { mimeType, browserType } = getBestAudioCodec();
      selectedCodecRef.current = mimeType;

      // Contraintes audio UNIVERSELLES pour tous les navigateurs
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: 1, // Mono pour réduire la taille
        }
      });

      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 128000, // 128 kbps pour bonne qualité
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

        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());

        // Revoke old URL before creating new one
        if (audioUrlRef.current) {
          URL.revokeObjectURL(audioUrlRef.current);
          audioUrlRef.current = null;
        }

        // Détecter le format depuis le mimeType
        const format = mimeType.includes('webm') ? 'WEBM' :
                      mimeType.includes('mp4') ? 'MP4' :
                      mimeType.includes('ogg') ? 'OGG' :
                      mimeType.includes('wav') ? 'WAV' : 'AUDIO';
        setAudioFormat(format);

        const url = URL.createObjectURL(blob);
        audioUrlRef.current = url;
        setAudioBlob(blob);
        setAudioUrl(url);

        // Extraire les métadonnées audio
        const metadata = await extractAudioMetadata(blob, mimeType);

        // Notifier le parent avec métadonnées
        onRecordingComplete(blob, metadata.duration, metadata);
      };

      // Démarrer l'enregistrement SANS timeslice + requestData() manuel
      // Cette approche évite les problèmes de buffer qui sacagent sur Chrome/Brave
      mediaRecorder.start();

      // Appeler requestData() manuellement toutes les secondes pour TOUS les navigateurs
      // Cela évite les problèmes de buffer overflow et les sacages audio
      requestDataIntervalRef.current = setInterval(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.requestData();
        }
      }, 1000);

      setIsRecording(true);
      setIsInitializing(false);
      setRecordingTime(0);

      // Notifier le parent du changement d'état
      if (onRecordingStateChange) {
        onRecordingStateChange(true);
      }

      // Démarrer le timer haute précision avec requestAnimationFrame
      startTimeRef.current = performance.now();
      animationFrameRef.current = requestAnimationFrame(updateTimer);

    } catch (error: any) {
      setIsInitializing(false);

      if (error instanceof DOMException) {
        if (error.name === 'NotAllowedError') {
          setPermissionError('Microphone access denied');
          toast.error('Accès au microphone refusé.');
        } else if (error.name === 'NotFoundError') {
          setPermissionError('No microphone found');
          toast.error('Aucun microphone détecté.');
        } else {
          setPermissionError('Microphone error');
          toast.error('Erreur microphone.');
        }
      } else {
        toast.error('Impossible d\'accéder au microphone.');
        setPermissionError('Recording error');
      }
    }
  }, [effectiveDuration, onRecordingComplete, getBestAudioCodec, extractAudioMetadata, updateTimer]);

  // Exposer les méthodes via ref pour contrôle externe
  useImperativeHandle(ref, () => ({
    stopRecording,
    isRecording: () => isRecording
  }), [stopRecording, isRecording]);

  // Toggle play/pause
  const togglePlayPause = useCallback(() => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        // Réinitialiser à 0 si terminé
        if (audioRef.current.ended) {
          audioRef.current.currentTime = 0;
        }
        audioRef.current.play().catch(error => {
          toast.error('Erreur lors de la lecture');
          setIsPlaying(false);
        });
        setIsPlaying(true);
      }
    }
  }, [isPlaying]);

  // Auto-start recording si demandé (only on mount)
  useEffect(() => {
    if (autoStart) {
      startRecording();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount when autoStart is true

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Clean up requestData interval
      if (requestDataIntervalRef.current) {
        clearInterval(requestDataIntervalRef.current);
        requestDataIntervalRef.current = null;
      }

      // Clean up animation frame
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      // Clean up media recorder
      if (mediaRecorderRef.current) {
        const stream = mediaRecorderRef.current.stream;
        if (mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
        stream?.getTracks().forEach(track => track.stop());
      }

      // Clean up stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      // Clean up object URL
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
    };
  }, []);

  // Formater le temps avec millisecondes (MM:SS.ms)
  const formatTime = (milliseconds: number): string => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const ms = Math.floor((milliseconds % 1000) / 10); // Deux chiffres pour les centièmes
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  // État: Initialisation
  if (isInitializing) {
    return (
      <div className="relative group pt-2 pb-1">
        <div className="relative flex flex-col items-center justify-center !w-36 !h-11 !min-w-[144px] !min-h-[44px] !max-w-[144px] !max-h-[44px] bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30 border-2 border-blue-400 dark:border-blue-500 rounded-lg">
          <Loader2 className="w-4 h-4 text-blue-600 dark:text-blue-400 animate-spin" />
          <div className="text-[8px] text-blue-600 dark:text-blue-400 mt-0.5">
            Initializing...
          </div>
        </div>
        {/* Bouton supprimer */}
        <button
          onClick={onRemove}
          className="absolute -top-0.5 -right-0.5 !w-5 !h-5 !min-w-[20px] !min-h-[20px] !max-w-[20px] !max-h-[20px] bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow-md z-10 !p-0"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }

  // État: Erreur de permission
  if (permissionError) {
    return (
      <div className="relative group pt-2 pb-1">
        <div className="relative flex flex-col items-center justify-center !w-36 !h-11 !min-w-[144px] !min-h-[44px] !max-w-[144px] !max-h-[44px] bg-red-50 dark:bg-red-900/20 border-2 border-red-400 dark:border-red-500 rounded-lg">
          <Mic className="w-3.5 h-3.5 text-red-600 dark:text-red-400 mb-0.5" />
          <div className="text-[7px] text-red-600 dark:text-red-400 text-center px-1">
            {permissionError}
          </div>
        </div>
        {/* Bouton supprimer */}
        <button
          onClick={onRemove}
          className="absolute -top-0.5 -right-0.5 !w-5 !h-5 !min-w-[20px] !min-h-[20px] !max-w-[20px] !max-h-[20px] bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow-md z-10 !p-0"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }

  // État: En cours d'enregistrement
  if (isRecording) {
    return (
      <div className="relative group pt-3 pb-2">
        <div className="relative flex flex-row items-center justify-between gap-2 !w-48 !h-24 !min-w-[192px] !min-h-[96px] !max-w-[192px] !max-h-[96px] bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-900/30 dark:to-orange-900/30 border-2 border-red-400 dark:border-red-500 rounded-lg !px-3 !py-2">
          {/* Timer et indicateur */}
          <div className="flex flex-col items-start justify-center gap-1">
            <div className="text-sm font-bold text-red-600 dark:text-red-400 font-mono tabular-nums leading-none">
              {formatTime(recordingTime)}
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              <span className="text-[9px] text-red-600 dark:text-red-400 font-medium leading-none">REC</span>
            </div>
          </div>

          {/* Bouton stop */}
          <button
            onClick={stopRecording}
            className="group flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer !p-1"
          >
            <Square className="!w-4 !h-4 fill-white dark:fill-white stroke-gray-700 dark:stroke-gray-300 group-hover:stroke-red-600 dark:group-hover:stroke-red-500 stroke-[1.5]" />
            <span className="text-[9px] leading-none font-semibold text-gray-700 dark:text-gray-300 group-hover:text-red-600 dark:group-hover:text-red-500">STOP</span>
          </button>
        </div>

        {/* Badge durée max */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 bg-gray-700 text-white text-[7px] px-1 py-0.5 rounded-full whitespace-nowrap shadow-sm">
          Max {Math.floor(effectiveDuration / 60)}min
        </div>
      </div>
    );
  }

  // État: Enregistrement terminé
  if (audioBlob && audioUrl) {
    return (
      <div className="relative group pt-2 pb-1">
        <div className="relative flex flex-row items-center justify-between !w-36 !h-11 !min-w-[144px] !min-h-[44px] !max-w-[144px] !max-h-[44px] bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30 border-2 border-green-400 dark:border-green-500 rounded-lg !px-1">
          {/* Lecteur audio caché */}
          <audio
            ref={audioRef}
            src={audioUrl}
            preload="auto"
            onEnded={() => setIsPlaying(false)}
            onError={(e) => {
              setIsPlaying(false);
              toast.error('Erreur de lecture audio');
            }}
            onPause={() => setIsPlaying(false)}
            onPlay={() => setIsPlaying(true)}
            className="hidden"
          />

          {/* Infos audio */}
          <div className="flex flex-col items-start justify-center gap-0">
            <div className="text-xs font-bold text-green-600 dark:text-green-400 font-mono tabular-nums leading-none">
              {formatTime(recordingTime)}
            </div>
            <div className="text-[7px] text-green-600 dark:text-green-400 font-medium leading-none mt-0.5">
              {audioFormat} · {(audioBlob.size / 1024).toFixed(0)} KB
            </div>
            <div className="text-[7px] text-gray-500 dark:text-gray-400 leading-none mt-0.5">
              {isPlaying ? 'Playing...' : 'Ready'}
            </div>
          </div>

          {/* Bouton Play/Pause */}
          <button
            onClick={togglePlayPause}
            className="bg-green-600 hover:bg-green-700 rounded-full flex-shrink-0 flex items-center justify-center transition-all cursor-pointer !w-5 !h-5 !min-w-[20px] !min-h-[20px] !max-w-[20px] !max-h-[20px] sm:!w-6 sm:!h-6 sm:!min-w-[24px] sm:!min-h-[24px] sm:!max-w-[24px] sm:!max-h-[24px] !p-0"
          >
            {isPlaying ? (
              <Pause className="!w-2 !h-2 sm:!w-2.5 sm:!h-2.5 fill-white" />
            ) : (
              <Play className="!w-2 !h-2 sm:!w-2.5 sm:!h-2.5 fill-white ml-0.5" />
            )}
          </button>
        </div>

        {/* Bouton supprimer */}
        <button
          onClick={onRemove}
          className="absolute -top-0.5 -right-0.5 !w-5 !h-5 !min-w-[20px] !min-h-[20px] !max-w-[20px] !max-h-[20px] bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-md z-10 !p-0"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }

  // État par défaut (ne devrait jamais être atteint)
  return null;
});

AudioRecorderCard.displayName = 'AudioRecorderCard';
