'use client';

import { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usersService } from '@/services/users.service';
import { useWebSocket } from '@/hooks/use-websocket';
import { queryKeys } from '@/lib/react-query/query-keys';
import type { User, UserStatusEvent } from '@meeshy/shared/types';
import type { ContactSortOption } from '@/types/contacts';

export interface ContactV2 {
  id: string;
  name: string;
  username: string;
  avatar?: string;
  languageCode: string;
  isOnline: boolean;
  lastSeen?: string;
  lastActiveAt?: string;
  createdAt?: string;
}

export interface UseContactsV2Options {
  enabled?: boolean;
}

export interface ContactsV2Return {
  contacts: ContactV2[];
  onlineContacts: ContactV2[];
  offlineContacts: ContactV2[];
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  searchResults: ContactV2[];
  isSearching: boolean;
  isLoading: boolean;
  onlineUserIds: Set<string>;
  sortBy: ContactSortOption;
  setSortBy: (sort: ContactSortOption) => void;
  refreshContacts: () => Promise<void>;
  error: string | null;
}

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
    languageCode: user.systemLanguage || user.regionalLanguage || 'fr',
    isOnline,
    lastSeen: usersService.getLastSeenFormatted(user),
    lastActiveAt: user.lastActiveAt ? String(user.lastActiveAt) : undefined,
    createdAt: 'createdAt' in user ? String((user as unknown as Record<string, unknown>).createdAt) : undefined,
  };
}

function safeTime(dateStr?: string): number {
  if (!dateStr) return 0;
  const t = new Date(dateStr).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function sortContacts(contacts: ContactV2[], sortBy: ContactSortOption): ContactV2[] {
  return [...contacts].sort((a, b) => {
    switch (sortBy) {
      case 'name':
        return a.name.localeCompare(b.name);
      case 'lastSeen': {
        const aTime = safeTime(a.lastActiveAt);
        const bTime = safeTime(b.lastActiveAt);
        return bTime - aTime;
      }
      case 'recentlyAdded': {
        const aTime = safeTime(a.createdAt);
        const bTime = safeTime(b.createdAt);
        return bTime - aTime;
      }
      default:
        return 0;
    }
  });
}

export function useContactsV2(options: UseContactsV2Options = {}): ContactsV2Return {
  const { enabled = true } = options;
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQueryRaw] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<ContactSortOption>('name');
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const setSearchQuery = useCallback((query: string) => {
    setSearchQueryRaw(query);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setDebouncedSearch(query), 300);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

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

  const {
    data: searchData,
    isLoading: isSearching,
  } = useQuery({
    queryKey: [...queryKeys.users.all, 'search', debouncedSearch],
    queryFn: async () => {
      const results = await usersService.searchUsers(debouncedSearch);
      return Array.isArray(results) ? results : [];
    },
    enabled: debouncedSearch.length >= 2,
  });

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

  useWebSocket({ onUserStatus: handleUserStatus });

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

  const contacts = useMemo(() => {
    if (!users || !Array.isArray(users)) return [];
    const transformed = users.map((user) => transformToContact(user, onlineUserIds.has(user.id)));
    return sortContacts(transformed, sortBy);
  }, [users, onlineUserIds, sortBy]);

  const onlineContacts = useMemo(() => contacts.filter((c) => c.isOnline), [contacts]);
  const offlineContacts = useMemo(() => contacts.filter((c) => !c.isOnline), [contacts]);

  const searchResults = useMemo(() => {
    if (!searchData || !Array.isArray(searchData)) return [];
    const transformed = searchData.map((user) =>
      transformToContact(user, onlineUserIds.has(user.id))
    );
    return sortContacts(transformed, sortBy);
  }, [searchData, onlineUserIds, sortBy]);

  const filteredContacts = useMemo(() => {
    if (!debouncedSearch || debouncedSearch.length < 2) return contacts;
    const query = debouncedSearch.toLowerCase();
    return contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(query) || c.username.toLowerCase().includes(query)
    );
  }, [contacts, debouncedSearch]);

  const refreshContacts = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return {
    contacts: debouncedSearch.length >= 2 ? filteredContacts : contacts,
    onlineContacts,
    offlineContacts,
    searchQuery,
    setSearchQuery,
    searchResults: debouncedSearch.length >= 2 ? searchResults : [],
    isSearching,
    isLoading,
    onlineUserIds,
    sortBy,
    setSortBy,
    refreshContacts,
    error: error?.message ?? null,
  };
}
