'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Shield,
  ArrowLeft,
  Flag,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  User,
  Search,
  ChevronLeft,
  ChevronRight,
  Eye,
  Ban,
  UserX,
} from 'lucide-react';

import { toast } from 'sonner';
import { useI18n } from '@/hooks/use-i18n';
import { StatsGrid, TimeSeriesChart, DonutChart, type StatItem } from '@/components/admin/Charts';
import { StatCardSkeleton, TableSkeleton } from '@/components/admin/TableSkeleton';

interface ModerationAction {
  id: string;
  type: 'warning' | 'mute' | 'suspend' | 'ban' | 'report_resolved' | 'report_dismissed';
  targetUserId: string;
  targetUser: {
    id: string;
    username: string;
    displayName?: string;
  };
  moderatorId: string;
  moderator: {
    id: string;
    username: string;
    displayName?: string;
  };
  reason: string;
  description?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  expiresAt?: string;
  createdAt: string;
  relatedReportId?: string;
}

interface ModerationStats {
  totalReports: number;
  pendingReports: number;
  resolvedToday: number;
  activeWarnings: number;
  suspendedUsers: number;
  bannedUsers: number;
  complianceRate: number;
}

export default function AdminModerationPage() {
  const router = useRouter();
  const { t } = useI18n('admin');
  const [actions, setActions] = useState<ModerationAction[]>([]);
  const [stats, setStats] = useState<ModerationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    loadModerationData();
  }, []);

  const loadModerationData = async () => {
    try {
      setLoading(true);

      // Simuler le chargement depuis le backend
      // En production, remplacer par: await adminService.getModerationStats()
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Données mockées
      setStats({
        totalReports: 45,
        pendingReports: 12,
        resolvedToday: 7,
        activeWarnings: 5,
        suspendedUsers: 3,
        bannedUsers: 1,
        complianceRate: 97.8
      });

      const mockActions: ModerationAction[] = [
        {
          id: '1',
          type: 'report_resolved',
          targetUserId: 'user1',
          targetUser: { id: 'user1', username: 'john_doe', displayName: 'John Doe' },
          moderatorId: 'mod1',
          moderator: { id: 'mod1', username: 'moderator1', displayName: 'Mod One' },
          reason: 'Spam',
          description: 'Message publicitaire répétitif supprimé',
          severity: 'medium',
          createdAt: new Date(Date.now() - 3600000).toISOString(),
          relatedReportId: 'report1'
        },
        {
          id: '2',
          type: 'suspend',
          targetUserId: 'user2',
          targetUser: { id: 'user2', username: 'bad_user', displayName: 'Bad User' },
          moderatorId: 'mod1',
          moderator: { id: 'mod1', username: 'moderator1', displayName: 'Mod One' },
          reason: 'Contenu inapproprié répété',
          description: 'Suspension de 7 jours pour violation des conditions',
          severity: 'high',
          expiresAt: new Date(Date.now() + 7 * 24 * 3600000).toISOString(),
          createdAt: new Date(Date.now() - 7200000).toISOString()
        },
        {
          id: '3',
          type: 'warning',
          targetUserId: 'user3',
          targetUser: { id: 'user3', username: 'newbie_user', displayName: 'Newbie' },
          moderatorId: 'mod2',
          moderator: { id: 'mod2', username: 'moderator2', displayName: 'Mod Two' },
          reason: 'Langage inapproprié',
          description: 'Premier avertissement pour langage offensant',
          severity: 'low',
          createdAt: new Date(Date.now() - 10800000).toISOString()
        },
        {
          id: '4',
          type: 'ban',
          targetUserId: 'user4',
          targetUser: { id: 'user4', username: 'troll_account', displayName: 'Troll' },
          moderatorId: 'mod1',
          moderator: { id: 'mod1', username: 'moderator1', displayName: 'Mod One' },
          reason: 'Harcèlement et menaces',
          description: 'Bannissement permanent pour harcèlement répété',
          severity: 'critical',
          createdAt: new Date(Date.now() - 14400000).toISOString()
        },
        {
          id: '5',
          type: 'report_dismissed',
          targetUserId: 'user5',
          targetUser: { id: 'user5', username: 'regular_user', displayName: 'Regular User' },
          moderatorId: 'mod2',
          moderator: { id: 'mod2', username: 'moderator2', displayName: 'Mod Two' },
          reason: 'Signalement non fondé',
          description: 'Après examen, le contenu est conforme aux règles',
          severity: 'low',
          createdAt: new Date(Date.now() - 18000000).toISOString(),
          relatedReportId: 'report2'
        }
      ];

      setActions(mockActions);
    } catch (error) {
      console.error('Erreur lors du chargement des données de modération:', error);
      toast.error(t('moderation.loadError'));
    } finally {
      setLoading(false);
    }
  };

  // Filtrage des actions
  const filteredActions = actions.filter(action => {
    const matchesSearch = !searchQuery ||
      action.targetUser.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      action.targetUser.displayName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      action.reason.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesType = typeFilter === 'all' || action.type === typeFilter;
    const matchesSeverity = severityFilter === 'all' || action.severity === severityFilter;

    return matchesSearch && matchesType && matchesSeverity;
  });

  // Pagination
  const totalPages = Math.ceil(filteredActions.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedActions = filteredActions.slice(startIndex, startIndex + itemsPerPage);

  // Stats pour StatsGrid
  const statsItems: StatItem[] = [
    {
      title: t('moderation.statPending'),
      value: stats?.pendingReports || 0,
      description: t('moderation.statPendingDesc', { total: stats?.totalReports || 0 }),
      icon: Flag,
      iconColor: 'text-red-600 dark:text-red-400',
      iconBgColor: 'bg-red-100 dark:bg-red-900/30',
      badge: { text: t('moderation.badgeUrgent'), variant: 'destructive' }
    },
    {
      title: t('moderation.statToday'),
      value: stats?.resolvedToday || 0,
      description: t('moderation.statTodayDesc'),
      icon: CheckCircle,
      iconColor: 'text-green-600 dark:text-green-400',
      iconBgColor: 'bg-green-100 dark:bg-green-900/30',
      trend: { value: 15, isPositive: true }
    },
    {
      title: t('moderation.statSuspended'),
      value: stats?.suspendedUsers || 0,
      description: t('moderation.statSuspendedDesc', { count: stats?.activeWarnings || 0 }),
      icon: UserX,
      iconColor: 'text-orange-600 dark:text-orange-400',
      iconBgColor: 'bg-orange-100 dark:bg-orange-900/30'
    },
    {
      title: t('moderation.statCompliance'),
      value: `${stats?.complianceRate || 0}%`,
      description: t('moderation.statComplianceDesc'),
      icon: Shield,
      iconColor: 'text-blue-600 dark:text-blue-400',
      iconBgColor: 'bg-blue-100 dark:bg-blue-900/30',
      trend: { value: 2, isPositive: true }
    }
  ];

  // Données pour TimeSeriesChart (mockup)
  const timeSeriesData = [
    { name: 'Lun', value: 12 },
    { name: 'Mar', value: 8 },
    { name: 'Mer', value: 15 },
    { name: 'Jeu', value: 10 },
    { name: 'Ven', value: 7 },
    { name: 'Sam', value: 5 },
    { name: 'Dim', value: 9 }
  ];

  // Données pour DonutChart
  const donutData = [
    { name: t('moderation.donutResolved'), value: 25, color: '#10b981' },
    { name: t('moderation.donutPending'), value: stats?.pendingReports || 12, color: '#f59e0b' },
    { name: t('moderation.donutDismissed'), value: 8, color: '#6b7280' }
  ];

  const getActionIcon = (type: string) => {
    switch (type) {
      case 'warning': return <AlertTriangle className="h-4 w-4" />;
      case 'suspend': return <Clock className="h-4 w-4" />;
      case 'ban': return <Ban className="h-4 w-4" />;
      case 'report_resolved': return <CheckCircle className="h-4 w-4" />;
      case 'report_dismissed': return <XCircle className="h-4 w-4" />;
      default: return <Shield className="h-4 w-4" />;
    }
  };

  const getActionLabel = (type: string) => {
    const labels: Record<string, string> = {
      warning: t('moderation.actionWarning'),
      mute: t('moderation.actionMute'),
      suspend: t('moderation.actionSuspend'),
      ban: t('moderation.actionBan'),
      report_resolved: t('moderation.actionReportResolved'),
      report_dismissed: t('moderation.actionReportDismissed')
    };
    return labels[type] || type;
  };

  const getActionColor = (type: string) => {
    switch (type) {
      case 'warning': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'suspend': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400';
      case 'ban': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      case 'report_resolved': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'report_dismissed': return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
      default: return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'low': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
      case 'medium': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'high': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400';
      case 'critical': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
    }
  };

  if (loading) {
    return (
      <AdminLayout currentPage="/admin/moderation">
        <div className="space-y-6">
          {/* Header Skeleton */}
          <div className="bg-gradient-to-r from-slate-600 to-gray-600 rounded-lg p-6 text-white shadow-lg animate-pulse">
            <div className="h-8 bg-white/20 rounded w-64 mb-2"></div>
            <div className="h-4 bg-white/20 rounded w-96"></div>
          </div>

          {/* Stats Skeleton */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {[1, 2, 3, 4].map(i => <StatCardSkeleton key={i} />)}
          </div>

          <TableSkeleton />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout currentPage="/admin/moderation">
      <div className="space-y-6">
        {/* Header avec gradient slate→gray */}
        <div className="bg-gradient-to-r from-slate-600 to-gray-600 rounded-lg p-6 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                onClick={() => router.push('/admin')}
                className="text-white hover:bg-white/20"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                {t('moderation.back')}
              </Button>
              <div>
                <h1 className="text-2xl font-bold">{t('moderation.pageTitle')}</h1>
                <p className="text-slate-100 mt-1">{t('moderation.pageSubtitle')}</p>
              </div>
            </div>
            <Button
              variant="secondary"
              onClick={() => router.push('/admin/reports')}
              className="bg-white/20 hover:bg-white/30 text-white border-white/30"
            >
              <Flag className="h-4 w-4 mr-2" />
              {t('moderation.viewReports')}
            </Button>
          </div>
        </div>

        {/* Statistiques principales */}
        <StatsGrid stats={statsItems} />

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <TimeSeriesChart
            data={timeSeriesData}
            title={t('moderation.chartTitle')}
            description={t('moderation.chartDesc')}
            color="#64748b"
            dataKey="value"
          />

          <DonutChart
            data={donutData}
            title={t('moderation.donutTitle')}
            description={t('moderation.donutDesc')}
          />
        </div>

        {/* Historique des actions */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-4 sm:space-y-0">
              <CardTitle className="flex items-center space-x-2">
                <Shield className="h-5 w-5" />
                <span>{t('moderation.historyTitle')}</span>
                <Badge variant="secondary">{filteredActions.length} actions</Badge>
              </CardTitle>

              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-64">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    type="text"
                    placeholder={t('moderation.searchPlaceholder')}
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="pl-10"
                  />
                </div>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('moderation.typeAll')}</SelectItem>
                    <SelectItem value="warning">{t('moderation.typeWarning')}</SelectItem>
                    <SelectItem value="suspend">{t('moderation.typeSuspend')}</SelectItem>
                    <SelectItem value="ban">{t('moderation.typeBan')}</SelectItem>
                    <SelectItem value="report_resolved">{t('moderation.typeResolved')}</SelectItem>
                    <SelectItem value="report_dismissed">{t('moderation.typeDismissed')}</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={severityFilter} onValueChange={setSeverityFilter}>
                  <SelectTrigger className="w-[130px]">
                    <SelectValue placeholder="Sévérité" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('moderation.severityAll')}</SelectItem>
                    <SelectItem value="low">{t('moderation.severityLow')}</SelectItem>
                    <SelectItem value="medium">{t('moderation.severityMedium')}</SelectItem>
                    <SelectItem value="high">{t('moderation.severityHigh')}</SelectItem>
                    <SelectItem value="critical">{t('moderation.severityCritical')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Liste des actions */}
            <div className="space-y-3">
              {paginatedActions.length === 0 ? (
                <div className="text-center py-12">
                  <Shield className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                    {t('moderation.emptyTitle')}
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400">
                    {searchQuery ? t('moderation.emptyWithSearch') : t('moderation.emptyDefault')}
                  </p>
                </div>
              ) : (
                paginatedActions.map((action) => (
                  <div
                    key={action.id}
                    className="flex items-start space-x-4 p-4 border dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    {/* Icône d'action */}
                    <div className={`flex-shrink-0 w-10 h-10 rounded-full ${getActionColor(action.type)} flex items-center justify-center`}>
                      {getActionIcon(action.type)}
                    </div>

                    {/* Contenu */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center flex-wrap gap-2">
                          <Badge className={getActionColor(action.type)}>
                            {getActionLabel(action.type)}
                          </Badge>
                          <Badge variant="outline" className={getSeverityColor(action.severity)}>
                            {action.severity.charAt(0).toUpperCase() + action.severity.slice(1)}
                          </Badge>
                        </div>
                        <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap ml-2">
                          {new Date(action.createdAt).toLocaleString('fr-FR', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center space-x-2 text-sm">
                          <User className="h-4 w-4 text-gray-400" />
                          <span className="font-semibold text-gray-900 dark:text-gray-100">
                            {action.targetUser.displayName || action.targetUser.username}
                          </span>
                          <span className="text-gray-500 dark:text-gray-400">
                            @{action.targetUser.username}
                          </span>
                        </div>

                        <div className="text-sm">
                          <span className="font-medium text-gray-700 dark:text-gray-300">{t('moderation.labelReason')}</span>
                          <span className="text-gray-900 dark:text-gray-100">{action.reason}</span>
                        </div>

                        {action.description && (
                          <div className="text-sm text-gray-600 dark:text-gray-400 pl-6">
                            {action.description}
                          </div>
                        )}

                        {action.expiresAt && (
                          <div className="text-xs text-orange-600 dark:text-orange-400 pl-6 flex items-center space-x-1">
                            <Clock className="h-3 w-3" />
                            <span>
                              {t('moderation.labelExpires', { date: new Date(action.expiresAt).toLocaleDateString() })}
                            </span>
                          </div>
                        )}

                        <div className="text-xs text-gray-500 dark:text-gray-400 pl-6">
                          {t('moderation.labelModerator')}{action.moderator.displayName || action.moderator.username}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex-shrink-0 flex space-x-2">
                      {action.relatedReportId && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => router.push(`/admin/reports#${action.relatedReportId}`)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-6 pt-4 border-t dark:border-gray-700">
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  {t('moderation.paginationInfo', { page: currentPage, total: totalPages, count: filteredActions.length })}
                </div>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Guide de modération */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Shield className="h-5 w-5" />
              <span>{t('moderation.guideTitle')}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center space-x-2">
                  <AlertTriangle className="h-4 w-4 text-slate-600" />
                  <span>{t('moderation.guideSeverityTitle')}</span>
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
                  <li className="flex items-start space-x-2">
                    <span className="text-blue-600 dark:text-blue-400">•</span>
                    <span>{t('moderation.guideLow')}</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="text-yellow-600 dark:text-yellow-400">•</span>
                    <span>{t('moderation.guideMedium')}</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="text-orange-600 dark:text-orange-400">•</span>
                    <span>{t('moderation.guideHigh')}</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="text-red-600 dark:text-red-400">•</span>
                    <span>{t('moderation.guideCritical')}</span>
                  </li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center space-x-2">
                  <Flag className="h-4 w-4 text-slate-600" />
                  <span>{t('moderation.guideActionsTitle')}</span>
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
                  <li className="flex items-start space-x-2">
                    <span className="text-slate-600 dark:text-slate-400">•</span>
                    <span>{t('moderation.guideWarning')}</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="text-slate-600 dark:text-slate-400">•</span>
                    <span>{t('moderation.guideSuspend')}</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="text-slate-600 dark:text-slate-400">•</span>
                    <span>{t('moderation.guideBan')}</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="text-slate-600 dark:text-slate-400">•</span>
                    <span>{t('moderation.guideResolve')}</span>
                  </li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
