/**
 * Composant Lightbox pour afficher les vidéos en plein écran
 * Supporte : navigation, contrôles vidéo, téléchargement, clavier
 */

'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Download,
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Attachment, formatFileSize } from '@meeshy/shared/types/attachment';
import { Button } from '../ui/button';

interface VideoLightboxProps {
  videos: Attachment[];
  initialIndex: number;
  isOpen: boolean;
  onClose: () => void;
}

export function VideoLightbox({
  videos,
  initialIndex,
  isOpen,
  onClose,
}: VideoLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [videoDimensions, setVideoDimensions] = useState({ width: 0, height: 0 });
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const touchStartX = useRef<number>(0);
  const touchEndX = useRef<number>(0);

  // Update currentIndex when initialIndex changes (when clicking different video)
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(initialIndex);
    }
  }, [initialIndex, isOpen]);

  // Reset état quand on change de vidéo ou au montage initial
  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  }, [currentIndex, isOpen]);

  // Fonction pour mettre à jour le temps avec requestAnimationFrame
  const updateProgress = useCallback(() => {
    if (videoRef.current && !videoRef.current.paused) {
      setCurrentTime(videoRef.current.currentTime);
      animationFrameRef.current = requestAnimationFrame(updateProgress);
    }
  }, []);

  // Gérer l'animation de progression
  useEffect(() => {
    if (isPlaying && videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
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

  // Empêcher le scroll du body quand le lightbox est ouvert
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const currentVideo = videos[currentIndex];
  const canGoPrevious = currentIndex > 0;
  const canGoNext = currentIndex < videos.length - 1;

  const goToPrevious = useCallback(() => {
    if (videos.length > 1) {
      // Navigation circulaire
      setCurrentIndex((prev) => (prev === 0 ? videos.length - 1 : prev - 1));
    }
  }, [videos.length]);

  const goToNext = useCallback(() => {
    if (videos.length > 1) {
      // Navigation circulaire
      setCurrentIndex((prev) => (prev === videos.length - 1 ? 0 : prev + 1));
    }
  }, [videos.length]);

  const togglePlay = useCallback(async () => {
    if (!videoRef.current) return;

    try {
      if (isPlaying) {
        videoRef.current.pause();
        setIsPlaying(false);
      } else {
        await videoRef.current.play();
        setIsPlaying(true);
      }
    } catch (error) {
      console.error('Erreur de lecture vidéo:', error);
    }
  }, [isPlaying]);

  const toggleMute = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  }, [isMuted]);

  const toggleFullscreen = useCallback(async () => {
    if (!videoRef.current) return;

    try {
      const doc = document as any;
      const isInFullscreen = !!(
        doc.fullscreenElement ||
        doc.webkitFullscreenElement ||
        doc.mozFullScreenElement ||
        doc.msFullscreenElement
      );

      if (!isInFullscreen) {
        // Entrer en mode plein écran - essayer toutes les variantes
        const element = videoRef.current as any;
        if (element.requestFullscreen) {
          await element.requestFullscreen();
        } else if (element.webkitRequestFullscreen) {
          // Safari
          await element.webkitRequestFullscreen();
        } else if (element.mozRequestFullScreen) {
          // Firefox
          await element.mozRequestFullScreen();
        } else if (element.msRequestFullscreen) {
          // IE/Edge
          await element.msRequestFullscreen();
        } else {
          console.warn('Fullscreen API non supporté sur ce navigateur');
          return;
        }
        setIsFullscreen(true);
      } else {
        // Sortir du mode plein écran - essayer toutes les variantes
        if (doc.exitFullscreen) {
          await doc.exitFullscreen();
        } else if (doc.webkitExitFullscreen) {
          // Safari
          await doc.webkitExitFullscreen();
        } else if (doc.mozCancelFullScreen) {
          // Firefox
          await doc.mozCancelFullScreen();
        } else if (doc.msExitFullscreen) {
          // IE/Edge
          await doc.msExitFullscreen();
        }
        setIsFullscreen(false);
      }
    } catch (error) {
      console.error('Erreur plein écran:', error);
    }
  }, []);

  // Écouter les changements de plein écran - Version cross-browser compatible
  useEffect(() => {
    const handleFullscreenChange = () => {
      const doc = document as any;
      const isInFullscreen = !!(
        doc.fullscreenElement ||
        doc.webkitFullscreenElement ||
        doc.mozFullScreenElement ||
        doc.msFullscreenElement
      );
      setIsFullscreen(isInFullscreen);
    };

    // Ajouter tous les event listeners pour compatibilité cross-browser
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange); // Safari
    document.addEventListener('mozfullscreenchange', handleFullscreenChange); // Firefox
    document.addEventListener('MSFullscreenChange', handleFullscreenChange); // IE/Edge

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, []);

  // Recalculer les dimensions lors du redimensionnement de la fenêtre
  useEffect(() => {
    const handleResize = () => {
      // Force un re-render pour recalculer les dimensions
      if (videoRef.current && videoDimensions.width > 0) {
        setVideoDimensions({
          width: videoRef.current.videoWidth,
          height: videoRef.current.videoHeight,
        });
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [videoDimensions.width]);

  // Navigation clavier
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          onClose();
          break;
        case 'ArrowLeft':
          goToPrevious();
          break;
        case 'ArrowRight':
          goToNext();
          break;
        case ' ':
          e.preventDefault();
          togglePlay();
          break;
        case 'm':
        case 'M':
          toggleMute();
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          toggleFullscreen();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, goToPrevious, goToNext, togglePlay, toggleMute, toggleFullscreen, onClose]);

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (videoRef.current) {
      videoRef.current.volume = newVolume;
      if (newVolume > 0 && isMuted) {
        setIsMuted(false);
        videoRef.current.muted = false;
      }
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  };

  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
      // Récupérer les dimensions réelles de la vidéo
      setVideoDimensions({
        width: videoRef.current.videoWidth,
        height: videoRef.current.videoHeight,
      });
    }
  }, []);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    if (videoRef.current && duration > 0) {
      setCurrentTime(duration);
    }
  }, [duration]);

  const handleDownload = useCallback(() => {
    if (!currentVideo) return;

    const link = document.createElement('a');
    link.href = currentVideo.fileUrl;
    link.download = currentVideo.originalName;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [currentVideo]);

  const formatTime = (seconds: number): string => {
    if (!isFinite(seconds) || isNaN(seconds) || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Gestion du swipe
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return;

    const diff = touchStartX.current - touchEndX.current;
    const minSwipeDistance = 50;

    if (Math.abs(diff) > minSwipeDistance) {
      if (diff > 0) {
        // Swipe vers la gauche -> vidéo suivante
        goToNext();
      } else {
        // Swipe vers la droite -> vidéo précédente
        goToPrevious();
      }
    }

    touchStartX.current = 0;
    touchEndX.current = 0;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Calculer les dimensions du container vidéo
  const getVideoContainerStyle = (): React.CSSProperties => {
    // Sur mobile : toujours plein écran
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      return {
        width: '100%',
        height: '100%',
      };
    }

    // Sur desktop : utiliser les proportions de la vidéo
    if (videoDimensions.width > 0 && videoDimensions.height > 0) {
      const aspectRatio = videoDimensions.width / videoDimensions.height;
      const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 1920;
      const screenHeight = typeof window !== 'undefined' ? window.innerHeight : 1080;

      // Réserver de l'espace pour les contrôles (120px en haut + 150px en bas)
      const availableHeight = screenHeight - 270;
      const availableWidth = screenWidth - 100; // Marges latérales

      let width = availableWidth;
      let height = width / aspectRatio;

      // Si la hauteur dépasse l'espace disponible, ajuster par la hauteur
      if (height > availableHeight) {
        height = availableHeight;
        width = height * aspectRatio;
      }

      // Appliquer une marge de 10% en hauteur pour garantir la visibilité des contrôles
      const heightWithMargin = height * 0.90; // 10% de réduction
      const widthWithMargin = heightWithMargin * aspectRatio;

      return {
        width: `${widthWithMargin}px`,
        height: `${heightWithMargin}px`,
        maxWidth: '90vw',
        maxHeight: '80vh',
      };
    }

    // Par défaut : dimensions raisonnables
    return {
      width: '90vw',
      height: '80vh',
      maxWidth: '1600px',
      maxHeight: '900px',
    };
  };

  if (!isOpen || !currentVideo) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[10001] bg-black/95 dark:bg-black/98 backdrop-blur-sm"
        onClick={(e) => {
          // Fermer seulement si on clique sur le backdrop (pas sur les contrôles ou la vidéo)
          if (e.target === e.currentTarget) {
            onClose();
          }
        }}
      >
        {/* Barre d'outils supérieure */}
        <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4 bg-gradient-to-b from-black/50 to-transparent">
          <div className="flex flex-col text-white">
            <span className="font-medium text-sm md:text-base truncate max-w-xs md:max-w-md">
              {currentVideo.originalName}
            </span>
            <span className="text-xs text-gray-300">
              {formatFileSize(currentVideo.fileSize)}
              {currentVideo.width &&
                currentVideo.height &&
                ` • ${currentVideo.width}x${currentVideo.height}`}
              {currentVideo.duration && ` • ${formatTime(currentVideo.duration)}`}
              {videos.length > 1 && ` • ${currentIndex + 1} / ${videos.length}`}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                handleDownload();
              }}
              className="text-white hover:bg-white/10"
              aria-label="Télécharger la vidéo"
            >
              <Download className="w-5 h-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="text-white hover:bg-white/10"
              aria-label="Fermer"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Zone d'affichage de la vidéo */}
        <div
          className="absolute inset-0 flex items-center justify-center"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <motion.div
            key={currentVideo.id}
            initial={{ opacity: 0, x: 100 }}
            animate={{
              opacity: 1,
              x: 0,
            }}
            exit={{ opacity: 0, x: -100 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="relative md:rounded-lg overflow-hidden"
            style={getVideoContainerStyle()}
            onClick={(e) => e.stopPropagation()}
          >
            <video
              ref={videoRef}
              src={currentVideo.fileUrl}
              onLoadedMetadata={handleLoadedMetadata}
              onEnded={handleEnded}
              className="w-full h-full object-contain bg-black"
              controls={false}
              playsInline
            >
              Votre navigateur ne supporte pas la lecture vidéo.
            </video>

            {/* Bouton play central (quand en pause) */}
            {!isPlaying && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  togglePlay();
                }}
                className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/30 transition-colors duration-200 group"
                aria-label="Lire la vidéo"
              >
                <div className="w-20 h-20 rounded-full bg-purple-600 hover:bg-purple-700 flex items-center justify-center shadow-xl group-hover:scale-110 transition-transform">
                  <Play className="w-10 h-10 text-white ml-1 fill-current" />
                </div>
              </button>
            )}
          </motion.div>
        </div>

        {/* Navigation gauche */}
        {videos.length > 1 && (
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              goToPrevious();
            }}
            className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 text-white hover:bg-white/10 bg-black/30 z-20"
            aria-label="Vidéo précédente"
          >
            <ChevronLeft className="w-8 h-8" />
          </Button>
        )}

        {/* Navigation droite */}
        {videos.length > 1 && (
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              goToNext();
            }}
            className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 text-white hover:bg-white/10 bg-black/30 z-20"
            aria-label="Vidéo suivante"
          >
            <ChevronRight className="w-8 h-8" />
          </Button>
        )}

        {/* Contrôles vidéo en bas */}
        <div className="absolute bottom-0 left-0 right-0 z-10 p-4 bg-gradient-to-t from-black/70 to-transparent">
          <div className="max-w-6xl mx-auto flex flex-col gap-3">
            {/* Barre de progression avec pourcentage intégré - plus épaisse */}
            <div className="relative w-full h-[15px] bg-white/20 rounded-full overflow-visible group cursor-pointer">
              {/* Barre de progression remplie avec animation fluide */}
              <div
                className={`absolute top-0 left-0 h-full rounded-full ${
                  isPlaying
                    ? 'bg-gradient-to-r from-purple-500 via-purple-600 to-purple-500'
                    : 'bg-purple-600'
                }`}
                style={{
                  width: `${progress}%`,
                  transition: 'none', // Pas de transition pour un rendu fluide à 60fps
                }}
              />

              {/* Curseur de position - Visible au survol avec animation smooth */}
              <div
                className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-lg border-2 border-purple-600 opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity duration-200 pointer-events-none"
                style={{
                  left: `calc(${Math.min(progress, 100)}% - 8px)`,
                }}
              />

              {/* Pourcentage centré dans la barre (horizontalement ET verticalement) */}
              {duration > 0 && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="text-[11px] font-semibold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
                    {progress.toFixed(0)}%
                  </span>
                </div>
              )}

              {/* Input range invisible pour le contrôle */}
              <input
                type="range"
                min="0"
                max={duration || 100}
                value={currentTime}
                onChange={handleSeek}
                className="absolute top-0 left-0 w-full h-full opacity-0 cursor-pointer z-10"
                style={{ touchAction: 'none' }}
              />
            </div>

            {/* Contrôles de lecture */}
            <div className="flex items-center gap-3 text-white">
              {/* Bouton Play/Pause */}
              <Button
                onClick={togglePlay}
                size="sm"
                className="w-10 h-10 rounded-full bg-purple-600 hover:bg-purple-700 text-white p-0 flex items-center justify-center"
                aria-label={isPlaying ? 'Mettre en pause' : 'Lire la vidéo'}
              >
                {isPlaying ? (
                  <Pause className="w-5 h-5 fill-current" />
                ) : (
                  <Play className="w-5 h-5 ml-0.5 fill-current" />
                )}
              </Button>

              {/* Temps */}
              <span className="text-sm font-mono tabular-nums flex-shrink-0">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>

              {/* Spacer */}
              <div className="flex-1" />

              {/* Contrôles volume */}
              <div className="hidden sm:flex items-center gap-2">
                <Button
                  onClick={toggleMute}
                  size="sm"
                  variant="ghost"
                  className="w-9 h-9 p-0 text-white hover:bg-white/10"
                  aria-label={isMuted || volume === 0 ? 'Activer le son' : 'Couper le son'}
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="w-5 h-5" />
                  ) : (
                    <Volume2 className="w-5 h-5" />
                  )}
                </Button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-20 h-1 accent-purple-600"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>

              {/* Bouton plein écran */}
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFullscreen();
                }}
                size="sm"
                variant="ghost"
                className="w-9 h-9 p-0 text-white hover:bg-white/10"
                title={isFullscreen ? "Quitter le plein écran (F)" : "Plein écran (F)"}
                aria-label={isFullscreen ? "Quitter le plein écran" : "Plein écran"}
              >
                {isFullscreen ? (
                  <Minimize className="w-5 h-5" />
                ) : (
                  <Maximize className="w-5 h-5" />
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Instructions clavier (desktop uniquement) */}
        <div className="hidden md:block absolute bottom-24 left-1/2 -translate-x-1/2 text-white/60 text-xs text-center">
          <p>
            Utilisez les flèches ← → pour naviguer • Espace pour play/pause • M
            pour mute • F pour plein écran • Échap pour fermer
          </p>
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
