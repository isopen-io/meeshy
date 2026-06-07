import { useCallback } from 'react';
import { UserRoleEnum } from '@meeshy/shared/types';
import type { Conversation } from '@meeshy/shared/types';

export function usePermissions(
  conversation: Conversation,
  currentUserRole: UserRoleEnum,
  currentUser: unknown
) {
  const canUseVideoCalls = useCallback((): boolean => {
    // Appels audio/vidéo disponibles pour TOUT utilisateur authentifié.
    // La restriction « conversation directe » est appliquée au point d'usage
    // (HeaderToolbar : `conversation.type === 'direct'`). Plus de gate par
    // rôle — auparavant réservé au staff (BIGBOSS/ADMIN/MODERATOR/AUDIT/ANALYST).
    return Boolean(currentUser);
  }, [currentUser]);

  const canModifyConversationImage = useCallback((): boolean => {
    if (conversation.type === 'direct') return false;

    return [
      UserRoleEnum.BIGBOSS,
      UserRoleEnum.ADMIN,
      UserRoleEnum.MODERATOR,
      UserRoleEnum.AUDIT,
      UserRoleEnum.ANALYST
    ].includes(currentUserRole);
  }, [conversation.type, currentUserRole]);

  return {
    canUseVideoCalls,
    canModifyConversationImage,
  };
}
