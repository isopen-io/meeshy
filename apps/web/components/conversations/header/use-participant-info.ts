import { useCallback } from 'react';
import type { Conversation, SocketIOUser as User } from '@meeshy/shared/types';
import type { Participant } from '@meeshy/shared/types/participant';
import { UserRoleEnum } from '@meeshy/shared/types';
import { getUserDisplayNameOrNull } from '@/utils/user-display-name';
import type { ParticipantInfo } from './types';

/** Type-safe accessor for participant.user which is typed as `unknown` in the shared schema */
type ParticipantUser = User & { sessionToken?: string; shareLinkId?: string };

function isAnonymousUser(user: unknown): boolean {
  return user && ('sessionToken' in user || 'shareLinkId' in user);
}

export function useParticipantInfo(
  conversation: Conversation,
  currentUser: User,
  conversationParticipants: Participant[]
) {
  const getConversationName = useCallback(() => {
    if (conversation.type !== 'direct') {
      return conversation.title || 'Groupe sans nom';
    }

    const otherParticipant = conversationParticipants.find(p => p.userId !== currentUser?.id);
    if (otherParticipant?.user) {
      const user = otherParticipant.user as ParticipantUser;
      const name = getUserDisplayNameOrNull(user);
      if (name) return name;
    }

    const convParticipants = (conversation as unknown).participants;
    if (Array.isArray(convParticipants) && convParticipants.length > 0) {
      const otherConvParticipant = convParticipants.find((p: unknown) => p.userId !== currentUser?.id);
      if (otherConvParticipant?.user) {
        const user = otherConvParticipant.user;
        const name = getUserDisplayNameOrNull(user);
        if (name) return name;
      }
    }

    const members = (conversation as unknown).participants;
    if (Array.isArray(members) && members.length > 0) {
      const otherMember = members.find((m: unknown) => m.userId !== currentUser?.id);
      if (otherMember?.user) {
        const user = otherMember.user;
        const name = getUserDisplayNameOrNull(user);
        if (name) return name;
      }
    }

    if (conversation.title) {
      const match = conversation.title.match(/^Conversation avec (.+)$/i);
      if (match && match[1]) {
        return match[1];
      }
      if (conversation.title !== 'Conversation privée') {
        return conversation.title;
      }
    }

    return 'Utilisateur';
  }, [conversation, currentUser, conversationParticipants]);

  const getConversationAvatar = useCallback(() => {
    const name = getConversationName();
    return name.slice(0, 2).toUpperCase();
  }, [getConversationName]);

  const getConversationAvatarUrl = useCallback(() => {
    if (conversation.type === 'direct') {
      const otherParticipant = conversationParticipants.find(p => p.userId !== currentUser?.id);
      if (otherParticipant?.user && (otherParticipant.user as ParticipantUser)?.avatar) {
        return (otherParticipant.user as ParticipantUser).avatar;
      }

      const otherConvParticipant = (conversation as unknown).participants?.find((p: unknown) => p.userId !== currentUser?.id);
      if (otherConvParticipant?.user?.avatar) {
        return otherConvParticipant.user.avatar;
      }

      if ((conversation as unknown).participants) {
        const otherMember = (conversation as unknown).participants.find((m: unknown) => m.userId !== currentUser?.id);
        return otherMember?.user?.avatar;
      }
    }
    return conversation.image || conversation.avatar;
  }, [conversation, currentUser, conversationParticipants]);

  const isOtherParticipantAnonymous = useCallback(() => {
    if (conversation.type === 'direct') {
      const otherParticipant = conversationParticipants.find(p => p.userId !== currentUser?.id);
      if (otherParticipant?.user) {
        return isAnonymousUser(otherParticipant.user);
      }

      const otherConvParticipant = (conversation as unknown).participants?.find((p: unknown) => p.userId !== currentUser?.id);
      if (otherConvParticipant?.user) {
        return isAnonymousUser(otherConvParticipant.user);
      }

      if ((conversation as unknown).participants) {
        const otherMember = (conversation as unknown).participants.find((m: unknown) => m.userId !== currentUser?.id);
        return otherMember?.user ? isAnonymousUser(otherMember.user) : false;
      }
    }
    return false;
  }, [conversation, currentUser, conversationParticipants]);

  const getOtherParticipantPresence = useCallback(() => {
    if (conversation.type !== 'direct') {
      return { otherUserId: undefined, presenceFallback: null };
    }

    const otherParticipant = conversationParticipants.find(p => p.userId !== currentUser?.id);
    if (otherParticipant) {
      return {
        otherUserId: otherParticipant.userId,
        presenceFallback: (otherParticipant.user as ParticipantUser | undefined) ?? null,
      };
    }

    const otherConvParticipant = (conversation as unknown).participants?.find((p: unknown) => p.userId !== currentUser?.id);
    return {
      otherUserId: otherConvParticipant?.userId,
      presenceFallback: otherConvParticipant?.user ?? null,
    };
  }, [conversation, conversationParticipants, currentUser?.id]);

  /**
   * Le RANG du lecteur DANS cette conversation — celui qui gouverne l'onglet de
   * configuration et la modification de l'image de groupe.
   *
   * L'ordre importe, et il a été la cause du blocage : ce hook lisait
   * `participant.role`, qui porte le rôle **PLATEFORME** ('USER', 'ADMIN'…), le
   * rang dans le fil vivant sous `conversationRole`
   * (`serializeConversationParticipant`, `packages/shared/utils/participant-helpers.ts`).
   * Un créateur de groupe ordinaire obtenait donc 'USER', et
   * `hasMinimumMemberRole('user', MODERATOR)` est faux : il ne pouvait modifier
   * ni le titre, ni la description, ni l'image de son propre groupe. Seul le
   * staff plateforme passait, par coïncidence de taxonomie.
   *
   * 1. `conversation.currentUserRole` — autorité serveur. La liste de
   *    participants est tronquée à cinq par le gateway : dans un groupe de six,
   *    le lecteur n'y figure pas, et aucune heuristique cliente ne peut trancher.
   * 2. `conversationRole` du participant — quand le serveur ne l'a pas dit.
   * 3. Le rôle plateforme — dernier recours, pour ne pas dégrader un lecteur
   *    face à un gateway antérieur qui ne calcule pas encore le rang.
   */
  const getCurrentUserRole = useCallback((): UserRoleEnum => {
    const servedRole = (conversation as { currentUserRole?: string | null } | undefined)?.currentUserRole;
    if (servedRole) return servedRole as UserRoleEnum;

    const currentUserParticipant = conversationParticipants.find(p => p.userId === currentUser?.id);
    const conversationRole = (currentUserParticipant as { conversationRole?: string } | undefined)?.conversationRole;
    if (conversationRole) return conversationRole as UserRoleEnum;

    return currentUser?.role as UserRoleEnum || UserRoleEnum.USER;
  }, [conversation, currentUser?.id, currentUser?.role, conversationParticipants]);

  const { otherUserId, presenceFallback } = getOtherParticipantPresence();

  const participantInfo: ParticipantInfo = {
    name: getConversationName(),
    avatar: getConversationAvatar(),
    avatarUrl: getConversationAvatarUrl(),
    otherUserId,
    presenceFallback,
    isAnonymous: isOtherParticipantAnonymous(),
    role: getCurrentUserRole(),
  };

  return {
    participantInfo,
    getCurrentUserRole,
  };
}
