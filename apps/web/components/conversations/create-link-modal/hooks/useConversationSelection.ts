'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Conversation, User } from '@meeshy/shared/types';
import { conversationsService } from '@/services/conversations.service';
import { authManager } from '@/services/auth-manager.service';
import { buildApiUrl, API_ENDPOINTS } from '@/lib/config';
import { useI18n } from '@/hooks/useI18n';
import { toast } from 'sonner';
import { NewConversationData } from '../types';

export function useConversationSelection(currentUser: User | null, isOpen: boolean) {
  const { t } = useI18n('modals');

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [conversationSearchQuery, setConversationSearchQuery] = useState('');
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);

  const [createNewConversation, setCreateNewConversation] = useState(false);
  const [newConversationData, setNewConversationData] = useState<NewConversationData>({
    title: '',
    description: '',
    memberIds: []
  });

  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const userSearchDebounce = useRef<NodeJS.Timeout | null>(null);

  const loadConversations = useCallback(async () => {
    setIsLoadingConversations(true);
    try {
      const conversationsData = await conversationsService.getConversations();
      const linkableConversations = (conversationsData.conversations || []).filter(
        (conv) => conv.type !== 'direct' && conv.type !== 'global'
      );
      setConversations(linkableConversations);
    } catch (error) {
      console.error('Error loading conversations:', error);
      toast.error(t('createLinkModal.errors.searchError'));
    } finally {
      setIsLoadingConversations(false);
    }
  }, [t]);

  const loadUsers = useCallback(
    async (searchQuery: string = '') => {
      const trimmedQuery = searchQuery.trim();
      if (!trimmedQuery || trimmedQuery.length < 2) {
        setAvailableUsers([]);
        return;
      }

      setIsLoadingUsers(true);
      try {
        const token = authManager.getAuthToken();
        const response = await fetch(
          buildApiUrl(`${API_ENDPOINTS.USER.SEARCH}?q=${encodeURIComponent(trimmedQuery)}`),
          {
            headers: { Authorization: `Bearer ${token}` }
          }
        );

        if (response.ok) {
          const users = await response.json();
          setAvailableUsers(users);
        } else {
          console.error('Error searching users');
        }
      } catch (error) {
        console.error('Error searching users:', error);
      } finally {
        setIsLoadingUsers(false);
      }
    },
    []
  );

  const filteredConversations = useMemo(() => {
    if (!conversationSearchQuery.trim()) return conversations;
    return conversations.filter(
      (conv) =>
        (conv.title && conv.title.toLowerCase().includes(conversationSearchQuery.toLowerCase())) ||
        (conv.description && conv.description.toLowerCase().includes(conversationSearchQuery.toLowerCase()))
    );
  }, [conversations, conversationSearchQuery]);

  const filteredUsers = useMemo(() => {
    if (!currentUser) return availableUsers;
    return availableUsers.filter((user) => user.id !== currentUser.id);
  }, [availableUsers, currentUser]);

  useEffect(() => {
    if (isOpen) {
      loadConversations();
    }
  }, [isOpen, loadConversations]);

  useEffect(() => {
    if (userSearchDebounce.current) {
      clearTimeout(userSearchDebounce.current);
    }

    const timeout = setTimeout(() => {
      loadUsers(userSearchQuery);
    }, 300);

    userSearchDebounce.current = timeout;

    return () => {
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, [userSearchQuery, loadUsers]);

  const reset = useCallback(() => {
    setSelectedConversationId(null);
    setCreateNewConversation(false);
    setNewConversationData({ title: '', description: '', memberIds: [] });
    setConversationSearchQuery('');
    setUserSearchQuery('');
    if (userSearchDebounce.current) {
      clearTimeout(userSearchDebounce.current);
      userSearchDebounce.current = null;
    }
  }, []);

  return {
    conversations,
    selectedConversationId,
    setSelectedConversationId,
    conversationSearchQuery,
    setConversationSearchQuery,
    isLoadingConversations,
    createNewConversation,
    setCreateNewConversation,
    newConversationData,
    setNewConversationData,
    availableUsers,
    filteredUsers,
    userSearchQuery,
    setUserSearchQuery,
    isLoadingUsers,
    filteredConversations,
    reset
  };
}
