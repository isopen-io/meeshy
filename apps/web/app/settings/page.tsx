'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useQueryClient } from '@tanstack/react-query';
import { User } from '@/types';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Footer } from '@/components/layout/Footer';
import { useI18n } from '@/hooks/use-i18n';
import {
  Settings as SettingsIcon,
  User as UserIcon,
  Shield,
  MessageSquare,
  Bell,
  Rocket,
  PlayCircle,
  Lock
} from 'lucide-react';
import { useReducedMotion } from '@/hooks/use-accessibility';
import { ResponsiveTabs } from '@/components/ui/responsive-tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { FeatureErrorBoundary } from '@/components/ui/FeatureErrorBoundary';
import { useCurrentUserQuery } from '@/hooks/queries';
import { queryKeys } from '@/lib/react-query/query-keys';
import { useUnsavedChangesWarning } from '@/hooks/use-unsaved-changes-warning';
import { apiService } from '@/services/api.service';
import type { PreferenceCategory } from '@/types/preferences';

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
  () => import('@/components/settings/media-settings').then(mod => ({ default: mod.MediaSettings })),
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

const SecuritySettings = dynamic(
  () => import('@/components/settings/encryption-settings').then(mod => ({ default: mod.EncryptionSettings })),
  {
    loading: () => <SettingsLoadingSkeleton />,
    ssr: false
  }
);

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

function getInitialTab(): string {
  if (typeof window === 'undefined') return 'profile';
  const hash = window.location.hash.replace('#', '');

  if (hash.startsWith('media-')) {
    return 'media';
  }

  return hash || 'profile';
}

export default function SettingsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useI18n('settings');
  const reducedMotion = useReducedMotion();
  const [activeTab, setActiveTab] = useState(getInitialTab);
  useUnsavedChangesWarning();

  const {
    data: currentUser,
    isLoading,
    error: userError,
  } = useCurrentUserQuery();

  useEffect(() => {
    if (userError) {
      router.push('/login');
    }
  }, [userError, router]);

  const hasModeratorAccess = useMemo(() => {
    if (!(currentUser as User)?.role) return false;
    const moderatorRoles = ['MODERATOR', 'ADMIN', 'BIGBOSS', 'CREATOR', 'MODO'];
    return moderatorRoles.includes((currentUser as User).role);
  }, [currentUser]);

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
        value: 'security',
        label: t('tabs.security', 'Security'),
        icon: <Lock className="h-4 w-4" />,
        component: SecuritySettings
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

  useEffect(() => {
    if (tabs.length > 0) {
      const validTabValues = tabs.map(tab => tab.value);
      if (!validTabValues.includes(activeTab)) {
        setActiveTab('profile');
      }
    }
  }, [tabs, activeTab]);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      const validTabValues = tabs.map(tab => tab.value);

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

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const currentHash = window.location.hash.replace('#', '');

      if (activeTab === 'media' && currentHash.startsWith('media-')) {
        return;
      }

      window.history.replaceState(null, '', `#${activeTab}`);
    }
  }, [activeTab]);

  const TAB_TO_CATEGORY: Record<string, PreferenceCategory> = useMemo(() => ({
    privacy: 'privacy',
    notification: 'notification',
    media: 'audio',
    message: 'message',
    application: 'application',
    security: 'privacy',
  }), []);

  useEffect(() => {
    const categoriesToPrefetch = new Set<PreferenceCategory>();
    const currentIndex = tabs.findIndex(t => t.value === activeTab);
    const neighbors = [currentIndex - 1, currentIndex + 1].filter(i => i >= 0 && i < tabs.length);

    for (const idx of neighbors) {
      const cat = TAB_TO_CATEGORY[tabs[idx].value];
      if (cat) categoriesToPrefetch.add(cat);
    }

    for (const cat of categoriesToPrefetch) {
      queryClient.prefetchQuery({
        queryKey: queryKeys.preferences.category(cat),
        queryFn: () => apiService.get(`/api/v1/me/preferences/${cat}`).then(r => r.data),
      });
    }
  }, [activeTab, tabs, queryClient, TAB_TO_CATEGORY]);

  const handleUserUpdate = useCallback((updatedUser: User) => {
    queryClient.setQueryData(queryKeys.users.current(), updatedUser);
  }, [queryClient]);

  const tabItems = useMemo(() => tabs.map(tab => ({
    value: tab.value,
    label: tab.label,
    icon: tab.icon,
    content: (() => {
      const Component = tab.component as React.ComponentType<{ user?: User | null; onUserUpdate?: (user: User) => void }>;
      return <Component user={currentUser} onUserUpdate={handleUserUpdate} />;
    })()
  })), [tabs, currentUser, handleUserUpdate]);

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
      <DashboardLayout title={t('title')} className="!bg-none !bg-transparent !h-auto !max-w-none !px-0">
        <div className="relative z-10 space-y-8 pb-8 w-full py-8 px-4 md:px-8">
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
                    {t('pageTitle', { username: (currentUser as User)?.username })}
                  </p>
                </div>
              </div>
              <p className="text-base md:text-lg text-blue-100 max-w-3xl leading-relaxed">
                {t('subtitle') || 'Manage your account preferences, language settings, and privacy options'}
              </p>
            </div>
            <div className="absolute -right-12 -bottom-12 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
            <div className="absolute -left-12 -top-12 w-80 h-80 bg-purple-500/20 rounded-full blur-3xl"></div>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl border-2 border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="p-6">
              <FeatureErrorBoundary featureName="Settings">
                <ResponsiveTabs
                  items={tabItems}
                  value={activeTab}
                  onValueChange={setActiveTab}
                  className="w-full"
                  mobileBreakpoint="lg"
                />
              </FeatureErrorBoundary>
            </div>
          </div>
        </div>
      </DashboardLayout>

      <div className="w-screen relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] mt-16">
        <Footer />
      </div>
    </div>
  );
}
