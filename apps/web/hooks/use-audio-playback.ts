import { useState, useRef, useEffect, useCallback } from 'react';
import { apiService } from '@/services/api.service';
import MediaManager from '@/utils/media-manager';

/**
 * AudioManager - Gestionnaire global pour coordonner la lecture audio
 * Utilise MediaManager pour coordination avec les vidéos
 */
class AudioManager {
  private static instance: AudioManager;
  private mediaManager = MediaManager.getInstance();

  static getInstance(): AudioManager {
    if (!AudioManager.instance) {
      AudioManager.instance = new AudioManager();
    }
    return AudioManager.instance;
  }

  play(audio: HTMLAudioElement) {
    this.mediaManager.play(audio, 'audio');
  }

  stop(audio: HTMLAudioElement) {
    this.mediaManager.stop(audio);
  }
}

interface UseAudioPlaybackOptions {
  audioUrl: string;
  attachmentId: string;
  attachmentDuration?: number;
  mimeType?: string;
  isOwnMessage?: boolean;
}

interface UseAudioPlaybackReturn {
  // Refs
  audioRef: React.RefObject<HTMLAudioElement | null>;
  animationFrameRef: React.MutableRefObject<number | null>;

  // État de lecture
  isPlaying: boolean;
  isLoading: boolean;
  hasError: boolean;
  errorMessage: string;

  // État audio
  currentTime: number;
  duration: number;
  objectUrl: string | null;
  playbackRate: number;

  // Actions
  togglePlay: () => Promise<void>;
  handleSeek: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSeekToTime: (timeInSeconds: number) => void;
  setPlaybackRate: (rate: number) => void;

  // Handlers
  handleLoadedMetadata: () => void;
  handleEnded: () => void;
  handleAudioError: (e: React.SyntheticEvent<HTMLAudioElement, Event>) => void;
}

/**
 * Hook personnalisé pour gérer la lecture audio
 * Gère le chargement, la lecture, le contrôle de la progression et la vitesse
 */
export function useAudioPlayback({
  audioUrl,
  attachmentId,
  attachmentDuration,
  mimeType,
  isOwnMessage = false,
}: UseAudioPlaybackOptions): UseAudioPlaybackReturn {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoadedMetadata, setHasLoadedMetadata] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1.0);

  const audioRef = useRef<HTMLAudioElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const playStartTimeRef = useRef<number | null>(null);
  const hasTrackedCompletionRef = useRef(false);

  const trackConsumption = useCallback((complete: boolean) => {
    if (isOwnMessage) return;
    const audio = audioRef.current;
    const playPositionMs = audio ? Math.round(audio.currentTime * 1000) : 0;
    const durationMs = audio ? Math.round(audio.duration * 1000) : 0;
    apiService.post(`/attachments/${attachmentId}/status`, {
      action: 'listened',
      playPositionMs,
      durationMs: isFinite(durationMs) ? durationMs : 0,
      complete,
    }).catch(() => {});
  }, [attachmentId, isOwnMessage]);

  // Reset tracking refs when attachment changes
  useEffect(() => {
    hasTrackedCompletionRef.current = false;
    playStartTimeRef.current = null;
  }, [attachmentId]);

  // Charger l'audio via apiService
  useEffect(() => {
    let isMounted = true;
    let currentObjectUrl: string | null = null;

    const loadAudio = async () => {
      if (!audioUrl) {
        setHasError(true);
        setErrorMessage('URL du fichier manquante');
        return;
      }

      // Arrêter la lecture en cours avant de charger un nouvel audio
      if (audioRef.current) {
        audioRef.current.pause();
        setIsPlaying(false);
        AudioManager.getInstance().stop(audioRef.current);
        // Nettoyer la source audio pour éviter les erreurs de blob URL révoquée
        audioRef.current.removeAttribute('src');
        audioRef.current.load();
      }

      // Révoquer l'ancienne blob URL avant d'en créer une nouvelle
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        setObjectUrl(null);
      }

      let apiPath = audioUrl;

      try {
        setIsLoading(true);
        setHasError(false);
        setHasLoadedMetadata(false); // Réinitialiser le flag lors du chargement d'un nouvel audio
        setCurrentTime(0); // Réinitialiser le temps de lecture à 0

        if (audioUrl.startsWith('http://') || audioUrl.startsWith('https://')) {
          try {
            const url = new URL(audioUrl);
            apiPath = url.pathname;
            console.log('🎵 [useAudioPlayback] URL complète → pathname:', {
              fullUrl: audioUrl,
              pathname: apiPath
            });
          } catch {
            // Si parsing échoue, utiliser tel quel
            console.log('🎵 [useAudioPlayback] Parsing URL échoué, utilisation directe:', audioUrl);
          }
        } else {
          console.log('🎵 [useAudioPlayback] URL relative utilisée directement:', apiPath);
        }

        console.log('🎵 [useAudioPlayback] Chargement audio via apiService.getBlob:', apiPath);
        const blob = await apiService.getBlob(apiPath);
        console.log('✅ [useAudioPlayback] Audio chargé avec succès:', {
          blobSize: `${(blob.size / 1024).toFixed(1)} KB`,
          blobType: blob.type
        });

        if (!isMounted) {
          return;
        }

        currentObjectUrl = URL.createObjectURL(blob);
        setObjectUrl(currentObjectUrl);

        if (audioRef.current) {
          audioRef.current.load();
          audioRef.current.currentTime = 0; // Forcer le reset du temps après le chargement
        }

        setIsLoading(false);
      } catch (error: any) {
        console.error('❌ [useAudioPlayback] Failed to load audio:', {
          error,
          status: error?.status,
          code: error?.code,
          message: error?.message,
          audioUrl,
          apiPath
        });

        if (!isMounted) {
          return;
        }

        setHasError(true);
        setIsLoading(false);

        if (error?.status === 404) {
          setErrorMessage('Fichier audio introuvable');
          console.error('❌ [useAudioPlayback] 404: Fichier introuvable sur le serveur');
        } else if (error?.status === 500) {
          setErrorMessage('Erreur serveur');
          console.error('❌ [useAudioPlayback] 500: Erreur serveur');
        } else if (error?.code === 'TIMEOUT') {
          setErrorMessage('Timeout - fichier trop volumineux');
          console.error('❌ [useAudioPlayback] Timeout');
        } else {
          setErrorMessage('Erreur de chargement');
          console.error('❌ [useAudioPlayback] Erreur générique');
        }
      }
    };

    loadAudio();

    return () => {
      isMounted = false;
      // Nettoyer l'audio element avant de révoquer la blob URL
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeAttribute('src');
        audioRef.current.load();
      }
      if (currentObjectUrl) {
        URL.revokeObjectURL(currentObjectUrl);
      }
    };
  }, [attachmentId, audioUrl]); // Note: objectUrl volontairement omis pour éviter boucle infinie

  // Initialiser la durée depuis l'attachment
  // Force la mise à jour quand attachmentDuration change (ex: changement de langue audio)
  useEffect(() => {
    if (attachmentDuration && attachmentDuration > 0) {
      setDuration(attachmentDuration);
      setHasLoadedMetadata(true); // Marquer comme chargé pour éviter l'écrasement par les métadonnées
    }
  }, [attachmentId, attachmentDuration]);

  // Appliquer la vitesse de lecture
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  // Mettre à jour le temps avec requestAnimationFrame
  const updateProgress = useCallback(() => {
    if (audioRef.current && !audioRef.current.paused) {
      setCurrentTime(audioRef.current.currentTime);
      animationFrameRef.current = requestAnimationFrame(updateProgress);
    }
  }, []);

  // Gérer l'animation de progression
  useEffect(() => {
    if (isPlaying && audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
      animationFrameRef.current = requestAnimationFrame(updateProgress);
    } else {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [isPlaying, updateProgress]);

  // Toggle play/pause
  const togglePlay = useCallback(async () => {
    if (!audioRef.current || !objectUrl) {
      setHasError(true);
      setErrorMessage('Audio non chargé');
      return;
    }

    try {
      if (isPlaying) {
        const listenedMs = playStartTimeRef.current ? Date.now() - playStartTimeRef.current : 0;
        playStartTimeRef.current = null;
        if (listenedMs >= 3000 && !hasTrackedCompletionRef.current) {
          trackConsumption(false);
        }
        audioRef.current.pause();
        setIsPlaying(false);
        AudioManager.getInstance().stop(audioRef.current);
      } else {
        setIsLoading(true);
        setHasError(false);

        AudioManager.getInstance().play(audioRef.current);

        if (audioRef.current.currentTime >= audioRef.current.duration - 0.1) {
          audioRef.current.currentTime = 0;
          setCurrentTime(0);
        }

        if (audioRef.current.readyState === 0) {
          audioRef.current.load();
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        await audioRef.current.play();
        playStartTimeRef.current = Date.now();
        setIsPlaying(true);
        setIsLoading(false);
      }
    } catch (error: any) {
      setIsLoading(false);
      setIsPlaying(false);
      setHasError(true);

      if (error?.name === 'NotSupportedError') {
        setErrorMessage('Format audio non supporté');
      } else if (error?.name === 'NotAllowedError') {
        setErrorMessage('Lecture bloquée par le navigateur');
      } else {
        setErrorMessage('Erreur de lecture audio');
      }
    }
  }, [objectUrl, isPlaying, trackConsumption]);

  // Handler pour récupérer la durée
  const tryToGetDuration = useCallback(() => {
    if (attachmentDuration && attachmentDuration > 0 && !hasLoadedMetadata) {
      setDuration(attachmentDuration);
      setHasLoadedMetadata(true);
      return;
    }

    if (audioRef.current) {
      const audioDuration = audioRef.current.duration;
      if (isFinite(audioDuration) && audioDuration > 0 && !hasLoadedMetadata) {
        setDuration(audioDuration);
        setHasLoadedMetadata(true);
        return;
      }
    }
  }, [attachmentDuration, hasLoadedMetadata]);

  const handleLoadedMetadata = useCallback(() => {
    tryToGetDuration();
  }, [tryToGetDuration]);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    if (!hasTrackedCompletionRef.current) {
      hasTrackedCompletionRef.current = true;
      trackConsumption(true);
    }
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      setCurrentTime(0);
    }
  }, [trackConsumption]);

  const handleAudioError = useCallback((e: React.SyntheticEvent<HTMLAudioElement, Event>) => {
    const audio = e.currentTarget;
    const error = audio.error;

    if (error?.code === MediaError.MEDIA_ERR_DECODE && mimeType?.includes('webm')) {
      setHasError(true);
      setIsLoading(false);
      setIsPlaying(false);
      setErrorMessage('Format non supporté sur ce navigateur');
      return;
    }

    if (duration > 0) return;

    if (error && (error.code === MediaError.MEDIA_ERR_NETWORK || error.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED)) {
      setHasError(true);
      setIsLoading(false);
      setIsPlaying(false);
      setErrorMessage(error.code === MediaError.MEDIA_ERR_NETWORK ? 'Erreur réseau' : 'Format non supporté');
    }
  }, [mimeType, duration]);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  }, []);

  const handleSeekToTime = useCallback((timeInSeconds: number) => {
    if (audioRef.current && isFinite(timeInSeconds) && timeInSeconds >= 0) {
      const clampedTime = Math.min(timeInSeconds, duration || 0);
      audioRef.current.currentTime = clampedTime;
      setCurrentTime(clampedTime);
    }
  }, [duration]);

  // Écouter les événements audio (pause et timeupdate)
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handlePause = () => {
      setIsPlaying(false);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };

    const handleTimeUpdate = () => {
      if (audio.paused) return;
      if (audio.readyState < 2) return;

      const newTime = audio.currentTime;
      const audioDuration = audio.duration;

      if (isFinite(newTime) && newTime >= 0 && isFinite(audioDuration) && audioDuration > 0) {
        if (newTime <= audioDuration) {
          setCurrentTime(newTime);
        }
      }
    };

    audio.addEventListener('pause', handlePause);
    audio.addEventListener('timeupdate', handleTimeUpdate);

    return () => {
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.pause();
      AudioManager.getInstance().stop(audio);

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      audio.removeAttribute('src');
      audio.load();
    };
  }, []);

  return {
    audioRef,
    animationFrameRef,
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
  };
}
