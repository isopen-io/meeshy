'use client';

import { useState, useCallback } from 'react';
import { conversationsService } from '@/services/conversations.service';
import { toast } from 'sonner';
import type { Conversation, User } from '@meeshy/shared/types';
import { isGlobalAdmin, hasMinimumMemberRole, MemberRole } from '@meeshy/shared/types/role-types';
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
  const memberRole = userMembership?.role || 'member';
  const isAdmin = isGlobalAdmin(currentUser.role) ||
    hasMinimumMemberRole(memberRole.toLowerCase(), MemberRole.MODERATOR);

  // Check if user can modify image
  const canModifyImage = conversation.type !== 'direct' && isAdmin;

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
