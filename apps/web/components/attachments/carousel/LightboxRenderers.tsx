/**
 * Composants pour rendre les différentes lightbox de manière dynamique
 */

'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { getAttachmentType } from '@meeshy/shared/types/attachment';
import { ImageLightbox } from '@/components/attachments/ImageLightbox';
import { VideoLightbox } from '@/components/video/VideoLightbox';

// Chargement dynamique des lightbox pour éviter les erreurs SSR
const PDFLightboxSimple = dynamic(
  () => import('@/components/pdf/PDFLightboxSimple').then(mod => mod.PDFLightboxSimple),
  { ssr: false }
);

const TextLightbox = dynamic(
  () => import('@/components/text/TextLightbox').then(mod => mod.TextLightbox),
  { ssr: false }
);

const PPTXLightbox = dynamic(
  () => import('@/components/pptx/PPTXLightbox').then(mod => mod.PPTXLightbox),
  { ssr: false }
);

const MarkdownLightbox = dynamic(
  () => import('@/components/markdown/MarkdownLightbox').then(mod => mod.MarkdownLightbox),
  { ssr: false }
);

interface LightboxRenderersProps {
  files: File[];
  fileUrls: Map<string, string>;
  isMounted: boolean;
  imageLightboxIndex: number;
  videoLightboxIndex: number;
  pdfLightboxFile: File | null;
  textLightboxFile: File | null;
  pptxLightboxFile: File | null;
  markdownLightboxFile: File | null;
  onCloseImageLightbox: () => void;
  onCloseVideoLightbox: () => void;
  onClosePdfLightbox: () => void;
  onCloseTextLightbox: () => void;
  onClosePptxLightbox: () => void;
  onCloseMarkdownLightbox: () => void;
}

export function LightboxRenderers({
  files,
  fileUrls,
  isMounted,
  imageLightboxIndex,
  videoLightboxIndex,
  pdfLightboxFile,
  textLightboxFile,
  pptxLightboxFile,
  markdownLightboxFile,
  onCloseImageLightbox,
  onCloseVideoLightbox,
  onClosePdfLightbox,
  onCloseTextLightbox,
  onClosePptxLightbox,
  onCloseMarkdownLightbox,
}: LightboxRenderersProps) {
  const createAttachment = (file: File) => {
    const fileKey = `${file.name}-${file.size}-${file.lastModified}`;
    return {
      id: fileKey,
      fileUrl: fileUrls.get(fileKey) || URL.createObjectURL(file),
      originalName: file.name,
      mimeType: file.type,
      fileSize: file.size,
      createdAt: new Date().toISOString(),
    };
  };

  return (
    <>
      {/* Lightbox pour les images */}
      {imageLightboxIndex >= 0 && (() => {
        const imageFiles = files.filter(f => getAttachmentType(f.type) === 'image');
        const imageAttachments = imageFiles.map(file => createAttachment(file));

        return (
          <ImageLightbox
            images={imageAttachments as any}
            initialIndex={imageLightboxIndex}
            isOpen={true}
            onClose={onCloseImageLightbox}
          />
        );
      })()}

      {/* Lightbox pour les vidéos */}
      {videoLightboxIndex >= 0 && (() => {
        const videoFiles = files.filter(f => getAttachmentType(f.type) === 'video');
        const videoAttachments = videoFiles.map(file => createAttachment(file));

        return (
          <VideoLightbox
            videos={videoAttachments as any}
            initialIndex={videoLightboxIndex}
            isOpen={true}
            onClose={onCloseVideoLightbox}
          />
        );
      })()}

      {/* Lightbox pour les PDFs */}
      {isMounted && pdfLightboxFile && (
        <PDFLightboxSimple
          attachment={createAttachment(pdfLightboxFile) as any}
          isOpen={true}
          onClose={onClosePdfLightbox}
        />
      )}

      {/* Lightbox pour les fichiers texte */}
      {isMounted && textLightboxFile && (
        <TextLightbox
          attachment={createAttachment(textLightboxFile) as any}
          isOpen={true}
          onClose={onCloseTextLightbox}
        />
      )}

      {/* Lightbox pour les fichiers PPTX */}
      {isMounted && pptxLightboxFile && (
        <PPTXLightbox
          attachment={createAttachment(pptxLightboxFile) as any}
          isOpen={true}
          onClose={onClosePptxLightbox}
        />
      )}

      {/* Lightbox pour les fichiers Markdown */}
      {isMounted && markdownLightboxFile && (
        <MarkdownLightbox
          attachment={createAttachment(markdownLightboxFile) as any}
          isOpen={true}
          onClose={onCloseMarkdownLightbox}
        />
      )}
    </>
  );
}
