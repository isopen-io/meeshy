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

  /**
   * `currentUserRole` porte DEUX taxonomies selon ce que le serveur a pu dire :
   * le rang dans la conversation ('creator', 'admin', 'moderator', 'member') ou,
   * à défaut, le rôle plateforme ('BIGBOSS', 'ADMIN'…). Cf. `getCurrentUserRole`
   * dans `use-participant-info.ts`.
   *
   * Ce gate ne testait que la seconde. Or aucun de ces titres ne se gagne en
   * créant un groupe : le créateur est un `USER` ordinaire dont le rang vit dans
   * la conversation. Il ne pouvait donc pas changer l'image de son propre
   * groupe, quand un ANALYST de la plateforme le pouvait sur n'importe lequel.
   *
   * Les deux taxonomies sont admises — c'est ce que le gateway lui-même
   * accepte : `creator`/`admin`/`moderator` de la conversation, OU un rang
   * plateforme d'intervention.
   */
  const canModifyConversationImage = useCallback((): boolean => {
    if (conversation.type === 'direct') return false;

    const role = String(currentUserRole ?? '');

    const conversationRanks = ['creator', 'admin', 'moderator'];
    if (conversationRanks.includes(role.toLowerCase())) return true;

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
