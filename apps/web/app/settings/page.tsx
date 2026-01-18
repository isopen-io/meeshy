'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { User } from '@/types';
import { buildApiUrl, API_ENDPOINTS } from '@/lib/config';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Footer } from '@/components/layout/Footer';
import { useI18n } from '@/hooks/use-i18n';
import { toast } from 'sonner';
import {
  Settings as SettingsIcon,
  User as UserIcon,
  Shield,
  MessageSquare,
  Bell,
  Rocket,
  PlayCircle
} from 'lucide-react';
import { authManager } from '@/services/auth-manager.service';
import { useReducedMotion } from '@/hooks/use-accessibility';
import { ResponsiveTabs } from '@/components/ui/responsive-tabs';
import { Skeleton } from '@/components/ui/skeleton';

// Dynamic imports with loading skeletons for code splitting
const ProfileSettings = dynamic(
  () => import('@/components/settings/user-settings').then(mod => ({ default: mod.UserSettings })),
  {
    loading: () => <SettingsLoadingSkeleton />,
    ssr: false
  }
);

const PrivacySettings = dynamic(
  () => import('@/components/settings/privacy-settings').then(mod => ({ default: mod.PrivacySettings })),
  {
    loading: () => <SettingsLoadingSkeleton />,
    ssr: false
  }
);

const MediaSettings = dynamic(
  () => import('@/components/settings/MediaSettings').then(mod => ({ default: mod.MediaSettings })),
  {
    loading: () => <SettingsLoadingSkeleton />,
    ssr: false
  }
);

const MessageSettings = dynamic(
  () => import('@/components/settings/message-settings'),
  {
    loading: () => <SettingsLoadingSkeleton />,
    ssr: false
  }
);

const NotificationSettings = dynamic(
  () => import('@/components/settings/notification-settings').then(mod => ({ default: mod.NotificationSettings })),
  {
    loading: () => <SettingsLoadingSkeleton />,
    ssr: false
  }
);

const ApplicationSettings = dynamic(
  () => import('@/components/settings/application-settings'),
  {
    loading: () => <SettingsLoadingSkeleton />,
    ssr: false
  }
);

const BetaPlayground = dynamic(
  () => import('@/components/settings/beta-playground'),
  {
    loading: () => <SettingsLoadingSkeleton />,
    ssr: false
  }
);

// Loading skeleton component
function SettingsLoadingSkeleton() {
  return (
    <div className="space-y-6 p-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  );
}

// Get initial tab from URL hash (will be validated against available tabs later)
function getInitialTab(): string {
  if (typeof window === 'undefined') return 'profile';
  const hash = window.location.hash.replace('#', '');

  // Handle media sub-sections (#media-audio, #media-video, #media-document)
  if (hash.startsWith('media-')) {
    return 'media';
  }

  return hash || 'profile';
}

export default function SettingsPage() {
  const router = useRouter();
  const { t } = useI18n('settings');
  const reducedMotion = useReducedMotion();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(getInitialTab);
  const [prefetchedTabs, setPrefetchedTabs] = useState<Set<string>>(new Set());

  // Load user settings with parallel fetches
  useEffect(() => {
    const loadUserSettings = async () => {
      try {
        const token = authManager.getAuthToken();
        if (!token) {
          router.push('/login');
          return;
        }

        // Parallel fetches to eliminate waterfall
        const [userResponse, notificationsResponse, encryptionResponse] = await Promise.all([
          fetch(buildApiUrl(API_ENDPOINTS.AUTH.ME), {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          }),
          fetch(`${buildApiUrl('')}/user-preferences/notifications`, {
            headers: { 'Authorization': `Bearer ${token}` }
          }).catch(() => null),
          fetch(`${buildApiUrl('')}/user-preferences/encryption`, {
            headers: { 'Authorization': `Bearer ${token}` }
          }).catch(() => null),
        ]);

        if (userResponse.status === 401) {
          authManager.clearAllSessions();
          router.push('/login');
          return;
        }

        const userResult = await userResponse.json();

        if (userResponse.ok) {
          if (userResult.success && userResult.data && userResult.data.user) {
            setCurrentUser(userResult.data.user);

            // Preload data in HTTP cache
            if (notificationsResponse?.ok) {
              await notificationsResponse.json();
            }
            if (encryptionResponse?.ok) {
              await encryptionResponse.json();
            }
          } else {
            throw new Error(userResult.error || t('errors.loadProfile'));
          }
        } else {
          throw new Error(userResult.error || t('errors.loadProfile'));
        }
      } catch (error) {
        console.error('Error loading settings:', error);
        toast.error(error instanceof Error ? error.message : t('errors.loadSettings'));
        router.push('/login');
      } finally {
        setIsLoading(false);
      }
    };

    loadUserSettings();
  }, [router, t]);

  // Validate and set initial tab based on available tabs
  useEffect(() => {
    if (tabs.length > 0) {
      const validTabValues = tabs.map(tab => tab.value);
      if (!validTabValues.includes(activeTab)) {
        // If current tab is not available (e.g., beta for non-moderators), redirect to profile
        setActiveTab('profile');
      }
    }
  }, [tabs, activeTab]);

  // Listen to hash changes for navigation
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      const validTabValues = tabs.map(tab => tab.value);

      // Handle media sub-sections (#media-audio, #media-video, #media-document)
      let targetTab = hash;
      if (hash.startsWith('media-')) {
        targetTab = 'media';
      }

      if (validTabValues.includes(targetTab) && targetTab !== activeTab) {
        setActiveTab(targetTab);
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [activeTab, tabs]);

  // Update URL when tab changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const currentHash = window.location.hash.replace('#', '');

      // Don't overwrite media sub-section hashes (#media-audio, #media-video, #media-document)
      // when the media tab is active
      if (activeTab === 'media' && currentHash.startsWith('media-')) {
        // Keep the existing sub-section hash
        return;
      }

      window.history.replaceState(null, '', `#${activeTab}`);
    }
  }, [activeTab]);

  // Prefetch on hover handler
  const handleTabHover = useCallback((tabValue: string) => {
    if (!prefetchedTabs.has(tabValue)) {
      setPrefetchedTabs(prev => new Set(prev).add(tabValue));
      // Trigger prefetch by setting state
      // The dynamic import will be triggered when this tab is rendered
    }
  }, [prefetchedTabs]);

  // Handle user update
  const handleUserUpdate = async (updatedUser: Partial<User>) => {
    try {
      const token = authManager.getAuthToken();
      if (!token) {
        router.push('/login');
        return;
      }

      // Filter only allowed fields
      const filteredData: Record<string, any> = {};

      if ('firstName' in updatedUser) filteredData.firstName = updatedUser.firstName;
      if ('lastName' in updatedUser) filteredData.lastName = updatedUser.lastName;
      if ('displayName' in updatedUser) filteredData.displayName = updatedUser.displayName;
      if ('email' in updatedUser) filteredData.email = updatedUser.email;
      if ('phoneNumber' in updatedUser) filteredData.phoneNumber = updatedUser.phoneNumber;
      if ('bio' in updatedUser) filteredData.bio = updatedUser.bio;
      if ('systemLanguage' in updatedUser) filteredData.systemLanguage = updatedUser.systemLanguage;
      if ('regionalLanguage' in updatedUser) filteredData.regionalLanguage = updatedUser.regionalLanguage;
      if ('customDestinationLanguage' in updatedUser) filteredData.customDestinationLanguage = updatedUser.customDestinationLanguage;
      if ('autoTranslateEnabled' in updatedUser) filteredData.autoTranslateEnabled = updatedUser.autoTranslateEnabled;
      if ('translateToSystemLanguage' in updatedUser) filteredData.translateToSystemLanguage = updatedUser.translateToSystemLanguage;
      if ('translateToRegionalLanguage' in updatedUser) filteredData.translateToRegionalLanguage = updatedUser.translateToRegionalLanguage;
      if ('useCustomDestination' in updatedUser) filteredData.useCustomDestination = updatedUser.useCustomDestination;

      const response = await fetch(buildApiUrl('/users/me'), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(filteredData)
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          setCurrentUser({ ...currentUser, ...result.data });
          toast.success(t('success.settingsUpdated'));
        } else {
          throw new Error(result.error || t('errors.updateSettings'));
        }
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || t('errors.updateSettings'));
      }
    } catch (error) {
      console.error('Error updating settings:', error);
      toast.error(error instanceof Error ? error.message : t('errors.updateSettings'));
    }
  };

  // Check if user has moderator access or higher
  const hasModeratorAccess = useMemo(() => {
    if (!currentUser?.role) return false;
    const moderatorRoles = ['MODERATOR', 'ADMIN', 'BIGBOSS', 'CREATOR', 'MODO'];
    return moderatorRoles.includes(currentUser.role);
  }, [currentUser]);

  // Memoized tabs configuration
  const tabs = useMemo(() => {
    const allTabs = [
      {
        value: 'profile',
        label: t('tabs.profile'),
        icon: <UserIcon className="h-4 w-4" />,
        component: ProfileSettings
      },
      {
        value: 'privacy',
        label: t('tabs.privacy'),
        icon: <Shield className="h-4 w-4" />,
        component: PrivacySettings
      },
      {
        value: 'media',
        label: t('tabs.media', 'Media'),
        icon: <PlayCircle className="h-4 w-4" />,
        component: MediaSettings
      },
      {
        value: 'message',
        label: t('tabs.message', 'Messages'),
        icon: <MessageSquare className="h-4 w-4" />,
        component: MessageSettings
      },
      {
        value: 'notification',
        label: t('tabs.notifications'),
        icon: <Bell className="h-4 w-4" />,
        component: NotificationSettings
      },
      {
        value: 'application',
        label: t('tabs.application', 'Application'),
        icon: <SettingsIcon className="h-4 w-4" />,
        component: ApplicationSettings
      }
    ];

    // Only add Beta Playground for moderators and above
    if (hasModeratorAccess) {
      allTabs.push({
        value: 'beta',
        label: t('tabs.beta', 'Beta'),
        icon: <Rocket className="h-4 w-4" />,
        component: BetaPlayground
      });
    }

    return allTabs;
  }, [t, hasModeratorAccess]);

  // Memoized tab items for ResponsiveTabs
  const tabItems = useMemo(() => tabs.map(tab => ({
    value: tab.value,
    label: tab.label,
    icon: tab.icon,
    content: (() => {
      const Component = tab.component;
      return <Component user={currentUser} onUserUpdate={handleUserUpdate} />;
    })()
  })), [tabs, currentUser, handleUserUpdate]);

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-100 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="text-center" role="status" aria-label={t('loadingSettings', 'Loading settings')}>
          <div className="relative">
            <div className={`${reducedMotion ? '' : 'animate-spin'} rounded-full h-20 w-20 border-4 border-gray-200 border-t-blue-600 mx-auto`}></div>
            <SettingsIcon className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 h-8 w-8 text-blue-600" />
          </div>
          <p className="mt-6 text-gray-600 dark:text-gray-400 font-medium">{t('loadingSettings')}</p>
          <span className="sr-only">Loading...</span>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return null;
  }

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-100 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
      {/* Main content area */}
      <DashboardLayout title={t('title')} className="!bg-none !bg-transparent !h-auto !max-w-none !px-0">
        {/* Content area with full width */}
        <div className="relative z-10 space-y-8 pb-8 w-full py-8 px-4 md:px-8">
          {/* Hero Section */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 p-8 md:p-12 text-white shadow-2xl">
            <div className="absolute inset-0 bg-black/10"></div>
            <div className="relative z-10">
              <div className="flex items-center gap-4 mb-4">
                <div className="p-4 bg-white/20 backdrop-blur-sm rounded-2xl">
                  <SettingsIcon className="h-10 w-10" />
                </div>
                <div className="flex-1">
                  <h1 className="text-4xl md:text-5xl font-bold mb-2">{t('title')}</h1>
                  <p className="text-lg md:text-xl text-blue-100">
                    {t('pageTitle', { username: currentUser?.username })}
                  </p>
                </div>
              </div>
              <p className="text-base md:text-lg text-blue-100 max-w-3xl leading-relaxed">
                {t('subtitle') || 'Manage your account preferences, language settings, and privacy options'}
              </p>
            </div>
            {/* Decorative elements */}
            <div className="absolute -right-12 -bottom-12 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
            <div className="absolute -left-12 -top-12 w-80 h-80 bg-purple-500/20 rounded-full blur-3xl"></div>
          </div>

          {/* Settings Content with modern card */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl border-2 border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="p-6">
              <ResponsiveTabs
                items={tabItems}
                value={activeTab}
                onValueChange={setActiveTab}
                className="w-full"
                mobileBreakpoint="lg"
              />
            </div>
          </div>
        </div>
      </DashboardLayout>

      {/* Footer */}
      <div className="w-screen relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] mt-16">
        <Footer />
      </div>
    </div>
  );
}
