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
          <DialogTitle>{t('contextMenu.confirmDeleteTitle', 'Confirm deletion')}</DialogTitle>
          <DialogDescription>
            {t('contextMenu.confirmDeleteDescription', 'Are you sure you want to delete this file?')}
          </DialogDescription>
        </DialogHeader>
        {attachment && (
          <div className="mt-2 p-2 bg-muted rounded-md">
            <div className="text-sm font-medium text-foreground">
              {attachment.originalName}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {t('contextMenu.confirmDeleteIrreversible', 'This action is irreversible. The file will be permanently deleted.')}
            </div>
          </div>
        )}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={isDeleting}
          >
            {t('contextMenu.cancel', 'Cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? t('contextMenu.deleting', 'Deleting...') : t('contextMenu.delete', 'Delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
