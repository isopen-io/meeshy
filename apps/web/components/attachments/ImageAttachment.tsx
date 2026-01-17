/**
 * Composant pour afficher un attachment image
 */

'use client';

import React, { useCallback } from 'react';
import { X } from 'lucide-react';
import { Attachment, formatFileSize } from '@meeshy/shared/types/attachment';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';

export interface ImageAttachmentProps {
  attachment: Attachment;
  canDelete: boolean;
  imageCount: number;
  isMobile: boolean;
  isOwnMessage?: boolean;
  onImageClick: (attachment: Attachment) => void;
  onDeleteClick: (attachment: Attachment, event: React.MouseEvent) => void;
}

export const ImageAttachment = React.memo(function ImageAttachment({
  attachment,
  canDelete,
  imageCount,
  isMobile,
  isOwnMessage = false,
  onImageClick,
  onDeleteClick,
}: ImageAttachmentProps) {
  const handleImageClick = useCallback((event: React.MouseEvent) => {
    onImageClick(attachment);
  }, [attachment, onImageClick]);

  const handleDeleteClick = useCallback((event: React.MouseEvent) => {
    onDeleteClick(attachment, event);
  }, [attachment, onDeleteClick]);

  const getExtension = (filename: string): string => {
    const parts = filename.split('.');
    return parts.length > 1 ? `.${parts[parts.length - 1]}` : '';
  };

  const extension = getExtension(attachment.originalName);

  // Déterminer la taille d'affichage selon le nombre d'images
  let sizeClasses = '';
  let aspectRatioClass = '';

  if (imageCount === 1 || imageCount === 2) {
    sizeClasses = '';
    aspectRatioClass = '';
  } else if (imageCount <= 4) {
    sizeClasses = isMobile
      ? 'w-full max-w-[45vw] h-auto max-h-[180px]'
      : 'w-full max-w-[200px] h-auto max-h-[200px]';
    aspectRatioClass = 'aspect-square';
  } else {
    sizeClasses = isMobile
      ? 'w-full max-w-[40vw] h-auto max-h-[160px]'
      : 'w-full max-w-[176px] h-auto max-h-[176px]';
    aspectRatioClass = 'aspect-square';
  }

  const isPng = attachment.mimeType === 'image/png';
  const imageUrl = (isPng || imageCount <= 2)
    ? attachment.fileUrl
    : (attachment.thumbnailUrl || attachment.fileUrl);

  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <div
            className={`relative group cursor-pointer snap-start ${
              imageCount <= 2 ? (isOwnMessage ? 'ml-auto' : 'mr-auto') : 'flex-shrink-0'
            }`}
            onClick={handleImageClick}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleImageClick(e as any);
              }
            }}
            role="button"
            tabIndex={0}
            aria-label={`Ouvrir l'image ${attachment.originalName}`}
          >
            <div className={`relative bg-gray-100 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden hover:border-blue-400 dark:hover:border-blue-500 transition-all hover:shadow-lg dark:hover:shadow-blue-500/30 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${imageCount <= 2 ? 'inline-flex items-center justify-center max-h-[320px]' : sizeClasses} ${aspectRatioClass}`}>
              <img
                src={imageUrl}
                alt={attachment.originalName}
                className={`${
                  imageCount <= 2
                    ? 'max-w-full max-h-[320px] w-auto h-auto object-contain'
                    : 'w-full h-full object-cover'
                }`}
                loading="lazy"
                decoding="async"
                onError={(e) => {
                  if (e.currentTarget.src !== attachment.fileUrl) {
                    e.currentTarget.src = attachment.fileUrl;
                  } else {
                    e.currentTarget.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect fill="%23ddd" width="100" height="100"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="%23999"%3EImage%3C/text%3E%3C/svg%3E';
                  }
                }}
              />

              {canDelete && (
                <button
                  onClick={handleDeleteClick}
                  className="!absolute !top-1 !right-1 !w-[22px] !h-[22px] !min-w-[22px] !min-h-[22px] !max-w-[22px] !max-h-[22px] rounded-full bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700 text-white flex items-center justify-center transition-opacity shadow-md !z-[100] opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-1 !p-0"
                  title="Supprimer cette image"
                  aria-label={`Supprimer l'image ${attachment.originalName}`}
                >
                  <X className="!w-[11px] !h-[11px]" />
                </button>
              )}

              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 dark:from-black/90 to-transparent px-1.5 py-1" aria-hidden="true">
                <div className="text-white text-[10px] font-medium truncate">
                  {extension.toUpperCase()}
                </div>
              </div>
            </div>
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-gray-700 dark:bg-gray-600 text-white text-[9px] px-1.5 py-0.5 rounded-full whitespace-nowrap shadow-sm">
              {formatFileSize(attachment.fileSize)}
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top">
          <div className="text-xs">
            <div className="font-medium truncate max-w-[200px]">{attachment.originalName}</div>
            <div className="text-gray-400 dark:text-gray-500">
              {formatFileSize(attachment.fileSize)}
              {attachment.width && attachment.height && ` • ${attachment.width}x${attachment.height}`}
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});
