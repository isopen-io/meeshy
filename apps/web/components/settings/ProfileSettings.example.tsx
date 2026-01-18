/**
 * Example usage of ProfileSettings component
 *
 * This file shows how to integrate ProfileSettings into a settings page.
 */

'use client';

import { ProfileSettings } from '@/components/settings/ProfileSettings';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UserSettings } from '@/components/settings/user-settings';
import { PrivacySettings } from '@/components/settings/privacy-settings';
import { EncryptionSettings } from '@/components/settings/encryption-settings';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/hooks/use-i18n';

export function SettingsPageExample() {
  const router = useRouter();
  const { t } = useI18n('settings');

  const handleAccountDeleted = () => {
    // Redirect to homepage after account deletion
    router.push('/');
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-8">
        {t('title')}
      </h1>

      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="profile">
            {t('tabs.profile')}
          </TabsTrigger>
          <TabsTrigger value="account">
            {t('tabs.security')}
          </TabsTrigger>
          <TabsTrigger value="privacy">
            {t('tabs.privacy')}
          </TabsTrigger>
          <TabsTrigger value="encryption">
            {t('tabs.encryption')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-6">
          <UserSettings
            user={null} // Will be fetched from useAuth inside the component
            onUserUpdate={(user) => {
              console.log('User updated:', user);
            }}
          />
        </TabsContent>

        <TabsContent value="account" className="mt-6">
          <ProfileSettings onAccountDeleted={handleAccountDeleted} />
        </TabsContent>

        <TabsContent value="privacy" className="mt-6">
          <PrivacySettings />
        </TabsContent>

        <TabsContent value="encryption" className="mt-6">
          <EncryptionSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * Alternative: Separate page just for account security settings
 */
export function AccountSecurityPage() {
  const router = useRouter();
  const { t } = useI18n('settings');

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">
          {t('security.title')}
        </h1>
        <p className="text-muted-foreground">
          {t('security.description')}
        </p>
      </div>

      <ProfileSettings
        onAccountDeleted={() => {
          // Show confirmation message before redirect
          setTimeout(() => {
            router.push('/?account_deleted=true');
          }, 2000);
        }}
      />
    </div>
  );
}

/**
 * Minimal integration example
 */
export function MinimalProfileSettings() {
  return (
    <div className="p-6">
      <ProfileSettings />
    </div>
  );
}
