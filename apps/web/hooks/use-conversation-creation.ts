import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { conversationsService } from '@/services/conversations.service';
import { useI18n } from '@/hooks/useI18n';
import type { User } from '@/types';
import type { ConversationType } from '@meeshy/shared/types';

interface CreateConversationParams {
  title: string;
  conversationType: ConversationType;
  selectedUsers: User[];
  customIdentifier: string;
  selectedCommunity?: string;
}

interface UseConversationCreationReturn {
  isCreating: boolean;
  createConversation: (params: CreateConversationParams) => Promise<any | null>;
}

/**
 * Hook pour gérer la création de conversations
 * Gère la validation et l'appel API
 */
export function useConversationCreation(): UseConversationCreationReturn {
  const { t } = useI18n('modals');
  const [isCreating, setIsCreating] = useState(false);

  const createConversation = useCallback(async ({
    title,
    conversationType,
    selectedUsers,
    customIdentifier,
    selectedCommunity
  }: CreateConversationParams) => {
    // Validation des participants pour conversations non publiques
    if (conversationType !== 'public' && selectedUsers.length === 0) {
      toast.error(t('createConversationModal.errors.selectAtLeastOneUser'));
      return null;
    }

    setIsCreating(true);
    try {
      // Déterminer le titre de la conversation
      let conversationTitle = title;

      if (conversationType === 'direct' && !conversationTitle && selectedUsers.length > 0) {
        const displayName = selectedUsers[0].displayName || selectedUsers[0].username || selectedUsers[0].firstName || selectedUsers[0].lastName || 'Unknown User';
        conversationTitle = t('createConversationModal.preview.defaultTitles.direct', { username: displayName });
      }

      if (conversationType === 'group' && !conversationTitle && selectedUsers.length > 0) {
        const userNames = selectedUsers.map(u =>
          u.displayName || u.username || u.firstName || u.lastName || 'Unknown User'
        ).join(', ');
        conversationTitle = t('createConversationModal.preview.defaultTitles.group', { users: userNames });
      }

      if (conversationType === 'public' && !conversationTitle) {
        conversationTitle = t('createConversationModal.preview.defaultTitles.public');
      }

      // Filtrer les IDs de participants valides
      const validParticipantIds = selectedUsers
        .map(u => u.id)
        .filter(id => id && id.trim().length > 0);

      // Préparer le corps de la requête
      const requestBody: any = {
        title: conversationTitle,
        type: conversationType
      };

      if (validParticipantIds.length > 0) {
        requestBody.participantIds = validParticipantIds;
      }

      if (conversationType !== 'direct' && customIdentifier.trim()) {
        requestBody.identifier = customIdentifier;
      }

      if (selectedCommunity) {
        requestBody.communityId = selectedCommunity;
      }

      console.log('🔍 [CreateConversation] Request body:', JSON.stringify(requestBody, null, 2));

      const conversation = await conversationsService.createConversation(requestBody);

      console.log('✅ [CreateConversation] Conversation créée avec succès:', conversation);
      toast.success(t('createConversationModal.success.conversationCreated'));

      return conversation;
    } catch (error: any) {
      console.error('❌ [CreateConversation] Erreur lors de la création:', {
        message: error?.message,
        status: error?.status,
        data: error?.data,
        error
      });

      if (error?.data?.message) {
        toast.error(`Erreur: ${error.data.message}`);
      } else if (error?.message) {
        toast.error(`Erreur: ${error.message}`);
      } else {
        toast.error(t('createConversationModal.errors.creationError'));
      }

      return null;
    } finally {
      setIsCreating(false);
    }
  }, [t]);

  return {
    isCreating,
    createConversation
  };
}
