/**
 * Composant Lightbox pour afficher les images en plein écran
 * Supporte : zoom, swipe, navigation clavier, téléchargement
 */

'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useI18n } from '@/hooks/use-i18n';
import { createPortal } from 'react-dom';
import { X, Download, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Attachment, formatFileSize } from '@meeshy/shared/types/attachment';
import { Button } from '../ui/button';

interface ImageLightboxProps {
  images: Attachment[];
  initialIndex: number;
  isOpen: boolean;
  onClose: () => void;
}

export function ImageLightbox({ images, initialIndex, isOpen, onClose }: ImageLightboxProps) {
  const { t } = useI18n('common');
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [imageError, setImageError] = useState(false);

  // Update currentIndex when initialIndex changes (when clicking different image)
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(initialIndex);
    }
  }, [initialIndex, isOpen]);

  // Reset zoom, rotation et erreur quand on change d'image
  useEffect(() => {
    setZoom(1);
    setRotation(0);
    setImageError(false);
  }, [currentIndex]);

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

  // Vérification de sécurité: si pas d'URL, fermer le lightbox
  useEffect(() => {
    // Vérifier que l'image courante existe et a une URL
    if (isOpen && images && images.length > 0 && currentIndex >= 0 && currentIndex < images.length) {
      const img = images[currentIndex];
      if (!img.fileUrl) {
        console.error('[ImageLightbox] Image sans URL:', img);
        onClose();
      }
    }
  }, [isOpen, images, currentIndex, onClose]);

  // Navigation clavier - avec logique inline pour éviter les dépendances
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          onClose();
          break;
        case 'ArrowLeft':
          setCurrentIndex((prev) => Math.max(0, prev - 1));
          break;
        case 'ArrowRight':
          setCurrentIndex((prev) => Math.min((images?.length || 0) - 1, prev + 1));
          break;
        case '+':
        case '=':
          setZoom((prev) => Math.min(prev + 0.5, 3));
          break;
        case '-':
          setZoom((prev) => Math.max(prev - 0.5, 0.5));
          break;
        case 'r':
        case 'R':
          setRotation((prev) => (prev + 90) % 360);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, images, onClose]);

  // Calculer les valeurs nécessaires avec vérification de sécurité
  const currentImage = (images && images.length > 0 && currentIndex >= 0 && currentIndex < images.length)
    ? images[currentIndex]
    : null;
  const canGoPrevious = currentIndex > 0;
  const canGoNext = images && currentIndex < images.length - 1;

  const goToPrevious = useCallback(() => {
    if (canGoPrevious) {
      setCurrentIndex((prev) => prev - 1);
    }
  }, [canGoPrevious]);

  const goToNext = useCallback(() => {
    if (canGoNext) {
      setCurrentIndex((prev) => prev + 1);
    }
  }, [canGoNext]);

  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(prev + 0.5, 3));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(prev - 0.5, 0.5));
  }, []);

  const handleRotate = useCallback(() => {
    setRotation((prev) => (prev + 90) % 360);
  }, []);

  const handleDownload = useCallback(() => {
    if (!currentImage) return;

    const link = document.createElement('a');
    link.href = currentImage.fileUrl;
    link.download = currentImage.originalName;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [currentImage]);

  // Early validation: check if images array and currentIndex are valid
  // DOIT être après tous les hooks pour respecter les règles des hooks React
  if (!isOpen || !images || images.length === 0 || !currentImage) {
    return null;
  }

  // Vérifier que document.body existe (SSR safety)
  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[10001] bg-black/95 dark:bg-black/98 backdrop-blur-sm"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-label={t('common.imageViewer', 'Image viewer')}
      >
        {/* Barre d'outils supérieure */}
        <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4 bg-gradient-to-b from-black/50 to-transparent">
          <div className="flex flex-col text-white">
            <span className="font-medium text-sm md:text-base truncate max-w-xs md:max-w-md">
              {currentImage.originalName}
            </span>
            <span className="text-xs text-gray-300">
              {formatFileSize(currentImage.fileSize)}
              {currentImage.width && currentImage.height && ` • ${currentImage.width}x${currentImage.height}`}
              {images.length > 1 && ` • ${currentIndex + 1} / ${images.length}`}
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
              aria-label={t('common.download')}
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
              aria-label={t('common.close')}
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Zone d'affichage de l'image */}
        <div className="absolute inset-0 flex items-center justify-center p-4 md:p-8">
          {imageError ? (
            <div className="flex flex-col items-center gap-4 text-white">
              <div className="text-red-400 text-6xl">⚠️</div>
              <p className="text-lg">{t('common.imageLoadError', 'Unable to load image')}</p>
              <p className="text-sm text-gray-400">{currentImage.originalName}</p>
              <Button
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDownload();
                }}
                className="mt-4"
              >
                <Download className="w-4 h-4 mr-2" />
                {t('common.downloadAnyway', 'Download anyway')}
              </Button>
            </div>
          ) : (
            <motion.img
              key={currentImage.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{
                opacity: 1,
                scale: zoom,
                rotate: rotation
              }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.2 }}
              src={currentImage.fileUrl}
              alt={currentImage.originalName}
              className="max-w-full max-h-full object-contain cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              onError={(_e) => {
                console.error('[ImageLightbox] Erreur chargement image:', currentImage.fileUrl);
                setImageError(true);
              }}
              draggable={false}
            />
          )}
        </div>

        {/* Navigation gauche */}
        {canGoPrevious && (
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              goToPrevious();
            }}
            className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 text-white hover:bg-white/10 bg-black/30"
            aria-label={t('common.previous')}
          >
            <ChevronLeft className="w-8 h-8" />
          </Button>
        )}

        {/* Navigation droite */}
        {canGoNext && (
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              goToNext();
            }}
            className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 text-white hover:bg-white/10 bg-black/30"
            aria-label={t('common.next')}
          >
            <ChevronRight className="w-8 h-8" />
          </Button>
        )}

        {/* Barre d'outils inférieure */}
        <div className="absolute bottom-0 left-0 right-0 z-10 flex items-center justify-center p-4 bg-gradient-to-t from-black/50 to-transparent">
          <div className="flex items-center gap-2 bg-black/60 backdrop-blur-sm rounded-full px-4 py-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                handleZoomOut();
              }}
              disabled={zoom <= 0.5}
              className="text-white hover:bg-white/10 w-8 h-8"
              aria-label={t('common.zoomOut')}
            >
              <ZoomOut className="w-4 h-4" />
            </Button>

            <span className="text-white text-sm font-medium min-w-[3rem] text-center">
              {Math.round(zoom * 100)}%
            </span>

            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                handleZoomIn();
              }}
              disabled={zoom >= 3}
              className="text-white hover:bg-white/10 w-8 h-8"
              aria-label={t('common.zoomIn')}
            >
              <ZoomIn className="w-4 h-4" />
            </Button>

            <div className="w-px h-6 bg-white/20 mx-2" />

            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                handleRotate();
              }}
              className="text-white hover:bg-white/10 w-8 h-8"
              aria-label={t('common.rotate')}
            >
              <RotateCw className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Instructions clavier (desktop uniquement) */}
        <div className="hidden md:block absolute bottom-20 left-1/2 -translate-x-1/2 text-white/60 text-xs text-center">
          <p>
            {t('common.lightboxKeyboardHelp', 'Use the ← → arrows to navigate • +/- to zoom • R to rotate • Esc to close')}
          </p>
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
