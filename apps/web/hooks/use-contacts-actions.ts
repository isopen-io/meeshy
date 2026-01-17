import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { authManager } from '@/services/auth-manager.service';
import { buildApiUrl } from '@/lib/config';
import { User } from '@/types';

export function useContactsActions(
  t: (key: string) => string,
  getUserDisplayName: (user: User) => string,
  onRefresh?: () => Promise<void>
) {
  const router = useRouter();

  const startConversation = useCallback(async (userId: string, displayedUsers: User[]) => {
    try {
      if (!userId || userId.trim().length === 0) {
        toast.error(t('errors.invalidUser'));
        return;
      }

      const contact = displayedUsers.find(u => u.id === userId);
      if (!contact) return;

      const token = authManager.getAuthToken();
      if (!token) {
        router.push('/login');
        return;
      }

      const currentUser = JSON.parse(JSON.stringify(authManager.getCurrentUser() || {}) || '{}');
      const currentUserName = currentUser.displayName || `${currentUser.firstName} ${currentUser.lastName}`.trim() || currentUser.username;
      const contactName = getUserDisplayName(contact);
      const conversationTitle = `${currentUserName} & ${contactName}`;

      const response = await fetch(buildApiUrl('/conversations'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          title: conversationTitle,
          type: 'direct',
          participantIds: [userId]
        })
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          toast.success(t('success.conversationCreated'));
          router.push(`/conversations/${result.data.id}`);
        } else {
          throw new Error(result.error || t('errors.conversationCreationError'));
        }
      } else {
        const error = await response.json();
        throw new Error(error.error || t('errors.conversationCreationError'));
      }
    } catch (error) {
      console.error('Erreur lors de la création de la conversation:', error);
      toast.error(error instanceof Error ? error.message : t('errors.conversationCreationError'));
    }
  }, [router, t, getUserDisplayName]);

  const handleFriendRequest = useCallback(async (requestId: string, action: 'accept' | 'reject') => {
    try {
      const token = authManager.getAuthToken();
      if (!token) return;

      const response = await fetch(buildApiUrl(`/users/friend-requests/${requestId}`), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ action })
      });

      if (response.ok) {
        toast.success(action === 'accept' ? t('success.friendRequestAccepted') : t('success.friendRequestRejected'));
        await onRefresh?.();
      } else {
        const error = await response.json();
        toast.error(error.error || t('errors.updateError'));
      }
    } catch (error) {
      console.error('Erreur friend request:', error);
      toast.error(t('errors.updateError'));
    }
  }, [t, onRefresh]);

  const sendFriendRequest = useCallback(async (userId: string, onSuccess?: () => Promise<void>) => {
    try {
      const token = authManager.getAuthToken();
      if (!token) return;

      const response = await fetch(buildApiUrl('/users/friend-requests'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ receiverId: userId })
      });

      if (response.ok) {
        toast.success(t('success.friendRequestSent'));
        await onSuccess?.();
      } else {
        const error = await response.json();
        toast.error(error.error || t('errors.sendError'));
      }
    } catch (error) {
      console.error('Erreur envoi friend request:', error);
      toast.error(t('errors.sendError'));
    }
  }, [t]);

  const cancelFriendRequest = useCallback(async (requestId: string, onSuccess?: () => Promise<void>) => {
    try {
      const token = authManager.getAuthToken();
      if (!token) return;

      const response = await fetch(buildApiUrl(`/users/friend-requests/${requestId}`), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ action: 'cancel' })
      });

      if (response.ok) {
        toast.success(t('success.friendRequestCancelled'));
        await onSuccess?.();
      } else {
        const error = await response.json();
        toast.error(error.error || t('errors.updateError'));
      }
    } catch (error) {
      console.error('Erreur annulation friend request:', error);
      toast.error(t('errors.updateError'));
    }
  }, [t]);

  return {
    startConversation,
    handleFriendRequest,
    sendFriendRequest,
    cancelFriendRequest
  };
}
