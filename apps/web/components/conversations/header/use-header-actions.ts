import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { copyToClipboard } from '@/lib/clipboard';
import { AttachmentService } from '@/services/attachmentService';
import { conversationsService } from '@/services/conversations.service';
import { copyToClipboard } from '@/lib/clipboard';

export function useHeaderActions(conversationId: string, t: (key: string, fallback?: string) => string) {
  const [isImageUploadDialogOpen, setIsImageUploadDialogOpen] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  const handleImageUpload = useCallback(async (file: File) => {
    setIsUploadingImage(true);
    try {
      const uploadResult = await AttachmentService.uploadFiles([file]);

      if (uploadResult.success && uploadResult.attachments.length > 0) {
        const imageUrl = (uploadResult.attachments[0] as unknown).url;

        await conversationsService.updateConversation(conversationId, {
          image: imageUrl,
          avatar: imageUrl
        });

        toast.success(t('conversationHeader.imageUpdated', 'Conversation image updated'));
        setIsImageUploadDialogOpen(false);

        window.location.reload();
      } else {
        throw new Error('Upload failed');
      }
    } catch (error) {
      console.error('Erreur lors de l\'upload de l\'image:', error);
      toast.error(t('conversationHeader.imageUploadError', 'Error uploading image'));
    } finally {
      setIsUploadingImage(false);
    }
  }, [conversationId, t]);

  const handleShareConversation = useCallback(async () => {
    const url = `${window.location.origin}/conversations/${conversationId}`;
    const shareText = t('conversationHeader.shareMessage');
    const fullMessage = `${shareText}\n\n${url}`;

    try {
      if (navigator.share) {
        await navigator.share({
          text: fullMessage,
        });
      } else {
        const { success } = await copyToClipboard(fullMessage);
        if (success) {
          toast.success(t('conversationHeader.linkCopied', 'Link copied!'));
        } else {
          toast.error(t('conversationHeader.linkCopyError', 'Error copying link'));
        }
      }
    } catch (error: unknown) {
      if (error.name === 'AbortError') {
        return;
      }
      console.error('Erreur lors du partage:', error);
      toast.error(t('conversationHeader.linkCopyError', 'Error copying link'));
    }
  }, [conversationId, t]);

  return {
    isImageUploadDialogOpen,
    setIsImageUploadDialogOpen,
    isUploadingImage,
    isSettingsModalOpen,
    setIsSettingsModalOpen,
    handleImageUpload,
    handleShareConversation,
  };
}
