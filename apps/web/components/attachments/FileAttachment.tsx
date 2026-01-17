/**
 * Composant pour afficher un attachment de type fichier générique
 */

'use client';

import React, { useCallback } from 'react';
import { Download, File, Image as ImageIcon, FileText, Video, Music, X } from 'lucide-react';
import { Attachment, formatFileSize, getAttachmentType } from '@meeshy/shared/types/attachment';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';

export interface FileAttachmentProps {
  attachment: Attachment;
  canDelete: boolean;
  isMobile: boolean;
  onDeleteClick: (attachment: Attachment, event: React.MouseEvent) => void;
}

export const FileAttachment = React.memo(function FileAttachment({
  attachment,
  canDelete,
  isMobile,
  onDeleteClick,
}: FileAttachmentProps) {
  const handleFileClick = useCallback((event: React.MouseEvent) => {
    window.open(attachment.fileUrl, '_blank');
  }, [attachment.fileUrl]);

  const handleDeleteClick = useCallback((event: React.MouseEvent) => {
    onDeleteClick(attachment, event);
  }, [attachment, onDeleteClick]);

  const getFileIcon = (attachment: Attachment) => {
    const type = getAttachmentType(attachment.mimeType, attachment.originalName);
    const iconClass = "w-4 h-4";

    switch (type) {
      case 'image':
        return <ImageIcon className={`${iconClass} text-blue-500`} />;
      case 'video':
        return <Video className={`${iconClass} text-purple-500`} />;
      case 'audio':
        return <Music className={`${iconClass} text-green-500`} />;
      case 'text':
      case 'code':
        return <FileText className={`${iconClass} text-gray-600 dark:text-gray-400`} />;
      default:
        return <File className={`${iconClass} text-gray-500 dark:text-gray-400`} />;
    }
  };

  const getExtension = (filename: string): string => {
    const parts = filename.split('.');
    return parts.length > 1 ? `.${parts[parts.length - 1]}` : '';
  };

  const type = getAttachmentType(attachment.mimeType, attachment.originalName);
  const extension = getExtension(attachment.originalName);

  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <div
            className="relative group flex-shrink-0 snap-start cursor-pointer"
            onClick={handleFileClick}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleFileClick(e as any);
              }
            }}
            role="button"
            tabIndex={0}
            aria-label={`Ouvrir le fichier ${attachment.originalName}`}
          >
            <div className={`relative flex flex-col items-center justify-center bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-600 rounded-lg hover:border-blue-400 dark:hover:border-blue-500 transition-all hover:shadow-md dark:hover:shadow-blue-500/20 flex-shrink-0 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
              isMobile ? 'w-14 h-14' : 'w-16 h-16'
            }`}>
              <div className="flex flex-col items-center gap-0.5">
                {getFileIcon(attachment)}
                <div className="text-[9px] font-medium text-gray-600 dark:text-gray-300">
                  {extension.toUpperCase()}
                </div>
              </div>

              {canDelete ? (
                <button
                  onClick={handleDeleteClick}
                  className="!absolute !top-0.5 !right-0.5 !w-[22px] !h-[22px] !min-w-[22px] !min-h-[22px] !max-w-[22px] !max-h-[22px] rounded-full bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700 text-white flex items-center justify-center transition-opacity shadow-md !z-[100] opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-1 !p-0"
                  title="Supprimer ce fichier"
                  aria-label={`Supprimer le fichier ${attachment.originalName}`}
                >
                  <X className="!w-[11px] !h-[11px]" />
                </button>
              ) : (
                <div className="absolute top-1 right-1 transition-opacity opacity-0 group-hover:opacity-100" aria-hidden="true">
                  <Download className="w-3 h-3 text-gray-600 dark:text-gray-400" />
                </div>
              )}
            </div>
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-gray-700 dark:bg-gray-600 text-white text-[8px] px-1 py-0.5 rounded-full whitespace-nowrap shadow-sm">
              {formatFileSize(attachment.fileSize)}
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top">
          <div className="text-xs">
            <div className="font-medium truncate max-w-[200px]">{attachment.originalName}</div>
            <div className="text-gray-400 dark:text-gray-500">
              {formatFileSize(attachment.fileSize)} • {type}
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});
