/**
 * Hook pour gérer la suppression d'attachments
 */

'use client';

import { useState, useCallback } from 'react';
import { Attachment } from '@meeshy/shared/types/attachment';
import { AttachmentService } from '@/services/attachmentService';
import { toast } from 'sonner';

export interface AttachmentDeletionState {
  attachmentToDelete: Attachment | null;
  isDeleting: boolean;
}

export interface UseAttachmentDeletionOptions {
  token?: string;
  onAttachmentDeleted?: (attachmentId: string) => void;
}

export function useAttachmentDeletion({
  token,
  onAttachmentDeleted,
}: UseAttachmentDeletionOptions) {
  const [attachmentToDelete, setAttachmentToDelete] = useState<Attachment | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleOpenDeleteConfirm = useCallback((attachment: Attachment, event?: React.MouseEvent) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    setAttachmentToDelete(attachment);
  }, []);

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

  const handleDeleteCancel = useCallback(() => {
    setAttachmentToDelete(null);
  }, []);

  return {
    attachmentToDelete,
    isDeleting,
    handleOpenDeleteConfirm,
    handleDeleteConfirm,
    handleDeleteCancel,
  };
}
