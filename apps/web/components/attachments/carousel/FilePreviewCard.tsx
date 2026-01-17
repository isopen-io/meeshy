/**
 * Composant pour afficher une carte de prévisualisation de fichier
 */

'use client';

import React from 'react';
import { X, File, Image, FileText, Video, Music } from 'lucide-react';
import { formatFileSize, getAttachmentType } from '@meeshy/shared/types/attachment';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../../ui/tooltip';
import { AudioFilePreview } from './AudioFilePreview';
import { ImageViewer, VideoViewer, DocumentViewer } from './MediaViewers';
import { FilePreviewProps } from './types';

const getFileIcon = (file: File) => {
  const type = getAttachmentType(file.type);
  const iconClass = "w-5 h-5";

  switch (type) {
    case 'image':
      return <Image className={`${iconClass} text-blue-500`} />;
    case 'video':
      return <Video className={`${iconClass} text-purple-500`} />;
    case 'audio':
      return <Music className={`${iconClass} text-green-500`} />;
    case 'text':
      return <FileText className={`${iconClass} text-gray-600`} />;
    default:
      return <File className={`${iconClass} text-gray-500`} />;
  }
};

const getFileExtension = (filename: string): string => {
  const parts = filename.split('.');
  return parts.length > 1 ? `.${parts[parts.length - 1]}` : '';
};

export const FilePreviewCard = React.memo(function FilePreviewCard({
  file,
  index,
  uploadProgress,
  disabled,
  onRemove,
  onOpenLightbox,
  thumbnailUrl,
  fileUrl,
  isGeneratingThumbnail,
}: FilePreviewProps) {
  const type = getAttachmentType(file.type);
  const isUploading = uploadProgress !== undefined && uploadProgress < 100;
  const isUploaded = uploadProgress === 100;
  const extension = getFileExtension(file.name);
  const fileKey = `${file.name}-${file.size}-${file.lastModified}`;

  const isLoadingThumbnail = type === 'image' && !thumbnailUrl && isGeneratingThumbnail;
  const isAudio = type === 'audio';
  const isVideo = type === 'video';

  const cardSizeClass = isAudio ? 'w-40 h-20' : isVideo ? 'w-50 h-36' : 'w-20 h-20';

  const handleOpenLightbox = () => {
    const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const isMarkdown = file.name.toLowerCase().endsWith('.md');
    const isPPTX = file.type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
                  file.type === 'application/vnd.ms-powerpoint' ||
                  file.name.toLowerCase().endsWith('.pptx') ||
                  file.name.toLowerCase().endsWith('.ppt');
    const isText = file.type.startsWith('text/') ||
                  file.name.toLowerCase().endsWith('.txt') ||
                  file.name.toLowerCase().endsWith('.sh') ||
                  file.name.toLowerCase().endsWith('.js') ||
                  file.name.toLowerCase().endsWith('.ts') ||
                  file.name.toLowerCase().endsWith('.py');

    if (type === 'image') {
      onOpenLightbox(file, 'image');
    } else if (type === 'video') {
      onOpenLightbox(file, 'video');
    } else if (isPDF) {
      onOpenLightbox(file, 'pdf');
    } else if (isPPTX) {
      onOpenLightbox(file, 'pptx');
    } else if (isMarkdown) {
      onOpenLightbox(file, 'markdown');
    } else if (isText) {
      onOpenLightbox(file, 'text');
    }
  };

  return (
    <TooltipProvider key={`${file.name}-${index}`}>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <div className="relative group pt-3 pb-2">
            <div className={`relative flex ${isAudio ? 'flex-row items-center justify-between px-3' : isVideo ? 'flex-col items-center justify-center' : 'flex-col items-center justify-center'} ${cardSizeClass} bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-600 rounded-lg hover:border-blue-400 dark:hover:border-blue-500 transition-all duration-200 hover:shadow-md dark:hover:shadow-blue-500/20 ${
              isUploading ? 'border-blue-400 dark:border-blue-500' : ''
            } ${isUploaded ? 'border-green-400 dark:border-green-500' : ''} ${
              isAudio ? 'bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30 border-green-400 dark:border-green-500' : ''
            } ${
              isVideo ? 'bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-900/30 dark:to-violet-900/30 border-purple-400 dark:border-purple-500 p-0' : ''
            }`}>

              {type === 'image' ? (
                <ImageViewer
                  file={file}
                  fileKey={fileKey}
                  thumbnailUrl={thumbnailUrl}
                  fileUrl={fileUrl}
                  isLoadingThumbnail={isLoadingThumbnail}
                  isUploading={isUploading}
                  isUploaded={isUploaded}
                  progress={uploadProgress}
                  extension={extension}
                  onOpenLightbox={handleOpenLightbox}
                />
              ) : isVideo ? (
                <VideoViewer
                  file={file}
                  fileKey={fileKey}
                  fileUrl={fileUrl}
                  isUploading={isUploading}
                  isUploaded={isUploaded}
                  progress={uploadProgress}
                  onOpenLightbox={handleOpenLightbox}
                />
              ) : isAudio ? (
                <AudioFilePreview
                  file={file}
                  extension={extension}
                  isUploading={isUploading}
                  isUploaded={isUploaded}
                  progress={uploadProgress}
                />
              ) : (
                <DocumentViewer
                  file={file}
                  isUploading={isUploading}
                  isUploaded={isUploaded}
                  progress={uploadProgress}
                  extension={extension}
                  icon={getFileIcon(file)}
                  onOpenLightbox={handleOpenLightbox}
                />
              )}

              {/* Remove button */}
              {!disabled && !isUploading && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(index);
                  }}
                  className="!absolute !-top-0.5 !-right-0.5 !w-[22px] !h-[22px] !min-w-[22px] !min-h-[22px] !max-w-[22px] !max-h-[22px] sm:!w-[29px] sm:!h-[29px] sm:!min-w-[29px] sm:!min-h-[29px] sm:!max-w-[29px] sm:!max-h-[29px] bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-md !z-[100] !p-0"
                >
                  <X className="!w-[11px] !h-[11px] sm:!w-[14px] sm:!h-[14px]" />
                </button>
              )}
            </div>

            {/* Size badge */}
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 bg-gray-700 dark:bg-gray-600 text-white text-[9px] px-1.5 py-0.5 rounded-full whitespace-nowrap shadow-sm">
              {formatFileSize(file.size)}
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="text-sm">
            <div className="font-medium truncate">{file.name}</div>
            <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              {formatFileSize(file.size)} • {getAttachmentType(file.type)}
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});
