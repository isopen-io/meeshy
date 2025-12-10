'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import {
  Download,
  AlertTriangle,
  Maximize,
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { UploadedAttachmentResponse } from '@meeshy/shared/types/attachment';

// Chargement dynamique pour éviter les erreurs SSR
const Document = dynamic(
  () => import('react-pdf').then((mod) => mod.Document),
  { ssr: false }
);

const Page = dynamic(
  () => import('react-pdf').then((mod) => mod.Page),
  { ssr: false }
);

// Configuration du worker PDF.js
if (typeof window !== 'undefined') {
  import('react-pdf').then((reactPdf) => {
    reactPdf.pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${reactPdf.pdfjs.version}/pdf.worker.min.js`;
  });
}

interface PDFViewerProps {
  attachment: UploadedAttachmentResponse;
  className?: string;
  onOpenLightbox?: () => void;
  onDelete?: () => void;
  canDelete?: boolean;
}

/**
 * Lecteur PDF avec react-pdf
 * - Affichage page par page avec navigation
 * - Zoom et contrôles
 * - Gestion d'erreurs robuste
 */
export const PDFViewer: React.FC<PDFViewerProps> = ({
  attachment,
  className = '',
  onOpenLightbox,
  onDelete,
  canDelete = false
}) => {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const attachmentFileUrl = attachment.fileUrl;

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setIsLoading(false);
    setHasError(false);
  };

  const onDocumentLoadError = (error: Error) => {
    console.error('Erreur chargement PDF:', error);
    setHasError(true);
    setErrorMessage('Impossible de charger le PDF');
    setIsLoading(false);
  };

  const handleOpenInNewTab = () => {
    window.open(attachmentFileUrl, '_blank');
  };

  const goToPreviousPage = () => {
    setPageNumber((prev) => Math.max(prev - 1, 1));
  };

  const goToNextPage = () => {
    setPageNumber((prev) => Math.min(prev + 1, numPages));
  };

  const handleZoomIn = () => {
    setScale((prev) => Math.min(prev + 0.2, 2.0));
  };

  const handleZoomOut = () => {
    setScale((prev) => Math.max(prev - 0.2, 0.5));
  };

  return (
    <div
      className={`flex flex-col gap-2 p-3 bg-gradient-to-br from-red-50 to-orange-50 dark:from-gray-800 dark:to-gray-900 rounded-lg border ${
        hasError
          ? 'border-red-300 dark:border-red-700'
          : 'border-red-200 dark:border-gray-700'
      } shadow-md hover:shadow-lg transition-all duration-200 w-full max-w-[90vw] sm:max-w-2xl min-w-0 overflow-hidden ${className}`}
    >
      {/* PDF viewer - responsive height */}
      <div className="relative w-full bg-white dark:bg-gray-900 rounded-lg overflow-auto h-[210px] sm:h-[280px] md:h-[350px]">
        {isLoading && !hasError && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-800">
            <div className="w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {hasError ? (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-800">
            <div className="flex flex-col items-center gap-2 text-gray-600 dark:text-gray-400">
              <AlertTriangle className="w-12 h-12" />
              <span className="text-sm text-center px-4">{errorMessage}</span>
              <Button
                onClick={handleOpenInNewTab}
                size="sm"
                className="mt-2 bg-red-600 hover:bg-red-700 text-white"
              >
                Ouvrir dans un nouvel onglet
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center w-full h-full p-2">
            <Document
              file={attachmentFileUrl}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
              loading={
                <div className="flex items-center justify-center py-12">
                  <div className="w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
                </div>
              }
              options={{
                // Désactiver l'ouverture automatique de la sidebar
                disableAutoFetch: false,
                disableStream: false
              }}
            >
              <Page
                pageNumber={pageNumber}
                scale={scale}
                renderTextLayer={true}
                renderAnnotationLayer={false}
                className="shadow-lg"
              />
            </Document>
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
            title="Supprimer ce PDF"
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Contrôles */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {/* Info fichier et pagination */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="text-xs text-gray-600 dark:text-gray-300 truncate">
            <span className="font-medium">{attachment.originalName}</span>
            {!hasError && numPages > 0 && (
              <span className="ml-2 text-gray-500">
                Page {pageNumber} / {numPages}
              </span>
            )}
          </div>
        </div>

        {/* Contrôles de navigation et zoom */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {!hasError && numPages > 1 && (
            <>
              <Button
                onClick={goToPreviousPage}
                disabled={pageNumber <= 1}
                size="sm"
                variant="ghost"
                className="w-8 h-8 p-0"
                title="Page précédente"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                onClick={goToNextPage}
                disabled={pageNumber >= numPages}
                size="sm"
                variant="ghost"
                className="w-8 h-8 p-0"
                title="Page suivante"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
              <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1" />
            </>
          )}

          {!hasError && (
            <>
              <Button
                onClick={handleZoomOut}
                disabled={scale <= 0.5}
                size="sm"
                variant="ghost"
                className="w-8 h-8 p-0"
                title="Dézoomer"
              >
                <ZoomOut className="w-4 h-4" />
              </Button>
              <Button
                onClick={handleZoomIn}
                disabled={scale >= 2.0}
                size="sm"
                variant="ghost"
                className="w-8 h-8 p-0"
                title="Zoomer"
              >
                <ZoomIn className="w-4 h-4" />
              </Button>
              <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1" />
            </>
          )}

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
            href={attachmentFileUrl}
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
