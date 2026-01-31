/**
 * Hook for V2 Settings Management
 *
 * Provides user settings including language preferences, notifications,
 * theme, and account settings.
 * Replaces mock data in /v2/settings page.
 */

'use client';

import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentUserQuery, useUpdateUserProfileMutation } from '@/hooks/queries/use-users-query';
import { NotificationService } from '@/services/notification.service';
import { queryKeys } from '@/lib/react-query/query-keys';
import { apiService } from '@/services/api.service';
import type { User } from '@meeshy/shared/types';

export interface LanguageSettingV2 {
  code: string;
  name: string;
  flag?: string;
}

export interface NotificationSettingsV2 {
  messages: boolean;
  mentions: boolean;
  communities: boolean;
  calls: boolean;
  marketing: boolean;
}

export interface ThemeSettingV2 {
  mode: 'light' | 'dark' | 'system';
}

export interface AccountSettingsV2 {
  email: string;
  emailVerified: boolean;
  phone?: string;
  phoneVerified: boolean;
  twoFactorEnabled: boolean;
}

export interface UseSettingsV2Options {
  enabled?: boolean;
}

export interface SettingsV2Return {
  // User data
  user: User | null;

  // Language settings
  translationLanguage: LanguageSettingV2 | null;
  systemLanguage: LanguageSettingV2 | null;
  availableLanguages: LanguageSettingV2[];
  updateTranslationLanguage: (code: string) => Promise<void>;
  updateSystemLanguage: (code: string) => Promise<void>;

  // Notification settings
  notificationSettings: NotificationSettingsV2;
  updateNotificationSetting: (key: keyof NotificationSettingsV2, value: boolean) => Promise<void>;
  isUpdatingNotifications: boolean;

  // Theme settings
  theme: ThemeSettingV2;
  setTheme: (mode: 'light' | 'dark' | 'system') => void;

  // Account settings
  accountSettings: AccountSettingsV2;
  updateEmail: (email: string) => Promise<void>;
  updatePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  requestEmailVerification: () => Promise<void>;
  requestPhoneVerification: () => Promise<void>;
  enable2FA: () => Promise<void>;
  disable2FA: () => Promise<void>;
  deleteAccount: () => Promise<void>;

  // Loading states
  isLoading: boolean;
  isUpdating: boolean;

  // Error
  error: string | null;
}

/**
 * Available languages for the app
 */
const AVAILABLE_LANGUAGES: LanguageSettingV2[] = [
  { code: 'fr', name: 'Francais', flag: '🇫🇷' },
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'es', name: 'Espanol', flag: '🇪🇸' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'it', name: 'Italiano', flag: '🇮🇹' },
  { code: 'pt', name: 'Portugues', flag: '🇵🇹' },
  { code: 'zh', name: '中文', flag: '🇨🇳' },
  { code: 'ja', name: '日本語', flag: '🇯🇵' },
  { code: 'ko', name: '한국어', flag: '🇰🇷' },
  { code: 'ar', name: 'العربية', flag: '🇸🇦' },
  { code: 'ru', name: 'Русский', flag: '🇷🇺' },
  { code: 'hi', name: 'हिन्दी', flag: '🇮🇳' },
];

/**
 * Get language by code
 */
function getLanguageByCode(code: string): LanguageSettingV2 | null {
  return AVAILABLE_LANGUAGES.find((l) => l.code === code) || null;
}

/**
 * Get theme from localStorage or system preference
 */
function getStoredTheme(): 'light' | 'dark' | 'system' {
  if (typeof window === 'undefined') return 'system';

  const stored = localStorage.getItem('theme');
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    return stored;
  }
  return 'system';
}

export function useSettingsV2(options: UseSettingsV2Options = {}): SettingsV2Return {
  const { enabled = true } = options;
  const queryClient = useQueryClient();

  // Theme state (local)
  const [theme, setThemeState] = useState<ThemeSettingV2>({ mode: getStoredTheme() });

  // Query for current user - with staleTime to avoid refetching
  const {
    data: user,
    isLoading: isLoadingUser,
    error: userError,
  } = useCurrentUserQuery();

  // Query for notification preferences - with staleTime and placeholderData
  const {
    data: notificationPrefs,
    isLoading: isLoadingNotifPrefs,
  } = useQuery({
    queryKey: [...queryKeys.notifications.all, 'preferences'],
    queryFn: async () => {
      const response = await NotificationService.getPreferences();
      return response.data;
    },
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes - avoid refetching too often
    placeholderData: { messages: true, mentions: true, communities: true, calls: true, marketing: false },
  });

  // Mutations
  const updateProfileMutation = useUpdateUserProfileMutation();

  const updateNotifPrefsMutation = useMutation({
    mutationFn: (prefs: any) => NotificationService.updatePreferences(prefs),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.notifications.all, 'preferences'],
      });
    },
  });

  const updatePasswordMutation = useMutation({
    mutationFn: async ({
      currentPassword,
      newPassword,
    }: {
      currentPassword: string;
      newPassword: string;
    }) => {
      return apiService.post('/auth/change-password', {
        currentPassword,
        newPassword,
      });
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: async () => {
      return apiService.delete('/users/me');
    },
  });

  // Derived language settings
  const translationLanguage = useMemo(() => {
    const code = (user as any)?.customDestinationLanguage || (user as any)?.systemLanguage || 'fr';
    return getLanguageByCode(code);
  }, [user]);

  const systemLanguage = useMemo(() => {
    const code = (user as any)?.systemLanguage || 'fr';
    return getLanguageByCode(code);
  }, [user]);

  // Notification settings
  const notificationSettings = useMemo((): NotificationSettingsV2 => {
    const prefs = notificationPrefs || {};
    return {
      messages: prefs.messages !== false,
      mentions: prefs.mentions !== false,
      communities: prefs.communities !== false,
      calls: prefs.calls !== false,
      marketing: prefs.marketing === true,
    };
  }, [notificationPrefs]);

  // Account settings
  const accountSettings = useMemo((): AccountSettingsV2 => {
    return {
      email: user?.email || '',
      emailVerified: !!(user as any)?.emailVerifiedAt,
      phone: user?.phoneNumber,
      phoneVerified: !!(user as any)?.phoneVerifiedAt,
      twoFactorEnabled: !!(user as any)?.twoFactorEnabledAt,
    };
  }, [user]);

  // Actions
  const updateTranslationLanguage = useCallback(
    async (code: string) => {
      await updateProfileMutation.mutateAsync({
        customDestinationLanguage: code,
        useCustomDestination: true,
      } as any);
    },
    [updateProfileMutation]
  );

  const updateSystemLanguage = useCallback(
    async (code: string) => {
      await updateProfileMutation.mutateAsync({
        systemLanguage: code,
      } as any);
    },
    [updateProfileMutation]
  );

  const updateNotificationSetting = useCallback(
    async (key: keyof NotificationSettingsV2, value: boolean) => {
      await updateNotifPrefsMutation.mutateAsync({ [key]: value });
    },
    [updateNotifPrefsMutation]
  );

  const setTheme = useCallback((mode: 'light' | 'dark' | 'system') => {
    setThemeState({ mode });
    if (typeof window !== 'undefined') {
      localStorage.setItem('theme', mode);

      // Apply theme to document
      const root = document.documentElement;
      if (mode === 'system') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        root.classList.toggle('dark', prefersDark);
      } else {
        root.classList.toggle('dark', mode === 'dark');
      }
    }
  }, []);

  const updateEmail = useCallback(
    async (email: string) => {
      await updateProfileMutation.mutateAsync({ email } as any);
    },
    [updateProfileMutation]
  );

  const updatePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      await updatePasswordMutation.mutateAsync({ currentPassword, newPassword });
    },
    [updatePasswordMutation]
  );

  const requestEmailVerification = useCallback(async () => {
    await apiService.post('/auth/resend-verification-email');
  }, []);

  const requestPhoneVerification = useCallback(async () => {
    await apiService.post('/auth/send-phone-verification');
  }, []);

  const enable2FA = useCallback(async () => {
    await apiService.post('/auth/2fa/enable');
    queryClient.invalidateQueries({ queryKey: queryKeys.users.current() });
  }, [queryClient]);

  const disable2FA = useCallback(async () => {
    await apiService.post('/auth/2fa/disable');
    queryClient.invalidateQueries({ queryKey: queryKeys.users.current() });
  }, [queryClient]);

  const deleteAccount = useCallback(async () => {
    await deleteAccountMutation.mutateAsync();
  }, [deleteAccountMutation]);

  return {
    user: user ?? null,
    translationLanguage,
    systemLanguage,
    availableLanguages: AVAILABLE_LANGUAGES,
    updateTranslationLanguage,
    updateSystemLanguage,
    notificationSettings,
    updateNotificationSetting,
    isUpdatingNotifications: updateNotifPrefsMutation.isPending,
    theme,
    setTheme,
    accountSettings,
    updateEmail,
    updatePassword,
    requestEmailVerification,
    requestPhoneVerification,
    enable2FA,
    disable2FA,
    deleteAccount,
    // Only block on user loading, not notification prefs (we have placeholderData)
    isLoading: isLoadingUser,
    isUpdating: updateProfileMutation.isPending || updatePasswordMutation.isPending,
    error: userError?.message ?? null,
  };
}
