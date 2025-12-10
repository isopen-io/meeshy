/**
 * Galerie modale pour visualiser les images et autres attachments
 */

'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, ChevronLeft, ChevronRight, Download, MessageSquare, Maximize2, Trash2 } from 'lucide-react';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../ui/dialog';
import { Attachment } from '@meeshy/shared/types/attachment';
import { AttachmentService } from '../../services/attachmentService';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { useI18n } from '@/hooks/useI18n';
import { toast } from 'sonner';
import { buildAttachmentUrl } from '@/utils/attachment-url';

interface AttachmentGalleryProps {
  conversationId: string;
  initialAttachmentId?: string;
  open: boolean;
  onClose: () => void;
  onNavigateToMessage?: (messageId: string) => void;
  token?: string;
  // Nouvelle prop pour passer les attachments directement (évite un appel API)
  attachments?: Attachment[];
  /**
   * ID de l'utilisateur courant (pour vérifier les permissions de suppression)
   */
  currentUserId?: string;
  /**
   * Callback appelé après suppression d'un attachment
   */
  onAttachmentDeleted?: (attachmentId: string) => void;
}

export function AttachmentGallery({
  conversationId,
  initialAttachmentId,
  open,
  onClose,
  onNavigateToMessage,
  token,
  attachments: providedAttachments,
  currentUserId,
  onAttachmentDeleted,
}: AttachmentGalleryProps) {
  const { t } = useI18n('attachments');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number>(0);
  const touchEndX = useRef<number>(0);

  const currentAttachment = attachments[currentIndex];

  // Calculer l'URL normalisée de l'attachment courant
  const currentAttachmentUrl = React.useMemo(() => {
    if (!currentAttachment?.fileUrl) return null;
    return buildAttachmentUrl(currentAttachment.fileUrl);
  }, [currentAttachment?.fileUrl]);

  // Handler pour ouvrir la confirmation de suppression
  const handleOpenDeleteConfirm = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setShowDeleteConfirm(true);
  }, []);

  // Handler pour confirmer la suppression
  const handleDeleteConfirm = useCallback(async () => {
    if (!currentAttachment || !token) return;

    setIsDeleting(true);
    try {
      await AttachmentService.deleteAttachment(currentAttachment.id, token);

      // Notifier le parent
      onAttachmentDeleted?.(currentAttachment.id);

      // Retirer l'attachment de la liste locale
      setAttachments(prev => prev.filter(att => att.id !== currentAttachment.id));

      // Ajuster l'index si nécessaire
      if (currentIndex >= attachments.length - 1) {
        setCurrentIndex(Math.max(0, currentIndex - 1));
      }

      // Fermer la galerie si c'était le dernier attachment
      if (attachments.length === 1) {
        onClose();
      }

      toast.success('Fichier supprimé avec succès');
      setShowDeleteConfirm(false);
    } catch (error) {
      console.error('Erreur suppression attachment:', error);
      toast.error('Impossible de supprimer le fichier');
    } finally {
      setIsDeleting(false);
    }
  }, [currentAttachment, token, onAttachmentDeleted, currentIndex, attachments.length, onClose]);

  // Handler pour annuler la suppression
  const handleDeleteCancel = useCallback(() => {
    setShowDeleteConfirm(false);
  }, []);

  const handlePrevious = useCallback(() => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : attachments.length - 1));
  }, [attachments.length]);

  const handleNext = useCallback(() => {
    setCurrentIndex((prev) => (prev < attachments.length - 1 ? prev + 1 : 0));
  }, [attachments.length]);

  const handleDownload = () => {
    if (currentAttachmentUrl) {
      window.open(currentAttachmentUrl, '_blank');
    }
  };

  const handleFullscreen = () => {
    if (currentAttachmentUrl) {
      window.open(currentAttachmentUrl, '_blank');
    }
  };

  const handleGoToMessage = () => {
    if (currentAttachment && onNavigateToMessage) {
      onNavigateToMessage(currentAttachment.messageId);
      onClose();
    }
  };

  // Navigation au clavier (flèches gauche/droite, Escape)
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrevious();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, handlePrevious, handleNext, onClose]);

  // Gestion du swipe sur mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    const swipeThreshold = 50; // pixels minimum pour déclencher le swipe
    const diff = touchStartX.current - touchEndX.current;

    if (Math.abs(diff) > swipeThreshold) {
      if (diff > 0) {
        // Swipe vers la gauche -> image suivante
        handleNext();
      } else {
        // Swipe vers la droite -> image précédente
        handlePrevious();
      }
    }

    touchStartX.current = 0;
    touchEndX.current = 0;
  };

  // Charger les attachments de la conversation
  useEffect(() => {
    if (!open || !conversationId) return;

    const loadAttachments = async () => {
      setLoading(true);
      try {
        // Si des attachments sont fournis en props, les utiliser directement
        if (providedAttachments && providedAttachments.length > 0) {
          setAttachments(providedAttachments);

          // Si un attachment initial est spécifié, trouver son index
          if (initialAttachmentId) {
            const index = providedAttachments.findIndex(
              (att) => att.id === initialAttachmentId
            );
            if (index !== -1) {
              setCurrentIndex(index);
            }
          }
        } else {
          // Sinon, charger via l'API (mode legacy)
          const response = await AttachmentService.getConversationAttachments(
            conversationId,
            { type: 'image', limit: 100 },
            token
          );

          if (response.success && response.attachments) {
            setAttachments(response.attachments);

            // Si un attachment initial est spécifié, trouver son index
            if (initialAttachmentId) {
              const index = response.attachments.findIndex(
                (att) => att.id === initialAttachmentId
              );
              if (index !== -1) {
                setCurrentIndex(index);
              }
            }
          }
        }
      } catch (error) {
        console.error('Erreur chargement attachments:', error);
      } finally {
        setLoading(false);
      }
    };

    loadAttachments();
  }, [open, conversationId, initialAttachmentId, token, providedAttachments]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl h-[90vh] p-0 bg-black/95 dark:bg-black border-none" showCloseButton={false}>
        <DialogTitle className="sr-only">
          {t('gallery.titleWithCounter', { current: currentIndex + 1, total: attachments.length })}
        </DialogTitle>
        <div className="relative w-full h-full flex flex-col">
          {/* Header */}
          <div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/80 to-transparent p-4">
            <div className="flex items-center justify-between">
              <div className="text-white">
                <div className="text-sm font-medium">
                  {currentIndex + 1} / {attachments.length}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleFullscreen}
                  className="text-white hover:bg-white/10"
                  title={t('gallery.fullscreen')}
                >
                  <Maximize2 className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDownload}
                  className="text-white hover:bg-white/10"
                  title={t('gallery.download')}
                >
                  <Download className="w-4 h-4" />
                </Button>
                {/* Bouton de suppression (uniquement si l'utilisateur a les droits) */}
                {currentAttachment && currentAttachment.uploadedBy === currentUserId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleOpenDeleteConfirm}
                    className="text-red-400 hover:bg-red-500/10 hover:text-red-300"
                    title="Supprimer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClose}
                  className="text-white hover:bg-white/10"
                  title={t('gallery.close')}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Image principale avec support swipe mobile */}
          <div
            ref={imageContainerRef}
            className="flex-1 flex items-center justify-center p-4 overflow-hidden"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {loading ? (
              <div className="text-white">{t('gallery.loading')}</div>
            ) : currentAttachment && currentAttachmentUrl ? (
              <div className="w-full h-full flex items-center justify-center">
                <img
                  src={currentAttachmentUrl}
                  alt={currentAttachment.originalName}
                  className="w-full h-full object-contain"
                  style={{ maxWidth: '100%', maxHeight: '100%' }}
                />
              </div>
            ) : (
              <div className="text-white">{t('gallery.noImage')}</div>
            )}
          </div>

          {/* Navigation - Visible en permanence sur desktop, masqué sur mobile (swipe) */}
          {attachments.length > 1 && (
            <>
              <button
                onClick={handlePrevious}
                className="hidden md:flex absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-black/50 hover:bg-black/70 text-white rounded-full items-center justify-center transition-colors z-20"
                aria-label={t('gallery.previous')}
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <button
                onClick={handleNext}
                className="hidden md:flex absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-black/50 hover:bg-black/70 text-white rounded-full items-center justify-center transition-colors z-20"
                aria-label={t('gallery.next')}
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </>
          )}

          {/* Footer avec info */}
          {currentAttachment && (
            <div className="absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-black/80 to-transparent p-4">
              <div className="flex items-center justify-between text-white">
                <div className="flex items-center gap-3">
                  <div className="text-sm">
                    <div className="font-medium">{currentAttachment.originalName}</div>
                    <div className="text-xs text-gray-300">
                      {formatDate(currentAttachment.createdAt)}
                      {currentAttachment.width && currentAttachment.height && (
                        <> • {currentAttachment.width}x{currentAttachment.height}</>
                      )}
                    </div>
                  </div>
                </div>

                {onNavigateToMessage && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleGoToMessage}
                    className="text-white hover:bg-white/10"
                  >
                    <MessageSquare className="w-4 h-4 mr-2" />
                    {t('gallery.goToMessage')}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

      </DialogContent>

      {/* Dialog de confirmation de suppression */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmer la suppression</DialogTitle>
            <DialogDescription>
              Êtes-vous sûr de vouloir supprimer ce fichier ? Cette action est irréversible.
            </DialogDescription>
          </DialogHeader>
          {currentAttachment && (
            <div className="mt-2 p-2 bg-muted rounded-md">
              <div className="text-sm font-medium text-foreground">
                {currentAttachment.originalName}
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
    </Dialog>
  );
}

