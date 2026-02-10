/**
 * Composant pour afficher les attachments de type document
 * (PDF, PPTX, Markdown, Text)
 */

'use client';

import React, { useCallback } from 'react';
import { X } from 'lucide-react';
import { Attachment } from '@meeshy/shared/types/attachment';
import dynamic from 'next/dynamic';

// Dynamic imports pour les viewers lourds
const PDFViewerWrapper = dynamic(
  () => import('@/components/pdf/PDFViewerWrapper').then(mod => ({ default: mod.PDFViewerWrapper })),
  { ssr: false }
);

const PPTXViewer = dynamic(
  () => import('@/components/pptx/PPTXViewer').then(mod => ({ default: mod.PPTXViewer })),
  { ssr: false }
);

const MarkdownViewer = dynamic(
  () => import('@/components/markdown/MarkdownViewer').then(mod => ({ default: mod.MarkdownViewer })),
  { ssr: false }
);

const TextViewer = dynamic(
  () => import('@/components/text/TextViewer').then(mod => ({ default: mod.TextViewer })),
  { ssr: false }
);

export interface DocumentAttachmentProps {
  attachment: Attachment;
  canDelete: boolean;
  documentType: 'pdf' | 'pptx' | 'markdown' | 'text';
  onOpenLightbox: (attachment: Attachment) => void;
  onDeleteClick?: (attachment: Attachment) => void;
}

export const DocumentAttachment = React.memo(function DocumentAttachment({
  attachment,
  canDelete,
  documentType,
  onOpenLightbox,
  onDeleteClick,
}: DocumentAttachmentProps) {
  const handleOpenLightbox = useCallback(() => {
    onOpenLightbox(attachment);
  }, [attachment, onOpenLightbox]);

  const handleDelete = useCallback(() => {
    onDeleteClick?.(attachment);
  }, [attachment, onDeleteClick]);

  const documentAttachment = {
    id: attachment.id,
    messageId: attachment.messageId,
    fileName: attachment.fileName,
    originalName: attachment.originalName,
    mimeType: attachment.mimeType,
    fileSize: attachment.fileSize,
    fileUrl: attachment.fileUrl,
    thumbnailUrl: attachment.thumbnailUrl,
    uploadedBy: attachment.uploadedBy,
    isAnonymous: attachment.isAnonymous,
    createdAt: attachment.createdAt
  };

  if (documentType === 'pdf') {
    return (
      <PDFViewerWrapper
        attachment={documentAttachment as any}
        onOpenLightbox={handleOpenLightbox}
        onDelete={canDelete ? handleDelete : undefined}
        canDelete={canDelete}
      />
    );
  }

  if (documentType === 'pptx') {
    return (
      <PPTXViewer
        attachment={documentAttachment as any}
        onOpenLightbox={handleOpenLightbox}
        onDelete={canDelete ? handleDelete : undefined}
        canDelete={canDelete}
      />
    );
  }

  if (documentType === 'markdown') {
    return (
      <MarkdownViewer
        attachment={documentAttachment as any}
        onOpenLightbox={handleOpenLightbox}
        onDelete={canDelete ? handleDelete : undefined}
        canDelete={canDelete}
      />
    );
  }

  if (documentType === 'text') {
    return (
      <div className="relative">
        <TextViewer
          attachment={documentAttachment as any}
          onOpenLightbox={handleOpenLightbox}
        />
        {canDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDelete();
            }}
            className="absolute top-2 right-2 w-[43px] h-[43px] rounded-full bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700 text-white flex items-center justify-center transition-[background-color,opacity,box-shadow] shadow-md z-10 opacity-0 hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-red-500"
            title="Supprimer ce fichier texte"
            aria-label={`Supprimer le fichier ${attachment.originalName}`}
          >
            <X className="w-[22px] h-[22px]" />
          </button>
        )}
      </div>
    );
  }

  return null;
});
