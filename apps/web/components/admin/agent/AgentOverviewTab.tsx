'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  MessageSquare,
  Zap,
  Users,
  Shapes,
  RotateCcw,
  Trash2,
  UserCheck,
  BarChart3,
  Clock,
  TrendingUp,
  Type,
} from 'lucide-react';
import { agentAdminService, type AgentStatsData } from '@/services/agent-admin.service';
import { UserDisplay } from './UserDisplay';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from 'recharts';
import { toast } from 'sonner';

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Jamais';
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'À l\'instant';
  if (minutes < 60) return `il y a ${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  return `il y a ${days}j`;
}

const TYPE_LABELS: Record<string, string> = {
  direct: 'Direct',
  group: 'Groupe',
  public: 'Public',
  global: 'Globale',
  broadcast: 'Communication',
  channel: 'Canal',
};

export function AgentOverviewTab() {
  const [stats, setStats] = useState<AgentStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [conversationIdToReset, setConversationIdToReset] = useState('');
  const [userIdToReset, setUserIdToReset] = useState('');
  const [resettingConversation, setResettingConversation] = useState(false);
  const [resettingUser, setResettingUser] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      const response = await agentAdminService.getStats();
      if (response.success && response.data) {
        setStats(response.data);
        setError(null);
      } else {
        setError('Impossible de charger les statistiques');
      }
    } catch {
      setError('Erreur de connexion au service agent');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleReset = useCallback(async () => {
    if (!confirm('ATTENTION : Cette action va supprimer TOUTES les configurations IA, profils, analytics et cache Redis. Cette action est irréversible. Continuer ?')) {
      return;
    }
    try {
      setResetting(true);
      const response = await agentAdminService.resetAll();
      if (response.success && response.data) {
        const counts = response.data.deleted;
        toast.success(`Reset complet : ${counts.configs ?? 0} configs, ${counts.roles ?? 0} rôles, ${counts.analytics ?? 0} analytics, ${counts.redisKeys ?? 0} clés Redis supprimés`);
        fetchStats();
      } else {
        toast.error('Erreur lors du reset');
      }
    } catch {
      toast.error('Erreur lors du reset des configurations IA');
    } finally {
      setResetting(false);
    }
  }, [fetchStats]);

  const handleResetConversation = useCallback(async () => {
    const id = conversationIdToReset.trim();
    if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
      toast.error('ID de conversation invalide (24 caractères hex)');
      return;
    }
    if (!confirm(`Supprimer toutes les données agent pour la conversation ${id} ?`)) return;
    try {
      setResettingConversation(true);
      const response = await agentAdminService.resetConversation(id);
      if (response.success) {
        toast.success(`Conversation ${id.slice(0, 8)}... réinitialisée`);
        setConversationIdToReset('');
        fetchStats();
      }
    } catch {
      toast.error('Erreur lors du reset conversation');
    } finally {
      setResettingConversation(false);
    }
  }, [conversationIdToReset, fetchStats]);

  const handleResetUser = useCallback(async () => {
    const id = userIdToReset.trim();
    if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
      toast.error('ID utilisateur invalide (24 caractères hex)');
      return;
    }
    if (!confirm(`Supprimer tous les profils agent pour l'utilisateur ${id} (toutes conversations) ?`)) return;
    try {
      setResettingUser(true);
      const response = await agentAdminService.resetUser(id);
      if (response.success) {
        toast.success(`Utilisateur ${id.slice(0, 8)}... réinitialisé`);
        setUserIdToReset('');
        fetchStats();
      }
    } catch {
      toast.error('Erreur lors du reset utilisateur');
    } finally {
      setResettingUser(false);
    }
  }, [userIdToReset, fetchStats]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-4 w-20 mb-2" />
                <Skeleton className="h-8 w-12" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-red-500">{error}</p>
        </CardContent>
      </Card>
    );
  }

  const kpis = [
    {
      title: 'Conversations',
      value: stats?.totalConfigs ?? 0,
      icon: MessageSquare,
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-50 dark:bg-blue-950',
    },
    {
      title: 'Actifs',
      value: stats?.activeConfigs ?? 0,
      icon: Zap,
      color: 'text-green-600 dark:text-green-400',
      bg: 'bg-green-50 dark:bg-green-950',
      badge: stats && stats.activeConfigs > 0 ? 'On' : 'Off',
      badgeVariant: stats && stats.activeConfigs > 0 ? 'default' : 'secondary',
    },
    {
      title: 'Utilisateurs',
      value: stats?.totalControlledUsers ?? 0,
      icon: UserCheck,
      color: 'text-cyan-600 dark:text-cyan-400',
      bg: 'bg-cyan-50 dark:bg-cyan-950',
    },
    {
      title: 'Rôles',
      value: stats?.totalRoles ?? 0,
      icon: Users,
      color: 'text-purple-600 dark:text-purple-400',
      bg: 'bg-purple-50 dark:bg-purple-950',
    },
    {
      title: 'Messages',
      value: stats?.totalMessagesSent ?? 0,
      icon: BarChart3,
      color: 'text-indigo-600 dark:text-indigo-400',
      bg: 'bg-indigo-50 dark:bg-indigo-950',
    },
    {
      title: 'Mots',
      value: stats?.totalWordsSent ?? 0,
      icon: Type,
      color: 'text-pink-600 dark:text-pink-400',
      bg: 'bg-pink-50 dark:bg-pink-950',
    },
    {
      title: 'Confiance moy.',
      value: `${((stats?.avgConfidence ?? 0) * 100).toFixed(0)}%`,
      icon: TrendingUp,
      color: 'text-amber-600 dark:text-amber-400',
      bg: 'bg-amber-50 dark:bg-amber-950',
    },
    {
      title: 'Archétypes',
      value: stats?.totalArchetypes ?? 0,
      icon: Shapes,
      color: 'text-orange-600 dark:text-orange-400',
      bg: 'bg-orange-50 dark:bg-orange-950',
    },
  ];

  const pieData = [
    { name: 'Actifs', value: stats?.activeConfigs ?? 0, color: '#10b981' },
    { name: 'Inactifs', value: (stats?.totalConfigs ?? 0) - (stats?.activeConfigs ?? 0), color: '#94a3b8' },
  ];

  const recentActivity = stats?.recentActivity ?? [];

  return (
    <div className="space-y-6">
      {/* KPI Cards - 8 compact cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {kpis.map(kpi => {
          const Icon = kpi.icon;
          return (
            <Card key={kpi.title}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider truncate">
                    {kpi.title}
                  </span>
                  <div className={`p-1 rounded ${kpi.bg}`}>
                    <Icon className={`h-3 w-3 ${kpi.color}`} />
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-lg font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                    {kpi.value}
                  </span>
                  {kpi.badge && (
                    <Badge variant={kpi.badgeVariant as 'default' | 'secondary'} className="text-[9px] px-1 py-0">
                      {kpi.badge}
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pie Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Répartition</CardTitle>
          </CardHeader>
          <CardContent className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={70}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Recent Activity - TOP 10 most recent */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-indigo-500" />
              Activité récente
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentActivity.length === 0 ? (
              <p className="text-sm text-gray-400 italic py-4 text-center">Aucune activité récente</p>
            ) : (
              <div className="space-y-1.5 max-h-[240px] overflow-y-auto">
                {recentActivity.map((entry) => (
                  <div
                    key={entry.conversationId}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {entry.conversation?.title ?? entry.conversationId.slice(0, 10) + '...'}
                        </span>
                        {entry.conversation?.type && (
                          <Badge variant="outline" className="text-[10px] shrink-0">
                            {TYPE_LABELS[entry.conversation.type] ?? entry.conversation.type}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 tabular-nums">
                          {entry.messagesSent}
                        </span>
                        <span className="text-[10px] text-gray-400 ml-0.5">msgs</span>
                      </div>
                      <div className="hidden sm:flex items-center gap-1.5 w-20">
                        <Progress value={entry.avgConfidence * 100} className="h-1.5 flex-1" />
                        <span className="text-[10px] text-gray-400 tabular-nums w-7">
                          {(entry.avgConfidence * 100).toFixed(0)}%
                        </span>
                      </div>
                      <span className="text-[10px] text-gray-400 w-16 text-right tabular-nums">
                        {formatTimeAgo(entry.lastResponseAt)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Reset controls */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="border-amber-200 dark:border-amber-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-amber-600 dark:text-amber-400">
              Reset conversation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Input
                placeholder="ID conversation (24 hex)"
                value={conversationIdToReset}
                onChange={e => setConversationIdToReset(e.target.value)}
                className="font-mono text-xs flex-1"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetConversation}
                disabled={resettingConversation || !conversationIdToReset.trim()}
              >
                <Trash2 className={`h-3 w-3 ${resettingConversation ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-amber-200 dark:border-amber-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-amber-600 dark:text-amber-400">
              Reset utilisateur
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Input
                placeholder="ID utilisateur (24 hex)"
                value={userIdToReset}
                onChange={e => setUserIdToReset(e.target.value)}
                className="font-mono text-xs flex-1"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetUser}
                disabled={resettingUser || !userIdToReset.trim()}
              >
                <Trash2 className={`h-3 w-3 ${resettingUser ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-red-200 dark:border-red-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-600 dark:text-red-400">
              Zone dangereuse
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleReset}
              disabled={resetting}
              className="w-full"
            >
              <RotateCcw className={`h-3 w-3 mr-1.5 ${resetting ? 'animate-spin' : ''}`} />
              {resetting ? 'Reset en cours...' : 'Reset complet'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
