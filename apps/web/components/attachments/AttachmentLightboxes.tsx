/**
 * Composant pour grouper tous les lightbox d'attachments
 */

'use client';

import React from 'react';
import { Attachment } from '@meeshy/shared/types/attachment';
import dynamic from 'next/dynamic';

// Dynamic imports pour les lightbox lourds
const ImageLightbox = dynamic(
  () => import('./ImageLightbox').then(mod => ({ default: mod.ImageLightbox })),
  { ssr: false }
);

const VideoLightbox = dynamic(
  () => import('@/components/video/VideoLightbox').then(mod => ({ default: mod.VideoLightbox })),
  { ssr: false }
);

const PDFLightboxSimple = dynamic(
  () => import('@/components/pdf/PDFLightboxSimple').then(mod => ({ default: mod.PDFLightboxSimple })),
  { ssr: false }
);

const MarkdownLightbox = dynamic(
  () => import('@/components/markdown/MarkdownLightbox').then(mod => ({ default: mod.MarkdownLightbox })),
  { ssr: false }
);

const TextLightbox = dynamic(
  () => import('@/components/text/TextLightbox').then(mod => ({ default: mod.TextLightbox })),
  { ssr: false }
);

const PPTXLightbox = dynamic(
  () => import('@/components/pptx/PPTXLightbox').then(mod => ({ default: mod.PPTXLightbox })),
  { ssr: false }
);

export interface AttachmentLightboxesProps {
  imageAttachments: Attachment[];
  imageLightboxOpen: boolean;
  imageLightboxIndex: number;
  onImageLightboxClose: () => void;

  videoAttachments: Attachment[];
  videoLightboxOpen: boolean;
  videoLightboxIndex: number;
  onVideoLightboxClose: () => void;

  pdfLightboxAttachment: Attachment | null;
  pdfLightboxOpen: boolean;
  onPdfLightboxClose: () => void;

  markdownLightboxAttachment: Attachment | null;
  markdownLightboxOpen: boolean;
  onMarkdownLightboxClose: () => void;

  textLightboxAttachment: Attachment | null;
  textLightboxOpen: boolean;
  onTextLightboxClose: () => void;

  pptxLightboxAttachment: Attachment | null;
  pptxLightboxOpen: boolean;
  onPptxLightboxClose: () => void;
}

export const AttachmentLightboxes = React.memo(function AttachmentLightboxes({
  imageAttachments,
  imageLightboxOpen,
  imageLightboxIndex,
  onImageLightboxClose,
  videoAttachments,
  videoLightboxOpen,
  videoLightboxIndex,
  onVideoLightboxClose,
  pdfLightboxAttachment,
  pdfLightboxOpen,
  onPdfLightboxClose,
  markdownLightboxAttachment,
  markdownLightboxOpen,
  onMarkdownLightboxClose,
  textLightboxAttachment,
  textLightboxOpen,
  onTextLightboxClose,
  pptxLightboxAttachment,
  pptxLightboxOpen,
  onPptxLightboxClose,
}: AttachmentLightboxesProps) {
  return (
    <>
      <ImageLightbox
        images={imageAttachments}
        initialIndex={imageLightboxIndex}
        isOpen={imageLightboxOpen}
        onClose={onImageLightboxClose}
      />

      <VideoLightbox
        videos={videoAttachments}
        initialIndex={videoLightboxIndex}
        isOpen={videoLightboxOpen}
        onClose={onVideoLightboxClose}
      />

      <PDFLightboxSimple
        attachment={pdfLightboxAttachment as any}
        isOpen={pdfLightboxOpen}
        onClose={onPdfLightboxClose}
      />

      <MarkdownLightbox
        attachment={markdownLightboxAttachment as any}
        isOpen={markdownLightboxOpen}
        onClose={onMarkdownLightboxClose}
      />

      <TextLightbox
        attachment={textLightboxAttachment as any}
        isOpen={textLightboxOpen}
        onClose={onTextLightboxClose}
      />

      <PPTXLightbox
        attachment={pptxLightboxAttachment as any}
        isOpen={pptxLightboxOpen}
        onClose={onPptxLightboxClose}
      />
    </>
  );
});
