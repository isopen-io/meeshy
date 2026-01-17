import { MessageSquare, Users, Activity, TrendingUp, Globe2, Link2 } from 'lucide-react';
import { StatsWidget } from './StatsWidget';

interface Stats {
  totalConversations: number;
  totalCommunities: number;
  totalMessages: number;
  activeConversations: number;
  translationsToday: number;
  totalLinks: number;
}

interface DashboardStatsProps {
  stats: Stats;
  t: (key: string) => string;
}

export function DashboardStats({ stats, t }: DashboardStatsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6 mb-8">
      <StatsWidget
        title={t('stats.conversations')}
        value={stats.totalConversations}
        subtitle={t('stats.total')}
        icon={MessageSquare}
        gradient="bg-gradient-to-r from-blue-500 to-blue-600 dark:from-blue-600 dark:to-blue-700"
      />

      <StatsWidget
        title={t('stats.communities')}
        value={stats.totalCommunities}
        subtitle={t('stats.active')}
        icon={Users}
        gradient="bg-gradient-to-r from-green-500 to-green-600 dark:from-green-600 dark:to-green-700"
      />

      <StatsWidget
        title={t('stats.messages')}
        value={stats.totalMessages}
        subtitle={t('stats.thisWeek')}
        icon={Activity}
        gradient="bg-gradient-to-r from-purple-500 to-purple-600 dark:from-purple-600 dark:to-purple-700"
      />

      <StatsWidget
        title={t('stats.activeConversationsTitle')}
        value={stats.activeConversations}
        subtitle={t('stats.inProgress')}
        icon={TrendingUp}
        gradient="bg-gradient-to-r from-orange-500 to-orange-600 dark:from-orange-600 dark:to-orange-700"
      />

      <StatsWidget
        title={t('stats.translations')}
        value={stats.translationsToday}
        subtitle={t('stats.today')}
        icon={Globe2}
        gradient="bg-gradient-to-r from-indigo-500 to-indigo-600 dark:from-indigo-600 dark:to-indigo-700"
      />

      <StatsWidget
        title={t('stats.links')}
        value={stats.totalLinks}
        subtitle={t('stats.created')}
        icon={Link2}
        gradient="bg-gradient-to-r from-pink-500 to-pink-600 dark:from-pink-600 dark:to-pink-700"
      />
    </div>
  );
}
