/**
 * Dialog de confirmation de suppression d'attachment
 */

'use client';

import React from 'react';
import { Attachment } from '@meeshy/shared/types/attachment';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';

export interface AttachmentDeleteDialogProps {
  attachment: Attachment | null;
  isDeleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const AttachmentDeleteDialog = React.memo(function AttachmentDeleteDialog({
  attachment,
  isDeleting,
  onConfirm,
  onCancel,
}: AttachmentDeleteDialogProps) {
  return (
    <Dialog open={!!attachment} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Confirmer la suppression</DialogTitle>
          <DialogDescription>
            Êtes-vous sûr de vouloir supprimer ce fichier ? Cette action est irréversible.
          </DialogDescription>
        </DialogHeader>
        {attachment && (
          <div className="mt-2 p-2 bg-muted rounded-md">
            <div className="text-sm font-medium text-foreground">
              {attachment.originalName}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Le fichier sera définitivement supprimé du serveur.
            </div>
          </div>
        )}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={isDeleting}
          >
            Annuler
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? 'Suppression...' : 'Supprimer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
