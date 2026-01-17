/**
 * Composant carrousel compact pour afficher les attachments sous forme d'icônes
 * Optimisé pour mobile avec miniatures légères et traitement asynchrone
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { getAttachmentType } from '@meeshy/shared/types/attachment';
import { AttachmentCarouselProps } from './carousel/types';
import { useThumbnails } from './carousel/hooks/useThumbnails';
import { useFileUrls } from './carousel/hooks/useFileUrls';
import { useLightboxState } from './carousel/hooks/useLightboxState';
import { FilePreviewCard } from './carousel/FilePreviewCard';
import { LightboxRenderers } from './carousel/LightboxRenderers';

export const AttachmentCarousel = React.memo(function AttachmentCarousel({
  files,
  onRemove,
  uploadProgress = {},
  disabled = false,
  audioRecorderSlot
}: AttachmentCarouselProps) {
  const [isMounted, setIsMounted] = useState(false);

  // Hooks personnalisés pour gérer les états
  const { thumbnails, isGeneratingThumbnails } = useThumbnails(files);
  const fileUrls = useFileUrls(files);
  const {
    state: lightboxState,
    openImageLightbox,
    closeImageLightbox,
    openVideoLightbox,
    closeVideoLightbox,
    openPdfLightbox,
    closePdfLightbox,
    openTextLightbox,
    closeTextLightbox,
    openPptxLightbox,
    closePptxLightbox,
    openMarkdownLightbox,
    closeMarkdownLightbox,
  } = useLightboxState();

  // S'assurer que le composant est monté avant de charger les lightbox
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const handleOpenLightbox = useCallback((file: File, type: 'image' | 'video' | 'pdf' | 'text' | 'pptx' | 'markdown') => {
    const fileKey = `${file.name}-${file.size}-${file.lastModified}`;

    switch (type) {
      case 'image': {
        const imageFiles = files.filter(f => getAttachmentType(f.type) === 'image');
        const imageIndex = imageFiles.findIndex(f => `${f.name}-${f.size}-${f.lastModified}` === fileKey);
        openImageLightbox(imageIndex);
        break;
      }
      case 'video': {
        const videoFiles = files.filter(f => getAttachmentType(f.type) === 'video');
        const videoIndex = videoFiles.findIndex(f => `${f.name}-${f.size}-${f.lastModified}` === fileKey);
        openVideoLightbox(videoIndex);
        break;
      }
      case 'pdf':
        openPdfLightbox(file);
        break;
      case 'text':
        openTextLightbox(file);
        break;
      case 'pptx':
        openPptxLightbox(file);
        break;
      case 'markdown':
        openMarkdownLightbox(file);
        break;
    }
  }, [files, openImageLightbox, openVideoLightbox, openPdfLightbox, openTextLightbox, openPptxLightbox, openMarkdownLightbox]);

  if (files.length === 0 && !audioRecorderSlot) return null;

  return (
    <div
      className="w-full max-w-full bg-gradient-to-r from-gray-50 to-gray-100/50 dark:from-gray-800 dark:to-gray-700/50 border-t border-gray-200 dark:border-gray-600"
      role="region"
      aria-label="Attachments carousel"
    >
      <div
        className="flex items-center gap-3 px-3 py-3 overflow-x-auto overflow-y-hidden w-full min-w-0"
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: '#9ca3af #f3f4f6',
          WebkitOverflowScrolling: 'touch',
          minHeight: '100px',
        }}
        tabIndex={0}
        role="list"
        aria-label="Attached files"
      >
        {audioRecorderSlot && (
          <div className="flex-shrink-0" role="listitem">
            {audioRecorderSlot}
          </div>
        )}
        {files.slice().reverse().map((file, reversedIndex) => {
          const index = files.length - 1 - reversedIndex;
          const fileKey = `${file.name}-${file.size}-${file.lastModified}`;

          return (
            <div key={`${file.name}-${index}`} className="flex-shrink-0" role="listitem">
              <FilePreviewCard
                file={file}
                index={index}
                uploadProgress={uploadProgress[index]}
                disabled={disabled}
                onRemove={onRemove}
                onOpenLightbox={handleOpenLightbox}
                thumbnailUrl={thumbnails.get(fileKey)}
                fileUrl={fileUrls.get(fileKey)}
                isGeneratingThumbnail={isGeneratingThumbnails}
              />
            </div>
          );
        })}
      </div>

      {/* Styles pour la scrollbar */}
      <style jsx>{`
        div[role="list"]::-webkit-scrollbar {
          height: 8px;
        }
        div[role="list"]::-webkit-scrollbar-track {
          background: #f3f4f6;
          border-radius: 4px;
        }
        div[role="list"]::-webkit-scrollbar-thumb {
          background: #9ca3af;
          border-radius: 4px;
        }
        div[role="list"]::-webkit-scrollbar-thumb:hover {
          background: #6b7280;
        }

        :global(.dark) div[role="list"]::-webkit-scrollbar-track {
          background: #374151;
        }
        :global(.dark) div[role="list"]::-webkit-scrollbar-thumb {
          background: #6b7280;
        }
        :global(.dark) div[role="list"]::-webkit-scrollbar-thumb:hover {
          background: #9ca3af;
        }

        div[role="list"]:focus {
          outline: 2px solid #3b82f6;
          outline-offset: -2px;
        }
      `}</style>

      {/* Lightbox renderers */}
      <LightboxRenderers
        files={files}
        fileUrls={fileUrls}
        isMounted={isMounted}
        imageLightboxIndex={lightboxState.imageLightboxIndex}
        videoLightboxIndex={lightboxState.videoLightboxIndex}
        pdfLightboxFile={lightboxState.pdfLightboxFile}
        textLightboxFile={lightboxState.textLightboxFile}
        pptxLightboxFile={lightboxState.pptxLightboxFile}
        markdownLightboxFile={lightboxState.markdownLightboxFile}
        onCloseImageLightbox={closeImageLightbox}
        onCloseVideoLightbox={closeVideoLightbox}
        onClosePdfLightbox={closePdfLightbox}
        onCloseTextLightbox={closeTextLightbox}
        onClosePptxLightbox={closePptxLightbox}
        onCloseMarkdownLightbox={closeMarkdownLightbox}
      />
    </div>
  );
}, (prevProps, nextProps) => {
  // Optimisation : ne re-rendre que si les fichiers, la progression, le statut disabled ou le slot audio changent
  return (
    prevProps.files.length === nextProps.files.length &&
    prevProps.files.every((file, i) =>
      file === nextProps.files[i] &&
      prevProps.uploadProgress?.[i] === nextProps.uploadProgress?.[i]
    ) &&
    prevProps.disabled === nextProps.disabled &&
    prevProps.audioRecorderSlot === nextProps.audioRecorderSlot
  );
});
