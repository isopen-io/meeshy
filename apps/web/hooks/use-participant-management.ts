'use client';

import { useState, useCallback } from 'react';
import { conversationsService } from '@/services/conversations.service';
import { toast } from 'sonner';
import type { Conversation, User } from '@meeshy/shared/types';
import { UserRoleEnum } from '@meeshy/shared/types';
import { useI18n } from './use-i18n';

/**
 * Hook for managing conversation participants
 * Handles participant permissions and removal
 */
export function useParticipantManagement(
  conversation: Conversation,
  currentUser: User
) {
  const { t } = useI18n('conversations');
  const [isLoading, setIsLoading] = useState(false);

  // Check if current user is admin/moderator
  const userMembership = conversation.participants?.find(p => p.userId === currentUser.id);
  const isAdmin =
    currentUser.role === UserRoleEnum.ADMIN ||
    currentUser.role === UserRoleEnum.BIGBOSS ||
    userMembership?.role === UserRoleEnum.ADMIN ||
    userMembership?.role === UserRoleEnum.MODERATOR;

  // Check if user can modify image
  const canModifyImage = conversation.type !== 'direct' && (
    currentUser.role === UserRoleEnum.BIGBOSS ||
    currentUser.role === UserRoleEnum.ADMIN ||
    currentUser.role === UserRoleEnum.MODO ||
    currentUser.role === UserRoleEnum.MODERATOR ||
    currentUser.role === UserRoleEnum.AUDIT ||
    currentUser.role === UserRoleEnum.ANALYST ||
    currentUser.role === UserRoleEnum.CREATOR ||
    userMembership?.role === UserRoleEnum.MODERATOR ||
    userMembership?.role === UserRoleEnum.CREATOR
  );

  // Remove participant
  const handleRemoveParticipant = useCallback(async (userId: string) => {
    if (!isAdmin) return;

    try {
      setIsLoading(true);
      await conversationsService.removeParticipant(conversation.id, userId);
      toast.success(t('conversationDetails.participantRemoved'));
    } catch (error) {
      console.error('Error removing participant:', error);
      toast.error(t('conversationDetails.removeParticipantError'));
    } finally {
      setIsLoading(false);
    }
  }, [conversation.id, isAdmin, t]);

  return {
    isAdmin,
    canModifyImage,
    isLoading,
    handleRemoveParticipant,
  };
}
