import { useState, useCallback, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import type { User } from '@/types';
import { authManager } from '@/services/auth-manager.service';
import { buildApiUrl } from '@/lib/config';

export function useGroupModal(currentUserId?: string) {
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [isGroupPrivate, setIsGroupPrivate] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [groupSearchQuery, setGroupSearchQuery] = useState('');
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);

  const selectedUsersRef = useRef(selectedUsers);

  useEffect(() => {
    selectedUsersRef.current = selectedUsers;
  }, [selectedUsers]);

  const loadUsers = useCallback(
    async (searchQuery: string = '') => {
      setIsLoadingUsers(true);
      try {
        const token = authManager.getAuthToken();
        if (!token) return;

        const trimmedQuery = searchQuery.trim();
        const url =
          trimmedQuery && trimmedQuery.length >= 2
            ? `${buildApiUrl('/users/search')}?q=${encodeURIComponent(trimmedQuery)}`
            : buildApiUrl('/users');

        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (response.ok) {
          const data = await response.json();
          const users = (data.data || data.users || []).filter(
            (fetchedUser: User) =>
              fetchedUser.id !== currentUserId &&
              !selectedUsersRef.current.some((selected) => selected.id === fetchedUser.id)
          );
          setAvailableUsers(users);
        } else {
          console.error('API error:', response.status, response.statusText);
          toast.error('Error loading users');
        }
      } catch (error) {
        console.error('Error loading users:', error);
        toast.error('Error loading users');
      } finally {
        setIsLoadingUsers(false);
      }
    },
    [currentUserId]
  );

  const toggleUserSelection = useCallback((userToToggle: User) => {
    setSelectedUsers((prev) => {
      const isSelected = prev.some((u) => u.id === userToToggle.id);
      if (isSelected) {
        return prev.filter((u) => u.id !== userToToggle.id);
      } else {
        return [...prev, userToToggle];
      }
    });
  }, []);

  const resetForm = useCallback(() => {
    setGroupName('');
    setGroupDescription('');
    setIsGroupPrivate(false);
    setSelectedUsers([]);
    setGroupSearchQuery('');
    setAvailableUsers([]);
  }, []);

  const createGroup = useCallback(async () => {
    if (!groupName.trim()) {
      toast.error('Please enter a group name');
      return null;
    }

    setIsCreatingGroup(true);
    try {
      const token = authManager.getAuthToken();

      const response = await fetch(buildApiUrl('/groups'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: groupName.trim(),
          description: groupDescription.trim() || undefined,
          isPrivate: isGroupPrivate,
          memberIds: selectedUsers.map((u) => u.id),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        toast.success('Group created successfully');
        resetForm();
        return data.group.id;
      } else {
        const error = await response.json();
        toast.error(error.message || 'Error creating group');
        return null;
      }
    } catch (error) {
      console.error('Error creating group:', error);
      toast.error('Error creating group');
      return null;
    } finally {
      setIsCreatingGroup(false);
    }
  }, [groupName, groupDescription, isGroupPrivate, selectedUsers, resetForm]);

  return {
    groupName,
    setGroupName,
    groupDescription,
    setGroupDescription,
    isGroupPrivate,
    setIsGroupPrivate,
    availableUsers,
    selectedUsers,
    groupSearchQuery,
    setGroupSearchQuery,
    isLoadingUsers,
    isCreatingGroup,
    loadUsers,
    toggleUserSelection,
    resetForm,
    createGroup,
  };
}
