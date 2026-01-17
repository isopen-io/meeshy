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
}

interface UseAudioPlaybackReturn {
  // Refs
  audioRef: React.RefObject<HTMLAudioElement>;
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

      try {
        setIsLoading(true);
        setHasError(false);

        let apiPath = audioUrl;

        if (audioUrl.startsWith('http://') || audioUrl.startsWith('https://')) {
          try {
            const url = new URL(audioUrl);
            apiPath = url.pathname;
          } catch {
            // Si parsing échoue, utiliser tel quel
          }
        }

        const blob = await apiService.getBlob(apiPath);

        if (!isMounted) {
          return;
        }

        currentObjectUrl = URL.createObjectURL(blob);
        setObjectUrl(currentObjectUrl);

        if (audioRef.current) {
          audioRef.current.load();
        }

        setIsLoading(false);
      } catch (error: any) {
        console.error('[useAudioPlayback] Failed to load audio:', error);

        if (!isMounted) {
          return;
        }

        setHasError(true);
        setIsLoading(false);

        if (error?.status === 404) {
          setErrorMessage('Fichier audio introuvable');
        } else if (error?.status === 500) {
          setErrorMessage('Erreur serveur');
        } else if (error?.code === 'TIMEOUT') {
          setErrorMessage('Timeout - fichier trop volumineux');
        } else {
          setErrorMessage('Erreur de chargement');
        }
      }
    };

    loadAudio();

    return () => {
      isMounted = false;
      if (currentObjectUrl) {
        URL.revokeObjectURL(currentObjectUrl);
      }
    };
  }, [attachmentId, audioUrl]);

  // Initialiser la durée depuis l'attachment
  useEffect(() => {
    if (attachmentDuration && attachmentDuration > 0) {
      setDuration(attachmentDuration);
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
  }, [objectUrl, isPlaying]);

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
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      setCurrentTime(0);
    }
  }, []);

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

  // Écouter les événements de pause
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

    audio.addEventListener('pause', handlePause);

    return () => {
      audio.removeEventListener('pause', handlePause);
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
