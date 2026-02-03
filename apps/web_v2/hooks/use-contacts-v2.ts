/**
 * Hook for V2 Contacts Management
 *
 * Provides contact list, search, and online status tracking.
 * Replaces mock data in /v2/contacts page.
 */

'use client';

import { useCallback, useMemo, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersService } from '@/services/users.service';
import { useWebSocket } from '@/hooks/use-websocket';
import { queryKeys } from '@/lib/react-query/query-keys';
import type { User, UserStatusEvent } from '@meeshy/shared/types';

export interface ContactV2 {
  id: string;
  name: string;
  username: string;
  avatar?: string;
  languageCode: string;
  isOnline: boolean;
  lastSeen?: string;
}

export interface UseContactsV2Options {
  enabled?: boolean;
}

export interface ContactsV2Return {
  // Data
  contacts: ContactV2[];
  onlineContacts: ContactV2[];
  offlineContacts: ContactV2[];

  // Search
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  searchResults: ContactV2[];
  isSearching: boolean;

  // Loading states
  isLoading: boolean;

  // Online users tracking
  onlineUserIds: Set<string>;

  // Actions
  refreshContacts: () => Promise<void>;

  // Error
  error: string | null;
}

/**
 * Transform User to ContactV2 format
 */
function transformToContact(user: User, isOnline: boolean): ContactV2 {
  const displayName =
    user.displayName ||
    `${user.firstName || ''} ${user.lastName || ''}`.trim() ||
    user.username;

  return {
    id: user.id,
    name: displayName,
    username: `@${user.username}`,
    avatar: user.avatar,
    languageCode: (user as any).systemLanguage || (user as any).regionalLanguage || 'fr',
    isOnline,
    lastSeen: usersService.getLastSeenFormatted(user),
  };
}

/**
 * Format last seen time
 */
function formatLastSeen(date: Date | string | undefined): string {
  if (!date) return '';

  const now = new Date();
  const lastSeenDate = typeof date === 'string' ? new Date(date) : date;
  const diffMs = now.getTime() - lastSeenDate.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'En ligne';
  if (diffMins < 60) return `Il y a ${diffMins} min`;
  if (diffHours < 24) return `Il y a ${diffHours}h`;
  if (diffDays < 7) return `Il y a ${diffDays}j`;

  return lastSeenDate.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
  });
}

export function useContactsV2(options: UseContactsV2Options = {}): ContactsV2Return {
  const { enabled = true } = options;
  const queryClient = useQueryClient();

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());

  // Query for all users (contacts)
  // In a real app, this would be a dedicated contacts endpoint
  const {
    data: users,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: [...queryKeys.users.all, 'contacts'],
    queryFn: async () => {
      const response = await usersService.getAllUsers();
      return response.data || [];
    },
    enabled,
  });

  // Search query
  const {
    data: searchData,
    isLoading: isSearching,
  } = useQuery({
    queryKey: [...queryKeys.users.all, 'search', searchQuery],
    queryFn: async () => {
      const response = await usersService.searchUsers(searchQuery);
      return response.data || [];
    },
    enabled: searchQuery.length >= 2,
  });

  // Handle user status events from WebSocket
  const handleUserStatus = useCallback((event: UserStatusEvent) => {
    setOnlineUserIds((prev) => {
      const next = new Set(prev);
      if (event.isOnline) {
        next.add(event.userId);
      } else {
        next.delete(event.userId);
      }
      return next;
    });
  }, []);

  // WebSocket for real-time status updates
  useWebSocket({
    onUserStatus: handleUserStatus,
  });

  // Initialize online status from user data
  useEffect(() => {
    if (users && Array.isArray(users)) {
      const online = new Set<string>();
      users.forEach((user) => {
        if (usersService.isUserOnline(user)) {
          online.add(user.id);
        }
      });
      setOnlineUserIds(online);
    }
  }, [users]);

  // Transform users to contacts
  const contacts = useMemo(() => {
    if (!users || !Array.isArray(users)) return [];
    return users.map((user) => transformToContact(user, onlineUserIds.has(user.id)));
  }, [users, onlineUserIds]);

  // Split by online status
  const onlineContacts = useMemo(() => {
    return contacts.filter((c) => c.isOnline);
  }, [contacts]);

  const offlineContacts = useMemo(() => {
    return contacts.filter((c) => !c.isOnline);
  }, [contacts]);

  // Search results
  const searchResults = useMemo(() => {
    if (!searchData || !Array.isArray(searchData)) return [];
    return searchData.map((user) => transformToContact(user, onlineUserIds.has(user.id)));
  }, [searchData, onlineUserIds]);

  // Filter contacts by search query (local filter for already loaded contacts)
  const filteredContacts = useMemo(() => {
    if (!searchQuery || searchQuery.length < 2) return contacts;

    const query = searchQuery.toLowerCase();
    return contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(query) || c.username.toLowerCase().includes(query)
    );
  }, [contacts, searchQuery]);

  // Actions
  const refreshContacts = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return {
    contacts: searchQuery.length >= 2 ? filteredContacts : contacts,
    onlineContacts,
    offlineContacts,
    searchQuery,
    setSearchQuery,
    searchResults: searchQuery.length >= 2 ? searchResults : [],
    isSearching,
    isLoading,
    onlineUserIds,
    refreshContacts,
    error: error?.message ?? null,
  };
}
