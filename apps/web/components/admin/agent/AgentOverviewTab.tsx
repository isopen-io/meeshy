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
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from 'recharts';

import { toast } from 'sonner';
import { useResolvedTheme } from '@/hooks/use-resolved-theme';
import { useI18n } from '@/hooks/useI18n';
import { formatAgentTimeAgo } from '@/utils/agent-time-format';

function getTypeLabel(type: string, t: (key: string) => string): string {
  const mapped: Record<string, string> = {
    direct: t('agent.overview.conversationType.direct'),
    group: t('agent.overview.conversationType.group'),
    public: t('agent.overview.conversationType.public'),
    global: t('agent.overview.conversationType.global'),
    broadcast: t('agent.overview.conversationType.broadcast'),
    channel: t('agent.overview.conversationType.channel'),
  };
  return mapped[type] ?? type;
}

export function AgentOverviewTab() {
  const { t } = useI18n('admin');
  const isDark = useResolvedTheme() === 'dark';
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
        setError(t('agent.toasts.statsLoadError'));
      }
    } catch {
      setError(t('agent.toasts.connectionError'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleReset = useCallback(async () => {
    if (!confirm(t('agent.toasts.confirmResetAll'))) {
      return;
    }
    try {
      setResetting(true);
      const response = await agentAdminService.resetAll();
      if (response.success && response.data) {
        const counts = response.data.deleted;
        toast.success(t('agent.toasts.resetSuccess').replace('{{configs}}', String(counts.configs ?? 0)).replace('{{roles}}', String(counts.roles ?? 0)).replace('{{analytics}}', String(counts.analytics ?? 0)).replace('{{redisKeys}}', String(counts.redisKeys ?? 0)));
        fetchStats();
      } else {
        toast.error(t('agent.toasts.resetError'));
      }
    } catch {
      toast.error(t('agent.toasts.resetAiConfigError'));
    } finally {
      setResetting(false);
    }
  }, [fetchStats]);

  const handleResetConversation = useCallback(async () => {
    const id = conversationIdToReset.trim();
    if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
      toast.error(t('agent.toasts.invalidConversationId'));
      return;
    }
    if (!confirm(t('agent.toasts.confirmResetConversation').replace('{{id}}', id))) return;
    try {
      setResettingConversation(true);
      const response = await agentAdminService.resetConversation(id);
      if (response.success) {
        toast.success(t('agent.toasts.conversationReset').replace('{{id}}', id.slice(0, 8) + '...'));
        setConversationIdToReset('');
        fetchStats();
      }
    } catch {
      toast.error(t('agent.toasts.conversationResetError'));
    } finally {
      setResettingConversation(false);
    }
  }, [conversationIdToReset, fetchStats]);

  const handleResetUser = useCallback(async () => {
    const id = userIdToReset.trim();
    if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
      toast.error(t('agent.toasts.invalidUserId'));
      return;
    }
    if (!confirm(t('agent.toasts.confirmResetUser').replace('{{id}}', id))) return;
    try {
      setResettingUser(true);
      const response = await agentAdminService.resetUser(id);
      if (response.success) {
        toast.success(t('agent.toasts.userReset').replace('{{id}}', id.slice(0, 8) + '...'));
        setUserIdToReset('');
        fetchStats();
      }
    } catch {
      toast.error(t('agent.toasts.userResetError'));
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

  // istanbul ignore next -- stats is always non-null when this code runs (loading/error guards above ensure it)
  const kpis = [
    {
      title: t('agent.overview.kpi.conversations'),
      value: stats?.totalConfigs ?? 0,
      icon: MessageSquare,
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-50 dark:bg-blue-950',
    },
    {
      title: t('agent.overview.kpi.active'),
      value: stats?.activeConfigs ?? 0,
      icon: Zap,
      color: 'text-green-600 dark:text-green-400',
      bg: 'bg-green-50 dark:bg-green-950',
      badge: stats && stats.activeConfigs > 0 ? 'On' : 'Off',
      badgeVariant: stats && stats.activeConfigs > 0 ? 'default' : 'secondary',
    },
    {
      title: t('agent.overview.kpi.users'),
      value: stats?.totalControlledUsers ?? 0,
      icon: UserCheck,
      color: 'text-cyan-600 dark:text-cyan-400',
      bg: 'bg-cyan-50 dark:bg-cyan-950',
    },
    {
      title: t('agent.overview.kpi.roles'),
      value: stats?.totalRoles ?? 0,
      icon: Users,
      color: 'text-purple-600 dark:text-purple-400',
      bg: 'bg-purple-50 dark:bg-purple-950',
    },
    {
      title: t('agent.overview.kpi.messages'),
      value: stats?.totalMessagesSent ?? 0,
      icon: BarChart3,
      color: 'text-indigo-600 dark:text-indigo-400',
      bg: 'bg-indigo-50 dark:bg-indigo-950',
    },
    {
      title: t('agent.overview.kpi.words'),
      value: stats?.totalWordsSent ?? 0,
      icon: Type,
      color: 'text-pink-600 dark:text-pink-400',
      bg: 'bg-pink-50 dark:bg-pink-950',
    },
    {
      title: t('agent.overview.kpi.avgConfidence'),
      value: `${((stats?.avgConfidence ?? 0) * 100).toFixed(0)}%`,
      icon: TrendingUp,
      color: 'text-amber-600 dark:text-amber-400',
      bg: 'bg-amber-50 dark:bg-amber-950',
    },
    {
      title: t('agent.overview.kpi.archetypes'),
      value: stats?.totalArchetypes ?? 0,
      icon: Shapes,
      color: 'text-orange-600 dark:text-orange-400',
      bg: 'bg-orange-50 dark:bg-orange-950',
    },
  ];

  /* istanbul ignore next -- stats is always non-null when this code runs */
  const pieData = [
    { name: t('agent.overview.kpi.active'), value: stats?.activeConfigs ?? 0, color: isDark ? '#34d399' : '#10b981' },
    { name: t('agent.overview.kpi.inactive'), value: (stats?.totalConfigs ?? 0) - (stats?.activeConfigs ?? 0), color: isDark ? '#475569' : '#94a3b8' },
  ];

  /* istanbul ignore next -- stats is always non-null when this code runs */
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
            <CardTitle className="text-sm font-medium">{t('agent.overview.distribution')}</CardTitle>
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
              {t('agent.overview.recentActivity')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentActivity.length === 0 ? (
              <p className="text-sm text-gray-400 italic py-4 text-center">{t('agent.overview.noRecentActivity')}</p>
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
                            {getTypeLabel(entry.conversation.type, t)}
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
                        {formatAgentTimeAgo(entry.lastResponseAt, t)}
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
              {t('agent.overview.resetConversation')}
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
              {t('agent.overview.resetUser')}
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
              {t('agent.overview.dangerZone')}
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
              {resetting ? t('agent.overview.resetting') : t('agent.overview.resetAll')}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
