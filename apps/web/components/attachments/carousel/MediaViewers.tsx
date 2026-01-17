/**
 * Composants pour afficher différents types de médias (image, vidéo, document)
 */

'use client';

import React from 'react';
import { Image, Loader2, CheckCircle, Maximize } from 'lucide-react';
import { getAttachmentType } from '@meeshy/shared/types/attachment';
import { CompactVideoPlayer } from '../../video/VideoPlayer';

interface ImageViewerProps {
  file: File;
  fileKey: string;
  thumbnailUrl?: string;
  fileUrl?: string;
  isLoadingThumbnail: boolean;
  isUploading: boolean;
  isUploaded: boolean;
  progress?: number;
  extension: string;
  onOpenLightbox: () => void;
}

export const ImageViewer = React.memo(function ImageViewer({
  file,
  fileKey,
  thumbnailUrl,
  fileUrl,
  isLoadingThumbnail,
  isUploading,
  isUploaded,
  progress,
  extension,
  onOpenLightbox,
}: ImageViewerProps) {
  return (
    <div
      className="absolute inset-0 rounded-lg overflow-hidden cursor-pointer hover:opacity-90 hover:scale-105 transition-all group-hover:ring-2 group-hover:ring-blue-400"
      onClick={(e) => {
        e.stopPropagation();
        onOpenLightbox();
      }}
      title="Cliquez pour voir en plein écran"
    >
      {thumbnailUrl || fileUrl ? (
        <img
          src={thumbnailUrl || fileUrl || ''}
          alt={file.name}
          className="w-full h-full object-contain"
          loading="lazy"
          decoding="async"
          onError={(e) => {
            console.error('Failed to load image:', file.name);
          }}
        />
      ) : isLoadingThumbnail ? (
        <div className="flex flex-col items-center gap-1">
          <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
          <div className="text-[9px] text-gray-500 dark:text-gray-400">
            Aperçu...
          </div>
        </div>
      ) : (
        <Image className="w-5 h-5 text-blue-500" />
      )}

      {/* Overlay with extension */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-1 py-0.5">
        <div className="text-white text-[10px] font-medium truncate">
          {extension.toUpperCase()}
        </div>
      </div>

      {/* Indicateur d'upload */}
      {isUploading && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg">
          <div className="text-center">
            <Loader2 className="w-4 h-4 text-white animate-spin mx-auto mb-1" />
            <div className="text-white text-[8px] font-medium">
              {Math.round(progress || 0)}%
            </div>
          </div>
        </div>
      )}

      {/* Indicateur d'upload terminé */}
      {isUploaded && (
        <div className="absolute top-1 right-1">
          <CheckCircle className="w-3 h-3 text-green-500 bg-white rounded-full" />
        </div>
      )}
    </div>
  );
});

interface VideoViewerProps {
  file: File;
  fileKey: string;
  fileUrl?: string;
  isUploading: boolean;
  isUploaded: boolean;
  progress?: number;
  onOpenLightbox: () => void;
}

export const VideoViewer = React.memo(function VideoViewer({
  file,
  fileKey,
  fileUrl,
  isUploading,
  isUploaded,
  progress,
  onOpenLightbox,
}: VideoViewerProps) {
  return (
    <>
      <div className="w-full h-full p-2 flex flex-col items-stretch justify-center gap-2">
        <CompactVideoPlayer
          attachment={{
            id: fileKey,
            fileUrl: fileUrl || URL.createObjectURL(file),
            fileName: file.name,
            originalName: file.name,
            mimeType: file.type,
            fileSize: file.size,
            duration: undefined,
            createdAt: new Date().toISOString(),
          } as any}
          className="w-full"
        />

        {/* Bouton pour ouvrir en lightbox */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpenLightbox();
          }}
          className="w-full py-1.5 px-3 rounded-md bg-purple-100 hover:bg-purple-200 dark:bg-purple-900/30 dark:hover:bg-purple-800/40 flex items-center justify-center gap-1.5 transition-all text-xs font-medium text-purple-700 dark:text-purple-300"
          title="Ouvrir en plein écran"
        >
          <Maximize className="w-3.5 h-3.5" />
          <span>Plein écran</span>
        </button>
      </div>

      {/* Indicateur d'upload */}
      {isUploading && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg z-10">
          <div className="text-center">
            <Loader2 className="w-4 h-4 text-white animate-spin mx-auto mb-1" />
            <div className="text-white text-[8px] font-medium">
              {Math.round(progress || 0)}%
            </div>
          </div>
        </div>
      )}

      {/* Indicateur d'upload terminé */}
      {isUploaded && (
        <div className="absolute top-1 right-1 z-10">
          <CheckCircle className="w-3 h-3 text-green-500 bg-white rounded-full" />
        </div>
      )}
    </>
  );
});

interface DocumentViewerProps {
  file: File;
  isUploading: boolean;
  isUploaded: boolean;
  progress?: number;
  extension: string;
  icon: React.ReactNode;
  onOpenLightbox: () => void;
}

export const DocumentViewer = React.memo(function DocumentViewer({
  file,
  isUploading,
  isUploaded,
  progress,
  extension,
  icon,
  onOpenLightbox,
}: DocumentViewerProps) {
  return (
    <>
      <div
        className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 cursor-pointer hover:opacity-90 transition-opacity"
        onClick={(e) => {
          e.stopPropagation();
          onOpenLightbox();
        }}
        title="Cliquez pour voir en plein écran"
      >
        {icon}
        <div className="text-[10px] font-medium text-gray-600 dark:text-gray-300">
          {extension.toUpperCase()}
        </div>
      </div>

      {/* Indicateur d'upload */}
      {isUploading && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg">
          <div className="text-center">
            <Loader2 className="w-4 h-4 text-white animate-spin mx-auto mb-1" />
            <div className="text-white text-[8px] font-medium">
              {Math.round(progress || 0)}%
            </div>
          </div>
        </div>
      )}

      {/* Indicateur d'upload terminé */}
      {isUploaded && (
        <div className="absolute top-1 right-1">
          <CheckCircle className="w-3 h-3 text-green-500 bg-white rounded-full" />
        </div>
      )}
    </>
  );
});
