import { useCallback } from 'react';
import { UserRoleEnum } from '@meeshy/shared/types';
import type { Conversation } from '@meeshy/shared/types';

export function usePermissions(
  conversation: Conversation,
  currentUserRole: UserRoleEnum,
  currentUser: any
) {
  const canUseVideoCalls = useCallback((): boolean => {
    const role = currentUser?.role as UserRoleEnum;
    return [
      UserRoleEnum.BIGBOSS,
      UserRoleEnum.ADMIN,
      UserRoleEnum.MODO,
      UserRoleEnum.MODERATOR,
      UserRoleEnum.AUDIT,
      UserRoleEnum.ANALYST
    ].includes(role);
  }, [currentUser?.role]);

  const canModifyConversationImage = useCallback((): boolean => {
    if (conversation.type === 'direct') return false;

    return [
      UserRoleEnum.BIGBOSS,
      UserRoleEnum.ADMIN,
      UserRoleEnum.MODO,
      UserRoleEnum.MODERATOR,
      UserRoleEnum.AUDIT,
      UserRoleEnum.ANALYST,
      UserRoleEnum.CREATOR
    ].includes(currentUserRole);
  }, [conversation.type, currentUserRole]);

  return {
    canUseVideoCalls,
    canModifyConversationImage,
  };
}
