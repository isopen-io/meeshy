'use client';

import React, { useState } from 'react';
import {
  Download,
  AlertTriangle,
  Maximize,
  X,
  Presentation
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { UploadedAttachmentResponse } from '@meeshy/shared/types/attachment';

interface PPTXViewerProps {
  attachment: UploadedAttachmentResponse;
  className?: string;
  onOpenLightbox?: () => void;
  onDelete?: () => void;
  canDelete?: boolean;
}

/**
 * PPTX Viewer - PowerPoint presentation viewer with inline display
 * Uses Microsoft Office Online viewer for rendering
 */
export const PPTXViewer: React.FC<PPTXViewerProps> = ({
  attachment,
  className = '',
  onOpenLightbox,
  onDelete,
  canDelete = false
}) => {
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const attachmentFileUrl = attachment.fileUrl;

  // Microsoft Office Online viewer URL
  const officeViewerUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(attachmentFileUrl)}`;

  const handleIframeError = () => {
    setHasError(true);
    setErrorMessage('Impossible de charger la présentation');
  };

  const handleOpenInNewTab = () => {
    window.open(attachmentFileUrl, '_blank');
  };

  return (
    <div
      className={`flex flex-col gap-2 p-3 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-gray-800 dark:to-gray-900 rounded-lg border ${
        hasError
          ? 'border-red-300 dark:border-red-700'
          : 'border-orange-200 dark:border-gray-700'
      } shadow-md hover:shadow-lg transition-all duration-200 w-full max-w-[90vw] sm:max-w-2xl min-w-0 overflow-hidden ${className}`}
    >
      {/* PPTX iframe - responsive height */}
      <div className="relative w-full bg-white dark:bg-gray-900 rounded-lg overflow-hidden h-[210px] sm:h-[280px] md:h-[350px]">
        {!hasError ? (
          <>
            <iframe
              src={officeViewerUrl}
              className="w-full h-full border-0"
              onError={handleIframeError}
              title={attachment.originalName}
              allow="autoplay"
            />
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-800">
            <div className="flex flex-col items-center gap-2 text-gray-600 dark:text-gray-400">
              <AlertTriangle className="w-12 h-12" />
              <span className="text-sm text-center px-4">{errorMessage}</span>
              <p className="text-xs text-center px-4 text-gray-500">
                Le fichier doit être accessible publiquement pour être visualisé
              </p>
              <Button
                onClick={handleOpenInNewTab}
                size="sm"
                className="mt-2 bg-orange-600 hover:bg-orange-700 text-white"
              >
                <Presentation className="w-4 h-4 mr-2" />
                Télécharger le fichier
              </Button>
            </div>
          </div>
        )}

        {/* Overlay info */}
        {!hasError && (
          <div className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded max-w-[calc(100%-4rem)]">
            <span className="truncate block">{attachment.originalName}</span>
          </div>
        )}

        {/* Delete button */}
        {canDelete && onDelete && (
          <Button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            size="sm"
            variant="destructive"
            className="absolute top-2 right-2 w-8 h-8 p-0 opacity-0 hover:opacity-100 focus-visible:opacity-100 transition-opacity"
            title="Supprimer cette présentation"
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Contrôles */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {/* Info fichier */}
          <div className="text-xs text-gray-600 dark:text-gray-300 flex items-center gap-1 truncate">
            <Presentation className="w-3 h-3 flex-shrink-0 text-orange-600" />
            <span className="font-medium truncate">{attachment.originalName}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Bouton plein écran / lightbox */}
          {onOpenLightbox && (
            <Button
              onClick={onOpenLightbox}
              size="sm"
              variant="ghost"
              className="w-8 h-8 p-0"
              title="Ouvrir en plein écran"
            >
              <Maximize className="w-4 h-4" />
            </Button>
          )}

          {/* Bouton télécharger */}
          <a
            href={attachment.fileUrl}
            download={attachment.originalName}
            className="flex-shrink-0 p-1.5 hover:bg-white/50 dark:hover:bg-gray-700/50 rounded-full transition-all duration-200"
            title="Télécharger"
            onClick={(e) => e.stopPropagation()}
          >
            <Download className="w-4 h-4 text-gray-600 dark:text-gray-300" />
          </a>
        </div>
      </div>
    </div>
  );
};
