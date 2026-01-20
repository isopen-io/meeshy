/**
 * Composant principal pour afficher les attachments dans un message
 * Refactorisé selon le principe de responsabilité unique
 */

'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { Grid3X3, ChevronRight } from 'lucide-react';
import { Attachment } from '@meeshy/shared/types/attachment';
import { Button } from '../ui/button';
import { useI18n } from '@/hooks/useI18n';
import { buildAttachmentsUrls } from '@/utils/attachment-url';
import { useAttachmentLightbox } from './hooks/useAttachmentLightbox';
import { useAttachmentDeletion } from './hooks/useAttachmentDeletion';
import { useResponsiveDetection } from './hooks/useResponsiveDetection';
import { separateAttachmentsByType } from './utils/attachmentFilters';
import { AttachmentGridLayout } from './AttachmentGridLayout';
import { ImageAttachment } from './ImageAttachment';
import { VideoAttachment } from './VideoAttachment';
import { AudioAttachment } from './AudioAttachment';
import { DocumentAttachment } from './DocumentAttachment';
import { FileAttachment } from './FileAttachment';
import { AttachmentDeleteDialog } from './AttachmentDeleteDialog';
import { AttachmentLightboxes } from './AttachmentLightboxes';

interface MessageAttachmentsProps {
  attachments: Attachment[];
  onImageClick?: (attachmentId: string) => void;
  currentUserId?: string;
  token?: string;
  onAttachmentDeleted?: (attachmentId: string) => void;
  isOwnMessage?: boolean;
}

export const MessageAttachments = React.memo(function MessageAttachments({
  attachments,
  onImageClick,
  currentUserId,
  token,
  onAttachmentDeleted,
  isOwnMessage = false
}: MessageAttachmentsProps) {

  const [isExpanded, setIsExpanded] = useState(false);
  const { t } = useI18n('common');
  const { isMobile } = useResponsiveDetection();

  const lightbox = useAttachmentLightbox();
  const deletion = useAttachmentDeletion({ token, onAttachmentDeleted });

  const attachmentsWithUrls = useMemo(() => {
    return buildAttachmentsUrls(attachments);
  }, [attachments]);

  const attachmentsByType = useMemo(() => {
    return separateAttachmentsByType(attachmentsWithUrls);
  }, [attachmentsWithUrls]);

  const multiRowThreshold = 10;
  const shouldShowExpandButton = attachmentsWithUrls.length > multiRowThreshold;

  const handleImageClick = useCallback((attachment: Attachment) => {
    const imageIndex = attachmentsByType.images.findIndex(img => img.id === attachment.id);
    lightbox.openImageLightbox(imageIndex);
  }, [attachmentsByType.images, lightbox]);

  const handleVideoLightbox = useCallback((attachment: Attachment) => {
    const videoIndex = attachmentsByType.videos.findIndex(vid => vid.id === attachment.id);
    lightbox.openVideoLightbox(videoIndex);
  }, [attachmentsByType.videos, lightbox]);

  if (!attachmentsWithUrls || attachmentsWithUrls.length === 0) return null;

  const renderImageAttachments = () => {
    if (attachmentsByType.images.length === 0) return null;

    return (
      <AttachmentGridLayout
        attachmentCount={attachmentsByType.images.length}
        isOwnMessage={isOwnMessage}
        className={
          attachmentsByType.images.length > 4
            ? 'overflow-y-auto max-h-96 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent'
            : ''
        }
      >
        {attachmentsByType.images.map((attachment) => (
          <ImageAttachment
            key={attachment.id}
            attachment={attachment}
            canDelete={currentUserId === attachment.uploadedBy}
            imageCount={attachmentsByType.images.length}
            isMobile={isMobile}
            isOwnMessage={isOwnMessage}
            onImageClick={handleImageClick}
            onDeleteClick={deletion.handleOpenDeleteConfirm}
          />
        ))}
      </AttachmentGridLayout>
    );
  };

  const renderAudioAttachments = () => {
    if (attachmentsByType.audios.length === 0) return null;

    return (
      <div className={attachmentsByType.audios.length > 1 ? 'grid grid-cols-1 gap-2 w-full' : 'flex flex-col gap-1 w-full'}>
        {attachmentsByType.audios.map((attachment) => (
          <AudioAttachment
            key={attachment.id}
            attachment={attachment}
            messageId={attachment.messageId}
          />
        ))}
      </div>
    );
  };

  const renderVideoAttachments = () => {
    if (attachmentsByType.videos.length === 0) return null;

    return (
      <div className="flex flex-col gap-2 w-full min-w-0">
        {attachmentsByType.videos.map((attachment) => (
          <VideoAttachment
            key={attachment.id}
            attachment={attachment}
            canDelete={currentUserId === attachment.uploadedBy}
            onOpenLightbox={handleVideoLightbox}
            onDeleteClick={deletion.handleOpenDeleteConfirm}
          />
        ))}
      </div>
    );
  };

  const renderDocumentAttachments = (
    documents: Attachment[],
    documentType: 'pdf' | 'pptx' | 'markdown' | 'text',
    onOpenLightbox: (attachment: Attachment) => void
  ) => {
    if (documents.length === 0) return null;

    return (
      <div className="flex flex-col gap-2 w-full min-w-0">
        {documents.map((attachment) => (
          <DocumentAttachment
            key={attachment.id}
            attachment={attachment}
            canDelete={currentUserId === attachment.uploadedBy}
            documentType={documentType}
            onOpenLightbox={onOpenLightbox}
            onDeleteClick={deletion.handleOpenDeleteConfirm}
          />
        ))}
      </div>
    );
  };

  const renderOtherAttachments = () => {
    if (attachmentsByType.others.length === 0) return null;

    return (
      <div className="flex flex-wrap gap-1">
        {attachmentsByType.others.map((attachment) => (
          <FileAttachment
            key={attachment.id}
            attachment={attachment}
            canDelete={currentUserId === attachment.uploadedBy}
            isMobile={isMobile}
            onDeleteClick={deletion.handleOpenDeleteConfirm}
          />
        ))}
      </div>
    );
  };

  return (
    <>
      <div className="mt-2 flex flex-col gap-2 w-full max-w-full min-w-0 overflow-hidden">
        {renderImageAttachments()}
        {renderAudioAttachments()}
        {renderVideoAttachments()}
        {renderDocumentAttachments(attachmentsByType.pdfs, 'pdf', lightbox.openPdfLightbox)}
        {renderDocumentAttachments(attachmentsByType.pptxs, 'pptx', lightbox.openPptxLightbox)}
        {renderDocumentAttachments(attachmentsByType.markdowns, 'markdown', lightbox.openMarkdownLightbox)}
        {renderDocumentAttachments(attachmentsByType.texts, 'text', lightbox.openTextLightbox)}
        {renderOtherAttachments()}

        {shouldShowExpandButton && !isExpanded && (
          <div className="flex flex-wrap gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(true)}
              className="flex-shrink-0 h-14 w-14 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 border-2 border-dashed border-gray-300 dark:border-gray-500 rounded-lg"
            >
              <div className="flex flex-col items-center gap-1">
                <Grid3X3 className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                <span className="text-[9px] text-gray-500 dark:text-gray-400 font-medium">
                  +{attachmentsWithUrls.length - multiRowThreshold}
                </span>
              </div>
            </Button>
          </div>
        )}
      </div>

      {isExpanded && shouldShowExpandButton && (
        <div className="mt-2 flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(false)}
            className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          >
            <ChevronRight className="w-3 h-3 mr-1 rotate-90" />
            {t('showLess')}
          </Button>
        </div>
      )}

      <AttachmentLightboxes
        imageAttachments={attachmentsByType.images}
        imageLightboxOpen={lightbox.imageLightbox.isOpen}
        imageLightboxIndex={lightbox.imageLightbox.index}
        onImageLightboxClose={lightbox.closeImageLightbox}
        videoAttachments={attachmentsByType.videos}
        videoLightboxOpen={lightbox.videoLightbox.isOpen}
        videoLightboxIndex={lightbox.videoLightbox.index}
        onVideoLightboxClose={lightbox.closeVideoLightbox}
        pdfLightboxAttachment={lightbox.pdfLightbox.attachment}
        pdfLightboxOpen={lightbox.pdfLightbox.isOpen}
        onPdfLightboxClose={lightbox.closePdfLightbox}
        markdownLightboxAttachment={lightbox.markdownLightbox.attachment}
        markdownLightboxOpen={lightbox.markdownLightbox.isOpen}
        onMarkdownLightboxClose={lightbox.closeMarkdownLightbox}
        textLightboxAttachment={lightbox.textLightbox.attachment}
        textLightboxOpen={lightbox.textLightbox.isOpen}
        onTextLightboxClose={lightbox.closeTextLightbox}
        pptxLightboxAttachment={lightbox.pptxLightbox.attachment}
        pptxLightboxOpen={lightbox.pptxLightbox.isOpen}
        onPptxLightboxClose={lightbox.closePptxLightbox}
      />

      <AttachmentDeleteDialog
        attachment={deletion.attachmentToDelete}
        isDeleting={deletion.isDeleting}
        onConfirm={deletion.handleDeleteConfirm}
        onCancel={deletion.handleDeleteCancel}
      />
    </>
  );
});
