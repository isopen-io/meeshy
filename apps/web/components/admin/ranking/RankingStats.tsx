'use client';

import dynamic from 'next/dynamic';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import type { RankingStatsProps } from './RankingStatsImpl';

export type { RankingStatsProps } from './RankingStatsImpl';

function RankingStatsSkeleton() {
  return (
    <>
      {[400, 350].map(height => (
        <Card key={height} className="border-yellow-200 dark:border-yellow-800">
          <CardHeader>
            <div className="h-5 w-64 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          </CardHeader>
          <CardContent className="pt-6">
            <div
              className="w-full bg-gray-100 dark:bg-gray-800 rounded animate-pulse"
              style={{ height }}
            />
          </CardContent>
        </Card>
      ))}
    </>
  );
}

const RankingStatsCharts = dynamic(
  () => import('./RankingStatsImpl').then(mod => mod.RankingStats),
  {
    ssr: false,
    loading: () => <RankingStatsSkeleton />
  }
);

export function RankingStats(props: RankingStatsProps) {
  if (props.criterion === 'recent_activity' || props.rankings.length === 0) {
    return null;
  }
  return <RankingStatsCharts {...props} />;
}
