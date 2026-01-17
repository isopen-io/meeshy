'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import MediaManager from '@/utils/media-manager';

class VideoManager {
  private static instance: VideoManager;
  private mediaManager = MediaManager.getInstance();

  static getInstance(): VideoManager {
    if (!VideoManager.instance) {
      VideoManager.instance = new VideoManager();
    }
    return VideoManager.instance;
  }

  play(video: HTMLVideoElement) {
    this.mediaManager.play(video, 'video');
  }

  stop(video: HTMLVideoElement) {
    this.mediaManager.stop(video);
  }
}

interface UseVideoPlaybackOptions {
  fileUrl: string;
  duration?: number;
  mimeType?: string;
  attachmentId: string;
}

export function useVideoPlayback({
  fileUrl,
  duration: attachmentDuration,
  mimeType,
  attachmentId
}: UseVideoPlaybackOptions) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoadedMetadata, setHasLoadedMetadata] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const animationFrameRef = useRef<number | null>(null);

  const updateProgress = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.paused) return;

    if (video.readyState < 2) {
      animationFrameRef.current = requestAnimationFrame(updateProgress);
      return;
    }

    const newTime = video.currentTime;
    const videoDuration = video.duration;

    if (isFinite(newTime) && newTime >= 0 && isFinite(videoDuration) && videoDuration > 0) {
      if (newTime <= videoDuration) {
        setCurrentTime(newTime);
      }
    }

    animationFrameRef.current = requestAnimationFrame(updateProgress);
  }, []);

  const tryToGetDuration = useCallback(() => {
    if (videoRef.current) {
      const videoDuration = videoRef.current.duration;
      if (isFinite(videoDuration) && videoDuration > 0) {
        setDuration(videoDuration);
        setHasLoadedMetadata(true);
        if (videoRef.current.currentTime === 0 || !isFinite(videoRef.current.currentTime)) {
          setCurrentTime(0);
        }
        return;
      }
    }

    if (attachmentDuration && attachmentDuration > 0) {
      setDuration(attachmentDuration);
      setHasLoadedMetadata(true);
      setCurrentTime(0);
    }
  }, [attachmentDuration]);

  const togglePlay = useCallback(async () => {
    if (!videoRef.current) return;

    if (!fileUrl) {
      setHasError(true);
      setErrorMessage('URL du fichier vidéo manquante');
      return;
    }

    try {
      if (isPlaying) {
        videoRef.current.pause();
        setIsPlaying(false);
        VideoManager.getInstance().stop(videoRef.current);
      } else {
        setIsLoading(true);
        setHasError(false);

        VideoManager.getInstance().play(videoRef.current);

        const videoDuration = videoRef.current.duration;
        if (isFinite(videoDuration) && videoDuration > 0) {
          if (videoRef.current.currentTime >= videoDuration - 0.1) {
            videoRef.current.currentTime = 0;
            setCurrentTime(0);
          }
        } else {
          videoRef.current.currentTime = 0;
          setCurrentTime(0);
        }

        if (videoRef.current.readyState === 0) {
          videoRef.current.load();
          await new Promise((resolve) => setTimeout(resolve, 100));
        }

        await videoRef.current.play();
        setIsPlaying(true);
        setIsLoading(false);
      }
    } catch (error: any) {
      setIsLoading(false);
      setIsPlaying(false);
      setHasError(true);

      if (error?.name === 'NotSupportedError') {
        setErrorMessage('Format vidéo non supporté');
      } else if (error?.name === 'NotAllowedError') {
        setErrorMessage('Lecture bloquée par le navigateur');
      } else {
        setErrorMessage('Erreur de lecture vidéo');
      }
    }
  }, [fileUrl, isPlaying]);

  const handleSeek = useCallback((time: number) => {
    setCurrentTime(time);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    tryToGetDuration();
  }, [tryToGetDuration]);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      setCurrentTime(0);
    }
  }, []);

  const handleVideoError = useCallback(
    (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
      const video = e.currentTarget;
      const error = video.error;

      if (
        error?.code === MediaError.MEDIA_ERR_DECODE &&
        mimeType?.includes('webm')
      ) {
        setHasError(true);
        setIsLoading(false);
        setIsPlaying(false);
        setErrorMessage('Format non supporté sur ce navigateur');
        return;
      }

      if (duration > 0) return;

      if (
        error &&
        (error.code === MediaError.MEDIA_ERR_NETWORK ||
          error.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED)
      ) {
        setHasError(true);
        setIsLoading(false);
        setIsPlaying(false);
        setErrorMessage(
          error.code === MediaError.MEDIA_ERR_NETWORK
            ? 'Erreur réseau'
            : 'Format non supporté'
        );
      }
    },
    [mimeType, duration]
  );

  // Initialize video src
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (fileUrl) {
      const isValidUrl =
        fileUrl.startsWith('http://') || fileUrl.startsWith('https://');

      if (isValidUrl) {
        video.src = fileUrl;
        video.load();
      } else {
        setHasError(true);
        setErrorMessage('URL du fichier invalide');
      }
    } else {
      setHasError(true);
      setErrorMessage('URL du fichier manquante');
    }
  }, [attachmentId, fileUrl]);

  // Listen to play/pause events
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => {
      setIsPlaying(true);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      animationFrameRef.current = requestAnimationFrame(updateProgress);
    };

    const handlePause = () => {
      setIsPlaying(false);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };

    const handleTimeUpdate = () => {
      if (video.paused) return;
      if (video.readyState < 2) return;

      const newTime = video.currentTime;
      const videoDuration = video.duration;

      if (isFinite(newTime) && newTime >= 0 && isFinite(videoDuration) && videoDuration > 0) {
        if (newTime <= videoDuration) {
          setCurrentTime(newTime);
        }
      }
    };

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('timeupdate', handleTimeUpdate);

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.pause();
      VideoManager.getInstance().stop(video);

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      video.removeAttribute('src');
      video.load();
    };
  }, [updateProgress]);

  // Initialize duration from attachment
  useEffect(() => {
    if (attachmentDuration && attachmentDuration > 0) {
      setDuration(attachmentDuration);
    }
  }, [attachmentId, attachmentDuration]);

  // Reset currentTime when video changes
  useEffect(() => {
    setCurrentTime(0);
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
    }
  }, [attachmentId]);

  return {
    videoRef,
    isPlaying,
    currentTime,
    duration,
    isLoading,
    hasLoadedMetadata,
    hasError,
    errorMessage,
    togglePlay,
    handleSeek,
    handleLoadedMetadata,
    handleEnded,
    handleVideoError
  };
}
