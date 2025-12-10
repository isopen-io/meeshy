/**
 * Composant miniature pour afficher un aperçu compact des attachements dans les citations
 * Optimisé pour un affichage réduit (40px de hauteur max)
 */

'use client';

import React, { useMemo, useCallback } from 'react';
import { FileImage, FileText, Music, Video, File } from 'lucide-react';
import { Attachment, getAttachmentType } from '@meeshy/shared/types/attachment';
import { buildAttachmentsUrls } from '@/utils/attachment-url';
import { cn } from '@/lib/utils';

// Constantes
const PREVIEW_SIZE = 40; // px

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

interface AttachmentPreviewMiniProps {
  attachments: readonly Attachment[] | Attachment[];
  /**
   * Classe CSS supplémentaire pour le conteneur
   */
  className?: string;
  /**
   * Afficher uniquement le premier attachement
   */
  showOnlyFirst?: boolean;
  /**
   * Style adapté au message du propriétaire (texte blanc)
   */
  isOwnMessage?: boolean;
}

/**
 * Badge affichant le nombre d'attachements restants
 */
const RemainingCountBadge: React.FC<{ count: number; isOwnMessage: boolean }> = ({ count, isOwnMessage }) => (
  <span
    className={cn(
      "text-[10px] font-medium",
      isOwnMessage ? "text-white/70" : "text-gray-500 dark:text-gray-400"
    )}
    aria-label={`et ${count} autre${count > 1 ? 's' : ''} pièce${count > 1 ? 's' : ''} jointe${count > 1 ? 's' : ''}`}
    role="status"
  >
    +{count}
  </span>
);

export const AttachmentPreviewMini = React.memo(function AttachmentPreviewMini({
  attachments,
  className,
  showOnlyFirst = false,
  isOwnMessage = false
}: AttachmentPreviewMiniProps) {
  // Construire les URLs complètes des attachments
  const attachmentsWithUrls = useMemo(() => {
    // Cast vers un tableau mutable pour buildAttachmentsUrls
    return buildAttachmentsUrls([...attachments]);
  }, [attachments]);

  // Filtrer pour n'afficher que le premier si demandé
  const displayAttachments = showOnlyFirst ? attachmentsWithUrls.slice(0, 1) : attachmentsWithUrls;

  if (!displayAttachments.length) {
    return null;
  }

  // Compter les attachements restants si on n'affiche que le premier
  const remainingCount = attachments.length - 1;

  // Handler pour gérer les erreurs de chargement d'image
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

  return (
    <div
      className={cn("flex items-center gap-1 mt-1", className)}
      role="list"
      aria-label={`${attachments.length} pièce${attachments.length > 1 ? 's' : ''} jointe${attachments.length > 1 ? 's' : ''}`}
    >
      {displayAttachments.map((attachment, index) => {
        const type = getAttachmentType(attachment.mimeType);
        const safeFileUrl = isValidUrl(attachment.fileUrl) ? attachment.fileUrl : '';

        // Composant selon le type d'attachement
        if (type === 'image' && safeFileUrl) {
          return (
            <div key={attachment.id} className="flex items-center gap-1.5" role="listitem">
              <div
                className="relative rounded overflow-hidden border border-white/20 dark:border-gray-600/20 flex-shrink-0"
                style={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE }}
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
              {index === 0 && remainingCount > 0 && showOnlyFirst && (
                <RemainingCountBadge count={remainingCount} isOwnMessage={isOwnMessage} />
              )}
            </div>
          );
        }

        if (type === 'video') {
          return (
            <div key={attachment.id} className="flex items-center gap-1.5" role="listitem">
              <div
                className={cn(
                  "flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]",
                  isOwnMessage
                    ? "bg-white/10 text-white/80"
                    : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                )}
                role="img"
                aria-label={`Fichier vidéo : ${attachment.fileName}`}
              >
                <Video className="h-3 w-3" aria-hidden="true" />
                <span className="truncate max-w-[80px]">{attachment.fileName}</span>
              </div>
              {index === 0 && remainingCount > 0 && showOnlyFirst && (
                <RemainingCountBadge count={remainingCount} isOwnMessage={isOwnMessage} />
              )}
            </div>
          );
        }

        if (type === 'audio') {
          return (
            <div key={attachment.id} className="flex items-center gap-1.5" role="listitem">
              <div
                className={cn(
                  "flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]",
                  isOwnMessage
                    ? "bg-white/10 text-white/80"
                    : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                )}
                role="img"
                aria-label={`Fichier audio : ${attachment.fileName}`}
              >
                <Music className="h-3 w-3" aria-hidden="true" />
                <span className="truncate max-w-[80px]">{attachment.fileName}</span>
              </div>
              {index === 0 && remainingCount > 0 && showOnlyFirst && (
                <RemainingCountBadge count={remainingCount} isOwnMessage={isOwnMessage} />
              )}
            </div>
          );
        }

        if (type === 'document' && attachment.mimeType === 'application/pdf') {
          return (
            <div key={attachment.id} className="flex items-center gap-1.5" role="listitem">
              <div
                className={cn(
                  "flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]",
                  isOwnMessage
                    ? "bg-white/10 text-white/80"
                    : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                )}
                role="img"
                aria-label={`Document PDF : ${attachment.fileName}`}
              >
                <FileText className="h-3 w-3" aria-hidden="true" />
                <span className="truncate max-w-[80px]">{attachment.fileName}</span>
              </div>
              {index === 0 && remainingCount > 0 && showOnlyFirst && (
                <RemainingCountBadge count={remainingCount} isOwnMessage={isOwnMessage} />
              )}
            </div>
          );
        }

        // Pour tous les autres types de fichiers (document, text, code)
        return (
          <div key={attachment.id} className="flex items-center gap-1.5" role="listitem">
            <div
              className={cn(
                "flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]",
                isOwnMessage
                  ? "bg-white/10 text-white/80"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
              )}
              role="img"
              aria-label={`Fichier ${type} : ${attachment.fileName}`}
            >
              <File className="h-3 w-3" aria-hidden="true" />
              <span className="truncate max-w-[80px]">{attachment.fileName}</span>
            </div>
            {index === 0 && remainingCount > 0 && showOnlyFirst && (
              <RemainingCountBadge count={remainingCount} isOwnMessage={isOwnMessage} />
            )}
          </div>
        );
      })}
    </div>
  );
});
