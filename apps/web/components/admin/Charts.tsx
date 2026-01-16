'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';

// Re-export types from implementation
export type {
  TimeSeriesDataPoint,
  DataKeyConfig,
  TimeSeriesChartProps,
  DonutDataPoint,
  DonutChartProps
} from './ChartsImpl';

// ======================
// Loading Skeleton for Charts
// ======================

function ChartSkeleton({ height = 300 }: { height?: number }) {
  return (
    <Card>
      <CardHeader>
        <div className="h-5 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        <div className="h-4 w-48 bg-gray-100 dark:bg-gray-800 rounded animate-pulse mt-2" />
      </CardHeader>
      <CardContent>
        <div
          className="w-full bg-gray-100 dark:bg-gray-800 rounded animate-pulse"
          style={{ height }}
        />
      </CardContent>
    </Card>
  );
}

// ======================
// Dynamic Imports for Heavy Chart Components (~300KB saved)
// ======================

export const TimeSeriesChart = dynamic(
  () => import('./ChartsImpl').then((mod) => mod.TimeSeriesChart),
  {
    ssr: false,
    loading: () => <ChartSkeleton height={300} />
  }
);

export const DonutChart = dynamic(
  () => import('./ChartsImpl').then((mod) => mod.DonutChart),
  {
    ssr: false,
    loading: () => <ChartSkeleton height={300} />
  }
);

// ======================
// StatsGrid Components (lightweight, no dynamic import needed)
// ======================

export interface StatItem {
  title: string;
  value: string | number;
  description?: string;
  icon: LucideIcon;
  iconColor: string;
  iconBgColor: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  badge?: {
    text: string;
    variant?: 'default' | 'secondary' | 'destructive' | 'outline';
  };
}

interface StatCardProps {
  stat: StatItem;
}

export function StatCard({ stat }: StatCardProps) {
  const Icon = stat.icon;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
          {stat.title}
        </CardTitle>
        <div className={`p-2 rounded-lg ${stat.iconBgColor}`}>
          <Icon className={`h-4 w-4 ${stat.iconColor}`} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {stat.value}
          </span>
          {stat.badge && (
            <Badge variant={stat.badge.variant || 'default'} className="text-xs">
              {stat.badge.text}
            </Badge>
          )}
        </div>
        {stat.description && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {stat.description}
          </p>
        )}
        {stat.trend && (
          <div className="flex items-center mt-2">
            {stat.trend.isPositive ? (
              <TrendingUp className="h-3 w-3 text-green-600 dark:text-green-400 mr-1" />
            ) : (
              <TrendingDown className="h-3 w-3 text-red-600 dark:text-red-400 mr-1" />
            )}
            <Badge
              variant="outline"
              className={`text-xs ${
                stat.trend.isPositive
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-red-600 dark:text-red-400'
              }`}
            >
              {stat.trend.isPositive ? '+' : ''}
              {stat.trend.value}%
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface StatsGridProps {
  stats: StatItem[];
  columns?: 2 | 3 | 4;
}

export function StatsGrid({ stats, columns = 4 }: StatsGridProps) {
  const gridColsClass = {
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-2 lg:grid-cols-4'
  };

  return (
    <div className={`grid ${gridColsClass[columns]} gap-4`}>
      {stats.map((stat, index) => (
        <StatCard key={index} stat={stat} />
      ))}
    </div>
  );
}

// Export all components
export default {
  StatsGrid,
  StatCard,
  TimeSeriesChart,
  DonutChart
};
