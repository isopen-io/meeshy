/**
 * Composant pour afficher les attachments dans les zones de reply avec previews interactifs
 * - Audio: Player complet (mini version)
 * - Vidéo: Player complet (mini version)
 * - Images: Miniatures cliquables avec lightbox
 * - PDF: Icône cliquable avec lightbox
 * - Autres: Icône cliquable avec lightbox
 */

'use client';

import React, { useState, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { FileImage, FileText, Music, Video, File, Maximize } from 'lucide-react';
import { Attachment, getAttachmentType } from '@meeshy/shared/types/attachment';
import { buildAttachmentsUrls } from '@/utils/attachment-url';
import { cn } from '@/lib/utils';
import { ImageLightbox } from './ImageLightbox';
import { CompactAudioPlayer } from '../audio/SimpleAudioPlayer';
import { CompactVideoPlayer } from '../video/VideoPlayer';
import type { UploadedAttachmentResponse } from '@meeshy/shared/types/attachment';

// Chargement dynamique des lightbox pour éviter les erreurs SSR
const PDFLightboxSimple = dynamic(
  () => import('../pdf/PDFLightboxSimple').then((mod) => mod.PDFLightboxSimple),
  { ssr: false }
);

const TextLightbox = dynamic(
  () => import('../text/TextLightbox').then((mod) => mod.TextLightbox),
  { ssr: false }
);

const VideoLightbox = dynamic(
  () => import('../video/VideoLightbox').then((mod) => mod.VideoLightbox),
  { ssr: false }
);

/**
 * Valide qu'une URL est sécurisée pour éviter les attaques XSS
 */
const isValidUrl = (url: string | null | undefined): boolean => {
  if (!url) return false;
  try {
    const parsed = new URL(url, window.location.origin);
    return ['http:', 'https:', 'data:'].includes(parsed.protocol);
  } catch {
    return false;
  }
};

interface AttachmentPreviewReplyProps {
  attachments: readonly Attachment[] | Attachment[];
  className?: string;
  isOwnMessage?: boolean;
}

export const AttachmentPreviewReply = React.memo(function AttachmentPreviewReply({
  attachments,
  className,
  isOwnMessage = false
}: AttachmentPreviewReplyProps) {
  // États pour les lightbox
  const [imageLiboxOpen, setImageLightboxOpen] = useState(false);
  const [imageLightboxIndex, setImageLightboxIndex] = useState(0);
  const [videoLightboxOpen, setVideoLightboxOpen] = useState(false);
  const [videoLightboxIndex, setVideoLightboxIndex] = useState(0);
  const [pdfLightboxOpen, setPdfLightboxOpen] = useState(false);
  const [selectedPdf, setSelectedPdf] = useState<UploadedAttachmentResponse | null>(null);
  const [textLightboxOpen, setTextLightboxOpen] = useState(false);
  const [selectedText, setSelectedText] = useState<UploadedAttachmentResponse | null>(null);

  // Construire les URLs complètes des attachments
  const attachmentsWithUrls = useMemo(() => {
    return buildAttachmentsUrls([...attachments]);
  }, [attachments]);

  // Séparer les attachments par type
  const { images, audios, videos, pdfs, texts, others } = useMemo(() => {
    const separated = {
      images: [] as UploadedAttachmentResponse[],
      audios: [] as UploadedAttachmentResponse[],
      videos: [] as UploadedAttachmentResponse[],
      pdfs: [] as UploadedAttachmentResponse[],
      texts: [] as UploadedAttachmentResponse[],
      others: [] as UploadedAttachmentResponse[]
    };

    attachmentsWithUrls.forEach(attachment => {
      const type = getAttachmentType(attachment.mimeType);

      if (type === 'image') {
        separated.images.push(attachment);
      } else if (type === 'audio') {
        separated.audios.push(attachment);
      } else if (type === 'video') {
        separated.videos.push(attachment);
      } else if (attachment.mimeType === 'application/pdf') {
        separated.pdfs.push(attachment);
      } else if (type === 'text' || type === 'code') {
        separated.texts.push(attachment);
      } else {
        separated.others.push(attachment);
      }
    });

    return separated;
  }, [attachmentsWithUrls]);

  // Handler pour ouvrir lightbox d'image
  const handleImageClick = useCallback((index: number) => (e: React.MouseEvent) => {
    e.stopPropagation();
    setImageLightboxIndex(index);
    setImageLightboxOpen(true);
  }, []);

  // Handler pour ouvrir lightbox PDF
  const handlePdfClick = useCallback((pdf: UploadedAttachmentResponse) => (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedPdf(pdf);
    setPdfLightboxOpen(true);
  }, []);

  // Handler pour ouvrir lightbox texte
  const handleTextClick = useCallback((text: UploadedAttachmentResponse) => (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedText(text);
    setTextLightboxOpen(true);
  }, []);

  // Handler pour erreur de chargement d'image
  const handleImageError = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    img.style.display = 'none';
    const parent = img.parentElement;
    if (parent) {
      parent.classList.add('bg-gray-100', 'dark:bg-gray-700', 'flex', 'items-center', 'justify-center');
      const icon = document.createElement('div');
      icon.innerHTML = '📷';
      icon.className = 'text-2xl opacity-50';
      parent.appendChild(icon);
    }
  }, []);

  if (!attachmentsWithUrls.length) {
    return null;
  }

  return (
    <>
      <div
        className={cn("flex flex-wrap items-center gap-2 mt-1.5", className)}
        role="list"
        aria-label={`${attachments.length} pièce${attachments.length > 1 ? 's' : ''} jointe${attachments.length > 1 ? 's' : ''}`}
      >
        {/* Images - Miniatures cliquables */}
        {images.map((attachment, index) => {
          const safeFileUrl = isValidUrl(attachment.fileUrl) ? attachment.fileUrl : '';
          if (!safeFileUrl) return null;

          return (
            <div
              key={attachment.id}
              className="relative rounded overflow-hidden border border-white/20 dark:border-gray-600/20 flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
              style={{ width: 60, height: 60 }}
              onClick={handleImageClick(index)}
              role="button"
              tabIndex={0}
              aria-label={`Ouvrir l'image ${attachment.originalName || attachment.fileName}`}
            >
              <img
                src={safeFileUrl}
                alt={`Aperçu de l'image ${attachment.originalName || attachment.fileName}`}
                className="w-full h-full object-cover"
                onError={handleImageError}
                loading="lazy"
                role="img"
              />
            </div>
          );
        })}

        {/* Audio - Player compact */}
        {audios.map(attachment => (
          <div
            key={attachment.id}
            onClick={(e) => e.stopPropagation()}
            role="listitem"
          >
            <CompactAudioPlayer
              attachment={attachment}
              className="max-w-full"
            />
          </div>
        ))}

        {/* Vidéo - Player compact avec bouton lightbox */}
        {videos.map((attachment, index) => (
          <div
            key={attachment.id}
            onClick={(e) => e.stopPropagation()}
            role="listitem"
            className="flex items-center gap-2"
          >
            <CompactVideoPlayer
              attachment={attachment}
              className="flex-1"
            />
            {/* Bouton pour ouvrir en plein écran */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setVideoLightboxIndex(index);
                setVideoLightboxOpen(true);
              }}
              className="w-10 h-10 rounded-full bg-purple-100 hover:bg-purple-200 dark:bg-purple-900/30 dark:hover:bg-purple-800/40 flex items-center justify-center transition-colors flex-shrink-0"
              title="Ouvrir en plein écran"
              aria-label={`Ouvrir la vidéo ${attachment.originalName || attachment.fileName} en plein écran`}
            >
              <Maximize className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </button>
          </div>
        ))}

        {/* PDF - Icône cliquable */}
        {pdfs.map(attachment => (
          <div
            key={attachment.id}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded cursor-pointer hover:opacity-80 transition-opacity",
              isOwnMessage
                ? "bg-white/10 text-white/90"
                : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
            )}
            onClick={handlePdfClick(attachment)}
            role="button"
            tabIndex={0}
            aria-label={`Ouvrir le PDF : ${attachment.fileName}`}
          >
            <FileText className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
            <span className="text-sm font-medium truncate max-w-[150px]">
              {attachment.originalName || attachment.fileName}
            </span>
          </div>
        ))}

        {/* Texte/Code - Icône cliquable */}
        {texts.map(attachment => (
          <div
            key={attachment.id}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded cursor-pointer hover:opacity-80 transition-opacity",
              isOwnMessage
                ? "bg-white/10 text-white/90"
                : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
            )}
            onClick={handleTextClick(attachment)}
            role="button"
            tabIndex={0}
            aria-label={`Ouvrir le fichier texte : ${attachment.fileName}`}
          >
            <FileText className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
            <span className="text-sm font-medium truncate max-w-[150px]">
              {attachment.originalName || attachment.fileName}
            </span>
          </div>
        ))}

        {/* Autres fichiers - Icône avec type */}
        {others.map(attachment => {
          const type = getAttachmentType(attachment.mimeType);
          let Icon = File;

          if (type === 'video') Icon = Video;
          else if (type === 'audio') Icon = Music;
          else if (type === 'image') Icon = FileImage;

          return (
            <div
              key={attachment.id}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded",
                isOwnMessage
                  ? "bg-white/10 text-white/90"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
              )}
              role="listitem"
            >
              <Icon className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
              <span className="text-sm font-medium truncate max-w-[150px]">
                {attachment.originalName || attachment.fileName}
              </span>
            </div>
          );
        })}
      </div>

      {/* Lightbox pour images */}
      {images.length > 0 && (
        <ImageLightbox
          images={images}
          initialIndex={imageLightboxIndex}
          isOpen={imageLiboxOpen}
          onClose={() => setImageLightboxOpen(false)}
        />
      )}

      {/* Lightbox pour PDF */}
      {selectedPdf && (
        <PDFLightboxSimple
          attachment={selectedPdf}
          isOpen={pdfLightboxOpen}
          onClose={() => {
            setPdfLightboxOpen(false);
            setSelectedPdf(null);
          }}
        />
      )}

      {/* Lightbox pour texte */}
      {selectedText && (
        <TextLightbox
          attachment={selectedText}
          isOpen={textLightboxOpen}
          onClose={() => {
            setTextLightboxOpen(false);
            setSelectedText(null);
          }}
        />
      )}

      {/* Lightbox pour vidéos */}
      {videos.length > 0 && (
        <VideoLightbox
          videos={videos}
          initialIndex={videoLightboxIndex}
          isOpen={videoLightboxOpen}
          onClose={() => setVideoLightboxOpen(false)}
        />
      )}
    </>
  );
});
