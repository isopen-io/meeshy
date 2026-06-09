/**
 * Menu contextuel pour les attachements
 * Affiché sur long press / clic droit
 * Permet de télécharger, copier le lien ou supprimer un attachment
 */

'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Download, Link as LinkIcon, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Attachment } from '@meeshy/shared/types';
import { createPortal } from 'react-dom';
import { useI18n } from '@/hooks/useI18n';

export interface AttachmentContextMenuProps {
  attachment: Attachment;
  isOpen: boolean;
  onClose: () => void;
  onDelete?: () => Promise<void>;
  canDelete?: boolean;
  position: { x: number; y: number };
}

export function AttachmentContextMenu({
  attachment,
  isOpen,
  onClose,
  onDelete,
  canDelete = false,
  position,
}: AttachmentContextMenuProps) {
  const { t } = useI18n('attachments');
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = attachment.fileUrl;
    link.download = attachment.originalName;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success(t('contextMenu.downloadStarted'));
    onClose();
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(attachment.fileUrl);
      toast.success(t('contextMenu.linkCopied'));
      onClose();
    } catch (_error) {
      toast.error(t('contextMenu.linkCopyError'));
    }
  };

  const handleDeleteClick = () => {
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (!onDelete) return;

    setIsDeleting(true);
    try {
      await onDelete();
      toast.success(t('contextMenu.deleteSuccess'));
      setShowDeleteConfirm(false);
      onClose();
    } catch (error) {
      console.error('Erreur suppression attachment:', error);
      toast.error(t('contextMenu.deleteError'));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    setShowDeleteConfirm(false);
  };

  // Ajuster la position pour éviter que le menu sorte de l'écran
  const [adjustedPosition, setAdjustedPosition] = useState(position);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen || showDeleteConfirm || !menuRef.current) return;

    const menuRect = menuRef.current.getBoundingClientRect();
    const menuWidth = 256; // w-64 = 16rem = 256px
    const menuHeight = menuRect.height || 200; // estimation

    let adjustedX = position.x;
    let adjustedY = position.y;

    // Vérifier si le menu dépasse à droite
    if (position.x + menuWidth > window.innerWidth) {
      adjustedX = window.innerWidth - menuWidth - 16; // 16px de marge
    }

    // Vérifier si le menu dépasse en bas
    if (position.y + menuHeight > window.innerHeight) {
      adjustedY = position.y - menuHeight; // Afficher au-dessus
    }

    // Vérifier si le menu dépasse à gauche
    if (adjustedX < 16) {
      adjustedX = 16;
    }

    // Vérifier si le menu dépasse en haut
    if (adjustedY < 16) {
      adjustedY = 16;
    }

    setAdjustedPosition({ x: adjustedX, y: adjustedY });
  }, [isOpen, showDeleteConfirm, position]);

  // Handler pour fermer le menu en cliquant à l'extérieur
  useEffect(() => {
    if (!isOpen || showDeleteConfirm) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    // Petit délai pour éviter que le clic qui ouvre le menu le ferme immédiatement
    setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside as unknown);
    }, 100);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside as unknown);
    };
  }, [isOpen, showDeleteConfirm, onClose]);

  const contextMenu = isOpen && !showDeleteConfirm && typeof window !== 'undefined' ? createPortal(
    <div
      ref={menuRef}
      className="fixed z-[99999] w-64 rounded-lg border bg-popover p-2 text-popover-foreground shadow-lg animate-in fade-in-0 zoom-in-95"
      style={{
        left: `${adjustedPosition.x}px`,
        top: `${adjustedPosition.y}px`,
      }}
    >
      {/* Titre */}
      <div className="flex items-center justify-between px-2 py-1.5 mb-1 border-b">
        <h3 className="text-sm font-semibold truncate flex-1">
          {attachment.originalName}
        </h3>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 flex-shrink-0 ml-2"
          onClick={onClose}
          aria-label={t('contextMenu.close')}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-1">
        {/* Télécharger */}
        <Button
          variant="ghost"
          className="justify-start gap-2 h-auto py-2.5 px-3 hover:bg-accent"
          onClick={handleDownload}
        >
          <Download className="h-4 w-4" />
          <span>{t('contextMenu.download')}</span>
        </Button>

        {/* Copier le lien */}
        <Button
          variant="ghost"
          className="justify-start gap-2 h-auto py-2.5 px-3 hover:bg-accent"
          onClick={handleCopyLink}
        >
          <LinkIcon className="h-4 w-4" />
          <span>{t('contextMenu.copyLink')}</span>
        </Button>

        {/* Supprimer (uniquement si autorisé) */}
        {canDelete && onDelete && (
          <>
            <div className="h-px bg-border my-1" />
            <Button
              variant="ghost"
              className="justify-start gap-2 h-auto py-2.5 px-3 hover:bg-destructive/10 text-destructive hover:text-destructive"
              onClick={handleDeleteClick}
            >
              <Trash2 className="h-4 w-4" />
              <span>{t('contextMenu.delete')}</span>
            </Button>
          </>
        )}
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <>
      {contextMenu}

      {/* Dialog de confirmation de suppression */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('contextMenu.confirmDeleteTitle')}</DialogTitle>
            <DialogDescription>
              {t('contextMenu.confirmDeleteDescription')}
              <div className="mt-2 p-2 bg-muted rounded-md">
                <div className="text-sm font-medium text-foreground">
                  {attachment.originalName}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {t('contextMenu.confirmDeleteIrreversible')}
                </div>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={handleDeleteCancel}
              disabled={isDeleting}
            >
              {t('contextMenu.close')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
            >
              {isDeleting ? t('contextMenu.deleting') : t('contextMenu.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
