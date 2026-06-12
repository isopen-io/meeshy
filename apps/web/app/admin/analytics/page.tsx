'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  TrendingUp,
  ArrowLeft,
  BarChart3,
  Users,
  MessageSquare,
  Globe,
  Clock,
  Activity,
  Zap,
  Download
} from 'lucide-react';
import { StatsGrid, TimeSeriesChart, DonutChart, SimpleBarChart, type StatItem } from '@/components/admin/Charts';
import { useI18n } from '@/hooks/use-i18n';

export default function AdminAnalyticsPage() {
  const { t } = useI18n('admin');
  const router = useRouter();
  const [timeRange, setTimeRange] = useState('7d');

  // Mock data pour les statistiques principales
  const stats: StatItem[] = [
    {
      title: t('analytics.stats.dailyMessages'),
      value: 2847,
      description: t('analytics.stats.dailyMessagesDesc'),
      icon: MessageSquare,
      iconColor: 'text-violet-600 dark:text-violet-400',
      iconBgColor: 'bg-violet-100 dark:bg-violet-900/30',
      trend: { value: 15, isPositive: true }
    },
    {
      title: t('analytics.stats.activeUsers'),
      value: 456,
      description: t('analytics.stats.activeUsersDesc'),
      icon: Users,
      iconColor: 'text-blue-600 dark:text-blue-400',
      iconBgColor: 'bg-blue-100 dark:bg-blue-900/30',
      trend: { value: 8, isPositive: true }
    },
    {
      title: t('analytics.stats.autoTranslations'),
      value: 1234,
      description: t('analytics.stats.autoTranslationsDesc'),
      icon: Globe,
      iconColor: 'text-cyan-600 dark:text-cyan-400',
      iconBgColor: 'bg-cyan-100 dark:bg-cyan-900/30',
      trend: { value: 12, isPositive: true }
    },
    {
      title: t('analytics.stats.avgTime'),
      value: '2h 45m',
      description: t('analytics.stats.avgTimeDesc'),
      icon: Clock,
      iconColor: 'text-orange-600 dark:text-orange-400',
      iconBgColor: 'bg-orange-100 dark:bg-orange-900/30',
      trend: { value: 5, isPositive: true }
    },
    {
      title: t('analytics.stats.engagementRate'),
      value: '87%',
      description: t('analytics.stats.engagementRateDesc'),
      icon: Activity,
      iconColor: 'text-green-600 dark:text-green-400',
      iconBgColor: 'bg-green-100 dark:bg-green-900/30',
      trend: { value: 3, isPositive: true }
    },
    {
      title: t('analytics.stats.peakActivity'),
      value: '18h-21h',
      description: t('analytics.stats.peakActivityDesc'),
      icon: Zap,
      iconColor: 'text-yellow-600 dark:text-yellow-400',
      iconBgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
      badge: { text: 'Peak', variant: 'default' }
    },
    {
      title: t('analytics.stats.growth'),
      value: '+23%',
      description: t('analytics.stats.growthDesc'),
      icon: TrendingUp,
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      iconBgColor: 'bg-emerald-100 dark:bg-emerald-900/30',
      trend: { value: 23, isPositive: true }
    },
    {
      title: t('analytics.stats.activeCommunities'),
      value: 42,
      description: t('analytics.stats.activeCommunitiesDesc', { total: 58 }),
      icon: Users,
      iconColor: 'text-indigo-600 dark:text-indigo-400',
      iconBgColor: 'bg-indigo-100 dark:bg-indigo-900/30',
      trend: { value: 7, isPositive: true }
    }
  ];

  // Mock data pour le graphique de volume de messages (7 derniers jours)
  const messageVolumeData = [
    { date: 'Lun 08', messages: 2340, users: 345 },
    { date: 'Mar 09', messages: 2580, users: 389 },
    { date: 'Mer 10', messages: 2190, users: 312 },
    { date: 'Jeu 11', messages: 2950, users: 421 },
    { date: 'Ven 12', messages: 3120, users: 456 },
    { date: 'Sam 13', messages: 2780, users: 398 },
    { date: 'Dim 14', messages: 2420, users: 367 }
  ];

  // Mock data pour l'activité utilisateur par heure
  const hourlyActivityData = [
    { hour: '00h', activity: 120 },
    { hour: '03h', activity: 45 },
    { hour: '06h', activity: 89 },
    { hour: '09h', activity: 245 },
    { hour: '12h', activity: 420 },
    { hour: '15h', activity: 356 },
    { hour: '18h', activity: 612 },
    { hour: '21h', activity: 498 }
  ];

  // Mock data pour les types de messages
  const messageTypesData = [
    { type: t('analytics.messageTypeNames.text'), count: 15420, percentage: 62 },
    { type: t('analytics.messageTypeNames.images'), count: 4890, percentage: 19 },
    { type: t('analytics.messageTypeNames.audio'), count: 2340, percentage: 9 },
    { type: t('analytics.messageTypeNames.videos'), count: 1560, percentage: 6 },
    { type: t('analytics.messageTypeNames.documents'), count: 980, percentage: 4 }
  ];

  // Mock data pour la distribution des utilisateurs
  const userDistributionData = [
    { name: t('analytics.userActivity.veryActive'), value: 156, color: '#10b981' },
    { name: t('analytics.userActivity.active'), value: 234, color: '#3b82f6' },
    { name: t('analytics.userActivity.occasional'), value: 189, color: '#f59e0b' },
    { name: t('analytics.userActivity.inactive'), value: 67, color: '#ef4444' }
  ];

  // Mock data pour la distribution des langues
  const languageDistributionData = [
    { name: 'Français', value: 342, color: '#8b5cf6' },
    { name: 'Anglais', value: 298, color: '#3b82f6' },
    { name: 'Espagnol', value: 156, color: '#10b981' },
    { name: 'Allemand', value: 89, color: '#f59e0b' },
    { name: 'Autres', value: 115, color: '#6b7280' }
  ];

  return (
    <AdminLayout currentPage="/admin/analytics">
      <div className="space-y-6">
        {/* Header avec gradient */}
        <div className="bg-gradient-to-r from-violet-600 to-blue-600 rounded-lg p-6 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                onClick={() => router.push('/admin')}
                className="text-white hover:bg-white/20"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                {t('analytics.back')}
              </Button>
              <div>
                <h1 className="text-2xl font-bold">{t('analytics.title')}</h1>
                <p className="text-violet-100 mt-1">{t('analytics.description')}</p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <Select value={timeRange} onValueChange={setTimeRange}>
                <SelectTrigger className="w-[180px] bg-white/10 border-white/20 text-white">
                  <SelectValue placeholder={t('analytics.period')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24h">{t('analytics.period24h')}</SelectItem>
                  <SelectItem value="7d">{t('analytics.period7d')}</SelectItem>
                  <SelectItem value="30d">{t('analytics.period30d')}</SelectItem>
                  <SelectItem value="90d">{t('analytics.period90d')}</SelectItem>
                  <SelectItem value="1y">{t('analytics.period1y')}</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="ghost" className="text-white hover:bg-white/20">
                <Download className="h-4 w-4 mr-2" />
                {t('analytics.export')}
              </Button>
            </div>
          </div>
        </div>

        {/* Grid de statistiques principales */}
        <StatsGrid stats={stats} />

        {/* Métriques en temps réel */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Activity className="h-5 w-5 text-violet-600" />
              <span>{t('analytics.realtime.title')}</span>
              <Badge variant="outline" className="ml-2 text-green-600 border-green-600">
                <span className="relative flex h-2 w-2 mr-1">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                Live
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="flex items-center space-x-4 p-4 bg-green-50 dark:bg-green-900/10 rounded-lg">
                <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-full">
                  <Users className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{t('analytics.realtime.online')}</p>
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">127</p>
                </div>
              </div>
              <div className="flex items-center space-x-4 p-4 bg-blue-50 dark:bg-blue-900/10 rounded-lg">
                <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-full">
                  <MessageSquare className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{t('analytics.realtime.messagesLastHour')}</p>
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">342</p>
                </div>
              </div>
              <div className="flex items-center space-x-4 p-4 bg-purple-50 dark:bg-purple-900/10 rounded-lg">
                <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-full">
                  <Activity className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{t('analytics.realtime.activeConversations')}</p>
                  <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">89</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Graphiques principaux */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Volume de messages dans le temps */}
          <TimeSeriesChart
            title={t('analytics.volumeChart.title')}
            subtitle={t('analytics.volumeChart.subtitle')}
            data={messageVolumeData}
            dataKeys={[
              { key: 'messages', name: t('analytics.volumeChart.messages'), color: '#8b5cf6' },
              { key: 'users', name: t('analytics.volumeChart.users'), color: '#3b82f6' }
            ]}
            xAxisKey="date"
          />

          {/* Activité par heure */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{t('analytics.hourlyChart.title')}</span>
                <Badge variant="outline">{t('analytics.hourlyChart.today')}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SimpleBarChart
                data={hourlyActivityData}
                xAxisKey="hour"
                dataKey="activity"
                color="#10b981"
                height={300}
              />
            </CardContent>
          </Card>
        </div>

        {/* Types de messages */}
        <Card>
          <CardHeader>
            <CardTitle>{t('analytics.messageTypes.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {messageTypesData.map((item, index) => (
                <div key={index} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {item.type}
                    </span>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {item.count.toLocaleString()}
                      </span>
                      <span className="text-sm font-semibold text-violet-600 dark:text-violet-400">
                        {item.percentage}%
                      </span>
                    </div>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-violet-600 to-blue-600 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${item.percentage}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Distribution utilisateurs et langues */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <DonutChart
            title={t('analytics.userDist.title')}
            subtitle={t('analytics.userDist.subtitle')}
            data={userDistributionData}
          />

          <DonutChart
            title={t('analytics.langDist.title')}
            subtitle={t('analytics.langDist.subtitle')}
            data={languageDistributionData}
          />
        </div>

        {/* Insights et recommandations */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <TrendingUp className="h-5 w-5 text-violet-600" />
              <span>{t('analytics.insights.title')}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-green-50 dark:bg-green-900/10 rounded-lg border border-green-200 dark:border-green-900/30">
                <div className="flex items-start space-x-3">
                  <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                    <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-green-900 dark:text-green-100 mb-1">
                      {t('analytics.insights.positive.title')}
                    </h4>
                    <p className="text-sm text-green-700 dark:text-green-300">
                      {t('analytics.insights.positive.description')}
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-blue-50 dark:bg-blue-900/10 rounded-lg border border-blue-200 dark:border-blue-900/30">
                <div className="flex items-start space-x-3">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                    <Globe className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-1">
                      {t('analytics.insights.translation.title')}
                    </h4>
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                      {t('analytics.insights.translation.description')}
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-orange-50 dark:bg-orange-900/10 rounded-lg border border-orange-200 dark:border-orange-900/30">
                <div className="flex items-start space-x-3">
                  <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                    <Clock className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-orange-900 dark:text-orange-100 mb-1">
                      {t('analytics.insights.session.title')}
                    </h4>
                    <p className="text-sm text-orange-700 dark:text-orange-300">
                      {t('analytics.insights.session.description')}
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-purple-50 dark:bg-purple-900/10 rounded-lg border border-purple-200 dark:border-purple-900/30">
                <div className="flex items-start space-x-3">
                  <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                    <BarChart3 className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-purple-900 dark:text-purple-100 mb-1">
                      {t('analytics.insights.diversity.title')}
                    </h4>
                    <p className="text-sm text-purple-700 dark:text-purple-300">
                      {t('analytics.insights.diversity.description')}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Performance du système */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Zap className="h-5 w-5 text-yellow-600" />
              <span>{t('analytics.performance.title')}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600 dark:text-green-400 mb-1">
                  99.8%
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('analytics.performance.availability')}</p>
                <Badge variant="outline" className="mt-2 text-green-600">{t('analytics.performance.excellent')}</Badge>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600 dark:text-blue-400 mb-1">
                  45ms
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('analytics.performance.latency')}</p>
                <Badge variant="outline" className="mt-2 text-blue-600">{t('analytics.performance.fast')}</Badge>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-purple-600 dark:text-purple-400 mb-1">
                  2.3TB
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('analytics.performance.storage')}</p>
                <Badge variant="outline" className="mt-2 text-purple-600">{t('analytics.performance.normal')}</Badge>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-orange-600 dark:text-orange-400 mb-1">
                  12K/s
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('analytics.performance.throughput')}</p>
                <Badge variant="outline" className="mt-2 text-orange-600">{t('analytics.performance.stable')}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
