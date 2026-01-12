'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ResponsiveTabs } from '@/components/ui/responsive-tabs';
import { User } from '@/types';
import {
  Globe,
  User as UserIcon,
  Palette,
  Lock,
  Bell,
  Shield,
  Key
} from 'lucide-react';
import { UserSettings } from './user-settings';
import { LanguageSettings } from '@/components/translation/language-settings';
import { ThemeSettings } from './theme-settings';
import { PasswordSettings } from './password-settings';
import { NotificationSettings } from './notification-settings';
import { PrivacySettings } from './privacy-settings';
import { EncryptionSettings } from './encryption-settings';
import { useI18n } from '@/hooks/useI18n';

interface CompleteUserSettingsProps {
  user: User | null;
  onUserUpdate: (updatedUser: Partial<User>) => void;
  children?: React.ReactNode;
}

export function CompleteUserSettings({ user, onUserUpdate, children }: CompleteUserSettingsProps) {
  const { t } = useI18n('settings');
  const [activeTab, setActiveTab] = useState('user');

  // Gérer l'ancrage URL pour les tabs
  useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    const validTabs = ['user', 'translation', 'security', 'theme', 'notifications', 'privacy', 'encryption'];
    if (hash && validTabs.includes(hash)) {
      setActiveTab(hash);
    }
  }, []);

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
      value: "security",
      label: t('tabs.security'),
      icon: <Lock className="h-4 w-4" />,
      content: <PasswordSettings />
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
