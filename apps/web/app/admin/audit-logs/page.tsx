'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useI18n } from '@/hooks/use-i18n';
import { ArrowLeft, Shield, Activity, AlertCircle, CheckCircle, XCircle, User, Settings, Key, FileText, Search, Filter, Download, Clock } from 'lucide-react';
import { useI18n } from '@/hooks/use-i18n';

import { StatsGrid, type StatItem } from '@/components/admin/Charts';

// Types pour les logs d'audit
interface AuditLog {
  id: string;
  timestamp: string;
  userId: string;
  user: {
    id: string;
    username: string;
    displayName?: string;
    role: string;
  };
  action: AuditAction;
  resource: string;
  resourceId?: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  status: 'success' | 'failure' | 'warning';
  ipAddress: string;
  userAgent: string;
  changes?: {
    field: string;
    oldValue: unknown;
    newValue: unknown;
  }[];
  metadata?: Record<string, unknown>;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

type AuditAction =
  | 'user_login'
  | 'user_logout'
  | 'user_created'
  | 'user_updated'
  | 'user_deleted'
  | 'user_role_changed'
  | 'user_banned'
  | 'user_unbanned'
  | 'message_deleted'
  | 'message_edited'
  | 'community_created'
  | 'community_deleted'
  | 'community_updated'
  | 'settings_changed'
  | 'permission_granted'
  | 'permission_revoked'
  | 'data_exported'
  | 'backup_created'
  | 'system_config_changed'
  | 'security_alert';

export default function AuditLogsPage() {
  const router = useRouter();
  const { t } = useI18n('admin');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState('7d');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

  // Mock data pour les statistiques
  const stats: StatItem[] = [
    {
      title: t('auditLogs.statTotalLogs'),
      value: 15847,
      description: t('auditLogs.statTotalLogsDesc'),
      icon: FileText,
      iconColor: 'text-blue-600 dark:text-blue-400',
      iconBgColor: 'bg-blue-100 dark:bg-blue-900/30',
      trend: { value: 12, isPositive: true }
    },
    {
      title: t('auditLogs.statConnections'),
      value: 3456,
      description: t('auditLogs.statConnectionsDesc'),
      icon: User,
      iconColor: 'text-green-600 dark:text-green-400',
      iconBgColor: 'bg-green-100 dark:bg-green-900/30',
      trend: { value: 8, isPositive: true }
    },
    {
      title: t('auditLogs.statSecurityAlerts'),
      value: 23,
      description: t('auditLogs.statSecurityAlertsDesc'),
      icon: AlertCircle,
      iconColor: 'text-red-600 dark:text-red-400',
      iconBgColor: 'bg-red-100 dark:bg-red-900/30',
      badge: { text: t('auditLogs.statSecurityBadge'), variant: 'destructive' }
    },
    {
      title: t('auditLogs.statConfigChanges'),
      value: 156,
      description: t('auditLogs.statConfigChangesDesc'),
      icon: Settings,
      iconColor: 'text-orange-600 dark:text-orange-400',
      iconBgColor: 'bg-orange-100 dark:bg-orange-900/30',
      trend: { value: 3, isPositive: false }
    },
    {
      title: t('auditLogs.statAdminActions'),
      value: 892,
      description: t('auditLogs.statAdminActionsDesc'),
      icon: Shield,
      iconColor: 'text-purple-600 dark:text-purple-400',
      iconBgColor: 'bg-purple-100 dark:bg-purple-900/30',
      trend: { value: 15, isPositive: true }
    },
    {
      title: t('auditLogs.statDataExports'),
      value: 34,
      description: t('auditLogs.statDataExportsDesc'),
      icon: Download,
      iconColor: 'text-cyan-600 dark:text-cyan-400',
      iconBgColor: 'bg-cyan-100 dark:bg-cyan-900/30',
      trend: { value: 5, isPositive: true }
    }
  ];

  // Mock data pour les logs d'audit
  const mockLogs: AuditLog[] = [
    {
      id: '1',
      timestamp: new Date(Date.now() - 300000).toISOString(),
      userId: 'user1',
      user: { id: 'user1', username: 'admin', displayName: 'Admin User', role: 'BIGBOSS' },
      action: 'settings_changed',
      resource: 'system_config',
      resourceId: 'config_1',
      method: 'PATCH',
      status: 'success',
      ipAddress: '192.168.1.100',
      userAgent: 'Mozilla/5.0',
      changes: [
        { field: 'MAX_MESSAGE_LENGTH', oldValue: '2000', newValue: '3000' }
      ],
      severity: 'medium'
    },
    {
      id: '2',
      timestamp: new Date(Date.now() - 600000).toISOString(),
      userId: 'user2',
      user: { id: 'user2', username: 'moderator1', displayName: 'Mod One', role: 'MODO' },
      action: 'user_banned',
      resource: 'user',
      resourceId: 'user_123',
      method: 'PATCH',
      status: 'success',
      ipAddress: '192.168.1.101',
      userAgent: 'Mozilla/5.0',
      metadata: { reason: 'Spam', duration: '7 days' },
      severity: 'high'
    },
    {
      id: '3',
      timestamp: new Date(Date.now() - 900000).toISOString(),
      userId: 'user3',
      user: { id: 'user3', username: 'john_doe', role: 'USER' },
      action: 'user_login',
      resource: 'auth',
      method: 'POST',
      status: 'failure',
      ipAddress: '10.0.0.50',
      userAgent: 'Mozilla/5.0',
      metadata: { reason: 'Invalid credentials', attempts: 3 },
      severity: 'low'
    },
    {
      id: '4',
      timestamp: new Date(Date.now() - 1200000).toISOString(),
      userId: 'user1',
      user: { id: 'user1', username: 'admin', displayName: 'Admin User', role: 'BIGBOSS' },
      action: 'data_exported',
      resource: 'users',
      method: 'GET',
      status: 'success',
      ipAddress: '192.168.1.100',
      userAgent: 'Mozilla/5.0',
      metadata: { format: 'CSV', recordCount: 1500 },
      severity: 'medium'
    },
    {
      id: '5',
      timestamp: new Date(Date.now() - 1500000).toISOString(),
      userId: 'user2',
      user: { id: 'user2', username: 'moderator1', displayName: 'Mod One', role: 'MODO' },
      action: 'message_deleted',
      resource: 'message',
      resourceId: 'msg_456',
      method: 'DELETE',
      status: 'success',
      ipAddress: '192.168.1.101',
      userAgent: 'Mozilla/5.0',
      metadata: { reason: 'Inappropriate content' },
      severity: 'low'
    },
    {
      id: '6',
      timestamp: new Date(Date.now() - 1800000).toISOString(),
      userId: 'system',
      user: { id: 'system', username: 'system', role: 'SYSTEM' },
      action: 'security_alert',
      resource: 'security',
      method: 'POST',
      status: 'warning',
      ipAddress: '127.0.0.1',
      userAgent: 'System',
      metadata: { alert: 'Multiple failed login attempts from IP 10.0.0.50' },
      severity: 'critical'
    }
  ];

  // Filtrage des logs
  const filteredLogs = mockLogs.filter(log => {
    const matchesSearch = searchQuery === '' ||
      log.user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.resource.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesAction = actionFilter === 'all' || log.action === actionFilter;
    const matchesStatus = statusFilter === 'all' || log.status === statusFilter;
    const matchesSeverity = severityFilter === 'all' || log.severity === severityFilter;

    return matchesSearch && matchesAction && matchesStatus && matchesSeverity;
  });

  // Pagination
  const totalPages = Math.ceil(filteredLogs.length / pageSize);
  const paginatedLogs = filteredLogs.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  // Helpers
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'failure': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      case 'warning': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      case 'high': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400';
      case 'medium': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'low': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
    }
  };

  const getActionIcon = (action: string) => {
    if (action.includes('login') || action.includes('logout')) return User;
    if (action.includes('deleted')) return XCircle;
    if (action.includes('created')) return CheckCircle;
    if (action.includes('settings') || action.includes('config')) return Settings;
    if (action.includes('security')) return AlertCircle;
    if (action.includes('export')) return Download;
    if (action.includes('permission')) return Key;
    return Activity;
  };

  const formatAction = (action: string) => {
    return action.split('_').map(word =>
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 1) return t('auditLogs.timestampJustNow');
    if (diffMins < 60) return t('auditLogs.timestampMinutes', { min: diffMins });
    if (diffHours < 24) return t('auditLogs.timestampHours', { hours: diffHours });
    return date.toLocaleString('fr-FR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <AdminLayout currentPage="/admin/audit-logs">
      <div className="space-y-6">
        {/* Header avec gradient */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-lg p-6 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                onClick={() => router.push('/admin')}
                className="text-white hover:bg-white/20"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                {t('auditLogs.back')}
              </Button>
              <div>
                <h1 className="text-2xl font-bold">{t('auditLogs.pageTitle')}</h1>
                <p className="text-indigo-100 mt-1">{t('auditLogs.pageSubtitle')}</p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger className="w-[150px] bg-white/10 border-white/20 text-white">
                  <SelectValue placeholder="Période" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24h">{t('auditLogs.period24h')}</SelectItem>
                  <SelectItem value="7d">{t('auditLogs.period7d')}</SelectItem>
                  <SelectItem value="30d">{t('auditLogs.period30d')}</SelectItem>
                  <SelectItem value="90d">{t('auditLogs.period90d')}</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="ghost" className="text-white hover:bg-white/20">
                <Download className="h-4 w-4 mr-2" />
                {t('auditLogs.export')}
              </Button>
            </div>
          </div>
        </div>

        {/* Statistiques */}
        <StatsGrid stats={stats} />

        {/* Filtres */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Filter className="h-5 w-5" />
              <span>{t('auditLogs.filtersTitle')}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder={t('auditLogs.searchPlaceholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>

              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger>
                  <SelectValue placeholder={t('auditLogs.actionTypeLabel')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('auditLogs.actionAll')}</SelectItem>
                  <SelectItem value="user_login">{t('auditLogs.actionLogin')}</SelectItem>
                  <SelectItem value="user_logout">{t('auditLogs.actionLogout')}</SelectItem>
                  <SelectItem value="user_created">{t('auditLogs.actionUserCreated')}</SelectItem>
                  <SelectItem value="user_banned">{t('auditLogs.actionUserBanned')}</SelectItem>
                  <SelectItem value="settings_changed">{t('auditLogs.actionSettingsChanged')}</SelectItem>
                  <SelectItem value="security_alert">{t('auditLogs.actionSecurityAlert')}</SelectItem>
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder={t('auditLogs.allStatuses')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('auditLogs.statusAll')}</SelectItem>
                  <SelectItem value="success">{t('auditLogs.statusSuccess')}</SelectItem>
                  <SelectItem value="failure">{t('auditLogs.statusFailure')}</SelectItem>
                  <SelectItem value="warning">{t('auditLogs.statusWarning')}</SelectItem>
                </SelectContent>
              </Select>

              <Select value={severityFilter} onValueChange={setSeverityFilter}>
                <SelectTrigger>
                  <SelectValue placeholder={t('auditLogs.allSeverities')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('auditLogs.severityAll')}</SelectItem>
                  <SelectItem value="critical">{t('auditLogs.severityCritical')}</SelectItem>
                  <SelectItem value="high">{t('auditLogs.severityHigh')}</SelectItem>
                  <SelectItem value="medium">{t('auditLogs.severityMedium')}</SelectItem>
                  <SelectItem value="low">{t('auditLogs.severityLow')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Liste des logs */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{t('auditLogs.eventLogsTitle', { count: filteredLogs.length })}</span>
              <Badge variant="outline">{dateRange}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {paginatedLogs.map((log) => {
                const ActionIcon = getActionIcon(log.action);

                return (
                  <div
                    key={log.id}
                    className="flex items-start space-x-4 p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors"
                  >
                    <div className={`p-2 rounded-lg ${log.severity === 'critical' ? 'bg-red-100 dark:bg-red-900/30' : 'bg-gray-100 dark:bg-gray-800'}`}>
                      <ActionIcon className={`h-5 w-5 ${log.severity === 'critical' ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-400'}`} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-2">
                          <span className="font-semibold text-gray-900 dark:text-gray-100">
                            {formatAction(log.action)}
                          </span>
                          <Badge className={getStatusColor(log.status)}>
                            {log.status}
                          </Badge>
                          <Badge className={getSeverityColor(log.severity)}>
                            {log.severity}
                          </Badge>
                        </div>
                        <span className="text-sm text-gray-500 flex items-center">
                          <Clock className="h-3 w-3 mr-1" />
                          {formatTimestamp(log.timestamp)}
                        </span>
                      </div>

                      <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                        <div className="flex items-center space-x-4">
                          <span className="flex items-center">
                            <User className="h-3 w-3 mr-1" />
                            <strong>{log.user.displayName || log.user.username}</strong>
                            <Badge variant="outline" className="ml-2 text-xs">
                              {log.user.role}
                            </Badge>
                          </span>
                          <span>→ {log.resource}{log.resourceId ? ` (${log.resourceId})` : ''}</span>
                          <Badge variant="outline" className="text-xs">
                            {log.method}
                          </Badge>
                        </div>

                        <div className="flex items-center text-xs text-gray-500">
                          <span>{t('auditLogs.ipLabel', { ip: log.ipAddress })}</span>
                        </div>

                        {log.changes && log.changes.length > 0 && (
                          <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-900/10 rounded border border-blue-200 dark:border-blue-900/30">
                            <strong className="text-xs text-blue-900 dark:text-blue-100">{t('auditLogs.changesLabel')}</strong>
                            {log.changes.map((change, idx) => (
                              <div key={idx} className="text-xs text-blue-700 dark:text-blue-300 ml-2">
                                {change.field}: <span className="line-through">{change.oldValue}</span> → <strong>{change.newValue}</strong>
                              </div>
                            ))}
                          </div>
                        )}

                        {log.metadata && Object.keys(log.metadata).length > 0 && (
                          <div className="mt-2 text-xs text-gray-500">
                            {Object.entries(log.metadata).map(([key, value]) => (
                              <div key={key} className="ml-2">
                                <strong>{key}:</strong> {String(value)}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  {t('auditLogs.paginationInfo', { page: currentPage, total: totalPages })}
                </div>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    {t('auditLogs.prevPage')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    {t('auditLogs.nextPage')}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
