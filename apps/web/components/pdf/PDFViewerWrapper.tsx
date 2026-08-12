'use client';

import React, { useState } from 'react';
import {
  Download,
  AlertTriangle,
  Maximize,
  X,
  FileText
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { truncateFilename } from '@/utils/truncate';
import type { UploadedAttachmentResponse } from '@meeshy/shared/types/attachment';
import { useI18n } from '@/hooks/useI18n';

interface PDFViewerWrapperProps {
  attachment: UploadedAttachmentResponse;
  className?: string;
  onOpenLightbox?: () => void;
  onDelete?: () => void;
  canDelete?: boolean;
}

/**
 * Wrapper qui utilise iframe pour l'affichage
 * Compatible Safari mobile - affichage PDF natif du navigateur
 */
export const PDFViewerWrapper: React.FC<PDFViewerWrapperProps> = ({
  attachment,
  className = '',
  onOpenLightbox,
  onDelete,
  canDelete = false
}) => {
  const { t } = useI18n('viewers');
  const [hasError, setHasError] = useState(false);

  const attachmentFileUrl = attachment.fileUrl;

  const handleIframeError = () => {
    setHasError(true);
  };

  const handleOpenInNewTab = () => {
    window.open(attachmentFileUrl, '_blank', 'noopener,noreferrer');
  };

  // Truncate filename for mobile

  return (
    <div
      className={`flex flex-col gap-2 p-3 bg-gradient-to-br from-red-50 to-orange-50 dark:from-gray-800 dark:to-gray-900 rounded-lg border ${
        hasError
          ? 'border-red-300 dark:border-red-700'
          : 'border-red-200 dark:border-gray-700'
      } shadow-md hover:shadow-lg transition-shadow duration-200 w-full sm:max-w-2xl min-w-0 overflow-hidden ${className}`}
    >
      {/* PDF embed - responsive height */}
      <div className="relative w-full bg-white dark:bg-gray-900 rounded-lg overflow-auto h-[210px] sm:h-[280px] md:h-[350px]">
        {!hasError ? (
          <iframe
            src={`${attachmentFileUrl}#toolbar=1&navpanes=1&view=FitH`}
            className="w-full h-full border-0"
            title={attachment.originalName}
            onError={handleIframeError}
            style={{
              minHeight: '100%',
              minWidth: '100%'
            }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-800">
            <div className="flex flex-col items-center gap-2 text-gray-600 dark:text-gray-400">
              <AlertTriangle className="w-12 h-12" />
              <span className="text-sm text-center px-4">{t('pdf.loadError')}</span>
              <Button
                onClick={handleOpenInNewTab}
                size="sm"
                className="mt-2 bg-red-600 hover:bg-red-700 text-white"
              >
                <FileText className="w-4 h-4 mr-2" />
                {t('pdf.openInNewTab')}
              </Button>
            </div>
          </div>
        )}

        {/* Delete button */}
        {canDelete && onDelete && !hasError && (
          <Button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            size="sm"
            variant="destructive"
            className="absolute top-2 right-2 w-8 h-8 p-0 opacity-0 hover:opacity-100 focus-visible:opacity-100 transition-opacity"
            title={t('pdf.delete')}
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Contrôles */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {/* Info fichier */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="text-xs text-gray-600 dark:text-gray-300 truncate">
            <span className="font-medium hidden sm:inline">{attachment.originalName}</span>
            <span className="font-medium inline sm:hidden">{truncateFilename(attachment.originalName)}</span>
          </div>
        </div>

        {/* Contrôles d'action */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Bouton plein écran / lightbox */}
          {onOpenLightbox && (
            <Button
              onClick={onOpenLightbox}
              size="sm"
              variant="ghost"
              className="w-8 h-8 p-0"
              title={t('pdf.fullscreen')}
            >
              <Maximize className="w-4 h-4" />
            </Button>
          )}

          {/* Bouton télécharger */}
          <a
            href={attachmentFileUrl}
            download={attachment.originalName}
            className="flex-shrink-0 p-1.5 hover:bg-white/50 dark:hover:bg-gray-700/50 rounded-full transition-colors duration-200"
            title={t('pdf.download')}
            onClick={(e) => e.stopPropagation()}
          >
            <Download className="w-4 h-4 text-gray-600 dark:text-gray-300" />
          </a>
        </div>
      </div>
    </div>
  );
};
