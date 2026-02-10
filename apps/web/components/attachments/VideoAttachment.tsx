/**
 * Composant pour afficher un attachment vidéo
 */

'use client';

import React, { useCallback } from 'react';
import { X } from 'lucide-react';
import { Attachment } from '@meeshy/shared/types/attachment';
import { VideoPlayer } from '@/components/video/VideoPlayer';

export interface VideoAttachmentProps {
  attachment: Attachment;
  canDelete: boolean;
  onOpenLightbox: (attachment: Attachment) => void;
  onDeleteClick: (attachment: Attachment, event: React.MouseEvent) => void;
}

export const VideoAttachment = React.memo(function VideoAttachment({
  attachment,
  canDelete,
  onOpenLightbox,
  onDeleteClick,
}: VideoAttachmentProps) {
  const handleOpenLightbox = useCallback(() => {
    onOpenLightbox(attachment);
  }, [attachment, onOpenLightbox]);

  const handleDeleteClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onDeleteClick(attachment, e);
  }, [attachment, onDeleteClick]);

  const videoAttachment = {
    id: attachment.id,
    messageId: attachment.messageId,
    fileName: attachment.fileName,
    originalName: attachment.originalName,
    mimeType: attachment.mimeType,
    fileSize: attachment.fileSize,
    fileUrl: attachment.fileUrl,
    thumbnailUrl: attachment.thumbnailUrl,
    width: attachment.width,
    height: attachment.height,
    duration: attachment.duration,
    codec: attachment.codec,
    uploadedBy: attachment.uploadedBy,
    isAnonymous: attachment.isAnonymous,
    createdAt: attachment.createdAt
  };

  return (
    <div className="relative">
      <VideoPlayer
        attachment={videoAttachment as any}
        onOpenLightbox={handleOpenLightbox}
      />
      {canDelete && (
        <button
          onClick={handleDeleteClick}
          className="absolute top-2 right-2 w-[43px] h-[43px] rounded-full bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700 text-white flex items-center justify-center transition-[background-color,opacity,box-shadow] shadow-md z-10 opacity-0 hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-red-500"
          title="Supprimer cette vidéo"
          aria-label={`Supprimer la vidéo ${attachment.originalName}`}
        >
          <X className="w-[22px] h-[22px]" />
        </button>
      )}
    </div>
  );
});
