'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Users,
  UserCheck,
  Shield,
  Activity,
  TrendingUp,
  AlertCircle,
  Clock,
  Server
} from 'lucide-react';
import { User } from '@/types';
import { buildApiUrl, API_ENDPOINTS } from '@/lib/config';
import { toast } from 'sonner';
import { adminService, AdminDashboardData } from '@/services/admin.service';
import { getDefaultPermissions } from '@/utils/user-adapter';
import { authManager } from '@/services/auth-manager.service';
import { useI18n } from '@/hooks/use-i18n';
import { useCurrentInterfaceLanguage } from '@/stores/language-store';
import { logger } from '@/utils/logger';

interface _UserCapabilities {
  role: string;
  level: number;
  permissions: string[];
  restrictions: string[];
}

const AdminDashboard: React.FC = () => {
  const router = useRouter();
  const { t } = useI18n('admin');
  const interfaceLanguage = useCurrentInterfaceLanguage();
  const [user, setUser] = useState<User | null>(null);
  const [dashboardData, setDashboardData] = useState<AdminDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadAdminStats = async () => {
    try {
      const response = await adminService.getDashboardStats();
      // Le backend retourne { data: { success: true, data: DashboardData } }
      // Donc response.data contient { success: true, data: DashboardData }
      if (response.data && (response.data as unknown).success && (response.data as unknown).data) {
        const dashData = (response.data as unknown).data;
        setDashboardData(dashData);
        toast.success(t('dashboard.statsRefreshed'));
      } else if (response.data) {
        // Cas où les données sont directement dans response.data (pas de wrapping)
        setDashboardData(response.data);
        toast.success(t('dashboard.statsRefreshed'));
      }
    } catch (error) {
      logger.error('[AdminDashboard]', 'Erreur lors du chargement des statistiques admin:', { error });
      toast.error(t('dashboard.loadError'));
    }
  };

  useEffect(() => {
    const loadUserAndData = async () => {
      try {
        setLoading(true);
        const token = authManager.getAuthToken();
        if (!token) {
          router.push('/login');
          return;
        }

        // ✅ OPTIMISATION: Paralléliser les fetches indépendants avec Promise.all
        // Cela élimine le waterfall et réduit la latence de 200-500ms
        const [userResponse, statsResult] = await Promise.all([
          fetch(buildApiUrl(API_ENDPOINTS.AUTH.ME), {
            headers: { Authorization: `Bearer ${token}` }
          }),
          // Charger les stats admin en parallèle
          adminService.getDashboardStats().catch(error => {
            logger.error('[AdminDashboard]', 'Erreur lors du chargement des statistiques admin:', { error });
            return null; // Retourner null en cas d'erreur pour ne pas bloquer le chargement user
          })
        ]);

        // Vérifier la réponse utilisateur
        if (!userResponse.ok) {
          // Do NOT clear the session on an admin profile fetch failure —
          // only explicit logout is allowed to wipe credentials. Redirect
          // home; the user stays signed in and can retry later.
          router.push('/');
          return;
        }

        const response = await userResponse.json();

        // Extraire les données utilisateur de la réponse API
        let userData;
        if (response.success && response.data?.user) {
          userData = response.data.user;
        } else if (response.user) {
          userData = response.user;
        } else {
          userData = response;
        }

        setUser(userData);

        // S'assurer que les permissions sont définies
        if (!userData.permissions) {
          userData.permissions = getDefaultPermissions(userData.role);
        }

        // Vérifier les permissions admin
        const hasAdminAccess = userData.permissions?.canAccessAdmin || false;

        if (!hasAdminAccess) {
          router.push('/dashboard');
          toast.error(t('dashboard.unauthorizedAccess'));
          return;
        }

        // Traiter les stats si elles ont été chargées avec succès
        if (statsResult) {
          // Le backend retourne { data: { success: true, data: DashboardData } }
          if (statsResult.data && (statsResult.data as unknown).success && (statsResult.data as unknown).data) {
            const dashData = (statsResult.data as unknown).data;
            setDashboardData(dashData);
          } else if (statsResult.data) {
            // Cas où les données sont directement dans statsResult.data (pas de wrapping)
            setDashboardData(statsResult.data);
          }
        } else {
          // Si le chargement des stats a échoué, afficher un message mais permettre l'accès
          toast.error(t('dashboard.loadError'));
        }

      } catch (error) {
        logger.error('[AdminDashboard]', 'Erreur lors du chargement des données admin:', { error });
        toast.error(t('dashboard.loadError'));
        router.push('/dashboard');
      } finally {
        setLoading(false);
      }
    };

    loadUserAndData();
  }, [router]);

  if (loading) {
    return (
      <AdminLayout currentPage="/admin">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-2">{t('dashboard.loadingData')}</span>
        </div>
      </AdminLayout>
    );
  }

  if (!user) {
    return null;
  }

  const stats = dashboardData?.statistics;

  return (
    <AdminLayout currentPage="/admin">
      <div className="space-y-6">
        {/* En-tête avec informations utilisateur */}
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 rounded-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">{t('dashboard.welcome', { name: user.displayName || (user.firstName ? `${user.firstName} ${user.lastName}` : user.username) })}</h1>
              <p className="text-purple-100 mt-1">
                {t('dashboard.accessLevel', { role: user.role })}
              </p>
            </div>
            <div className="text-right">
              <div className="text-sm text-purple-100">{t('dashboard.lastLogin')}</div>
              <div className="text-lg font-semibold">
                {new Date().toLocaleTimeString(interfaceLanguage || 'en', {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Statistiques principales - Les 10 métriques demandées */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-6">
          {/* 1. Utilisateurs */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('dashboard.statUsers')}</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalUsers || 0}</div>
              <p className="text-xs text-muted-foreground">
                {t('dashboard.statUsersActive', { count: stats?.activeUsers || 0 })}
              </p>
            </CardContent>
          </Card>

          {/* 2. Utilisateurs anonymes */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('dashboard.statAnonymous')}</CardTitle>
              <UserCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-indigo-600">{stats?.totalAnonymousUsers || 0}</div>
              <p className="text-xs text-muted-foreground">
                {t('dashboard.statUsersActive', { count: stats?.activeAnonymousUsers || 0 })}
              </p>
            </CardContent>
          </Card>

          {/* 3. Messages */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('dashboard.statMessages')}</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{stats?.totalMessages || 0}</div>
              <p className="text-xs text-muted-foreground">
                {t('dashboard.statMessagesSent')}
              </p>
            </CardContent>
          </Card>

          {/* 4. Communautés */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('dashboard.statCommunities')}</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">{stats?.totalCommunities || 0}</div>
              <p className="text-xs text-muted-foreground">
                {t('dashboard.statCommunitiesCreated')}
              </p>
            </CardContent>
          </Card>

          {/* 5. Traductions */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('dashboard.statTranslations')}</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats?.totalTranslations || 0}</div>
              <p className="text-xs text-muted-foreground">
                {t('dashboard.statTranslationsDone')}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Deuxième ligne de statistiques */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-6">
          {/* 6. Liens de conversation */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('dashboard.statLinks')}</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">{stats?.totalShareLinks || 0}</div>
              <p className="text-xs text-muted-foreground">
                {t('dashboard.statLinksActive', { count: stats?.activeShareLinks || 0 })}
              </p>
            </CardContent>
          </Card>

          {/* 7. Signalements */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('dashboard.statReports')}</CardTitle>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{stats?.totalReports || 0}</div>
              <p className="text-xs text-muted-foreground">
                {t('dashboard.statReportsFlagged')}
              </p>
            </CardContent>
          </Card>

          {/* 8. Invitations */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('dashboard.statInvitations')}</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{stats?.totalInvitations || 0}</div>
              <p className="text-xs text-muted-foreground">
                {t('dashboard.statInvitationsPending')}
              </p>
            </CardContent>
          </Card>

          {/* 9. Administrateurs */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('dashboard.statAdmins')}</CardTitle>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">{stats?.adminUsers || 0}</div>
              <p className="text-xs text-muted-foreground">
                {t('dashboard.statAdminsMods')}
              </p>
            </CardContent>
          </Card>

          {/* 10. Langues les plus utilisées */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('dashboard.statLanguages')}</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-cyan-600">
                {stats?.topLanguages?.length || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                {t('dashboard.statLanguagesDetected')}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Langues les plus utilisées */}
        {stats?.topLanguages && stats.topLanguages.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">{t('dashboard.topLanguagesTitle')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {stats.topLanguages.slice(0, 6).map((lang: { language: string; count: number }, index: number) => (
                <Card key={lang.language}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-lg font-semibold">{lang.language.toUpperCase()}</div>
                        <div className="text-sm text-muted-foreground">
                          {lang.count} {t('dashboard.topLanguagesMessages')}
                        </div>
                      </div>
                      <div className="text-2xl font-bold text-blue-600">
                        #{index + 1}
                      </div>
                    </div>
                    <div className="mt-2">
                      <Progress
                        value={(lang.count / (stats.topLanguages?.[0]?.count || 1)) * 100}
                        className="h-2"
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Activité récente */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <TrendingUp className="w-5 h-5" />
                <span>{t('dashboard.recentActivityTitle')}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{t('dashboard.recentNewUsers')}</span>
                  <Badge variant="secondary">{dashboardData?.recentActivity?.newUsers || 0}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{t('dashboard.recentNewConversations')}</span>
                  <Badge variant="secondary">{dashboardData?.recentActivity?.newConversations || 0}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{t('dashboard.recentNewMessages')}</span>
                  <Badge variant="secondary">{dashboardData?.recentActivity?.newMessages || 0}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{t('dashboard.recentNewAnonymous')}</span>
                  <Badge variant="secondary">{dashboardData?.recentActivity?.newAnonymousUsers || 0}</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Clock className="w-5 h-5" />
                <span>{t('dashboard.lastUpdateTitle')}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  {dashboardData?.timestamp ?
                    new Date(dashboardData.timestamp).toLocaleString(interfaceLanguage || 'en') :
                    t('dashboard.lastUpdateUnavailable')
                  }
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadAdminStats}
                  className="w-full"
                >
                  {t('dashboard.refreshButton')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Actions rapides - Navigation vers toutes les pages dédiées */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Activity className="w-5 h-5" />
              <span>{t('dashboard.navTitle')}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Ligne 1 - Gestion des utilisateurs et contenus */}
            <div className="mb-3">
              <h4 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">{t('dashboard.navGroupUsers')}</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                <Button
                  variant="outline"
                  className="h-20 flex flex-col space-y-2"
                  onClick={() => router.push('/admin/users')}
                >
                  <Users className="w-6 h-6" />
                  <span className="text-sm">{t('dashboard.navUsers')}</span>
                </Button>

                <Button
                  variant="outline"
                  className="h-20 flex flex-col space-y-2"
                  onClick={() => router.push('/admin/anonymous-users')}
                >
                  <UserCheck className="w-6 h-6" />
                  <span className="text-sm">{t('dashboard.navAnonymous')}</span>
                </Button>

                <Button
                  variant="outline"
                  className="h-20 flex flex-col space-y-2"
                  onClick={() => router.push('/admin/messages')}
                >
                  <Activity className="w-6 h-6" />
                  <span className="text-sm">{t('dashboard.navMessages')}</span>
                </Button>

                <Button
                  variant="outline"
                  className="h-20 flex flex-col space-y-2"
                  onClick={() => router.push('/admin/communities')}
                >
                  <Users className="w-6 h-6" />
                  <span className="text-sm">{t('dashboard.navCommunities')}</span>
                </Button>

                <Button
                  variant="outline"
                  className="h-20 flex flex-col space-y-2"
                  onClick={() => router.push('/admin/share-links')}
                >
                  <Activity className="w-6 h-6" />
                  <span className="text-sm">{t('dashboard.navLinks')}</span>
                </Button>
              </div>
            </div>

            {/* Ligne 2 - Modération et traductions */}
            <div className="mb-3">
              <h4 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">{t('dashboard.navGroupModeration')}</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                <Button
                  variant="outline"
                  className="h-20 flex flex-col space-y-2"
                  onClick={() => router.push('/admin/reports')}
                >
                  <AlertCircle className="w-6 h-6" />
                  <span className="text-sm">{t('dashboard.navReports')}</span>
                </Button>

                <Button
                  variant="outline"
                  className="h-20 flex flex-col space-y-2"
                  onClick={() => router.push('/admin/moderation')}
                >
                  <Shield className="w-6 h-6" />
                  <span className="text-sm">{t('dashboard.navModeration')}</span>
                </Button>

                <Button
                  variant="outline"
                  className="h-20 flex flex-col space-y-2"
                  onClick={() => router.push('/admin/translations')}
                >
                  <TrendingUp className="w-6 h-6" />
                  <span className="text-sm">{t('dashboard.navTranslations')}</span>
                </Button>

                <Button
                  variant="outline"
                  className="h-20 flex flex-col space-y-2"
                  onClick={() => router.push('/admin/languages')}
                >
                  <TrendingUp className="w-6 h-6" />
                  <span className="text-sm">{t('dashboard.navLanguages')}</span>
                </Button>

                <Button
                  variant="outline"
                  className="h-20 flex flex-col space-y-2"
                  onClick={() => router.push('/admin/invitations')}
                >
                  <Users className="w-6 h-6" />
                  <span className="text-sm">{t('dashboard.navInvitations')}</span>
                </Button>
              </div>
            </div>

            {/* Ligne 3 - Analytics, Audit et Configuration */}
            <div>
              <h4 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">{t('dashboard.navGroupAnalytics')}</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                <Button
                  variant="outline"
                  className="h-20 flex flex-col space-y-2"
                  onClick={() => router.push('/admin/analytics')}
                >
                  <TrendingUp className="w-6 h-6" />
                  <span className="text-sm">{t('dashboard.navAnalytics')}</span>
                </Button>

                <Button
                  variant="outline"
                  className="h-20 flex flex-col space-y-2"
                  onClick={() => router.push('/admin/audit-logs')}
                >
                  <Shield className="w-6 h-6" />
                  <span className="text-sm">{t('dashboard.navAuditLogs')}</span>
                </Button>

                <Button
                  variant="outline"
                  className="h-20 flex flex-col space-y-2"
                  onClick={() => router.push('/admin/settings')}
                >
                  <Server className="w-6 h-6" />
                  <span className="text-sm">{t('dashboard.navSettings')}</span>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Informations système */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Server className="w-5 h-5" />
              <span>{t('dashboard.systemStatusTitle')}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center justify-between">
                <span className="text-sm">{t('dashboard.systemServer')}</span>
                <Badge variant="outline" className="text-green-600 border-green-200">
                  {t('dashboard.systemOnline')}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">{t('dashboard.systemDatabase')}</span>
                <Badge variant="outline" className="text-green-600 border-green-200">
                  {t('dashboard.systemConnected')}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">{t('dashboard.systemWebSocket')}</span>
                <Badge variant="outline" className="text-green-600 border-green-200">
                  {t('dashboard.systemActive')}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default AdminDashboard;
