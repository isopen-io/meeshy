'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ArrowLeft,
  Shield,
  Activity,
  AlertCircle,
  CheckCircle,
  XCircle,
  User,
  Settings,
  Database,
  Key,
  FileText,
  Search,
  Calendar,
  Filter,
  Download,
  Clock
} from 'lucide-react';
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
    oldValue: any;
    newValue: any;
  }[];
  metadata?: Record<string, any>;
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
      title: 'Logs totaux',
      value: 15847,
      description: '30 derniers jours',
      icon: FileText,
      iconColor: 'text-blue-600 dark:text-blue-400',
      iconBgColor: 'bg-blue-100 dark:bg-blue-900/30',
      trend: { value: 12, isPositive: true }
    },
    {
      title: 'Connexions',
      value: 3456,
      description: 'Login/Logout',
      icon: User,
      iconColor: 'text-green-600 dark:text-green-400',
      iconBgColor: 'bg-green-100 dark:bg-green-900/30',
      trend: { value: 8, isPositive: true }
    },
    {
      title: 'Alertes sécurité',
      value: 23,
      description: 'Nécessitent attention',
      icon: AlertCircle,
      iconColor: 'text-red-600 dark:text-red-400',
      iconBgColor: 'bg-red-100 dark:bg-red-900/30',
      badge: { text: 'Critique', variant: 'destructive' }
    },
    {
      title: 'Modifications config',
      value: 156,
      description: 'Changements système',
      icon: Settings,
      iconColor: 'text-orange-600 dark:text-orange-400',
      iconBgColor: 'bg-orange-100 dark:bg-orange-900/30',
      trend: { value: 3, isPositive: false }
    },
    {
      title: 'Actions admin',
      value: 892,
      description: 'Actions privilégiées',
      icon: Shield,
      iconColor: 'text-purple-600 dark:text-purple-400',
      iconBgColor: 'bg-purple-100 dark:bg-purple-900/30',
      trend: { value: 15, isPositive: true }
    },
    {
      title: 'Exports de données',
      value: 34,
      description: 'Dernières 24h',
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

    if (diffMins < 1) return 'À l\'instant';
    if (diffMins < 60) return `Il y a ${diffMins} min`;
    if (diffHours < 24) return `Il y a ${diffHours}h`;
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
                Retour
              </Button>
              <div>
                <h1 className="text-2xl font-bold">Journaux d'audit</h1>
                <p className="text-indigo-100 mt-1">Traçabilité complète des actions système</p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger className="w-[150px] bg-white/10 border-white/20 text-white">
                  <SelectValue placeholder="Période" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24h">24 heures</SelectItem>
                  <SelectItem value="7d">7 jours</SelectItem>
                  <SelectItem value="30d">30 jours</SelectItem>
                  <SelectItem value="90d">90 jours</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="ghost" className="text-white hover:bg-white/20">
                <Download className="h-4 w-4 mr-2" />
                Exporter
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
              <span>Filtres</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Rechercher..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>

              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Type d'action" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les actions</SelectItem>
                  <SelectItem value="user_login">Connexion</SelectItem>
                  <SelectItem value="user_logout">Déconnexion</SelectItem>
                  <SelectItem value="user_created">Utilisateur créé</SelectItem>
                  <SelectItem value="user_banned">Utilisateur banni</SelectItem>
                  <SelectItem value="settings_changed">Config modifiée</SelectItem>
                  <SelectItem value="security_alert">Alerte sécurité</SelectItem>
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Statut" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les statuts</SelectItem>
                  <SelectItem value="success">Succès</SelectItem>
                  <SelectItem value="failure">Échec</SelectItem>
                  <SelectItem value="warning">Avertissement</SelectItem>
                </SelectContent>
              </Select>

              <Select value={severityFilter} onValueChange={setSeverityFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Sévérité" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes sévérités</SelectItem>
                  <SelectItem value="critical">Critique</SelectItem>
                  <SelectItem value="high">Haute</SelectItem>
                  <SelectItem value="medium">Moyenne</SelectItem>
                  <SelectItem value="low">Basse</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Liste des logs */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Journaux d'événements ({filteredLogs.length})</span>
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
                          <span>IP: {log.ipAddress}</span>
                        </div>

                        {log.changes && log.changes.length > 0 && (
                          <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-900/10 rounded border border-blue-200 dark:border-blue-900/30">
                            <strong className="text-xs text-blue-900 dark:text-blue-100">Modifications:</strong>
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
                  Page {currentPage} sur {totalPages}
                </div>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    Précédent
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Suivant
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
