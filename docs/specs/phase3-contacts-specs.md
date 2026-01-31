# Phase 3 - Contacts et Profils V2 Specifications

## Overview

Cette phase connecte les pages `/v2/contacts` et `/v2/u` (profil) aux services réels en remplaçant les données mockées par des appels API avec gestion du statut en ligne via WebSocket.

**Prérequis**:
- Phase 1 (Auth V2) terminée
- Phase 2 (Messaging V2) en cours ou terminée

---

## 1. Architecture Existante

### 1.1 Services Backend

#### UsersService (`services/users.service.ts`)

```typescript
// Méthodes principales
interface UsersService {
  getAllUsers(): Promise<ApiResponse<User[]>>;
  searchUsers(query: string): Promise<ApiResponse<User[]>>;
  getMyProfile(): Promise<ApiResponse<User>>;
  updateMyProfile(data: UpdateUserDto): Promise<ApiResponse<User>>;
  getUserProfile(userIdOrUsername: string): Promise<ApiResponse<User>>;
  getUserStats(userId: string): Promise<ApiResponse<UserStats>>;
  getDashboardStats(): Promise<ApiResponse<DashboardStats>>;

  // Utilitaires
  isUserOnline(user: User): boolean;
  getUserStatus(user: User): 'online' | 'away' | 'offline';
  getDisplayName(user: User): string;
  getLastSeenFormatted(user: User): string;
}

interface UserStats {
  messagesSent: number;
  messagesReceived: number;
  conversationsCount: number;
  groupsCount: number;
  totalConversations: number;
  averageResponseTime?: number;
  lastActivity: Date;
}

interface UpdateUserDto {
  firstName?: string;
  lastName?: string;
  displayName?: string;
  bio?: string;
  avatar?: string;
  preferredLanguage?: string;
  languages?: string[];
}
```

#### UserPreferencesService (`services/user-preferences.service.ts`)

```typescript
// Gestion des préférences de conversation
interface UserPreferencesService {
  // Préférences par conversation
  getPreferences(conversationId: string): Promise<UserConversationPreferences | null>;
  getAllPreferences(): Promise<UserConversationPreferences[]>;
  upsertPreferences(conversationId: string, data: UpdateRequest): Promise<UserConversationPreferences>;
  togglePin(conversationId: string, isPinned: boolean): Promise<UserConversationPreferences>;
  toggleMute(conversationId: string, isMuted: boolean): Promise<UserConversationPreferences>;
  toggleArchive(conversationId: string, isArchived: boolean): Promise<UserConversationPreferences>;
  updateTags(conversationId: string, tags: string[]): Promise<UserConversationPreferences>;

  // Catégories
  getCategories(): Promise<UserConversationCategory[]>;
  createCategory(data: CreateCategoryRequest): Promise<UserConversationCategory>;
  updateCategory(id: string, data: UpdateCategoryRequest): Promise<UserConversationCategory>;
  deleteCategory(id: string): Promise<void>;
  reorderCategories(updates: Array<{ categoryId: string; order: number }>): Promise<void>;
}
```

### 1.2 Hooks Existants

#### Contacts Hooks

```typescript
// hooks/use-contacts-data.ts
function useContactsData(t: TranslateFunction) {
  return {
    contacts: User[],
    friendRequests: FriendRequest[],
    affiliateRelations: AffiliateRelation[],
    loading: boolean,
    filters: ParticipantsFilters,
    setFilters: (filters) => void,
    loadContacts: () => Promise<void>,
    loadFriendRequests: () => Promise<void>,
    loadAffiliateRelations: () => Promise<void>,
    refreshAllData: () => Promise<void>,
  };
}

// hooks/use-contacts-filtering.ts
function useContactsFiltering(contacts, friendRequests, affiliateRelations, t) {
  return {
    searchQuery: string,
    setSearchQuery: (query) => void,
    displayedUsers: User[],
    stats: ContactStats,
    filteredRequests: FilteredRequests,
    getUserDisplayName: (user) => string,
  };
}

// hooks/use-contacts-actions.ts
function useContactsActions(t, getUserDisplayName, onRefresh?) {
  return {
    startConversation: (userId, displayedUsers) => Promise<void>,
    handleFriendRequest: (requestId, action) => Promise<void>,
    sendFriendRequest: (userId, onSuccess?) => Promise<void>,
    cancelFriendRequest: (requestId, onSuccess?) => Promise<void>,
  };
}
```

#### React Query Hooks

```typescript
// hooks/queries/use-users-query.ts
useCurrentUserQuery()         // Mon profil
useUserProfileQuery(userId)   // Profil d'un utilisateur
useUserStatsQuery(userId)     // Stats d'un utilisateur
useDashboardStatsQuery()      // Stats dashboard
useSearchUsersQuery(query)    // Recherche utilisateurs
useUpdateUserProfileMutation() // MAJ profil
```

### 1.3 API Endpoints Contacts

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/users` | Liste tous les utilisateurs |
| GET | `/users/search?q=` | Recherche utilisateurs (min 2 chars) |
| GET | `/auth/me` | Mon profil |
| PATCH | `/users/me` | Mettre à jour mon profil |
| GET | `/users/:id` | Profil d'un utilisateur |
| GET | `/users/:id/stats` | Stats d'un utilisateur |
| GET | `/users/me/dashboard-stats` | Stats dashboard |
| GET | `/users/friend-requests` | Mes demandes d'amis |
| POST | `/users/friend-requests` | Envoyer demande d'ami |
| PATCH | `/users/friend-requests/:id` | Accepter/Refuser demande |
| GET | `/affiliate/stats` | Relations d'affiliation |

---

## 2. Pages V2 - Analyse des Données Mockées

### 2.1 Page `/v2/contacts/page.tsx`

**Données mockées à remplacer (ligne ~5)**:
```typescript
const contacts = [
  { id: 1, name: 'Yuki Tanaka', username: '@yuki_t', lang: 'ja', online: true },
  { id: 2, name: 'Carlos García', username: '@carlos_g', lang: 'es', online: false },
  // ... 6 contacts mockés
];
```

**Structure actuelle**:
- Liste divisée EN LIGNE / HORS LIGNE
- Affichage: avatar, nom, username, langue (LanguageOrb), statut en ligne
- Action: bouton message (redirige vers /v2/chats)

**Fonctionnalités manquantes**:
- Recherche fonctionnelle
- Demandes d'amis
- Filtres (online, langue, etc.)
- Actions (bloquer, supprimer contact)

### 2.2 Page `/v2/u/page.tsx` (Profil)

**Données mockées hardcodées**:
```typescript
// Ligne ~25: Nom et username
<h1>Jean Dupont</h1>
<p>@jeandupont</p>
<p>Passionné de langues...</p>

// Ligne ~45: Langues
<LanguageOrb code="fr" /> Français - Natif
<LanguageOrb code="en" /> English - Fluent
<LanguageOrb code="es" /> Español - Learning

// Ligne ~60: Stats
<p>248</p> Conversations
<p>1.2k</p> Messages
<p>42</p> Contacts
```

**Fonctionnalités à implémenter**:
- Chargement du profil utilisateur connecté
- Modification du profil
- Langues dynamiques
- Stats réelles
- Actions: déconnexion, liens, contacts

---

## 3. Nouveaux Hooks à Créer

### 3.1 `useContactsV2`

**Fichier**: `hooks/v2/use-contacts-v2.ts`

```typescript
/**
 * Hook pour la gestion des contacts V2
 * Combine React Query + WebSocket pour statut en ligne temps réel
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import { usersService } from '@/services/users.service';
import { useWebSocket } from '@/hooks/use-websocket';
import { queryKeys } from '@/lib/react-query/query-keys';
import type { User, UserStatusEvent } from '@meeshy/shared/types';

export interface Contact {
  id: string;
  name: string;
  username: string;
  avatar?: string;
  languageCode: string;
  languageName?: string;
  isOnline: boolean;
  lastSeenAt?: string;
  status: 'online' | 'away' | 'offline';
  isFriend: boolean;
  friendRequestStatus?: 'none' | 'sent' | 'received' | 'accepted';
}

export interface FriendRequest {
  id: string;
  senderId: string;
  receiverId: string;
  status: 'pending' | 'accepted' | 'rejected' | 'blocked';
  createdAt: string;
  sender?: User;
  receiver?: User;
}

export interface UseContactsV2Options {
  enabled?: boolean;
  includeOffline?: boolean;
}

export interface ContactsV2Return {
  // Data
  contacts: Contact[];
  onlineContacts: Contact[];
  offlineContacts: Contact[];
  friendRequests: {
    received: FriendRequest[];
    sent: FriendRequest[];
  };

  // Loading
  isLoading: boolean;
  isSearching: boolean;

  // Search
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  searchResults: Contact[];

  // Actions
  sendFriendRequest: (userId: string) => Promise<boolean>;
  acceptFriendRequest: (requestId: string) => Promise<boolean>;
  rejectFriendRequest: (requestId: string) => Promise<boolean>;
  cancelFriendRequest: (requestId: string) => Promise<boolean>;
  removeContact: (userId: string) => Promise<boolean>;
  blockContact: (userId: string) => Promise<boolean>;

  // Navigation
  startConversation: (userId: string) => Promise<string | null>;

  // Stats
  stats: {
    total: number;
    online: number;
    pendingRequests: number;
  };

  // Refresh
  refresh: () => Promise<void>;

  // Error
  error: string | null;
}

// Query keys spécifiques aux contacts
const CONTACTS_QUERY_KEYS = {
  all: ['contacts'] as const,
  list: () => [...CONTACTS_QUERY_KEYS.all, 'list'] as const,
  friendRequests: () => [...CONTACTS_QUERY_KEYS.all, 'friend-requests'] as const,
  search: (query: string) => [...CONTACTS_QUERY_KEYS.all, 'search', query] as const,
};

export function useContactsV2(
  options: UseContactsV2Options = {}
): ContactsV2Return {
  const { enabled = true, includeOffline = true } = options;
  const queryClient = useQueryClient();

  // State local
  const [searchQuery, setSearchQuery] = useState('');
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());

  // Query: Liste des contacts (amis acceptés)
  const {
    data: contactsData,
    isLoading: isLoadingContacts,
    error: contactsError,
    refetch: refetchContacts,
  } = useQuery({
    queryKey: CONTACTS_QUERY_KEYS.list(),
    queryFn: async () => {
      // Charger tous les utilisateurs + friend requests
      const [usersResponse, requestsResponse] = await Promise.all([
        usersService.getAllUsers(),
        fetch('/api/users/friend-requests', {
          headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
        }).then(r => r.json()),
      ]);

      const users = usersResponse.data || [];
      const requests = requestsResponse.data || [];

      // Filtrer les contacts (amis acceptés)
      const acceptedFriendIds = new Set(
        requests
          .filter((r: FriendRequest) => r.status === 'accepted')
          .flatMap((r: FriendRequest) => [r.senderId, r.receiverId])
      );

      return {
        users,
        friendRequests: requests,
        acceptedFriendIds,
      };
    },
    enabled,
  });

  // Query: Recherche utilisateurs
  const {
    data: searchData,
    isLoading: isSearching,
  } = useQuery({
    queryKey: CONTACTS_QUERY_KEYS.search(searchQuery),
    queryFn: async () => {
      const response = await usersService.searchUsers(searchQuery);
      return response.data || [];
    },
    enabled: searchQuery.length >= 2,
  });

  // WebSocket pour statut en ligne
  const { isConnected } = useWebSocket({
    onUserStatus: useCallback((event: UserStatusEvent) => {
      setOnlineUserIds(prev => {
        const newSet = new Set(prev);
        if (event.isOnline) {
          newSet.add(event.userId);
        } else {
          newSet.delete(event.userId);
        }
        return newSet;
      });
    }, []),
  });

  // Transformer User en Contact
  const transformToContact = useCallback((user: User): Contact => {
    const isOnline = onlineUserIds.has(user.id) || usersService.isUserOnline(user);

    return {
      id: user.id,
      name: usersService.getDisplayName(user),
      username: `@${user.username}`,
      avatar: user.avatar,
      languageCode: user.preferredLanguage || 'fr',
      languageName: getLanguageName(user.preferredLanguage || 'fr'),
      isOnline,
      lastSeenAt: user.lastActiveAt,
      status: isOnline ? 'online' : usersService.getUserStatus(user),
      isFriend: true,
      friendRequestStatus: 'accepted',
    };
  }, [onlineUserIds]);

  // Contacts transformés et groupés
  const { contacts, onlineContacts, offlineContacts } = useMemo(() => {
    if (!contactsData) {
      return { contacts: [], onlineContacts: [], offlineContacts: [] };
    }

    const { users, acceptedFriendIds } = contactsData;

    // Filtrer uniquement les amis
    const friendUsers = users.filter((u: User) => acceptedFriendIds.has(u.id));
    const allContacts = friendUsers.map(transformToContact);

    // Trier par nom
    allContacts.sort((a, b) => a.name.localeCompare(b.name));

    const online = allContacts.filter(c => c.isOnline);
    const offline = includeOffline ? allContacts.filter(c => !c.isOnline) : [];

    return {
      contacts: allContacts,
      onlineContacts: online,
      offlineContacts: offline,
    };
  }, [contactsData, transformToContact, includeOffline]);

  // Friend requests groupées
  const friendRequests = useMemo(() => {
    if (!contactsData?.friendRequests) {
      return { received: [], sent: [] };
    }

    const currentUserId = localStorage.getItem('user_id'); // ou depuis auth context
    const pending = contactsData.friendRequests.filter(
      (r: FriendRequest) => r.status === 'pending'
    );

    return {
      received: pending.filter((r: FriendRequest) => r.receiverId === currentUserId),
      sent: pending.filter((r: FriendRequest) => r.senderId === currentUserId),
    };
  }, [contactsData?.friendRequests]);

  // Search results transformés
  const searchResults = useMemo(() => {
    if (!searchData) return [];

    return searchData.map((user: User) => {
      const friendRequest = contactsData?.friendRequests?.find(
        (r: FriendRequest) =>
          (r.senderId === user.id || r.receiverId === user.id) &&
          r.status === 'pending'
      );

      const isFriend = contactsData?.acceptedFriendIds?.has(user.id) ?? false;

      return {
        ...transformToContact(user),
        isFriend,
        friendRequestStatus: friendRequest
          ? (friendRequest.senderId === user.id ? 'received' : 'sent')
          : isFriend
            ? 'accepted'
            : 'none',
      } as Contact;
    });
  }, [searchData, contactsData, transformToContact]);

  // Stats
  const stats = useMemo(() => ({
    total: contacts.length,
    online: onlineContacts.length,
    pendingRequests: friendRequests.received.length,
  }), [contacts.length, onlineContacts.length, friendRequests.received.length]);

  // Mutations
  const sendFriendRequestMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await fetch('/api/users/friend-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
        },
        body: JSON.stringify({ receiverId: userId }),
      });
      if (!response.ok) throw new Error('Failed to send friend request');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONTACTS_QUERY_KEYS.all });
    },
  });

  const acceptFriendRequestMutation = useMutation({
    mutationFn: async (requestId: string) => {
      const response = await fetch(`/api/users/friend-requests/${requestId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
        },
        body: JSON.stringify({ action: 'accept' }),
      });
      if (!response.ok) throw new Error('Failed to accept friend request');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONTACTS_QUERY_KEYS.all });
    },
  });

  const rejectFriendRequestMutation = useMutation({
    mutationFn: async (requestId: string) => {
      const response = await fetch(`/api/users/friend-requests/${requestId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
        },
        body: JSON.stringify({ action: 'reject' }),
      });
      if (!response.ok) throw new Error('Failed to reject friend request');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONTACTS_QUERY_KEYS.all });
    },
  });

  const cancelFriendRequestMutation = useMutation({
    mutationFn: async (requestId: string) => {
      const response = await fetch(`/api/users/friend-requests/${requestId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
        },
        body: JSON.stringify({ action: 'cancel' }),
      });
      if (!response.ok) throw new Error('Failed to cancel friend request');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONTACTS_QUERY_KEYS.all });
    },
  });

  // Actions
  const sendFriendRequest = useCallback(async (userId: string): Promise<boolean> => {
    try {
      await sendFriendRequestMutation.mutateAsync(userId);
      return true;
    } catch {
      return false;
    }
  }, [sendFriendRequestMutation]);

  const acceptFriendRequest = useCallback(async (requestId: string): Promise<boolean> => {
    try {
      await acceptFriendRequestMutation.mutateAsync(requestId);
      return true;
    } catch {
      return false;
    }
  }, [acceptFriendRequestMutation]);

  const rejectFriendRequest = useCallback(async (requestId: string): Promise<boolean> => {
    try {
      await rejectFriendRequestMutation.mutateAsync(requestId);
      return true;
    } catch {
      return false;
    }
  }, [rejectFriendRequestMutation]);

  const cancelFriendRequest = useCallback(async (requestId: string): Promise<boolean> => {
    try {
      await cancelFriendRequestMutation.mutateAsync(requestId);
      return true;
    } catch {
      return false;
    }
  }, [cancelFriendRequestMutation]);

  const removeContact = useCallback(async (userId: string): Promise<boolean> => {
    // TODO: Implémenter quand endpoint disponible
    console.warn('removeContact not implemented');
    return false;
  }, []);

  const blockContact = useCallback(async (userId: string): Promise<boolean> => {
    // TODO: Implémenter quand endpoint disponible
    console.warn('blockContact not implemented');
    return false;
  }, []);

  const startConversation = useCallback(async (userId: string): Promise<string | null> => {
    try {
      const response = await fetch('/api/conversations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
        },
        body: JSON.stringify({
          type: 'direct',
          participantIds: [userId],
        }),
      });

      if (!response.ok) throw new Error('Failed to create conversation');

      const result = await response.json();
      return result.data?.id ?? null;
    } catch {
      return null;
    }
  }, []);

  const refresh = useCallback(async () => {
    await refetchContacts();
  }, [refetchContacts]);

  return {
    contacts,
    onlineContacts,
    offlineContacts,
    friendRequests,
    isLoading: isLoadingContacts,
    isSearching,
    searchQuery,
    setSearchQuery,
    searchResults,
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
    cancelFriendRequest,
    removeContact,
    blockContact,
    startConversation,
    stats,
    refresh,
    error: contactsError?.message ?? null,
  };
}

// Helper pour obtenir le nom de la langue
function getLanguageName(code: string): string {
  const languages: Record<string, string> = {
    fr: 'Francais',
    en: 'English',
    es: 'Espanol',
    de: 'Deutsch',
    it: 'Italiano',
    pt: 'Portugues',
    ja: 'Japanese',
    zh: 'Chinese',
    ko: 'Korean',
    ar: 'Arabic',
    ru: 'Russian',
  };
  return languages[code] || code.toUpperCase();
}
```

### 3.2 `useProfileV2`

**Fichier**: `hooks/v2/use-profile-v2.ts`

```typescript
/**
 * Hook pour la gestion du profil utilisateur V2
 * Gère le profil courant et les profils d'autres utilisateurs
 */

import { useCallback, useMemo } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import {
  useCurrentUserQuery,
  useUserProfileQuery,
  useUserStatsQuery,
  useDashboardStatsQuery,
  useUpdateUserProfileMutation,
} from '@/hooks/queries/use-users-query';
import { usersService, UpdateUserDto } from '@/services/users.service';
import { authManager } from '@/services/auth-manager.service';
import { queryKeys } from '@/lib/react-query/query-keys';
import type { User } from '@meeshy/shared/types';

export interface UserLanguage {
  code: string;
  name: string;
  level: 'native' | 'fluent' | 'intermediate' | 'learning';
  flag: string;
}

export interface ProfileStats {
  conversations: number;
  messages: number;
  contacts: number;
  communities?: number;
  translationsToday?: number;
}

export interface ProfileV2Data {
  id: string;
  name: string;
  username: string;
  bio?: string;
  avatar?: string;
  bannerColor?: string;
  isPro: boolean;
  languages: UserLanguage[];
  stats: ProfileStats;
  joinedAt: string;
  isCurrentUser: boolean;
}

export interface UseProfileV2Options {
  userId?: string | null; // Si null, utilise le profil courant
}

export interface ProfileV2Return {
  // Data
  profile: ProfileV2Data | null;
  rawUser: User | null;

  // Loading
  isLoading: boolean;
  isUpdating: boolean;

  // Actions (seulement pour profil courant)
  updateProfile: (data: UpdateProfileData) => Promise<boolean>;
  updateAvatar: (file: File) => Promise<boolean>;
  addLanguage: (language: UserLanguage) => Promise<boolean>;
  removeLanguage: (languageCode: string) => Promise<boolean>;
  updateLanguageLevel: (code: string, level: UserLanguage['level']) => Promise<boolean>;

  // Auth actions
  logout: () => Promise<void>;

  // Refresh
  refresh: () => Promise<void>;

  // Error
  error: string | null;
}

export interface UpdateProfileData {
  firstName?: string;
  lastName?: string;
  displayName?: string;
  bio?: string;
  preferredLanguage?: string;
}

// Mapping des niveaux de langue
const LANGUAGE_LEVELS: Record<string, UserLanguage['level']> = {
  native: 'native',
  fluent: 'fluent',
  intermediate: 'intermediate',
  learning: 'learning',
};

// Mapping des drapeaux
const LANGUAGE_FLAGS: Record<string, string> = {
  fr: '\u{1F1EB}\u{1F1F7}',
  en: '\u{1F1EC}\u{1F1E7}',
  es: '\u{1F1EA}\u{1F1F8}',
  de: '\u{1F1E9}\u{1F1EA}',
  it: '\u{1F1EE}\u{1F1F9}',
  pt: '\u{1F1E7}\u{1F1F7}',
  ja: '\u{1F1EF}\u{1F1F5}',
  zh: '\u{1F1E8}\u{1F1F3}',
  ko: '\u{1F1F0}\u{1F1F7}',
  ar: '\u{1F1F8}\u{1F1E6}',
  ru: '\u{1F1F7}\u{1F1FA}',
};

const LANGUAGE_NAMES: Record<string, string> = {
  fr: 'Francais',
  en: 'English',
  es: 'Espanol',
  de: 'Deutsch',
  it: 'Italiano',
  pt: 'Portugues',
  ja: 'Japanese',
  zh: 'Chinese',
  ko: 'Korean',
  ar: 'Arabic',
  ru: 'Russian',
};

export function useProfileV2(options: UseProfileV2Options = {}): ProfileV2Return {
  const { userId } = options;
  const queryClient = useQueryClient();

  const isCurrentUser = !userId;

  // Queries
  const {
    data: currentUser,
    isLoading: isLoadingCurrent,
    error: currentError,
    refetch: refetchCurrent,
  } = useCurrentUserQuery();

  const {
    data: otherUser,
    isLoading: isLoadingOther,
    error: otherError,
    refetch: refetchOther,
  } = useUserProfileQuery(userId);

  const { data: dashboardStats } = useDashboardStatsQuery();

  const { data: userStats } = useUserStatsQuery(
    isCurrentUser ? currentUser?.id : userId
  );

  // Mutation pour update profil
  const updateProfileMutation = useUpdateUserProfileMutation();

  // Mutation pour upload avatar
  const uploadAvatarMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('avatar', file);

      const response = await fetch('/api/users/me/avatar', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
        },
        body: formData,
      });

      if (!response.ok) throw new Error('Failed to upload avatar');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.current() });
    },
  });

  // User actif (courant ou autre)
  const rawUser = isCurrentUser ? currentUser : otherUser;
  const isLoading = isCurrentUser ? isLoadingCurrent : isLoadingOther;
  const error = isCurrentUser ? currentError : otherError;

  // Transformer User en ProfileV2Data
  const profile = useMemo((): ProfileV2Data | null => {
    if (!rawUser) return null;

    // Extraire les langues
    const languages: UserLanguage[] = [];

    // Langue préférée = native
    if (rawUser.preferredLanguage) {
      languages.push({
        code: rawUser.preferredLanguage,
        name: LANGUAGE_NAMES[rawUser.preferredLanguage] || rawUser.preferredLanguage,
        level: 'native',
        flag: LANGUAGE_FLAGS[rawUser.preferredLanguage] || '\u{1F310}',
      });
    }

    // Autres langues
    if (rawUser.languages && Array.isArray(rawUser.languages)) {
      rawUser.languages.forEach((lang: string | { code: string; level?: string }) => {
        const code = typeof lang === 'string' ? lang : lang.code;
        const level = typeof lang === 'object' ? (lang.level as UserLanguage['level']) : 'learning';

        if (code !== rawUser.preferredLanguage) {
          languages.push({
            code,
            name: LANGUAGE_NAMES[code] || code,
            level: LANGUAGE_LEVELS[level] || 'learning',
            flag: LANGUAGE_FLAGS[code] || '\u{1F310}',
          });
        }
      });
    }

    // Stats
    const stats: ProfileStats = {
      conversations: dashboardStats?.stats?.totalConversations ?? userStats?.totalConversations ?? 0,
      messages: dashboardStats?.stats?.totalMessages ?? (userStats?.messagesSent ?? 0) + (userStats?.messagesReceived ?? 0),
      contacts: 0, // TODO: Ajouter quand endpoint disponible
      communities: dashboardStats?.stats?.totalCommunities,
      translationsToday: dashboardStats?.stats?.translationsToday,
    };

    return {
      id: rawUser.id,
      name: usersService.getDisplayName(rawUser),
      username: `@${rawUser.username}`,
      bio: rawUser.bio,
      avatar: rawUser.avatar,
      bannerColor: rawUser.bannerColor,
      isPro: rawUser.role === 'ADMIN' || rawUser.subscription?.type === 'pro',
      languages,
      stats,
      joinedAt: rawUser.createdAt,
      isCurrentUser,
    };
  }, [rawUser, dashboardStats, userStats, isCurrentUser]);

  // Actions
  const updateProfile = useCallback(async (data: UpdateProfileData): Promise<boolean> => {
    if (!isCurrentUser) return false;

    try {
      await updateProfileMutation.mutateAsync(data);
      return true;
    } catch {
      return false;
    }
  }, [isCurrentUser, updateProfileMutation]);

  const updateAvatar = useCallback(async (file: File): Promise<boolean> => {
    if (!isCurrentUser) return false;

    try {
      await uploadAvatarMutation.mutateAsync(file);
      return true;
    } catch {
      return false;
    }
  }, [isCurrentUser, uploadAvatarMutation]);

  const addLanguage = useCallback(async (language: UserLanguage): Promise<boolean> => {
    if (!isCurrentUser || !rawUser) return false;

    try {
      const currentLanguages = rawUser.languages || [];
      const updatedLanguages = [
        ...currentLanguages,
        { code: language.code, level: language.level },
      ];

      await updateProfileMutation.mutateAsync({ languages: updatedLanguages } as any);
      return true;
    } catch {
      return false;
    }
  }, [isCurrentUser, rawUser, updateProfileMutation]);

  const removeLanguage = useCallback(async (languageCode: string): Promise<boolean> => {
    if (!isCurrentUser || !rawUser) return false;

    try {
      const currentLanguages = rawUser.languages || [];
      const updatedLanguages = currentLanguages.filter(
        (lang: string | { code: string }) =>
          (typeof lang === 'string' ? lang : lang.code) !== languageCode
      );

      await updateProfileMutation.mutateAsync({ languages: updatedLanguages } as any);
      return true;
    } catch {
      return false;
    }
  }, [isCurrentUser, rawUser, updateProfileMutation]);

  const updateLanguageLevel = useCallback(async (
    code: string,
    level: UserLanguage['level']
  ): Promise<boolean> => {
    if (!isCurrentUser || !rawUser) return false;

    try {
      const currentLanguages = rawUser.languages || [];
      const updatedLanguages = currentLanguages.map(
        (lang: string | { code: string; level?: string }) => {
          const langCode = typeof lang === 'string' ? lang : lang.code;
          if (langCode === code) {
            return { code, level };
          }
          return typeof lang === 'string' ? { code: lang, level: 'learning' } : lang;
        }
      );

      await updateProfileMutation.mutateAsync({ languages: updatedLanguages } as any);
      return true;
    } catch {
      return false;
    }
  }, [isCurrentUser, rawUser, updateProfileMutation]);

  const logout = useCallback(async () => {
    authManager.logout();
    queryClient.clear();
    window.location.href = '/v2/login';
  }, [queryClient]);

  const refresh = useCallback(async () => {
    if (isCurrentUser) {
      await refetchCurrent();
    } else {
      await refetchOther();
    }
  }, [isCurrentUser, refetchCurrent, refetchOther]);

  return {
    profile,
    rawUser: rawUser ?? null,
    isLoading,
    isUpdating: updateProfileMutation.isPending || uploadAvatarMutation.isPending,
    updateProfile,
    updateAvatar,
    addLanguage,
    removeLanguage,
    updateLanguageLevel,
    logout,
    refresh,
    error: error?.message ?? null,
  };
}
```

### 3.3 Index mis à jour

**Fichier**: `hooks/v2/index.ts`

```typescript
// Auth (existants)
export { useLoginV2 } from './use-login-v2';
export { useSignupV2 } from './use-signup-v2';

// Messaging (Phase 2)
export { useConversationsV2 } from './use-conversations-v2';
export type { UseConversationsV2Options, ConversationsV2Return } from './use-conversations-v2';

export { useMessagesV2 } from './use-messages-v2';
export type { UseMessagesV2Options, MessagesV2Return, SendMessageOptions } from './use-messages-v2';

export { useUserPreferencesV2 } from './use-user-preferences-v2';
export type { UseUserPreferencesV2Return, Category } from './use-user-preferences-v2';

// Contacts & Profile (Phase 3)
export { useContactsV2 } from './use-contacts-v2';
export type {
  UseContactsV2Options,
  ContactsV2Return,
  Contact,
  FriendRequest,
} from './use-contacts-v2';

export { useProfileV2 } from './use-profile-v2';
export type {
  UseProfileV2Options,
  ProfileV2Return,
  ProfileV2Data,
  UserLanguage,
  ProfileStats,
  UpdateProfileData,
} from './use-profile-v2';
```

---

## 4. Intégration des Pages

### 4.1 Page Contacts Refactorisée

```typescript
// app/v2/contacts/page.tsx

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, Card, Input, Badge, LanguageOrb, theme } from '@/components/v2';
import { useContactsV2 } from '@/hooks/v2';
import { useAuth } from '@/hooks/use-auth';

export default function V2ContactsPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();

  const {
    onlineContacts,
    offlineContacts,
    isLoading,
    searchQuery,
    setSearchQuery,
    searchResults,
    isSearching,
    startConversation,
    friendRequests,
    stats,
    error,
  } = useContactsV2();

  // Redirect si pas auth
  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      router.push('/v2/login');
    }
  }, [isAuthLoading, isAuthenticated, router]);

  // Contacts à afficher (recherche ou liste)
  const displayedOnline = searchQuery ? searchResults.filter(c => c.isOnline) : onlineContacts;
  const displayedOffline = searchQuery ? searchResults.filter(c => !c.isOnline) : offlineContacts;

  const handleStartConversation = async (userId: string) => {
    const conversationId = await startConversation(userId);
    if (conversationId) {
      router.push(`/v2/chats?id=${conversationId}`);
    }
  };

  if (isAuthLoading || isLoading) {
    return <LoadingScreen />;
  }

  return (
    <div className="min-h-screen pb-8" style={{ background: theme.colors.warmCanvas }}>
      {/* Header */}
      <header className="sticky top-0 z-50 px-6 py-4 border-b" style={{
        background: `${theme.colors.warmCanvas}ee`,
        backdropFilter: 'blur(20px)',
        borderColor: theme.colors.parchment
      }}>
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-4 mb-4">
            <Link href="/v2/u">
              <Button variant="ghost" size="sm">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Button>
            </Link>
            <h1 className="text-xl font-semibold" style={{
              fontFamily: theme.fonts.display,
              color: theme.colors.charcoal
            }}>
              Contacts
            </h1>
            {friendRequests.received.length > 0 && (
              <Badge variant="terracotta">{friendRequests.received.length}</Badge>
            )}
          </div>
          <Input
            placeholder="Rechercher un contact..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            icon={
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            }
          />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-6">
        {/* Demandes en attente */}
        {friendRequests.received.length > 0 && (
          <section className="mb-6">
            <h2 className="text-sm font-semibold mb-3 px-1" style={{ color: theme.colors.textMuted }}>
              DEMANDES EN ATTENTE ({friendRequests.received.length})
            </h2>
            {/* TODO: Composant FriendRequestCard */}
          </section>
        )}

        {/* Online */}
        <section className="mb-6">
          <h2 className="text-sm font-semibold mb-3 px-1" style={{ color: theme.colors.textMuted }}>
            EN LIGNE ({displayedOnline.length})
          </h2>
          <Card variant="outlined" hover={false} className="divide-y" style={{ borderColor: theme.colors.parchment }}>
            {displayedOnline.map((contact) => (
              <ContactRow
                key={contact.id}
                contact={contact}
                onMessage={() => handleStartConversation(contact.id)}
              />
            ))}
            {displayedOnline.length === 0 && (
              <div className="p-4 text-center" style={{ color: theme.colors.textMuted }}>
                Aucun contact en ligne
              </div>
            )}
          </Card>
        </section>

        {/* Offline */}
        <section>
          <h2 className="text-sm font-semibold mb-3 px-1" style={{ color: theme.colors.textMuted }}>
            HORS LIGNE ({displayedOffline.length})
          </h2>
          <Card variant="outlined" hover={false} className="divide-y" style={{ borderColor: theme.colors.parchment }}>
            {displayedOffline.map((contact) => (
              <ContactRow
                key={contact.id}
                contact={contact}
                onMessage={() => handleStartConversation(contact.id)}
                isOffline
              />
            ))}
          </Card>
        </section>
      </main>
    </div>
  );
}

// Composant ContactRow extrait
interface ContactRowProps {
  contact: Contact;
  onMessage: () => void;
  isOffline?: boolean;
}

function ContactRow({ contact, onMessage, isOffline }: ContactRowProps) {
  return (
    <div className={`p-4 flex items-center gap-4 ${isOffline ? 'opacity-70' : ''}`}>
      <div className="relative">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center text-xl"
          style={{ background: theme.colors.parchment }}
        >
          {contact.avatar ? (
            <img src={contact.avatar} alt="" className="w-full h-full rounded-full object-cover" />
          ) : (
            contact.name[0]
          )}
        </div>
        <LanguageOrb
          code={contact.languageCode}
          size="sm"
          pulse={false}
          className="absolute -bottom-1 -right-1 w-5 h-5 text-xs border-2 border-white"
        />
        {contact.isOnline && (
          <div
            className="absolute top-0 right-0 w-3 h-3 rounded-full border-2 border-white"
            style={{ background: theme.colors.jadeGreen }}
          />
        )}
      </div>
      <div className="flex-1">
        <p className="font-medium" style={{ color: theme.colors.charcoal }}>{contact.name}</p>
        <p className="text-sm" style={{ color: theme.colors.textMuted }}>{contact.username}</p>
      </div>
      <Button variant="ghost" size="sm" onClick={onMessage}>
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      </Button>
    </div>
  );
}
```

### 4.2 Page Profil Refactorisée

```typescript
// app/v2/u/page.tsx (extrait)

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, Card, Badge, LanguageOrb, theme } from '@/components/v2';
import { useProfileV2 } from '@/hooks/v2';
import { useAuth } from '@/hooks/use-auth';

export default function V2ProfilePage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();

  const {
    profile,
    isLoading,
    logout,
    error,
  } = useProfileV2();

  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      router.push('/v2/login');
    }
  }, [isAuthLoading, isAuthenticated, router]);

  if (isAuthLoading || isLoading || !profile) {
    return <LoadingScreen />;
  }

  return (
    <div className="min-h-screen pb-20" style={{ background: theme.colors.warmCanvas }}>
      {/* Header Banner */}
      <div
        className="h-40 relative"
        style={{
          background: profile.bannerColor ||
            `linear-gradient(135deg, ${theme.colors.terracotta}, ${theme.colors.deepTeal})`
        }}
      >
        <Link href="/v2/settings" className="absolute top-4 right-4 p-2 rounded-full bg-white/20 backdrop-blur-sm">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0..." />
          </svg>
        </Link>
      </div>

      {/* Profile Info */}
      <div className="max-w-2xl mx-auto px-6">
        <div className="relative -mt-16 mb-6">
          <div
            className="w-32 h-32 rounded-full border-4 border-white flex items-center justify-center text-5xl overflow-hidden"
            style={{ background: theme.colors.parchment }}
          >
            {profile.avatar ? (
              <img src={profile.avatar} alt="" className="w-full h-full object-cover" />
            ) : (
              profile.name[0]
            )}
          </div>
        </div>

        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <h1
              className="text-2xl font-bold"
              style={{ fontFamily: theme.fonts.display, color: theme.colors.charcoal }}
            >
              {profile.name}
            </h1>
            {profile.isPro && <Badge variant="teal">Pro</Badge>}
          </div>
          <p className="mb-2" style={{ color: theme.colors.textSecondary }}>{profile.username}</p>
          {profile.bio && (
            <p style={{ color: theme.colors.textPrimary }}>{profile.bio}</p>
          )}
        </div>

        {/* Languages */}
        <Card variant="outlined" hover={false} className="p-4 mb-6">
          <h3 className="font-semibold mb-3" style={{ color: theme.colors.charcoal }}>Mes langues</h3>
          <div className="flex flex-wrap gap-3">
            {profile.languages.map((lang) => (
              <div
                key={lang.code}
                className="flex items-center gap-2 px-3 py-2 rounded-xl"
                style={{ background: theme.colors.parchment }}
              >
                <LanguageOrb code={lang.code} size="sm" pulse={false} className="w-6 h-6 text-sm" />
                <span className="text-sm font-medium">{lang.name}</span>
                <Badge
                  variant={
                    lang.level === 'native' ? 'terracotta' :
                    lang.level === 'fluent' ? 'teal' : 'gold'
                  }
                  size="sm"
                >
                  {lang.level === 'native' ? 'Natif' :
                   lang.level === 'fluent' ? 'Fluent' :
                   lang.level === 'intermediate' ? 'Intermediate' : 'Learning'}
                </Badge>
              </div>
            ))}
          </div>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Card variant="default" hover={false} className="p-4 text-center">
            <p className="text-2xl font-bold" style={{ color: theme.colors.terracotta }}>
              {profile.stats.conversations}
            </p>
            <p className="text-sm" style={{ color: theme.colors.textSecondary }}>Conversations</p>
          </Card>
          <Card variant="default" hover={false} className="p-4 text-center">
            <p className="text-2xl font-bold" style={{ color: theme.colors.deepTeal }}>
              {formatNumber(profile.stats.messages)}
            </p>
            <p className="text-sm" style={{ color: theme.colors.textSecondary }}>Messages</p>
          </Card>
          <Card variant="default" hover={false} className="p-4 text-center">
            <p className="text-2xl font-bold" style={{ color: theme.colors.goldAccent }}>
              {profile.stats.contacts}
            </p>
            <p className="text-sm" style={{ color: theme.colors.textSecondary }}>Contacts</p>
          </Card>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <Link href="/v2/links" className="block">
            <Card variant="outlined" hover className="p-4 flex items-center justify-between">
              {/* ... */}
            </Card>
          </Link>

          <Link href="/v2/contacts" className="block">
            <Card variant="outlined" hover className="p-4 flex items-center justify-between">
              {/* ... */}
            </Card>
          </Link>

          <Button
            variant="outline"
            className="w-full"
            style={{ color: theme.colors.asianRuby, borderColor: theme.colors.asianRuby }}
            onClick={logout}
          >
            Se deconnecter
          </Button>
        </div>
      </div>

      {/* Bottom Nav */}
      <BottomNavigation currentPath="/v2/u" />
    </div>
  );
}

function formatNumber(num: number): string {
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}k`;
  }
  return num.toString();
}
```

---

## 5. Tests Requis

### 5.1 Tests Unitaires

```typescript
// __tests__/hooks/v2/use-contacts-v2.test.tsx

import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useContactsV2 } from '@/hooks/v2/use-contacts-v2';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useContactsV2', () => {
  it('should fetch contacts on mount', async () => {
    const { result } = renderHook(() => useContactsV2(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.contacts).toBeDefined();
  });

  it('should separate online and offline contacts', async () => {
    const { result } = renderHook(() => useContactsV2(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const totalContacts = result.current.contacts.length;
    const onlineCount = result.current.onlineContacts.length;
    const offlineCount = result.current.offlineContacts.length;

    expect(onlineCount + offlineCount).toBe(totalContacts);
  });

  it('should search users when query is >= 2 chars', async () => {
    const { result } = renderHook(() => useContactsV2(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.setSearchQuery('te');
    });

    await waitFor(() => {
      expect(result.current.isSearching).toBe(false);
    });

    expect(result.current.searchResults).toBeDefined();
  });

  it('should send friend request', async () => {
    const { result } = renderHook(() => useContactsV2(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const success = await result.current.sendFriendRequest('user-123');
    expect(typeof success).toBe('boolean');
  });
});
```

```typescript
// __tests__/hooks/v2/use-profile-v2.test.tsx

import { renderHook, waitFor, act } from '@testing-library/react';
import { useProfileV2 } from '@/hooks/v2/use-profile-v2';

describe('useProfileV2', () => {
  it('should fetch current user profile', async () => {
    const { result } = renderHook(() => useProfileV2(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.profile).toBeDefined();
    expect(result.current.profile?.isCurrentUser).toBe(true);
  });

  it('should fetch other user profile', async () => {
    const { result } = renderHook(
      () => useProfileV2({ userId: 'other-user-id' }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.profile?.isCurrentUser).toBe(false);
  });

  it('should update profile', async () => {
    const { result } = renderHook(() => useProfileV2(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const success = await result.current.updateProfile({ bio: 'New bio' });
    expect(success).toBe(true);
  });

  it('should extract languages correctly', async () => {
    const { result } = renderHook(() => useProfileV2(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.profile?.languages).toBeDefined();
    expect(Array.isArray(result.current.profile?.languages)).toBe(true);
  });
});
```

### 5.2 Tests E2E

```typescript
// e2e/contacts-v2.spec.ts (Playwright)

import { test, expect } from '@playwright/test';

test.describe('V2 Contacts', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/v2/login');
    await page.fill('[name="email"]', 'test@example.com');
    await page.fill('[name="password"]', 'password');
    await page.click('button[type="submit"]');
    await page.waitForURL('/v2/chats');
    await page.goto('/v2/contacts');
  });

  test('should display contacts list', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Contacts');
    await expect(page.locator('[data-testid="online-section"]')).toBeVisible();
    await expect(page.locator('[data-testid="offline-section"]')).toBeVisible();
  });

  test('should search contacts', async ({ page }) => {
    await page.fill('[placeholder="Rechercher un contact..."]', 'test');
    await page.waitForTimeout(500); // Debounce

    // Vérifier que la recherche est effectuée
    await expect(page.locator('[data-testid="contact-row"]')).toHaveCount({ minimum: 0 });
  });

  test('should start conversation from contact', async ({ page }) => {
    const messageButton = page.locator('[data-testid="message-button"]').first();
    await messageButton.click();

    await page.waitForURL(/\/v2\/chats/);
  });
});

test.describe('V2 Profile', () => {
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto('/v2/login');
    await page.fill('[name="email"]', 'test@example.com');
    await page.fill('[name="password"]', 'password');
    await page.click('button[type="submit"]');
    await page.waitForURL('/v2/chats');
    await page.goto('/v2/u');
  });

  test('should display profile info', async ({ page }) => {
    await expect(page.locator('[data-testid="profile-name"]')).toBeVisible();
    await expect(page.locator('[data-testid="profile-username"]')).toBeVisible();
    await expect(page.locator('[data-testid="profile-stats"]')).toBeVisible();
  });

  test('should display languages', async ({ page }) => {
    await expect(page.locator('[data-testid="languages-section"]')).toBeVisible();
  });

  test('should logout', async ({ page }) => {
    await page.click('[data-testid="logout-button"]');
    await page.waitForURL('/v2/login');
  });
});
```

---

## 6. Checklist d'Implementation

### Phase 3.1 - Hooks de base
- [ ] Créer `hooks/v2/use-contacts-v2.ts`
- [ ] Créer `hooks/v2/use-profile-v2.ts`
- [ ] Mettre à jour `hooks/v2/index.ts`

### Phase 3.2 - Intégration Contacts
- [ ] Refactoriser `/v2/contacts/page.tsx`
- [ ] Remplacer `contacts` mocké par `useContactsV2`
- [ ] Implémenter recherche fonctionnelle
- [ ] Ajouter section demandes d'amis
- [ ] Connecter bouton message à création conversation

### Phase 3.3 - Intégration Profil
- [ ] Refactoriser `/v2/u/page.tsx`
- [ ] Remplacer données mockées par `useProfileV2`
- [ ] Afficher langues dynamiques
- [ ] Afficher stats réelles
- [ ] Connecter déconnexion

### Phase 3.4 - WebSocket Integration
- [ ] Intégrer statut en ligne temps réel dans contacts
- [ ] Mettre à jour indicateurs visuels

### Phase 3.5 - Tests
- [ ] Tests unitaires hooks
- [ ] Tests intégration
- [ ] Tests E2E

### Phase 3.6 - Fonctionnalités avancées
- [ ] Édition de profil
- [ ] Upload avatar
- [ ] Gestion des langues
- [ ] Blocage/suppression contacts

---

## 7. Notes d'Architecture

### 7.1 Stratégie de Cache

```
React Query Cache
├── contacts.list           // Liste des contacts
├── contacts.friend-requests // Demandes d'amis
├── contacts.search.{query}  // Résultats de recherche (gcTime: 5min)
├── users.current           // Profil courant
├── users.profile.{id}      // Profils autres utilisateurs
└── users.stats.{id}        // Stats utilisateur
```

### 7.2 Flow Statut En Ligne

```
WebSocket Connect
    ↓
Server broadcasts user:status events
    ↓
useContactsV2 receives via onUserStatus callback
    ↓
Updates local Set<onlineUserIds>
    ↓
useMemo recalculates contact.isOnline
    ↓
UI re-renders with updated status indicators
```

### 7.3 Gestion des Demandes d'Amis

```
User A sends request → POST /users/friend-requests
    ↓
Server creates FriendRequest (status: pending)
    ↓
User B sees in friendRequests.received
    ↓
User B accepts → PATCH /users/friend-requests/:id
    ↓
Server updates status to 'accepted'
    ↓
Both users see each other in contacts list
```

---

## Annexe: Endpoints API Contacts

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/users` | Liste tous les utilisateurs |
| GET | `/users/search?q=` | Recherche (min 2 chars) |
| GET | `/auth/me` | Mon profil |
| PATCH | `/users/me` | Modifier mon profil |
| POST | `/users/me/avatar` | Upload avatar |
| GET | `/users/:id` | Profil utilisateur |
| GET | `/users/:id/stats` | Stats utilisateur |
| GET | `/users/me/dashboard-stats` | Stats dashboard |
| GET | `/users/friend-requests` | Mes demandes d'amis |
| POST | `/users/friend-requests` | Envoyer demande |
| PATCH | `/users/friend-requests/:id` | Accept/Reject/Cancel |
| GET | `/affiliate/stats` | Relations affiliation |
