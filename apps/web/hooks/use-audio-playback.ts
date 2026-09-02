import { useState, useRef, useEffect, useCallback } from 'react';
import { apiService } from '@/services/api.service';
import type { CurrentUserAttachmentConsumption } from '@meeshy/shared/types/attachment';
import MediaManager from '@/utils/media-manager';
import { useMediaConsumptionReporter } from '@/hooks/use-media-consumption-reporter';

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
  /**
   * La langue de la piste jouée, quand le lecteur en propose plusieurs (#3913).
   * Elle part au serveur avec le rapport, et son changement le CLÔT.
   */
  consumedLanguage?: string | null;
  /**
   * Ce que le serveur sait déjà de cette écoute (#3909) — position et
   * complétion. Servi par `GET /conversations/:id/messages` depuis toujours ;
   * `apps/web` n'en avait aucune occurrence.
   */
  consumption?: CurrentUserAttachmentConsumption | null;
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
  consumedLanguage,
  consumption,
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
  const hasTrackedCompletionRef = useRef(false);

  // DÉCLARÉ EN PREMIER, et ce n'est pas cosmétique : React exécute les
  // nettoyages d'effets dans l'ordre de déclaration, et l'effet de chargement
  // ci-dessous finit par `removeAttribute('src')` + `load()`, ce qui remet
  // `currentTime` à 0. Un rapport de clôture posé après lui rapporterait 0 à
  // chaque démontage — ponctuel, et faux.
  //
  // L'écoute de l'AUTEUR compte aussi (user 2026-08-18 : « remonter les
  // lectures de l'audio même si c'est l'auteur qui le lit ») — parité iOS, dont
  // le report n'a jamais eu de gate auteur. `isOwnMessage` reste une prop de
  // style, plus un filtre de comptage.
  const { noteStarted, noteSeek, report, resumeSeconds } = useMediaConsumptionReporter({
    attachmentId,
    kind: 'audio',
    mediaRef: audioRef,
    trackKey: audioUrl,
    consumedLanguage,
    consumption,
  });

  // Lu par ref dans l'effet de chargement : la reprise ne doit pas RELANCER un
  // téléchargement, et l'effet ne doit pas non plus capturer une valeur périmée.
  const resumeSecondsRef = useRef(resumeSeconds);
  resumeSecondsRef.current = resumeSeconds;

  // Reset tracking refs when attachment changes
  useEffect(() => {
    hasTrackedCompletionRef.current = false;
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
          // #3909 — la position servie par le serveur reprend la main sur le
          // zéro. `currentUserConsumption` existait depuis toujours dans la
          // réponse des messages, et `apps/web` n'en avait AUCUNE occurrence :
          // rouvrir un vocal repartait du début, même sur le même onglet après
          // un simple rechargement. Le navigateur borne lui-même à la durée
          // réelle, qui peut différer sur une piste traduite.
          const reprise = resumeSecondsRef.current;
          audioRef.current.currentTime = reprise ?? 0;
          setCurrentTime(reprise ?? 0);
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
        // Le seuil « ≥ 3 s » a disparu avec le passage au tracker (#3913) :
        // c'est exactement la perte structurelle que son doc-comment décrit —
        // un vocal d'une seconde n'était JAMAIS remonté. `report` se tait de
        // lui-même quand il n'a rien à dire, ce qui est la bonne garde.
        if (!hasTrackedCompletionRef.current) {
          report({ complete: false, endedBy: 'pause' });
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
        noteStarted();
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
  }, [objectUrl, isPlaying, report, noteStarted]);

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
      report({ complete: true, endedBy: 'completed' });
    }
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      setCurrentTime(0);
    }
  }, [report]);

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
    if (audioRef.current) {
      noteSeek(audioRef.current.currentTime, time);
      audioRef.current.currentTime = time;
    }
    setCurrentTime(time);
  }, [noteSeek]);

  const handleSeekToTime = useCallback((timeInSeconds: number) => {
    if (audioRef.current && isFinite(timeInSeconds) && timeInSeconds >= 0) {
      const clampedTime = Math.min(timeInSeconds, duration || 0);
      noteSeek(audioRef.current.currentTime, clampedTime);
      audioRef.current.currentTime = clampedTime;
      setCurrentTime(clampedTime);
    }
  }, [duration, noteSeek]);

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
