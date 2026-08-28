'use client';

import { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usersService } from '@/services/users.service';
import { useFriendRequestsV2 } from './use-friend-requests-v2';
import { useUser } from '@/stores';
import { useWebSocket } from '@/hooks/use-websocket';
import { queryKeys } from '@/lib/react-query/query-keys';
import { resolveUserLanguagesOrdered } from '@meeshy/shared/utils/conversation-helpers';
import type { User, UserStatusEvent } from '@meeshy/shared/types';
import type { ContactSortOption } from '@/types/contacts';

export interface ContactV2 {
  id: string;
  name: string;
  username: string;
  avatar?: string;
  languageCode: string;
  isOnline: boolean;
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
    languageCode: resolveUserLanguagesOrdered(user, { deviceLocale: user.deviceLocale })[0] ?? 'fr',
    isOnline,
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

  // Les contacts sont les AMITIÉS ACCEPTÉES, jamais « tous les comptes de la
  // plateforme ».
  //
  // Cette liste venait de `GET /users`, une route qui rendait
  // `{ message: 'Get all users - to be implemented' }` — un stub, servi en 200
  // et SANS authentification (mesuré en intégration). La liste de contacts n'a
  // donc jamais affiché personne, et `response.data || []` rendait l'objet du
  // message plutôt qu'un tableau (#4185).
  //
  // Elle n'est pas recâblée sur un équivalent réel de « tous les utilisateurs » :
  // servir l'annuaire entier de la plateforme comme carnet d'adresses serait un
  // défaut de confidentialité, pas une fonctionnalité. `useFriendRequestsV2`
  // pagine déjà `/users/friend-requests?status=accepted` jusqu'à épuisement, dans
  // les DEUX sens — on le CONSOMME plutôt que de réécrire cette pagination, qui
  // porte ses propres bornes et son propre plafond.
  const currentUser = useUser();
  const {
    connected,
    isLoading,
    error: friendsError,
    refresh: refreshFriends,
  } = useFriendRequestsV2({ enabled, currentUserId: currentUser?.id });

  const users = useMemo<User[]>(() => {
    if (!currentUser?.id) return [];
    return connected
      .map((relation) =>
        relation.senderId === currentUser.id ? relation.receiver : relation.sender
      )
      .filter((autre): autre is User => Boolean(autre));
  }, [connected, currentUser?.id]);

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
    await refreshFriends();
  }, [refreshFriends]);

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
    error: friendsError,
  };
}
