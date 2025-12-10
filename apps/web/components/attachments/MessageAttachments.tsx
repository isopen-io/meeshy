/**
 * Composant pour afficher les attachments dans un message reçu
 * Optimisé pour mobile avec affichage adaptatif
 */

'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { Download, File, Image as ImageIcon, FileText, Video, Music, ChevronRight, Grid3X3, X } from 'lucide-react';
import { Attachment, formatFileSize, getAttachmentType } from '@meeshy/shared/types/attachment';
import { SimpleAudioPlayer } from '@/components/audio/SimpleAudioPlayer';
import { VideoPlayer } from '@/components/video/VideoPlayer';
import { VideoLightbox } from '@/components/video/VideoLightbox';
import { PDFViewerWrapper } from '@/components/pdf/PDFViewerWrapper';
import { PDFLightboxSimple } from '@/components/pdf/PDFLightboxSimple';
import { MarkdownViewer } from '@/components/markdown/MarkdownViewer';
import { MarkdownLightbox } from '@/components/markdown/MarkdownLightbox';
import { TextViewer } from '@/components/text/TextViewer';
import { TextLightbox } from '@/components/text/TextLightbox';
import { PPTXViewer } from '@/components/pptx/PPTXViewer';
import { PPTXLightbox } from '@/components/pptx/PPTXLightbox';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { useI18n } from '@/hooks/useI18n';
import { AttachmentService } from '@/services/attachmentService';
import { toast } from 'sonner';
import { ImageLightbox } from './ImageLightbox';
import { buildAttachmentsUrls } from '@/utils/attachment-url';

interface MessageAttachmentsProps {
  attachments: Attachment[];
  onImageClick?: (attachmentId: string) => void;
  /**
   * ID de l'utilisateur courant (pour vérifier les permissions)
   */
  currentUserId?: string;
  /**
   * Token d'authentification
   */
  token?: string;
  /**
   * Callback appelé après suppression d'un attachment
   */
  onAttachmentDeleted?: (attachmentId: string) => void;
  /**
   * Indique si c'est le message de l'utilisateur courant (pour l'alignement)
   */
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
  const [isMobile, setIsMobile] = useState(false);
  const [attachmentToDelete, setAttachmentToDelete] = useState<Attachment | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImageIndex, setLightboxImageIndex] = useState(0);
  const [videoLightboxOpen, setVideoLightboxOpen] = useState(false);
  const [videoLightboxIndex, setVideoLightboxIndex] = useState(0);
  const [pdfLightboxOpen, setPdfLightboxOpen] = useState(false);
  const [pdfLightboxAttachment, setPdfLightboxAttachment] = useState<Attachment | null>(null);
  const [markdownLightboxOpen, setMarkdownLightboxOpen] = useState(false);
  const [markdownLightboxAttachment, setMarkdownLightboxAttachment] = useState<Attachment | null>(null);
  const [textLightboxOpen, setTextLightboxOpen] = useState(false);
  const [textLightboxAttachment, setTextLightboxAttachment] = useState<Attachment | null>(null);
  const [pptxLightboxOpen, setPptxLightboxOpen] = useState(false);
  const [pptxLightboxAttachment, setPptxLightboxAttachment] = useState<Attachment | null>(null);
  const { t } = useI18n('common');

  // Construire les URLs complètes des attachments à partir des chemins relatifs
  // Cela permet au frontend de s'adapter dynamiquement au domaine (localhost, IP locale, production)
  const attachmentsWithUrls = useMemo(() => {
    return buildAttachmentsUrls(attachments);
  }, [attachments]);

  // Handler pour ouvrir la confirmation de suppression
  const handleOpenDeleteConfirm = useCallback((attachment: Attachment, event?: React.MouseEvent) => {
    // Empêcher le clic normal si event existe
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    setAttachmentToDelete(attachment);
  }, []);

  // Handler pour confirmer la suppression
  const handleDeleteConfirm = useCallback(async () => {
    if (!attachmentToDelete || !token) return;

    setIsDeleting(true);
    try {
      await AttachmentService.deleteAttachment(attachmentToDelete.id, token);
      onAttachmentDeleted?.(attachmentToDelete.id);
      toast.success('Fichier supprimé avec succès');
      setAttachmentToDelete(null);
    } catch (error) {
      console.error('Erreur suppression attachment:', error);
      toast.error('Impossible de supprimer le fichier');
    } finally {
      setIsDeleting(false);
    }
  }, [attachmentToDelete, token, onAttachmentDeleted]);

  // Handler pour annuler la suppression
  const handleDeleteCancel = useCallback(() => {
    setAttachmentToDelete(null);
  }, []);

  // Détecter si on est sur mobile
  React.useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);


  if (!attachmentsWithUrls || attachmentsWithUrls.length === 0) return null;

  // Séparer les images, vidéos, audios, PDFs, PPTX, markdown, texte et autres types
  const imageAttachments = attachmentsWithUrls.filter(att => getAttachmentType(att.mimeType, att.originalName) === 'image');
  const videoAttachments = attachmentsWithUrls.filter(att => getAttachmentType(att.mimeType, att.originalName) === 'video');
  const audioAttachments = attachmentsWithUrls.filter(att => getAttachmentType(att.mimeType, att.originalName) === 'audio');
  const pdfAttachments = attachmentsWithUrls.filter(att => att.mimeType === 'application/pdf');
  const pptxAttachments = attachmentsWithUrls.filter(att =>
    att.mimeType === 'application/vnd.ms-powerpoint' ||
    att.mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
    att.originalName.toLowerCase().endsWith('.ppt') ||
    att.originalName.toLowerCase().endsWith('.pptx')
  );
  const markdownAttachments = attachmentsWithUrls.filter(att =>
    att.mimeType === 'text/markdown' ||
    att.mimeType === 'text/x-markdown' ||
    att.originalName.toLowerCase().endsWith('.md')
  );
  const textAttachments = attachmentsWithUrls.filter(att => {
    const type = getAttachmentType(att.mimeType, att.originalName);
    return (type === 'text' || type === 'code') &&
           att.mimeType !== 'text/markdown' &&
           att.mimeType !== 'text/x-markdown' &&
           !att.originalName.toLowerCase().endsWith('.md');
  });
  const otherAttachments = attachmentsWithUrls.filter(att => {
    const type = getAttachmentType(att.mimeType, att.originalName);
    const isPdf = att.mimeType === 'application/pdf';
    const isPptx = att.mimeType === 'application/vnd.ms-powerpoint' ||
                   att.mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
                   att.originalName.toLowerCase().endsWith('.ppt') ||
                   att.originalName.toLowerCase().endsWith('.pptx');
    const isMarkdown = att.mimeType === 'text/markdown' ||
                      att.mimeType === 'text/x-markdown' ||
                      att.originalName.toLowerCase().endsWith('.md');
    const isText = (type === 'text' || type === 'code') && !isMarkdown;
    return type !== 'image' && type !== 'video' && type !== 'audio' && !isPdf && !isPptx && !isMarkdown && !isText;
  });

  // Seuil pour passer en mode multi-lignes : 10+ attachments
  const multiRowThreshold = 10;
  const shouldUseMultiRow = attachmentsWithUrls.length >= multiRowThreshold;
  const shouldShowExpandButton = attachmentsWithUrls.length > multiRowThreshold;
  const displayedAttachments = isExpanded || !shouldShowExpandButton
    ? attachmentsWithUrls
    : attachmentsWithUrls.slice(0, multiRowThreshold);

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

  const renderAttachment = (attachment: Attachment, index: number) => {
    const type = getAttachmentType(attachment.mimeType, attachment.originalName);
    const extension = getExtension(attachment.originalName);

    // Vérifier si l'utilisateur peut supprimer cet attachment
    const canDelete = currentUserId === attachment.uploadedBy;

    // Image attachment - miniature cliquable
    if (type === 'image') {
      // Handler pour ouvrir la confirmation de suppression
      const handleDeleteClick = (event: React.MouseEvent) => {
        handleOpenDeleteConfirm(attachment, event);
      };

      // Handler pour ouvrir le lightbox immédiatement
      const handleImageClick = (event: React.MouseEvent) => {
        // Toujours ouvrir le lightbox immédiatement (un seul clic)
        const imageIndex = imageAttachments.findIndex(img => img.id === attachment.id);
        setLightboxImageIndex(imageIndex);
        setLightboxOpen(true);
      };

      // Déterminer la taille d'affichage selon le nombre d'images
      // Responsive: les images s'adaptent à la largeur disponible
      let sizeClasses = '';
      let aspectRatioClass = '';

      if (imageAttachments.length === 1 || imageAttachments.length === 2) {
        // 1-2 images: afficher chaque image à sa taille naturelle
        sizeClasses = ''; // Pas de contrainte de taille
        aspectRatioClass = ''; // Pas de ratio forcé
      } else if (imageAttachments.length <= 4) {
        // 3-4 images: grid 2x2, taille responsive
        sizeClasses = isMobile
          ? 'w-full max-w-[45vw] h-auto max-h-[180px]' // Mobile: 45% viewport width, max 180px hauteur
          : 'w-full max-w-[200px] h-auto max-h-[200px]'; // Desktop: max 200px
        aspectRatioClass = 'aspect-square'; // Garder un aspect carré
      } else {
        // 5+ images: miniatures, taille responsive
        sizeClasses = isMobile
          ? 'w-full max-w-[40vw] h-auto max-h-[160px]'
          : 'w-full max-w-[176px] h-auto max-h-[176px]';
        aspectRatioClass = 'aspect-square';
      }

      // Utiliser l'image originale pour les PNG (problème de thumbnail noir)
      // Pour les autres formats, utiliser le thumbnail
      const isPng = attachment.mimeType === 'image/png';
      const imageUrl = (isPng || imageAttachments.length <= 2)
        ? attachment.fileUrl
        : (attachment.thumbnailUrl || attachment.fileUrl);

      return (
        <TooltipProvider key={attachment.id}>
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <div
                className={`relative group cursor-pointer snap-start ${
                  imageAttachments.length <= 2 ? (isOwnMessage ? 'ml-auto' : 'mr-auto') : 'flex-shrink-0'
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
                <div className={`relative bg-gray-100 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden hover:border-blue-400 dark:hover:border-blue-500 transition-all hover:shadow-lg dark:hover:shadow-blue-500/30 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${imageAttachments.length <= 2 ? 'inline-flex items-center justify-center max-h-[320px]' : sizeClasses} ${aspectRatioClass}`}>
                  <img
                    src={imageUrl}
                    alt={attachment.originalName}
                    className={`${
                      imageAttachments.length <= 2
                        ? 'max-w-full max-h-[320px] w-auto h-auto object-contain'
                        : 'w-full h-full object-cover'
                    }`}
                    loading="lazy"
                    decoding="async"
                    onError={(e) => {
                      // Si le thumbnail échoue, essayer l'image originale
                      if (e.currentTarget.src !== attachment.fileUrl) {
                        e.currentTarget.src = attachment.fileUrl;
                      } else {
                        e.currentTarget.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect fill="%23ddd" width="100" height="100"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="%23999"%3EImage%3C/text%3E%3C/svg%3E';
                      }
                    }}
                  />

                  {/* Bouton de suppression (visible si l'utilisateur a les droits) */}
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

                  {/* Extension badge - affiché pour toutes les images */}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 dark:from-black/90 to-transparent px-1.5 py-1" aria-hidden="true">
                    <div className="text-white text-[10px] font-medium truncate">
                      {extension.toUpperCase()}
                    </div>
                  </div>
                </div>
                {/* Size badge - affiché pour toutes les images */}
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
    }

    // Audio attachment - Utiliser SimpleAudioPlayer
    if (type === 'audio') {
      // Passer l'attachment complet avec TOUS les champs, notamment metadata
      return (
        <SimpleAudioPlayer key={attachment.id} attachment={attachment as any} />
      );
    }

    // Video attachment - lecteur vidéo intégré
    if (type === 'video') {
      // Handler pour ouvrir le lightbox vidéo
      const handleOpenVideoLightbox = () => {
        const videoIndex = videoAttachments.findIndex(vid => vid.id === attachment.id);
        setVideoLightboxIndex(videoIndex);
        setVideoLightboxOpen(true);
      };

      // Convertir l'attachment en format compatible avec VideoPlayer
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
        <div key={attachment.id} className="relative">
          <VideoPlayer
            attachment={videoAttachment as any}
            onOpenLightbox={handleOpenVideoLightbox}
          />
          {/* Bouton de suppression */}
          {canDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleOpenDeleteConfirm(attachment, e);
              }}
              className="absolute top-2 right-2 w-[43px] h-[43px] rounded-full bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700 text-white flex items-center justify-center transition-all shadow-md z-10 opacity-0 hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-red-500"
              title="Supprimer cette vidéo"
              aria-label={`Supprimer la vidéo ${attachment.originalName}`}
            >
              <X className="w-[22px] h-[22px]" />
            </button>
          )}
        </div>
      );
    }

    // PDF attachment - lecteur PDF intégré
    if (attachment.mimeType === 'application/pdf') {
      const pdfAttachment = {
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

      // Handler pour ouvrir le lightbox PDF
      const handleOpenPdfLightbox = () => {
        setPdfLightboxAttachment(attachment);
        setPdfLightboxOpen(true);
      };

      // Handler pour supprimer le PDF
      const handleDeletePdf = () => {
        handleOpenDeleteConfirm(attachment);
      };

      return (
        <PDFViewerWrapper
          key={attachment.id}
          attachment={pdfAttachment as any}
          onOpenLightbox={handleOpenPdfLightbox}
          onDelete={canDelete ? handleDeletePdf : undefined}
          canDelete={canDelete}
        />
      );
    }

    // PPTX attachment - lecteur PowerPoint intégré
    if (
      attachment.mimeType === 'application/vnd.ms-powerpoint' ||
      attachment.mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
      attachment.originalName.toLowerCase().endsWith('.ppt') ||
      attachment.originalName.toLowerCase().endsWith('.pptx')
    ) {
      const pptxAttachment = {
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

      // Handler pour ouvrir le lightbox PPTX
      const handleOpenPptxLightbox = () => {
        setPptxLightboxAttachment(attachment);
        setPptxLightboxOpen(true);
      };

      // Handler pour supprimer le PPTX
      const handleDeletePptx = () => {
        handleOpenDeleteConfirm(attachment);
      };

      return (
        <PPTXViewer
          key={attachment.id}
          attachment={pptxAttachment as any}
          onOpenLightbox={handleOpenPptxLightbox}
          onDelete={canDelete ? handleDeletePptx : undefined}
          canDelete={canDelete}
        />
      );
    }

    // Markdown attachment - lecteur markdown intégré
    if (
      attachment.mimeType === 'text/markdown' ||
      attachment.mimeType === 'text/x-markdown' ||
      attachment.originalName.toLowerCase().endsWith('.md')
    ) {
      const markdownAttachment = {
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

      // Handler pour ouvrir le lightbox Markdown
      const handleOpenMarkdownLightbox = () => {
        setMarkdownLightboxAttachment(attachment);
        setMarkdownLightboxOpen(true);
      };

      // Handler pour supprimer le Markdown
      const handleDeleteMarkdown = () => {
        handleOpenDeleteConfirm(attachment);
      };

      return (
        <MarkdownViewer
          key={attachment.id}
          attachment={markdownAttachment as any}
          onOpenLightbox={handleOpenMarkdownLightbox}
          onDelete={canDelete ? handleDeleteMarkdown : undefined}
          canDelete={canDelete}
        />
      );
    }

    // Text/Code attachment - lecteur texte intégré
    if ((type === 'text' || type === 'code') &&
        attachment.mimeType !== 'text/markdown' &&
        attachment.mimeType !== 'text/x-markdown' &&
        !attachment.originalName.toLowerCase().endsWith('.md')) {
      const textAttachment = {
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

      // Handler pour ouvrir le lightbox Text
      const handleOpenTextLightbox = () => {
        setTextLightboxAttachment(attachment);
        setTextLightboxOpen(true);
      };

      return (
        <div key={attachment.id} className="relative">
          <TextViewer
            attachment={textAttachment as any}
            onOpenLightbox={handleOpenTextLightbox}
          />
          {/* Bouton de suppression */}
          {canDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleOpenDeleteConfirm(attachment, e);
              }}
              className="absolute top-2 right-2 w-[43px] h-[43px] rounded-full bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700 text-white flex items-center justify-center transition-all shadow-md z-10 opacity-0 hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-red-500"
              title="Supprimer ce fichier texte"
              aria-label={`Supprimer le fichier ${attachment.originalName}`}
            >
              <X className="w-[22px] h-[22px]" />
            </button>
          )}
        </div>
      );
    }

    // Autres types (document, text) - icône simple
    // Handler pour ouvrir la confirmation de suppression
    const handleDeleteClick = (event: React.MouseEvent) => {
      handleOpenDeleteConfirm(attachment, event);
    };

    // Handler pour ouvrir le fichier immédiatement
    const handleFileClick = (event: React.MouseEvent) => {
      // Toujours ouvrir le fichier immédiatement
      window.open(attachment.fileUrl, '_blank');
    };

    return (
      <TooltipProvider key={attachment.id}>
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

                {/* Bouton de suppression (visible si l'utilisateur a les droits) */}
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
                  /* Download indicator si pas de droits de suppression */
                  <div className="absolute top-1 right-1 transition-opacity opacity-0 group-hover:opacity-100" aria-hidden="true">
                    <Download className="w-3 h-3 text-gray-600 dark:text-gray-400" />
                  </div>
                )}
              </div>
              {/* Size badge */}
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
  };

  // Déterminer le layout selon le nombre d'images
  const getImageLayoutClasses = () => {
    const imageCount = imageAttachments.length;

    if (imageCount === 1 || imageCount === 2) {
      // 1-2 images : chaque image indépendante, alignée selon l'émetteur
      return `flex flex-col gap-1 ${isOwnMessage ? 'items-end' : 'items-start'}`;
    } else if (imageCount <= 4) {
      // 3-4 images : grid avec alignement selon l'émetteur
      return `grid grid-cols-2 gap-1 ${isOwnMessage ? 'justify-items-end' : 'justify-items-start'}`;
    } else {
      // 5+ images : flex wrap avec alignement selon l'émetteur
      return `flex flex-wrap gap-1 ${isOwnMessage ? 'justify-end' : 'justify-start'}`;
    }
  };

  // Déterminer le layout selon le nombre d'audios
  const getAudioLayoutClasses = () => {
    const audioCount = audioAttachments.length;
    // Grid seulement si plusieurs audios
    if (audioCount > 1) {
      return 'grid grid-cols-1 gap-2 w-full';
    } else {
      return 'flex flex-col gap-1 w-full';
    }
  };

  return (
    <>
      <div className="mt-2 flex flex-col gap-2 w-full max-w-full min-w-0 overflow-hidden">
        {/* Affichage des images */}
        {imageAttachments.length > 0 && (
          <div className={`${getImageLayoutClasses()} w-full max-w-full ${
            shouldUseMultiRow && imageAttachments.length > 4
              ? 'overflow-y-auto max-h-96 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent'
              : ''
          }`}>
            {imageAttachments.map((attachment, index) => renderAttachment(attachment, index))}
          </div>
        )}

        {/* Affichage des audios */}
        {audioAttachments.length > 0 && (
          <div className={getAudioLayoutClasses()}>
            {audioAttachments.map((attachment, index) => renderAttachment(attachment, index))}
          </div>
        )}

        {/* Affichage des vidéos */}
        {videoAttachments.length > 0 && (
          <div className="flex flex-col gap-2 w-full min-w-0">
            {videoAttachments.map((attachment, index) => renderAttachment(attachment, index))}
          </div>
        )}

        {/* Affichage des PDFs */}
        {pdfAttachments.length > 0 && (
          <div className="flex flex-col gap-2 w-full min-w-0">
            {pdfAttachments.map((attachment, index) => renderAttachment(attachment, index))}
          </div>
        )}

        {/* Affichage des PPTX */}
        {pptxAttachments.length > 0 && (
          <div className="flex flex-col gap-2 w-full min-w-0">
            {pptxAttachments.map((attachment, index) => renderAttachment(attachment, index))}
          </div>
        )}

        {/* Affichage des fichiers Markdown */}
        {markdownAttachments.length > 0 && (
          <div className="flex flex-col gap-2 w-full min-w-0">
            {markdownAttachments.map((attachment, index) => renderAttachment(attachment, index))}
          </div>
        )}

        {/* Affichage des fichiers Texte/Code */}
        {textAttachments.length > 0 && (
          <div className="flex flex-col gap-2 w-full min-w-0">
            {textAttachments.map((attachment, index) => renderAttachment(attachment, index))}
          </div>
        )}

        {/* Affichage des autres fichiers */}
        {otherAttachments.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {otherAttachments.map((attachment, index) => renderAttachment(attachment, index))}
          </div>
        )}

        {/* Bouton d'expansion sur mobile */}
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

      {/* Bouton de réduction sur mobile */}
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

      {/* Lightbox pour les images */}
      <ImageLightbox
        images={imageAttachments}
        initialIndex={lightboxImageIndex}
        isOpen={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
      />

      {/* Lightbox pour les vidéos */}
      <VideoLightbox
        videos={videoAttachments}
        initialIndex={videoLightboxIndex}
        isOpen={videoLightboxOpen}
        onClose={() => setVideoLightboxOpen(false)}
      />

      {/* Lightbox pour les PDFs */}
      <PDFLightboxSimple
        attachment={pdfLightboxAttachment as any}
        isOpen={pdfLightboxOpen}
        onClose={() => setPdfLightboxOpen(false)}
      />

      {/* Lightbox pour les fichiers Markdown */}
      <MarkdownLightbox
        attachment={markdownLightboxAttachment as any}
        isOpen={markdownLightboxOpen}
        onClose={() => setMarkdownLightboxOpen(false)}
      />

      {/* Lightbox pour les fichiers texte/code */}
      <TextLightbox
        attachment={textLightboxAttachment as any}
        isOpen={textLightboxOpen}
        onClose={() => setTextLightboxOpen(false)}
      />

      {/* Lightbox pour les présentations PPTX */}
      <PPTXLightbox
        attachment={pptxLightboxAttachment as any}
        isOpen={pptxLightboxOpen}
        onClose={() => setPptxLightboxOpen(false)}
      />

      {/* Dialog de confirmation de suppression */}
      <Dialog open={!!attachmentToDelete} onOpenChange={(open) => !open && handleDeleteCancel()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmer la suppression</DialogTitle>
            <DialogDescription>
              Êtes-vous sûr de vouloir supprimer ce fichier ? Cette action est irréversible.
            </DialogDescription>
          </DialogHeader>
          {attachmentToDelete && (
            <div className="mt-2 p-2 bg-muted rounded-md">
              <div className="text-sm font-medium text-foreground">
                {attachmentToDelete.originalName}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Le fichier sera définitivement supprimé du serveur.
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={handleDeleteCancel}
              disabled={isDeleting}
            >
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
            >
              {isDeleting ? 'Suppression...' : 'Supprimer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
});

