import { useCallback } from 'react';
import { useUserStore } from '@/stores/user-store';
import { getUserStatus, type UserStatus } from '@/lib/user-status';
import type { Conversation, SocketIOUser as User, ThreadMember } from '@meeshy/shared/types';
import { UserRoleEnum } from '@meeshy/shared/types';
import type { ParticipantInfo } from './types';

function isAnonymousUser(user: any): boolean {
  return user && ('sessionToken' in user || 'shareLinkId' in user);
}

export function useParticipantInfo(
  conversation: Conversation,
  currentUser: User,
  conversationParticipants: ThreadMember[]
) {
  const userStore = useUserStore();
  const _lastStatusUpdate = userStore._lastStatusUpdate;

  const getConversationName = useCallback(() => {
    if (conversation.type !== 'direct') {
      return conversation.title || 'Groupe sans nom';
    }

    const otherParticipant = conversationParticipants.find(p => p.userId !== currentUser?.id);
    if (otherParticipant?.user) {
      const user = otherParticipant.user;
      const name = user.displayName || user.username ||
             (user.firstName || user.lastName ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : null);
      if (name) return name;
    }

    const convParticipants = (conversation as any).participants;
    if (Array.isArray(convParticipants) && convParticipants.length > 0) {
      const otherConvParticipant = convParticipants.find((p: any) => p.userId !== currentUser?.id);
      if (otherConvParticipant?.user) {
        const user = otherConvParticipant.user;
        const name = user.displayName || user.username ||
               (user.firstName || user.lastName ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : null);
        if (name) return name;
      }
    }

    const members = (conversation as any).members;
    if (Array.isArray(members) && members.length > 0) {
      const otherMember = members.find((m: any) => m.userId !== currentUser?.id);
      if (otherMember?.user) {
        const user = otherMember.user;
        const name = user.displayName || user.username ||
               (user.firstName || user.lastName ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : null);
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
      if (otherParticipant?.user?.avatar) {
        return otherParticipant.user.avatar;
      }

      const otherConvParticipant = (conversation as any).participants?.find((p: any) => p.userId !== currentUser?.id);
      if (otherConvParticipant?.user?.avatar) {
        return otherConvParticipant.user.avatar;
      }

      if ((conversation as any).members) {
        const otherMember = (conversation as any).members.find((m: any) => m.userId !== currentUser?.id);
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

      const otherConvParticipant = (conversation as any).participants?.find((p: any) => p.userId !== currentUser?.id);
      if (otherConvParticipant?.user) {
        return isAnonymousUser(otherConvParticipant.user);
      }

      if ((conversation as any).members) {
        const otherMember = (conversation as any).members.find((m: any) => m.userId !== currentUser?.id);
        return otherMember?.user ? isAnonymousUser(otherMember.user) : false;
      }
    }
    return false;
  }, [conversation, currentUser, conversationParticipants]);

  const getOtherParticipantStatus = useCallback((): UserStatus => {
    if (conversation.type === 'direct') {
      let otherUserId: string | undefined;
      const otherParticipant = conversationParticipants.find(p => p.userId !== currentUser?.id);
      if (otherParticipant) {
        otherUserId = otherParticipant.userId;
      } else {
        const otherConvParticipant = (conversation as any).participants?.find((p: any) => p.userId !== currentUser?.id);
        otherUserId = otherConvParticipant?.userId;
      }

      if (otherUserId) {
        const userFromStore = userStore.getUserById(otherUserId);
        if (userFromStore) {
          return getUserStatus(userFromStore);
        }

        if (otherParticipant?.user) {
          return getUserStatus(otherParticipant.user);
        }
      }

      return 'offline';
    }
    return 'online';
  }, [conversation, conversationParticipants, currentUser?.id, userStore, _lastStatusUpdate]);

  const getCurrentUserRole = useCallback((): UserRoleEnum => {
    if (!conversation || !currentUser?.id || !conversationParticipants.length) {
      return currentUser?.role as UserRoleEnum || UserRoleEnum.USER;
    }

    const currentUserParticipant = conversationParticipants.find(p => p.userId === currentUser.id);
    return currentUserParticipant?.role as UserRoleEnum || currentUser?.role as UserRoleEnum || UserRoleEnum.USER;
  }, [conversation, currentUser?.id, currentUser?.role, conversationParticipants]);

  const participantInfo: ParticipantInfo = {
    name: getConversationName(),
    avatar: getConversationAvatar(),
    avatarUrl: getConversationAvatarUrl(),
    status: getOtherParticipantStatus(),
    isAnonymous: isOtherParticipantAnonymous(),
    role: getCurrentUserRole(),
  };

  return {
    participantInfo,
    getCurrentUserRole,
  };
}
