/**
 * Dialog de confirmation de suppression d'attachment
 */

'use client';

import React from 'react';
import { Attachment } from '@meeshy/shared/types/attachment';
import { useI18n } from '@/hooks/useI18n';
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
  const { t } = useI18n('attachments');
  return (
    <Dialog open={!!attachment} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('deleteDialog.title', 'Confirm deletion')}</DialogTitle>
          <DialogDescription>
            {t('deleteDialog.description', 'Are you sure you want to delete this file? This action is irreversible.')}
          </DialogDescription>
        </DialogHeader>
        {attachment && (
          <div className="mt-2 p-2 bg-muted rounded-md">
            <div className="text-sm font-medium text-foreground">
              {attachment.originalName}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {t('deleteDialog.serverNote', 'The file will be permanently deleted from the server.')}
            </div>
          </div>
        )}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={isDeleting}
          >
            {t('deleteDialog.cancel', 'Cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? t('deleteDialog.deleting', 'Deleting...') : t('deleteDialog.delete', 'Delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
