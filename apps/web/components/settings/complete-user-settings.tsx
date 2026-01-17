'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ResponsiveTabs } from '@/components/ui/responsive-tabs';
import { User } from '@/types';
import {
  Globe,
  User as UserIcon,
  Palette,
  Bell,
  Shield,
  Key,
  Mic
} from 'lucide-react';
import { UserSettings } from './user-settings';
import { LanguageSettings } from '@/components/translation/language-settings';
import { ThemeSettings } from './theme-settings';
import { NotificationSettings } from './notification-settings';
import { PrivacySettings } from './privacy-settings';
import { EncryptionSettings } from './encryption-settings';
import { AudioSettings } from './audio-settings';
import { useI18n } from '@/hooks/useI18n';

interface CompleteUserSettingsProps {
  user: User | null;
  onUserUpdate: (updatedUser: Partial<User>) => void;
  children?: React.ReactNode;
}

const VALID_TABS = ['user', 'translation', 'theme', 'notifications', 'privacy', 'encryption', 'audio'];

// Fonction pour obtenir le tab initial depuis le hash URL
function getInitialTab(): string {
  if (typeof window === 'undefined') return 'user';
  const hash = window.location.hash.replace('#', '');
  return VALID_TABS.includes(hash) ? hash : 'user';
}

export function CompleteUserSettings({ user, onUserUpdate, children }: CompleteUserSettingsProps) {
  const { t } = useI18n('settings');
  // Initialisation lazy pour lire le hash dès le premier render côté client
  const [activeTab, setActiveTab] = useState(getInitialTab);

  // Écouter les changements de hash (navigation par lien ou bouton retour)
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      if (VALID_TABS.includes(hash) && hash !== activeTab) {
        setActiveTab(hash);
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [activeTab]);

  // Mettre à jour l'URL quand l'onglet change
  useEffect(() => {
    window.history.replaceState(null, '', `#${activeTab}`);
  }, [activeTab]);

  if (!user) return null;

  // Définition des onglets avec leurs icônes et contenus
  const tabItems = [
    {
      value: "user",
      label: t('tabs.profile'),
      icon: <UserIcon className="h-4 w-4" />,
      content: <UserSettings user={user} onUserUpdate={onUserUpdate} />
    },
    {
      value: "notifications",
      label: t('tabs.notifications', 'Notifications'),
      icon: <Bell className="h-4 w-4" />,
      content: <NotificationSettings />
    },
    {
      value: "privacy",
      label: t('tabs.privacy', 'Confidentialité'),
      icon: <Shield className="h-4 w-4" />,
      content: <PrivacySettings />
    },
    {
      value: "encryption",
      label: t('tabs.encryption', 'Chiffrement'),
      icon: <Key className="h-4 w-4" />,
      content: <EncryptionSettings />
    },
    {
      value: "audio",
      label: t('tabs.audio', 'Audio'),
      icon: <Mic className="h-4 w-4" />,
      content: <AudioSettings />
    },
    {
      value: "translation",
      label: t('tabs.translation'),
      icon: <Globe className="h-4 w-4" />,
      content: (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('translation.title')}</CardTitle>
            <CardDescription>
              {t('translation.description')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LanguageSettings user={user} onUserUpdate={onUserUpdate} />
          </CardContent>
        </Card>
      )
    },
    {
      value: "theme",
      label: t('tabs.theme'),
      icon: <Palette className="h-4 w-4" />,
      content: <ThemeSettings />
    }
  ];

  return (
    <div className="w-full p-6">
      <ResponsiveTabs
        items={tabItems}
        value={activeTab}
        onValueChange={setActiveTab}
        className="w-full"
        mobileBreakpoint="lg"
      />

      {children}
    </div>
  );
}
