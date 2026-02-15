/**
 * Hook for V2 User Profile Management
 *
 * Provides current user profile, other user profiles, and profile updates.
 * Replaces mock data in /v2/u page.
 */

'use client';

import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useCurrentUserQuery,
  useUserProfileQuery,
  useUserStatsQuery,
  useDashboardStatsQuery,
  useUpdateUserProfileMutation,
} from '@/hooks/queries/use-users-query';
import { usersService, type UpdateUserDto, type UserStats } from '@/services/users.service';
import { queryKeys } from '@/lib/react-query/query-keys';
import type { User } from '@meeshy/shared/types';

export interface LanguageInfo {
  code: string;
  name: string;
  level: 'native' | 'fluent' | 'learning';
}

export interface ProfileV2 {
  id: string;
  name: string;
  username: string;
  bio?: string;
  avatar?: string;
  banner?: string;
  languages: LanguageInfo[];
  isOnline: boolean;
  lastSeen?: string;
  isPro?: boolean;
}

export interface ProfileStatsV2 {
  conversationsCount: number;
  messagesCount: number;
  contactsCount: number;
}

export interface UseProfileV2Options {
  userId?: string | null;
}

export interface ProfileV2Return {
  // Data
  profile: ProfileV2 | null;
  stats: ProfileStatsV2 | null;
  rawUser: User | null;

  // Loading states
  isLoading: boolean;
  isLoadingStats: boolean;

  // Actions
  updateProfile: (data: UpdateProfileData) => Promise<void>;
  isUpdating: boolean;
  refreshProfile: () => Promise<void>;

  // Helpers
  isCurrentUser: boolean;
  getDisplayName: () => string;
  getAvatarUrl: () => string | undefined;

  // Error
  error: string | null;
}

export interface UpdateProfileData {
  displayName?: string;
  bio?: string;
  avatar?: string;
  banner?: string;
  systemLanguage?: string;
  regionalLanguage?: string;
}

/**
 * Map language code to display name
 */
const LANGUAGE_NAMES: Record<string, string> = {
  fr: 'Francais',
  en: 'English',
  es: 'Espanol',
  de: 'Deutsch',
  it: 'Italiano',
  pt: 'Portugues',
  zh: '中文',
  ja: '日本語',
  ko: '한국어',
  ar: 'العربية',
  ru: 'Русский',
  hi: 'हिन्दी',
  multi: 'Multilingue',
};

function getLanguageName(code: string): string {
  return LANGUAGE_NAMES[code] || code.toUpperCase();
}

/**
 * Transform User to ProfileV2 format
 */
function transformToProfile(user: User): ProfileV2 {
  const displayName =
    user.displayName ||
    `${user.firstName || ''} ${user.lastName || ''}`.trim() ||
    user.username;

  // Build languages array from user data
  const languages: LanguageInfo[] = [];

  const systemLang = (user as any).systemLanguage;
  const regionalLang = (user as any).regionalLanguage;
  const customLang = (user as any).customDestinationLanguage;

  if (systemLang) {
    languages.push({
      code: systemLang,
      name: getLanguageName(systemLang),
      level: 'native',
    });
  }

  if (regionalLang && regionalLang !== systemLang) {
    languages.push({
      code: regionalLang,
      name: getLanguageName(regionalLang),
      level: 'fluent',
    });
  }

  if (customLang && customLang !== systemLang && customLang !== regionalLang) {
    languages.push({
      code: customLang,
      name: getLanguageName(customLang),
      level: 'learning',
    });
  }

  // Default to French if no languages
  if (languages.length === 0) {
    languages.push({
      code: 'fr',
      name: 'Francais',
      level: 'native',
    });
  }

  return {
    id: user.id,
    name: displayName,
    username: `@${user.username}`,
    bio: user.bio,
    avatar: user.avatar,
    banner: user.banner,
    languages,
    isOnline: usersService.isUserOnline(user),
    lastSeen: usersService.getLastSeenFormatted(user),
    isPro: user.role === 'pro' || user.role === 'admin',
  };
}

/**
 * Transform stats to ProfileStatsV2 format
 */
function transformToStats(stats: UserStats | undefined, dashboardStats: any): ProfileStatsV2 {
  if (stats) {
    return {
      conversationsCount: stats.totalConversations || stats.conversationsCount || 0,
      messagesCount: (stats.messagesSent || 0) + (stats.messagesReceived || 0),
      contactsCount: stats.groupsCount || 0,
    };
  }

  if (dashboardStats?.stats) {
    return {
      conversationsCount: dashboardStats.stats.totalConversations || 0,
      messagesCount: dashboardStats.stats.totalMessages || 0,
      contactsCount: dashboardStats.stats.totalCommunities || 0,
    };
  }

  return {
    conversationsCount: 0,
    messagesCount: 0,
    contactsCount: 0,
  };
}

export function useProfileV2(options: UseProfileV2Options = {}): ProfileV2Return {
  const { userId } = options;
  const queryClient = useQueryClient();

  // Determine if we're viewing current user or another user
  const isCurrentUser = !userId;

  // Query for current user
  const {
    data: currentUser,
    isLoading: isLoadingCurrent,
    error: currentError,
    refetch: refetchCurrent,
  } = useCurrentUserQuery();

  // Query for other user profile
  const {
    data: otherUser,
    isLoading: isLoadingOther,
    error: otherError,
    refetch: refetchOther,
  } = useUserProfileQuery(userId);

  // Query for user stats
  const { data: userStats, isLoading: isLoadingUserStats } = useUserStatsQuery(userId);

  // Query for dashboard stats (current user only)
  const { data: dashboardStats, isLoading: isLoadingDashboard } = useDashboardStatsQuery();

  // Update mutation
  const updateMutation = useUpdateUserProfileMutation();

  // Select the appropriate user
  const rawUser = isCurrentUser ? currentUser : otherUser;

  // Transform to profile
  const profile = useMemo(() => {
    if (!rawUser) return null;
    const p = transformToProfile(rawUser);
    // L'utilisateur courant est forcément en ligne puisqu'il charge la page
    if (isCurrentUser) {
      p.isOnline = true;
    }
    return p;
  }, [rawUser, isCurrentUser]);

  // Transform stats
  const stats = useMemo(() => {
    return transformToStats(userStats, isCurrentUser ? dashboardStats : undefined);
  }, [userStats, dashboardStats, isCurrentUser]);

  // Loading states
  const isLoading = isCurrentUser ? isLoadingCurrent : isLoadingOther;
  const isLoadingStats = isCurrentUser
    ? isLoadingDashboard
    : isLoadingUserStats;

  // Error
  const error = isCurrentUser ? currentError : otherError;

  // Actions
  const updateProfile = useCallback(
    async (data: UpdateProfileData) => {
      if (!isCurrentUser) {
        throw new Error('Cannot update other user profile');
      }

      const updateData: UpdateUserDto = {};

      if (data.displayName !== undefined) {
        updateData.displayName = data.displayName;
      }
      if (data.bio !== undefined) {
        updateData.bio = data.bio;
      }
      if (data.avatar !== undefined) {
        updateData.avatar = data.avatar;
      }
      if (data.systemLanguage !== undefined) {
        updateData.systemLanguage = data.systemLanguage;
      }
      if (data.regionalLanguage !== undefined) {
        updateData.regionalLanguage = data.regionalLanguage;
      }

      await updateMutation.mutateAsync(updateData);
    },
    [isCurrentUser, updateMutation]
  );

  const refreshProfile = useCallback(async () => {
    if (isCurrentUser) {
      await refetchCurrent();
    } else {
      await refetchOther();
    }
  }, [isCurrentUser, refetchCurrent, refetchOther]);

  // Helpers
  const getDisplayName = useCallback(() => {
    if (!rawUser) return '';
    return usersService.getDisplayName(rawUser);
  }, [rawUser]);

  const getAvatarUrl = useCallback(() => {
    if (!rawUser) return undefined;
    return rawUser.avatar || undefined;
  }, [rawUser]);

  return {
    profile,
    stats,
    rawUser: rawUser ?? null,
    isLoading,
    isLoadingStats,
    updateProfile,
    isUpdating: updateMutation.isPending,
    refreshProfile,
    isCurrentUser,
    getDisplayName,
    getAvatarUrl,
    error: error?.message ?? null,
  };
}
