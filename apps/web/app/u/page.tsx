'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { toast } from 'sonner';
import {
  User as UserIcon,
  Mail,
  Phone,
  Calendar,
  Edit,
  MessageSquare,
  Users,
  Globe,
  Activity
} from 'lucide-react';
import { User } from '@/types';
import { usersService } from '@/services';
import { getUserInitials } from '@/utils/user';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { useSocketIOMessaging } from '@/hooks/use-socketio-messaging';
import { authManager } from '@/services/auth-manager.service';
import { useI18n } from '@/hooks/useI18n';

function ProfilePageContent() {
  const { t } = useI18n('profile');
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [userOnlineStatus, setUserOnlineStatus] = useState<boolean>(false);

  // Hook pour écouter les changements de statut en temps réel
  const { } = useSocketIOMessaging({
    onUserStatus: (statusUserId: string, username: string, isOnline: boolean) => {
      if (statusUserId === user?.id) {
        setUserOnlineStatus(isOnline);
      }
    }
  });

  // Charger le profil de l'utilisateur connecté via API /auth/me
  const loadUserProfile = useCallback(async () => {
    try {
      setIsLoading(true);

      // Vérifier l'authentification
      const authToken = authManager.getAuthToken();
      if (!authToken) {
        toast.error(t('errors.notAuthenticated'));
        router.push('/login');
        return;
      }

      // Appeler l'API /auth/me pour récupérer le profil complet (avec createdAt et updatedAt corrects)
      const response = await usersService.getMyProfile();
      setUser(response.data);
      setUserOnlineStatus(response.data.isOnline);
    } catch (error) {
      console.error('Error loading profile:', error);
      toast.error(t('errors.loadProfileError'));
    } finally {
      setIsLoading(false);
    }
  }, [router, t]);

  // Charger le profil au montage
  useEffect(() => {
    loadUserProfile();
  }, [loadUserProfile]);

  // Synchroniser le statut en ligne
  useEffect(() => {
    if (user) {
      setUserOnlineStatus(user.isOnline);
    }
  }, [user?.isOnline]);


  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getLanguageName = (code: string) => {
    const languages: Record<string, Record<string, string>> = {
      'fr': {
        'fr': 'Français',
        'en': 'Anglais',
        'es': 'Espagnol',
        'de': 'Allemand',
        'it': 'Italien',
        'pt': 'Portugais',
      },
      'en': {
        'fr': 'French',
        'en': 'English',
        'es': 'Spanish',
        'de': 'German',
        'it': 'Italian',
        'pt': 'Portuguese',
      }
    };
    const currentLanguage = user?.systemLanguage || 'fr';
    return languages[currentLanguage]?.[code] || code;
  };

  if (isLoading) {
    return (
      <DashboardLayout title={t('title')} className="!bg-none !bg-transparent !h-auto !max-w-none !px-0">
        <div className="w-full px-4 md:px-8">
          <div className="animate-pulse">
            <div className="h-48 bg-gray-200 rounded-lg mb-6"></div>
            <div className="space-y-4">
              <div className="h-6 bg-gray-200 rounded w-1/3"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
              <div className="h-4 bg-gray-200 rounded w-2/3"></div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <DashboardLayout title={t('title')} className="!bg-none !bg-transparent !h-auto !max-w-none !px-0">
      <div className="w-full px-4 md:px-8 space-y-6">
        {/* Header du profil */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start space-x-6">
              <Avatar className="h-24 w-24">
                <AvatarImage src={user.avatar} alt={user.firstName} />
                <AvatarFallback className="text-2xl">
                  {getUserInitials(user)}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1">
                <div className="flex items-center justify-between mb-4">
                  <div>
                                    <h1 className="text-3xl font-bold text-gray-900">
                  {user.firstName || user.displayName || user.username} {user.lastName || ''}
                </h1>
                <p className="text-lg text-gray-600">@{user.username || 'utilisateur'}</p>
                    {user.displayName && (
                      <p className="text-gray-500 mt-1">{user.displayName}</p>
                    )}
                  </div>

                  <Button
                    onClick={() => router.push('/settings')}
                    className="flex items-center space-x-2"
                  >
                    <Edit className="h-4 w-4" />
                    <span>{t('edit')}</span>
                  </Button>
                </div>

                <div className="flex items-center space-x-1 mb-4">
                  <div className={`w-3 h-3 rounded-full ${userOnlineStatus ? 'bg-green-500' : 'bg-gray-400'}`} />
                  <span className="text-sm text-gray-600">
                    {userOnlineStatus ? t('online') : t('offline')}
                  </span>
                </div>

              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Informations personnelles */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <UserIcon className="h-5 w-5" />
                <span>{t('personalInfo')}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-3">
                <Mail className="h-4 w-4 text-gray-400" />
                <div>
                  <p className="text-sm font-medium">{t('email')}</p>
                  <p className="text-gray-600">{user.email}</p>
                </div>
              </div>

              {user.phoneNumber && (
                <div className="flex items-center space-x-3">
                  <Phone className="h-4 w-4 text-gray-400" />
                  <div>
                    <p className="text-sm font-medium">{t('phone')}</p>
                    <p className="text-gray-600">{user.phoneNumber}</p>
                  </div>
                </div>
              )}

              <div className="flex items-center space-x-3">
                <Calendar className="h-4 w-4 text-gray-400" />
                <div>
                  <p className="text-sm font-medium">{t('memberSince')}</p>
                  <p className="text-gray-600">
                    {user.createdAt ? formatDate(
                      typeof user.createdAt === 'string'
                        ? user.createdAt
                        : user.createdAt.toString()
                    ) : t('dateUnavailable')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Préférences de langues */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Globe className="h-5 w-5" />
                <span>{t('languages')}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-medium mb-2">{t('systemLanguage')}</p>
                <Badge variant="outline">
                  {getLanguageName(user.systemLanguage || 'fr')}
                </Badge>
              </div>

              <div>
                <p className="text-sm font-medium mb-2">{t('regionalLanguage')}</p>
                <Badge variant="outline">
                  {getLanguageName(user.regionalLanguage || 'fr')}
                </Badge>
              </div>

              {user.customDestinationLanguage && (
                <div>
                  <p className="text-sm font-medium mb-2">{t('customDestinationLanguage')}</p>
                  <Badge variant="outline">
                    {getLanguageName(user.customDestinationLanguage)}
                  </Badge>
                </div>
              )}

              <div className="pt-2">
                <div className="flex items-center space-x-2 mb-2">
                  <div className={`w-2 h-2 rounded-full ${user.autoTranslateEnabled ? 'bg-green-500' : 'bg-gray-400'}`} />
                  <span className="text-sm">
                    {user.autoTranslateEnabled ? t('autoTranslateEnabled') : t('autoTranslateDisabled')}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Actions rapides */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Activity className="h-5 w-5" />
              <span>{t('quickActions')}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Button
                variant="outline"
                onClick={() => router.push('/conversations')}
                className="flex items-center space-x-2"
              >
                <MessageSquare className="h-4 w-4" />
                <span>{t('conversations')}</span>
              </Button>

              <Button
                variant="outline"
                onClick={() => router.push('/groups')}
                className="flex items-center space-x-2"
              >
                <Users className="h-4 w-4" />
                <span>{t('groups')}</span>
              </Button>

              <Button
                variant="outline"
                onClick={() => router.push('/settings')}
                className="flex items-center space-x-2"
              >
                <Edit className="h-4 w-4" />
                <span>{t('editProfile')}</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

export default function ProfilePage() {
  return (
    <AuthGuard>
      <ProfilePageContent />
    </AuthGuard>
  );
}
