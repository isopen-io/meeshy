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
import { User, UserRoleEnum } from '@/types';
import { buildApiUrl, API_ENDPOINTS } from '@/lib/config';
import { toast } from 'sonner';
import { adminService } from '@/services/admin.service';
import { getDefaultPermissions } from '@/utils/user-adapter';
import { authManager } from '@/services/auth-manager.service';

interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  inactiveUsers: number;
  totalConversations: number;
  totalCommunities: number;
  totalMessages: number;
  adminUsers: number;
  totalAnonymousUsers: number;
  activeAnonymousUsers: number;
  inactiveAnonymousUsers: number;
  totalShareLinks: number;
  activeShareLinks: number;
  totalTranslations?: number;
  totalReports?: number;
  totalInvitations?: number;
  topLanguages?: Array<{ language: string; count: number }>;
  usersByRole: Record<string, number>;
  messagesByType: Record<string, number>;
}

interface UserCapabilities {
  role: string;
  level: number;
  permissions: string[];
  restrictions: string[];
}

interface DashboardData {
  statistics: AdminStats;
  recentActivity: {
    newUsers: number;
    newConversations: number;
    newMessages: number;
    newAnonymousUsers: number;
  };
  userInfo?: {
    id: string;
    username: string;
    role: string;
    [key: string]: any;
  };
  userPermissions: any;
  timestamp: string;
}

const AdminDashboard: React.FC = () => {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadAdminStats = async () => {
    try {
      const response = await adminService.getDashboardStats();
      // Le backend retourne { data: { success: true, data: DashboardData } }
      // Donc response.data contient { success: true, data: DashboardData }
      if (response.data && (response.data as any).success && (response.data as any).data) {
        const dashData = (response.data as any).data;
        setDashboardData(dashData);
      } else if (response.data) {
        // Cas où les données sont directement dans response.data (pas de wrapping)
        setDashboardData(response.data);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des statistiques admin:', error);
      toast.error('Erreur lors du chargement des statistiques d\'administration');
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

        // Charger l'utilisateur
        const userResponse = await fetch(buildApiUrl(API_ENDPOINTS.AUTH.ME), {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (!userResponse.ok) {
          authManager.clearAllSessions();
          router.push('/login');
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
          toast.error('Accès non autorisé à l\'administration');
          return;
        }


        // Charger les vraies données admin
        await loadAdminStats();

      } catch (error) {
        console.error('Erreur lors du chargement des données admin:', error);
        toast.error('Erreur lors du chargement des données d\'administration');
        router.push('/dashboard');
      } finally {
        setLoading(false);
      }
    };

    loadUserAndData();
  }, [router]);

  if (!user) {
    return null;
  }

  if (loading) {
    return (
      <AdminLayout currentPage="/admin">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-2">Chargement des données d&apos;administration...</span>
        </div>
      </AdminLayout>
    );
  }

  const stats = dashboardData?.statistics;
  const userInfo = dashboardData?.userInfo;

  return (
    <AdminLayout currentPage="/admin">
      <div className="space-y-6">
        {/* En-tête avec informations utilisateur */}
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 rounded-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Bienvenue, {user.displayName || (user.firstName ? `${user.firstName} ${user.lastName}` : user.username)}</h1>
              <p className="text-purple-100 mt-1">
                Niveau d&apos;accès: {userInfo?.role || user.role} - Administration Meeshy
              </p>
            </div>
            <div className="text-right">
              <div className="text-sm text-purple-100">Dernière connexion</div>
              <div className="text-lg font-semibold">
                {new Date().toLocaleTimeString('fr-FR', { 
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
              <CardTitle className="text-sm font-medium">Utilisateurs</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalUsers || 0}</div>
              <p className="text-xs text-muted-foreground">
                {stats?.activeUsers || 0} actifs
              </p>
            </CardContent>
          </Card>

          {/* 2. Utilisateurs anonymes */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Anonymes</CardTitle>
              <UserCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-indigo-600">{stats?.totalAnonymousUsers || 0}</div>
              <p className="text-xs text-muted-foreground">
                {stats?.activeAnonymousUsers || 0} actifs
              </p>
            </CardContent>
          </Card>

          {/* 3. Messages */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Messages</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{stats?.totalMessages || 0}</div>
              <p className="text-xs text-muted-foreground">
                Messages envoyés
              </p>
            </CardContent>
          </Card>

          {/* 4. Communautés */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Communautés</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">{stats?.totalCommunities || 0}</div>
              <p className="text-xs text-muted-foreground">
                Communautés créées
              </p>
            </CardContent>
          </Card>

          {/* 5. Traductions */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Traductions</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats?.totalTranslations || 0}</div>
              <p className="text-xs text-muted-foreground">
                Traductions effectuées
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Deuxième ligne de statistiques */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-6">
          {/* 6. Liens de conversation */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Liens créés</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">{stats?.totalShareLinks || 0}</div>
              <p className="text-xs text-muted-foreground">
                {stats?.activeShareLinks || 0} actifs
              </p>
            </CardContent>
          </Card>

          {/* 7. Signalements */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Signalements</CardTitle>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{stats?.totalReports || 0}</div>
              <p className="text-xs text-muted-foreground">
                Messages signalés
              </p>
            </CardContent>
          </Card>

          {/* 8. Invitations */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Invitations</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{stats?.totalInvitations || 0}</div>
              <p className="text-xs text-muted-foreground">
                Demandes en attente
              </p>
            </CardContent>
          </Card>

          {/* 9. Administrateurs */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Administrateurs</CardTitle>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">{stats?.adminUsers || 0}</div>
              <p className="text-xs text-muted-foreground">
                Admins et modérateurs
              </p>
            </CardContent>
          </Card>

          {/* 10. Langues les plus utilisées */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Langues</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-cyan-600">
                {stats?.topLanguages?.length || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                Langues détectées
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Langues les plus utilisées */}
        {stats?.topLanguages && stats.topLanguages.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Langues les plus utilisées</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {stats.topLanguages.slice(0, 6).map((lang: { language: string; count: number }, index: number) => (
                <Card key={lang.language}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-lg font-semibold">{lang.language.toUpperCase()}</div>
                        <div className="text-sm text-muted-foreground">
                          {lang.count} messages
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
                <span>Activité récente (7 derniers jours)</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Nouveaux utilisateurs</span>
                  <Badge variant="secondary">{dashboardData?.recentActivity?.newUsers || 0}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Nouvelles conversations</span>
                  <Badge variant="secondary">{dashboardData?.recentActivity?.newConversations || 0}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Nouveaux messages</span>
                  <Badge variant="secondary">{dashboardData?.recentActivity?.newMessages || 0}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Nouveaux utilisateurs anonymes</span>
                  <Badge variant="secondary">{dashboardData?.recentActivity?.newAnonymousUsers || 0}</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Clock className="w-5 h-5" />
                <span>Dernière mise à jour</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  {dashboardData?.timestamp ? 
                    new Date(dashboardData.timestamp).toLocaleString('fr-FR') : 
                    'Non disponible'
                  }
                </p>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={loadAdminStats}
                  className="w-full"
                >
                  Actualiser les données
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
              <span>Navigation - Toutes les pages admin</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Ligne 1 - Gestion des utilisateurs et contenus */}
            <div className="mb-3">
              <h4 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">Gestion des utilisateurs et contenus</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                <Button
                  variant="outline"
                  className="h-20 flex flex-col space-y-2"
                  onClick={() => router.push('/admin/users')}
                >
                  <Users className="w-6 h-6" />
                  <span className="text-sm">Utilisateurs</span>
                </Button>

                <Button
                  variant="outline"
                  className="h-20 flex flex-col space-y-2"
                  onClick={() => router.push('/admin/anonymous-users')}
                >
                  <UserCheck className="w-6 h-6" />
                  <span className="text-sm">Anonymes</span>
                </Button>

                <Button
                  variant="outline"
                  className="h-20 flex flex-col space-y-2"
                  onClick={() => router.push('/admin/messages')}
                >
                  <Activity className="w-6 h-6" />
                  <span className="text-sm">Messages</span>
                </Button>

                <Button
                  variant="outline"
                  className="h-20 flex flex-col space-y-2"
                  onClick={() => router.push('/admin/communities')}
                >
                  <Users className="w-6 h-6" />
                  <span className="text-sm">Communautés</span>
                </Button>

                <Button
                  variant="outline"
                  className="h-20 flex flex-col space-y-2"
                  onClick={() => router.push('/admin/share-links')}
                >
                  <Activity className="w-6 h-6" />
                  <span className="text-sm">Liens créés</span>
                </Button>
              </div>
            </div>

            {/* Ligne 2 - Modération et traductions */}
            <div className="mb-3">
              <h4 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">Modération et langues</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                <Button
                  variant="outline"
                  className="h-20 flex flex-col space-y-2"
                  onClick={() => router.push('/admin/reports')}
                >
                  <AlertCircle className="w-6 h-6" />
                  <span className="text-sm">Signalements</span>
                </Button>

                <Button
                  variant="outline"
                  className="h-20 flex flex-col space-y-2"
                  onClick={() => router.push('/admin/moderation')}
                >
                  <Shield className="w-6 h-6" />
                  <span className="text-sm">Modération</span>
                </Button>

                <Button
                  variant="outline"
                  className="h-20 flex flex-col space-y-2"
                  onClick={() => router.push('/admin/translations')}
                >
                  <TrendingUp className="w-6 h-6" />
                  <span className="text-sm">Traductions</span>
                </Button>

                <Button
                  variant="outline"
                  className="h-20 flex flex-col space-y-2"
                  onClick={() => router.push('/admin/languages')}
                >
                  <TrendingUp className="w-6 h-6" />
                  <span className="text-sm">Langues</span>
                </Button>

                <Button
                  variant="outline"
                  className="h-20 flex flex-col space-y-2"
                  onClick={() => router.push('/admin/invitations')}
                >
                  <Users className="w-6 h-6" />
                  <span className="text-sm">Invitations</span>
                </Button>
              </div>
            </div>

            {/* Ligne 3 - Analytics, Audit et Configuration */}
            <div>
              <h4 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">Analytics et configuration</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                <Button
                  variant="outline"
                  className="h-20 flex flex-col space-y-2"
                  onClick={() => router.push('/admin/analytics')}
                >
                  <TrendingUp className="w-6 h-6" />
                  <span className="text-sm">Analytics</span>
                </Button>

                <Button
                  variant="outline"
                  className="h-20 flex flex-col space-y-2"
                  onClick={() => router.push('/admin/audit-logs')}
                >
                  <Shield className="w-6 h-6" />
                  <span className="text-sm">Audit Logs</span>
                </Button>

                <Button
                  variant="outline"
                  className="h-20 flex flex-col space-y-2"
                  onClick={() => router.push('/admin/settings')}
                >
                  <Server className="w-6 h-6" />
                  <span className="text-sm">Settings</span>
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
              <span>État du système</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center justify-between">
                <span className="text-sm">Serveur</span>
                <Badge variant="outline" className="text-green-600 border-green-200">
                  En ligne
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Base de données</span>
                <Badge variant="outline" className="text-green-600 border-green-200">
                  Connectée
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">WebSocket</span>
                <Badge variant="outline" className="text-green-600 border-green-200">
                  Actif
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
