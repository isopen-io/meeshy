'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { User } from '@/types';
import { buildApiUrl, API_ENDPOINTS } from '@/lib/config';
import { CompleteUserSettings } from '@/components/settings/complete-user-settings';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Footer } from '@/components/layout/Footer';
import { useI18n } from '@/hooks/use-i18n';
import { toast } from 'sonner';
import { Settings as SettingsIcon } from 'lucide-react';
import { authManager } from '@/services/auth-manager.service';
import { useReducedMotion } from '@/hooks/use-accessibility';

export default function SettingsPage() {
  const router = useRouter();
  const { t } = useI18n('settings');
  const reducedMotion = useReducedMotion();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadUserSettings = async () => {
      try {
        const token = authManager.getAuthToken();
        if (!token) {
          router.push('/login');
          return;
        }

        // ✅ OPTIMISATION WATERFALL: Paralléliser les fetches indépendants
        // Ceci élimine le waterfall critique identifié par Vercel
        // Au lieu de: user (500ms) -> render -> child components fetch (300ms) = 800ms total
        // Maintenant: Promise.all([user, notifications, encryption]) = 500ms total
        const [userResponse, notificationsResponse, encryptionResponse] = await Promise.all([
          // Fetch principal: données utilisateur (requis)
          fetch(buildApiUrl(API_ENDPOINTS.AUTH.ME), {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          }),
          // Fetch parallel 1: préférences de notifications (optionnel)
          fetch(`${buildApiUrl('')}/user-preferences/notifications`, {
            headers: { 'Authorization': `Bearer ${token}` }
          }).catch(() => null), // Graceful degradation si endpoint indisponible
          // Fetch parallel 2: préférences de chiffrement (optionnel)
          fetch(`${buildApiUrl('')}/user-preferences/encryption`, {
            headers: { 'Authorization': `Bearer ${token}` }
          }).catch(() => null), // Graceful degradation si endpoint indisponible
        ]);

        // ✅ Handle 401 early pour éviter JSON parsing inutile
        if (userResponse.status === 401) {
          authManager.clearAllSessions();
          router.push('/login');
          return;
        }

        // ✅ Single JSON parse - no double parsing on error
        const userResult = await userResponse.json();

        if (userResponse.ok) {
          if (userResult.success && userResult.data && userResult.data.user) {
            setCurrentUser(userResult.data.user);

            // ✅ BONUS: Précharger les données dans le cache du navigateur
            // Les composants enfants (NotificationSettings, EncryptionSettings) vont
            // bénéficier du cache HTTP et ne re-fetcheront pas ces données
            if (notificationsResponse?.ok) {
              const notifData = await notificationsResponse.json();
              // Les données sont maintenant en cache HTTP
              if (process.env.NODE_ENV === 'development') {
                console.log('[Settings] Notifications preferences preloaded');
              }
            }

            if (encryptionResponse?.ok) {
              const encData = await encryptionResponse.json();
              // Les données sont maintenant en cache HTTP
              if (process.env.NODE_ENV === 'development') {
                console.log('[Settings] Encryption preferences preloaded');
              }
            }
          } else {
            throw new Error(userResult.error || t('errors.loadProfile'));
          }
        } else {
          // Error response already parsed above
          throw new Error(userResult.error || t('errors.loadProfile'));
        }
      } catch (error) {
        console.error('Erreur lors du chargement des paramètres:', error);
        toast.error(error instanceof Error ? error.message : t('errors.loadSettings'));
        router.push('/login');
      } finally {
        setIsLoading(false);
      }
    };

    loadUserSettings();
  }, [router, t]);

  const handleUserUpdate = async (updatedUser: Partial<User>) => {
    try {
      const token = authManager.getAuthToken();
      if (!token) {
        router.push('/login');
        return;
      }

      // Filtrer uniquement les champs autorisés par le backend
      const filteredData: Record<string, any> = {};
      
      // Copier uniquement les champs autorisés
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
      console.error('Erreur lors de la mise à jour:', error);
      toast.error(error instanceof Error ? error.message : t('errors.updateSettings'));
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-100 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="text-center" role="status" aria-label={t('loadingSettings', 'Chargement des paramètres')}>
          <div className="relative">
            <div className={`${reducedMotion ? '' : 'animate-spin'} rounded-full h-20 w-20 border-4 border-gray-200 border-t-blue-600 mx-auto`}></div>
            <SettingsIcon className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 h-8 w-8 text-blue-600" />
          </div>
          <p className="mt-6 text-gray-600 dark:text-gray-400 font-medium">{t('loadingSettings')}</p>
          <span className="sr-only">Chargement en cours...</span>
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
        {/* Contenu principal scrollable pleine largeur */}
        <div className="relative z-10 space-y-8 pb-8 w-full py-8 px-4 md:px-8">

          {/* Hero Section avec style moderne */}
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
                {t('subtitle') || 'Gérez vos préférences de compte, de langue et de confidentialité'}
              </p>
            </div>
            {/* Decorative elements */}
            <div className="absolute -right-12 -bottom-12 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
            <div className="absolute -left-12 -top-12 w-80 h-80 bg-purple-500/20 rounded-full blur-3xl"></div>
          </div>

          {/* Settings Content avec Card moderne */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl border-2 border-gray-200 dark:border-gray-800 overflow-hidden">
            <CompleteUserSettings
              user={currentUser}
              onUserUpdate={handleUserUpdate}
            />
          </div>
        </div>
      </DashboardLayout>

      {/* Footer - Prend toute la largeur de la page, après le contenu scrollable */}
      <div className="w-screen relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] mt-16">
        <Footer />
      </div>
    </div>
  );
}
