import { useMemo } from 'react';
import type { DashboardData } from '@/services/dashboard.service';

export function useDashboardStats(dashboardData: DashboardData | null) {
  const stats = useMemo(
    () =>
      dashboardData?.stats || {
        totalConversations: 0,
        totalCommunities: 0,
        totalMessages: 0,
        activeConversations: 0,
        translationsToday: 0,
        totalLinks: 0,
        lastUpdated: new Date(),
      },
    [dashboardData?.stats]
  );

  const recentConversations = useMemo(
    () => dashboardData?.recentConversations || [],
    [dashboardData?.recentConversations]
  );

  const recentCommunities = useMemo(
    () => dashboardData?.recentCommunities || [],
    [dashboardData?.recentCommunities]
  );

  return {
    stats,
    recentConversations,
    recentCommunities,
  };
}
