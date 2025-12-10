'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, ExternalLink, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import type { UploadedAttachmentResponse } from '@meeshy/shared/types/attachment';
import { formatFileSize } from '@meeshy/shared/types/attachment';

interface PDFLightboxSimpleProps {
  attachment: UploadedAttachmentResponse | null;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * PDF Lightbox simple utilisant le viewer natif du navigateur
 * Évite les problèmes de compatibilité webpack avec react-pdf
 * Fonctionnalités: téléchargement, ouverture nouvel onglet, gestion d'erreur
 */
export const PDFLightboxSimple: React.FC<PDFLightboxSimpleProps> = ({
  attachment,
  isOpen,
  onClose
}) => {
  const [hasError, setHasError] = useState(false);

  // Reset error state when opening new PDF
  useEffect(() => {
    if (isOpen && attachment) {
      setHasError(false);
    }
  }, [isOpen, attachment]);
  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Prevent body scroll when lightbox is open
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

  const handleDownload = () => {
    if (!attachment) return;
    const link = document.createElement('a');
    link.href = attachment.fileUrl;
    link.download = attachment.originalName;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleOpenInNewTab = () => {
    if (!attachment) return;
    window.open(attachment.fileUrl, '_blank');
  };

  const handleIframeError = () => {
    setHasError(true);
  };

  if (!isOpen || !attachment) return null;

  // SSR safety
  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[10001] bg-black/95 dark:bg-black/98 backdrop-blur-sm"
        onClick={onClose}
      >
        {/* Header bar */}
        <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-3 sm:p-4 bg-gradient-to-b from-black/50 to-transparent">
          <div className="flex flex-col text-white min-w-0 flex-1 mr-4">
            <span className="font-medium text-xs sm:text-sm md:text-base truncate">
              {attachment.originalName}
            </span>
            <span className="text-[10px] sm:text-xs text-gray-300">
              {formatFileSize(attachment.fileSize)} • PDF
            </span>
          </div>

          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                handleOpenInNewTab();
              }}
              className="text-white hover:bg-white/10 w-8 h-8 sm:w-10 sm:h-10"
              aria-label="Ouvrir dans un nouvel onglet"
            >
              <ExternalLink className="w-4 h-4 sm:w-5 sm:h-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                handleDownload();
              }}
              className="text-white hover:bg-white/10 w-8 h-8 sm:w-10 sm:h-10"
              aria-label="Télécharger le PDF"
            >
              <Download className="w-4 h-4 sm:w-5 sm:h-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="text-white hover:bg-white/10 w-8 h-8 sm:w-10 sm:h-10"
              aria-label="Fermer"
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5" />
            </Button>
          </div>
        </div>

        {/* PDF viewer via iframe */}
        <div
          className="absolute inset-0 pt-16 pb-4 px-4"
          onClick={(e) => e.stopPropagation()}
        >
          {hasError ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-white">
              <AlertTriangle className="w-16 h-16 text-red-400" />
              <p className="text-lg">Impossible de charger le PDF</p>
              <p className="text-sm text-gray-400">{attachment.originalName}</p>
              <div className="flex gap-2 mt-4">
                <Button
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDownload();
                  }}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Télécharger
                </Button>
                <Button
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenInNewTab();
                  }}
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Ouvrir dans un nouvel onglet
                </Button>
              </div>
            </div>
          ) : (
            <div className="w-full h-full max-w-7xl mx-auto bg-white dark:bg-gray-900 rounded-lg overflow-hidden shadow-2xl">
              <iframe
                src={`${attachment.fileUrl}#view=FitH`}
                className="w-full h-full border-0"
                title={attachment.originalName}
                onError={handleIframeError}
                style={{
                  backgroundColor: 'white'
                }}
              />
            </div>
          )}
        </div>

        {/* Instructions */}
        <div className="hidden md:block absolute bottom-4 left-1/2 -translate-x-1/2 text-white/60 text-xs text-center">
          <p>Utilisez les contrôles natifs du PDF pour naviguer • Échap pour fermer</p>
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
};
