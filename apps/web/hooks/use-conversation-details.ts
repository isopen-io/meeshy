'use client';

import { useState, useEffect, useCallback } from 'react';
import { conversationsService } from '@/services/conversations.service';
import { toast } from 'sonner';
import type { Conversation, User } from '@meeshy/shared/types';
import { useI18n } from './use-i18n';

/**
 * Hook for managing conversation details state and operations
 * Handles name, description, and image updates
 */
export function useConversationDetails(
  conversation: Conversation,
  currentUser: User,
  onConversationUpdated?: (updatedConversation: Partial<Conversation>) => void
) {
  const { t } = useI18n('conversations');

  // Edit states
  const [isEditingName, setIsEditingName] = useState(false);
  const [conversationName, setConversationName] = useState(conversation.title || '');
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [conversationDescription, setConversationDescription] = useState(conversation.description || '');

  // UI states
  const [isLoading, setIsLoading] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isImageUploadDialogOpen, setIsImageUploadDialogOpen] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  // Update local state when conversation changes
  useEffect(() => {
    setConversationName(conversation.title || '');
    setConversationDescription(conversation.description || '');
  }, [conversation.title, conversation.description]);

  // Save conversation name
  const handleSaveName = useCallback(async () => {
    try {
      setIsLoading(true);

      if (!conversationName.trim()) {
        toast.error(t('conversationDetails.nameCannotBeEmpty'));
        return;
      }

      if (conversationName.trim() === (conversation.title || '')) {
        setIsEditingName(false);
        return;
      }

      const updatedData = { title: conversationName.trim() };
      await conversationsService.updateConversation(conversation.id, updatedData);

      onConversationUpdated?.(updatedData);
      setIsEditingName(false);
      toast.success(t('conversationDetails.nameUpdated'));
    } catch (error: any) {
      console.error('Error updating conversation name:', error);

      let errorMessage = t('conversationDetails.updateError');
      if (error.status === 409) errorMessage = t('conversationDetails.conversationExists');
      else if (error.status === 403) errorMessage = t('conversationDetails.noPermissionToModify');
      else if (error.status === 404) errorMessage = t('conversationDetails.conversationNotFound');
      else if (error.status === 400) errorMessage = t('conversationDetails.invalidData');

      toast.error(errorMessage);
      setConversationName(conversation.title || '');
    } finally {
      setIsLoading(false);
    }
  }, [conversationName, conversation, onConversationUpdated, t]);

  // Save conversation description
  const handleSaveDescription = useCallback(async () => {
    try {
      setIsLoading(true);

      if (conversationDescription.trim() === (conversation.description || '')) {
        setIsEditingDescription(false);
        return;
      }

      const updatedData = { description: conversationDescription.trim() };
      await conversationsService.updateConversation(conversation.id, updatedData);

      onConversationUpdated?.(updatedData);
      setIsEditingDescription(false);
      toast.success(t('conversationDetails.descriptionUpdated') || 'Description updated successfully');
    } catch (error: any) {
      console.error('Error updating conversation description:', error);

      let errorMessage = t('conversationDetails.updateError');
      if (error.status === 403) errorMessage = t('conversationDetails.noPermissionToModify');
      else if (error.status === 404) errorMessage = t('conversationDetails.conversationNotFound');
      else if (error.status === 400) errorMessage = t('conversationDetails.invalidData');

      toast.error(errorMessage);
      setConversationDescription(conversation.description || '');
    } finally {
      setIsLoading(false);
    }
  }, [conversationDescription, conversation, onConversationUpdated, t]);

  return {
    // Name editing
    isEditingName,
    setIsEditingName,
    conversationName,
    setConversationName,
    handleSaveName,

    // Description editing
    isEditingDescription,
    setIsEditingDescription,
    conversationDescription,
    setConversationDescription,
    handleSaveDescription,

    // UI states
    isLoading,
    isCopied,
    setIsCopied,

    // Image upload
    isImageUploadDialogOpen,
    setIsImageUploadDialogOpen,
    isUploadingImage,
    setIsUploadingImage,
  };
}
