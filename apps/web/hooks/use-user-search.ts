import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { apiService } from '@/services/api.service';
import { useI18n } from '@/hooks/useI18n';
import type { User } from '@/types';

interface UseUserSearchReturn {
  availableUsers: User[];
  isLoading: boolean;
  searchUsers: (query: string) => Promise<void>;
}

/**
 * Hook pour rechercher des utilisateurs
 * Gère le debouncing et la validation des résultats
 */
export function useUserSearch(
  currentUserId: string,
  selectedUsers: User[]
): UseUserSearchReturn {
  const { t } = useI18n('modals');
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const searchUsers = useCallback(async (query: string) => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery || trimmedQuery.length < 2) {
      setAvailableUsers([]);
      return;
    }

    setIsLoading(true);
    try {
      const response = await apiService.get<{ success: boolean; data: User[] }>(
        `/users/search?q=${encodeURIComponent(trimmedQuery)}`
      );

      if (response.data?.success && Array.isArray(response.data.data)) {
        const users = response.data.data;
        const filteredUsers = users.filter((user: User) =>
          user.id !== currentUserId &&
          !selectedUsers.some(selected => selected.id === user.id)
        );
        setAvailableUsers(filteredUsers);
      } else {
        const users = Array.isArray(response.data) ? response.data : [];
        const filteredUsers = users.filter((user: User) =>
          user.id !== currentUserId &&
          !selectedUsers.some(selected => selected.id === user.id)
        );
        setAvailableUsers(filteredUsers);
      }
    } catch (error) {
      console.error('Erreur recherche utilisateurs:', error);
      toast.error(t('createConversationModal.errors.searchError'));
    } finally {
      setIsLoading(false);
    }
  }, [currentUserId, selectedUsers, t]);

  return {
    availableUsers,
    isLoading,
    searchUsers
  };
}

/**
 * Hook pour gérer la sélection d'utilisateurs
 */
export function useUserSelection() {
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);

  const toggleUserSelection = useCallback((user: User) => {
    setSelectedUsers(prev => {
      const isSelected = prev.some(u => u.id === user.id);
      if (isSelected) {
        return prev.filter(u => u.id !== user.id);
      } else {
        return [...prev, user];
      }
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedUsers([]);
  }, []);

  return {
    selectedUsers,
    toggleUserSelection,
    clearSelection
  };
}
