'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import AdminLayout from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatsGrid, type StatItem, type TimeSeriesDataPoint } from '@/components/admin/Charts';
import {
  Activity,
  RefreshCw,
  Users,
  MessageSquare,
  Radio,
  Wifi,
  Database,
  Server,
  HardDrive,
  Heart,
  AlertTriangle,
  CheckCircle,
  XCircle,
  TrendingUp,
  BarChart3,
  Zap
} from 'lucide-react';
import { monitoringService } from '@/services/monitoring.service';
import { toast } from 'sonner';

const TimeSeriesChart = dynamic(
  () => import('@/components/admin/ChartsImpl').then(mod => mod.TimeSeriesChart),
  { ssr: false, loading: () => <ChartSkeleton /> }
);

const DonutChart = dynamic(
  () => import('@/components/admin/ChartsImpl').then(mod => mod.DonutChart),
  { ssr: false, loading: () => <ChartSkeleton /> }
);

function ChartSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="h-5 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
      </CardHeader>
      <CardContent>
        <div className="w-full h-[300px] bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
      </CardContent>
    </Card>
  );
}

function CardSkeleton() {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="space-y-3">
          <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          <div className="h-8 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          <div className="h-3 w-32 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 1: TEMPS REEL
// ═══════════════════════════════════════════════════════════════════════════

function RealtimeTab() {
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [realtimeData, setRealtimeData] = useState<Record<string, unknown> | null>(null);
  const [metricsData, setMetricsData] = useState<Record<string, unknown> | null>(null);
  const [hourlyData, setHourlyData] = useState<TimeSeriesDataPoint[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [realtimeRes, metricsRes, hourlyRes] = await Promise.allSettled([
        monitoringService.getRealtime(),
        monitoringService.getMetrics(),
        monitoringService.getHourlyActivity(),
      ]);

      if (realtimeRes.status === 'fulfilled' && realtimeRes.value?.data) {
        setRealtimeData(realtimeRes.value.data as Record<string, unknown>);
      }
      if (metricsRes.status === 'fulfilled' && metricsRes.value?.data) {
        setMetricsData(metricsRes.value.data as Record<string, unknown>);
      }
      if (hourlyRes.status === 'fulfilled' && hourlyRes.value?.data) {
        const raw = hourlyRes.value.data;
        setHourlyData(Array.isArray(raw) ? raw as TimeSeriesDataPoint[] : []);
      }
    } catch {
      toast.error('Erreur lors du chargement des donnees temps reel');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(fetchData, 30000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [autoRefresh, fetchData]);

  const onlineUsers = (realtimeData as Record<string, unknown>)?.onlineUsers as number ?? 0;
  const messagesLastHour = (realtimeData as Record<string, unknown>)?.messagesLastHour as number ?? 0;
  const activeConversations = (realtimeData as Record<string, unknown>)?.activeConversations as number ?? 0;
  const socketConnections = (metricsData as Record<string, unknown>)?.socketConnections as number ??
    (metricsData as Record<string, unknown>)?.connections as number ?? 0;

  const stats: StatItem[] = [
    {
      title: 'Users en ligne',
      value: onlineUsers,
      description: 'Connectes maintenant',
      icon: Users,
      iconColor: 'text-green-600 dark:text-green-400',
      iconBgColor: 'bg-green-100 dark:bg-green-900/30',
      badge: { text: 'Live', variant: 'default' }
    },
    {
      title: 'Messages derniere heure',
      value: messagesLastHour,
      description: '60 dernieres minutes',
      icon: MessageSquare,
      iconColor: 'text-cyan-600 dark:text-cyan-400',
      iconBgColor: 'bg-cyan-100 dark:bg-cyan-900/30',
    },
    {
      title: 'Conversations actives',
      value: activeConversations,
      description: 'Avec activite recente',
      icon: Radio,
      iconColor: 'text-slate-600 dark:text-slate-400',
      iconBgColor: 'bg-slate-100 dark:bg-slate-900/30',
    },
    {
      title: 'Connexions Socket.IO',
      value: socketConnections,
      description: 'Connexions WebSocket',
      icon: Wifi,
      iconColor: 'text-blue-600 dark:text-blue-400',
      iconBgColor: 'bg-blue-100 dark:bg-blue-900/30',
    },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
        <ChartSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-green-600 border-green-600">
            <span className="relative flex h-2 w-2 mr-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
            Live
          </Badge>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant={autoRefresh ? 'default' : 'outline'}
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={autoRefresh ? 'bg-cyan-600 hover:bg-cyan-700' : ''}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${autoRefresh ? 'animate-spin' : ''}`} />
            Auto-refresh {autoRefresh ? 'ON' : 'OFF'}
          </Button>
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Actualiser
          </Button>
        </div>
      </div>

      <StatsGrid stats={stats} columns={4} />

      {hourlyData.length > 0 && (
        <TimeSeriesChart
          title="Activite par heure"
          subtitle="Volume de messages sur les dernieres 24h"
          data={hourlyData}
          dataKey="activity"
          xAxisKey="hour"
          color="#0891b2"
          showArea
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 2: SANTE
// ═══════════════════════════════════════════════════════════════════════════

function HealthTab() {
  const [loading, setLoading] = useState(true);
  const [healthData, setHealthData] = useState<Record<string, unknown> | null>(null);
  const [circuitBreakers, setCircuitBreakers] = useState<Array<Record<string, unknown>>>([]);

  const fetchData = useCallback(async () => {
    try {
      const [healthRes, cbRes] = await Promise.allSettled([
        monitoringService.getHealth(),
        monitoringService.getCircuitBreakers(),
      ]);

      if (healthRes.status === 'fulfilled' && healthRes.value?.data) {
        setHealthData(healthRes.value.data as Record<string, unknown>);
      }
      if (cbRes.status === 'fulfilled' && cbRes.value?.data) {
        const raw = cbRes.value.data;
        setCircuitBreakers(Array.isArray(raw) ? raw as Array<Record<string, unknown>> : []);
      }
    } catch {
      toast.error('Erreur lors du chargement des donnees de sante');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const dbLatency = (healthData as Record<string, unknown>)?.dbLatencyMs as number ??
    ((healthData as Record<string, unknown>)?.database as Record<string, unknown>)?.latencyMs as number ?? 0;
  const redisStatus = (healthData as Record<string, unknown>)?.redisStatus as string ??
    ((healthData as Record<string, unknown>)?.redis as Record<string, unknown>)?.status as string ?? 'UNKNOWN';
  const memoryUsage = (healthData as Record<string, unknown>)?.memoryUsage as Record<string, unknown> ??
    (healthData as Record<string, unknown>)?.memory as Record<string, unknown> ?? {};
  const heapUsed = (memoryUsage as Record<string, unknown>)?.heapUsed as number ?? 0;
  const heapTotal = (memoryUsage as Record<string, unknown>)?.heapTotal as number ?? 1;
  const heapPercent = heapTotal > 0 ? Math.round((heapUsed / heapTotal) * 100) : 0;

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const getLatencyColor = (ms: number) => {
    if (ms < 100) return 'text-green-600 dark:text-green-400';
    if (ms < 500) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getLatencyBadge = (ms: number) => {
    if (ms < 100) return { text: 'Excellent', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' };
    if (ms < 500) return { text: 'Acceptable', className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' };
    return { text: 'Lent', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' };
  };

  const getCbStateBadge = (state: string) => {
    const s = (state ?? '').toLowerCase();
    if (s === 'closed') return { text: 'Closed', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' };
    if (s === 'open') return { text: 'Open', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' };
    if (s === 'half-open' || s === 'half_open') return { text: 'Half-Open', className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' };
    return { text: state, className: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400' };
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
        <CardSkeleton />
      </div>
    );
  }

  const latencyBadge = getLatencyBadge(dbLatency);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <Button variant="outline" size="sm" onClick={fetchData}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Actualiser
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Database */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Database
            </CardTitle>
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <Database className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getLatencyColor(dbLatency)}`}>
              {dbLatency}ms
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Latence</p>
            <Badge className={`mt-2 text-xs ${latencyBadge.className}`}>
              {latencyBadge.text}
            </Badge>
          </CardContent>
        </Card>

        {/* Redis */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Redis
            </CardTitle>
            <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30">
              <Server className="h-4 w-4 text-red-600 dark:text-red-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              {redisStatus === 'OK' || redisStatus === 'connected' ? (
                <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
              ) : (
                <XCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
              )}
              <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {redisStatus}
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Ping status</p>
            <Badge
              className={`mt-2 text-xs ${
                redisStatus === 'OK' || redisStatus === 'connected'
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
              }`}
            >
              {redisStatus === 'OK' || redisStatus === 'connected' ? 'Operationnel' : 'Erreur'}
            </Badge>
          </CardContent>
        </Card>

        {/* Memory */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Memory
            </CardTitle>
            <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
              <HardDrive className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {heapPercent}%
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {formatBytes(heapUsed)} / {formatBytes(heapTotal)}
            </p>
            <Progress value={heapPercent} className="mt-3 h-2" />
          </CardContent>
        </Card>
      </div>

      {/* Circuit Breakers */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-cyan-600" />
            Circuit Breakers
          </CardTitle>
        </CardHeader>
        <CardContent>
          {circuitBreakers.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <Heart className="h-8 w-8 mx-auto mb-2 text-green-500" />
              <p>Tous les circuits sont operationnels</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-3 px-4 font-medium text-gray-600 dark:text-gray-400">Service</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600 dark:text-gray-400">State</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600 dark:text-gray-400">Failures</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600 dark:text-gray-400">Last Failure</th>
                  </tr>
                </thead>
                <tbody>
                  {circuitBreakers.map((cb, idx) => {
                    const state = (cb.state as string) ?? 'unknown';
                    const badge = getCbStateBadge(state);
                    const lastFailure = cb.lastFailure as string | null;
                    return (
                      <tr key={idx} className="border-b border-gray-100 dark:border-gray-800">
                        <td className="py-3 px-4 font-medium text-gray-900 dark:text-gray-100">
                          {cb.name as string ?? cb.service as string ?? `Service ${idx + 1}`}
                        </td>
                        <td className="py-3 px-4">
                          <Badge className={`text-xs ${badge.className}`}>
                            {badge.text}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-gray-700 dark:text-gray-300">
                          {cb.failures as number ?? cb.failureCount as number ?? 0}
                        </td>
                        <td className="py-3 px-4 text-gray-500 dark:text-gray-400">
                          {lastFailure
                            ? new Date(lastFailure).toLocaleString('fr-FR')
                            : '-'
                          }
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 3: METRIQUES
// ═══════════════════════════════════════════════════════════════════════════

function MetricsTab() {
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('7d');
  const [kpis, setKpis] = useState<Record<string, unknown> | null>(null);
  const [volumeData, setVolumeData] = useState<TimeSeriesDataPoint[]>([]);
  const [languageData, setLanguageData] = useState<Array<{ name: string; value: number; color: string }>>([]);
  const [userDistData, setUserDistData] = useState<Array<{ name: string; value: number; color: string }>>([]);
  const [messageTypes, setMessageTypes] = useState<Array<Record<string, unknown>>>([]);

  const fetchData = useCallback(async (p: '7d' | '30d' | '90d') => {
    setLoading(true);
    try {
      const [kpiRes, volumeRes, langRes, userRes, msgRes] = await Promise.allSettled([
        monitoringService.getKpis(p),
        monitoringService.getVolumeTimeline(),
        monitoringService.getLanguageDistribution(),
        monitoringService.getUserDistribution(),
        monitoringService.getMessageTypes(p === '90d' ? '30d' : p === '30d' ? '30d' : '7d'),
      ]);

      if (kpiRes.status === 'fulfilled' && kpiRes.value?.data) {
        setKpis(kpiRes.value.data as Record<string, unknown>);
      }
      if (volumeRes.status === 'fulfilled' && volumeRes.value?.data) {
        const raw = volumeRes.value.data;
        setVolumeData(Array.isArray(raw) ? raw as TimeSeriesDataPoint[] : []);
      }
      if (langRes.status === 'fulfilled' && langRes.value?.data) {
        const raw = langRes.value.data;
        const COLORS = ['#0891b2', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#6b7280'];
        if (Array.isArray(raw)) {
          setLanguageData(raw.map((item: unknown, i: number) => {
            const entry = item as Record<string, unknown>;
            return {
              name: (entry.language as string) ?? (entry.name as string) ?? `Lang ${i + 1}`,
              value: (entry.count as number) ?? (entry.value as number) ?? 0,
              color: (entry.color as string) ?? COLORS[i % COLORS.length],
            };
          }));
        }
      }
      if (userRes.status === 'fulfilled' && userRes.value?.data) {
        const raw = userRes.value.data;
        const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'];
        if (Array.isArray(raw)) {
          setUserDistData(raw.map((item: unknown, i: number) => {
            const entry = item as Record<string, unknown>;
            return {
              name: (entry.bucket as string) ?? (entry.name as string) ?? `Bucket ${i + 1}`,
              value: (entry.count as number) ?? (entry.value as number) ?? 0,
              color: (entry.color as string) ?? COLORS[i % COLORS.length],
            };
          }));
        }
      }
      if (msgRes.status === 'fulfilled' && msgRes.value?.data) {
        const raw = msgRes.value.data;
        setMessageTypes(Array.isArray(raw) ? raw as Array<Record<string, unknown>> : []);
      }
    } catch {
      toast.error('Erreur lors du chargement des metriques');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(period);
  }, [period, fetchData]);

  const engagementRate = (kpis as Record<string, unknown>)?.engagementRate as number ?? 0;
  const growthRate = (kpis as Record<string, unknown>)?.growthRate as number ?? 0;
  const messagesPerUser = (kpis as Record<string, unknown>)?.messagesPerUser as number ?? 0;
  const activeUserRate = (kpis as Record<string, unknown>)?.activeUserRate as number ?? 0;

  const kpiStats: StatItem[] = [
    {
      title: 'Taux d\'engagement',
      value: `${engagementRate.toFixed(1)}%`,
      description: 'Messages lus / envoyes',
      icon: TrendingUp,
      iconColor: 'text-cyan-600 dark:text-cyan-400',
      iconBgColor: 'bg-cyan-100 dark:bg-cyan-900/30',
    },
    {
      title: 'Croissance',
      value: `${growthRate >= 0 ? '+' : ''}${growthRate.toFixed(1)}%`,
      description: 'Nouveaux utilisateurs',
      icon: Zap,
      iconColor: 'text-green-600 dark:text-green-400',
      iconBgColor: 'bg-green-100 dark:bg-green-900/30',
      trend: { value: Math.abs(growthRate), isPositive: growthRate >= 0 }
    },
    {
      title: 'Messages/utilisateur',
      value: messagesPerUser.toFixed(1),
      description: 'Moyenne par utilisateur actif',
      icon: MessageSquare,
      iconColor: 'text-blue-600 dark:text-blue-400',
      iconBgColor: 'bg-blue-100 dark:bg-blue-900/30',
    },
    {
      title: 'Taux utilisateurs actifs',
      value: `${activeUserRate.toFixed(1)}%`,
      description: 'Utilisateurs avec activite',
      icon: Users,
      iconColor: 'text-slate-600 dark:text-slate-400',
      iconBgColor: 'bg-slate-100 dark:bg-slate-900/30',
    },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
        <ChartSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          KPIs et tendances sur la periode selectionnee
        </p>
        <Select value={period} onValueChange={(v) => setPeriod(v as '7d' | '30d' | '90d')}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Periode" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">7 jours</SelectItem>
            <SelectItem value="30d">30 jours</SelectItem>
            <SelectItem value="90d">90 jours</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <StatsGrid stats={kpiStats} columns={4} />

      {volumeData.length > 0 && (
        <TimeSeriesChart
          title="Volume dans le temps"
          subtitle="Messages et auteurs uniques"
          data={volumeData}
          dataKeys={[
            { key: 'messages', name: 'Messages', color: '#0891b2' },
            { key: 'uniqueAuthors', name: 'Auteurs uniques', color: '#64748b' }
          ]}
          xAxisKey="date"
          showArea={false}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {languageData.length > 0 && (
          <DonutChart
            title="Distribution des langues"
            subtitle="Langues les plus utilisees"
            data={languageData}
          />
        )}

        {userDistData.length > 0 && (
          <DonutChart
            title="Distribution des utilisateurs"
            subtitle="Par niveau d'activite"
            data={userDistData}
          />
        )}
      </div>

      {messageTypes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-cyan-600" />
              Types de messages
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {messageTypes.map((item, index) => {
                const type = (item.type as string) ?? (item.name as string) ?? `Type ${index + 1}`;
                const count = (item.count as number) ?? (item.value as number) ?? 0;
                const percentage = (item.percentage as number) ?? 0;
                return (
                  <div key={index} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {type}
                      </span>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {count.toLocaleString()}
                        </span>
                        <span className="text-sm font-semibold text-cyan-600 dark:text-cyan-400">
                          {percentage}%
                        </span>
                      </div>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className="bg-gradient-to-r from-cyan-600 to-slate-600 h-2 rounded-full transition-all duration-500"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

const tabConfig = [
  { id: 'realtime', label: 'Temps reel', icon: Activity },
  { id: 'health', label: 'Sante', icon: Heart },
  { id: 'metrics', label: 'Metriques', icon: BarChart3 },
] as const;

export default function MonitoringPage() {
  const [activeTab, setActiveTab] = useState('realtime');

  return (
    <AdminLayout currentPage="/admin/monitoring">
      <div className="space-y-6">
        {/* Header avec gradient */}
        <div className="bg-gradient-to-r from-cyan-600 to-slate-600 rounded-lg p-6 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Monitoring</h1>
              <p className="text-cyan-100 mt-1">Supervision en temps reel de la plateforme</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 gap-2">
            {tabConfig.map(tab => {
              const Icon = tab.icon;
              return (
                <TabsTrigger key={tab.id} value={tab.id}>
                  <Icon className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>

          <TabsContent value="realtime" className="mt-6">
            <RealtimeTab />
          </TabsContent>

          <TabsContent value="health" className="mt-6">
            <HealthTab />
          </TabsContent>

          <TabsContent value="metrics" className="mt-6">
            <MetricsTab />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
